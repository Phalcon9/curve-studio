import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { DynamicBondingCurveClient, deriveTokenBadgeAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import type { CompiledPreset } from '@curve-studio/core'
import type { Cluster } from './cluster'

// Devnet has no xStocks or mainnet USDC; SOL is the only quote that exists on both.
export const DEVNET_MINT_OVERRIDES: Record<string, string> = {
    EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU',
}

export function quoteMintFor(compiled: CompiledPreset, cluster: Cluster): PublicKey | null {
    const mint = compiled.quote.mint
    if (cluster === 'mainnet-beta') return new PublicKey(mint)
    if (compiled.quote.kind === 'native') return new PublicKey(mint)
    const override = DEVNET_MINT_OVERRIDES[mint]
    return override ? new PublicKey(override) : null
}

/**
 * Build the create-config transaction, unsigned: `config` cosigns after the
 * wallet (see signAndSendAll). The connected wallet becomes the
 * config's feeClaimer, so every token launched on it pays the preset author
 * the partner share of trading fees plus the pool creation fee.
 */
export async function buildCreateConfigTx(
    connection: Connection,
    compiled: CompiledPreset,
    author: PublicKey,
    cluster: Cluster
): Promise<{ tx: Transaction; config: Keypair }> {
    const quoteMint = quoteMintFor(compiled, cluster)
    if (!quoteMint) throw new Error(`${compiled.quote.symbol} is not available on ${cluster}`)

    const config = Keypair.generate()
    const client = new DynamicBondingCurveClient(connection, 'confirmed')
    const tx = await client.partner.createConfig({
        ...compiled.params,
        config: config.publicKey,
        feeClaimer: author,
        leftoverReceiver: author,
        quoteMint,
        payer: author,
        tokenBadge: compiled.quote.requiresBadge ? deriveTokenBadgeAddress(quoteMint) : undefined,
    })
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
    tx.recentBlockhash = blockhash
    tx.lastValidBlockHeight = lastValidBlockHeight
    tx.feePayer = author
    return { tx, config }
}
