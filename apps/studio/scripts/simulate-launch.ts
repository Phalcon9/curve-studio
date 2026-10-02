// Dry-run a launch against a real config: builds the exact transaction the
// Launch page sends and simulates it (no signatures, nothing is spent).
// usage: tsx scripts/simulate-launch.ts <config> <creator> [firstBuy] [devnet|mainnet-beta]
import { Connection, PublicKey, clusterApiUrl } from '@solana/web3.js'
import { loadConfig } from '../src/lib/onchain'
import { buildLaunchTx } from '../src/lib/launch'

const [config, creator, firstBuy = '0', cluster = 'devnet'] = process.argv.slice(2)
const connection = new Connection(clusterApiUrl(cluster as 'devnet'), 'confirmed')
const loaded = await loadConfig(connection, config)
console.log(`config ok · quote ${loaded.quote.symbol} · ${loaded.pools.length} pools launched so far`)

const { tx, pool } = await buildLaunchTx(connection, loaded, { name: 'Dry Run', symbol: 'DRY', uri: '' }, Number(firstBuy), new PublicKey(creator))
// legacy Transaction without signers: simulated with signature verification off
const sim = await connection.simulateTransaction(tx)
console.log('pool would be', pool.toBase58())
console.log('err:', JSON.stringify(sim.value.err), '· compute units:', sim.value.unitsConsumed)
console.log((sim.value.logs ?? []).filter((l) => /Program log: Instruction|failed|error|Error/i.test(l)).join('\n'))
