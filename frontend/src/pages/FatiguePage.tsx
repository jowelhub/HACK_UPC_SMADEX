import { useEffect, useMemo, useState } from 'react'
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { fetchFatigueCurve, fetchFatigueSummary, type FatiguePoint, type FatigueRow } from '../lib/api'

function healthColor(h: number | null | undefined) {
  if (h === null || h === undefined) return 'bg-slate-600'
  if (h >= 0.75) return 'bg-emerald-500'
  if (h >= 0.5) return 'bg-amber-400'
  return 'bg-rose-500'
}

export function FatiguePage() {
  const [rows, setRows] = useState<FatigueRow[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [healthMax, setHealthMax] = useState<string>('')
  const [selected, setSelected] = useState<number | null>(null)
  const [series, setSeries] = useState<FatiguePoint[]>([])
  const [err, setErr] = useState<string | null>(null)

  const load = async () => {
    setErr(null)
    try {
      const filters: Record<string, unknown> = {}
      if (statusFilter) filters.creative_status = [statusFilter]
      if (healthMax) filters.health_max = Number(healthMax)
      const res = await fetchFatigueSummary(filters)
      setRows(res.items)
    } catch (e) {
      setErr(String(e))
    }
  }

  useEffect(() => {
    const filters: Record<string, unknown> = {}
    if (statusFilter) filters.creative_status = [statusFilter]
    void fetchFatigueSummary(filters)
      .then((res) => setRows(res.items))
      .catch((e) => setErr(String(e)))
  }, [statusFilter])

  useEffect(() => {
    if (selected == null) {
      return
    }
    void fetchFatigueCurve(selected)
      .then((r) => setSeries(r.series))
      .catch((e) => setErr(String(e)))
  }, [selected])

  const sorted = useMemo(() => rows, [rows])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Fatigue detection</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Per-creative daily totals use 7-day rolling CPA, CTR, and CVR versus a baseline from days 7-21. Degradation takes the
          strongest warning signal across CPA increase, CTR drop, and CVR drop. Fatiguing streak uses degradation &gt; 1.4 for 3+
          consecutive days.
          Labels from <code className="text-accent">creative_summary</code> are shown for sanity checks only.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div>
          <div className="mb-1 text-xs font-medium uppercase text-slate-500">Dataset status</div>
          <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="top_performer">top_performer</option>
            <option value="stable">stable</option>
            <option value="fatigued">fatigued</option>
            <option value="underperformer">underperformer</option>
          </select>
        </div>
        <div>
          <div className="mb-1 text-xs font-medium uppercase text-slate-500">Health ≤</div>
          <input
            className="input w-28"
            placeholder="e.g. 0.6"
            value={healthMax}
            onChange={(e) => setHealthMax(e.target.value)}
          />
        </div>
        <button type="button" className="btn-primary" onClick={() => void load()}>
          Apply filters
        </button>
      </div>
      {err ? <p className="text-sm text-red-400">{err}</p> : null}

      <div className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-2">
          <div className="max-h-[520px] overflow-y-auto rounded-2xl border border-slate-800 bg-slate-900/30">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead className="sticky top-0 z-10 bg-ink-950/95 backdrop-blur">
                <tr className="border-b border-slate-800 text-slate-500">
                  <th className="p-2">Creative</th>
                  <th className="p-2">Health</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {sorted.slice(0, 400).map((r) => (
                  <tr
                    key={r.creative_id}
                    onClick={() => setSelected(r.creative_id)}
                    className={`cursor-pointer border-b border-slate-800/60 hover:bg-slate-800/50 ${
                      selected === r.creative_id ? 'bg-slate-800/70' : ''
                    }`}
                  >
                    <td className="p-2 font-mono text-accent">{r.creative_id}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-8 rounded-full ${healthColor(r.health_score)}`} />
                        <span className="text-slate-300">{r.health_score?.toFixed(2) ?? '-'}</span>
                      </div>
                    </td>
                    <td className="p-2 text-slate-400">{r.creative_status ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {sorted.length > 400 ? (
              <p className="border-t border-slate-800 p-2 text-center text-xs text-slate-500">
                Showing first 400 of {sorted.length}. Tighten filters in a future version.
              </p>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4 lg:col-span-3">
          {selected == null ? (
            <p className="text-sm text-slate-500">Select a creative to plot degradation and rolling CTR.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-lg font-semibold text-white">Creative {selected}</h2>
                <span className="text-xs text-slate-500">x = days since launch</span>
              </div>
              <div className="mt-4 h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={series}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="days_since_launch" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis yAxisId="d" tick={{ fill: '#94a3b8', fontSize: 11 }} domain={[0, 2.5]} />
                    <YAxis yAxisId="c" orientation="right" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid #334155' }} />
                    <Legend />
                    <ReferenceLine yAxisId="d" y={1} stroke="#64748b" strokeDasharray="4 4" label="Baseline" />
                    <ReferenceLine yAxisId="d" y={1.4} stroke="#f87171" strokeDasharray="4 4" label="Alert" />
                    <Line yAxisId="d" type="monotone" dataKey="degradation" name="Degradation" stroke="#22d3ee" dot={false} strokeWidth={2} />
                    <Line yAxisId="d" type="monotone" dataKey="degradation_cpa" name="CPA signal" stroke="#38bdf8" dot={false} strokeWidth={1} strokeDasharray="3 3" />
                    <Line yAxisId="d" type="monotone" dataKey="degradation_ctr" name="CTR signal" stroke="#f59e0b" dot={false} strokeWidth={1} strokeDasharray="3 3" />
                    <Line yAxisId="c" type="monotone" dataKey="rolling_ctr" name="Rolling CTR" stroke="#c084fc" dot={false} strokeWidth={2} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
