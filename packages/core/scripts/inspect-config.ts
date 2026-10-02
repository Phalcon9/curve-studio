// Read a deployed DBC config and print its launch economics.
// usage: pnpm inspect <config-address> [devnet|mainnet-beta]
import { Connection, clusterApiUrl } from '@solana/web3.js'
import { DynamicBondingCurveClient } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { CurveSim, fromAtoms, priceFromSqrtPrice } from '../src'

const [address, cluster = 'devnet'] = process.argv.slice(2)
if (!address) throw new Error('usage: pnpm inspect <config-address> [devnet|mainnet-beta]')

const connection = new Connection(clusterApiUrl(cluster as 'devnet' | 'mainnet-beta'), 'confirmed')
const client = new DynamicBondingCurveClient(connection, 'confirmed')
const config = await client.state.getPoolConfig(address)
if (!config) throw new Error(`no DBC config at ${address} on ${cluster}`)

const quoteMint = await connection.getParsedAccountInfo(config.quoteMint)
const quoteDecimals = (quoteMint.value?.data as { parsed: { info: { decimals: number } } }).parsed.info.decimals
const supply = fromAtoms(config.preMigrationTokenSupply, config.tokenDecimal)
const start = priceFromSqrtPrice(config.sqrtStartPrice, config.tokenDecimal, quoteDecimals)
const grad = priceFromSqrtPrice(config.migrationSqrtPrice, config.tokenDecimal, quoteDecimals)
const base = config.poolFees.baseFee

console.log({
    feeClaimer: config.feeClaimer.toBase58(),
    quoteMint: config.quoteMint.toBase58(),
    baseDecimals: config.tokenDecimal,
    totalSupply: supply.toString(),
    startPrice: start.toSignificantDigits(6).toString(),
    graduationPrice: grad.toSignificantDigits(6).toString(),
    startMcapQuote: start.mul(supply).toSignificantDigits(6).toString(),
    graduationMcapQuote: grad.mul(supply).toSignificantDigits(6).toString(),
    raiseToGraduateQuote: fromAtoms(config.migrationQuoteThreshold, quoteDecimals).toString(),
    curveSegments: config.curve.filter((c) => !c.sqrtPrice.isZero()).length,
    launchFeeBps: base.cliffFeeNumerator.toNumber() / 100_000,
    feeSchedule: { mode: base.baseFeeMode, periods: base.firstFactor, secondFactor: base.secondFactor.toString(), reduction: base.thirdFactor.toString() },
    creatorTradingFeePct: config.creatorTradingFeePercentage,
    poolCreationFeeSol: fromAtoms(config.poolCreationFee, 9).toString(),
    migratedPoolFeeBps: config.migratedPoolFeeBps,
    migratedCollectFeeMode: config.migratedCollectFeeMode,
    lpSplitPct: {
        partnerLocked: config.partnerPermanentLockedLiquidityPercentage,
        partner: config.partnerLiquidityPercentage,
        creatorLocked: config.creatorPermanentLockedLiquidityPercentage,
        creator: config.creatorLiquidityPercentage,
    },
})

// Simulate the deployed config directly; pass a USD price for the quote to see USD figures.
const usdPrice = Number(process.env.QUOTE_USD ?? 1)
const sim = CurveSim.fromOnChain(config, quoteDecimals, usdPrice)
console.log(`\nsimulated @ quote=$${usdPrice}:`, sim.summary())
console.log('fee on a $500 buy @ 0s/60s/600s:', sim.sniperTable(500, [0, 60, 600]).map((r) => Math.round(r.feeBps)))
