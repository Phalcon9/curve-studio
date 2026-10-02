import BN from 'bn.js'
import {
    getDeltaAmountQuoteUnsigned,
    getNextSqrtPriceFromInput,
    Rounding,
    type ConfigParameters,
    type PoolConfig,
    type VirtualPool,
} from '@meteora-ag/dynamic-bonding-curve-sdk'

type CurvePoint = ConfigParameters['curve'][number]

/**
 * Port of the program's `get_migration_threshold_price`
 * (programs/dynamic-bonding-curve/src/utils): walk the curve until
 * `migrationQuoteThreshold` of quote has been absorbed. The SDK does not export it.
 */
export function getMigrationThresholdPrice(
    migrationThreshold: BN,
    sqrtStartPrice: BN,
    curve: CurvePoint[]
): BN {
    let nextSqrtPrice = sqrtStartPrice
    const first = getDeltaAmountQuoteUnsigned(
        nextSqrtPrice,
        curve[0].sqrtPrice,
        curve[0].liquidity,
        Rounding.Up
    )
    if (first.gt(migrationThreshold)) {
        return getNextSqrtPriceFromInput(
            nextSqrtPrice,
            curve[0].liquidity,
            migrationThreshold,
            false
        )
    }

    let amountLeft = migrationThreshold.sub(first)
    nextSqrtPrice = curve[0].sqrtPrice
    for (let i = 1; i < curve.length; i++) {
        const maxAmount = getDeltaAmountQuoteUnsigned(
            nextSqrtPrice,
            curve[i].sqrtPrice,
            curve[i].liquidity,
            Rounding.Up
        )
        if (maxAmount.gt(amountLeft)) {
            nextSqrtPrice = getNextSqrtPriceFromInput(
                nextSqrtPrice,
                curve[i].liquidity,
                amountLeft,
                false
            )
            amountLeft = new BN(0)
            break
        }
        amountLeft = amountLeft.sub(maxAmount)
        nextSqrtPrice = curve[i].sqrtPrice
    }
    if (!amountLeft.isZero()) {
        throw new Error('curve cannot absorb migrationQuoteThreshold')
    }
    return nextSqrtPrice
}

const ZERO = new BN(0)

/**
 * Build the subset of on-chain PoolConfig / VirtualPool state that the SDK's
 * swap math reads, from ConfigParameters that have not been deployed yet.
 */
export function materialize(params: ConfigParameters): { config: PoolConfig } {
    const migrationSqrtPrice = getMigrationThresholdPrice(
        params.migrationQuoteThreshold,
        params.sqrtStartPrice,
        params.curve
    )
    const dyn = params.poolFees.dynamicFee
    const config = {
        poolFees: {
            baseFee: params.poolFees.baseFee,
            dynamicFee: dyn
                ? { ...dyn, initialized: 1 }
                : {
                      initialized: 0,
                      maxVolatilityAccumulator: 0,
                      variableFeeControl: 0,
                      binStep: 0,
                      filterPeriod: 0,
                      decayPeriod: 0,
                      reductionFactor: 0,
                      binStepU128: ZERO,
                  },
        },
        collectFeeMode: params.collectFeeMode,
        creatorTradingFeePercentage: params.creatorTradingFeePercentage,
        migrationQuoteThreshold: params.migrationQuoteThreshold,
        migrationSqrtPrice,
        sqrtStartPrice: params.sqrtStartPrice,
        curve: params.curve,
    } as unknown as PoolConfig

    return { config }
}

/** A just-created pool on `config`: at the start price, empty reserves, activated at t=0. */
export function freshPool(config: PoolConfig): VirtualPool {
    return {
        poolState: {
            sqrtPrice: config.sqrtStartPrice,
            quoteReserve: ZERO,
            baseReserve: ZERO,
            activationPoint: ZERO,
            volatilityTracker: {
                lastUpdateTimestamp: ZERO,
                sqrtPriceReference: config.sqrtStartPrice,
                volatilityAccumulator: ZERO,
                volatilityReference: ZERO,
            },
        },
    } as unknown as VirtualPool
}
