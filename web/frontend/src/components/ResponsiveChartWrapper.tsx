import type { ReactNode } from 'react'

export function ResponsiveChartWrapper({ children }: { children: ReactNode }) {
  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0, minWidth: 0 }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        {children}
      </div>
    </div>
  )
}
