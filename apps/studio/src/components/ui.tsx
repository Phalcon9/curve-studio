import type { ReactNode } from 'react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { hue } from '../lib/theme'

export const inputCls =
    'w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25'
export const primaryBtn = 'brand-btn h-9 rounded-xl px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40'
export const secondaryBtn =
    'h-9 rounded-xl border border-line bg-surface-2 px-3 text-sm font-medium text-ink transition hover:border-accent/60 hover:bg-accent/10 disabled:cursor-not-allowed disabled:opacity-40'

export function Card({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
    return (
        <section className="glass rounded-2xl border border-line p-5">
            <div className="mb-4 flex items-start justify-between gap-3">
                <div className="flex min-w-0 gap-2.5">
                    <span className="brand-bg mt-1 h-3.5 w-1 shrink-0 rounded-full" aria-hidden />
                    <div className="min-w-0">
                        <h2 className="font-display text-[15px] font-semibold text-ink">{title}</h2>
                        {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
                    </div>
                </div>
                {action}
            </div>
            {children}
        </section>
    )
}

export function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
    return (
        <div className="stat rounded-2xl px-4 py-3">
            <div className="stat-label text-xs font-medium">{label}</div>
            <div className="tnum mt-1 font-display text-2xl font-bold tracking-tight text-ink">{value}</div>
            {sub && <div className="text-xs text-ink-2">{sub}</div>}
        </div>
    )
}

export function WalletButton() {
    // the adapter replaces any className on its button, so style it through a wrapper
    return (
        <span className="studio-wallet inline-flex">
            <WalletMultiButton />
        </span>
    )
}

export function ErrorNote({ title, children }: { title: string; children?: ReactNode }) {
    return (
        <div className="glass rounded-2xl border border-critical/40 p-4 text-sm">
            <div className="font-medium text-critical">✕ {title}</div>
            {children && <div className="mt-1 text-ink-2">{children}</div>}
        </div>
    )
}

export function Badge({ children, tone }: { children: ReactNode; tone?: string }) {
    return (
        <span className="chip" style={tone ? hue(tone) : undefined}>
            {children}
        </span>
    )
}

export function Progress({ value, label }: { value: number; label: string }) {
    return (
        <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div className="brand-bg h-full rounded-full shadow-[0_0_8px_var(--glow)]" style={{ width: `${Math.min(1, value) * 100}%` }} />
            </div>
            <span className="tnum w-24 whitespace-nowrap text-right text-ink-2">{label}</span>
        </div>
    )
}
