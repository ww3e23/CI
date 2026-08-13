import { useEffect, useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { APP_VERSION } from '../../lib/appVersion'

const EVENT = 'ci-app-update-ready'

export function notifyAppUpdateReady(apply: () => void) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { apply } }))
}

/** 有新版 Service Worker 時顯示，強制使用者一鍵更新（解決手機卡舊快取） */
export function UpdateAppBanner() {
  const [apply, setApply] = useState<null | (() => void)>(null)

  useEffect(() => {
    const onReady = (e: Event) => {
      const detail = (e as CustomEvent<{ apply: () => void }>).detail
      if (detail?.apply) setApply(() => detail.apply)
    }
    window.addEventListener(EVENT, onReady)
    return () => window.removeEventListener(EVENT, onReady)
  }, [])

  if (!apply) return null

  return (
    <div
      className="install-banner glass"
      style={{
        bottom: 'calc(72px + env(safe-area-inset-bottom))',
        borderColor: 'rgba(47,93,76,0.35)',
        background: 'rgba(47,93,76,0.96)',
        color: '#fff',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>發現新版本</div>
        <div style={{ fontSize: 12, opacity: 0.9, fontWeight: 600 }}>
          目前快取可能是舊版（{APP_VERSION}）。請立刻更新後再下載照片。
        </div>
      </div>
      <button
        type="button"
        className="btn btn-primary"
        style={{ minHeight: 40, padding: '0 12px', background: '#fff', color: 'var(--green-deep)' }}
        onClick={() => apply()}
      >
        <RefreshCw size={16} /> 更新
      </button>
    </div>
  )
}

/** 強制清掉 Service Worker＋Cache，再硬重載最新版（避免只改 URL 仍吃舊 SW） */
export async function forceReloadApp() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations()
      await Promise.all(regs.map((r) => r.unregister()))
    }
  } catch {
    /* ignore */
  }
  try {
    if ('caches' in window) {
      const keys = await caches.keys()
      await Promise.all(keys.map((k) => caches.delete(k)))
    }
  } catch {
    /* ignore */
  }

  const url = new URL(window.location.href)
  url.searchParams.set('v', APP_VERSION)
  url.searchParams.set('_', String(Date.now()))
  // 用 replace 避免回來又進舊頁；hash（如 #/）保留
  window.location.replace(url.toString())
}
