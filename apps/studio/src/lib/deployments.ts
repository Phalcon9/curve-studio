import type { PresetSpec } from '@curve-studio/core'
import type { Cluster } from './cluster'

export type Deployment = {
    config: string
    sig: string
    cluster: Cluster
    presetName: string
    spec: PresetSpec
    quoteSymbol: string
    author: string
    at: number
}

const KEY = 'curve-studio:deployments'

// Local convenience list only — the config account on-chain is the source of truth.
export function loadDeployments(): Deployment[] {
    try {
        return JSON.parse(localStorage.getItem(KEY) ?? '[]') as Deployment[]
    } catch {
        return []
    }
}

export function saveDeployment(d: Deployment) {
    try {
        localStorage.setItem(KEY, JSON.stringify([d, ...loadDeployments()].slice(0, 50)))
    } catch {
        // storage unavailable (private mode) — deployment still exists on-chain
    }
}
