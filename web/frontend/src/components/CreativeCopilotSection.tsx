import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { ResponsiveChartWrapper } from './ResponsiveChartWrapper'

import { explorerUi } from '../lib/explorerUi'

interface Props {
  dailyHazardsJson: any
}

export function CreativeCopilotSection({ dailyHazardsJson }: Props) {
  const [selectedDay, setSelectedDay] = useState(1)

  if (!dailyHazardsJson?.daily_data || dailyHazardsJson.daily_data.length === 0) {
    return null
  }

  const maxDays = dailyHazardsJson.max_days || dailyHazardsJson.daily_data.length
  const activeDay =
    dailyHazardsJson.daily_data.find((d: any) => d.day === selectedDay) ||
    dailyHazardsJson.daily_data[dailyHazardsJson.daily_data.length - 1]

  if (!activeDay) return null

  return (
    <div className="mt-8">
      <h2 className={explorerUi.sectionTitle}>Post-launch health</h2>
      <p className={explorerUi.sectionSubtitle}>
        Daily fatigue risk and recommended next action from the post-launch hazard model.
      </p>

      <div className="rounded-md border border-stone-200 bg-white p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex w-full flex-col gap-4 lg:w-[20rem] lg:shrink-0">
          <div className="rounded-md border border-stone-200 bg-stone-50/80 p-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-medium text-stone-700">Timeline</label>
              <span className="rounded bg-brand/10 px-2 py-1 text-xs font-semibold text-brand">Day {selectedDay}</span>
            </div>
            <input
              type="range"
              min={1}
              max={maxDays}
              value={selectedDay}
              onChange={(e) => setSelectedDay(parseInt(e.target.value, 10))}
              className="w-full cursor-pointer accent-brand"
            />
            <div className="mt-1 flex justify-between text-xs text-stone-400">
              <span>Day 1</span>
              <span>Day {maxDays}</span>
            </div>
          </div>

          {(() => {
            const isScale = activeDay.recommendation === 'Scale'
            const isHold = activeDay.recommendation === 'Hold'
            const toneClass = isScale
              ? 'border-emerald-200 bg-emerald-50/70 text-emerald-800'
              : isHold
                ? 'border-amber-200 bg-amber-50/70 text-amber-800'
                : 'border-rose-200 bg-rose-50/70 text-rose-800'

            return (
              <div className={`rounded-md border p-4 ${toneClass}`}>
                <div className="text-xs font-semibold uppercase tracking-wide text-stone-500">Recommended action</div>
                <div className="mt-2 text-2xl font-semibold">{String(activeDay.recommendation).toUpperCase()}</div>
                <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-xs uppercase tracking-wide text-stone-500">Relative hazard</div>
                    <div className="mt-1 font-semibold">{Number(activeDay.hazard_score).toFixed(2)}x</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-wide text-stone-500">Selected day</div>
                    <div className="mt-1 font-semibold">Day {selectedDay}</div>
                  </div>
                </div>
                <p className="mt-3 text-sm leading-6 text-stone-600">
                  {isScale
                    ? 'Risk stays controlled. Keep scaling selective and confirm ROAS remains supportive.'
                    : isHold
                      ? 'Risk is building. Hold budget steady and watch for further deterioration.'
                      : 'Fatigue risk is elevated. Refresh or rotate this creative before scaling further.'}
                </p>

                {activeDay.features && (
                  <div className="mt-4 border-t border-stone-200/70 pt-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500">Signals</div>
                    <div className="space-y-2 text-sm text-stone-700">
                      <div className="flex items-center justify-between">
                        <span>CTR vs peak</span>
                        <span className="font-medium">
                          {activeDay.features.ctr_vs_peak != null ? `${(activeDay.features.ctr_vs_peak * 100).toFixed(0)}%` : '-'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>CVR vs peak</span>
                        <span className="font-medium">
                          {activeDay.features.cvr_vs_peak != null ? `${(activeDay.features.cvr_vs_peak * 100).toFixed(0)}%` : '-'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span>7D spend velocity</span>
                        <span className="font-medium">
                          {activeDay.features.spend_velocity_7d != null ? `$${activeDay.features.spend_velocity_7d.toFixed(0)}` : '-'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        <div className="rounded-md border border-stone-200 bg-white p-4 lg:min-w-0 lg:flex-1">
          <h3 className="mb-4 text-sm font-semibold text-stone-900">Fatigue risk trend</h3>
          <div className="h-72 w-full min-h-0 min-w-0">
            <ResponsiveChartWrapper>
              <ResponsiveContainer width="100%" height="100%" minHeight={240} debounce={1}>
                <LineChart
                  data={dailyHazardsJson.daily_data}
                  margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                  <XAxis 
                    dataKey="day" 
                    tick={{ fontSize: 12, fill: '#78716c' }} 
                    tickLine={false}
                    axisLine={{ stroke: '#e7e5e4' }}
                  />
                  <YAxis 
                    tick={{ fontSize: 12, fill: '#78716c' }} 
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `${val}x`}
                  />
                  <Tooltip 
                    labelFormatter={(label) => `Day ${label}`}
                    formatter={(value: any) => [`${Number(value).toFixed(2)}x`, 'Relative Hazard']}
                  />
                  <ReferenceLine y={1.0} stroke="#a8a29e" strokeDasharray="3 3" />
                  <ReferenceLine y={2.0} stroke="#fca5a5" strokeDasharray="3 3" />
                  
                  <ReferenceLine x={selectedDay} stroke="#7c3aed" strokeWidth={2} />
                  
                  <Line 
                    type="monotone" 
                    dataKey="hazard_score" 
                    stroke="#ef4444" 
                    strokeWidth={2} 
                    dot={false}
                    activeDot={{ r: 4, fill: '#ef4444', stroke: '#fff' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ResponsiveChartWrapper>
          </div>
          <div className="mt-3 flex items-center justify-between text-xs text-stone-500">
            <span>Baseline: 1.0x</span>
            <span>High risk: 2.0x</span>
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}
