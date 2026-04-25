import { Link, Outlet, useLocation } from 'react-router-dom'

const nav = [
  { to: '/', label: 'Home' },
  { to: '/performance', label: 'Performance' },
  { to: '/fatigue', label: 'Fatigue' },
  { to: '/recommendations', label: 'Recommendations' },
]

export function Layout() {
  const loc = useLocation()
  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-ink-950/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          <Link to="/" className="font-display text-lg font-semibold tracking-tight text-white">
            Smadex <span className="text-accent">Creative</span> Lab
          </Link>
          <nav className="flex flex-wrap gap-1 text-sm">
            {nav.map((n) => (
              <Link
                key={n.to}
                to={n.to}
                className={`rounded-lg px-3 py-1.5 font-medium transition ${
                  loc.pathname === n.to
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:bg-slate-800/60 hover:text-white'
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>
      <footer className="border-t border-slate-800/60 py-4 text-center text-xs text-slate-500">
        Synthetic dataset · v1 baseline · local API <code className="text-slate-400">/api</code>
      </footer>
    </div>
  )
}
