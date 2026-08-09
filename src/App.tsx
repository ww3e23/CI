import { useState } from 'react'
import { BottomNav, type TabKey } from './components/layout/BottomNav'
import { InspectPage } from './components/inspect/InspectPage'
import { DefectsPage } from './components/defects/DefectsPage'
import { ReportsPage } from './components/reports/ReportsPage'
import { SettingsPage } from './components/settings/SettingsPage'

export default function App() {
  const [tab, setTab] = useState<TabKey>('inspect')

  return (
    <div className="app-shell">
      <main className="app-main">
        {tab === 'inspect' && <InspectPage />}
        {tab === 'defects' && <DefectsPage />}
        {tab === 'reports' && <ReportsPage />}
        {tab === 'settings' && <SettingsPage />}
      </main>
      <BottomNav active={tab} onChange={setTab} />
    </div>
  )
}
