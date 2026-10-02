import Decimal from 'decimal.js'
import { PublicKey } from '@solana/web3.js'
import {
    ActivationType,
    BaseFeeMode,
    buildCurveWithCustomSqrtPrices,
    buildCurveWithLiquidityWeights,
    buildCurveWithMarketCap,
    buildCurveWithTwoSegments,
    CollectFeeMode,
    DammV2BaseFeeMode,
    DammV2DynamicFeeMode,
    MigratedCollectFeeMode,
    MigrationFeeOption,
    MigrationOption,
    TokenAuthorityOption,
    validateConfigParameters,
    type BuildCurveBaseParams,
    type ConfigParameters,
} from '@meteora-ag/dynamic-bonding-curve-sdk'
import type { QuoteContext } from '../quotes'
import { sqrtPriceFromPrice } from '../units'
import type { PresetSpec } from './spec'

export type CompiledPreset = {
    spec: PresetSpec
    quote: QuoteContext
    params: ConfigParameters
    /** Total base supply actually used (differs from spec for navBand). */
    totalSupply: number
}

const TOKEN_AUTHORITY: Record<PresetSpec['tokenAuthority'], TokenAuthorityOption> = {
    immutable: TokenAuthorityOption.Immutable,
    creatorUpdate: TokenAuthorityOption.CreatorUpdateAuthority,
    partnerUpdate: TokenAuthorityOption.PartnerUpdateAuthority,
}

const MIGRATED_COLLECT: Record<PresetSpec['migration']['collectIn'], MigratedCollectFeeMode> = {
    quote: MigratedCollectFeeMode.QuoteToken,
    output: MigratedCollectFeeMode.OutputToken,
    compounding: MigratedCollectFeeMode.Compounding,
}

const usdToQuote = (usd: number, quote: QuoteContext) => usd / quote.usdPrice

/** Supply needed for a navBand curve to raise ~targetRaiseUsd (≈half sold on curve, half seeds DAMM v2). */
export function navBandSupply(refPriceUsd: number, targetRaiseUsd: number): number {
    return Math.ceil((2 * targetRaiseUsd) / refPriceUsd)
}

export function compilePreset(
    spec: PresetSpec,
    quote: QuoteContext,
    opts: { leftoverReceiver?: PublicKey } = {}
): CompiledPreset {
    const totalSupply =
        spec.curve.kind === 'navBand'
            ? navBandSupply(spec.curve.refPriceUsd, spec.curve.targetRaiseUsd)
            : spec.supply.total

    const base: BuildCurveBaseParams = {
        token: {
            tokenType: quote.tokenType,
            tokenBaseDecimal: spec.supply.baseDecimals,
            tokenQuoteDecimal: quote.decimals,
            tokenAuthorityOption: TOKEN_AUTHORITY[spec.tokenAuthority],
            totalTokenSupply: totalSupply,
            leftover: spec.supply.leftover,
        },
        fee: {
            baseFeeParams: {
                baseFeeMode:
                    spec.fee.schedule === 'linear'
                        ? BaseFeeMode.FeeSchedulerLinear
                        : BaseFeeMode.FeeSchedulerExponential,
                feeSchedulerParam: {
                    startingFeeBps: spec.fee.startBps,
                    endingFeeBps: spec.fee.endBps,
                    numberOfPeriod: spec.fee.periods,
                    totalDuration: spec.fee.durationSec,
                },
            },
            dynamicFeeEnabled: spec.fee.dynamic,
            collectFeeMode:
                spec.fee.collectIn === 'quote'
                    ? CollectFeeMode.QuoteToken
                    : CollectFeeMode.OutputToken,
            creatorTradingFeePercentage: spec.fee.creatorSharePct,
            poolCreationFee: spec.fee.poolCreationFeeSol,
            // lets the creator bundle a first buy at the minimum fee instead of the anti-sniper fee
            enableFirstSwapWithMinFee: true,
        },
        migration: {
            migrationOption: MigrationOption.MET_DAMM_V2,
            migrationFeeOption: MigrationFeeOption.Customizable,
            migrationFee: {
                feePercentage: spec.migration.migrationFeePct,
                creatorFeePercentage: spec.migration.creatorMigrationFeePct,
            },
            migratedPoolFee: {
                collectFeeMode: MIGRATED_COLLECT[spec.migration.collectIn],
                dynamicFee: spec.migration.dynamicFee
                    ? DammV2DynamicFeeMode.Enabled
                    : DammV2DynamicFeeMode.Disabled,
                poolFeeBps: spec.migration.poolFeeBps,
                compoundingFeeBps:
                    spec.migration.collectIn === 'compounding'
                        ? spec.migration.compoundingFeeBps
                        : undefined,
                baseFeeMode: DammV2BaseFeeMode.FeeTimeSchedulerLinear,
            },
        },
        liquidityDistribution: {
            partnerPermanentLockedLiquidityPercentage: spec.liquidity.partnerLockedPct,
            partnerLiquidityPercentage: spec.liquidity.partnerPct,
            creatorPermanentLockedLiquidityPercentage: spec.liquidity.creatorLockedPct,
            creatorLiquidityPercentage: spec.liquidity.creatorPct,
        },
        lockedVesting: {
            totalLockedVestingAmount: 0,
            numberOfVestingPeriod: 0,
            cliffUnlockAmount: 0,
            totalVestingDuration: 0,
            cliffDurationFromMigrationTime: 0,
        },
        activationType: ActivationType.Timestamp,
    }

    const params = buildCurve(spec, base, quote)
    validateConfigParameters({
        ...params,
        // validation only needs a non-default key; the real receiver is set at deploy
        leftoverReceiver: opts.leftoverReceiver ?? new PublicKey(quote.mint),
    })
    return { spec, quote, params, totalSupply }
}

function buildCurve(
    spec: PresetSpec,
    base: BuildCurveBaseParams,
    quote: QuoteContext
): ConfigParameters {
    const c = spec.curve
    const baseDec = spec.supply.baseDecimals
    const toSqrt = (usdPrice: number) =>
        sqrtPriceFromPrice(new Decimal(usdToQuote(usdPrice, quote)), baseDec, quote.decimals)

    switch (c.kind) {
        case 'marketCap':
            return buildCurveWithMarketCap({
                ...base,
                initialMarketCap: usdToQuote(c.startMcapUsd, quote),
                migrationMarketCap: usdToQuote(c.gradMcapUsd, quote),
            })
        case 'twoSegment':
            return buildCurveWithTwoSegments({
                ...base,
                initialMarketCap: usdToQuote(c.startMcapUsd, quote),
                migrationMarketCap: usdToQuote(c.gradMcapUsd, quote),
                percentageSupplyOnMigration: c.pctSupplyOnMigration,
            })
        case 'weights':
            return buildCurveWithLiquidityWeights({
                ...base,
                initialMarketCap: usdToQuote(c.startMcapUsd, quote),
                migrationMarketCap: usdToQuote(c.gradMcapUsd, quote),
                liquidityWeights: c.weights,
            })
        case 'navBand': {
            const band = c.bandBps / 10_000
            return buildCurveWithCustomSqrtPrices({
                ...base,
                sqrtPrices: [
                    toSqrt(c.refPriceUsd * (1 - band)),
                    toSqrt(c.refPriceUsd * (1 + band)),
                ],
            })
        }
        case 'customPrices':
            return buildCurveWithCustomSqrtPrices({
                ...base,
                sqrtPrices: c.pricesUsd.map(toSqrt),
                liquidityWeights: c.weights,
            })
    }
    throw new Error(`unknown curve kind: ${(c as { kind: string }).kind}`)
}
