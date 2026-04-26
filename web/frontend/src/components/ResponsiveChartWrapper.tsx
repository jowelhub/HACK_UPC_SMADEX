import { useEffect, useRef, useState, type ReactNode } from 'react'

export function ResponsiveChartWrapper({ children }: { children: ReactNode }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const node = hostRef.current
    if (!node) return

    const update = () => {
      const rect = node.getBoundingClientRect()
      setReady(rect.width > 0 && rect.height > 0)
    }

    update()

    const ro = new ResizeObserver(() => update())
    ro.observe(node)
    window.addEventListener('resize', update)

    return () => {
      ro.disconnect()
      window.removeEventListener('resize', update)
    }
  }, [])

  return (
    <div ref={hostRef} style={{ display: 'block', width: '100%', height: '100%', minHeight: 1, minWidth: 0 }}>
      {ready ? children : null}
    </div>
  )
}
