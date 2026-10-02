import BN from 'bn.js'
import Decimal from 'decimal.js'
import {
    CollectFeeMode,
    swapQuotePartialFill,
    type PoolConfig,
    type VirtualPool,
} from '@meteora-ag/dynamic-bonding-curve-sdk'
import type { CompiledPreset } from '../presets/compile'
import { fromAtoms, priceFromSqrtPrice, toAtoms } from '../units'
import { freshPool, materialize } from './pool'

export type CurvePoint = {
    /** Cumulative quote that has entered the curve (human units). */
    quoteRaised: number
    priceQuote: number
    priceUsd: number
    mcapUsd: number
    /** Fraction of migrationQuoteThreshold reached, 0..1. */
    progress: number
    tokensSold: number
}

export type FeeSplit = {
    /** Preset author (config feeClaimer). */
    partner: number
    creator: number
    protocol: number
    /** Host/referral cut — carved out of the protocol share. */
    referral: number
}

export type LaunchSummary = {
    startPriceUsd: number
    startMcapUsd: number
    gradPriceUsd: number
    gradMcapUsd: number
    /** Quote that must enter the curve to graduate. */
    raiseQuote: number
    raiseUsd: number
    totalSupply: number
    /** Share of supply sold on the curve before graduation. */
    curveSupplyPct: number
    priceMultiple: number
}

export type FillResult = {
    points: CurvePoint[]
    /** Fees in USD across the whole fill. */
    fees: FeeSplit
    graduated: boolean
}

const n = (d: Decimal) => d.toNumber()

/** Everything the simulator needs; either compiled locally or read from chain. */
export type SimSource = {
    config: PoolConfig
    baseDecimals: number
    quoteDecimals: number
    quoteUsdPrice: number
    totalSupply: number
}

export class CurveSim {
    readonly config: PoolConfig
    private readonly fresh: VirtualPool
    private readonly baseDec: number
    private readonly quoteDec: number
    private readonly usdPrice: number
    private readonly totalSupply: number

    constructor(src: SimSource) {
        this.config = src.config
        this.fresh = freshPool(src.config)
        this.baseDec = src.baseDecimals
        this.quoteDec = src.quoteDecimals
        this.usdPrice = src.quoteUsdPrice
        this.totalSupply = src.totalSupply
    }

    static fromCompiled(compiled: CompiledPreset): CurveSim {
        return new CurveSim({
            config: materialize(compiled.params).config,
            baseDecimals: compiled.params.tokenDecimal,
            quoteDecimals: compiled.quote.decimals,
            quoteUsdPrice: compiled.quote.usdPrice,
            totalSupply: compiled.totalSupply,
        })
    }

    /** Simulate a config already deployed on-chain (ours or any other launchpad's). */
    static fromOnChain(config: PoolConfig, quoteDecimals: number, quoteUsdPrice: number): CurveSim {
        const supplyAtoms = config.preMigrationTokenSupply.isZero()
            ? // dynamic-supply configs: curve + migration allocation approximates total supply
              config.swapBaseAmount.add(config.migrationBaseThreshold)
            : config.preMigrationTokenSupply
        return new CurveSim({
            config,
            baseDecimals: config.tokenDecimal,
            quoteDecimals,
            quoteUsdPrice,
            totalSupply: n(fromAtoms(supplyAtoms, config.tokenDecimal)),
        })
    }

    private price(sqrtPrice: BN): Decimal {
        return priceFromSqrtPrice(sqrtPrice, this.baseDec, this.quoteDec)
    }

    private usd(quoteAmount: Decimal): number {
        return n(quoteAmount.mul(this.usdPrice))
    }

    private clonePool(): VirtualPool {
        const s = this.fresh.poolState
        return {
            ...this.fresh,
            poolState: { ...s, volatilityTracker: { ...s.volatilityTracker } },
        } as VirtualPool
    }

    summary(): LaunchSummary {
        const supply = this.totalSupply
        const start = this.price(this.config.sqrtStartPrice)
        const grad = this.price(this.config.migrationSqrtPrice)
        const raise = fromAtoms(this.config.migrationQuoteThreshold, this.quoteDec)
        const fill = this.fill({ steps: 1, atSecond: Number.MAX_SAFE_INTEGER })
        const sold = fill.points.at(-1)?.tokensSold ?? 0
        return {
            startPriceUsd: this.usd(start),
            startMcapUsd: this.usd(start.mul(supply)),
            gradPriceUsd: this.usd(grad),
            gradMcapUsd: this.usd(grad.mul(supply)),
            raiseQuote: n(raise),
            raiseUsd: this.usd(raise),
            totalSupply: supply,
            curveSupplyPct: (sold / supply) * 100,
            priceMultiple: n(grad.div(start)),
        }
    }

    /**
     * Fill the curve to graduation with `steps` equal buys executed `atSecond`
     * seconds after activation (fee scheduler is time based). Dynamic
     * (volatility) fees are not modelled, so fees are a lower bound.
     */
    fill({
        steps = 100,
        atSecond = Number.MAX_SAFE_INTEGER,
        hasReferral = false,
    }: { steps?: number; atSecond?: number; hasReferral?: boolean } = {}): FillResult {
        const pool = this.clonePool()
        const state = pool.poolState
        const threshold = this.config.migrationQuoteThreshold
        // grossed up so fee-on-input buys still reach the threshold
        const chunk = threshold.muln(2).divn(steps).addn(1)
        const now = new BN(atSecond)
        const fees = { partner: 0, creator: 0, protocol: 0, referral: 0 }
        const creatorPct = this.config.creatorTradingFeePercentage
        let sold = new BN(0)
        const points: CurvePoint[] = [this.point(state.sqrtPrice, state.quoteReserve, sold)]

        for (let i = 0; i < steps * 4 && state.quoteReserve.lt(threshold); i++) {
            const q = swapQuotePartialFill(pool, this.config, false, chunk, 0, hasReferral, now, false)
            // fees are charged in base when collecting in the output token on buys
            const feePrice =
                this.config.collectFeeMode === CollectFeeMode.OutputToken
                    ? this.price(q.nextSqrtPrice)
                    : new Decimal(1)
            const feeDec = this.config.collectFeeMode === CollectFeeMode.OutputToken ? this.baseDec : this.quoteDec
            const toUsd = (a: BN) => this.usd(fromAtoms(a, feeDec).mul(feePrice))
            const trading = toUsd(q.tradingFee)
            fees.creator += (trading * creatorPct) / 100
            fees.partner += trading - (trading * creatorPct) / 100
            fees.protocol += toUsd(q.protocolFee)
            fees.referral += toUsd(q.referralFee)

            state.quoteReserve = state.quoteReserve.add(q.excludedFeeInputAmount)
            state.sqrtPrice = q.nextSqrtPrice
            sold = sold.add(q.outputAmount)
            if (this.config.collectFeeMode === CollectFeeMode.OutputToken) {
                sold = sold.add(q.tradingFee).add(q.protocolFee).add(q.referralFee)
            }
            points.push(this.point(state.sqrtPrice, state.quoteReserve, sold))
        }

        return { points, fees, graduated: state.quoteReserve.gte(threshold) }
    }

    /** What a single buy of `buyUsd` pays in fees at various seconds after launch. */
    sniperTable(buyUsd: number, seconds: number[]) {
        const amountIn = toAtoms(
            new Decimal(buyUsd).div(this.usdPrice),
            this.quoteDec
        )
        const start = this.price(this.config.sqrtStartPrice)
        return seconds.map((t) => {
            const q = swapQuotePartialFill(this.clonePool(), this.config, false, amountIn, 0, false, new BN(t), false)
            const paid = fromAtoms(q.includedFeeInputAmount, this.quoteDec)
            const fee = q.tradingFee.add(q.protocolFee).add(q.referralFee)
            const tokens = fromAtoms(q.outputAmount, this.baseDec)
            return {
                second: t,
                feeBps: n(new Decimal(fee.toString()).div(q.includedFeeInputAmount.toString()).mul(10_000)),
                tokens: n(tokens),
                avgPriceVsStart: tokens.isZero() ? 0 : n(paid.div(tokens).div(start)),
            }
        })
    }

    /**
     * Quote a buy against a fresh pool, in atoms. `firstSwapMinFee` models the
     * creator's buy bundled into pool creation (min fee when the config allows it).
     */
    quoteBuy(amountIn: BN, { firstSwapMinFee = false, atSecond = 0 } = {}) {
        const q = swapQuotePartialFill(this.clonePool(), this.config, false, amountIn, 0, false, new BN(atSecond), firstSwapMinFee)
        const fee = q.tradingFee.add(q.protocolFee).add(q.referralFee)
        return {
            outputAmount: q.outputAmount,
            feeBps: q.includedFeeInputAmount.isZero()
                ? 0
                : n(new Decimal(fee.toString()).div(q.includedFeeInputAmount.toString()).mul(10_000)),
            /** Quote left unspent when the buy would overshoot graduation. */
            amountLeft: q.amountLeft,
        }
    }

    private point(sqrtPrice: BN, quoteReserve: BN, sold: BN): CurvePoint {
        const p = this.price(sqrtPrice)
        return {
            quoteRaised: n(fromAtoms(quoteReserve, this.quoteDec)),
            priceQuote: n(p),
            priceUsd: this.usd(p),
            mcapUsd: this.usd(p.mul(this.totalSupply)),
            progress: Math.min(
                1,
                n(new Decimal(quoteReserve.toString()).div(this.config.migrationQuoteThreshold.toString()))
            ),
            tokensSold: n(fromAtoms(sold, this.baseDec)),
        }
    }
}
