import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { BackNavLink } from '../components/BackNavLink'
import { useExplorerBootstrap } from '../hooks/useExplorerBootstrap'
import { findAdvertiserBySlug } from '../lib/hierarchyResolve'
import { PAGE_SECTION, UI_COPY, formatMetaLine } from '../lib/performanceLabels'
import { pathCampaign, pathHome } from '../lib/routes'
import { explorerUi } from '../lib/explorerUi'
import type { HierarchyCampaign } from '../lib/api'

function CampaignCard({ campaign: c, advertiserSlug }: { campaign: HierarchyCampaign, advertiserSlug: string }) {
  return (
    <Link to={pathCampaign(advertiserSlug, c.slug)} className={explorerUi.notionCard}>
      <div className={explorerUi.notionCover} />
      <div className={explorerUi.notionBody}>
        <h3 className={explorerUi.notionTitle}>{c.label}</h3>
        <div className={explorerUi.notionMeta}>
          <span className={`${explorerUi.notionTag} ${explorerUi.getTagColor(c.kpi_goal ?? 'none')} border uppercase tracking-widest`}>
            KPI: {(c.kpi_goal ?? 'none').trim() || 'none'}
          </span>
        </div>
        <div className={explorerUi.notionStat}>
          {c.creatives.length} {PAGE_SECTION.creatives}
        </div>
      </div>
    </Link>
  )
}

export function AdvertiserDetailPage() {
  const { advertiserSlug } = useParams<{ advertiserSlug: string }>()
  const { advertisers, error: loadErr } = useExplorerBootstrap()
  const [search, setSearch] = useState('')

  const advertiser = useMemo(() => findAdvertiserBySlug(advertisers, advertiserSlug), [advertisers, advertiserSlug])

  const filteredCampaigns = useMemo(() => {
    if (!advertiser) return []
    return advertiser.campaigns.filter(c => c.label.toLowerCase().includes(search.toLowerCase()))
  }, [advertiser, search])

  if (loadErr) {
    return <p className={explorerUi.errorMessage}>{loadErr}</p>
  }

  if (advertisers && !advertiser) {
    return (
      <div className={explorerUi.notFoundWrap}>
        <BackNavLink to={pathHome()}>← {UI_COPY.backToAdvertisers}</BackNavLink>
        <p className={explorerUi.notFoundBody}>{UI_COPY.noAdvertiserMatch}</p>
      </div>
    )
  }

  if (!advertiser) {
    return <p className={explorerUi.mutedMessage}>{UI_COPY.loading}</p>
  }

  return (
    <div className={explorerUi.pageWrap}>
      <div className={explorerUi.headerRow}>
        <div>
          <BackNavLink to={pathHome()}>← {UI_COPY.backToAdvertisers}</BackNavLink>
          <h1 className={explorerUi.title}>{advertiser.label}</h1>
          <p className={explorerUi.subtitle}>{formatMetaLine(advertiser.vertical, advertiser.hq_region)}</p>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 className={explorerUi.sectionTitle}>{PAGE_SECTION.campaigns}</h2>
          
          {/* Sophisticated Search for Campaigns */}
          <div className="relative w-full max-w-xs group">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-stone-400 group-focus-within:text-brand transition-colors">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search campaigns..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="block w-full pl-9 pr-3 py-1.5 bg-white border border-stone-200 rounded-lg text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-brand/10 focus:border-brand/40 transition-all shadow-sm"
            />
          </div>
        </div>

        {filteredCampaigns.length ? (
          <div className={explorerUi.notionGrid}>
            {filteredCampaigns.map((c) => (
              <CampaignCard key={c.campaign_id} campaign={c} advertiserSlug={advertiser.slug} />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center border border-dashed border-stone-200 rounded-xl">
            <p className={explorerUi.mutedMessage}>No campaigns found matching "{search}"</p>
          </div>
        )}
      </div>
    </div>
  )
}
