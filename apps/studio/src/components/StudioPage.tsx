import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import {
    BUILTIN_PRESETS,
    compilePreset,
    CurveSim,
    KNOWN_QUOTES,
    withUsdPrice,
    type CompiledPreset,
    type PresetSpec,
} from '@curve-studio/core'
import { Editor } from './Editor'
import { LineChart } from './LineChart'
import { FeeSplit } from './FeeSplit'
import { DeployPanel } from './DeployPanel'
import { Card, Stat } from './ui'
import { fetchUsdPrices } from '../lib/prices'
import { bps, duration, num, pct, usd } from '../lib/format'
import type { Cluster } from '../lib/cluster'

const CATEGORY_LABEL: Record<PresetSpec['category'], string> = {
    meme: 'Meme',
    stock: 'Stocks',
    icm: 'ICM',
    rwa: 'RWA',
    ai: 'AI',
}

function preferredQuote(spec: PresetSpec) {
    return spec.recommendedQuotes[0] ?? 'SOL'
}

export function StudioPage({ cluster }: { cluster: Cluster }) {
    const [spec, setSpec] = useState<PresetSpec>(BUILTIN_PRESETS[0])
    const [quoteSymbol, setQuoteSymbol] = useState(preferredQuote(BUILTIN_PRESETS[0]))
    const [prices, setPrices] = useState<Record<string, number>>(() =>
        Object.fromEntries(KNOWN_QUOTES.map((q) => [q.symbol, q.usdPrice]))
    )
    const [live, setLive] = useState<Record<string, boolean>>({})
    const [volumeMultiple, setVolumeMultiple] = useState(5)

    useEffect(() => {
        fetchUsdPrices(KNOWN_QUOTES).then((byMint) => {
            const next: Record<string, number> = {}
            const liveNext: Record<string, boolean> = {}
            for (const q of KNOWN_QUOTES) {
                if (byMint[q.mint]) {
                    next[q.symbol] = +byMint[q.mint].toFixed(2)
                    liveNext[q.symbol] = true
                }
            }
            setPrices((p) => ({ ...p, ...next }))
            setLive(liveNext)
        })
    }, [])

    const deferredSpec = useDeferredValue(spec)
    const quote = KNOWN_QUOTES.find((q) => q.symbol === quoteSymbol)!
    const usdPrice = prices[quoteSymbol]

    const result = useMemo(() => {
        try {
            const compiled: CompiledPreset = compilePreset(deferredSpec, withUsdPrice(quote, usdPrice))
            const sim = CurveSim.fromCompiled(compiled)
            const summary = sim.summary()
            const fill = sim.fill({ steps: 80 })
            const window = Math.max(deferredSpec.fee.durationSec, 1)
            const seconds = Array.from({ length: 41 }, (_, i) => Math.round((i / 40) * window * 1.25))
            const sniper = sim.sniperTable(500, seconds)
            return { ok: true as const, compiled, summary, fill, sniper }
        } catch (e) {
            return { ok: false as const, error: e instanceof Error ? e.message : String(e) }
        }
    }, [deferredSpec, quote, usdPrice])

    const loadPreset = (p: PresetSpec) => {
        setSpec(p)
        setQuoteSymbol(preferredQuote(p))
    }

    return (
        <div>

            <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
                {BUILTIN_PRESETS.map((p) => {
                    const active = p.id === spec.id
                    return (
                        <button
                            key={p.id}
                            onClick={() => loadPreset(p)}
                            aria-pressed={active}
                            className={`rounded-xl border bg-surface p-3 text-left transition-colors ${active ? 'border-accent' : 'border-line hover:border-ink-2/40'}`}
                        >
                            <div className="flex items-center justify-between gap-2">
                                <span className="font-medium text-ink">{p.name}</span>
                                <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">{CATEGORY_LABEL[p.category]}</span>
                            </div>
                            <p className="mt-1 text-xs leading-snug text-ink-2">{p.tagline}</p>
                        </button>
                    )
                })}
            </div>

            <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
                <aside className="h-fit rounded-xl border border-line bg-surface p-4 lg:sticky lg:top-4">
                    <Editor
                        spec={spec}
                        onChange={setSpec}
                        quotes={KNOWN_QUOTES}
                        quoteSymbol={quoteSymbol}
                        onQuoteChange={setQuoteSymbol}
                        usdPrice={usdPrice}
                        onUsdPriceChange={(v) => setPrices((p) => ({ ...p, [quoteSymbol]: v }))}
                        livePrice={!!live[quoteSymbol]}
                    />
                </aside>

                <main className="min-w-0 space-y-4">
                    {!result.ok ? (
                        <div className="rounded-xl border border-critical/40 bg-surface p-4 text-sm">
                            <div className="font-medium text-critical">✕ This configuration would be rejected on-chain</div>
                            <p className="mt-1 text-ink-2">{result.error}</p>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                                <Stat label="Start market cap" value={usd(result.summary.startMcapUsd)} sub={`${usd(result.summary.startPriceUsd)} / token`} />
                                <Stat label="Graduates at" value={usd(result.summary.gradMcapUsd)} sub={`${result.summary.priceMultiple.toFixed(1)}× start price`} />
                                <Stat label="Raise to graduate" value={`${num(result.summary.raiseQuote)} ${quoteSymbol}`} sub={`≈ ${usd(result.summary.raiseUsd)}`} />
                                <Stat label="Sold on the curve" value={pct(result.summary.curveSupplyPct, 1)} sub={`of ${num(result.summary.totalSupply)} tokens`} />
                            </div>

                            <Card title="Market cap as the curve fills" subtitle={`Simulated with the Meteora SDK's swap math, quoted in ${quoteSymbol}`}>
                                <LineChart
                                    title="Market cap versus progress to graduation"
                                    data={result.fill.points.map((p) => ({ x: p.progress * 100, y: p.mcapUsd }))}
                                    xFormat={(v) => `${v.toFixed(0)}%`}
                                    yFormat={usd}
                                    xLabel="Progress to graduation"
                                />
                            </Card>

                            <div className="grid gap-4 xl:grid-cols-2">
                                <Card title="Fee on a $500 buy" subtitle="Anti-sniper decay after launch; dynamic volatility fees come on top">
                                    <LineChart
                                        title="Fee in basis points on a $500 buy over time since launch"
                                        data={result.sniper.map((r) => ({ x: r.second, y: r.feeBps }))}
                                        xFormat={duration}
                                        yFormat={bps}
                                        xLabel="Time since launch"
                                        height={200}
                                        markerX={{ x: spec.fee.durationSec, label: 'decay ends' }}
                                    />
                                </Card>

                                <Card
                                    title="Where trading fees go"
                                    subtitle={`At the post-decay fee, for ${volumeMultiple}× the raise in volume (${usd(result.summary.raiseUsd * volumeMultiple)})`}
                                >
                                    <FeeSplit
                                        volumeUsd={result.summary.raiseUsd * volumeMultiple}
                                        feeBps={spec.fee.endBps}
                                        creatorPct={spec.fee.creatorSharePct}
                                        hasReferral
                                    />
                                    <label className="mt-3 flex items-center gap-2 text-xs text-muted">
                                        Volume
                                        <input
                                            type="range"
                                            min={1}
                                            max={50}
                                            value={volumeMultiple}
                                            onChange={(e) => setVolumeMultiple(e.target.valueAsNumber)}
                                            className="flex-1 accent-[var(--accent)]"
                                        />
                                        <span className="tnum w-8 text-right">{volumeMultiple}×</span>
                                    </label>
                                    <p className="mt-2 text-xs text-muted">Plus {spec.fee.poolCreationFeeSol} SOL to you for each token launched on this config.</p>
                                </Card>
                            </div>

                            <Card title="Publish this preset" subtitle={result.compiled.quote.requiresBadge ? `${quoteSymbol} is a Token-2022 stock; Meteora has approved it (token badge) for DBC and DAMM v2.` : undefined}>
                                <DeployPanel compiled={result.compiled} cluster={cluster} />
                            </Card>
                        </>
                    )}
                </main>
            </div>
        </div>
    )
}
