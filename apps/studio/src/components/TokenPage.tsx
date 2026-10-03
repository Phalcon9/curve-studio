import { useEffect, useMemo, useState } from 'react'
import BN from 'bn.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { CollectFeeMode, getTokenProgram } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { creatorClaimable, CurveSim, fromAtoms, hasClaimable, priceFromSqrtPrice, toAtoms } from '@curve-studio/core'
import { LineChart } from './LineChart'
import { Badge, Card, ErrorNote, Stat, WalletButton, inputCls, primaryBtn } from './ui'
import { buildTradeTx, loadToken, quoteTrade, referralAccountFor, type Side, type TokenView } from '../lib/trade'
import { fetchMarket } from '../lib/market'
import { SOL_RESERVE_LAMPORTS, tokenBalance } from '../lib/tokens'
import { prepare, signAndSendAll, errorMessage } from '../lib/send'
import { dataOf, useAsync } from '../lib/useAsync'
import { navigate } from '../lib/route'
import { explorerAccount, explorerTx, jupiterSwap, REFERRAL_WALLET, type Cluster } from '../lib/cluster'
import { amount, bps, num, pct, short, usd } from '../lib/format'

const REFRESH_MS = 15_000
const SLIPPAGES = [50, 100, 200, 500]

export function TokenPage({ address, cluster }: { address: string; cluster: Cluster }) {
    const { connection } = useConnection()
    const { state, reload } = useAsync(`${connection.rpcEndpoint}:${address}`, () => loadToken(connection, address))
    useEffect(() => {
        const id = setInterval(reload, REFRESH_MS)
        return () => clearInterval(id)
    }, [reload])

    const view = dataOf(state)
    if (!view) {
        if (state.kind === 'error')
            return (
                <ErrorNote title="Couldn't load this token">
                    {state.message}
                    {cluster === 'devnet' && <p className="mt-1 text-xs text-muted">If it launched on mainnet, switch the network toggle.</p>}
                </ErrorNote>
            )
        return <p className="text-sm text-muted">Reading the pool from {cluster}…</p>
    }
    return <TokenDetails view={view} cluster={cluster} onTraded={reload} />
}

function TokenDetails({ view, cluster, onTraded }: { view: TokenView; cluster: Cluster; onTraded: () => void }) {
    const { connection } = useConnection()
    const { publicKey } = useWallet()
    const { pool, config, quote, meta } = view
    const s = pool.poolState
    const priced = quote.usdPrice !== null
    const money = priced ? usd : (v: number) => `${num(v)} ${quote.symbol}`
    const symbol = meta?.symbol || short(s.baseMint.toBase58())

    const listing = useAsync(connection.rpcEndpoint, () => fetchMarket(connection, cluster))
    const presetName = dataOf(listing.state)?.find((e) => e.listing.config === view.configAddress.toBase58())?.listing.name

    const curve = useMemo(() => {
        const sim = CurveSim.fromOnChain(config, quote.decimals, quote.usdPrice ?? 1)
        return { supply: sim.summary().totalSupply, fill: sim.fill({ steps: 80 }) }
    }, [config, quote])
    const price = priceFromSqrtPrice(s.sqrtPrice, config.tokenDecimal, quote.decimals).toNumber() * (quote.usdPrice ?? 1)
    const progress = Math.min(1, fromAtoms(s.quoteReserve, quote.decimals).toNumber() / fromAtoms(config.migrationQuoteThreshold, quote.decimals).toNumber())
    const isCreator = publicKey?.equals(s.creator) ?? false
    const creatorFees = creatorClaimable(s)

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                    <div className="flex items-center gap-2">
                        <h2 className="font-display text-2xl font-bold tracking-tight text-ink">{symbol}</h2>
                        {meta?.name && <span className="text-ink-2">{meta.name}</span>}
                        {view.migrated ? (
                            <Badge tone="var(--good)">Graduated</Badge>
                        ) : view.complete ? (
                            <Badge tone="var(--series-4)">Migrating</Badge>
                        ) : (
                            <Badge tone="var(--series-3)">On the curve</Badge>
                        )}
                    </div>
                    <p className="mt-0.5 text-xs text-muted">
                        <a className="font-mono underline" href={explorerAccount(s.baseMint.toBase58(), cluster)} target="_blank" rel="noreferrer">
                            {short(s.baseMint.toBase58())}
                        </a>
                        {' · preset '}
                        <button className="underline" onClick={() => navigate({ view: 'launch', config: view.configAddress.toBase58() }, cluster)}>
                            {presetName ?? short(view.configAddress.toBase58())}
                        </button>
                        {' · created by '}
                        <a className="font-mono underline" href={explorerAccount(s.creator.toBase58(), cluster)} target="_blank" rel="noreferrer">
                            {isCreator ? 'you' : short(s.creator.toBase58())}
                        </a>
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                <Stat label="Price" value={money(price)} sub={`per ${symbol}`} />
                <Stat label="Market cap" value={money(price * curve.supply)} />
                <Stat label="Progress to graduation" value={pct(progress * 100, 1)} sub={`${amount(s.quoteReserve, quote.decimals)} of ${amount(config.migrationQuoteThreshold, quote.decimals)} ${quote.symbol}`} />
                <Stat label="After graduation" value="DAMM v2" sub={`${bps(config.migratedPoolFeeBps)} pool fee`} />
            </div>

            <div className="grid gap-4 lg:grid-cols-[1fr_24rem]">
                <div className="min-w-0 space-y-4">
                    <Card title="Market cap along the curve" subtitle={`Where ${symbol} is now, simulated from the on-chain config`}>
                        <LineChart
                            title="Market cap versus progress to graduation, with the current position marked"
                            data={curve.fill.points.map((p) => ({ x: p.progress * 100, y: p.mcapUsd }))}
                            xFormat={(v) => `${v.toFixed(0)}%`}
                            yFormat={money}
                            xLabel="Progress to graduation"
                            markerX={{ x: progress * 100, label: 'now' }}
                        />
                    </Card>
                    {isCreator && hasClaimable(creatorFees) && (
                        <Card title="You created this token">
                            <p className="text-sm text-ink-2">
                                {amount(creatorFees.quote, quote.decimals)} {quote.symbol}
                                {!creatorFees.base.isZero() && ` + ${amount(creatorFees.base, config.tokenDecimal)} ${symbol}`} in creator fees is waiting for you.{' '}
                                <button className="font-medium text-accent underline" onClick={() => navigate({ view: 'earnings' }, cluster)}>
                                    Claim on Earnings
                                </button>
                            </p>
                        </Card>
                    )}
                </div>
                <div className="order-first lg:order-none">
                    {view.migrated ? (
                        <Card title={`${symbol} has graduated`} subtitle="It now trades in its DAMM v2 pool">
                            {cluster === 'mainnet-beta' ? (
                                <a className={`${primaryBtn} inline-flex items-center`} href={jupiterSwap(config.quoteMint.toBase58(), s.baseMint.toBase58())} target="_blank" rel="noreferrer">
                                    Trade on Jupiter →
                                </a>
                            ) : (
                                <p className="text-sm text-ink-2">Trade it on any DAMM v2 interface on devnet.</p>
                            )}
                        </Card>
                    ) : view.complete ? (
                        <Card title="Curve complete" subtitle="Meteora's keeper is migrating the pool to DAMM v2; trading resumes there shortly" >
                            <p className="text-sm text-ink-2">The bonding curve accepts no more swaps.</p>
                        </Card>
                    ) : (
                        <TradeBox view={view} symbol={symbol} cluster={cluster} onTraded={onTraded} />
                    )}
                </div>
            </div>
        </div>
    )
}

type TradeStatus = { kind: 'idle' } | { kind: 'busy'; step: string } | { kind: 'done'; sig: string; side: Side } | { kind: 'error'; message: string }

function TradeBox({ view, symbol, cluster, onTraded }: { view: TokenView; symbol: string; cluster: Cluster; onTraded: () => void }) {
    const { connection } = useConnection()
    const { publicKey, signTransaction, signAllTransactions } = useWallet()
    const [side, setSide] = useState<Side>('buy')
    const [input, setInput] = useState('')
    const [slippage, setSlippage] = useState(200)
    const [status, setStatus] = useState<TradeStatus>({ kind: 'idle' })
    const { config, quote } = view
    const baseMint = view.pool.poolState.baseMint
    const inDecimals = side === 'buy' ? quote.decimals : config.tokenDecimal
    const inSymbol = side === 'buy' ? quote.symbol : symbol
    const outSymbol = side === 'buy' ? symbol : quote.symbol
    const outDecimals = side === 'buy' ? config.tokenDecimal : quote.decimals

    const balances = useAsync(publicKey ? `${connection.rpcEndpoint}:${publicKey.toBase58()}:${baseMint.toBase58()}` : null, async () => {
        const [q, b] = await Promise.all([
            tokenBalance(connection, publicKey!, config.quoteMint, getTokenProgram(config.quoteTokenFlag)),
            tokenBalance(connection, publicKey!, baseMint, getTokenProgram(config.tokenType)),
        ])
        return { quote: q, base: b }
    })
    const bal = dataOf(balances.state)
    const spendable = bal && (side === 'buy' ? (quote.symbol === 'SOL' ? BN.max(new BN(0), bal.quote.subn(SOL_RESERVE_LAMPORTS)) : bal.quote) : bal.base)

    const amountIn = useMemo(() => {
        const v = Number(input)
        return v > 0 && Number.isFinite(v) ? toAtoms(input, inDecimals) : new BN(0)
    }, [input, inDecimals])

    const preview = useMemo(() => {
        if (amountIn.isZero()) return null
        try {
            const q = quoteTrade(view, side, amountIn, false)
            const fee = q.tradingFee.add(q.protocolFee).add(q.referralFee)
            const feeOnInput = config.collectFeeMode === CollectFeeMode.QuoteToken && side === 'buy'
            const feeBase = feeOnInput ? q.includedFeeInputAmount : q.outputAmount.add(fee)
            return {
                out: q.outputAmount,
                minOut: q.outputAmount.muln(10_000 - slippage).divn(10_000),
                feeBps: feeBase.isZero() ? 0 : fee.muln(10_000).div(feeBase).toNumber(),
                unfilled: q.amountLeft,
            }
        } catch (e) {
            return { error: errorMessage(e) }
        }
    }, [view, side, amountIn, slippage, config.collectFeeMode])

    async function trade() {
        if (!publicKey || !signTransaction || amountIn.isZero()) return
        try {
            // quote against the pool as it is now, not as it was when the page loaded
            setStatus({ kind: 'busy', step: 'Refreshing quote' })
            const fresh = await loadToken(connection, view.address.toBase58())
            if (fresh.migrated || fresh.complete) throw new Error('The curve just completed; reload the page')
            const referral = await referralAccountFor(connection, fresh.config, baseMint, side === 'sell')
            const q = quoteTrade(fresh, side, amountIn, referral !== null)
            const minOut = q.outputAmount.muln(10_000 - slippage).divn(10_000)
            const tx = await buildTradeTx(connection, fresh, publicKey, side, amountIn, minOut, referral)
            await prepare(connection, [tx], publicKey)
            const [sig] = await signAndSendAll(connection, { signTransaction, signAllTransactions }, [tx], (step) => setStatus({ kind: 'busy', step }))
            setStatus({ kind: 'done', sig, side })
            setInput('')
            balances.reload()
            onTraded()
        } catch (e) {
            setStatus({ kind: 'error', message: errorMessage(e) })
        }
    }

    const tooMuch = spendable !== undefined && amountIn.gt(spendable)
    const tab = (s: Side) =>
        `flex-1 rounded-lg py-1.5 text-sm font-medium transition ${
            side === s ? (s === 'buy' ? 'bg-emerald-400/15 text-emerald-300' : 'bg-rose-400/15 text-rose-300') : 'text-muted hover:bg-white/5 hover:text-ink-2'
        }`

    return (
        <Card title={`Trade ${symbol}`} subtitle={`On the bonding curve, priced in ${quote.symbol}`}>
            <div className="space-y-3 text-sm">
                <div className="flex gap-0.5 rounded-xl border border-line bg-black/20 p-1" role="radiogroup" aria-label="Side">
                    {(['buy', 'sell'] as const).map((s) => (
                        <button key={s} role="radio" aria-checked={side === s} className={tab(s)} onClick={() => (setSide(s), setInput(''), setStatus({ kind: 'idle' }))}>
                            {s === 'buy' ? 'Buy' : 'Sell'}
                        </button>
                    ))}
                </div>
                <label className="block space-y-1">
                    <span className="flex justify-between text-ink-2">
                        <span>You pay ({inSymbol})</span>
                        {spendable && (
                            <button className="text-xs text-accent underline" onClick={() => setInput(fromAtoms(spendable, inDecimals).toString())}>
                                Max {amount(spendable, inDecimals)}
                            </button>
                        )}
                    </span>
                    <input type="number" min={0} step="any" value={input} onChange={(e) => setInput(e.target.value)} className={`${inputCls} tnum`} placeholder="0" />
                </label>

                {preview && 'error' in preview && <p className="text-xs text-critical">✕ {preview.error}</p>}
                {preview && !('error' in preview) && (
                    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
                        <dt className="text-muted">You receive ≈</dt>
                        <dd className="tnum text-right font-medium text-ink">
                            {amount(preview.out, outDecimals)} {outSymbol}
                        </dd>
                        <dt className="text-muted">Fee</dt>
                        <dd className="tnum text-right text-ink-2">{bps(preview.feeBps)}</dd>
                        <dt className="text-muted">Minimum received</dt>
                        <dd className="tnum text-right text-ink-2">
                            {amount(preview.minOut, outDecimals)} {outSymbol}
                        </dd>
                    </dl>
                )}
                {preview && !('error' in preview) && !preview.unfilled.isZero() && (
                    <p className="text-xs text-ink-2">
                        This buy completes the curve: {amount(preview.unfilled, inDecimals)} {inSymbol} won't be spent and stays in your wallet.
                    </p>
                )}

                <div className="flex items-center gap-2 text-xs text-muted">
                    Max slippage
                    {SLIPPAGES.map((b) => (
                        <button key={b} onClick={() => setSlippage(b)} className={`rounded-full px-2 py-0.5 transition ${slippage === b ? 'bg-accent/20 font-medium text-ink' : 'hover:bg-white/5 hover:text-ink-2'}`}>
                            {b / 100}%
                        </button>
                    ))}
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-1">
                    <WalletButton />
                    <button
                        onClick={trade}
                        disabled={!publicKey || amountIn.isZero() || tooMuch || !preview || 'error' in preview || status.kind === 'busy'}
                        className={primaryBtn}
                    >
                        {status.kind === 'busy' ? `${status.step}…` : tooMuch ? 'Not enough balance' : side === 'buy' ? `Buy ${symbol}` : `Sell ${symbol}`}
                    </button>
                </div>
                {status.kind === 'done' && (
                    <a className="block text-xs text-good underline" href={explorerTx(status.sig, cluster)} target="_blank" rel="noreferrer">
                        ✓ {status.side === 'buy' ? 'Bought' : 'Sold'} · view transaction
                    </a>
                )}
                {status.kind === 'error' && <p className="break-words text-xs text-critical">✕ {status.message}</p>}
                {REFERRAL_WALLET && (
                    <p className="text-xs text-muted">Trades placed here pay Curve Studio a referral share carved out of Meteora's protocol fee. Your price is the same.</p>
                )}
            </div>
        </Card>
    )
}
