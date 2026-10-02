import { useState } from 'react'
import { PublicKey, type Transaction } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { fromAtoms, hasClaimable, sumClaimable, type Claimable } from '@curve-studio/core'
import { Card, ErrorNote, Stat, WalletButton, secondaryBtn } from './ui'
import { creatorClaimTxs, loadAuthorEarnings, loadCreatorEarnings, partnerClaimTxs, type AuthorConfig, type PoolClaim } from '../lib/earnings'
import { fetchMarket } from '../lib/market'
import { loadDeployments } from '../lib/deployments'
import { prepare, signAndSendAll, errorMessage, SendError } from '../lib/send'
import { dataOf, useAsync } from '../lib/useAsync'
import { navigate } from '../lib/route'
import type { QuoteInfo } from '../lib/onchain'
import { explorerTx, type Cluster } from '../lib/cluster'
import { amount, num, short, usd } from '../lib/format'

/** Claims go out in batches so one wallet prompt never outlives the blockhash. */
const BATCH = 8

const usdOf = (c: Claimable, quote: QuoteInfo) => (quote.usdPrice === null ? 0 : fromAtoms(c.quote, quote.decimals).toNumber() * quote.usdPrice)

/** `viewing` (from ?wallet=) shows any wallet's earnings read-only; claiming needs that wallet connected. */
export function EarningsPage({ cluster, viewing }: { cluster: Cluster; viewing?: string }) {
    const { publicKey } = useWallet()
    let wallet: PublicKey | null = publicKey
    if (viewing) {
        try {
            wallet = new PublicKey(viewing)
        } catch {
            return <ErrorNote title="That is not a valid Solana address" />
        }
    }
    if (!wallet) {
        return (
            <Card title="Connect your wallet" subtitle="Earnings are read from the pools on chain for the connected wallet">
                <WalletButton />
            </Card>
        )
    }
    const canClaim = !!publicKey?.equals(wallet)
    return (
        <div className="space-y-6">
            {viewing && !canClaim && (
                <p className="text-sm text-ink-2">
                    Viewing <span className="font-mono">{short(viewing)}</span> read-only. Connect that wallet to claim.
                </p>
            )}
            <AuthorEarnings wallet={wallet} cluster={cluster} canClaim={canClaim} />
            <CreatorEarnings wallet={wallet} cluster={cluster} canClaim={canClaim} />
        </div>
    )
}

function AuthorEarnings({ wallet, cluster, canClaim }: { wallet: PublicKey; cluster: Cluster; canClaim: boolean }) {
    const { connection } = useConnection()
    const { state, reload } = useAsync(`author:${connection.rpcEndpoint}:${wallet.toBase58()}`, async () => {
        const me = wallet.toBase58()
        const listed = (await fetchMarket(connection, cluster).catch(() => [])).filter((e) => e.listing.author === me)
        const names = new Map(listed.map((e) => [e.listing.config, e.listing.name]))
        const known = [...listed.map((e) => e.listing.config), ...loadDeployments().filter((d) => d.cluster === cluster && d.author === me).map((d) => d.config)]
        const configs = await loadAuthorEarnings(connection, wallet, known)
        return configs.map((c) => ({ ...c, name: names.get(c.address.toBase58()) }))
    })

    const configs = dataOf(state)
    if (!configs) {
        if (state.kind === 'error') return <ErrorNote title="Couldn't load your presets">{state.message}</ErrorNote>
        return <p className="text-sm text-muted">Reading the configs you are fee claimer of…</p>
    }

    const launches = configs.reduce((n, c) => n + c.pools.length, 0)
    const tradingUsd = configs.reduce((s, c) => s + usdOf(c.total, c.quote), 0)
    const launchFees = sumClaimable(configs.map((c) => c.total)).launchFee

    return (
        <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink">As preset author</h2>
            {configs.length === 0 ? (
                <p className="text-sm text-ink-2">
                    This wallet isn't the fee claimer of any DBC config on {cluster === 'devnet' ? 'devnet' : 'mainnet'}.{' '}
                    <button className="font-medium text-accent underline" onClick={() => navigate({ view: 'studio' }, cluster)}>
                        Publish a preset
                    </button>{' '}
                    to start earning on every token launched with it.
                </p>
            ) : (
                <>
                    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
                        <Stat label="Presets" value={String(configs.length)} />
                        <Stat label="Tokens launched on them" value={num(launches)} />
                        <Stat label="Unclaimed trading fees" value={usd(tradingUsd)} sub="priced quotes only" />
                        <Stat label="Unclaimed launch fees" value={`${amount(launchFees, 9)} SOL`} />
                    </div>
                    {configs.map((c) => (
                        <ConfigCard key={c.address.toBase58()} cfg={c} cluster={cluster} canClaim={canClaim} onClaimed={reload} />
                    ))}
                    <p className="text-xs text-muted">
                        After a token graduates, the LP position locked for you in its DAMM v2 pool keeps earning swap fees; claim those from your portfolio on
                        meteora.ag.
                    </p>
                </>
            )}
        </section>
    )
}

function ConfigCard({ cfg, cluster, canClaim, onClaimed }: { cfg: AuthorConfig & { name?: string }; cluster: Cluster; canClaim: boolean; onClaimed: () => void }) {
    const { connection } = useConnection()
    const { publicKey } = useWallet()
    const open = cfg.pools.filter((p) => hasClaimable(p.claim))
    return (
        <Card
            title={cfg.name ?? `Config ${short(cfg.address.toBase58())}`}
            subtitle={`${cfg.quote.symbol} · ${cfg.pools.length} token${cfg.pools.length === 1 ? '' : 's'} launched · ${open.length} with fees to claim`}
            action={
                <span className="flex gap-2">
                    <button className={`${secondaryBtn} h-8`} onClick={() => navigate({ view: 'launch', config: cfg.address.toBase58() }, cluster)}>
                        Launch page
                    </button>
                    <ClaimButton
                        count={canClaim ? open.length : 0}
                        build={() => partnerClaimTxs(connection, publicKey!, open.slice(0, BATCH))}
                        cluster={cluster}
                        onDone={onClaimed}
                    />
                </span>
            }
        >
            <ClaimTable pools={open} quote={cfg.quote} baseDecimals={cfg.config.tokenDecimal} showLaunchFee cluster={cluster} />
        </Card>
    )
}

function CreatorEarnings({ wallet, cluster, canClaim }: { wallet: PublicKey; cluster: Cluster; canClaim: boolean }) {
    const { connection } = useConnection()
    const { state, reload } = useAsync(`creator:${connection.rpcEndpoint}:${wallet.toBase58()}`, () => loadCreatorEarnings(connection, wallet))

    const pools = dataOf(state)
    if (!pools) {
        if (state.kind === 'error') return <ErrorNote title="Couldn't load your tokens">{state.message}</ErrorNote>
        return <p className="text-sm text-muted">Reading the tokens you created…</p>
    }
    if (pools.length === 0) return null

    const open = pools.filter((p) => hasClaimable(p.claim))
    const totalUsd = open.reduce((s, p) => s + usdOf(p.claim, p.quote), 0)
    return (
        <section className="space-y-3">
            <h2 className="text-base font-semibold text-ink">As token creator</h2>
            <Card
                title={`${pools.length} token${pools.length === 1 ? '' : 's'} created`}
                subtitle={`${open.length} with creator fees to claim${totalUsd > 0 ? ` · ≈ ${usd(totalUsd)}` : ''}`}
                action={
                    <ClaimButton count={canClaim ? open.length : 0} build={() => creatorClaimTxs(connection, wallet, open.slice(0, BATCH))} cluster={cluster} onDone={reload} />
                }
            >
                {open.length > 0 ? (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-muted">
                                <th className="pb-1 font-normal">Token</th>
                                <th className="pb-1 text-right font-normal">Fees owed to you</th>
                            </tr>
                        </thead>
                        <tbody>
                            {open.map((p) => (
                                <tr key={p.pool.toBase58()} className="border-t border-line">
                                    <td className="py-1.5">
                                        <TokenLink pool={p} cluster={cluster} />
                                    </td>
                                    <td className="tnum py-1.5 text-right text-ink">{feeText(p.claim, p.quote, p.config.tokenDecimal, p.meta?.symbol)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <p className="text-sm text-ink-2">Nothing to claim right now.</p>
                )}
            </Card>
        </section>
    )
}

function feeText(c: Claimable, quote: QuoteInfo, baseDecimals: number, symbol = 'tokens') {
    const parts = []
    if (!c.quote.isZero()) parts.push(`${amount(c.quote, quote.decimals)} ${quote.symbol}`)
    if (!c.base.isZero()) parts.push(`${amount(c.base, baseDecimals)} ${symbol}`)
    return parts.join(' + ') || '–'
}

function TokenLink({ pool, cluster }: { pool: PoolClaim; cluster: Cluster }) {
    return (
        <button className="text-ink-2 underline" onClick={() => navigate({ view: 'token', pool: pool.pool.toBase58() }, cluster)}>
            {pool.meta?.symbol || short(pool.baseMint.toBase58())}
        </button>
    )
}

function ClaimTable({ pools, quote, baseDecimals, showLaunchFee, cluster }: { pools: PoolClaim[]; quote: QuoteInfo; baseDecimals: number; showLaunchFee: boolean; cluster: Cluster }) {
    if (pools.length === 0) return <p className="text-sm text-ink-2">Nothing to claim right now.</p>
    return (
        <table className="w-full text-sm">
            <thead>
                <tr className="text-left text-xs text-muted">
                    <th className="pb-1 font-normal">Token</th>
                    <th className="pb-1 text-right font-normal">Trading fees</th>
                    {showLaunchFee && <th className="pb-1 text-right font-normal">Launch fee</th>}
                </tr>
            </thead>
            <tbody>
                {pools.slice(0, 25).map((p) => (
                    <tr key={p.pool.toBase58()} className="border-t border-line">
                        <td className="py-1.5">
                            <TokenLink pool={p} cluster={cluster} />
                            {p.migrated && <span className="ml-2 text-xs text-muted">graduated</span>}
                        </td>
                        <td className="tnum py-1.5 text-right text-ink">{feeText(p.claim, quote, baseDecimals, p.meta?.symbol)}</td>
                        {showLaunchFee && <td className="tnum py-1.5 text-right text-ink">{p.claim.launchFee.isZero() ? '–' : `${amount(p.claim.launchFee, 9)} SOL`}</td>}
                    </tr>
                ))}
            </tbody>
            {pools.length > 25 && (
                <tfoot>
                    <tr>
                        <td colSpan={3} className="pt-1.5 text-xs text-muted">
                            and {pools.length - 25} more
                        </td>
                    </tr>
                </tfoot>
            )}
        </table>
    )
}

type ClaimStatus = { kind: 'idle' } | { kind: 'busy'; step: string } | { kind: 'done'; sigs: string[] } | { kind: 'error'; message: string }

function ClaimButton({ count, build, cluster, onDone }: { count: number; build: () => Promise<Transaction[]>; cluster: Cluster; onDone: () => void }) {
    const { connection } = useConnection()
    const { publicKey, signTransaction, signAllTransactions } = useWallet()
    const [status, setStatus] = useState<ClaimStatus>({ kind: 'idle' })

    async function claim() {
        if (!publicKey || !signTransaction) return
        try {
            setStatus({ kind: 'busy', step: 'Building' })
            const txs = await build()
            await prepare(connection, txs, publicKey)
            const sigs = await signAndSendAll(connection, { signTransaction, signAllTransactions }, txs, (step) => setStatus({ kind: 'busy', step }))
            setStatus({ kind: 'done', sigs })
            onDone()
        } catch (e) {
            if (e instanceof SendError && e.sent.length) onDone()
            setStatus({ kind: 'error', message: errorMessage(e) })
        }
    }

    const label = count > BATCH ? `Claim next ${BATCH} of ${count}` : 'Claim all'
    return (
        <span className="flex flex-col items-end gap-1">
            <button className={`${secondaryBtn} h-8 border-accent text-accent`} disabled={count === 0 || status.kind === 'busy'} onClick={claim}>
                {status.kind === 'busy' ? `${status.step}…` : label}
            </button>
            {status.kind === 'done' && (
                <a className="text-xs text-good underline" href={explorerTx(status.sigs.at(-1)!, cluster)} target="_blank" rel="noreferrer">
                    ✓ Claimed in {status.sigs.length} transaction{status.sigs.length === 1 ? '' : 's'}
                </a>
            )}
            {status.kind === 'error' && <span className="max-w-xs break-words text-right text-xs text-critical">✕ {status.message}</span>}
        </span>
    )
}
