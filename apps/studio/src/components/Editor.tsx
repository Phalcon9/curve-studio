import type { ReactNode } from 'react'
import type { CurveSpec, PresetSpec, QuoteContext } from '@curve-studio/core'

type Props = {
    spec: PresetSpec
    onChange: (spec: PresetSpec) => void
    quotes: QuoteContext[]
    quoteSymbol: string
    onQuoteChange: (symbol: string) => void
    usdPrice: number
    onUsdPriceChange: (price: number) => void
    livePrice: boolean
}

function Section({ title, children }: { title: string; children: ReactNode }) {
    return (
        <fieldset className="space-y-2.5 border-t border-line pt-3 first:border-t-0 first:pt-0">
            <legend className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted">{title}</legend>
            {children}
        </fieldset>
    )
}

function Num({
    label,
    value,
    onChange,
    suffix,
    step = 'any',
    hint,
}: {
    label: string
    value: number
    onChange: (v: number) => void
    suffix?: string
    step?: number | 'any'
    hint?: string
}) {
    return (
        <label className="grid grid-cols-[1fr_8.5rem] items-center gap-2 text-sm">
            <span className="text-ink-2" title={hint}>
                {label}
            </span>
            <span className="flex items-center rounded-md border border-line bg-surface focus-within:border-accent">
                <input
                    type="number"
                    step={step}
                    value={Number.isFinite(value) ? value : ''}
                    onChange={(e) => onChange(e.target.valueAsNumber)}
                    className="tnum w-full min-w-0 bg-transparent px-2 py-1 text-right text-ink outline-none"
                />
                {suffix && <span className="pr-2 text-xs text-muted">{suffix}</span>}
            </span>
        </label>
    )
}

function Select<T extends string>({
    label,
    value,
    options,
    onChange,
}: {
    label: string
    value: T
    options: { value: T; label: string }[]
    onChange: (v: T) => void
}) {
    return (
        <label className="grid grid-cols-[1fr_8.5rem] items-center gap-2 text-sm">
            <span className="text-ink-2">{label}</span>
            <select
                value={value}
                onChange={(e) => onChange(e.target.value as T)}
                className="rounded-md border border-line bg-surface px-2 py-1 text-ink outline-none focus:border-accent"
            >
                {options.map((o) => (
                    <option key={o.value} value={o.value}>
                        {o.label}
                    </option>
                ))}
            </select>
        </label>
    )
}

function CurveFields({ curve, set }: { curve: CurveSpec; set: (c: CurveSpec) => void }) {
    switch (curve.kind) {
        case 'marketCap':
        case 'twoSegment':
        case 'weights':
            return (
                <>
                    <Num label="Start market cap" suffix="USD" value={curve.startMcapUsd} onChange={(v) => set({ ...curve, startMcapUsd: v })} />
                    <Num label="Graduation market cap" suffix="USD" value={curve.gradMcapUsd} onChange={(v) => set({ ...curve, gradMcapUsd: v })} />
                    {curve.kind === 'twoSegment' && (
                        <Num
                            label="Supply to DAMM v2"
                            suffix="%"
                            value={curve.pctSupplyOnMigration}
                            onChange={(v) => set({ ...curve, pctSupplyOnMigration: v })}
                            hint="Share of supply that seeds the DAMM v2 pool at graduation"
                        />
                    )}
                    {curve.kind === 'weights' && (
                        <p className="text-xs text-muted">{curve.weights.length} liquidity-weighted segments</p>
                    )}
                </>
            )
        case 'navBand':
            return (
                <>
                    <Num label="Reference price (NAV)" suffix="USD" value={curve.refPriceUsd} onChange={(v) => set({ ...curve, refPriceUsd: v })} />
                    <Num label="Band" suffix="bps" step={1} value={curve.bandBps} onChange={(v) => set({ ...curve, bandBps: v })} hint="Curve spans NAV ± band" />
                    <Num label="Target raise" suffix="USD" value={curve.targetRaiseUsd} onChange={(v) => set({ ...curve, targetRaiseUsd: v })} />
                </>
            )
        case 'customPrices':
            return (
                <label className="block space-y-1 text-sm">
                    <span className="text-ink-2">Price checkpoints (USD, ascending)</span>
                    <input
                        key={curve.pricesUsd.join(',')}
                        defaultValue={curve.pricesUsd.join(', ')}
                        onBlur={(e) => {
                            const prices = e.target.value.split(',').map((s) => Number(s.trim())).filter((n) => n > 0)
                            if (prices.length >= 2) set({ ...curve, pricesUsd: prices, weights: curve.weights?.length === prices.length - 1 ? curve.weights : undefined })
                        }}
                        className="tnum w-full rounded-md border border-line bg-surface px-2 py-1 text-ink outline-none focus:border-accent"
                    />
                </label>
            )
    }
}

export function Editor({ spec, onChange, quotes, quoteSymbol, onQuoteChange, usdPrice, onUsdPriceChange, livePrice }: Props) {
    const set = <K extends keyof PresetSpec>(k: K, v: PresetSpec[K]) => onChange({ ...spec, [k]: v })
    const fee = spec.fee
    const mig = spec.migration
    const liq = spec.liquidity
    const liqTotal = liq.partnerLockedPct + liq.partnerPct + liq.creatorLockedPct + liq.creatorPct

    return (
        <div className="space-y-4">
            <Section title="Quote asset">
                <Select
                    label="Buy with"
                    value={quoteSymbol}
                    options={quotes.map((q) => ({ value: q.symbol, label: q.symbol }))}
                    onChange={onQuoteChange}
                />
                <Num label={`${quoteSymbol} price${livePrice ? ' (live)' : ''}`} suffix="USD" value={usdPrice} onChange={onUsdPriceChange} />
            </Section>

            <Section title="Curve">
                <CurveFields curve={spec.curve} set={(c) => set('curve', c)} />
                {spec.curve.kind !== 'navBand' && (
                    <Num label="Total supply" step={1} value={spec.supply.total} onChange={(v) => set('supply', { ...spec.supply, total: v })} />
                )}
            </Section>

            <Section title="Launch fees">
                <Select
                    label="Anti-sniper decay"
                    value={fee.schedule}
                    options={[
                        { value: 'exponential', label: 'Exponential' },
                        { value: 'linear', label: 'Linear' },
                    ]}
                    onChange={(v) => set('fee', { ...fee, schedule: v })}
                />
                <Num label="Fee at launch" suffix="bps" step={1} value={fee.startBps} onChange={(v) => set('fee', { ...fee, startBps: v })} />
                <Num label="Fee after decay" suffix="bps" step={1} value={fee.endBps} onChange={(v) => set('fee', { ...fee, endBps: v })} />
                <Num label="Decay window" suffix="sec" step={1} value={fee.durationSec} onChange={(v) => set('fee', { ...fee, durationSec: v })} />
                <Num label="Decay steps" step={1} value={fee.periods} onChange={(v) => set('fee', { ...fee, periods: v })} />
                <Num
                    label="Creator share"
                    suffix="%"
                    step={1}
                    value={fee.creatorSharePct}
                    onChange={(v) => set('fee', { ...fee, creatorSharePct: v })}
                    hint="Of the 80% post-protocol trading fee; the rest goes to you, the preset author"
                />
                <Num label="Launch fee (to you)" suffix="SOL" value={fee.poolCreationFeeSol} onChange={(v) => set('fee', { ...fee, poolCreationFeeSol: v })} />
            </Section>

            <Section title="After graduation (DAMM v2)">
                <Num label="Pool fee" suffix="bps" step={1} value={mig.poolFeeBps} onChange={(v) => set('migration', { ...mig, poolFeeBps: v })} />
                <Select
                    label="LP fees"
                    value={mig.collectIn}
                    options={[
                        { value: 'quote', label: 'Claim in quote' },
                        { value: 'output', label: 'Claim in output' },
                        { value: 'compounding', label: 'Compound into LP' },
                    ]}
                    onChange={(v) => set('migration', { ...mig, collectIn: v, compoundingFeeBps: v === 'compounding' ? (mig.compoundingFeeBps ?? 5000) : undefined })}
                />
                {mig.collectIn === 'compounding' && (
                    <Num
                        label="Compounded share"
                        suffix="bps"
                        step={1}
                        value={mig.compoundingFeeBps ?? 5000}
                        onChange={(v) => set('migration', { ...mig, compoundingFeeBps: v })}
                    />
                )}
                <Num label="Your LP, locked" suffix="%" step={1} value={liq.partnerLockedPct} onChange={(v) => set('liquidity', { ...liq, partnerLockedPct: v })} />
                <Num label="Your LP, unlocked" suffix="%" step={1} value={liq.partnerPct} onChange={(v) => set('liquidity', { ...liq, partnerPct: v })} />
                <Num label="Creator LP, locked" suffix="%" step={1} value={liq.creatorLockedPct} onChange={(v) => set('liquidity', { ...liq, creatorLockedPct: v })} />
                <Num label="Creator LP, unlocked" suffix="%" step={1} value={liq.creatorPct} onChange={(v) => set('liquidity', { ...liq, creatorPct: v })} />
                {liqTotal !== 100 && <p className="text-xs text-critical">LP shares add up to {liqTotal}% — they must total 100%.</p>}
            </Section>
        </div>
    )
}
