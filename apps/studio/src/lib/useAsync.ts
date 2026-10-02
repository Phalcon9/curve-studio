import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { errorMessage } from './send'

/** `previous` is the last data loaded for the same key, kept on screen while reloading or after a failed reload. */
export type AsyncState<T> =
    | { kind: 'idle' }
    | { kind: 'loading'; previous?: T }
    | { kind: 'error'; message: string; previous?: T }
    | { kind: 'ready'; data: T }

type Result<T> = { key: string; nonce: number; state: AsyncState<T> }

const latest = <T,>(s: AsyncState<T> | undefined): T | undefined =>
    s?.kind === 'ready' ? s.data : s?.kind === 'loading' || s?.kind === 'error' ? s.previous : undefined

/** The data to render: fresh, or the previous load's while a reload is in flight or failed. */
export const dataOf = latest

/** Run `load` whenever `key` changes (null = don't run); `reload()` runs it again. */
export function useAsync<T>(key: string | null, load: () => Promise<T>): { state: AsyncState<T>; reload: () => void } {
    const loadRef = useRef(load)
    useLayoutEffect(() => {
        loadRef.current = load
    })
    const [nonce, setNonce] = useState(0)
    const [result, setResult] = useState<Result<T> | null>(null)

    useEffect(() => {
        if (key === null) return
        let cancelled = false
        const settle = (next: (prev?: T) => AsyncState<T>) =>
            !cancelled && setResult((r) => ({ key, nonce, state: next(r?.key === key ? latest(r.state) : undefined) }))
        loadRef.current().then(
            (data) => settle(() => ({ kind: 'ready', data })),
            (e) => settle((previous) => ({ kind: 'error', message: errorMessage(e), previous }))
        )
        return () => {
            cancelled = true
        }
    }, [key, nonce])

    let state: AsyncState<T>
    if (key === null) state = { kind: 'idle' }
    else if (result?.key === key && result.nonce === nonce) state = result.state
    else state = { kind: 'loading', previous: result?.key === key ? latest(result.state) : undefined }

    const reload = useCallback(() => setNonce((n) => n + 1), [])
    return { state, reload }
}
