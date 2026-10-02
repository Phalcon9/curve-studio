import { TokenType } from '@meteora-ag/dynamic-bonding-curve-sdk'

/**
 * The quote asset a preset is compiled against. USD-denominated preset
 * targets are converted into quote units with `usdPrice`, so the same preset
 * can be deployed against SOL, USDC or a tokenized stock.
 */
export type QuoteContext = {
    symbol: string
    mint: string
    decimals: number
    tokenType: TokenType
    /** USD value of one whole quote token at compile time. */
    usdPrice: number
    /**
     * Token-2022 mints with extensions beyond metadata need a Meteora
     * TokenBadge in both DBC (to create the config) and DAMM v2 (to migrate).
     */
    requiresBadge: boolean
    kind: 'native' | 'stable' | 'stock' | 'etf'
}

export const SOL: QuoteContext = {
    symbol: 'SOL',
    mint: 'So11111111111111111111111111111111111111112',
    decimals: 9,
    tokenType: TokenType.SPLToken,
    usdPrice: 200,
    requiresBadge: false,
    kind: 'native',
}

export const USDC: QuoteContext = {
    symbol: 'USDC',
    mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
    decimals: 6,
    tokenType: TokenType.SPLToken,
    usdPrice: 1,
    requiresBadge: false,
    kind: 'stable',
}

// xStocks are Token-2022 with transferHook / permanentDelegate / pausable
// extensions; each of these was verified badged in both DBC and DAMM v2 on
// mainnet (2026-09-29).
const xStock = (symbol: string, mint: string, usdPrice: number, kind: 'stock' | 'etf' = 'stock'): QuoteContext => ({
    symbol,
    mint,
    decimals: 8,
    tokenType: TokenType.Token2022,
    usdPrice,
    requiresBadge: true,
    kind,
})

export const TSLAX = xStock('TSLAx', 'XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB', 250)
export const NVDAX = xStock('NVDAx', 'Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh', 120)
export const SPYX = xStock('SPYx', 'XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W', 600, 'etf')

export const KNOWN_QUOTES = [SOL, USDC, TSLAX, NVDAX, SPYX]

export function withUsdPrice(quote: QuoteContext, usdPrice: number): QuoteContext {
    if (!(usdPrice > 0)) throw new Error(`invalid ${quote.symbol} price: ${usdPrice}`)
    return { ...quote, usdPrice }
}
