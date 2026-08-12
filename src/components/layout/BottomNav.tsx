import { useSyncExternalStore } from 'react'
import { BarChart3, ClipboardList, Home, Plus, UserRound } from 'lucide-react'
import {
  isReportPreviewLocked,
  subscribeReportPreviewLock,
} from '../../lib/reportPreviewLock'

export type TabKey = 'home' | 'defects' | 'add' | 'reports' | 'profile'

const items: { key: TabKey; label: string; icon: typeof Home }[] = [
  { key: 'home', label: '首頁', icon: Home },
  { key: 'defects', label: '缺失', icon: ClipboardList },
  { key: 'add', label: '新增', icon: Plus },
  { key: 'reports', label: '報表', icon: BarChart3 },
  { key: 'profile', label: '我的', icon: UserRound },
]

export function BottomNav({
  active,
  onChange,
}: {
  active: TabKey
  onChange: (tab: TabKey) => void
}) {
  const locked = useSyncExternalStore(
    subscribeReportPreviewLock,
    isReportPreviewLocked,
    isReportPreviewLocked,
  )

  return (
    <nav
      className="bottom-nav glass"
      aria-label="主選單"
      aria-hidden={locked || undefined}
      style={locked ? { pointerEvents: 'none', opacity: 0.35 } : undefined}
    >
      {items.map(({ key, label, icon: Icon }) => {
        if (key === 'add') {
          return (
            <button
              key={key}
              type="button"
              className={`nav-item add-slot ${active === key ? 'active' : ''}`}
              disabled={locked}
              onClick={() => {
                if (locked) return
                onChange(key)
              }}
              aria-label="新增缺失"
            >
              <span className="add-fab">
                <Plus size={22} strokeWidth={2.4} />
              </span>
            </button>
          )
        }
        return (
          <button
            key={key}
            type="button"
            className={`nav-item ${active === key ? 'active' : ''}`}
            disabled={locked}
            onClick={() => {
              if (locked) return
              onChange(key)
            }}
          >
            <Icon size={18} strokeWidth={2.2} />
            <span>{label}</span>
          </button>
        )
      })}
    </nav>
  )
}
