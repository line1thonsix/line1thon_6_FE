import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router'
import { queryClient } from './api/queryClient'
import { enableMocking } from './mocks/enableMocking'
import App from './App'
import './styles/index.css'

async function bootstrap() {
  await enableMocking()

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  )
}

bootstrap().catch((error: unknown) => {
  console.error('개발 환경을 시작하지 못했습니다.', error)
  const root = document.getElementById('root')
  if (root) root.textContent = '앱을 시작하지 못했습니다. 개발자 콘솔을 확인해 주세요.'
})
