import { Connection, Keypair, PublicKey, Transaction } from '@solana/web3.js'
import { DynamicBondingCurveClient, deriveDbcPoolAddress } from '@meteora-ag/dynamic-bonding-curve-sdk'
import { CurveSim, toAtoms } from '@curve-studio/core'
import type { LoadedConfig } from './onchain'
import { referralAccountFor } from './trade'

export type TokenDetails = {
    name: string
    symbol: string
    /** Metaplex-style JSON metadata URL; may be empty. */
    uri: string
}

export const SLIPPAGE_BPS = 100

/**
 * One transaction: create the token + DBC pool on `loaded.config`, optionally
 * followed by the creator's first buy (min fee when the config allows it).
 */
export async function buildLaunchTx(
    connection: Connection,
    loaded: LoadedConfig,
    token: TokenDetails,
    firstBuy: number,
    creator: PublicKey
): Promise<{ tx: Transaction; baseMint: Keypair; pool: PublicKey }> {
    const baseMint = Keypair.generate()
    const client = new DynamicBondingCurveClient(connection, 'confirmed')

    let firstBuyParam
    if (firstBuy > 0) {
        const buyAmount = toAtoms(firstBuy, loaded.quote.decimals)
        const minFee = loaded.config.enableFirstSwapWithMinFee === 1
        const sim = CurveSim.fromOnChain(loaded.config, loaded.quote.decimals, loaded.quote.usdPrice ?? 1)
        const { outputAmount } = sim.quoteBuy(buyAmount, { firstSwapMinFee: minFee })
        firstBuyParam = {
            buyer: creator,
            buyAmount,
            minimumAmountOut: outputAmount.muln(10_000 - SLIPPAGE_BPS).divn(10_000),
            // the program only grants the min-fee first buy when no referral account is passed
            referralTokenAccount: minFee ? null : await referralAccountFor(connection, loaded.config, baseMint.publicKey, false),
        }
    }

    const tx = await client.creator.createPoolWithFirstBuy({
        createPoolParam: {
            name: token.name.trim(),
            symbol: token.symbol.trim().toUpperCase(),
            uri: token.uri.trim(),
            payer: creator,
            poolCreator: creator,
            config: loaded.address,
            baseMint: baseMint.publicKey,
            tokenBadge: loaded.quote.tokenBadge,
        },
        firstBuyParam,
    })

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed')
    tx.recentBlockhash = blockhash
    tx.lastValidBlockHeight = lastValidBlockHeight
    tx.feePayer = creator
    tx.partialSign(baseMint)

    return { tx, baseMint, pool: deriveDbcPoolAddress(loaded.config.quoteMint, baseMint.publicKey, loaded.address) }
}
