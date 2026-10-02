import { useEffect, useMemo, useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import { CurveSim, fromAtoms, toAtoms } from '@curve-studio/core'
import { LineChart } from './LineChart'
import { Card, Stat, short } from './ui'
import { loadConfig, type LoadedConfig } from '../lib/onchain'
import { buildLaunchTx, SLIPPAGE_BPS } from '../lib/launch'
import { bps, duration, num, pct, usd } from '../lib/format'
import { explorerAccount, explorerTx, type Cluster } from '../lib/cluster'
import { loadDeployments } from '../lib/deployments'
import { navigate } from '../lib/route'

type Load = { kind: 'idle' } | { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; data: LoadedConfig }

type LaunchStatus =
    | { kind: 'idle' }
    | { kind: 'busy'; step: string }
    | { kind: 'done'; pool: string; mint: string; sig: string }
    | { kind: 'error'; message: string }

const inputCls = 'w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-sm text-ink outline-none focus:border-accent'

export function LaunchPage({ initialConfig, cluster }: { initialConfig: string; cluster: Cluster }) {
    const { connection } = useConnection()
    const [address, setAddress] = useState(initialConfig)
    const [load, setLoad] = useState<Load>({ kind: 'idle' })

    useEffect(() => {
        if (!initialConfig) return
        let cancelled = false
        setLoad({ kind: 'loading' })
        loadConfig(connection, initialConfig)
            .then((data) => !cancelled && setLoad({ kind: 'ready', data }))
            .catch((e) => !cancelled && setLoad({ kind: 'error', message: e instanceof Error ? e.message : String(e) }))
        return () => {
            cancelled = true
        }
    }, [connection, initialConfig])

    const mine = loadDeployments().filter((d) => d.cluster === cluster)

    return (
        <div className="space-y-4">
            <form
                className="flex flex-wrap gap-2"
                onSubmit={(e) => {
                    e.preventDefault()
                    navigate({ view: 'launch', config: address.trim() }, cluster)
                }}
            >
                <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="DBC config address" className={`${inputCls} min-w-0 flex-1 font-mono`} />
                <button className="h-9 rounded-lg bg-accent px-4 text-sm font-medium text-white disabled:opacity-40" disabled={!address.trim()}>
                    Open
                </button>
            </form>

            {!initialConfig && (
                <Card title="Pick a preset" subtitle="Paste any Meteora DBC config address, or open one you published">
                    {mine.length === 0 ? (
                        <p className="text-sm text-ink-2">
                            You haven't published a preset on {cluster === 'devnet' ? 'devnet' : 'mainnet'} from this browser yet.{' '}
                            <button className="underline" onClick={() => navigate({ view: 'studio' }, cluster)}>
                                Design one
                            </button>
                            .
                        </p>
                    ) : (
                        <ul className="divide-y divide-line text-sm">
                            {mine.map((d) => (
                                <li key={d.config} className="flex items-center justify-between gap-3 py-2">
                                    <span>
                                        <span className="font-medium text-ink">{d.presetName}</span>
                                        <span className="ml-2 text-muted">
                                            {d.quoteSymbol} · {new Date(d.at).toLocaleDateString()}
                                        </span>
                                    </span>
                                    <button className="font-mono text-xs text-accent underline" onClick={() => navigate({ view: 'launch', config: d.config }, cluster)}>
                                        {short(d.config)}
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </Card>
            )}

            {load.kind === 'loading' && <p className="text-sm text-muted">Reading config from {cluster}…</p>}
            {load.kind === 'error' && (
                <div className="rounded-xl border border-line bg-surface p-4 text-sm">
                    <div className="font-medium text-critical">✕ Couldn't load this config</div>
                    <p className="mt-1 text-ink-2">{load.message}</p>
                    {cluster === 'devnet' && <p className="mt-1 text-xs text-muted">If it was published on mainnet, switch the network toggle.</p>}
                </div>
            )}
            {load.kind === 'ready' && <LoadedView data={load.data} cluster={cluster} />}
        </div>
    )
}

function LoadedView({ data, cluster }: { data: LoadedConfig; cluster: Cluster }) {
    const { config, quote } = data
    const priced = quote.usdPrice !== null
    const money = priced ? usd : (v: number) => `${num(v)} ${quote.symbol}`

    const view = useMemo(() => {
        const sim = CurveSim.fromOnChain(config, quote.decimals, quote.usdPrice ?? 1)
        const summary = sim.summary()
        const fill = sim.fill({ steps: 80 })
        const base = config.poolFees.baseFee
        // fee scheduler: firstFactor = periods, secondFactor = seconds per period
        const window = Math.max(1, base.firstFactor * base.secondFactor.toNumber())
        const seconds = Array.from({ length: 41 }, (_, i) => Math.round((i / 40) * window * 1.25))
        return { sim, summary, fill, window, sniper: sim.sniperTable(500, seconds) }
    }, [config, quote])

    const s = view.summary
    return (
        <>
            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <Stat label="Start market cap" value={money(s.startMcapUsd)} sub={`${money(s.startPriceUsd)} / token`} />
                <Stat label="Graduates at" value={money(s.gradMcapUsd)} sub={`${s.priceMultiple.toFixed(1)}× start price`} />
                <Stat label="Raise to graduate" value={`${num(s.raiseQuote)} ${quote.symbol}`} sub={priced ? `≈ ${usd(s.raiseUsd)}` : undefined} />
                <Stat label="Sold on the curve" value={pct(s.curveSupplyPct, 1)} sub={`of ${num(s.totalSupply)} tokens`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
                <div className="min-w-0 space-y-4">
                    <Card title="Market cap as the curve fills" subtitle={`Simulated from the on-chain config, quoted in ${quote.symbol}`}>
                        <LineChart
                            title="Market cap versus progress to graduation"
                            data={view.fill.points.map((p) => ({ x: p.progress * 100, y: p.mcapUsd }))}
                            xFormat={(v) => `${v.toFixed(0)}%`}
                            yFormat={money}
                            xLabel="Progress to graduation"
                        />
                    </Card>
                    <Card title="Fee on a $500 buy" subtitle="Anti-sniper decay after launch">
                        <LineChart
                            title="Fee in basis points on a $500 buy over time since launch"
                            data={view.sniper.map((r) => ({ x: r.second, y: r.feeBps }))}
                            xFormat={duration}
                            yFormat={bps}
                            xLabel="Time since launch"
                            height={180}
                            markerX={{ x: view.window, label: 'decay ends' }}
                        />
                    </Card>
                    <LaunchedList data={data} cluster={cluster} />
                </div>

                <div className="order-first space-y-4 lg:order-none">
                    <LaunchForm data={data} sim={view.sim} cluster={cluster} />
                    <Card title="About this preset">
                        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
                            <dt className="text-muted">Author</dt>
                            <dd className="text-right">
                                <a className="font-mono text-ink-2 underline" href={explorerAccount(config.feeClaimer.toBase58(), cluster)} target="_blank" rel="noreferrer">
                                    {short(config.feeClaimer.toBase58())}
                                </a>
                            </dd>
                            <dt className="text-muted">Quote</dt>
                            <dd className="text-right text-ink-2">{quote.symbol}</dd>
                            <dt className="text-muted">Your share of trading fees</dt>
                            <dd className="text-right text-ink-2">{pct(0.8 * config.creatorTradingFeePercentage)}</dd>
                            <dt className="text-muted">Launch fee (to author)</dt>
                            <dd className="text-right text-ink-2">{num(fromAtoms(config.poolCreationFee, 9).toNumber())} SOL</dd>
                            <dt className="text-muted">After graduation</dt>
                            <dd className="text-right text-ink-2">DAMM v2 · {bps(config.migratedPoolFeeBps)} fee</dd>
                        </dl>
                    </Card>
                </div>
            </div>
        </>
    )
}

function LaunchForm({ data, sim, cluster }: { data: LoadedConfig; sim: CurveSim; cluster: Cluster }) {
    const { connection } = useConnection()
    const { publicKey, signTransaction } = useWallet()
    const [name, setName] = useState('')
    const [symbol, setSymbol] = useState('')
    const [uri, setUri] = useState('')
    const [firstBuy, setFirstBuy] = useState(0)
    const [status, setStatus] = useState<LaunchStatus>({ kind: 'idle' })
    const { config, quote } = data
    const minFee = config.enableFirstSwapWithMinFee === 1

    const preview = useMemo(() => {
        if (!(firstBuy > 0)) return null
        try {
            const q = sim.quoteBuy(toAtoms(firstBuy, quote.decimals), { firstSwapMinFee: minFee })
            const tokens = fromAtoms(q.outputAmount, config.tokenDecimal).toNumber()
            return { tokens, feeBps: q.feeBps, sharePct: (tokens / Math.max(1, sim.summary().totalSupply)) * 100 }
        } catch {
            return null
        }
    }, [firstBuy, sim, quote.decimals, minFee, config.tokenDecimal])

    const valid = name.trim().length > 0 && name.trim().length <= 32 && symbol.trim().length > 0 && symbol.trim().length <= 10 && uri.length <= 200

    async function launch() {
        if (!publicKey || !signTransaction) return
        try {
            setStatus({ kind: 'busy', step: 'Building transaction' })
            const { tx, baseMint, pool } = await buildLaunchTx(connection, data, { name, symbol, uri }, firstBuy, publicKey)
            setStatus({ kind: 'busy', step: 'Waiting for wallet' })
            const signed = await signTransaction(tx)
            setStatus({ kind: 'busy', step: 'Confirming' })
            const sig = await connection.sendRawTransaction(signed.serialize())
            await connection.confirmTransaction({ signature: sig, blockhash: tx.recentBlockhash!, lastValidBlockHeight: tx.lastValidBlockHeight! }, 'confirmed')
            setStatus({ kind: 'done', pool: pool.toBase58(), mint: baseMint.publicKey.toBase58(), sig })
        } catch (e) {
            setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
        }
    }

    return (
        <Card title="Launch your token" subtitle={`Pays ${num(fromAtoms(config.poolCreationFee, 9).toNumber())} SOL launch fee plus rent`}>
            <div className="space-y-3 text-sm">
                <label className="block space-y-1">
                    <span className="text-ink-2">Name</span>
                    <input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="My Token" />
                </label>
                <label className="block space-y-1">
                    <span className="text-ink-2">Symbol</span>
                    <input value={symbol} maxLength={10} onChange={(e) => setSymbol(e.target.value.toUpperCase())} className={inputCls} placeholder="MYT" />
                </label>
                <label className="block space-y-1">
                    <span className="text-ink-2">Metadata URL (optional)</span>
                    <input value={uri} maxLength={200} onChange={(e) => setUri(e.target.value)} className={inputCls} placeholder="https://…/metadata.json" />
                    <span className="block text-xs text-muted">JSON with image and description, e.g. uploaded to IPFS. Wallets show no image without it.</span>
                </label>
                <label className="block space-y-1">
                    <span className="text-ink-2">Your first buy ({quote.symbol})</span>
                    <input
                        type="number"
                        min={0}
                        step="any"
                        value={firstBuy || ''}
                        onChange={(e) => setFirstBuy(Math.max(0, e.target.valueAsNumber || 0))}
                        className={`${inputCls} tnum`}
                        placeholder="0"
                    />
                </label>
                {preview && (
                    <p className="text-xs text-ink-2">
                        ≈ {num(preview.tokens)} tokens ({pct(preview.sharePct, 2)} of supply) at a {bps(preview.feeBps)} fee
                        {minFee ? ', exempt from the anti-sniper fee because it is bundled with the launch.' : '.'} Max {SLIPPAGE_BPS / 100}% slippage.
                    </p>
                )}
                {preview && !minFee && preview.feeBps >= 1000 && (
                    <p className="text-xs text-critical">
                        ⚠ This preset doesn't exempt the creator's first buy, so you'd pay the {bps(preview.feeBps)} anti-sniper fee. Consider a smaller buy, or
                        re-publish the preset from the Design tab (new presets exempt it).
                    </p>
                )}
                <div className="flex flex-wrap items-center gap-2 pt-1">
                    <WalletMultiButton
                        style={{ height: 36, fontSize: 14, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                    />
                    <button
                        onClick={launch}
                        disabled={!publicKey || !valid || status.kind === 'busy'}
                        className="h-9 rounded-lg bg-accent px-4 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                        {status.kind === 'busy' ? `${status.step}…` : 'Launch'}
                    </button>
                </div>
                {status.kind === 'done' && (
                    <div className="rounded-md border border-line bg-surface-2 p-2.5 text-xs">
                        <div className="font-medium text-good">✓ {symbol} is live on the curve</div>
                        <div className="mt-1 space-y-0.5 text-ink-2">
                            <div>
                                Token{' '}
                                <a className="font-mono underline" href={explorerAccount(status.mint, cluster)} target="_blank" rel="noreferrer">
                                    {short(status.mint)}
                                </a>{' '}
                                · Pool{' '}
                                <a className="font-mono underline" href={explorerAccount(status.pool, cluster)} target="_blank" rel="noreferrer">
                                    {short(status.pool)}
                                </a>
                            </div>
                            <a className="text-muted underline" href={explorerTx(status.sig, cluster)} target="_blank" rel="noreferrer">
                                View transaction
                            </a>
                        </div>
                    </div>
                )}
                {status.kind === 'error' && <p className="break-words text-xs text-critical">✕ {status.message}</p>}
            </div>
        </Card>
    )
}

function LaunchedList({ data, cluster }: { data: LoadedConfig; cluster: Cluster }) {
    const { pools } = data
    const graduated = pools.filter((p) => p.migrated).length
    return (
        <Card
            title="Launched on this preset"
            subtitle={pools.length ? `${pools.length} token${pools.length === 1 ? '' : 's'} · ${graduated} graduated to DAMM v2` : 'No tokens yet. Be the first.'}
        >
            {pools.length > 0 && (
                <table className="w-full text-sm">
                    <thead>
                        <tr className="text-left text-xs text-muted">
                            <th className="pb-1 font-normal">Token</th>
                            <th className="pb-1 font-normal">Creator</th>
                            <th className="pb-1 text-right font-normal">Progress</th>
                        </tr>
                    </thead>
                    <tbody>
                        {pools.slice(0, 25).map((p) => (
                            <tr key={p.address} className="border-t border-line">
                                <td className="py-1.5">
                                    <a className="font-mono text-ink-2 underline" href={explorerAccount(p.baseMint, cluster)} target="_blank" rel="noreferrer">
                                        {short(p.baseMint)}
                                    </a>
                                </td>
                                <td className="py-1.5 font-mono text-muted">{short(p.creator)}</td>
                                <td className="py-1.5">
                                    <div className="flex items-center justify-end gap-2">
                                        <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface-2" aria-hidden>
                                            <div className="h-full rounded-full" style={{ width: `${p.progress * 100}%`, background: 'var(--series-1)' }} />
                                        </div>
                                        <span className="tnum w-20 text-right text-ink-2">{p.migrated ? '✓ Graduated' : pct(p.progress * 100)}</span>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}
        </Card>
    )
}
