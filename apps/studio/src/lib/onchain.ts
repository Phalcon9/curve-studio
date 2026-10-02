import { Connection, PublicKey, type ParsedAccountData } from '@solana/web3.js'
import {
    DynamicBondingCurveClient,
    deriveTokenBadgeAddress,
    type PoolConfig,
} from '@meteora-ag/dynamic-bonding-curve-sdk'
import { KNOWN_QUOTES, USDC } from '@curve-studio/core'
import { fetchUsdPrices } from './prices'
import { DEVNET_MINT_OVERRIDES } from './deploy'

export type QuoteInfo = {
    mint: PublicKey
    symbol: string
    decimals: number
    /** null when no price source is known for this mint. */
    usdPrice: number | null
    /** Pool creation must pass the DBC token badge for badged Token-2022 quotes. */
    tokenBadge?: PublicKey
}

export type LaunchedPool = {
    address: string
    baseMint: string
    creator: string
    progress: number
    migrated: boolean
}

export type LoadedConfig = {
    address: PublicKey
    config: PoolConfig
    quote: QuoteInfo
    pools: LaunchedPool[]
}

// devnet stand-in mint -> mainnet mint, so devnet quotes can borrow a mainnet price
const MAINNET_EQUIVALENT = Object.fromEntries(Object.entries(DEVNET_MINT_OVERRIDES).map(([main, dev]) => [dev, main]))

export async function resolveQuote(connection: Connection, mint: PublicKey): Promise<QuoteInfo> {
    const account = await connection.getParsedAccountInfo(mint)
    const decimals = (account.value?.data as ParsedAccountData | undefined)?.parsed?.info?.decimals
    if (typeof decimals !== 'number') throw new Error(`quote mint ${mint.toBase58()} not found`)

    const priceMint = MAINNET_EQUIVALENT[mint.toBase58()] ?? mint.toBase58()
    const known = KNOWN_QUOTES.find((q) => q.mint === priceMint)
    const live = known ? (await fetchUsdPrices([known]))[known.mint] : undefined

    const badge = deriveTokenBadgeAddress(mint)
    const hasBadge = (await connection.getAccountInfo(badge)) !== null

    return {
        mint,
        symbol: known?.symbol ?? `${mint.toBase58().slice(0, 4)}…`,
        decimals,
        usdPrice: live ?? known?.usdPrice ?? (priceMint === USDC.mint ? 1 : null),
        tokenBadge: hasBadge ? badge : undefined,
    }
}

export async function loadConfig(connection: Connection, address: string): Promise<LoadedConfig> {
    let key: PublicKey
    try {
        key = new PublicKey(address.trim())
    } catch {
        throw new Error('That is not a valid Solana address')
    }
    const client = new DynamicBondingCurveClient(connection, 'confirmed')
    const config = await client.state.getPoolConfig(key)
    if (!config) throw new Error('No Meteora DBC config at this address on this network')

    const [quote, poolAccounts] = await Promise.all([
        resolveQuote(connection, config.quoteMint),
        // getProgramAccounts can be refused by rate-limited public RPCs; the page still works without it
        client.state.getPoolsByConfig(key).catch(() => []),
    ])

    const threshold = config.migrationQuoteThreshold
    const pools = poolAccounts.map(({ publicKey, account }) => {
        const s = account.poolState
        return {
            address: publicKey.toBase58(),
            baseMint: s.baseMint.toBase58(),
            creator: s.creator.toBase58(),
            progress: threshold.isZero() ? 0 : Math.min(1, s.quoteReserve.muln(10_000).div(threshold).toNumber() / 10_000),
            migrated: s.isMigrated === 1,
        }
    })
    pools.sort((a, b) => b.progress - a.progress)

    return { address: key, config, quote, pools }
}
