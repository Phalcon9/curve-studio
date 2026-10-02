// Open the referral wallet's token accounts for every known quote mint. Swaps
// placed through the app only pass a referral account that already exists
// (traders never pay its rent), so without these the referral share is skipped.
// usage: tsx scripts/setup-referral.ts <referral-wallet> [devnet|mainnet-beta] [payer-keypair.json]
// Without a keypair it only reports which accounts are missing.
import { readFileSync } from 'node:fs'
import { Connection, Keypair, PublicKey, Transaction, clusterApiUrl, sendAndConfirmTransaction } from '@solana/web3.js'
import { getOrCreateATAInstruction, getTokenProgram } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { KNOWN_QUOTES } from '@curve-studio/core'
import { DEVNET_MINT_OVERRIDES } from '../src/lib/deploy'

const [wallet, cluster = 'devnet', keypairPath] = process.argv.slice(2)
if (!wallet) throw new Error('usage: tsx scripts/setup-referral.ts <referral-wallet> [devnet|mainnet-beta] [payer-keypair.json]')
if (cluster !== 'devnet' && cluster !== 'mainnet-beta') throw new Error(`unknown cluster: ${cluster}`)

const owner = new PublicKey(wallet)
const connection = new Connection(process.env.RPC ?? clusterApiUrl(cluster), 'confirmed')
const payer = keypairPath ? Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(keypairPath, 'utf8')))) : null

// devnet has stand-ins for some mainnet quotes and nothing for the xStocks
const quotes =
    cluster === 'mainnet-beta'
        ? KNOWN_QUOTES
        : KNOWN_QUOTES.filter((q) => q.kind === 'native' || DEVNET_MINT_OVERRIDES[q.mint]).map((q) => ({ ...q, mint: DEVNET_MINT_OVERRIDES[q.mint] ?? q.mint }))

const tx = new Transaction()
for (const q of quotes) {
    const { ataPubkey, ix } = await getOrCreateATAInstruction(connection, new PublicKey(q.mint), owner, payer?.publicKey ?? owner, true, getTokenProgram(q.tokenType))
    console.log(`${q.symbol.padEnd(6)} ${ataPubkey.toBase58()}  ${ix ? 'missing' : 'ok'}`)
    if (ix) tx.add(ix)
}

if (tx.instructions.length === 0) console.log('All referral accounts exist.')
else if (!payer) console.log(`Pass a payer keypair to open ${tx.instructions.length} account(s), ~0.002 SOL rent each.`)
else console.log('Opened:', await sendAndConfirmTransaction(connection, tx, [payer]))
