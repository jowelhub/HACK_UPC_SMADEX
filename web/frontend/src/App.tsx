import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AdvertisersHomePage } from './pages/AdvertisersHomePage'
import { AdvertiserDetailPage } from './pages/AdvertiserDetailPage'
import { CampaignDetailPage } from './pages/CampaignDetailPage'
import { CreativeDetailPage } from './pages/CreativeDetailPage'
import { LegacyCreativeRedirect } from './pages/LegacyCreativeRedirect'
import { ChatPage } from './pages/ChatPage'
import { ROUTE_PATTERNS } from './lib/routes'

export default function App() {
  return (
    <div className="h-full min-h-0">
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<AdvertisersHomePage />} />
            <Route path={ROUTE_PATTERNS.copilot} element={<ChatPage />} />
            <Route path={ROUTE_PATTERNS.creativeNested} element={<CreativeDetailPage />} />
            <Route path={ROUTE_PATTERNS.campaign} element={<CampaignDetailPage />} />
            <Route path={ROUTE_PATTERNS.legacyCreativeById} element={<LegacyCreativeRedirect />} />
            <Route path={ROUTE_PATTERNS.advertiser} element={<AdvertiserDetailPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </div>
  )
}
