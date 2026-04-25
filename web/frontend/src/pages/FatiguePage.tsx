import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import {
  fetchFatigueCreativeIds,
  fetchFatigueMLPredictCurve,
  fetchFatigueMLStatus,
  type FatigueMLStatus,
  type MLCurvePoint,
} from '../lib/api'

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
  const [creativeInput, setCreativeInput] = useState('')
  const [selected, setSelected] = useState<number | null>(null)
  const [idOptions, setIdOptions] = useState<number[]>([])
  const [mlSeries, setMlSeries] = useState<MLCurvePoint[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [mlStatus, setMlStatus] = useState<FatigueMLStatus | null>(null)
  const [isTraining, setIsTraining] = useState(false)
  const [streamLog, setStreamLog] = useState<string[]>([])
  const [streamEvents, setStreamEvents] = useState<StreamEvent[]>([])
  const [nTrialsStr, setNTrialsStr] = useState('12')
  const [cvSplitsStr, setCvSplitsStr] = useState('5')
  const esRef = useRef<EventSource | null>(null)
  const seededCreativeRef = useRef(false)

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
    if (seededCreativeRef.current) return
    void fetchFatigueCreativeIds()
      .then((ids) => {
        setIdOptions(ids)
        if (ids.length) {
          seededCreativeRef.current = true
          const first = ids[0]
          setCreativeInput(String(first))
          setSelected(first)
        }
      })
      .catch((e) => setErr(String(e)))
  }, [])

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

  const applyCreativeId = () => {
    setErr(null)
    const n = parseInt(creativeInput.trim(), 10)
    if (Number.isNaN(n) || n <= 0) {
      setErr('Enter a valid creative ID.')
      return
    }
    setSelected(n)
  }

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
        <h1 className="font-display text-2xl font-bold text-white">Fatigue detection (ML)</h1>
        <p className="mt-1 max-w-3xl text-sm text-slate-400">
          Only <span className="text-slate-300">LightGBM + Optuna</span>: next-day smoothed CTR from the prior 7
          calendar days of delivery (rolled up globally per creative per day) plus static fields from{' '}
          <code className="text-accent">creatives</code>. Train in the browser (SSE), then compare actual vs predicted CTR
          over <code className="text-slate-500">days_since_launch</code> — divergence suggests drift / fatigue relative to
          what the model learned.
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
          <p className="mt-3 text-xs text-slate-500">Train once to enable CTR curves and recommendation health scores.</p>
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
        <div className="min-w-[12rem] flex-1">
          <div className="mb-1 text-xs font-medium uppercase text-slate-500">Creative ID</div>
          <input
            className="input w-full max-w-xs font-mono"
            list="fatigue-creative-ids"
            placeholder="e.g. 500696"
            value={creativeInput}
            onChange={(e) => setCreativeInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applyCreativeId()
            }}
          />
          <datalist id="fatigue-creative-ids">
            {idOptions.slice(0, 500).map((id) => (
              <option key={id} value={id} />
            ))}
          </datalist>
        </div>
        <button type="button" className="btn-primary" onClick={() => void applyCreativeId()}>
          Load chart
        </button>
      </div>
      {err ? <p className="text-sm text-red-400">{err}</p> : null}

      <div className="rounded-2xl border border-slate-800 bg-slate-900/30 p-4">
        {selected == null ? (
          <p className="text-sm text-slate-500">Enter a creative ID and load the chart.</p>
        ) : !mlStatus?.trained ? (
          <p className="text-sm text-slate-500">
            Creative <span className="font-mono text-accent">{selected}</span> — train the model above to see actual vs
            predicted CTR.
          </p>
        ) : mlSeries.length === 0 ? (
          <p className="text-sm text-slate-500">
            No ML points for creative <span className="font-mono text-accent">{selected}</span> (needs enough history
            after global daily rollup).
          </p>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold text-white">Creative {selected}</h2>
              <span className="text-xs text-slate-500">x = days since launch · teacher-forcing on prior 7 days</span>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Smoothed CTR target vs model output per day. Wider gaps → harder to predict (often fatigue or mix shifts).
            </p>
            <div className="mt-4 h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mlSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="days_since_launch" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} domain={['auto', 'auto']} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #334155' }} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="actual_ctr"
                    name="Actual CTR (smoothed)"
                    stroke="#f472b6"
                    dot={false}
                    strokeWidth={2}
                  />
                  <Line
                    type="monotone"
                    dataKey="predicted_ctr"
                    name="Predicted CTR"
                    stroke="#34d399"
                    dot={false}
                    strokeWidth={2}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
