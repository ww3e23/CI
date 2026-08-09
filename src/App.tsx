import { useState } from 'react'
import { BottomNav, type TabKey } from './components/layout/BottomNav'
import { HomePage } from './components/home/HomePage'
import { CategoryPage } from './components/home/CategoryPage'
import { DefectsPage } from './components/defects/DefectsPage'
import { ReportsPage } from './components/reports/ReportsPage'
import { ProfilePage } from './components/profile/ProfilePage'
import { AddDefectSheet } from './components/defects/AddDefectSheet'

export default function App() {
  const [tab, setTab] = useState<TabKey>('home')
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)

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
