import type { QuoteContext } from '@curve-studio/core'

/**
 * Live USD prices for mainnet quote mints via Jupiter's price API. Returns an
 * empty map on any failure so callers keep their fallback prices.
 */
export async function fetchUsdPrices(quotes: QuoteContext[]): Promise<Record<string, number>> {
    const ids = quotes.map((q) => q.mint).join(',')
    try {
        const res = await fetch(`https://lite-api.jup.ag/price/v3?ids=${ids}`)
        if (!res.ok) return {}
        const body = (await res.json()) as Record<string, { usdPrice?: number } | null>
        const out: Record<string, number> = {}
        for (const [mint, v] of Object.entries(body)) {
            if (v?.usdPrice && v.usdPrice > 0) out[mint] = v.usdPrice
        }
        return out
    } catch {
        return {}
    }
}
