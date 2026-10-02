import type BN from 'bn.js'
import { fromAtoms, type PresetCategory } from '@curve-studio/core'

const compact = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 })

export const usd = (v: number) => {
    if (!Number.isFinite(v)) return '–'
    if (v === 0) return '$0'
    if (Math.abs(v) >= 1000) return `$${compact.format(v)}`
    if (Math.abs(v) >= 1) return `$${v.toFixed(2)}`
    return `$${v.toPrecision(3)}`
}

export const num = (v: number) =>
    Math.abs(v) >= 1000 ? compact.format(v) : v >= 1 ? String(+v.toFixed(1)) : v === 0 ? '0' : String(+v.toPrecision(3))

export const pct = (v: number, digits = 0) => `${v.toFixed(digits)}%`

export const bps = (v: number) => `${Math.round(v).toLocaleString('en-US')} bps`

export const duration = (sec: number) => (sec >= 120 ? `${+(sec / 60).toFixed(1)}m` : `${Math.round(sec)}s`)

export const short = (addr: string) => `${addr.slice(0, 4)}…${addr.slice(-4)}`

/** Token amount from atoms, compact. */
export const amount = (atoms: BN, decimals: number) => num(fromAtoms(atoms, decimals).toNumber())

export const CATEGORY_LABEL: Record<PresetCategory, string> = { meme: 'Meme', stock: 'Stocks', icm: 'ICM', rwa: 'RWA', ai: 'AI' }
