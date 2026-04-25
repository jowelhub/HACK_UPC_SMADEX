import { Link } from 'react-router-dom'

const cards = [
  {
    to: '/performance',
    title: 'Performance Explorer',
    desc: 'Slice the daily fact table by time, advertiser, geo, OS, format, and more. Metrics and charts are computed from filtered rows.',
    tag: 'Analytics',
  },
  {
    to: '/fatigue',
    title: 'Fatigue Detection',
    desc: 'Rolling CPA vs a post-learning baseline, degradation curve per creative, and optional comparison to dataset status labels.',
    tag: 'Signals',
  },
  {
    to: '/recommendations',
    title: 'Recommendations',
    desc: 'Rule-based actions on creatives: scale, watch, rotate to a similar healthy unit, replace assets, or pause - not bid recsys.',
    tag: 'Actions',
  },
]

export function Dashboard() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">Creative intelligence</h1>
        <p className="mt-2 max-w-2xl text-slate-400">
          Three independent modules share one enriched daily table on the backend. Pick a flow to explore; each route loads only its own UI
          and API calls.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="group flex flex-col rounded-2xl border border-slate-800 bg-slate-900/40 p-6 transition hover:border-accent/40 hover:bg-slate-900/70"
          >
            <span className="inline-flex w-fit rounded-full bg-slate-800 px-2.5 py-0.5 text-xs font-medium text-accent">
              {c.tag}
            </span>
            <h2 className="mt-4 font-display text-xl font-semibold text-white group-hover:text-accent">{c.title}</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">{c.desc}</p>
            <span className="mt-4 text-sm font-medium text-slate-300 group-hover:text-white">
              Open
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
