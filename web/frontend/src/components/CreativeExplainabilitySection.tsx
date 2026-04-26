import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, ReferenceLine } from 'recharts'
import { ResponsiveChartWrapper } from './ResponsiveChartWrapper'

interface Props {
  healthScore: number
  shapJson: any
}

export function CreativeExplainabilitySection({ healthScore, shapJson }: Props) {
  if (!shapJson) return null

  const toneClass =
    healthScore >= 60 ? 'text-emerald-600' : healthScore >= 30 ? 'text-amber-500' : 'text-rose-500'
  const fillClass =
    healthScore >= 60 ? 'bg-emerald-500' : healthScore >= 30 ? 'bg-amber-500' : 'bg-rose-500'

  return (
    <div className="mt-8 rounded-md border border-stone-200 bg-white p-4 sm:p-5">
      <div className="mb-4">
        <h2 className="text-lg font-semibold text-stone-900">Creative Health</h2>
        <p className="mt-1 text-sm text-stone-500">
          Model-based drivers behind risk and expected survival.
        </p>
      </div>
      
      <div className="flex flex-col gap-4 lg:flex-row">
        <div className="flex shrink-0 flex-col items-center justify-center rounded-md border border-stone-200 bg-stone-50/80 p-5 lg:w-48">
          <div className="text-sm font-medium text-stone-500">Health score</div>
          <div className="relative mt-4 flex h-32 w-8 flex-col-reverse overflow-hidden rounded-full bg-stone-200">
            <div
              className={`w-full transition-all duration-500 ${fillClass}`}
              style={{ height: `${healthScore}%` }}
            />
          </div>
          <div className={`mt-4 text-4xl font-semibold ${toneClass}`}>
            {healthScore}
          </div>
          <div className="mt-1 text-xs uppercase tracking-wide text-stone-400">out of 100</div>
        </div>

        {shapJson.factors && (
          <div className="flex-1 rounded-md border border-stone-200 bg-white p-4">
            <h3 className="mb-4 text-sm font-semibold text-stone-900">Risk drivers</h3>
            <div className="h-64 w-full min-h-0 min-w-0">
              <ResponsiveChartWrapper>
                <ResponsiveContainer width="100%" height="100%" minHeight={240} debounce={1}>
                  <BarChart
                    layout="vertical"
                    data={shapJson.factors}
                    margin={{ top: 0, right: 20, left: 40, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis 
                      dataKey="feature" 
                      type="category" 
                      axisLine={false} 
                      tickLine={false}
                      tick={{ fontSize: 12, fill: '#57534e' }}
                      tickFormatter={(val) => typeof val === 'string' ? val.replace(/_/g, ' ') : val}
                    />
                    <Tooltip
                      formatter={(value: any, _name: any, props: any) => [
                        `${Number(value).toFixed(3)} · value ${props.payload.value}`,
                        'Impact'
                      ]}
                    />
                    <ReferenceLine x={0} stroke="#a8a29e" />
                    <Bar dataKey="shap_value" barSize={16} radius={[0, 4, 4, 0]}>
                      {shapJson.factors?.map((entry: any, index: number) => (
                        <Cell key={`cell-${index}`} fill={entry.shap_value > 0 ? '#ef4444' : '#3b82f6'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </ResponsiveChartWrapper>
            </div>
            <div className="mt-2 flex justify-between text-xs text-stone-500">
              <span>Lower risk</span>
              <span>Higher risk</span>
            </div>
          </div>
        )}
        
        {shapJson.survival_curve && (
          <div className="flex-1 rounded-md border border-stone-200 bg-white p-4">
            <h3 className="mb-4 text-sm font-semibold text-stone-900">Survival outlook</h3>
            <div className="h-64 w-full min-h-0 min-w-0">
              <ResponsiveChartWrapper>
                <ResponsiveContainer width="100%" height="100%" minHeight={240} debounce={1}>
                  <LineChart
                    data={shapJson.survival_curve}
                    margin={{ top: 12, right: 12, left: 0, bottom: 0 }}
                  >
                    <CartesianGrid stroke="#e7e5e4" strokeDasharray="3 3" vertical={false} />
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
                      domain={[0, 1]}
                      tickFormatter={(val) => `${(Number(val) * 100).toFixed(0)}%`}
                    />
                    <Tooltip 
                      labelFormatter={(label) => `Day ${label}`}
                      formatter={(value: any) => [`${(Number(value) * 100).toFixed(1)}%`, 'Survival']}
                    />
                    <Line 
                      type="stepAfter" 
                      dataKey="prob" 
                      stroke="#8b5cf6" 
                      strokeWidth={2} 
                      dot={false}
                      activeDot={{ r: 4, fill: '#8b5cf6', stroke: '#fff' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </ResponsiveChartWrapper>
            </div>
            <div className="mt-3 text-right text-xs text-stone-500">
              Probability of staying healthy over time
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
