import { Route, Routes } from 'react-router'
import { HomePage } from './pages/HomePage'
import { RailwayHomePage } from './pages/RailwayHomePage'
import { NotFoundPage } from './pages/NotFoundPage'

export default function App() {
  const mock = import.meta.env.DEV && import.meta.env.VITE_ENABLE_MOCKS === 'true'
  return (
    <Routes>
      <Route path="/" element={mock ? <HomePage /> : <RailwayHomePage baseUrl={import.meta.env.VITE_API_BASE_URL} />} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}
