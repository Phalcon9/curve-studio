import type { CSSProperties } from 'react'
import type { PresetCategory } from '@curve-studio/core'

export const CATEGORY_TONE: Record<PresetCategory, string> = {
    meme: '#f472b6',
    stock: '#22d3ee',
    icm: '#a78bfa',
    rwa: '#fbbf24',
    ai: '#34d399',
}

/** Inline style that sets the --hue a .chip, .tile or .stat is tinted with. */
export const hue = (color: string) => ({ '--hue': color }) as CSSProperties
