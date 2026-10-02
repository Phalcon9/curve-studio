import BN from 'bn.js'
import { Connection, PublicKey, type ParsedAccountData } from '@solana/web3.js'
import { deriveMintMetadata, findAssociatedTokenAddress, isNativeSol, TokenType } from '@meteora-ag/dynamic-bonding-curve-sdk'

export type TokenMeta = { name: string; symbol: string; uri: string }

const decoder = new TextDecoder()

function readBorshString(data: Uint8Array, offset: number): [string, number] {
    const len = new DataView(data.buffer, data.byteOffset, data.byteLength).getUint32(offset, true)
    const end = offset + 4 + len
    if (end > data.length) throw new Error('truncated string')
    return [decoder.decode(data.subarray(offset + 4, end)).replace(/\0+$/, '').trim(), end]
}

/** Metaplex metadata account: key (1) · update authority (32) · mint (32) · name · symbol · uri. */
export function parseMetaplexMetadata(data: Uint8Array): TokenMeta | null {
    try {
        const [name, o1] = readBorshString(data, 65)
        const [symbol, o2] = readBorshString(data, o1)
        const [uri] = readBorshString(data, o2)
        return { name, symbol, uri }
    } catch {
        return null
    }
}

type TokenMetadataExtension = { extension: string; state?: { name?: string; symbol?: string; uri?: string } }

/**
 * Name/symbol for tokens launched on one config (they share a token type):
 * Metaplex metadata for SPL tokens, the metadata extension for Token-2022.
 */
export async function fetchTokenMetas(connection: Connection, mints: PublicKey[], tokenType: number): Promise<Map<string, TokenMeta>> {
    const out = new Map<string, TokenMeta>()
    for (let i = 0; i < mints.length; i += 100) {
        const chunk = mints.slice(i, i + 100)
        if (tokenType === TokenType.Token2022) {
            const { value } = await connection.getMultipleParsedAccounts(chunk)
            value.forEach((acc, j) => {
                const extensions = (acc?.data as ParsedAccountData | undefined)?.parsed?.info?.extensions as TokenMetadataExtension[] | undefined
                const state = extensions?.find((e) => e.extension === 'tokenMetadata')?.state
                if (state?.name) out.set(chunk[j].toBase58(), { name: state.name, symbol: state.symbol ?? '', uri: state.uri ?? '' })
            })
        } else {
            const accounts = await connection.getMultipleAccountsInfo(chunk.map(deriveMintMetadata))
            accounts.forEach((acc, j) => {
                const meta = acc && parseMetaplexMetadata(acc.data)
                if (meta) out.set(chunk[j].toBase58(), meta)
            })
        }
    }
    return out
}

/** Spendable balance in atoms: lamports for SOL (the swap wraps it), else the owner's ATA. */
export async function tokenBalance(connection: Connection, owner: PublicKey, mint: PublicKey, tokenProgram: PublicKey): Promise<BN> {
    if (isNativeSol(mint)) return new BN(await connection.getBalance(owner, 'confirmed'))
    try {
        const { value } = await connection.getTokenAccountBalance(findAssociatedTokenAddress(owner, mint, tokenProgram), 'confirmed')
        return new BN(value.amount)
    } catch {
        return new BN(0) // no token account yet
    }
}

/** Lamports kept back when spending SOL: fees plus rent for the token accounts a swap may open. */
export const SOL_RESERVE_LAMPORTS = 15_000_000
