import { useMemo, useState } from 'react'
import { Building2, Clock3, LogOut, Users } from 'lucide-react'
import { useAuthStore, useCurrentUser } from '../../store/useAuthStore'
import { TitleHint } from '../ui/TitleHint'
import { isFirebaseConfigured } from '../../lib/firebase'
import { AccountsPage } from './AccountsPage'
import { ProjectsPage } from './ProjectsPage'
import { AuditPage } from './AuditPage'

type AdminTab = 'accounts' | 'projects' | 'audit'

export function AdminApp() {
  const user = useCurrentUser()
  const logout = useAuthStore((s) => s.logout)
  const refreshDirectory = useAuthStore((s) => s.refreshDirectory)
  const [tab, setTab] = useState<AdminTab>('accounts')
  const [syncing, setSyncing] = useState(false)
  const canAccess = Boolean(user?.systemAdmin)
  const cloud = isFirebaseConfigured()

  const nav = useMemo(
    () => [
      { key: 'accounts' as const, label: '帳號管理', icon: Users },
      { key: 'projects' as const, label: '專案管理', icon: Building2 },
      { key: 'audit' as const, label: '操作歷程', icon: Clock3 },
    ],
    [],
  )

  if (!user) {
    return (
      <div className="admin-shell">
        <div className="admin-panel" style={{ margin: 'auto', padding: 24, maxWidth: 420 }}>
          <TitleHint as="h1" className="serif" hint="後台需使用管理者帳號。">
            請先登入
          </TitleHint>
          <a href="#/" className="btn btn-primary" style={{ marginTop: 12, textDecoration: 'none' }}>
            回現場 App 登入
          </a>
        </div>
      </div>
    )
  }

  if (!canAccess) {
    return (
      <div className="admin-shell">
        <div className="admin-panel" style={{ margin: 'auto', padding: 24, maxWidth: 420 }}>
          <TitleHint as="h1" className="serif" hint="僅系統管理者可進入驗屋後台。">
            無權限
          </TitleHint>
          <a href="#/" className="btn btn-primary" style={{ marginTop: 12, textDecoration: 'none' }}>
            回現場 App
          </a>
        </div>
      </div>
    )
  }

  return (
    <div className="admin-shell">
      <aside className="admin-sidebar">
        <div className="admin-brand">
          <div className="admin-brand-mark">驗</div>
          <div>
            <div className="serif" style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.2 }}>
              驗屋後台
            </div>
          </div>
        </div>

        <nav
          style={{
            display: 'grid',
            gap: 6,
            flex: 1,
            alignContent: 'start',
            gridAutoRows: 'min-content',
          }}
        >
          {nav.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={`admin-nav ${tab === key ? 'on' : ''}`}
              onClick={() => setTab(key)}
            >
              <Icon size={18} strokeWidth={2} />
              <span>{label}</span>
            </button>
          ))}
        </nav>

        <div className="admin-sidebar-foot">
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: 999,
                background: 'var(--green-deep)',
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
              }}
            >
              {user.displayName.slice(0, 1)}
            </div>
            <div>
              <div style={{ fontWeight: 800, fontSize: 13 }}>{user.displayName}</div>
              <div style={{ fontSize: 11, color: 'var(--ink-soft)' }}>系統管理者</div>
            </div>
          </div>
          <div style={{ display: 'grid', gap: 8, marginTop: 12 }}>
            {cloud && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{
                  justifyContent: 'flex-start',
                  minHeight: 40,
                  fontSize: 13,
                }}
                disabled={syncing}
                onClick={() => {
                  void (async () => {
                    setSyncing(true)
                    const r = await refreshDirectory()
                    setSyncing(false)
                    alert(r.ok ? '已同步到雲端，手機重新登入或按同步後即可看到專案' : r.error || '同步失敗')
                  })()
                }}
              >
                {syncing ? '同步中…' : '同步到雲端（給手機用）'}
              </button>
            )}
            <a
              href="#/"
              className="btn btn-ghost"
              style={{
                textDecoration: 'none',
                justifyContent: 'flex-start',
                minHeight: 40,
                fontSize: 13,
              }}
            >
              ← 回現場 App
            </a>
            <button
              type="button"
              className="btn btn-ghost"
              style={{
                justifyContent: 'flex-start',
                minHeight: 40,
                fontSize: 13,
                color: 'var(--terracotta)',
                borderColor: 'rgba(174,76,59,0.28)',
                gap: 8,
              }}
              onClick={() => {
                void (async () => {
                  await logout()
                  window.location.hash = '#/'
                })()
              }}
            >
              <LogOut size={16} />
              登出
            </button>
          </div>
        </div>
      </aside>

      <main className="admin-main">
        {tab === 'accounts' && <AccountsPage />}
        {tab === 'projects' && <ProjectsPage />}
        {tab === 'audit' && <AuditPage />}
      </main>
    </div>
  )
}
