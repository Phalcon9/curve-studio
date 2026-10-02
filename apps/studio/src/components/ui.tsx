import type { ReactNode } from 'react'

export function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
    return (
        <section className="rounded-xl border border-line bg-surface p-4">
            <h2 className="text-sm font-semibold text-ink">{title}</h2>
            {subtitle && <p className="mb-3 text-xs text-muted">{subtitle}</p>}
            {!subtitle && <div className="mb-3" />}
            {children}
        </section>
    )
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="rounded-xl border border-line bg-surface px-4 py-3">
            <div className="text-xs text-muted">{label}</div>
            <div className="mt-0.5 text-xl font-semibold text-ink">{value}</div>
            {sub && <div className="text-xs text-ink-2">{sub}</div>}
        </div>
    )
}

export const short = (addr: string) => `${addr.slice(0, 4)}…${addr.slice(-4)}`
