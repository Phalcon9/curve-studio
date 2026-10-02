import { ComputeBudgetProgram, Connection, PublicKey, Transaction, type VersionedTransactionResponse } from '@solana/web3.js'
import {
    DYNAMIC_BONDING_CURVE_PROGRAM_ID,
    DynamicBondingCurveClient,
    derivePartnerMetadata,
    type PoolConfig,
} from '@meteora-ag/dynamic-bonding-curve-sdk'
import {
    LISTING_COMPUTE_UNITS,
    listingCandidates,
    listingInstructions,
    registryTxFromMessage,
    REGISTRY_ADDRESS,
    resolveListings,
    type Listing,
    type ListingCandidate,
    type ListingMeta,
} from '@curve-studio/core'
import { resolveQuote, type QuoteInfo } from './onchain'
import type { Cluster } from './cluster'

export type MarketEntry = {
    listing: Listing
    config: PoolConfig
    quote: QuoteInfo
    /** From the author's DBC partner metadata, when they created one. */
    authorName?: string
}

const program = (connection: Connection) => new DynamicBondingCurveClient(connection, 'confirmed').state.getProgram()

// Parsed registry transactions never change, so they are cached per signature
// and only new signatures are fetched on later visits.
type Cache = Record<string, ListingCandidate[]>
const cacheKey = (cluster: Cluster) => `curve-studio:registry:v1:${cluster}`

function readCache(cluster: Cluster): Cache {
    try {
        return JSON.parse(localStorage.getItem(cacheKey(cluster)) ?? '{}') as Cache
    } catch {
        return {}
    }
}

function writeCache(cluster: Cluster, cache: Cache) {
    try {
        localStorage.setItem(cacheKey(cluster), JSON.stringify(cache))
    } catch {
        // storage unavailable: everything is refetched next time
    }
}

/** Listing candidates from the newest 1000 transactions that pinged the registry. */
async function fetchCandidates(connection: Connection, cluster: Cluster): Promise<ListingCandidate[]> {
    const sigs = (await connection.getSignaturesForAddress(REGISTRY_ADDRESS, { limit: 1000 }, 'confirmed')).filter((s) => !s.err)
    const cache = readCache(cluster)
    const missing = sigs.map((s) => s.signature).filter((s) => !(s in cache))
    for (let i = 0; i < missing.length; i += 20) {
        const batch = missing.slice(i, i + 20)
        const txs: (VersionedTransactionResponse | null | 'skip')[] = await connection
            .getTransactions(batch, TX_OPTS)
            // one unreadable transaction fails the whole batch, and anyone can ping the registry
            .catch(() => Promise.all(batch.map(fetchOne)))
        txs.forEach((tx, j) => {
            if (tx === null) return // not served yet, or a transient error: retried next time
            cache[batch[j]] =
                tx === 'skip' || tx.meta?.err
                    ? []
                    : listingCandidates(registryTxFromMessage(batch[j], tx.slot, tx.blockTime ?? null, tx.transaction.message))
        })
    }
    writeCache(cluster, cache)
    return sigs.flatMap((s) => cache[s.signature] ?? [])

    async function fetchOne(sig: string) {
        try {
            return await connection.getTransaction(sig, TX_OPTS)
        } catch (e) {
            // listings are legacy transactions, so a format this client can't read is never one
            return (e as { code?: number }).code === UNSUPPORTED_TX_VERSION ? ('skip' as const) : null
        }
    }
}

const TX_OPTS = { maxSupportedTransactionVersion: 0, commitment: 'confirmed' } as const
const UNSUPPORTED_TX_VERSION = -32015

async function authorNames(connection: Connection, authors: string[]): Promise<Map<string, string>> {
    const metas = await program(connection).account.partnerMetadata.fetchMultiple(authors.map((a) => derivePartnerMetadata(new PublicKey(a))))
    const out = new Map<string, string>()
    metas.forEach((m, i) => m?.name.trim() && out.set(authors[i], m.name.trim()))
    return out
}

async function loadMarket(connection: Connection, cluster: Cluster): Promise<MarketEntry[]> {
    const candidates = await fetchCandidates(connection, cluster)
    const configs = [...new Set(candidates.map((c) => c.config))]
    if (configs.length === 0) return []

    const states = await program(connection).account.poolConfig.fetchMultiple(configs.map((c) => new PublicKey(c)))
    const byConfig = new Map(configs.flatMap((c, i) => (states[i] ? [[c, states[i]] as const] : [])))
    const listings = resolveListings(candidates, (c) => byConfig.get(c)?.feeClaimer.toBase58())

    const quoteMints = [...new Set(listings.map((l) => byConfig.get(l.config)!.quoteMint.toBase58()))]
    const quotes = new Map<string, QuoteInfo>()
    await Promise.all(
        quoteMints.map((m) =>
            resolveQuote(connection, new PublicKey(m)).then(
                (q) => quotes.set(m, q),
                () => {} // unreadable quote mint: its listings are dropped below
            )
        )
    )
    const names = await authorNames(connection, [...new Set(listings.map((l) => l.author))]).catch(() => new Map<string, string>())

    return listings.flatMap((listing) => {
        const config = byConfig.get(listing.config)!
        const quote = quotes.get(config.quoteMint.toBase58())
        return quote ? [{ listing, config, quote, authorName: names.get(listing.author) }] : []
    })
}

// Pages share one fetch per endpoint for a short while instead of each re-reading the registry.
const recent = new Map<string, { at: number; entries: Promise<MarketEntry[]> }>()
const FRESH_MS = 30_000

export function fetchMarket(connection: Connection, cluster: Cluster, { force = false } = {}): Promise<MarketEntry[]> {
    const key = connection.rpcEndpoint
    const hit = recent.get(key)
    if (!force && hit && Date.now() - hit.at < FRESH_MS) return hit.entries
    const entries = loadMarket(connection, cluster)
    recent.set(key, { at: Date.now(), entries })
    entries.catch(() => recent.delete(key))
    return entries
}

const VIRTUAL_POOL_DISCRIMINATOR = Buffer.from([213, 224, 5, 209, 98, 69, 119, 92]).toString('base64')
const POOL_CONFIG_OFFSET = 72

/** Number of tokens launched on a config, without downloading the pool accounts. */
export async function countLaunches(connection: Connection, config: PublicKey): Promise<number> {
    const accounts = await connection.getProgramAccounts(DYNAMIC_BONDING_CURVE_PROGRAM_ID, {
        dataSlice: { offset: 0, length: 0 },
        filters: [
            { memcmp: { offset: 0, bytes: VIRTUAL_POOL_DISCRIMINATOR, encoding: 'base64' } },
            { memcmp: { offset: POOL_CONFIG_OFFSET, bytes: config.toBase58() } },
        ],
    })
    return accounts.length
}

export type AuthorProfile = { name: string; website: string }

export async function hasAuthorProfile(connection: Connection, author: PublicKey): Promise<boolean> {
    return (await connection.getAccountInfo(derivePartnerMetadata(author))) !== null
}

/**
 * The listing transaction. With a profile, it also creates the author's DBC
 * partner metadata (once per wallet), which names them across Meteora tooling.
 */
export async function buildListingTx(connection: Connection, author: PublicKey, meta: ListingMeta, profile?: AuthorProfile): Promise<Transaction> {
    const tx = new Transaction().add(ComputeBudgetProgram.setComputeUnitLimit({ units: LISTING_COMPUTE_UNITS }), ...listingInstructions(author, meta))
    if (profile?.name.trim() && !(await hasAuthorProfile(connection, author))) {
        const client = new DynamicBondingCurveClient(connection, 'confirmed')
        const create = await client.partner.createPartnerMetadata({
            name: profile.name.trim(),
            website: profile.website.trim(),
            logo: '',
            feeClaimer: author,
            payer: author,
        })
        tx.add(...create.instructions)
    }
    return tx
}

/** Fail early, before the wallet prompt, when the wallet doesn't own the config. */
export async function assertOwnsConfig(connection: Connection, config: string, wallet: PublicKey): Promise<PoolConfig> {
    let key: PublicKey
    try {
        key = new PublicKey(config.trim())
    } catch {
        throw new Error('That is not a valid Solana address')
    }
    const state = await new DynamicBondingCurveClient(connection, 'confirmed').state.getPoolConfig(key)
    if (!state) throw new Error('No Meteora DBC config at this address on this network')
    if (!state.feeClaimer.equals(wallet)) throw new Error(`Only the config's fee claimer (${state.feeClaimer.toBase58()}) can list it`)
    return state
}
