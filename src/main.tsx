import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // 有新版本就立刻啟用，避免報告／畫面卡在舊快取
    void updateSW(true)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
