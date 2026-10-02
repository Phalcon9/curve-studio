import BN from 'bn.js'
import Decimal from 'decimal.js'

Decimal.set({ precision: 64, toExpNeg: -40, toExpPos: 40 })

const Q64 = new Decimal(2).pow(64)

/** Human price (quote per base) -> Q64.64 sqrt price used by DBC. */
export function sqrtPriceFromPrice(
    price: Decimal.Value,
    baseDecimals: number,
    quoteDecimals: number
): BN {
    const scaled = new Decimal(price).mul(
        new Decimal(10).pow(quoteDecimals - baseDecimals)
    )
    return new BN(scaled.sqrt().mul(Q64).floor().toFixed(0))
}

/** Q64.64 sqrt price -> human price (quote per base). */
export function priceFromSqrtPrice(
    sqrtPrice: BN,
    baseDecimals: number,
    quoteDecimals: number
): Decimal {
    const ratio = new Decimal(sqrtPrice.toString()).div(Q64)
    return ratio
        .mul(ratio)
        .mul(new Decimal(10).pow(baseDecimals - quoteDecimals))
}

export function toAtoms(amount: Decimal.Value, decimals: number): BN {
    return new BN(
        new Decimal(amount).mul(new Decimal(10).pow(decimals)).floor().toFixed(0)
    )
}

export function fromAtoms(amount: BN, decimals: number): Decimal {
    return new Decimal(amount.toString()).div(new Decimal(10).pow(decimals))
}
