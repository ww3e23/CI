import { BarChart3, ClipboardList, Grid2x2, Settings } from 'lucide-react'

export type TabKey = 'inspect' | 'defects' | 'reports' | 'settings'

const items: { key: TabKey; label: string; icon: typeof Grid2x2 }[] = [
  { key: 'inspect', label: '查驗', icon: Grid2x2 },
  { key: 'defects', label: '缺失', icon: ClipboardList },
  { key: 'reports', label: '報表', icon: BarChart3 },
  { key: 'settings', label: '設定', icon: Settings },
]

export function BottomNav({
  active,
  onChange,
}: {
  active: TabKey
  onChange: (tab: TabKey) => void
}) {
  return (
    <nav className="bottom-nav" aria-label="主選單">
      {items.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          className={`nav-item ${active === key ? 'active' : ''}`}
          onClick={() => onChange(key)}
        >
          <Icon size={20} strokeWidth={2.2} />
          <span>{label}</span>
        </button>
      ))}
    </nav>
  )
}
