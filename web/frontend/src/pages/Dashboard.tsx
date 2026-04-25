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
    <div className="space-y-10">
      <div className="max-w-3xl">
        <h1 className="font-display text-3xl font-bold tracking-tight text-brand sm:text-4xl">Creative intelligence</h1>
        <p className="mt-3 text-base leading-relaxed text-stone-600">
          Three independent modules share one enriched daily table on the backend. Pick a flow to explore; each route loads only its own UI
          and API calls.
        </p>
      </div>
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="group flex flex-col rounded-2xl border border-stone-200 bg-white p-6 shadow-card transition hover:border-brand/25 hover:shadow-md"
          >
            <span className="inline-flex w-fit rounded-full bg-brand-50 px-3 py-1 text-xs font-semibold text-brand ring-1 ring-brand/10">
              {c.tag}
            </span>
            <h2 className="mt-4 font-display text-xl font-semibold text-stone-900 group-hover:text-brand">{c.title}</h2>
            <p className="mt-2 flex-1 text-sm leading-relaxed text-stone-600">{c.desc}</p>
            <span className="mt-5 inline-flex items-center text-sm font-semibold text-brand">
              Open
              <span className="ml-1 transition group-hover:translate-x-0.5" aria-hidden>
                →
              </span>
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
