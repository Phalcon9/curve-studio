import { describe, expect, test } from 'vitest'
import {
    BUILTIN_PRESETS,
    compilePreset,
    CurveSim,
    getPreset,
    SOL,
    TSLAX,
    toAtoms,
    USDC,
    type QuoteContext,
} from '../src'

const QUOTES: QuoteContext[] = [SOL, USDC, TSLAX]

describe('built-in presets compile and graduate on every quote', () => {
    for (const preset of BUILTIN_PRESETS) {
        for (const quote of QUOTES) {
            test(`${preset.id} / ${quote.symbol}`, () => {
                const sim = CurveSim.fromCompiled(compilePreset(preset, quote))
                const fill = sim.fill({ steps: 50 })
                expect(fill.graduated).toBe(true)

                const prices = fill.points.map((p) => p.priceQuote)
                for (let i = 1; i < prices.length; i++) {
                    expect(prices[i]).toBeGreaterThanOrEqual(prices[i - 1])
                }
            })
        }
    }
})

describe('USD targets are quote-independent', () => {
    test('classic preset lands on the same USD market caps for SOL and TSLAx', () => {
        const spec = getPreset('classic-meme')
        const a = CurveSim.fromCompiled(compilePreset(spec, SOL)).summary()
        const b = CurveSim.fromCompiled(compilePreset(spec, TSLAX)).summary()
        expect(a.startMcapUsd).toBeCloseTo(5_000, -1)
        expect(a.gradMcapUsd / 70_000).toBeCloseTo(1, 1)
        expect(b.startMcapUsd / a.startMcapUsd).toBeCloseTo(1, 2)
        expect(b.gradMcapUsd / a.gradMcapUsd).toBeCloseTo(1, 2)
    })
})

describe('navBand', () => {
    test('stays within the band and raises roughly the target', () => {
        const spec = getPreset('nav-issuance')
        const sim = CurveSim.fromCompiled(compilePreset(spec, USDC))
        const s = sim.summary()
        expect(s.startPriceUsd).toBeCloseTo(0.995, 3)
        expect(s.gradPriceUsd).toBeLessThanOrEqual(1.005 + 1e-6)
        expect(s.raiseUsd / 250_000).toBeGreaterThan(0.9)
        expect(s.raiseUsd / 250_000).toBeLessThan(1.1)
    })
})

describe('fee scheduler', () => {
    test('snipers pay far more at t=0 than after the decay window', () => {
        const sim = CurveSim.fromCompiled(compilePreset(getPreset('classic-meme'), SOL))
        const [t0, , late] = sim.sniperTable(500, [0, 60, 600])
        expect(t0.feeBps).toBeGreaterThan(4000)
        expect(late.feeBps).toBeLessThan(150)
        expect(t0.tokens).toBeLessThan(late.tokens)
    })

    test('fee split: author gets (80% - creator share), referral is carved from protocol', () => {
        const sim = CurveSim.fromCompiled(compilePreset(getPreset('classic-meme'), SOL))
        const { fees } = sim.fill({ steps: 40, hasReferral: true })
        const total = fees.partner + fees.creator + fees.protocol + fees.referral
        expect(fees.partner / total).toBeCloseTo(0.4, 2)
        expect(fees.creator / total).toBeCloseTo(0.4, 2)
        expect(fees.referral / total).toBeCloseTo(0.04, 2)
        expect(fees.protocol / total).toBeCloseTo(0.16, 2)
    })
})

describe('creator first buy', () => {
    test('bundled first buy pays the minimum fee, not the anti-sniper fee', () => {
        const sim = CurveSim.fromCompiled(compilePreset(getPreset('classic-meme'), SOL))
        const oneSol = toAtoms(1, 9)
        const bundled = sim.quoteBuy(oneSol, { firstSwapMinFee: true })
        const sniped = sim.quoteBuy(oneSol)
        expect(bundled.feeBps).toBeLessThan(150)
        expect(sniped.feeBps).toBeGreaterThan(4000)
        expect(bundled.outputAmount.gt(sniped.outputAmount)).toBe(true)
    })
})
