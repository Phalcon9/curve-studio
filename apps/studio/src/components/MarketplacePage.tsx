import { useMemo, useRef, useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { CurveSim, fromAtoms, LISTING_LIMITS, type ListingMeta, type PresetCategory } from '@curve-studio/core'
import { Badge, Card, ErrorNote, WalletButton, inputCls, primaryBtn, secondaryBtn } from './ui'
import { CATEGORY_TONE, hue } from '../lib/theme'
import { assertOwnsConfig, buildListingTx, countLaunches, fetchMarket, type MarketEntry } from '../lib/market'
import { loadDeployments } from '../lib/deployments'
import { prepare, signAndSendAll, errorMessage } from '../lib/send'
import { dataOf, useAsync } from '../lib/useAsync'
import { navigate } from '../lib/route'
import { explorerAccount, explorerTx, type Cluster } from '../lib/cluster'
import { CATEGORY_LABEL, num, pct, short, usd } from '../lib/format'

const CATEGORIES = Object.keys(CATEGORY_LABEL) as PresetCategory[]

type ListStatus = { kind: 'idle' } | { kind: 'busy'; step: string } | { kind: 'done'; sig: string } | { kind: 'error'; message: string }

export function MarketplacePage({ cluster }: { cluster: Cluster }) {
    const { connection } = useConnection()
    const { publicKey } = useWallet()
    const force = useRef(false)
    const { state, reload } = useAsync(connection.rpcEndpoint, () => {
        const f = force.current
        force.current = false
        return fetchMarket(connection, cluster, { force: f })
    })
    const refresh = () => {
        force.current = true
        reload()
    }
    const [category, setCategory] = useState<PresetCategory | 'all'>('all')

    const entries = dataOf(state)
    const shown = (entries ?? []).filter((e) => category === 'all' || e.listing.category === category)
    const listed = new Set((entries ?? []).map((e) => e.listing.config))
    const wallet = publicKey?.toBase58()
    const unlisted = loadDeployments().filter((d) => d.cluster === cluster && d.author === wallet && entries && !listed.has(d.config))

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Category">
                    {(['all', ...CATEGORIES] as const).map((c) => (
                        <button
                            key={c}
                            role="radio"
                            aria-checked={category === c}
                            onClick={() => setCategory(c)}
                            className={
                                category === c
                                    ? c === 'all'
                                        ? 'brand-bg rounded-full px-3.5 py-1 text-xs font-semibold text-white shadow-[0_6px_20px_-8px_var(--glow)]'
                                        : 'chip px-3.5 py-1 text-xs font-semibold'
                                    : 'rounded-full border border-line bg-surface-2 px-3.5 py-1 text-xs text-ink-2 transition hover:border-accent/50 hover:text-ink'
                            }
                            style={c !== 'all' && category === c ? hue(CATEGORY_TONE[c]) : undefined}
                        >
                            {c === 'all' ? 'All' : CATEGORY_LABEL[c]}
                        </button>
                    ))}
                </div>
                <button className={secondaryBtn} onClick={refresh} disabled={state.kind === 'loading'}>
                    {state.kind === 'loading' ? 'Reading registry…' : 'Refresh'}
                </button>
            </div>

            {state.kind === 'error' && (
                <ErrorNote title={entries ? "Couldn't refresh the registry" : "Couldn't read the registry"}>
                    {state.message}
                    <p className="mt-1 text-xs text-muted">Public RPCs rate-limit; set VITE_{cluster === 'devnet' ? 'DEVNET' : 'MAINNET'}_RPC to a dedicated endpoint.</p>
                </ErrorNote>
            )}
            {state.kind === 'loading' && !entries && <p className="text-sm text-muted">Reading the preset registry from {cluster}…</p>}

            {entries && shown.length === 0 && (
                <div className="glass rounded-2xl border border-dashed border-accent/40 p-10 text-center text-sm text-ink-2">
                    {entries.length === 0 ? `No presets listed on ${cluster === 'devnet' ? 'devnet' : 'mainnet'} yet.` : 'No presets in this category yet.'}{' '}
                    <button className="font-medium text-accent underline" onClick={() => navigate({ view: 'studio' }, cluster)}>
                        Design and publish one
                    </button>
                </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {shown.map((e) => (
                    <PresetCard key={e.listing.config} entry={e} cluster={cluster} mine={e.listing.author === wallet} />
                ))}
            </div>

            {unlisted.length > 0 && (
                <Card title="Your presets that aren't listed yet" subtitle="Published from this browser before listing, or the listing transaction didn't land">
                    <ul className="divide-y divide-line text-sm">
                        {unlisted.map((d) => (
                            <li key={d.config} className="flex flex-wrap items-center justify-between gap-2 py-2">
                                <span>
                                    <span className="font-medium text-ink">{d.presetName}</span>
                                    <span className="ml-2 font-mono text-xs text-muted">{short(d.config)}</span>
                                </span>
                                <ListButton
                                    meta={{ config: d.config, name: d.spec.name, tagline: d.spec.tagline, category: d.spec.category, preset: d.spec.id }}
                                    onListed={refresh}
                                />
                            </li>
                        ))}
                    </ul>
                </Card>
            )}

            <ListExisting cluster={cluster} onListed={refresh} />
        </div>
    )
}

function PresetCard({ entry, cluster, mine }: { entry: MarketEntry; cluster: Cluster; mine: boolean }) {
    const { connection } = useConnection()
    const { listing, config, quote } = entry
    const launches = useAsync(listing.config, () => countLaunches(connection, new PublicKey(listing.config)))
    const priced = quote.usdPrice !== null
    const money = priced ? usd : (v: number) => `${num(v)} ${quote.symbol}`
    const summary = useMemo(() => {
        try {
            return CurveSim.fromOnChain(config, quote.decimals, quote.usdPrice ?? 1).summary()
        } catch {
            return null // a config shape the simulator doesn't model; the launch page explains it
        }
    }, [config, quote])

    return (
        <article className="tile glass flex flex-col rounded-2xl p-5" style={hue(CATEGORY_TONE[listing.category])}>
            <div className="flex items-start justify-between gap-2">
                <h2 className="font-display text-lg font-semibold text-ink">{listing.name}</h2>
                <div className="flex shrink-0 gap-1">
                    <Badge tone={CATEGORY_TONE[listing.category]}>{CATEGORY_LABEL[listing.category]}</Badge>
                    <Badge>{quote.symbol}</Badge>
                </div>
            </div>
            {listing.tagline && <p className="mt-1 text-xs leading-snug text-ink-2">{listing.tagline}</p>}

            <dl className="mt-4 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl border border-line bg-black/20 p-3 text-xs">
                <dt className="text-muted">Market cap</dt>
                <dd className="tnum text-right text-ink">{summary ? `${money(summary.startMcapUsd)} → ${money(summary.gradMcapUsd)}` : '–'}</dd>
                <dt className="text-muted">Raise to graduate</dt>
                <dd className="tnum text-right text-ink">{summary ? `${num(summary.raiseQuote)} ${quote.symbol}` : '–'}</dd>
                <dt className="text-muted">Creator keeps</dt>
                <dd className="tnum text-right text-ink">{pct(0.8 * config.creatorTradingFeePercentage)} of fees</dd>
                <dt className="text-muted">Launch fee</dt>
                <dd className="tnum text-right text-ink">{num(fromAtoms(config.poolCreationFee, 9).toNumber())} SOL</dd>
            </dl>

            <div className="mt-auto flex items-center justify-between gap-2 pt-4 text-xs">
                <span className="min-w-0 truncate text-muted">
                    by{' '}
                    <a className="text-ink-2 underline" href={explorerAccount(listing.author, cluster)} target="_blank" rel="noreferrer">
                        {entry.authorName ?? short(listing.author)}
                    </a>
                    {mine && <span className="ml-1 text-accent">(you)</span>}
                    {' · '}
                    {launches.state.kind === 'ready' ? `${launches.state.data} launched` : launches.state.kind === 'error' ? 'launches –' : '…'}
                </span>
                <button className={`${primaryBtn} h-8 shrink-0 px-3`} onClick={() => navigate({ view: 'launch', config: listing.config }, cluster)}>
                    Launch on this →
                </button>
            </div>
        </article>
    )
}

function useListAction(onListed: () => void) {
    const { connection } = useConnection()
    const wallet = useWallet()
    const [status, setStatus] = useState<ListStatus>({ kind: 'idle' })

    async function list(meta: ListingMeta) {
        const { publicKey, signTransaction, signAllTransactions } = wallet
        if (!publicKey || !signTransaction) return
        try {
            setStatus({ kind: 'busy', step: 'Checking ownership' })
            await assertOwnsConfig(connection, meta.config, publicKey)
            const tx = await buildListingTx(connection, publicKey, meta)
            await prepare(connection, [tx], publicKey)
            const [sig] = await signAndSendAll(connection, { signTransaction, signAllTransactions }, [tx], (step) => setStatus({ kind: 'busy', step }))
            setStatus({ kind: 'done', sig })
            onListed()
        } catch (e) {
            setStatus({ kind: 'error', message: errorMessage(e) })
        }
    }
    return { status, list, ready: !!wallet.publicKey }
}

function ListButton({ meta, onListed }: { meta: ListingMeta; onListed: () => void }) {
    const { status, list } = useListAction(onListed)
    return (
        <span className="flex items-center gap-2">
            {status.kind === 'error' && <span className="text-xs text-critical">✕ {status.message}</span>}
            <button className={secondaryBtn} disabled={status.kind === 'busy' || status.kind === 'done'} onClick={() => list(meta)}>
                {status.kind === 'busy' ? `${status.step}…` : status.kind === 'done' ? '✓ Listed' : 'List it'}
            </button>
        </span>
    )
}

function ListExisting({ cluster, onListed }: { cluster: Cluster; onListed: () => void }) {
    const { status, list, ready } = useListAction(onListed)
    const [config, setConfig] = useState('')
    const [name, setName] = useState('')
    const [tagline, setTagline] = useState('')
    const [category, setCategory] = useState<PresetCategory>('meme')
    const valid = config.trim().length > 0 && name.trim().length > 0

    return (
        <details className="glass rounded-2xl border border-line p-5 text-sm">
            <summary className="cursor-pointer font-display font-semibold text-ink">Already run a DBC config? List it here</summary>
            <p className="mt-1 text-xs text-muted">
                Any Meteora DBC config can be listed by its fee claimer, including ones created by another launchpad. The listing is one memo transaction signed by
                that wallet; the economics shown come from the config itself.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input value={config} onChange={(e) => setConfig(e.target.value)} placeholder="Config address" className={`${inputCls} font-mono sm:col-span-2`} />
                <input value={name} maxLength={LISTING_LIMITS.name} onChange={(e) => setName(e.target.value)} placeholder="Name" className={inputCls} />
                <select value={category} onChange={(e) => setCategory(e.target.value as PresetCategory)} className={inputCls}>
                    {CATEGORIES.map((c) => (
                        <option key={c} value={c}>
                            {CATEGORY_LABEL[c]}
                        </option>
                    ))}
                </select>
                <input
                    value={tagline}
                    maxLength={LISTING_LIMITS.tagline}
                    onChange={(e) => setTagline(e.target.value)}
                    placeholder="One line on what makes it different"
                    className={`${inputCls} sm:col-span-2`}
                />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2">
                <WalletButton />
                <button
                    className={primaryBtn}
                    disabled={!ready || !valid || status.kind === 'busy'}
                    onClick={() => list({ config: config.trim(), name, tagline, category })}
                >
                    {status.kind === 'busy' ? `${status.step}…` : 'List config'}
                </button>
                {status.kind === 'done' && (
                    <a className="text-xs text-good underline" href={explorerTx(status.sig, cluster)} target="_blank" rel="noreferrer">
                        ✓ Listed
                    </a>
                )}
                {status.kind === 'error' && <span className="break-words text-xs text-critical">✕ {status.message}</span>}
            </div>
        </details>
    )
}
