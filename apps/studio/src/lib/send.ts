import type { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'

export type TxSigner = {
    signTransaction: <T extends Transaction>(tx: T) => Promise<T>
    signAllTransactions?: <T extends Transaction>(txs: T[]) => Promise<T[]>
}

/** Raised when a later transaction fails; `sent` holds the ones that landed before it. */
export class SendError extends Error {
    sent: string[]
    constructor(message: string, sent: string[]) {
        super(message)
        this.sent = sent
    }
}

/** Stamp one recent blockhash and fee payer on every transaction. Call before any partialSign. */
export async function prepare(connection: Connection, txs: Transaction[], feePayer: PublicKey) {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
    for (const tx of txs) {
        tx.recentBlockhash = blockhash
        tx.lastValidBlockHeight = lastValidBlockHeight
        tx.feePayer = feePayer
    }
}

/**
 * One wallet prompt for all transactions, then send and confirm them in order,
 * stopping at the first failure so no step runs after a failed one.
 * `cosigners[i]` (e.g. a new mint or config keypair) sign transaction i after
 * the wallet: Phantom can't simulate a transaction that is already partially
 * signed and blocks it as possibly malicious.
 */
export async function signAndSendAll(
    connection: Connection,
    wallet: TxSigner,
    txs: Transaction[],
    onStep: (step: string) => void = () => {},
    cosigners: Keypair[][] = []
): Promise<string[]> {
    onStep('Waiting for wallet')
    const signed =
        txs.length > 1 && wallet.signAllTransactions
            ? await wallet.signAllTransactions(txs)
            : await txs.reduce<Promise<Transaction[]>>(async (acc, tx) => [...(await acc), await wallet.signTransaction(tx)], Promise.resolve([]))
    signed.forEach((tx, i) => cosigners[i]?.length && tx.partialSign(...cosigners[i]))

    const sent: string[] = []
    for (const [i, tx] of signed.entries()) {
        onStep(signed.length > 1 ? `Confirming ${i + 1}/${signed.length}` : 'Confirming')
        try {
            sent.push(await sendAndConfirm(connection, tx.serialize(), tx.lastValidBlockHeight!))
        } catch (e) {
            throw new SendError(e instanceof Error ? e.message : String(e), sent)
        }
    }
    return sent
}

const POLL_MS = 1500
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const landed = (s: { confirmationStatus?: string } | null) => s?.confirmationStatus === 'confirmed' || s?.confirmationStatus === 'finalized'

/**
 * Send, then poll for the signature and re-broadcast until the blockhash
 * expires. web3.js' confirmTransaction waits on a websocket notification that
 * public RPCs drop, which reported landed transactions as expired.
 */
async function sendAndConfirm(connection: Connection, raw: Buffer, lastValidBlockHeight: number): Promise<string> {
    const sig = await connection.sendRawTransaction(raw, { maxRetries: 0 })
    for (;;) {
        await sleep(POLL_MS)
        const [status] = (await connection.getSignatureStatuses([sig])).value
        if (status?.err) throw new Error(`transaction failed: ${JSON.stringify(status.err)}`)
        if (landed(status)) return sig
        if ((await connection.getBlockHeight('confirmed')) > lastValidBlockHeight) {
            // it can land in the last blocks before expiry; check history before giving up
            const [final] = (await connection.getSignatureStatuses([sig], { searchTransactionHistory: true })).value
            if (final?.err) throw new Error(`transaction failed: ${JSON.stringify(final.err)}`)
            if (landed(final)) return sig
            throw new Error('The transaction expired before the network confirmed it, so nothing was charged. Try again.')
        }
        connection.sendRawTransaction(raw, { skipPreflight: true, maxRetries: 0 }).catch(() => {})
    }
}

export function errorMessage(e: unknown): string {
    const message = e instanceof Error ? e.message : String(e)
    // the public mainnet endpoint rejects every request that carries a browser Origin
    if (/\b403\b|Access forbidden/.test(message)) return 'This RPC endpoint refuses browser requests. Set VITE_MAINNET_RPC to a dedicated RPC (e.g. a free Helius key).'
    if (/\b429\b|Too many requests/i.test(message)) return 'The RPC endpoint is rate-limiting. Try again in a moment, or set a dedicated RPC.'
    return message
}
