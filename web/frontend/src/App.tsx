import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { AdvertisersHomePage } from './pages/AdvertisersHomePage'
import { AdvertiserDetailPage } from './pages/AdvertiserDetailPage'
import { CreativeDetailPage } from './pages/CreativeDetailPage'
import { ExplorerTwoSegmentPage } from './pages/ExplorerTwoSegmentPage'
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
            <Route path={ROUTE_PATTERNS.advertiserCampaign} element={<ExplorerTwoSegmentPage />} />
            <Route path={ROUTE_PATTERNS.advertiser} element={<AdvertiserDetailPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </div>
  )
}
