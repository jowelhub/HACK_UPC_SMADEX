import { useEffect, useMemo, useState } from 'react'
import { fetchRecommendations, type RecommendationRow } from '../lib/api'

const actionStyle: Record<string, string> = {
  scale: 'bg-emerald-50 text-emerald-900 ring-emerald-200',
  watch: 'bg-amber-50 text-amber-900 ring-amber-200',
  rotate: 'bg-teal-50 text-teal-900 ring-teal-200',
  replace: 'bg-brand-50 text-brand-900 ring-brand/20',
  pause: 'bg-rose-50 text-rose-900 ring-rose-200',
}

export function RecommendationsPage() {
  const [items, setItems] = useState<RecommendationRow[]>([])
  const [minUrgency, setMinUrgency] = useState(3)
  const [action, setAction] = useState('')
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    setErr(null)
    try {
      const res = await fetchRecommendations({})
      setItems(res.items)
    } catch (e) {
      setErr(String(e))
    }
  }

  useEffect(() => {
    void fetchRecommendations({})
      .then((res) => setItems(res.items))
      .catch((e) => setErr(String(e)))
  }, [])

  const filtered = useMemo(() => {
    return items.filter((r) => r.urgency >= minUrgency && (!action || r.action === action))
  }, [items, minUrgency, action])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-semibold tracking-tight text-brand">Recommendations</h1>
      </div>

      <div className="flex flex-wrap items-end gap-3 surface-panel !py-4">
        <div>
          <div className="mb-1 text-xs font-semibold uppercase text-stone-500">Min urgency</div>
          <select className="input" value={minUrgency} onChange={(e) => setMinUrgency(Number(e.target.value))}>
            <option value={0}>0+</option>
            <option value={2}>2+</option>
            <option value={3}>3+</option>
            <option value={4}>4+</option>
            <option value={5}>5</option>
          </select>
        </div>
        <div>
          <div className="mb-1 text-xs font-semibold uppercase text-stone-500">Action</div>
          <select className="input" value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">Any</option>
            <option value="scale">scale</option>
            <option value="watch">watch</option>
            <option value="rotate">rotate</option>
            <option value="replace">replace</option>
            <option value="pause">pause</option>
          </select>
        </div>
        <button type="button" className="btn-primary" onClick={() => void load()}>
          Reload
        </button>
      </div>
      {err ? <p className="text-sm text-red-600">{err}</p> : null}

      <div className="overflow-x-auto surface-panel !p-0">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50/80 text-xs font-semibold uppercase text-stone-500">
              <th className="p-3">Creative</th>
              <th className="p-3">Campaign</th>
              <th className="p-3">Action</th>
              <th className="p-3">Health</th>
              <th className="p-3">ROAS</th>
              <th className="p-3">Explanation</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.creative_id} className="border-b border-stone-100 text-stone-700">
                <td className="p-3 font-mono text-xs font-medium text-brand">{r.creative_id}</td>
                <td className="p-3 text-xs">{r.campaign_id}</td>
                <td className="p-3">
                  <span
                    className={`inline-flex rounded px-2 py-0.5 text-xs font-medium ring-1 ${
                      actionStyle[r.action] || 'bg-stone-100 text-stone-800 ring-stone-200'
                    }`}
                  >
                    {r.action}
                  </span>
                  {r.rotate_to_creative_id ? (
                    <div className="mt-1 text-xs text-stone-500">to {r.rotate_to_creative_id}</div>
                  ) : null}
                </td>
                <td className="p-3">{r.health_score?.toFixed(2)}</td>
                <td className="p-3">{r.overall_roas?.toFixed(2)}</td>
                <td className="p-3 max-w-md text-xs leading-relaxed text-stone-600">{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <p className="p-6 text-center text-sm text-stone-500">No rows for this filter.</p> : null}
      </div>
    </div>
  )
}
