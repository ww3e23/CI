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
import { useAuthStore } from './store/useAuthStore'

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
  const [tab, setTab] = useState<TabKey>('home')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

  if (hash.startsWith('#/admin')) {
    return <AdminApp />
  }

  if (!currentUserId) {
    return <LoginPage />
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
    </div>
  )
}
