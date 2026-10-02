import { StudioPage } from './components/StudioPage'
import { LaunchPage } from './components/LaunchPage'
import { navigate, useRoute } from './lib/route'
import type { Cluster } from './lib/cluster'

export default function App({ cluster, onClusterChange }: { cluster: Cluster; onClusterChange: (c: Cluster) => void }) {
    const route = useRoute()

    const tab = (active: boolean) =>
        `rounded-md px-3 py-1 ${active ? 'bg-surface-2 font-medium text-ink' : 'text-muted hover:text-ink-2'}`

    return (
        <div className="mx-auto max-w-7xl px-4 pb-16 pt-6">
            <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-semibold text-ink">Curve Studio</h1>
                    <p className="text-sm text-ink-2">
                        {route.view === 'studio'
                            ? 'Design, simulate and publish Meteora DBC launch configs, and earn on every token launched with yours.'
                            : 'Launch a token on a published preset. Economics are read straight from the on-chain config.'}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <nav className="flex rounded-lg border border-line bg-surface p-0.5 text-sm" aria-label="Pages">
                        <button className={tab(route.view === 'studio')} aria-current={route.view === 'studio'} onClick={() => navigate({ view: 'studio' }, cluster)}>
                            Design
                        </button>
                        <button
                            className={tab(route.view === 'launch')}
                            aria-current={route.view === 'launch'}
                            onClick={() => navigate({ view: 'launch', config: route.view === 'launch' ? route.config : '' }, cluster)}
                        >
                            Launch
                        </button>
                    </nav>
                    <div className="flex rounded-lg border border-line bg-surface p-0.5 text-sm" role="radiogroup" aria-label="Network">
                        {(['devnet', 'mainnet-beta'] as const).map((c) => (
                            <button key={c} role="radio" aria-checked={cluster === c} onClick={() => onClusterChange(c)} className={tab(cluster === c)}>
                                {c === 'devnet' ? 'Devnet' : 'Mainnet'}
                            </button>
                        ))}
                    </div>
                </div>
            </header>

            {route.view === 'studio' ? <StudioPage cluster={cluster} /> : <LaunchPage key={route.config} initialConfig={route.config} cluster={cluster} />}
        </div>
    )
}
