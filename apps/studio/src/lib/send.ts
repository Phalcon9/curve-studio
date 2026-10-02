import type { Connection, PublicKey, Transaction } from '@solana/web3.js'

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
 */
export async function signAndSendAll(
    connection: Connection,
    wallet: TxSigner,
    txs: Transaction[],
    onStep: (step: string) => void = () => {}
): Promise<string[]> {
    onStep('Waiting for wallet')
    const signed =
        txs.length > 1 && wallet.signAllTransactions
            ? await wallet.signAllTransactions(txs)
            : await txs.reduce<Promise<Transaction[]>>(async (acc, tx) => [...(await acc), await wallet.signTransaction(tx)], Promise.resolve([]))

    const sent: string[] = []
    for (const [i, tx] of signed.entries()) {
        onStep(signed.length > 1 ? `Confirming ${i + 1}/${signed.length}` : 'Confirming')
        try {
            const sig = await connection.sendRawTransaction(tx.serialize())
            const { value } = await connection.confirmTransaction(
                { signature: sig, blockhash: tx.recentBlockhash!, lastValidBlockHeight: tx.lastValidBlockHeight! },
                'confirmed'
            )
            if (value.err) throw new Error(`transaction failed: ${JSON.stringify(value.err)}`)
            sent.push(sig)
        } catch (e) {
            throw new SendError(e instanceof Error ? e.message : String(e), sent)
        }
    }
    return sent
}

export function errorMessage(e: unknown): string {
    const message = e instanceof Error ? e.message : String(e)
    // the public mainnet endpoint rejects every request that carries a browser Origin
    if (/\b403\b|Access forbidden/.test(message)) return 'This RPC endpoint refuses browser requests. Set VITE_MAINNET_RPC to a dedicated RPC (e.g. a free Helius key).'
    if (/\b429\b|Too many requests/i.test(message)) return 'The RPC endpoint is rate-limiting. Try again in a moment, or set a dedicated RPC.'
    return message
}
