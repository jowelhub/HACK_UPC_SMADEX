import { useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { fetchPerformanceHierarchy } from '../lib/api'
import { findAdvertiserBySlug, findCreativeInAdvertiser } from '../lib/hierarchyResolve'
import { UI_COPY } from '../lib/performanceLabels'
import { pathCreative, pathHome, pathAdvertiser } from '../lib/routes'

/**
 * Legacy: /{advertiser}/{numericCreativeId} → full slug URL for that creative.
 */
export function LegacyNumericCreativeRedirect() {
  const { advertiserSlug, campaignSlug } = useParams<{ advertiserSlug: string; campaignSlug: string }>()
  const navigate = useNavigate()
  const id = campaignSlug ? parseInt(campaignSlug, 10) : NaN

  useEffect(() => {
    if (!Number.isFinite(id) || !advertiserSlug) {
      void navigate(pathHome(), { replace: true })
      return
    }
    void fetchPerformanceHierarchy()
      .then((h) => {
        const adv = findAdvertiserBySlug(h.advertisers, advertiserSlug)
        if (!adv) {
          void navigate(pathHome(), { replace: true })
          return
        }
        const found = findCreativeInAdvertiser(adv, id)
        if (found) {
          void navigate(pathCreative(adv.slug, found.campaign.slug, found.creative.slug), { replace: true })
          return
        }
        void navigate(pathAdvertiser(adv.slug), { replace: true })
      })
      .catch(() => {
        void navigate(pathHome(), { replace: true })
      })
  }, [advertiserSlug, id, navigate])

  return <p className="text-sm text-stone-500">{UI_COPY.redirecting}</p>
}
