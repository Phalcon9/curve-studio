import { useState } from 'react'
import { PublicKey } from '@solana/web3.js'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { encodeListingMemo, LISTING_LIMITS, type CompiledPreset, type ListingMeta, type PresetCategory } from '@curve-studio/core'
import { WalletButton, inputCls, primaryBtn } from './ui'
import { buildCreateConfigTx, quoteMintFor } from '../lib/deploy'
import { buildListingTx, hasAuthorProfile } from '../lib/market'
import { explorerAccount, explorerTx, type Cluster } from '../lib/cluster'
import { saveDeployment } from '../lib/deployments'
import { prepare, signAndSendAll, errorMessage, SendError } from '../lib/send'
import { dataOf, useAsync } from '../lib/useAsync'
import { launchUrl, navigate } from '../lib/route'
import { CATEGORY_LABEL } from '../lib/format'

type Status =
    | { kind: 'idle' }
    | { kind: 'busy'; step: string }
    | { kind: 'done'; config: string; sig: string; listed: boolean; listingError?: string }
    | { kind: 'error'; message: string }

/** Render with `key={spec.id}` so the listing fields reset when another preset is loaded. */
export function DeployPanel({ compiled, cluster }: { compiled: CompiledPreset | null; cluster: Cluster }) {
    const { connection } = useConnection()
    const { publicKey, signTransaction, signAllTransactions } = useWallet()
    const [status, setStatus] = useState<Status>({ kind: 'idle' })
    const [listIt, setListIt] = useState(true)
    const [name, setName] = useState(compiled?.spec.name ?? '')
    const [tagline, setTagline] = useState(compiled?.spec.tagline ?? '')
    const [category, setCategory] = useState<PresetCategory>(compiled?.spec.category ?? 'meme')
    const [authorName, setAuthorName] = useState('')
    const [website, setWebsite] = useState('')
    const profile = useAsync(publicKey ? `${connection.rpcEndpoint}:profile:${publicKey.toBase58()}` : null, () => hasAuthorProfile(connection, publicKey!))
    const needsProfile = dataOf(profile.state) === false

    const unavailable = compiled && !quoteMintFor(compiled, cluster)
    const listing = (config: string): ListingMeta => ({ config, name, tagline, category, preset: compiled?.spec.id })
    let listingError: string | null = null
    if (listIt) {
        try {
            encodeListingMemo(listing(PublicKey.default.toBase58()))
        } catch (e) {
            listingError = errorMessage(e)
        }
    }

    async function deploy() {
        if (!compiled || !publicKey || !signTransaction) return
        let address: string | undefined
        const record = (sig: string) =>
            saveDeployment({
                config: address!,
                sig,
                cluster,
                presetName: name.trim() || compiled.spec.name,
                spec: { ...compiled.spec, name: name.trim() || compiled.spec.name, tagline, category },
                quoteSymbol: compiled.quote.symbol,
                author: publicKey.toBase58(),
                at: Date.now(),
            })
        try {
            setStatus({ kind: 'busy', step: 'Building transactions' })
            const { tx, config } = await buildCreateConfigTx(connection, compiled, publicKey, cluster)
            address = config.publicKey.toBase58()
            const txs = [tx]
            if (listIt) {
                const profileInput = needsProfile && authorName.trim() ? { name: authorName, website } : undefined
                const listTx = await buildListingTx(connection, publicKey, listing(address), profileInput)
                await prepare(connection, [listTx], publicKey)
                txs.push(listTx)
            }
            const [sig] = await signAndSendAll(connection, { signTransaction, signAllTransactions }, txs, (step) => setStatus({ kind: 'busy', step }), [[config]])
            record(sig)
            setStatus({ kind: 'done', config: address, sig, listed: listIt })
            profile.reload()
        } catch (e) {
            if (e instanceof SendError && e.sent.length > 0 && address) {
                // the config landed, only the listing didn't: it can be listed later from the Marketplace
                record(e.sent[0])
                setStatus({ kind: 'done', config: address, sig: e.sent[0], listed: false, listingError: e.message })
            } else {
                setStatus({ kind: 'error', message: errorMessage(e) })
            }
        }
    }

    return (
        <div className="space-y-3 text-sm">
            <p className="text-ink-2">
                Publishing creates a DBC config on-chain with <strong className="text-ink">your wallet as fee claimer</strong>. Every token launched on it pays you the author
                share of trading fees plus the launch fee, enforced by the Meteora program.
            </p>

            <label className="flex items-center gap-2 text-ink-2">
                <input type="checkbox" checked={listIt} onChange={(e) => setListIt(e.target.checked)} className="accent-[var(--accent)]" />
                List it on the marketplace (one extra memo transaction, same wallet prompt)
            </label>
            {listIt && (
                <div className="grid gap-2 sm:grid-cols-[1fr_9rem]">
                    <input value={name} maxLength={LISTING_LIMITS.name} onChange={(e) => setName(e.target.value)} placeholder="Preset name" className={inputCls} aria-label="Preset name" />
                    <select value={category} onChange={(e) => setCategory(e.target.value as PresetCategory)} className={inputCls} aria-label="Category">
                        {(Object.keys(CATEGORY_LABEL) as PresetCategory[]).map((c) => (
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
                        aria-label="Tagline"
                    />
                    {needsProfile && (
                        <>
                            <input value={authorName} maxLength={32} onChange={(e) => setAuthorName(e.target.value)} placeholder="Your name as author (optional)" className={inputCls} aria-label="Author name" />
                            <input value={website} maxLength={100} onChange={(e) => setWebsite(e.target.value)} placeholder="Website (optional)" className={inputCls} aria-label="Website" />
                            <p className="text-xs text-muted sm:col-span-2">
                                Saved once as your Meteora partner profile, so the marketplace and other DBC tools show a name instead of your address.
                            </p>
                        </>
                    )}
                    {listingError && <p className="text-xs text-critical sm:col-span-2">✕ {listingError}</p>}
                </div>
            )}

            {cluster === 'mainnet-beta' && <p className="text-xs text-muted">Mainnet: this spends real SOL (~0.01 SOL rent + fees). Try devnet first.</p>}
            <div className="flex flex-wrap items-center gap-2">
                <WalletButton />
                <button
                    disabled={!compiled || !publicKey || !!unavailable || !!listingError || status.kind === 'busy'}
                    onClick={deploy}
                    className={primaryBtn}
                >
                    {status.kind === 'busy' ? `${status.step}…` : `Publish on ${cluster === 'devnet' ? 'devnet' : 'mainnet'}`}
                </button>
            </div>
            {unavailable && <p className="text-xs text-muted">{compiled!.quote.symbol} does not exist on {cluster}. Switch to mainnet or pick SOL / USDC.</p>}
            {status.kind === 'done' && (
                <div className="rounded-xl border border-line bg-surface-2 p-3 text-xs">
                    <div className="font-medium text-good">✓ Config published{status.listed ? ' and listed' : ''}</div>
                    {status.listingError && <div className="mt-1 text-critical">Listing failed ({status.listingError}). List it from the Marketplace page.</div>}
                    <div className="mt-1 break-all text-ink-2">
                        <a className="underline" href={explorerAccount(status.config, cluster)} target="_blank" rel="noreferrer">
                            {status.config}
                        </a>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3">
                        <a className="text-muted underline" href={explorerTx(status.sig, cluster)} target="_blank" rel="noreferrer">
                            View transaction
                        </a>
                        <button className="font-medium text-accent underline" onClick={() => navigate({ view: 'launch', config: status.config }, cluster)}>
                            Open launch page →
                        </button>
                        <button className="text-muted underline" onClick={() => navigator.clipboard?.writeText(launchUrl(status.config, cluster))}>
                            Copy share link
                        </button>
                    </div>
                </div>
            )}
            {status.kind === 'error' && <p className="break-words text-xs text-critical">✕ {status.message}</p>}
        </div>
    )
}
