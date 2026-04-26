import { Link, Outlet, useLocation } from 'react-router-dom'
import { pathCopilot, pathHome } from '../lib/routes'

const primaryNav = [
  { to: pathHome(), label: 'Advertisers' },
  { to: pathCopilot(), label: 'Copilot' },
] as const

export function Layout() {
  const loc = useLocation()
  const isCopilot = loc.pathname === pathCopilot()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <header className="sticky top-0 z-20 shrink-0 border-b border-stone-200/90 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link
            to={pathHome()}
            className="font-display flex items-center gap-2.5 text-lg font-semibold tracking-tight text-stone-900"
          >
            <img src="/logo.png" alt="" className="h-8 w-8 shrink-0 object-contain" width={32} height={32} />
            <span>
              Smadex <span className="font-medium text-brand">Creative Lab</span>
            </span>
          </Link>
          <nav className="flex flex-wrap items-center gap-1 text-sm font-medium">
            {primaryNav.map((n) => {
              const active = n.to === pathCopilot() ? isCopilot : !isCopilot
              return (
              <Link
                key={n.to}
                to={n.to}
                className={`rounded-md px-3 py-1.5 text-sm transition ${
                  active
                    ? 'bg-stone-100 font-medium text-stone-900'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-brand'
                }`}
              >
                {n.label}
              </Link>
              )
            })}
          </nav>
        </div>
      </header>
      <main
        className={
          isCopilot
            ? 'mx-auto flex h-full min-h-0 w-full max-w-7xl flex-1 flex-col items-center overflow-hidden px-4 pb-5 pt-6 sm:px-6 sm:pb-8 sm:pt-8'
            : 'mx-auto w-full max-w-7xl min-h-0 flex-1 overflow-y-auto px-4 py-8 sm:px-6'
        }
      >
        <Outlet />
      </main>
    </div>
  )
}
