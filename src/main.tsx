import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'
import { notifyAppUpdateReady } from './components/pwa/UpdateAppBanner'

const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    // 顯示橫幅讓使用者手動更新；同時嘗試自動啟用（部分裝置仍需手動重開）
    notifyAppUpdateReady(() => {
      void updateSW(true).then(() => {
        window.location.reload()
      })
    })
    void updateSW(true)
  },
  onRegisteredSW(_swUrl, registration) {
    if (!registration) return
    // 回到 App／回前景時檢查更新，避免手機長期卡舊快取
    const check = () => {
      void registration.update().catch(() => undefined)
    }
    check()
    setInterval(check, 60_000)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
    window.addEventListener('online', check)
  },
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
