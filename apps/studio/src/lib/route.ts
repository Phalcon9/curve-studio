import { useEffect, useState } from 'react'
import type { Cluster } from './cluster'

export type Route = { view: 'studio' } | { view: 'launch'; config: string }

function parse(): Route {
    const p = new URLSearchParams(location.search)
    const config = p.get('launch')
    return config !== null ? { view: 'launch', config } : { view: 'studio' }
}

export function clusterFromUrl(): Cluster | null {
    const c = new URLSearchParams(location.search).get('cluster')
    return c === 'devnet' || c === 'mainnet-beta' ? c : null
}

export function launchUrl(config: string, cluster: Cluster): string {
    return `${location.origin}${location.pathname}?launch=${config}&cluster=${cluster}`
}

export function navigate(route: Route, cluster: Cluster) {
    const url =
        route.view === 'launch'
            ? `?launch=${route.config}&cluster=${cluster}`
            : location.pathname
    history.pushState(null, '', url)
    dispatchEvent(new PopStateEvent('popstate'))
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
