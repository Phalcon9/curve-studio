import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import { DynamicBondingCurveClient, type PoolConfig } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { creatorClaimable, hasClaimable, partnerClaimable, sumClaimable, type Claimable } from '@curve-studio/core'
import { resolveQuote, type QuoteInfo } from './onchain'
import { fetchTokenMetas, type TokenMeta } from './tokens'

export type PoolClaim = {
    pool: PublicKey
    baseMint: PublicKey
    claim: Claimable
    migrated: boolean
    meta?: TokenMeta
}

export type AuthorConfig = {
    address: PublicKey
    config: PoolConfig
    quote: QuoteInfo
    pools: PoolClaim[]
    total: Claimable
}

export type CreatorPool = PoolClaim & { config: PoolConfig; quote: QuoteInfo }

const client = (connection: Connection) => new DynamicBondingCurveClient(connection, 'confirmed')

function quoteResolver(connection: Connection) {
    const cache = new Map<string, Promise<QuoteInfo>>()
    return (mint: PublicKey) => {
        const key = mint.toBase58()
        if (!cache.has(key)) cache.set(key, resolveQuote(connection, mint))
        return cache.get(key)!
    }
}

/**
 * Configs the wallet is feeClaimer of (found on chain, plus `known` addresses in
 * case the RPC refuses the owner scan), with every pool's claimable author fees.
 */
export async function loadAuthorEarnings(connection: Connection, wallet: PublicKey, known: string[]): Promise<AuthorConfig[]> {
    const c = client(connection)
    const configs = new Map<string, PoolConfig>()
    for (const { publicKey, account } of await c.state.getPoolConfigsByOwner(wallet).catch(() => [])) configs.set(publicKey.toBase58(), account)

    const missing = [...new Set(known)].filter((a) => !configs.has(a))
    if (missing.length) {
        const states = await c.state.getProgram().account.poolConfig.fetchMultiple(missing.map((a) => new PublicKey(a)))
        states.forEach((s, i) => s?.feeClaimer.equals(wallet) && configs.set(missing[i], s))
    }

    const quoteOf = quoteResolver(connection)
    const out = await Promise.all(
        [...configs].map(async ([address, config]) => {
            const [pools, quote] = await Promise.all([c.state.getPoolsByConfig(address), quoteOf(config.quoteMint)])
            const metas = await fetchTokenMetas(connection, pools.map((p) => p.account.poolState.baseMint), config.tokenType).catch(() => new Map<string, TokenMeta>())
            const claims = pools.map(({ publicKey, account }) => ({
                pool: publicKey,
                baseMint: account.poolState.baseMint,
                claim: partnerClaimable(account.poolState, config),
                migrated: account.poolState.isMigrated === 1,
                meta: metas.get(account.poolState.baseMint.toBase58()),
            }))
            return { address: new PublicKey(address), config, quote, pools: claims, total: sumClaimable(claims.map((p) => p.claim)) }
        })
    )
    return out.sort((a, b) => b.pools.length - a.pools.length)
}

/** Pools the wallet created, with their claimable creator fees. */
export async function loadCreatorEarnings(connection: Connection, wallet: PublicKey): Promise<CreatorPool[]> {
    const c = client(connection)
    const pools = await c.state.getPoolsByCreator(wallet)
    if (pools.length === 0) return []

    const configKeys = [...new Set(pools.map((p) => p.account.poolState.config.toBase58()))]
    const states = await c.state.getProgram().account.poolConfig.fetchMultiple(configKeys.map((k) => new PublicKey(k)))
    const configs = new Map(configKeys.flatMap((k, i) => (states[i] ? [[k, states[i]] as const] : [])))

    const quoteOf = quoteResolver(connection)
    const metas = new Map<string, TokenMeta>()
    for (const tokenType of new Set([...configs.values()].map((cfg) => cfg.tokenType))) {
        const mints = pools.filter((p) => configs.get(p.account.poolState.config.toBase58())?.tokenType === tokenType).map((p) => p.account.poolState.baseMint)
        for (const [k, v] of await fetchTokenMetas(connection, mints, tokenType).catch(() => new Map<string, TokenMeta>())) metas.set(k, v)
    }

    const out = await Promise.all(
        pools.map(async ({ publicKey, account }): Promise<CreatorPool | null> => {
            const s = account.poolState
            const config = configs.get(s.config.toBase58())
            if (!config) return null
            return {
                pool: publicKey,
                baseMint: s.baseMint,
                claim: creatorClaimable(s),
                migrated: s.isMigrated === 1,
                meta: metas.get(s.baseMint.toBase58()),
                config,
                quote: await quoteOf(config.quoteMint),
            }
        })
    )
    return out.filter((p): p is CreatorPool => p !== null)
}

/** One transaction per pool: trading fees plus the launch fee, whichever are open. */
export async function partnerClaimTxs(connection: Connection, wallet: PublicKey, pools: PoolClaim[]): Promise<Transaction[]> {
    const c = client(connection)
    const txs: Transaction[] = []
    for (const { pool, claim } of pools.filter((p) => hasClaimable(p.claim))) {
        const tx = new Transaction()
        if (!claim.quote.isZero() || !claim.base.isZero()) {
            const ix = await c.partner.claimPartnerTradingFee({ feeClaimer: wallet, payer: wallet, pool, maxBaseAmount: claim.base, maxQuoteAmount: claim.quote })
            tx.add(...ix.instructions)
        }
        if (!claim.launchFee.isZero()) {
            tx.add(...(await c.partner.claimPartnerPoolCreationFee({ pool, feeReceiver: wallet })).instructions)
        }
        txs.push(tx)
    }
    return txs
}

export async function creatorClaimTxs(connection: Connection, wallet: PublicKey, pools: PoolClaim[]): Promise<Transaction[]> {
    const c = client(connection)
    const txs: Transaction[] = []
    for (const { pool, claim } of pools.filter((p) => hasClaimable(p.claim))) {
        const ix = await c.creator.claimCreatorTradingFee({ creator: wallet, payer: wallet, pool, maxBaseAmount: claim.base, maxQuoteAmount: claim.quote })
        txs.push(new Transaction().add(...ix.instructions))
    }
    return txs
}
