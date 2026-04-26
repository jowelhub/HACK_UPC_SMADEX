/** Shared Tailwind class strings for advertiser / campaign / creative explorer. */

export const explorerUi = {
  backLink: 'mb-3 inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline',
  pageWrap: 'space-y-6 pb-10',
  headerRow: 'flex flex-wrap items-start justify-between gap-4',
  title: 'font-display text-2xl font-semibold tracking-tight text-stone-900',
  subtitle: 'mt-1 text-sm text-stone-500',
  sectionTitle: 'mb-3 font-display text-lg font-semibold text-stone-900',
  sectionSubtitle: 'mb-6 mt-1 text-sm text-stone-500',
  performanceLabel: 'mb-2 text-xs font-semibold uppercase tracking-wide text-stone-500',
  campaignNavButton:
    'rounded-lg border border-stone-200 bg-white px-4 py-3 text-left text-sm font-medium text-stone-800 shadow-sm transition hover:border-brand hover:bg-brand-50/50 hover:text-brand',
  creativeTile:
    'group flex min-w-0 flex-col rounded-lg border border-stone-200 bg-white p-2.5 text-center shadow-sm transition hover:border-brand hover:shadow-md sm:p-3',
  /** Full width of grid cell; height follows image (no forced square). */
  creativeTileImageWrap:
    'relative w-full min-h-0 overflow-hidden rounded-md bg-stone-50',
  creativeTileLabel: 'mt-2 line-clamp-3 text-xs font-medium leading-snug text-stone-800 group-hover:text-brand',
  mutedMessage: 'text-sm text-stone-500',
  errorMessage: 'text-sm text-red-600',
  notFoundWrap: 'space-y-4',
  notFoundBody: 'text-stone-600',
  /** Notion-inspired dashboard styles */
  notionGrid: 'grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
  notionCard:
    'group flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-card transition-all duration-300 hover:-translate-y-1 hover:border-brand/40 hover:shadow-lg hover:shadow-brand/5',
  notionCover: 'h-24 w-full bg-gradient-to-br transition-opacity group-hover:opacity-90',
  notionBody: 'relative flex flex-1 flex-col px-5 pb-5 pt-0',
  notionAvatarWrap:
    'absolute -top-7 left-5 flex h-14 w-14 items-center justify-center rounded-xl border-4 border-white bg-white shadow-sm transition-transform duration-300 group-hover:scale-110',
  notionAvatar:
    'flex h-full w-full items-center justify-center rounded-lg font-display text-xl font-bold text-white',
  notionTitle: 'mt-5 font-display text-lg font-bold text-stone-900 group-hover:text-brand',
  notionMeta: 'mt-3 flex flex-wrap gap-1.5',
  notionTag:
    'inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase',
  notionStat: 'mt-auto pt-4 text-xs font-medium text-stone-400',
} as const
