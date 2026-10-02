import { useEffect, useMemo, useRef, useState } from 'react'

export type XY = { x: number; y: number }

type Props = {
    data: XY[]
    xFormat: (v: number) => string
    yFormat: (v: number) => string
    xLabel: string
    /** Accessible description of what is plotted. */
    title: string
    height?: number
    /** Optional vertical marker (e.g. end of fee decay window). */
    markerX?: { x: number; label: string }
}

const PAD = { top: 12, right: 16, bottom: 34, left: 64 }

function niceTicks(min: number, max: number, count = 4): number[] {
    const span = max - min || 1
    const step0 = span / count
    const mag = 10 ** Math.floor(Math.log10(step0))
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => span / s <= count) ?? step0
    const start = Math.ceil(min / step) * step
    // last tick is always >= max so the scale never clips the data
    const end = Math.ceil(max / step - 1e-9) * step
    const ticks: number[] = []
    for (let v = start; v <= end + step * 1e-9; v += step) ticks.push(+v.toPrecision(12))
    return ticks
}

export function LineChart({ data, xFormat, yFormat, xLabel, title, height = 240, markerX }: Props) {
    const ref = useRef<SVGSVGElement>(null)
    const [width, setWidth] = useState(640)
    const [hover, setHover] = useState<number | null>(null)

    useEffect(() => {
        if (!ref.current) return
        const ro = new ResizeObserver(([e]) => setWidth(Math.max(280, e.contentRect.width)))
        ro.observe(ref.current)
        return () => ro.disconnect()
    }, [])

    const geo = useMemo(() => {
        const xs = data.map((d) => d.x)
        const ys = data.map((d) => d.y)
        const x0 = Math.min(...xs)
        const x1 = Math.max(...xs)
        const yTicks = niceTicks(0, Math.max(...ys))
        const y1 = yTicks.at(-1)!
        const iw = width - PAD.left - PAD.right
        const ih = height - PAD.top - PAD.bottom
        const sx = (v: number) => PAD.left + ((v - x0) / (x1 - x0 || 1)) * iw
        const sy = (v: number) => PAD.top + ih - (v / (y1 || 1)) * ih
        const line = data.map((d, i) => `${i ? 'L' : 'M'}${sx(d.x).toFixed(1)},${sy(d.y).toFixed(1)}`).join('')
        const area = `${line}L${sx(x1)},${sy(0)}L${sx(x0)},${sy(0)}Z`
        return { sx, sy, line, area, yTicks, xTicks: niceTicks(x0, x1, 5).filter((t) => t <= x1), ih }
    }, [data, width, height])

    const onMove = (e: React.PointerEvent) => {
        const rect = ref.current!.getBoundingClientRect()
        const px = e.clientX - rect.left
        let best = 0
        for (let i = 1; i < data.length; i++) {
            if (Math.abs(geo.sx(data[i].x) - px) < Math.abs(geo.sx(data[best].x) - px)) best = i
        }
        setHover(best)
    }

    const h = hover !== null ? data[hover] : null

    return (
        <div className="relative">
            <svg
                ref={ref}
                width="100%"
                height={height}
                role="img"
                aria-label={title}
                onPointerMove={onMove}
                onPointerLeave={() => setHover(null)}
                className="block touch-none select-none"
            >
                {geo.yTicks.map((t) => (
                    <g key={t}>
                        <line x1={PAD.left} x2={width - PAD.right} y1={geo.sy(t)} y2={geo.sy(t)} stroke="var(--grid)" />
                        <text x={PAD.left - 8} y={geo.sy(t)} dy="0.32em" textAnchor="end" className="tnum" fontSize={11} fill="var(--text-muted)">
                            {yFormat(t)}
                        </text>
                    </g>
                ))}
                {geo.xTicks.map((t) => (
                    <text key={t} x={geo.sx(t)} y={height - PAD.bottom + 16} textAnchor="middle" className="tnum" fontSize={11} fill="var(--text-muted)">
                        {xFormat(t)}
                    </text>
                ))}
                <text x={width - PAD.right} y={height - 4} textAnchor="end" fontSize={11} fill="var(--text-muted)">
                    {xLabel}
                </text>
                <line x1={PAD.left} x2={width - PAD.right} y1={geo.sy(0)} y2={geo.sy(0)} stroke="var(--axis)" />

                {markerX && (
                    <g>
                        <line x1={geo.sx(markerX.x)} x2={geo.sx(markerX.x)} y1={PAD.top} y2={geo.sy(0)} stroke="var(--axis)" />
                        <text x={geo.sx(markerX.x) + 4} y={PAD.top + 10} fontSize={11} fill="var(--text-muted)">
                            {markerX.label}
                        </text>
                    </g>
                )}

                <path d={geo.area} fill="var(--series-1)" opacity={0.1} />
                <path d={geo.line} fill="none" stroke="var(--series-1)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />

                {h && (
                    <g pointerEvents="none">
                        <line x1={geo.sx(h.x)} x2={geo.sx(h.x)} y1={PAD.top} y2={geo.sy(0)} stroke="var(--axis)" />
                        <circle cx={geo.sx(h.x)} cy={geo.sy(h.y)} r={5} fill="var(--series-1)" stroke="var(--surface-1)" strokeWidth={2} />
                    </g>
                )}
            </svg>
            {h && (
                <div
                    className="pointer-events-none absolute top-1 rounded-md border border-line bg-surface px-2.5 py-1.5 text-xs shadow-sm"
                    style={{
                        left: Math.min(geo.sx(h.x) + 10, width - 150),
                    }}
                >
                    <div className="font-semibold text-ink tnum">{yFormat(h.y)}</div>
                    <div className="text-ink-2 tnum">{xFormat(h.x)}</div>
                </div>
            )}
        </div>
    )
}
