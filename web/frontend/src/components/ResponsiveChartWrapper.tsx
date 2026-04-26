import type { ReactNode } from 'react'

export function ResponsiveChartWrapper({ children }: { children: ReactNode }) {
  return <div style={{ display: 'block', width: '100%', height: '100%', minHeight: 1, minWidth: 0 }}>{children}</div>
}
