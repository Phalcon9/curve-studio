import { describe, expect, test } from 'vitest'
import { Keypair, PublicKey, SystemProgram, Transaction, TransactionMessage, VersionedTransaction } from '@solana/web3.js'
import {
    encodeListingMemo,
    LISTING_LIMITS,
    MAX_LISTING_MEMO_BYTES,
    listingCandidates,
    listingInstructions,
    MEMO_PROGRAM_ID,
    parseListingMemo,
    REGISTRY_ADDRESS,
    registryTxFromMessage,
    resolveListings,
    type ListingMeta,
    type RegistryTx,
} from '../src'

const config = Keypair.generate().publicKey.toBase58()
const author = Keypair.generate().publicKey.toBase58()
const meta: ListingMeta = { config, name: 'Classic', tagline: 'A familiar curve', category: 'meme', preset: 'classic-meme' }

const registryTx = (over: Partial<RegistryTx> & { memo?: string }): RegistryTx => ({
    signature: 'sig',
    slot: 100,
    blockTime: null,
    signers: [author],
    memos: [over.memo ?? encodeListingMemo(meta)],
    ...over,
})

describe('listing memo', () => {
    test('round-trips', () => {
        expect(parseListingMemo(encodeListingMemo(meta))).toEqual(meta)
    })

    test('truncates long fields and strips control characters', () => {
        const parsed = parseListingMemo(encodeListingMemo({ ...meta, name: 'x'.repeat(100), tagline: 'a\nb' }))
        expect(parsed?.name).toHaveLength(LISTING_LIMITS.name)
        expect(parsed?.tagline).toBe('a b')
    })

    test('rejects memos that are not listings', () => {
        const ok = JSON.parse(encodeListingMemo(meta))
        for (const bad of [
            'gm',
            '[]',
            JSON.stringify({ ...ok, app: 'other' }),
            JSON.stringify({ ...ok, v: 2 }),
            JSON.stringify({ ...ok, config: 'not-a-key' }),
            JSON.stringify({ ...ok, category: 'casino' }),
            JSON.stringify({ ...ok, name: '   ' }),
        ]) {
            expect(parseListingMemo(bad)).toBeNull()
        }
    })

    test('refuses to encode an invalid listing', () => {
        expect(() => encodeListingMemo({ ...meta, config: 'nope' })).toThrow()
        expect(() => encodeListingMemo({ ...meta, name: '' })).toThrow()
    })

    test('stays within the compute budget: any ASCII listing fits, emoji walls are refused', () => {
        const ascii = encodeListingMemo({ ...meta, name: 'n'.repeat(99), tagline: 't'.repeat(999) })
        expect(Buffer.byteLength(ascii)).toBeLessThanOrEqual(MAX_LISTING_MEMO_BYTES)
        expect(() => encodeListingMemo({ ...meta, tagline: '🚀'.repeat(LISTING_LIMITS.tagline) })).toThrow(/too long/)
    })
})

describe('listing instructions', () => {
    const authorKey = new PublicKey(author)
    const ixs = listingInstructions(authorKey, meta)

    test('memo is signed by the author and the registry gets a 0-lamport ping', () => {
        expect(ixs[0].programId.equals(MEMO_PROGRAM_ID)).toBe(true)
        expect(ixs[0].keys).toEqual([{ pubkey: authorKey, isSigner: true, isWritable: false }])
        expect(ixs[1].programId.equals(SystemProgram.programId)).toBe(true)
        expect(ixs[1].keys[1].pubkey.equals(REGISTRY_ADDRESS)).toBe(true)
        expect(ixs[1].data.readBigUInt64LE(4)).toBe(0n)
    })

    test('a maximal listing fits in one transaction', () => {
        const big = { ...meta, name: 'n'.repeat(LISTING_LIMITS.name), tagline: 't'.repeat(LISTING_LIMITS.tagline) }
        const tx = new Transaction().add(...listingInstructions(authorKey, big))
        tx.recentBlockhash = PublicKey.default.toBase58()
        tx.feePayer = authorKey
        expect(tx.serialize({ requireAllSignatures: false, verifySignatures: false }).length).toBeLessThan(1232)
    })

    test('registry address is pinned (changing it would orphan every listing)', () => {
        expect(REGISTRY_ADDRESS.toBase58()).toBe('EWpPb84bEbgrNYrnZehvyPvEB2Ukor8hBcYPDw7u6HaA')
    })
})

describe('reading listing transactions back', () => {
    const payer = Keypair.generate()
    const ixs = listingInstructions(payer.publicKey, meta)

    test('legacy message: signers and memo text', () => {
        const tx = new Transaction().add(...ixs)
        tx.recentBlockhash = PublicKey.default.toBase58()
        tx.feePayer = payer.publicKey
        const parsed = registryTxFromMessage('sig', 7, 123, tx.compileMessage())
        expect(parsed.signers).toEqual([payer.publicKey.toBase58()])
        expect(parsed.memos.map(parseListingMemo)).toEqual([meta])
    })

    test('v0 message', () => {
        const message = new TransactionMessage({ payerKey: payer.publicKey, recentBlockhash: PublicKey.default.toBase58(), instructions: ixs }).compileToV0Message()
        const [candidate] = listingCandidates(registryTxFromMessage('sig', 7, null, new VersionedTransaction(message).message))
        expect(candidate).toMatchObject({ ...meta, signers: [payer.publicKey.toBase58()], slot: 7 })
    })
})

describe('resolving listings', () => {
    const feeClaimerOf = (c: string) => (c === config ? author : undefined)

    test('keeps listings signed by the config owner', () => {
        const [listing] = resolveListings(listingCandidates(registryTx({})), feeClaimerOf)
        expect(listing).toMatchObject({ ...meta, author, signature: 'sig', slot: 100 })
    })

    test("ignores listings of configs the signer doesn't own, or that don't exist", () => {
        const spammer = Keypair.generate().publicKey.toBase58()
        const ghost = encodeListingMemo({ ...meta, config: Keypair.generate().publicKey.toBase58() })
        const candidates = [...listingCandidates(registryTx({ signers: [spammer] })), ...listingCandidates(registryTx({ memo: ghost }))]
        expect(resolveListings(candidates, feeClaimerOf)).toEqual([])
    })

    test('the newest listing of a config wins', () => {
        const renamed = encodeListingMemo({ ...meta, name: 'Classic v2' })
        const candidates = [
            ...listingCandidates(registryTx({ signature: 'new', slot: 200, memo: renamed })),
            ...listingCandidates(registryTx({ signature: 'old', slot: 100 })),
        ]
        const listings = resolveListings(candidates, feeClaimerOf)
        expect(listings).toHaveLength(1)
        expect(listings[0]).toMatchObject({ name: 'Classic v2', signature: 'new' })
    })

    test('non-listing memos in a registry transaction are skipped', () => {
        expect(listingCandidates(registryTx({ memos: ['hello', encodeListingMemo(meta)] }))).toHaveLength(1)
    })
})
