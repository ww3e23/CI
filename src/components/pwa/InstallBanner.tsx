import { useEffect, useState } from 'react'
import { Download, X } from 'lucide-react'
import { TitleHint } from '../ui/TitleHint'

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

const DISMISS_KEY = 'pwa-install-dismissed'

function isStandalone() {
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    // iOS Safari
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone)
  )
}

export function InstallBanner() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)
  const [hint, setHint] = useState('')

  useEffect(() => {
    if (isStandalone()) return
    if (localStorage.getItem(DISMISS_KEY) === '1') return

    const onBip = (e: Event) => {
      e.preventDefault()
      setDeferred(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', onBip)

    // Android 若尚未觸發 install prompt，仍顯示手動引導
    const t = window.setTimeout(() => {
      if (!isStandalone() && localStorage.getItem(DISMISS_KEY) !== '1') {
        setVisible(true)
      }
    }, 1200)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBip)
      window.clearTimeout(t)
    }
  }, [])

  if (!visible || isStandalone()) return null

  async function install() {
    if (deferred) {
      await deferred.prompt()
      const choice = await deferred.userChoice
      setDeferred(null)
      if (choice.outcome === 'accepted') {
        setVisible(false)
        return
      }
    }
    setHint('請用 Chrome 打開選單 ⋮ →「安裝應用程式」或「加到主畫面」')
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setVisible(false)
  }

  return (
    <div className="install-banner glass">
      <div style={{ flex: 1, minWidth: 0 }}>
        <TitleHint
          as="div"
          style={{ fontWeight: 800, fontSize: 14 }}
          hint={hint || '像 App 一樣從桌面開啟，全螢幕、更好用。'}
        >
          安裝到手機主畫面
        </TitleHint>
      </div>
      <button type="button" className="btn btn-primary" style={{ minHeight: 40, padding: '0 12px' }} onClick={() => void install()}>
        <Download size={16} /> 安裝
      </button>
      <button type="button" className="icon-btn" aria-label="關閉" onClick={dismiss}>
        <X size={18} />
      </button>
    </div>
  )
}
