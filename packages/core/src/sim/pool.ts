import BN from 'bn.js'
import {
    getMigrationThresholdPrice,
    type ConfigParameters,
    type PoolConfig,
    type VirtualPool,
} from '@meteora-ag/dynamic-bonding-curve-sdk'

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
