import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line, CartesianGrid, ReferenceLine } from 'recharts'
import { ResponsiveChartWrapper } from './ResponsiveChartWrapper'

interface Props {
  healthScore: number
  shapJson: any
}

export function CreativeExplainabilitySection({ healthScore, shapJson }: Props) {
  if (!shapJson) return null

  return (
    <div className="mt-8 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-stone-900">Creative Explainability (Health & Risk Factors)</h2>
        <p className="mt-1 text-sm text-stone-500">
          Understanding what drives this creative's performance based on its innate features.
        </p>
      </div>
      
      <div className="flex flex-col gap-8 md:flex-row">
        {/* Health Score Panel */}
        <div className="flex shrink-0 flex-col items-center justify-center rounded-lg bg-stone-50 p-6 md:w-48">
          <div className="text-sm font-medium text-stone-500">Health Score</div>
          <div className="relative mt-4 flex h-32 w-8 flex-col-reverse overflow-hidden rounded-full bg-stone-200">
            <div 
              className={`w-full transition-all duration-500 ${healthScore >= 60 ? 'bg-green-500' : healthScore >= 30 ? 'bg-yellow-500' : 'bg-red-500'}`}
              style={{ height: `${healthScore}%` }}
            />
          </div>
          <div className={`mt-4 text-4xl font-black ${
            healthScore >= 60 ? 'text-green-600' : healthScore >= 30 ? 'text-yellow-500' : 'text-red-500'
          }`}>
            {healthScore}
          </div>
        </div>

        {/* Factors (SHAP) */}
        {shapJson.factors && (
          <div className="flex-1 rounded-lg border border-stone-100 bg-white p-4">
            <h3 className="mb-4 text-sm font-bold text-stone-800">Feature Impact (SHAP)</h3>
            <div className="h-64 w-full min-w-0 min-h-0">
              <ResponsiveChartWrapper>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    layout="vertical"
                    data={shapJson.factors}
                    margin={{ top: 0, right: 20, left: 40, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} />
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
                        `${Number(value).toFixed(3)} (Value: ${props.payload.value})`, 
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
              <span>← Decreases Risk</span>
              <span>Increases Risk →</span>
            </div>
          </div>
        )}
        
        {/* Survival Curve */}
        {shapJson.survival_curve && (
          <div className="flex-1 rounded-lg border border-stone-100 bg-white p-4">
            <h3 className="mb-4 text-sm font-bold text-stone-800">Estimated Survival Curve</h3>
            <div className="h-64 w-full min-w-0 min-h-0">
              <ResponsiveChartWrapper>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={shapJson.survival_curve}
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
                      domain={[0, 1]}
                      tickFormatter={(val) => `${(Number(val) * 100).toFixed(0)}%`}
                    />
                    <Tooltip 
                      labelFormatter={(label) => `Day ${label}`}
                      formatter={(value: any) => [`${(Number(value) * 100).toFixed(1)}%`, 'Survival Prob.']}
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
            <div className="mt-2 text-center text-xs text-stone-500">
              Days since launch
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
