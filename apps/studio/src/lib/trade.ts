import BN from 'bn.js'
import { Connection, PublicKey, Transaction } from '@solana/web3.js'
import {
    DynamicBondingCurveClient,
    findAssociatedTokenAddress,
    getCurrentPoint,
    getTokenProgram,
    swapQuotePartialFill,
    SwapMode,
    type PoolConfig,
    type SwapQuote2Result,
    type VirtualPool,
} from '@meteora-ag/dynamic-bonding-curve-sdk'
import { referralFeeToken } from '@curve-studio/core'
import { REFERRAL_WALLET } from './cluster'
import { resolveQuote, type QuoteInfo } from './onchain'
import { fetchTokenMetas, type TokenMeta } from './tokens'

export type Side = 'buy' | 'sell'

export type TokenView = {
    address: PublicKey
    pool: VirtualPool
    configAddress: PublicKey
    config: PoolConfig
    quote: QuoteInfo
    meta: TokenMeta | null
    /** Slot or timestamp (per the config) the quotes are computed at. */
    currentPoint: BN
    migrated: boolean
    /** Curve filled but not yet migrated: the program rejects swaps. */
    complete: boolean
}

export const TRADE_SLIPPAGE_BPS = 100

export async function loadToken(connection: Connection, address: string): Promise<TokenView> {
    let key: PublicKey
    try {
        key = new PublicKey(address.trim())
    } catch {
        throw new Error('That is not a valid Solana address')
    }
    const client = new DynamicBondingCurveClient(connection, 'confirmed')
    const pool = await client.state.getPool(key)
    if (!pool) throw new Error('No Meteora DBC pool at this address on this network')
    const s = pool.poolState
    const config = await client.state.getPoolConfig(s.config)
    if (!config) throw new Error('Pool config not found')

    const [quote, metas, currentPoint] = await Promise.all([
        resolveQuote(connection, config.quoteMint),
        fetchTokenMetas(connection, [s.baseMint], config.tokenType).catch(() => new Map<string, TokenMeta>()),
        getCurrentPoint(connection, config.activationType),
    ])
    return {
        address: key,
        pool,
        configAddress: s.config,
        config,
        quote,
        meta: metas.get(s.baseMint.toBase58()) ?? null,
        currentPoint,
        migrated: s.isMigrated === 1,
        complete: s.quoteReserve.gte(config.migrationQuoteThreshold),
    }
}

export function quoteTrade(t: TokenView, side: Side, amountIn: BN, hasReferral: boolean): SwapQuote2Result {
    // partial fill: a buy that would overshoot graduation fills to the threshold and refunds the rest
    return swapQuotePartialFill(t.pool, t.config, side === 'sell', amountIn, TRADE_SLIPPAGE_BPS, hasReferral, t.currentPoint, false)
}

/**
 * The app's referral token account for this swap's fee token, if it exists.
 * The referral is skipped rather than making the trader pay rent to open it.
 */
export async function referralAccountFor(connection: Connection, config: PoolConfig, baseMint: PublicKey, swapBaseForQuote: boolean): Promise<PublicKey | null> {
    if (!REFERRAL_WALLET) return null
    const onBase = referralFeeToken(config.collectFeeMode, swapBaseForQuote) === 'base'
    const ata = findAssociatedTokenAddress(
        REFERRAL_WALLET,
        onBase ? baseMint : config.quoteMint,
        getTokenProgram(onBase ? config.tokenType : config.quoteTokenFlag)
    )
    return (await connection.getAccountInfo(ata)) ? ata : null
}

export async function buildTradeTx(
    connection: Connection,
    t: TokenView,
    owner: PublicKey,
    side: Side,
    amountIn: BN,
    minimumAmountOut: BN,
    referralTokenAccount: PublicKey | null
): Promise<Transaction> {
    const client = new DynamicBondingCurveClient(connection, 'confirmed')
    return client.pool.swap2({
        owner,
        pool: t.address,
        swapBaseForQuote: side === 'sell',
        referralTokenAccount,
        swapMode: SwapMode.PartialFill,
        amountIn,
        minimumAmountOut,
    })
}
