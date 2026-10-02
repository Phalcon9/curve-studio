import type { ReactNode } from 'react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'

export const inputCls = 'w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent'
export const primaryBtn = 'h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-40'
export const secondaryBtn = 'h-9 rounded-lg border border-line bg-surface-2 px-3 text-sm text-ink hover:border-ink-2/40 disabled:cursor-not-allowed disabled:opacity-40'

export function Card({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: ReactNode; children: ReactNode }) {
    return (
        <section className="rounded-xl border border-line bg-surface p-4">
            <div className="mb-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className="text-sm font-semibold text-ink">{title}</h2>
                    {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
                </div>
                {action}
            </div>
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

export function WalletButton() {
    return (
        <WalletMultiButton
            style={{ height: 36, fontSize: 14, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
        />
    )
}

export function ErrorNote({ title, children }: { title: string; children?: ReactNode }) {
    return (
        <div className="rounded-xl border border-line bg-surface p-4 text-sm">
            <div className="font-medium text-critical">✕ {title}</div>
            {children && <div className="mt-1 text-ink-2">{children}</div>}
        </div>
    )
}

export function Badge({ children }: { children: ReactNode }) {
    return <span className="rounded bg-surface-2 px-1.5 py-0.5 text-[11px] text-ink-2">{children}</span>
}

export function Progress({ value, label }: { value: number; label: string }) {
    return (
        <div className="flex items-center gap-2">
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                <div className="h-full rounded-full" style={{ width: `${Math.min(1, value) * 100}%`, background: 'var(--series-1)' }} />
            </div>
            <span className="tnum w-24 whitespace-nowrap text-right text-ink-2">{label}</span>
        </div>
    )
}
