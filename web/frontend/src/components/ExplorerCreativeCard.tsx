import { Link } from 'react-router-dom'
import { creativeAssetUrl } from '../lib/api'
import { explorerUi } from '../lib/explorerUi'

type Props = {
  to: string
  label: string
  creativeId: number
  creativeStatus?: string | null
  isFatigued?: boolean
}

function statusBadgeClass(status: string | null | undefined, fatigued: boolean | undefined) {
  if (fatigued) return 'bg-rose-100 text-rose-800 ring-rose-200'
  const s = (status ?? '').toLowerCase()
  if (s === 'top_performer') return 'bg-emerald-100 text-emerald-900 ring-emerald-200'
  if (s === 'stable') return 'bg-stone-100 text-stone-700 ring-stone-200'
  if (s === 'underperformer') return 'bg-amber-100 text-amber-900 ring-amber-200'
  return 'bg-stone-50 text-stone-500 ring-stone-200'
}

export function ExplorerCreativeCard({ to, label, creativeId, creativeStatus, isFatigued }: Props) {
  const showBadge = Boolean(creativeStatus || isFatigued)
  const badgeText = isFatigued ? 'Fatigued' : creativeStatus?.replace(/_/g, ' ') ?? ''
  return (
    <Link to={to} className={explorerUi.creativeTile}>
      <div className="relative">
        {showBadge && badgeText ? (
          <span
            className={`absolute right-1 top-1 z-10 max-w-[90%] truncate rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ${statusBadgeClass(creativeStatus, isFatigued)}`}
          >
            {badgeText}
          </span>
        ) : null}
        <div className={explorerUi.creativeTileImageWrap}>
          <img
            src={creativeAssetUrl(creativeId)}
            alt=""
            className="max-h-full max-w-full object-contain"
            loading="lazy"
          />
        </div>
      </div>
      <p className={explorerUi.creativeTileLabel}>{label}</p>
    </Link>
  )
}
