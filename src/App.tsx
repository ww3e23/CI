import { useEffect, useState } from 'react'
import { BottomNav, type TabKey } from './components/layout/BottomNav'
import { HomePage } from './components/home/HomePage'
import { CategoryPage } from './components/home/CategoryPage'
import { DefectsPage } from './components/defects/DefectsPage'
import { ReportsPage } from './components/reports/ReportsPage'
import { ProfilePage } from './components/profile/ProfilePage'
import { AddDefectSheet } from './components/defects/AddDefectSheet'
import { LoginPage } from './components/auth/LoginPage'
import { AdminApp } from './components/admin/AdminApp'
import { InstallBanner } from './components/pwa/InstallBanner'
import { UpdateAppBanner } from './components/pwa/UpdateAppBanner'
import { useAuthStore } from './store/useAuthStore'
import { TitleHint } from './components/ui/TitleHint'
import { useProjectStore } from './store/useProjectStore'
import { isFirebaseConfigured } from './lib/firebase'

function useHashRoute() {
  const [hash, setHash] = useState(() => window.location.hash || '#/')
  useEffect(() => {
    const onHash = () => setHash(window.location.hash || '#/')
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])
  return hash
}

export default function App() {
  const hash = useHashRoute()
  const currentUserId = useAuthStore((s) => s.currentUserId)
  const currentProjectId = useAuthStore((s) => s.currentProjectId)
  const projects = useAuthStore((s) => s.projects)
  const isSystemAdmin = useAuthStore(
    (s) => s.users.find((u) => u.id === s.currentUserId)?.systemAdmin === true,
  )
  const [tab, setTab] = useState<TabKey>('home')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  // 開 App／還原工作階段時，從雲端把棟別／缺失拉回來；並補傳尚未上雲的照片
  useEffect(() => {
    if (!currentUserId || !currentProjectId) return
    if (isFirebaseConfigured()) {
      void useProjectStore.getState().hydrateFromCloud(currentProjectId)
    } else {
      void useProjectStore.getState().restorePendingMediaToMemory()
    }

    const flush = () => {
      void useProjectStore.getState().flushPendingMediaUploads()
    }
    const onVis = () => {
      if (document.visibilityState === 'visible') flush()
    }
    window.addEventListener('online', flush)
    document.addEventListener('visibilitychange', onVis)
    return () => {
      window.removeEventListener('online', flush)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [currentUserId, currentProjectId])

  if (hash.startsWith('#/admin')) {
    return <AdminApp />
  }

  if (!currentUserId) {
    return (
      <>
        <LoginPage />
        <InstallBanner />
      </>
    )
  }

  // 管理者尚未建立專案：引導到後台，不塞示範資料
  if (isSystemAdmin && projects.length === 0) {
    return (
      <div className="app-shell login-shell" style={{ display: 'grid', placeItems: 'center', padding: 20 }}>
        <div className="glass" style={{ width: '100%', maxWidth: 420, padding: 22 }}>
          <TitleHint
            as="h1"
            className="serif"
            style={{ margin: 0, fontSize: 24 }}
            hint="目前沒有任何專案。請先到後台新增專案、建立帳號並指派人員。"
          >
            開始設定
          </TitleHint>
          <a
            href="#/admin"
            className="btn btn-primary"
            style={{ marginTop: 16, textDecoration: 'none', display: 'inline-flex' }}
            onClick={() => {
              window.location.hash = '#/admin'
            }}
          >
            開啟驗屋後台
          </a>
        </div>
        <InstallBanner />
      </div>
    )
  }

  if (!currentProjectId) {
    if (isSystemAdmin && projects.length > 0) {
      return (
        <div className="app-shell login-shell" style={{ display: 'grid', placeItems: 'center', padding: 20 }}>
          <div className="glass" style={{ width: '100%', maxWidth: 420, padding: 22 }}>
            <TitleHint
              as="h1"
              className="serif"
              style={{ margin: '0 0 14px', fontSize: 24 }}
              hint="系統管理者可進入任一專案查看。"
            >
              選擇要查看的專案
            </TitleHint>
            <div style={{ display: 'grid', gap: 8 }}>
              {projects.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="btn btn-ghost"
                  style={{ justifyContent: 'flex-start', textAlign: 'left' }}
                  onClick={() => useAuthStore.getState().switchProject(p.id)}
                >
                  <span style={{ fontWeight: 800 }}>{p.name}</span>
                  <span style={{ color: 'var(--ink-soft)', marginLeft: 8, fontSize: 12 }}>
                    {p.code}
                  </span>
                </button>
              ))}
            </div>
            <a
              href="#/admin"
              className="btn btn-primary"
              style={{ marginTop: 16, textDecoration: 'none', display: 'inline-flex' }}
            >
              回後台
            </a>
          </div>
          <InstallBanner />
        </div>
      )
    }
    return (
      <div className="app-shell login-shell" style={{ display: 'grid', placeItems: 'center', padding: 20 }}>
        <div className="glass" style={{ width: '100%', maxWidth: 420, padding: 22 }}>
          <TitleHint
            as="h1"
            className="serif"
            style={{ margin: '0 0 14px', fontSize: 24 }}
            hint="帳號已登入，但還沒有可進入的專案。請請系統管理者在後台「專案管理」將你加入專案。"
          >
            尚未指派專案
          </TitleHint>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: 16 }}
            onClick={() => void useAuthStore.getState().logout()}
          >
            登出
          </button>
        </div>
        <InstallBanner />
      </div>
    )
  }

  function handleNav(next: TabKey) {
    if (next === 'add') {
      setAddOpen(true)
      return
    }
    setCategoryId(null)
    setTab(next)
  }

  return (
    <div className="app-shell">
      <main className="app-main">
        {tab === 'home' && !categoryId && (
          <HomePage onOpenCategory={(id) => setCategoryId(id)} />
        )}
        {tab === 'home' && categoryId && (
          <CategoryPage categoryId={categoryId} onBack={() => setCategoryId(null)} />
        )}
        {tab === 'defects' && <DefectsPage />}
        {tab === 'reports' && <ReportsPage />}
        {tab === 'profile' && <ProfilePage />}
      </main>
      <BottomNav active={tab} onChange={handleNav} />
      {addOpen && <AddDefectSheet onClose={() => setAddOpen(false)} />}
      <UpdateAppBanner />
      <InstallBanner />
    </div>
  )
}
