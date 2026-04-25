import { useEffect, useState } from 'react'
import {
  fetchPerformanceQuery,
  type PerformanceFilters,
  type PerformanceQueryResponse,
} from '../lib/api'
import { performanceDailyQueryBase, type PerformanceBreakdownKey } from '../lib/performanceQueryDefaults'

export type PerformanceSliceOptions = {
  /** Request additional grouped slices (same filtered fact rows as summary / timeseries). */
  extraBreakdowns?: readonly string[] | string[]
}

/**
 * Runs /api/performance/query when `filters` is non-null and dates are set.
 */
export function usePerformanceSlice(
  filters: PerformanceFilters | null,
  breakdown: PerformanceBreakdownKey,
  options?: PerformanceSliceOptions | null,
) {
  const [data, setData] = useState<PerformanceQueryResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)

  const extraKey = options?.extraBreakdowns?.length ? options.extraBreakdowns.join(',') : ''

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
      breakdowns: options?.extraBreakdowns?.length ? [...options.extraBreakdowns] : undefined,
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
  }, [filters, breakdown, extraKey])

  return { data, err }
}
