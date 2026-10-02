import { useState } from 'react'
import { useConnection, useWallet } from '@solana/wallet-adapter-react'
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui'
import type { CompiledPreset } from '@curve-studio/core'
import { buildCreateConfigTx, quoteMintFor } from '../lib/deploy'
import { explorerAccount, explorerTx, type Cluster } from '../lib/cluster'
import { saveDeployment } from '../lib/deployments'
import { launchUrl, navigate } from '../lib/route'

type Status =
    | { kind: 'idle' }
    | { kind: 'busy'; step: string }
    | { kind: 'done'; config: string; sig: string }
    | { kind: 'error'; message: string }

export function DeployPanel({ compiled, cluster }: { compiled: CompiledPreset | null; cluster: Cluster }) {
    const { connection } = useConnection()
    const { publicKey, signTransaction } = useWallet()
    const [status, setStatus] = useState<Status>({ kind: 'idle' })

    const unavailable = compiled && !quoteMintFor(compiled, cluster)

    async function deploy() {
        if (!compiled || !publicKey || !signTransaction) return
        try {
            setStatus({ kind: 'busy', step: 'Building transaction' })
            const { tx, config } = await buildCreateConfigTx(connection, compiled, publicKey, cluster)
            setStatus({ kind: 'busy', step: 'Waiting for wallet' })
            const signed = await signTransaction(tx)
            setStatus({ kind: 'busy', step: 'Confirming' })
            const sig = await connection.sendRawTransaction(signed.serialize())
            await connection.confirmTransaction(
                { signature: sig, blockhash: tx.recentBlockhash!, lastValidBlockHeight: tx.lastValidBlockHeight! },
                'confirmed'
            )
            const address = config.publicKey.toBase58()
            saveDeployment({
                config: address,
                sig,
                cluster,
                presetName: compiled.spec.name,
                spec: compiled.spec,
                quoteSymbol: compiled.quote.symbol,
                author: publicKey.toBase58(),
                at: Date.now(),
            })
            setStatus({ kind: 'done', config: address, sig })
        } catch (e) {
            setStatus({ kind: 'error', message: e instanceof Error ? e.message : String(e) })
        }
    }

    return (
        <div className="space-y-3 text-sm">
            <p className="text-ink-2">
                Publishing creates a DBC config on-chain with <strong className="text-ink">your wallet as fee claimer</strong>. Every token launched on it pays you the author
                share of trading fees plus the launch fee, enforced by the Meteora program.
            </p>
            {cluster === 'mainnet-beta' && <p className="text-xs text-muted">Mainnet: this spends real SOL (~0.01 SOL rent + fees). Try devnet first.</p>}
            <div className="flex flex-wrap items-center gap-2">
                <WalletMultiButton
                    style={{ height: 36, fontSize: 14, borderRadius: 8, background: 'var(--surface-2)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}
                />
                <button
                    disabled={!compiled || !publicKey || !!unavailable || status.kind === 'busy'}
                    onClick={deploy}
                    className="h-9 rounded-lg bg-accent px-4 font-medium text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                    {status.kind === 'busy' ? `${status.step}…` : `Publish on ${cluster === 'devnet' ? 'devnet' : 'mainnet'}`}
                </button>
            </div>
            {unavailable && <p className="text-xs text-muted">{compiled!.quote.symbol} does not exist on {cluster}. Switch to mainnet or pick SOL / USDC.</p>}
            {status.kind === 'done' && (
                <div className="rounded-md border border-line bg-surface-2 p-2.5 text-xs">
                    <div className="font-medium text-good">✓ Config published</div>
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
