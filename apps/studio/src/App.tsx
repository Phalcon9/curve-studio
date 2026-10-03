import { StudioPage } from './components/StudioPage'
import { LaunchPage } from './components/LaunchPage'
import { MarketplacePage } from './components/MarketplacePage'
import { EarningsPage } from './components/EarningsPage'
import { TokenPage } from './components/TokenPage'
import { navigate, useRoute, type Route } from './lib/route'
import type { Cluster } from './lib/cluster'

const TABS: { label: string; route: Route; active: (r: Route) => boolean }[] = [
    { label: 'Design', route: { view: 'studio' }, active: (r) => r.view === 'studio' },
    { label: 'Marketplace', route: { view: 'market' }, active: (r) => r.view === 'market' },
    { label: 'Launch', route: { view: 'launch', config: '' }, active: (r) => r.view === 'launch' || r.view === 'token' },
    { label: 'Earnings', route: { view: 'earnings' }, active: (r) => r.view === 'earnings' },
]

const SUBTITLE: Record<Route['view'], string> = {
    studio: 'Design, simulate and publish Meteora DBC launch configs, and earn on every token launched with yours.',
    market: 'Presets anyone published through Curve Studio, read straight from chain. Launch a token on one in a click.',
    launch: 'Launch a token on a published preset. Economics are read straight from the on-chain config.',
    token: 'Trade a token on its bonding curve until it graduates to a DAMM v2 pool.',
    earnings: 'Fees owed to you as a preset author or token creator, claimable straight from the pools.',
}

export default function App({ cluster, onClusterChange }: { cluster: Cluster; onClusterChange: (c: Cluster) => void }) {
    const route = useRoute()

    const tab = (active: boolean) =>
        `rounded-lg px-3 py-1.5 font-medium transition ${active ? 'brand-bg text-white shadow-[0_6px_20px_-8px_var(--glow)]' : 'text-muted hover:bg-white/5 hover:text-ink'}`
    const net = (c: Cluster) =>
        `flex items-center gap-1.5 rounded-lg px-3 py-1.5 font-medium transition ${
            cluster === c ? (c === 'devnet' ? 'bg-amber-400/15 text-amber-200' : 'bg-emerald-400/15 text-emerald-200') : 'text-muted hover:bg-white/5 hover:text-ink'
        }`

    return (
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-6">
            <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
                {/* a basis instead of the subtitle's full width lets the subtitle wrap so the nav stays on the right */}
                <div className="flex min-w-0 flex-1 basis-96 items-center gap-3">
                    <Logo />
                    <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                            <h1 className="brand-text font-display text-2xl font-bold tracking-tight">Curve Studio</h1>
                            <span className="chip">on Meteora DBC</span>
                        </div>
                        <p className="text-sm text-ink-2">{SUBTITLE[route.view]}</p>
                    </div>
                </div>
                <div className="flex flex-wrap gap-2">
                    <nav className="glass flex flex-wrap gap-0.5 rounded-xl border border-line p-1 text-sm" aria-label="Pages">
                        {TABS.map((t) => (
                            <button key={t.label} className={tab(t.active(route))} aria-current={t.active(route)} onClick={() => navigate(t.route, cluster)}>
                                {t.label}
                            </button>
                        ))}
                    </nav>
                    <div className="glass flex gap-0.5 rounded-xl border border-line p-1 text-sm" role="radiogroup" aria-label="Network">
                        {(['devnet', 'mainnet-beta'] as const).map((c) => (
                            <button
                                key={c}
                                role="radio"
                                aria-checked={cluster === c}
                                onClick={() => {
                                    onClusterChange(c)
                                    navigate(route, c)
                                }}
                                className={net(c)}
                            >
                                <span
                                    className={`size-1.5 rounded-full ${cluster === c ? 'shadow-[0_0_8px_currentColor]' : 'opacity-50'}`}
                                    style={{ background: c === 'devnet' ? 'var(--series-4)' : 'var(--good)' }}
                                    aria-hidden
                                />
                                {c === 'devnet' ? 'Devnet' : 'Mainnet'}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            {route.view === 'studio' && <StudioPage cluster={cluster} />}
            {route.view === 'market' && <MarketplacePage cluster={cluster} />}
            {route.view === 'launch' && <LaunchPage key={route.config} initialConfig={route.config} cluster={cluster} />}
            {route.view === 'token' && <TokenPage key={route.pool} address={route.pool} cluster={cluster} />}
            {route.view === 'earnings' && <EarningsPage key={route.wallet} cluster={cluster} viewing={route.wallet} />}
        </div>
    )
}

function Logo() {
    return (
        <div className="brand-bg grid size-11 shrink-0 place-items-center rounded-2xl shadow-[0_8px_28px_-6px_var(--glow)]" aria-hidden>
            <svg viewBox="0 0 32 32" className="size-6">
                <path d="M5 26C13 26 18 20 27 5" stroke="white" strokeWidth={3.5} fill="none" strokeLinecap="round" />
                <circle cx="27" cy="5" r="2.6" fill="white" />
            </svg>
        </div>
    )
}
