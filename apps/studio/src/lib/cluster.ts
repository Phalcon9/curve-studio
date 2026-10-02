export type Cluster = 'devnet' | 'mainnet-beta'

export const CLUSTERS: Record<Cluster, string> = {
    devnet: import.meta.env.VITE_DEVNET_RPC ?? 'https://api.devnet.solana.com',
    'mainnet-beta': import.meta.env.VITE_MAINNET_RPC ?? 'https://api.mainnet-beta.solana.com',
}

export const explorerTx = (sig: string, cluster: Cluster) =>
    `https://solscan.io/tx/${sig}${cluster === 'devnet' ? '?cluster=devnet' : ''}`

export const explorerAccount = (addr: string, cluster: Cluster) =>
    `https://solscan.io/account/${addr}${cluster === 'devnet' ? '?cluster=devnet' : ''}`
