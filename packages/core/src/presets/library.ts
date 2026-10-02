import type { FeeSpec, LiquiditySpec, MigrationSpec, PresetSpec } from './spec'

const antiSnipe: FeeSpec = {
    schedule: 'exponential',
    startBps: 5000,
    endBps: 100,
    periods: 60,
    durationSec: 120,
    dynamic: true,
    creatorSharePct: 50,
    poolCreationFeeSol: 0.05,
    collectIn: 'quote',
}

const lockedLp: LiquiditySpec = {
    partnerLockedPct: 50,
    partnerPct: 0,
    creatorLockedPct: 50,
    creatorPct: 0,
}

const dammDefault: MigrationSpec = {
    poolFeeBps: 100,
    collectIn: 'quote',
    dynamicFee: true,
    migrationFeePct: 0,
    creatorMigrationFeePct: 0,
}

export const BUILTIN_PRESETS: PresetSpec[] = [
    {
        version: 1,
        id: 'classic-meme',
        name: 'Classic',
        tagline: 'Familiar $5k → $70k curve with a 2-minute anti-sniper fee decay.',
        category: 'meme',
        recommendedQuotes: ['SOL', 'USDC'],
        supply: { total: 1_000_000_000, baseDecimals: 6, leftover: 1_000 },
        curve: { kind: 'marketCap', startMcapUsd: 5_000, gradMcapUsd: 70_000 },
        fee: antiSnipe,
        migration: dammDefault,
        liquidity: lockedLp,
        tokenAuthority: 'immutable',
    },
    {
        version: 1,
        id: 'long-curve',
        name: 'Long Curve',
        tagline: 'Two-phase curve: fast discovery early, then a long, deep tail to $1M.',
        category: 'meme',
        recommendedQuotes: ['SOL', 'USDC'],
        supply: { total: 1_000_000_000, baseDecimals: 6, leftover: 1_000 },
        curve: {
            kind: 'twoSegment',
            startMcapUsd: 10_000,
            gradMcapUsd: 1_000_000,
            pctSupplyOnMigration: 20,
        },
        fee: { ...antiSnipe, durationSec: 300, periods: 100 },
        migration: dammDefault,
        liquidity: lockedLp,
        tokenAuthority: 'immutable',
    },
    {
        version: 1,
        id: 'stock-quoted',
        name: 'Stock-Quoted Launch',
        tagline: 'Buy in with TSLAx / SPYx. USD targets auto-convert at deploy; LP fees compound after graduation.',
        category: 'stock',
        recommendedQuotes: ['TSLAx', 'NVDAx', 'SPYx'],
        supply: { total: 1_000_000_000, baseDecimals: 6, leftover: 1_000 },
        curve: {
            kind: 'weights',
            startMcapUsd: 25_000,
            gradMcapUsd: 500_000,
            // heavier liquidity late = gentler price growth as the curve matures
            weights: [1, 1, 1.2, 1.4, 1.7, 2, 2.4, 2.9, 3.5, 4.2, 5, 6, 7.2, 8.6, 10.3, 12.4],
        },
        fee: { ...antiSnipe, startBps: 3000, endBps: 80 },
        migration: {
            ...dammDefault,
            poolFeeBps: 60,
            collectIn: 'compounding',
            compoundingFeeBps: 5000,
        },
        liquidity: lockedLp,
        tokenAuthority: 'immutable',
    },
    {
        version: 1,
        id: 'nav-issuance',
        name: 'NAV Primary Issuance',
        tagline: 'Flat curve pinned ±0.5% around a reference NAV. Primary sale for RWA / fund tokens, then a tight DAMM v2 market.',
        category: 'rwa',
        recommendedQuotes: ['USDC'],
        supply: { total: 0, baseDecimals: 6, leftover: 10 },
        curve: {
            kind: 'navBand',
            refPriceUsd: 1,
            bandBps: 50,
            targetRaiseUsd: 250_000,
        },
        fee: {
            schedule: 'linear',
            startBps: 100,
            endBps: 25,
            periods: 10,
            durationSec: 600,
            dynamic: false,
            creatorSharePct: 80,
            poolCreationFeeSol: 0.1,
            collectIn: 'quote',
        },
        migration: {
            poolFeeBps: 10,
            collectIn: 'quote',
            dynamicFee: false,
            migrationFeePct: 0,
            creatorMigrationFeePct: 0,
        },
        liquidity: { partnerLockedPct: 0, partnerPct: 0, creatorLockedPct: 100, creatorPct: 0 },
        tokenAuthority: 'partnerUpdate',
    },
    {
        version: 1,
        id: 'icm-raise',
        name: 'Stepped Raise',
        tagline: 'Internet-capital-markets style raise: a deep seed tier, then priced-up rounds.',
        category: 'icm',
        recommendedQuotes: ['USDC', 'SOL'],
        supply: { total: 1_000_000_000, baseDecimals: 6, leftover: 1_000 },
        curve: {
            kind: 'customPrices',
            // seed $0.0001 → $0.00012, round A → $0.0003, round B → $0.001
            pricesUsd: [0.0001, 0.00012, 0.0003, 0.001],
            weights: [6, 2, 1],
        },
        fee: { ...antiSnipe, startBps: 2000, endBps: 100, creatorSharePct: 70 },
        migration: dammDefault,
        liquidity: { partnerLockedPct: 20, partnerPct: 0, creatorLockedPct: 80, creatorPct: 0 },
        tokenAuthority: 'creatorUpdate',
    },
]

export function getPreset(id: string): PresetSpec {
    const p = BUILTIN_PRESETS.find((x) => x.id === id)
    if (!p) throw new Error(`unknown preset: ${id}`)
    return p
}
