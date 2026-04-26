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
  /** Professional Dashboard styles - Refined for Smadex Enterprise */
  notionGrid: 'grid gap-5 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
  notionCard:
    'group flex flex-col overflow-hidden rounded-xl border border-stone-200 bg-white transition-all duration-200 hover:border-brand/40 hover:shadow-md hover:shadow-brand/5',
  notionCover: 'h-1 w-full bg-stone-100 transition-colors group-hover:bg-brand',
  notionBody: 'flex flex-1 flex-col p-5',
  notionAvatarWrap:
    'absolute -top-8 left-6 flex h-14 w-14 items-center justify-center rounded-xl border-4 border-white bg-white shadow-md transition-transform duration-300 group-hover:scale-110',
  notionAvatar:
    'flex h-full w-full items-center justify-center rounded-lg font-display text-xl font-bold text-white',
  notionTitle: 'font-display text-base font-bold leading-tight text-stone-900 transition-colors group-hover:text-brand',
  notionMeta: 'mt-2.5 flex flex-wrap gap-2',
  notionTag:
    'inline-flex items-center rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider',
  notionStat: 'mt-4 border-t border-stone-100 pt-3 text-[10px] font-bold uppercase tracking-widest text-stone-400',
  /** Professional tag colors: Regions are blue, others are neutral gray */
  getTagColor: (val: string) => {
    const v = val.toLowerCase().replace(/_/g, ' ')
    const regions = ['europe', 'north america', 'apac', 'latam']
    if (regions.some(r => v.includes(r))) {
      return 'bg-purple-50 text-purple-700 border-purple-100'
    }
    return 'bg-stone-100 text-stone-600 border-stone-200'
  },
} as const
