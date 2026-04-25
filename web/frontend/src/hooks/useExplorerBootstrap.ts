import { useEffect, useState } from 'react'
import { fetchFilterOptions, fetchPerformanceHierarchy, type HierarchyAdvertiser } from '../lib/api'

type DateRange = { min?: string; max?: string }

/**
 * Loads hierarchy + global date bounds (from filter-options) for explorer pages.
 * Initializes `dates` to full range once bounds are known.
 */
export function useExplorerBootstrap() {
  const [advertisers, setAdvertisers] = useState<HierarchyAdvertiser[] | null>(null)
  const [options, setOptions] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [dates, setDates] = useState<{ from: string; to: string }>({ from: '', to: '' })

  useEffect(() => {
    let cancelled = false
    setError(null)
    void Promise.all([fetchPerformanceHierarchy(), fetchFilterOptions({})])
      .then(([h, o]) => {
        if (cancelled) return
        setAdvertisers(h.advertisers)
        setOptions(o.options)
      })
      .catch((e) => {
        if (!cancelled) setError(String(e))
      })
    return () => {
      cancelled = true
    }
  }, [])

  const dateRange = options?.date_range as DateRange | undefined

  useEffect(() => {
    if (!dateRange?.min || !dateRange?.max) return
    setDates((d) => {
      if (d.from && d.to) return d
      return { from: dateRange.min!, to: dateRange.max! }
    })
  }, [dateRange?.min, dateRange?.max])

  return {
    advertisers,
    error,
    dateRange,
    dates,
    setDates,
  }
}
