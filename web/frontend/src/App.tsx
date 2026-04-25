import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { Layout } from './components/Layout'
import { Dashboard } from './pages/Dashboard'
import { FatiguePage } from './pages/FatiguePage'
import { PerformancePage } from './pages/PerformancePage'
import { RecommendationsPage } from './pages/RecommendationsPage'
import { ChatPage } from './pages/ChatPage'

export default function App() {
  return (
    <div className="h-full min-h-0">
      <BrowserRouter>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="performance" element={<PerformancePage />} />
            <Route path="fatigue" element={<FatiguePage />} />
            <Route path="recommendations" element={<RecommendationsPage />} />
            <Route path="copilot" element={<ChatPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </div>
  )
}
