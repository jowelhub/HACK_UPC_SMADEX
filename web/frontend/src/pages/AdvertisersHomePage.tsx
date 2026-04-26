import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { fetchPerformanceHierarchy, type HierarchyAdvertiser } from '../lib/api'
import { formatMetaLine, PAGE_SECTION, UI_COPY } from '../lib/performanceLabels'
import { pathAdvertiser } from '../lib/routes'
import { explorerUi } from '../lib/explorerUi'

export function AdvertisersHomePage() {
  const [rows, setRows] = useState<HierarchyAdvertiser[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const isLoading = !rows && !err

  useEffect(() => {
    void fetchPerformanceHierarchy()
      .then((h) => setRows(h.advertisers))
      .catch((e) => setErr(String(e)))
  }, [])

  if (isLoading) {
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <div className="flex items-center gap-3 rounded-full border border-stone-200 bg-white px-5 py-2.5 text-sm text-stone-600 shadow-sm">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-brand" aria-hidden="true" />
          <span className={explorerUi.mutedMessage}>{UI_COPY.loading}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <h1 className={explorerUi.title}>{PAGE_SECTION.advertisers}</h1>
      {err ? <p className={explorerUi.errorMessage}>{err}</p> : null}
      {rows?.length ? (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((a) => (
            <li key={a.advertiser_id}>
              <Link
                to={pathAdvertiser(a.slug)}
                className="flex flex-col rounded-lg border border-stone-200 bg-white px-4 py-3 transition hover:border-brand hover:bg-brand-50/40"
              >
                <span className="font-display text-base font-semibold text-stone-900">{a.label}</span>
                <span className="mt-1 text-xs text-stone-500">
                  {formatMetaLine(a.vertical, a.hq_region) || UI_COPY.advertiserListFallback}
                </span>
                <span className="mt-2 text-xs font-medium text-brand">
                  {a.campaigns.length} {PAGE_SECTION.campaigns.toLowerCase()}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
