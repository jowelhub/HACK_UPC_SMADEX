import { useEffect, useMemo, useState } from 'react'
import { fetchRecommendations, type RecommendationRow } from '../lib/api'

const actionStyle: Record<string, string> = {
  scale: 'bg-emerald-500/20 text-emerald-300 ring-emerald-500/30',
  watch: 'bg-amber-500/15 text-amber-200 ring-amber-500/25',
  rotate: 'bg-cyan-500/20 text-cyan-200 ring-cyan-500/30',
  replace: 'bg-violet-500/20 text-violet-200 ring-violet-500/30',
  pause: 'bg-rose-500/20 text-rose-200 ring-rose-500/30',
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
        <h1 className="font-display text-2xl font-bold text-white">Recommendations</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Actions are on <strong className="text-slate-200">creatives</strong> (rotate, replace, pause, scale) — not auction
          slots. <strong className="text-slate-200">Health</strong> comes from the CTR model on the Fatigue page after you
          train; until then defaults are neutral. Rotation uses format, theme, hook, color, tone, gameplay, and motion.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase text-slate-500">Min urgency</div>
          <select className="input" value={minUrgency} onChange={(e) => setMinUrgency(Number(e.target.value))}>
            <option value={0}>0+</option>
            <option value={2}>2+</option>
            <option value={3}>3+</option>
            <option value={4}>4+</option>
            <option value={5}>5</option>
          </select>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium uppercase text-slate-500">Action</div>
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
      {err ? <p className="text-sm text-red-400">{err}</p> : null}

      <div className="overflow-x-auto rounded-2xl border border-slate-800 bg-slate-900/30">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-800 text-xs uppercase text-slate-500">
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
              <tr key={r.creative_id} className="border-b border-slate-800/60 text-slate-300">
                <td className="p-3 font-mono text-xs text-accent">{r.creative_id}</td>
                <td className="p-3 text-xs">{r.campaign_id}</td>
                <td className="p-3">
                  <span
                    className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${
                      actionStyle[r.action] || 'bg-slate-700 text-slate-200'
                    }`}
                  >
                    {r.action}
                  </span>
                  {r.rotate_to_creative_id ? (
                    <div className="mt-1 text-xs text-slate-500">to {r.rotate_to_creative_id}</div>
                  ) : null}
                </td>
                <td className="p-3">{r.health_score?.toFixed(2)}</td>
                <td className="p-3">{r.overall_roas?.toFixed(2)}</td>
                <td className="p-3 max-w-md text-xs leading-relaxed text-slate-400">{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 ? <p className="p-6 text-center text-sm text-slate-500">No rows for this filter.</p> : null}
      </div>
    </div>
  )
}
