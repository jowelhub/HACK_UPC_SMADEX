import { useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts'
import { ResponsiveChartWrapper } from './ResponsiveChartWrapper'

interface Props {
  dailyHazardsJson: any
}

export function CreativeCopilotSection({ dailyHazardsJson }: Props) {
  const [selectedDay, setSelectedDay] = useState(1)

  if (!dailyHazardsJson?.daily_data || dailyHazardsJson.daily_data.length === 0) {
    return null
  }

  const maxDays = dailyHazardsJson.max_days || dailyHazardsJson.daily_data.length

  return (
    <div className="mt-8 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-6 border-b border-stone-100 pb-4">
        <h2 className="text-xl font-bold text-stone-800">Post-Launch Copilot (Interactive Hazard)</h2>
        <p className="mt-1 text-sm text-stone-500">
          Explore how real-time performance metrics affect this creative's fatigue risk over time using a Time-Varying Cox model.
        </p>
      </div>

      <div className="flex flex-col gap-8 md:flex-row">
        {/* Controls and Stats */}
        <div className="flex w-full flex-col gap-6 md:w-1/3">
          {/* Day Slider */}
          <div className="rounded-lg bg-stone-50 p-4">
            <div className="mb-2 flex items-center justify-between">
              <label className="text-sm font-semibold text-stone-700">Timeline (Days Since Launch)</label>
              <span className="rounded bg-blue-100 px-2 py-1 text-xs font-bold text-blue-800">Day {selectedDay}</span>
            </div>
            <input
              type="range"
              min={1}
              max={maxDays}
              value={selectedDay}
              onChange={(e) => setSelectedDay(parseInt(e.target.value, 10))}
              className="w-full cursor-pointer accent-blue-600"
            />
            <div className="mt-1 flex justify-between text-xs text-stone-400">
              <span>Day 1</span>
              <span>Day {maxDays}</span>
            </div>
          </div>

          {/* Recommendation Panel */}
          {(() => {
            const dayData = dailyHazardsJson.daily_data.find((d: any) => d.day === selectedDay) 
              || dailyHazardsJson.daily_data[dailyHazardsJson.daily_data.length - 1]

            if (!dayData) return null

            const isScale = dayData.recommendation === 'Scale'
            const isHold = dayData.recommendation === 'Hold'
            
            const bgColor = isScale ? 'bg-green-50' : isHold ? 'bg-yellow-50' : 'bg-red-50'
            const borderColor = isScale ? 'border-green-200' : isHold ? 'border-yellow-200' : 'border-red-200'
            const textColor = isScale ? 'text-green-800' : isHold ? 'text-yellow-800' : 'text-red-800'

            return (
              <div className={`flex flex-col rounded-lg border p-5 ${bgColor} ${borderColor}`}>
                <div className="text-sm font-medium text-stone-600">Action Recommendation</div>
                <div className={`mt-1 text-3xl font-black ${textColor}`}>
                  {dayData.recommendation.toUpperCase()}
                </div>
                
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-sm font-medium text-stone-600">Relative Hazard:</span>
                  <span className={`text-xl font-bold ${textColor}`}>{dayData.hazard_score.toFixed(2)}x</span>
                </div>
                <p className="mt-2 text-xs text-stone-500">
                  {isScale ? 'Risk is low. Consider scaling spend if ROAS is positive.' :
                   isHold ? 'Risk is accumulating. Monitor closely and hold current spend.' :
                   'High risk of imminent fatigue. Consider pausing or refreshing creative.'}
                </p>

                {/* Daily Features */}
                {dayData.features && (
                  <div className="mt-4 pt-4 border-t border-stone-200/60">
                    <div className="mb-2 text-xs font-semibold text-stone-500 uppercase tracking-wider">Metrics on Day {selectedDay}</div>
                    <ul className="space-y-1 text-sm text-stone-700">
                      <li className="flex justify-between"><span>CTR vs Peak:</span> <span className="font-medium">{dayData.features.ctr_vs_peak != null ? (dayData.features.ctr_vs_peak * 100).toFixed(0) + '%' : '-'}</span></li>
                      <li className="flex justify-between"><span>CVR vs Peak:</span> <span className="font-medium">{dayData.features.cvr_vs_peak != null ? (dayData.features.cvr_vs_peak * 100).toFixed(0) + '%' : '-'}</span></li>
                      <li className="flex justify-between"><span>7D Spend Vel.:</span> <span className="font-medium">{dayData.features.spend_velocity_7d != null ? '$' + dayData.features.spend_velocity_7d.toFixed(0) : '-'}</span></li>
                    </ul>
                  </div>
                )}
              </div>
            )
          })()}
        </div>

        {/* Trajectory Plot */}
        <div className="flex-1 rounded-lg border border-stone-100 bg-white p-4">
          <h3 className="mb-4 text-sm font-bold text-stone-800">Dynamic Hazard Trajectory</h3>
          <div className="h-72 w-full min-w-0 min-h-0">
            <ResponsiveChartWrapper>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={dailyHazardsJson.daily_data}
                  margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis 
                    dataKey="day" 
                    tick={{ fontSize: 12, fill: '#57534e' }} 
                    tickLine={false}
                    axisLine={{ stroke: '#e7e5e4' }}
                  />
                  <YAxis 
                    tick={{ fontSize: 12, fill: '#57534e' }} 
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => `${val}x`}
                  />
                  <Tooltip 
                    labelFormatter={(label) => `Day ${label}`}
                    formatter={(value: any) => [`${Number(value).toFixed(2)}x`, 'Relative Hazard']}
                  />
                  <ReferenceLine y={1.0} stroke="#a8a29e" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'Baseline (1x)', fill: '#a8a29e', fontSize: 11 }} />
                  <ReferenceLine y={2.0} stroke="#fca5a5" strokeDasharray="3 3" label={{ position: 'insideTopLeft', value: 'High Risk (2x)', fill: '#fca5a5', fontSize: 11 }} />
                  
                  <ReferenceLine x={selectedDay} stroke="#3b82f6" strokeWidth={2} />
                  
                  <Line 
                    type="monotone" 
                    dataKey="hazard_score" 
                    stroke="#dc2626" 
                    strokeWidth={2} 
                    dot={false}
                    activeDot={{ r: 4, fill: '#dc2626', stroke: '#fff' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ResponsiveChartWrapper>
          </div>
          <div className="mt-2 text-center text-xs text-stone-500">
            Days since launch
          </div>
        </div>
      </div>
    </div>
  )
}
