import { PublicKey } from '@solana/web3.js'

export type Cluster = 'devnet' | 'mainnet-beta'

export const CLUSTERS: Record<Cluster, string> = {
    devnet: import.meta.env?.VITE_DEVNET_RPC || 'https://api.devnet.solana.com',
    'mainnet-beta': import.meta.env?.VITE_MAINNET_RPC || 'https://api.mainnet-beta.solana.com',
}

/** Earns the referral share (20% of the protocol fee) on swaps placed through this app. */
export const REFERRAL_WALLET: PublicKey | null = (() => {
    const raw = import.meta.env?.VITE_REFERRAL_WALLET
    if (!raw) return null
    try {
        return new PublicKey(raw)
    } catch {
        console.warn(`VITE_REFERRAL_WALLET is not a valid address: ${raw}`)
        return null
    }
})()

export const explorerTx = (sig: string, cluster: Cluster) =>
    `https://solscan.io/tx/${sig}${cluster === 'devnet' ? '?cluster=devnet' : ''}`

export const explorerAccount = (addr: string, cluster: Cluster) =>
    `https://solscan.io/account/${addr}${cluster === 'devnet' ? '?cluster=devnet' : ''}`

/** Where a graduated token trades (DAMM v2, routed by Jupiter). Mainnet only. */
export const jupiterSwap = (quoteMint: string, baseMint: string) => `https://jup.ag/swap/${quoteMint}-${baseMint}`
