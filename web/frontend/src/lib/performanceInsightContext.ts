import type { CampaignCreativePcaResponse, HierarchyCreative, PerformanceQueryResponse } from './api'
import { fmt, fmtPct } from './performanceFormat'

export type InsightEntityKind = 'advertiser' | 'campaign' | 'creative'

/** Sent to ai-agent to pick a shorter system prompt and generation budget. */
export type PerformanceInsightMode = 'campaign_creatives'

export type PerformanceInsightPack = {
  context: string
  insightMode?: PerformanceInsightMode
}

function timeseriesDigest(ts: Array<Record<string, unknown>> | undefined): string | null {
  if (!ts?.length) return null
  const sorted = [...ts].sort((a, b) => String(a.date).localeCompare(String(b.date)))
  const first = sorted[0]
  const last = sorted[sorted.length - 1]
  const line = (row: Record<string, unknown>, label: string) => {
    const spend = Number(row.spend_usd ?? 0)
    const ctr = row.ctr
    const ctrN = typeof ctr === 'number' && !Number.isNaN(ctr) ? ctr : null
    return `${label} ${row.date}: spend USD ${fmt(spend, 2)}, CTR ${ctrN !== null ? fmtPct(ctrN) : '-'}`
  }
  if (sorted.length === 1) {
    return `Daily series (1 day): ${line(first, 'Day')}.`
  }
  return `Daily series (${sorted.length} days): ${line(first, 'First day')}; ${line(last, 'last day')}.`
}

function crossDimensionsDigest(
  breakdowns: PerformanceQueryResponse['breakdowns'],
  limit = 6,
): string | null {
  if (!breakdowns) return null
  const dims = ['country', 'os', 'format'] as const
  const blocks: string[] = []
  for (const dim of dims) {
    const rows = breakdowns[dim]
    if (!Array.isArray(rows) || !rows.length) continue
    const sorted = [...rows].sort((a, b) => Number(b.spend_usd ?? 0) - Number(a.spend_usd ?? 0)).slice(0, limit)
    const lines = sorted.map((r) => {
      const name = String(r.label ?? '?').slice(0, 24)
      const spend = Number(r.spend_usd ?? 0)
      const imps = Number(r.impressions ?? 0)
      const ctr = r.ctr
      const ctrN = typeof ctr === 'number' && !Number.isNaN(ctr) ? ctr : null
      return `  — ${name}: spend USD ${fmt(spend, 0)}, imps ${fmt(imps, 0)}, CTR ${ctrN !== null ? fmtPct(ctrN) : '-'}`
    })
    blocks.push(`BY ${dim.toUpperCase()} (top ${limit} by spend):\n${lines.join('\n')}`)
  }
  return blocks.length ? blocks.join('\n\n') : null
}

function breakdownDigest(
  entity: InsightEntityKind,
  breakdown: Array<Record<string, unknown>> | undefined,
  title: 'campaigns' | 'creatives',
  limit = 6,
): string | null {
  if (entity === 'creative' || !breakdown?.length) return null
  const rows = [...breakdown].sort((a, b) => Number(b.spend_usd ?? 0) - Number(a.spend_usd ?? 0)).slice(0, limit)
  const lines = rows.map((r) => {
    const name = String(r.label ?? r.campaign_id ?? r.creative_id ?? '?').slice(0, 48)
    const spend = Number(r.spend_usd ?? 0)
    const imps = Number(r.impressions ?? 0)
    const ctr = r.ctr
    const ctrN = typeof ctr === 'number' && !Number.isNaN(ctr) ? ctr : null
    const roas = r.roas
    const roasN = typeof roas === 'number' && !Number.isNaN(roas) ? roas : null
    return `  — ${name}: spend USD ${fmt(spend, 0)}, impressions ${fmt(imps, 0)}, CTR ${ctrN !== null ? fmtPct(ctrN) : '-'}, ROAS ${roasN !== null ? fmt(roasN, 2) : '-'}`
  })
  return `Top ${title} by spend (up to ${limit}):\n${lines.join('\n')}`
}

function closestPcaPairNote(
  points: Array<{ creative_id: number; pc1: number; pc2: number }>,
): string | null {
  if (points.length < 2) return null
  let bestD = Infinity
  let a = points[0].creative_id
  let b = points[1].creative_id
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const dx = points[i].pc1 - points[j].pc1
      const dy = points[i].pc2 - points[j].pc2
      const d = Math.hypot(dx, dy)
      if (d < bestD) {
        bestD = d
        a = points[i].creative_id
        b = points[j].creative_id
      }
    }
  }
  if (!Number.isFinite(bestD)) return null
  return `Closest pair in PC1–PC2 space: creatives #${a} and #${b} (Euclidean distance ${bestD.toFixed(3)}).`
}

function campaignCreativesAndPcaBlock(params: {
  creatives: HierarchyCreative[]
  pca: CampaignCreativePcaResponse | null
  pcaFetchError: string | null
}): string {
  const { creatives, pca, pcaFetchError } = params
  const crLines = creatives.map((c) => {
    const st = c.creative_status ?? '—'
    const fat = c.is_fatigued ? 'yes' : 'no'
    const hint = (c.label ?? '').replace(/\n/g, ' ').slice(0, 80)
    return `  — Creative #${c.creative_id}: seeded_status=${st}, fatigued_flag=${fat}, headline=${hint || '—'}`
  })
  let pcaBlock = ''
  if (pcaFetchError) {
    pcaBlock = `PCA: unavailable (${pcaFetchError}).`
  } else if (pca?.points?.length) {
    const evr = pca.explained_variance_ratio
    const p1 = evr[0] != null ? (evr[0] * 100).toFixed(1) : '?'
    const p2 = evr[1] != null ? (evr[1] * 100).toFixed(1) : '?'
    const nf = pca.n_features_used ?? '?'
    const coordLines = pca.points.map((p) => {
      const st = p.creative_status ?? '—'
      const lab = (p.label ?? '').replace(/\n/g, ' ').slice(0, 56)
      return `  — #${p.creative_id}: PC1=${p.pc1.toFixed(4)} PC2=${p.pc2.toFixed(4)} status=${st} headline=${lab}`
    })
    const pair = closestPcaPairNote(pca.points)
    pcaBlock = [
      `PCA (numeric merged-creative rows; PC1 ~${p1}% variance, PC2 ~${p2}%; ${nf} numeric features):`,
      ...coordLines,
      pair ? `\n${pair}` : '',
    ].join('\n')
  } else {
    pcaBlock = 'PCA: not enough creatives or variance for a 2D map (<2 points or failed).'
  }

  return [
    `SEEDED LABELS + PCA (not delivery metrics):`,
    `Creatives (${creatives.length}):`,
    crLines.join('\n'),
    '',
    pcaBlock,
  ].join('\n')
}

type BreakRow = {
  id: number
  spend: number
  imps: number
  clicks: number
  conv: number
  ctr: number | null
  cpa: number | null
  roas: number | null
}

function parseBreakdownRows(breakdown: Array<Record<string, unknown>> | undefined): BreakRow[] {
  if (!breakdown?.length) return []
  return breakdown.map((r) => ({
    id: Number(r.creative_id),
    spend: Number(r.spend_usd ?? 0),
    imps: Number(r.impressions ?? 0),
    clicks: Number(r.clicks ?? 0),
    conv: Number(r.conversions ?? 0),
    ctr: typeof r.ctr === 'number' && !Number.isNaN(r.ctr) ? r.ctr : null,
    cpa: typeof r.cpa_usd === 'number' && !Number.isNaN(r.cpa_usd) ? r.cpa_usd : null,
    roas: typeof r.roas === 'number' && !Number.isNaN(r.roas) ? r.roas : null,
  }))
}

function creativeDeliveryTable(
  breakdown: Array<Record<string, unknown>> | undefined,
  hierarchyCreatives: HierarchyCreative[],
): string {
  const byId = new Map(hierarchyCreatives.map((c) => [c.creative_id, c]))
  const rows = parseBreakdownRows(breakdown)
  if (!rows.length) {
    return '  (No per-creative delivery rows for this date range — cannot rank delivery.)'
  }
  rows.sort((a, b) => b.spend - a.spend)
  const n = rows.length
  return rows
    .map((row, idx) => {
      const hc = byId.get(row.id)
      const st = hc?.creative_status ?? '—'
      const fat = hc?.is_fatigued ? 'yes' : 'no'
      const ctrS = row.ctr != null ? fmtPct(row.ctr) : '-'
      const cpaS = row.cpa != null ? fmt(row.cpa, 2) : '-'
      const roasS = row.roas != null ? fmt(row.roas, 2) : '-'
      return `  — #${row.id} spend_rank ${idx + 1}/${n}: spend USD ${fmt(row.spend, 0)}, imps ${fmt(row.imps, 0)}, clicks ${fmt(row.clicks, 0)}, conv ${fmt(row.conv, 0)}, CTR ${ctrS}, CPA ${cpaS}, ROAS ${roasS} | seeded=${st} fatigued=${fat}`
    })
    .join('\n')
}

function deliveryContrasts(breakdown: Array<Record<string, unknown>> | undefined): string | null {
  const rows = parseBreakdownRows(breakdown).filter((r) => r.spend > 0)
  if (!rows.length) return null
  const topSpend = [...rows].sort((a, b) => b.spend - a.spend)[0]
  const roasOk = rows.filter((r) => r.roas != null) as Array<BreakRow & { roas: number }>
  const cpaOk = rows.filter((r) => r.cpa != null && Number.isFinite(r.cpa)) as Array<BreakRow & { cpa: number }>
  const parts: string[] = [`Highest spend in window: #${topSpend.id} (${fmt(topSpend.spend, 0)} USD).`]
  if (roasOk.length) {
    const best = [...roasOk].sort((a, b) => b.roas - a.roas)[0]
    const worst = [...roasOk].sort((a, b) => a.roas - b.roas)[0]
    parts.push(`ROAS: best #${best.id} (${fmt(best.roas, 2)}), weakest #${worst.id} (${fmt(worst.roas, 2)}).`)
  }
  if (cpaOk.length) {
    const bestCpa = [...cpaOk].sort((a, b) => a.cpa - b.cpa)[0]
    const worstCpa = [...cpaOk].sort((a, b) => b.cpa - a.cpa)[0]
    parts.push(`CPA: best #${bestCpa.id} (${fmt(bestCpa.cpa, 2)} USD), highest #${worstCpa.id} (${fmt(worstCpa.cpa, 2)} USD).`)
  }
  return `QUICK CONTRASTS (same filtered delivery rows):\n${parts.join(' ')}`
}

function buildSlimCampaignCreativesPack(params: {
  headline: string
  subtitleLines: string[]
  dateFrom: string
  dateTo: string
  data: PerformanceQueryResponse
  campaignPortfolio: {
    creatives: HierarchyCreative[]
    pca: CampaignCreativePcaResponse | null
    pcaFetchError?: string | null
  }
}): PerformanceInsightPack {
  const { headline, subtitleLines, dateFrom, dateTo, data, campaignPortfolio } = params
  const s = data.summary!
  const rollup = [
    'CAMPAIGN ROLLUP (selected dates & filters, for scale only):',
    `Spend USD ${fmt(s.total_spend_usd as number, 0)}, ROAS ${fmt(s.overall_roas as number)}, CPA ${fmt(s.overall_cpa_usd as number)}, CTR ${fmtPct(s.overall_ctr as number)}.`,
  ].join('\n')

  const scope = [
    `TASK: Compare ONLY the creatives in this campaign for the marketer.`,
    `Campaign: ${headline}`,
    ...subtitleLines.filter(Boolean).map((l) => l),
    `Dates: ${dateFrom} → ${dateTo}`,
  ].join('\n')

  const delivery = creativeDeliveryTable(data.breakdown, campaignPortfolio.creatives)
  const contrasts = deliveryContrasts(data.breakdown)
  const portfolio = campaignCreativesAndPcaBlock({
    creatives: campaignPortfolio.creatives,
    pca: campaignPortfolio.pca ?? null,
    pcaFetchError: campaignPortfolio.pcaFetchError?.trim() || '',
  })

  const context = [
    scope,
    '',
    rollup,
    '',
    'PER-CREATIVE DELIVERY (same filter):',
    delivery,
    contrasts ? `\n${contrasts}` : '',
    '',
    portfolio,
  ].join('\n')

  return { context, insightMode: 'campaign_creatives' }
}

function buildSlimCreativePack(params: {
  headline: string
  subtitleLines: string[]
  dateFrom: string
  dateTo: string
  data: PerformanceQueryResponse
}): PerformanceInsightPack {
  const { headline, subtitleLines, dateFrom, dateTo, data } = params
  const s = data.summary!
  const scope = [
    `TASK: Analyze this single creative in plain language for a marketer.`,
    `PRIORITY: Focus on Post-Launch Copilot (Interactive Hazard) and Creative Explainability (Health & Risk Factors).`,
    `ANGLE: For CPA-focused creatives, explain fatigue risk, whether to scale/hold/refresh, and which health signals matter most next.`,
    `Creative: ${headline}`,
    ...subtitleLines.filter(Boolean),
    `Dates: ${dateFrom} → ${dateTo}`,
  ].join('\n')
  const perf = [
    `Rollup: spend USD ${fmt(s.total_spend_usd as number, 0)}, impressions ${fmt(s.total_impressions as number, 0)}, clicks ${fmt(s.total_clicks as number, 0)}, conversions ${fmt(s.total_conversions as number, 0)}, revenue USD ${fmt(s.total_revenue_usd as number)}, CTR ${fmtPct(s.overall_ctr as number)}, CPA ${fmt(s.overall_cpa_usd as number)}, ROAS ${fmt(s.overall_roas as number)}.`,
  ].join('\n')
  const tsLine = timeseriesDigest(data.timeseries)
  const context = [scope, '', perf, tsLine ? `\n${tsLine}` : ''].join('\n')
  return { context, insightMode: 'campaign_creatives' }
}

/**
 * Builds the user message (and optional mode) sent to `/api/agent/insight`.
 * Campaign + portfolio uses a shorter, creative-only prompt for speed.
 */
export function buildPerformanceInsightContext(params: {
  entity: InsightEntityKind
  headline: string
  subtitleLines: string[]
  dateFrom: string
  dateTo: string
  data: PerformanceQueryResponse | null
  campaignPortfolio?: {
    creatives: HierarchyCreative[]
    pca: CampaignCreativePcaResponse | null
    pcaFetchError?: string | null
  }
}): PerformanceInsightPack | null {
  const { entity, headline, subtitleLines, dateFrom, dateTo, data, campaignPortfolio } = params
  const summary = data?.summary
  if (!summary) return null

  if (entity === 'campaign' && campaignPortfolio?.creatives?.length && data) {
    return buildSlimCampaignCreativesPack({
      headline,
      subtitleLines,
      dateFrom,
      dateTo,
      data,
      campaignPortfolio,
    })
  }

  if (entity === 'creative' && data) {
    return buildSlimCreativePack({
      headline,
      subtitleLines,
      dateFrom,
      dateTo,
      data,
    })
  }

  const s = summary
  const perfBlock = [
    'PERFORMANCE (aggregated for the selected date range and filters)',
    `SPEND (USD): ${fmt(s.total_spend_usd as number, 0)}`,
    `IMPRESSIONS: ${fmt(s.total_impressions as number, 0)}`,
    `CLICKS: ${fmt(s.total_clicks as number, 0)}`,
    `CONVERSIONS: ${fmt(s.total_conversions as number, 0)}`,
    `REVENUE (USD): ${fmt(s.total_revenue_usd as number)}`,
    `CTR: ${fmtPct(s.overall_ctr as number)}`,
    `CPA (USD): ${fmt(s.overall_cpa_usd as number)}`,
    `ROAS: ${fmt(s.overall_roas as number)}`,
  ].join('\n')

  const scopeBlock = [
    `SCOPE: ${entity.toUpperCase()}`,
    `HEADLINE: ${headline}`,
    ...subtitleLines.filter(Boolean).map((l) => `DETAIL: ${l}`),
    `DATE RANGE: ${dateFrom} through ${dateTo}`,
  ].join('\n')

  const tsLine = timeseriesDigest(data!.timeseries)
  const bd =
    entity === 'advertiser'
      ? breakdownDigest(entity, data!.breakdown, 'campaigns')
      : entity === 'campaign'
        ? breakdownDigest(entity, data!.breakdown, 'creatives')
        : null
  const cross = entity === 'creative' ? crossDimensionsDigest(data!.breakdowns) : null

  const extra = [tsLine, bd, cross].filter(Boolean).join('\n\n')
  const context = [scopeBlock, '', perfBlock, extra ? `\n${extra}` : ''].join('')
  return { context }
}
