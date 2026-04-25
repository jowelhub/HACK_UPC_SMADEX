import { useEffect, useState } from 'react'
import {
  fetchPerformanceQuery,
  type PerformanceFilters,
  type PerformanceQueryResponse,
} from '../lib/api'
import { performanceDailyQueryBase, type PerformanceBreakdownKey } from '../lib/performanceQueryDefaults'

/**
 * Runs /api/performance/query when `filters` is non-null and dates are set.
 */
export function usePerformanceSlice(filters: PerformanceFilters | null, breakdown: PerformanceBreakdownKey) {
  const [data, setData] = useState<PerformanceQueryResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    if (!filters?.date_from || !filters?.date_to) {
      setData(null)
      return
    }
    let cancelled = false
    setErr(null)
    void fetchPerformanceQuery({
      filters,
      ...performanceDailyQueryBase,
      breakdown,
    })
      .then((r) => {
        if (!cancelled) setData(r)
      })
      .catch((e) => {
        if (!cancelled) setErr(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [filters, breakdown])

  return { data, err }
}
