/**
 * A preset is a JSON-serialisable, quote-agnostic description of a DBC launch.
 * Market-cap and price targets are in USD; `compilePreset` converts them into
 * quote units for a concrete QuoteContext and produces DBC ConfigParameters.
 */
export type PresetCategory = 'meme' | 'stock' | 'icm' | 'rwa' | 'ai'

export type CurveSpec =
    /** Classic constant-product style curve between two market caps. */
    | { kind: 'marketCap'; startMcapUsd: number; gradMcapUsd: number }
    /** Two segments: a steep early leg and a long flat tail. */
    | {
          kind: 'twoSegment'
          startMcapUsd: number
          gradMcapUsd: number
          /** % of supply that goes to the DAMM v2 pool at graduation. */
          pctSupplyOnMigration: number
      }
    /** Up to 16 segments with relative liquidity weights (shape control). */
    | {
          kind: 'weights'
          startMcapUsd: number
          gradMcapUsd: number
          weights: number[]
      }
    /**
     * Near-flat curve pinned to a reference price (NAV / RFQ quote).
     * Buyers pay within ±bandBps of the reference until the raise fills.
     */
    | {
          kind: 'navBand'
          refPriceUsd: number
          bandBps: number
          /** Total supply is derived so the curve raises ~this much USD. */
          targetRaiseUsd: number
      }
    /** Explicit USD price checkpoints (ascending) with optional weights. */
    | { kind: 'customPrices'; pricesUsd: number[]; weights?: number[] }

export type FeeSpec = {
    /** Anti-sniper decay from startBps to endBps over durationSec. */
    schedule: 'linear' | 'exponential'
    startBps: number
    endBps: number
    periods: number
    durationSec: number
    dynamic: boolean
    /** % of the post-protocol trading fee that goes to the token creator (rest to the preset author). */
    creatorSharePct: number
    /** SOL charged per launch, claimable by the preset author. */
    poolCreationFeeSol: number
    collectIn: 'quote' | 'output'
}

export type MigrationSpec = {
    /** Fee tier of the DAMM v2 pool after graduation. */
    poolFeeBps: number
    collectIn: 'quote' | 'output' | 'compounding'
    compoundingFeeBps?: number
    dynamicFee: boolean
    /** % of migration quote taken as a fee at graduation. */
    migrationFeePct: number
    creatorMigrationFeePct: number
}

export type LiquiditySpec = {
    partnerLockedPct: number
    partnerPct: number
    creatorLockedPct: number
    creatorPct: number
}

export type PresetSpec = {
    version: 1
    id: string
    name: string
    tagline: string
    category: PresetCategory
    /** Which quote kinds the author designed this for (UI hint, not enforced). */
    recommendedQuotes: string[]
    supply: {
        /** Ignored for navBand (derived from target raise). */
        total: number
        baseDecimals: 6 | 7 | 8 | 9
        leftover: number
    }
    curve: CurveSpec
    fee: FeeSpec
    migration: MigrationSpec
    liquidity: LiquiditySpec
    tokenAuthority: 'immutable' | 'creatorUpdate' | 'partnerUpdate'
}
