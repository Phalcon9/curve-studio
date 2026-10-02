// Print launch economics for every built-in preset across a few quotes.
import { BUILTIN_PRESETS, compilePreset, CurveSim, SOL, TSLAX, USDC } from '../src'

const fmt = (x: number) => (x >= 1 ? Math.round(x).toLocaleString('en-US') : x.toPrecision(3))

for (const preset of BUILTIN_PRESETS) {
    for (const quote of [SOL, USDC, TSLAX]) {
        const sim = CurveSim.fromCompiled(compilePreset(preset, quote))
        const s = sim.summary()
        const snipe = sim.sniperTable(500, [0, 30, 600]).map((r) => Math.round(r.feeBps))
        console.log(
            `${preset.id.padEnd(13)} ${quote.symbol.padEnd(5)}` +
                ` mcap $${fmt(s.startMcapUsd)} → $${fmt(s.gradMcapUsd)} (x${s.priceMultiple.toFixed(1)})` +
                ` | raise ${fmt(s.raiseQuote)} ${quote.symbol} ≈ $${fmt(s.raiseUsd)}` +
                ` | ${s.curveSupplyPct.toFixed(1)}% sold on curve` +
                ` | $500 buy fee @0s/30s/10m: ${snipe.join('/')} bps`
        )
    }
}
