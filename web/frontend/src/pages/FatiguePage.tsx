import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import {
  fetchFatigueCurve,
  fetchFatigueMLPredictCurve,
  fetchFatigueMLStatus,
  fetchFatigueSummary,
  type FatigueMLStatus,
  type FatiguePoint,
  type FatigueRow,
  type MLCurvePoint,
} from '../lib/api'

function healthColor(h: number | null | undefined) {
  if (h === null || h === undefined) return 'bg-slate-600'
  if (h >= 0.75) return 'bg-emerald-500'
  if (h >= 0.5) return 'bg-amber-400'
  return 'bg-rose-500'
}

type StreamEvent = Record<string, unknown>

function clampTrialsStr(raw: string, fallback: string): string {
  const n = parseInt(raw.trim(), 10)
  if (Number.isNaN(n)) return fallback
  return String(Math.min(100, Math.max(1, n)))
}

function clampCvStr(raw: string, fallback: string): string {
  const n = parseInt(raw.trim(), 10)
  if (Number.isNaN(n)) return fallback
  return String(Math.min(10, Math.max(1, n)))
}

export function FatiguePage() {
  const [rows, setRows] = useState<FatigueRow[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('')
  const [healthMax, setHealthMax] = useState<string>('')
  const [selected, setSelected] = useState<number | null>(null)
  const [series, setSeries] = useState<FatiguePoint[]>([])
  const [mlSeries, setMlSeries] = useState<MLCurvePoint[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [mlStatus, setMlStatus] = useState<FatigueMLStatus | null>(null)
  const [isTraining, setIsTraining] = useState(false)
  const [streamLog, setStreamLog] = useState<string[]>([])
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([])
  const [nTrialsStr, setNTrialsStr] = useState('12')
  const [cvSplitsStr, setCvSplitsStr] = useState('5')
  const esRef = useRef<EventSource | null>(null)

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

  const refreshMlStatus = useCallback(async () => {
    try {
      const s = await fetchFatigueMLStatus()
      setMlStatus(s)
    } catch {
      setMlStatus({ trained: false })
    }
  }, [])

  useEffect(() => {
    void refreshMlStatus()
  }, [refreshMlStatus])

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

  useEffect(() => {
    if (selected == null || !mlStatus?.trained) {
      setMlSeries([])
      return
    }
    void fetchFatigueMLPredictCurve(selected)
      .then((r) => {
        if (r.trained && r.series?.length) setMlSeries(r.series)
        else setMlSeries([])
      })
      .catch(() => setMlSeries([]))
  }, [selected, mlStatus?.trained])

  useEffect(() => {
    return () => {
      esRef.current?.close()
      esRef.current = null
    }
  }, [])

  const mergedChart = useMemo(() => {
    const byDay = new Map<number, MLCurvePoint>()
    for (const p of mlSeries) {
      byDay.set(p.days_since_launch, p)
    }
    return series.map((s) => {
      const m = byDay.get(s.days_since_launch)
      return {
        ...s,
        ml_actual_ctr: m?.actual_ctr,
        ml_predicted_ctr: m?.predicted_ctr,
      }
    })
  }, [series, mlSeries])

  const startTrainStream = () => {
    setErr(null)
    esRef.current?.close()
    setStreamLog([])
    setStreamEvents([])
    setIsTraining(true)
    const nTrials = clampTrialsStr(nTrialsStr === '' ? '12' : nTrialsStr, '12')
    const cvSplits = clampCvStr(cvSplitsStr === '' ? '5' : cvSplitsStr, '5')
    setNTrialsStr(nTrials)
    setCvSplitsStr(cvSplits)
    const q = new URLSearchParams({
      n_trials: nTrials,
      cv_splits: cvSplits,
    })
    const es = new EventSource(`/api/fatigue/ml/train-stream?${q.toString()}`)
    esRef.current = es
    es.onmessage = (ev) => {
      try {
        const data = JSON.parse(ev.data) as StreamEvent
        const t = data.type as string | undefined
        if (t === 'log' && typeof data.message === 'string') {
          setStreamLog((prev) => [...prev, String(data.message)])
        } else {
          setStreamEvents((prev) => [...prev, data])
        }
        if (t === 'error' && typeof data.message === 'string') {
          setErr(data.message)
          setIsTraining(false)
          es.close()
        }
        if (t === 'done') {
          setIsTraining(false)
          es.close()
          void refreshMlStatus()
          if (selected != null) {
            void fetchFatigueMLPredictCurve(selected).then((r) => {
              if (r.trained && r.series?.length) setMlSeries(r.series)
            })
          }
        }
      } catch (e) {
        setErr(String(e))
      }
    }
    es.onerror = () => {
      setIsTraining(false)
      es.close()
      void refreshMlStatus()
    }
  }

  const sorted = useMemo(() => rows, [rows])

  const optunaTrials = useMemo(
    () => streamEvents.filter((e) => e.type === 'optuna_trial') as Array<Record<string, unknown>>,
    [streamEvents],
  )
  const testMetrics = useMemo(
    () => streamEvents.find((e) => e.type === 'test_metrics') as Record<string, unknown> | undefined,
    [streamEvents],
  )
  const splitInfo = useMemo(
    () => streamEvents.find((e) => e.type === 'split') as Record<string, unknown> | undefined,
    [streamEvents],
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-white">Fatigue detection</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          <span className="text-slate-300">LightGBM + Optuna</span> on next-day smoothed CTR (prior 7 days of delivery +
          creative metadata). CV is grouped by <code className="text-accent">creative_id</code> (GroupKFold, or a single
          group holdout when CV splits = 1). Train from the browser over SSE; after training, overlay actual vs predicted CTR
          for the selected creative.
        </p>
      </div>

      <section className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="font-display text-lg font-semibold text-white">CTR model training</h2>
            <p className="mt-1 max-w-2xl text-xs text-slate-500">
              Optuna minimizes mean CV RMSE. Holdout creatives for final test RMSE / MAE / R². Trials: 1–100 · CV splits:
              1–10.
            </p>
          </div>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-slate-500">Optuna trials (1–100)</div>
              <input
                inputMode="numeric"
                className="input w-24"
                placeholder="12"
                value={nTrialsStr}
                onChange={(e) => {
                  const t = e.target.value
                  if (t === '' || /^\d{0,3}$/.test(t)) setNTrialsStr(t)
                }}
                onBlur={() => setNTrialsStr(clampTrialsStr(nTrialsStr === '' ? '12' : nTrialsStr, '12'))}
              />
            </div>
            <div>
              <div className="mb-1 text-xs font-medium uppercase text-slate-500">CV splits (1–10)</div>
              <input
                inputMode="numeric"
                className="input w-20"
                placeholder="5"
                value={cvSplitsStr}
                onChange={(e) => {
                  const t = e.target.value
                  if (t === '' || /^\d{0,2}$/.test(t)) setCvSplitsStr(t)
                }}
                onBlur={() => setCvSplitsStr(clampCvStr(cvSplitsStr === '' ? '5' : cvSplitsStr, '5'))}
              />
            </div>
            <button
              type="button"
              className="btn-primary disabled:opacity-50"
              disabled={isTraining}
              onClick={() => void startTrainStream()}
            >
              {isTraining ? 'Training…' : 'Train (stream)'}
            </button>
          </div>
        </div>

        {mlStatus?.trained ? (
          <p className="mt-3 text-xs text-emerald-400/90">
            Model loaded — test RMSE {mlStatus.test_metrics?.rmse?.toFixed(5) ?? '-'}, MAE{' '}
            {mlStatus.test_metrics?.mae?.toFixed(5) ?? '-'}, R² {mlStatus.test_metrics?.r2?.toFixed(3) ?? '-'} ·{' '}
            {mlStatus.n_features ?? 0} features
          </p>
        ) : (
          <p className="mt-3 text-xs text-slate-500">No model in memory yet. Train to enable CTR predictions.</p>
        )}

        {splitInfo ? (
          <p className="mt-2 font-mono text-[11px] text-slate-400">
            split: train_val_rows={String(splitInfo.n_train_val_rows)} test_rows={String(splitInfo.n_test_rows)}{' '}
            creatives_test={String(splitInfo.n_test_creatives)}
          </p>
        ) : null}

        {streamLog.length > 0 ? (
          <div className="mt-3 max-h-28 overflow-y-auto rounded-lg border border-slate-800 bg-ink-950/80 p-2 font-mono text-[11px] text-slate-300">
            {streamLog.map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        ) : null}

        {optunaTrials.length > 0 ? (
          <div className="mt-4 max-h-56 overflow-auto rounded-lg border border-slate-800">
            <table className="w-full text-left text-[11px] text-slate-300">
              <thead className="sticky top-0 bg-slate-900/95 text-slate-500">
                <tr>
                  <th className="p-2">Trial</th>
                  <th className="p-2">CV RMSE</th>
                  <th className="p-2">best so far</th>
                  <th className="p-2">n_est</th>
                  <th className="p-2">depth / leaves</th>
                  <th className="p-2">η</th>
                  <th className="p-2">folds</th>
                </tr>
              </thead>
              <tbody>
                {optunaTrials.map((tr, idx) => {
                  const p = tr.params as Record<string, number> | undefined
                  const folds = tr.folds as Array<{ fold: number; rmse: number }> | undefined
                  return (
                    <tr key={idx} className="border-t border-slate-800/80">
                      <td className="p-2">{String(tr.trial)}</td>
                      <td className="p-2">{typeof tr.value === 'number' ? tr.value.toFixed(6) : '-'}</td>
                      <td className="p-2 text-accent">
                        {typeof tr.best_value === 'number' ? tr.best_value.toFixed(6) : '-'}
                      </td>
                      <td className="p-2">{p?.n_estimators ?? '-'}</td>
                      <td className="p-2">
                        {p?.max_depth != null && p?.num_leaves != null
                          ? `${p.max_depth} / ${p.num_leaves}`
                          : '-'}
                      </td>
                      <td className="p-2">{p?.learning_rate != null ? p.learning_rate.toFixed(3) : '-'}</td>
                      <td className="p-2 font-mono text-[10px] text-slate-500">
                        {folds?.map((f) => `${f.fold}:${f.rmse.toFixed(4)}`).join(' · ') ?? '-'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {testMetrics ? (
          <p className="mt-3 text-sm text-slate-300">
            Holdout test: RMSE <span className="text-accent">{Number(testMetrics.rmse).toFixed(6)}</span>, MAE{' '}
            <span className="text-accent">{Number(testMetrics.mae).toFixed(6)}</span>, R²{' '}
            <span className="text-accent">{Number(testMetrics.r2).toFixed(4)}</span> (n=
            {String(testMetrics.n_test_rows)})
          </p>
        ) : null}
      </section>

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

        <div className="space-y-4 lg:col-span-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
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
                      <Line
                        yAxisId="d"
                        type="monotone"
                        dataKey="degradation"
                        name="Degradation"
                        stroke="#22d3ee"
                        dot={false}
                        strokeWidth={2}
                      />
                      <Line
                        yAxisId="d"
                        type="monotone"
                        dataKey="degradation_cpa"
                        name="CPA signal"
                        stroke="#38bdf8"
                        dot={false}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                      />
                      <Line
                        yAxisId="d"
                        type="monotone"
                        dataKey="degradation_ctr"
                        name="CTR signal"
                        stroke="#f59e0b"
                        dot={false}
                        strokeWidth={1}
                        strokeDasharray="3 3"
                      />
                      <Line
                        yAxisId="c"
                        type="monotone"
                        dataKey="rolling_ctr"
                        name="Rolling CTR"
                        stroke="#c084fc"
                        dot={false}
                        strokeWidth={2}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>

          {selected != null && mlSeries.length > 0 ? (
            <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
              <h3 className="font-display text-sm font-semibold text-white">CTR — actual vs model (smoothed)</h3>
              <p className="mt-1 text-xs text-slate-500">
                Teacher-forcing: each day uses the true prior 7-day window. Gaps between lines suggest fatigue /
                drift the model is tracking.
              </p>
              <div className="mt-3 h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={mergedChart.filter((d) => d.ml_actual_ctr != null || d.ml_predicted_ctr != null)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                    <XAxis dataKey="days_since_launch" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} domain={['auto', 'auto']} />
                    <Tooltip contentStyle={{ background: '#111827', border: '1px solid #334155' }} />
                    <Legend />
                    <Line
                      type="monotone"
                      dataKey="rolling_ctr"
                      name="Rolling CTR (7d)"
                      stroke="#94a3b8"
                      dot={false}
                      strokeWidth={1}
                      strokeDasharray="4 4"
                    />
                    <Line
                      type="monotone"
                      dataKey="ml_actual_ctr"
                      name="ML target CTR"
                      stroke="#f472b6"
                      dot={false}
                      strokeWidth={2}
                    />
                    <Line
                      type="monotone"
                      dataKey="ml_predicted_ctr"
                      name="Predicted CTR"
                      stroke="#34d399"
                      dot={false}
                      strokeWidth={2}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
