import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { fetchPerformanceHierarchy, type HierarchyAdvertiser } from '../lib/api'
import { PAGE_SECTION, UI_COPY } from '../lib/performanceLabels'
import { pathAdvertiser } from '../lib/routes'
import { explorerUi } from '../lib/explorerUi'

/** 
 * Generates deterministic colors based on a string (e.g. advertiser name).
 * Returns tailwind classes for gradients and avatars.
 */
function AdvertiserCard({ advertiser: a }: { advertiser: HierarchyAdvertiser }) {
  return (
    <Link to={pathAdvertiser(a.slug)} className={explorerUi.notionCard}>
      {/* Subtle Brand Top Bar */}
      <div className={explorerUi.notionCover} />
      
      <div className={explorerUi.notionBody}>
        {/* Content */}
        <h3 className={explorerUi.notionTitle}>{a.label}</h3>
        
        <div className={explorerUi.notionMeta}>
          {a.vertical && (
            <span className={`${explorerUi.notionTag} ${explorerUi.getTagColor(a.vertical)} border`}>
              {a.vertical}
            </span>
          )}
          {a.hq_region && (
            <span className={`${explorerUi.notionTag} ${explorerUi.getTagColor(a.hq_region)} border`}>
              {a.hq_region}
            </span>
          )}
        </div>

        <div className={explorerUi.notionStat}>
          {a.campaigns.length} {PAGE_SECTION.campaigns}
        </div>
      </div>
    </Link>
  )
}

export function AdvertisersHomePage() {
  const [rows, setRows] = useState<HierarchyAdvertiser[] | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  
  const isLoading = !rows && !err

  useEffect(() => {
    void fetchPerformanceHierarchy()
      .then((h) => setRows(h.advertisers))
      .catch((e) => setErr(String(e)))
  }, [])

  const filteredRows = useMemo(() => {
    if (!rows) return []
    return rows.filter(r => r.label.toLowerCase().includes(search.toLowerCase()))
  }, [rows, search])


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
    <div className={explorerUi.pageWrap}>
      <div className={explorerUi.headerRow}>
        <div className="space-y-1">
          <h1 className={explorerUi.title}>{PAGE_SECTION.advertisers}</h1>
          <p className={explorerUi.subtitle}>Manage and explore your advertiser portfolio</p>
        </div>
        
        <div className="relative w-full max-w-xs group">
          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-stone-400 group-focus-within:text-brand transition-colors">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <input
            type="text"
            placeholder="Search advertisers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full pl-9 pr-3 py-1.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-brand/10 focus:border-brand/40 transition-all shadow-sm"
          />
        </div>
      </div>

      {err ? <p className={explorerUi.errorMessage}>{err}</p> : null}
      
      {filteredRows.length ? (
        <div className={explorerUi.notionGrid}>
          {filteredRows.map((a) => (
            <AdvertiserCard key={a.advertiser_id} advertiser={a} />
          ))}
        </div>
      ) : (
        <div className="py-20 text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-stone-100 mb-4">
            <svg className="w-8 h-8 text-stone-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>
          <p className={explorerUi.mutedMessage}>No advertisers found matching "{search}"</p>
          <button 
            onClick={() => setSearch('')}
            className="mt-4 text-sm font-medium text-brand hover:underline"
          >
            Clear search
          </button>
        </div>
      )}
    </div>
  )
}
