import { PublicKey, SystemProgram, TransactionInstruction } from '@solana/web3.js'
import type { PresetCategory } from './presets/spec'

/**
 * The preset marketplace is an on-chain registry with no program of its own.
 * Listing a config sends one small transaction holding a memo with the
 * listing JSON plus a 0-lamport transfer to REGISTRY_ADDRESS, so every listing
 * can be found with `getSignaturesForAddress` on any RPC. A listing only
 * counts when the config's feeClaimer signed it, so nobody can list (or
 * rename) a config they don't own.
 */
export const MEMO_PROGRAM_ID = new PublicKey('MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr')

/** PDA of the memo program: nobody holds its key and it never holds lamports. */
export const REGISTRY_ADDRESS = PublicKey.findProgramAddressSync(
    [Buffer.from('curve-studio-registry-v1')],
    MEMO_PROGRAM_ID
)[0]

const APP = 'curve-studio'
const CATEGORIES: readonly PresetCategory[] = ['meme', 'stock', 'icm', 'rwa', 'ai']

export const LISTING_LIMITS = { name: 32, tagline: 160 } as const

/**
 * The memo program costs ~500 compute units per byte, so listings are capped
 * well inside the 400k units the listing transaction requests.
 */
export const MAX_LISTING_MEMO_BYTES = 700
export const LISTING_COMPUTE_UNITS = 400_000

export type ListingMeta = {
    config: string
    name: string
    tagline: string
    category: PresetCategory
    /** Built-in preset the author started from, if any. */
    preset?: string
}

/** The facts a listing needs from a transaction that pinged the registry. */
export type RegistryTx = {
    signature: string
    slot: number
    blockTime: number | null
    signers: string[]
    memos: string[]
}

export type Listing = ListingMeta & {
    /** The config's feeClaimer, which signed the listing. */
    author: string
    signature: string
    slot: number
    blockTime: number | null
}

// control characters would only garble the UI; React already escapes markup.
// Truncates by code point so an emoji is never cut in half.
const clean = (s: string, max: number) =>
    Array.from(s.replace(/[\u0000-\u001f\u007f]/g, ' ').trim())
        .slice(0, max)
        .join('')
        .trim()

export function encodeListingMemo(meta: ListingMeta): string {
    new PublicKey(meta.config) // throws on a malformed address
    const name = clean(meta.name, LISTING_LIMITS.name)
    if (!name) throw new Error('a listing needs a name')
    if (!CATEGORIES.includes(meta.category)) throw new Error(`unknown category: ${meta.category}`)
    const memo = JSON.stringify({
        app: APP,
        v: 1,
        config: meta.config,
        name,
        tagline: clean(meta.tagline, LISTING_LIMITS.tagline),
        category: meta.category,
        ...(meta.preset ? { preset: clean(meta.preset, 32) } : {}),
    })
    if (Buffer.byteLength(memo, 'utf8') > MAX_LISTING_MEMO_BYTES) throw new Error('Listing name and tagline are too long')
    return memo
}

export function parseListingMemo(text: string): ListingMeta | null {
    let raw: unknown
    try {
        raw = JSON.parse(text)
    } catch {
        return null
    }
    if (typeof raw !== 'object' || raw === null) return null
    const m = raw as Record<string, unknown>
    if (m.app !== APP || m.v !== 1) return null
    if (typeof m.config !== 'string' || typeof m.name !== 'string') return null
    try {
        new PublicKey(m.config)
    } catch {
        return null
    }
    const category = CATEGORIES.find((c) => c === m.category)
    const name = clean(m.name, LISTING_LIMITS.name)
    if (!category || !name) return null
    return {
        config: m.config,
        name,
        tagline: typeof m.tagline === 'string' ? clean(m.tagline, LISTING_LIMITS.tagline) : '',
        category,
        ...(typeof m.preset === 'string' && m.preset ? { preset: clean(m.preset, 32) } : {}),
    }
}

/** Memo (signed by the author) + registry ping. Append to any transaction the author signs. */
export function listingInstructions(author: PublicKey, meta: ListingMeta): TransactionInstruction[] {
    return [
        new TransactionInstruction({
            programId: MEMO_PROGRAM_ID,
            // memo v2 fails unless every listed account signed, binding the memo to the author
            keys: [{ pubkey: author, isSigner: true, isWritable: false }],
            data: Buffer.from(encodeListingMemo(meta), 'utf8'),
        }),
        SystemProgram.transfer({ fromPubkey: author, toPubkey: REGISTRY_ADDRESS, lamports: 0 }),
    ]
}

type CompiledMessage = {
    header: { numRequiredSignatures: number }
    staticAccountKeys: PublicKey[]
    compiledInstructions: { programIdIndex: number; data: Uint8Array }[]
}

const decoder = new TextDecoder()

/** Signers and memo texts of a fetched transaction (legacy or v0 message). */
export function registryTxFromMessage(
    signature: string,
    slot: number,
    blockTime: number | null,
    message: CompiledMessage
): RegistryTx {
    const keys = message.staticAccountKeys
    return {
        signature,
        slot,
        blockTime,
        // signers always come first and are never loaded from lookup tables
        signers: keys.slice(0, message.header.numRequiredSignatures).map((k) => k.toBase58()),
        memos: message.compiledInstructions
            .filter((ix) => keys[ix.programIdIndex]?.equals(MEMO_PROGRAM_ID))
            .map((ix) => decoder.decode(ix.data)),
    }
}

export type ListingCandidate = ListingMeta & Omit<RegistryTx, 'memos'>

export function listingCandidates(tx: RegistryTx): ListingCandidate[] {
    const { memos, ...rest } = tx
    return memos.flatMap((text) => {
        const meta = parseListingMemo(text)
        return meta ? [{ ...meta, ...rest }] : []
    })
}

/**
 * Keep candidates signed by their config's feeClaimer (`feeClaimerOf` returns
 * undefined for configs that don't exist); the newest listing per config wins.
 */
export function resolveListings(
    candidates: ListingCandidate[],
    feeClaimerOf: (config: string) => string | undefined
): Listing[] {
    const latest = new Map<string, Listing>()
    for (const c of candidates) {
        const author = feeClaimerOf(c.config)
        if (!author || !c.signers.includes(author)) continue
        const prev = latest.get(c.config)
        if (prev && prev.slot >= c.slot) continue
        latest.set(c.config, {
            config: c.config,
            name: c.name,
            tagline: c.tagline,
            category: c.category,
            ...(c.preset ? { preset: c.preset } : {}),
            author,
            signature: c.signature,
            slot: c.slot,
            blockTime: c.blockTime,
        })
    }
    return [...latest.values()].sort((a, b) => b.slot - a.slot)
}
