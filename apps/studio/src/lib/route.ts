import { useEffect, useState } from 'react'
import type { Cluster } from './cluster'

export type Route =
    | { view: 'studio' }
    | { view: 'market' }
    | { view: 'launch'; config: string }
    | { view: 'token'; pool: string }
    | { view: 'earnings'; wallet?: string }

function parse(): Route {
    const p = new URLSearchParams(location.search)
    const config = p.get('launch')
    if (config !== null) return { view: 'launch', config }
    const pool = p.get('token')
    if (pool !== null) return { view: 'token', pool }
    const view = p.get('view')
    if (view === 'market') return { view }
    if (view === 'earnings') return { view, wallet: p.get('wallet') ?? undefined }
    return { view: 'studio' }
}

export function clusterFromUrl(): Cluster | null {
    const c = new URLSearchParams(location.search).get('cluster')
    return c === 'devnet' || c === 'mainnet-beta' ? c : null
}

function search(route: Route, cluster: Cluster): string {
    const p = new URLSearchParams()
    if (route.view === 'launch') p.set('launch', route.config)
    else if (route.view === 'token') p.set('token', route.pool)
    else if (route.view !== 'studio') p.set('view', route.view)
    if (route.view === 'earnings' && route.wallet) p.set('wallet', route.wallet)
    p.set('cluster', cluster)
    return `?${p}`
}

export const routeUrl = (route: Route, cluster: Cluster) => `${location.origin}${location.pathname}${search(route, cluster)}`

export const launchUrl = (config: string, cluster: Cluster) => routeUrl({ view: 'launch', config }, cluster)

export function navigate(route: Route, cluster: Cluster) {
    history.pushState(null, '', search(route, cluster))
    dispatchEvent(new PopStateEvent('popstate'))
    scrollTo({ top: 0 })
}

export function useRoute(): Route {
    const [route, setRoute] = useState(parse)
    useEffect(() => {
        const on = () => setRoute(parse())
        addEventListener('popstate', on)
        return () => removeEventListener('popstate', on)
    }, [])
    return route
}
