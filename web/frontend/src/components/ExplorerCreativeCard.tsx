import { Link } from 'react-router-dom'
import { creativeAssetUrl } from '../lib/api'
import { explorerUi } from '../lib/explorerUi'

type Props = {
  to: string
  label: string
  creativeId: number
}

export function ExplorerCreativeCard({ to, label, creativeId }: Props) {
  return (
    <Link to={to} className={explorerUi.creativeTile}>
      <div className={explorerUi.creativeTileImageWrap}>
        <img
          src={creativeAssetUrl(creativeId)}
          alt=""
          className="max-h-full max-w-full object-contain"
          loading="lazy"
        />
      </div>
      <p className={explorerUi.creativeTileLabel}>{label}</p>
    </Link>
  )
}
