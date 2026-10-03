import { useState } from 'react'
import { usd } from '../lib/format'

type Slice = { key: string; label: string; value: number; color: string }

/**
 * Where trading fees go for a given volume. Horizontal stacked bar with a
 * 2px surface gap between segments, plus a value table (the light-mode
 * palette has sub-3:1 slots, so values are always shown as text).
 */
export function FeeSplit({ volumeUsd, feeBps, creatorPct, hasReferral }: { volumeUsd: number; feeBps: number; creatorPct: number; hasReferral: boolean }) {
    const [hover, setHover] = useState<string | null>(null)
    const total = (volumeUsd * feeBps) / 10_000
    const trading = total * 0.8
    const protocol = total * 0.2
    const referral = hasReferral ? protocol * 0.2 : 0
    const slices: Slice[] = [
        { key: 'author', label: 'You (preset author)', value: trading * (1 - creatorPct / 100), color: 'var(--series-1)' },
        { key: 'creator', label: 'Token creator', value: trading * (creatorPct / 100), color: 'var(--series-2)' },
        { key: 'protocol', label: 'Meteora protocol', value: protocol - referral, color: 'var(--series-3)' },
        { key: 'referral', label: 'Referrer (swap UI)', value: referral, color: 'var(--series-4)' },
    ].filter((s) => s.value > 0)

    return (
        <div className="space-y-3">
            <div className="flex h-6 w-full gap-[3px]" role="img" aria-label="Trading fee split">
                {slices.map((s, i) => (
                    <div
                        key={s.key}
                        onPointerEnter={() => setHover(s.key)}
                        onPointerLeave={() => setHover(null)}
                        style={{
                            width: `${(s.value / total) * 100}%`,
                            background: s.color,
                            opacity: hover && hover !== s.key ? 0.55 : 1,
                            borderRadius: `${i === 0 ? 8 : 2}px ${i === slices.length - 1 ? 8 : 2}px ${i === slices.length - 1 ? 8 : 2}px ${i === 0 ? 8 : 2}px`,
                            boxShadow: `0 0 14px -4px ${s.color}`,
                        }}
                        title={`${s.label}: ${usd(s.value)}`}
                    />
                ))}
            </div>
            <table className="w-full text-sm">
                <tbody>
                    {slices.map((s) => (
                        <tr key={s.key} className={hover === s.key ? 'bg-surface-2' : ''}>
                            <td className="py-0.5">
                                <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: s.color, boxShadow: `0 0 8px ${s.color}` }} />
                                <span className="text-ink-2">{s.label}</span>
                            </td>
                            <td className="tnum py-0.5 text-right text-muted">{((s.value / total) * 100).toFixed(0)}%</td>
                            <td className="tnum py-0.5 pl-3 text-right font-medium text-ink">{usd(s.value)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}
