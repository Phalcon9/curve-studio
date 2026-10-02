import { StrictMode, useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ConnectionProvider, WalletProvider } from '@solana/wallet-adapter-react'
import { WalletModalProvider } from '@solana/wallet-adapter-react-ui'
import { PhantomWalletAdapter } from '@solana/wallet-adapter-phantom'
import { SolflareWalletAdapter } from '@solana/wallet-adapter-solflare'
import '@solana/wallet-adapter-react-ui/styles.css'
import './index.css'
import App from './App'
import { CLUSTERS, type Cluster } from './lib/cluster'
import { clusterFromUrl } from './lib/route'

function Root() {
    const [cluster, setCluster] = useState<Cluster>(() => clusterFromUrl() ?? 'devnet')
    const endpoint = useMemo(() => CLUSTERS[cluster], [cluster])
    // Listed explicitly so they show (with an install link) even when no
    // extension is detected; other Wallet Standard wallets still self-register.
    const wallets = useMemo(() => [new PhantomWalletAdapter(), new SolflareWalletAdapter()], [])
    return (
        <ConnectionProvider endpoint={endpoint}>
            <WalletProvider wallets={wallets} autoConnect>
                <WalletModalProvider>
                    <App cluster={cluster} onClusterChange={setCluster} />
                </WalletModalProvider>
            </WalletProvider>
        </ConnectionProvider>
    )
}

createRoot(document.getElementById('root')!).render(
    <StrictMode>
        <Root />
    </StrictMode>
)
