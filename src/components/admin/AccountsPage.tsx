import { useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { createId } from '../../lib/id'
import {
  ROLE_LABEL,
  ROLE_TONE,
  type MemberRole,
  type UserAccount,
} from '../../types/auth'

export function AccountsPage() {
  const users = useAuthStore((s) => s.users)
  const projects = useAuthStore((s) => s.projects)
  const members = useAuthStore((s) => s.members)
  const upsertUser = useAuthStore((s) => s.upsertUser)
  const setUserActive = useAuthStore((s) => s.setUserActive)
  const setMemberRole = useAuthStore((s) => s.setMemberRole)

  const [editing, setEditing] = useState<UserAccount | null>(null)
  const [isNew, setIsNew] = useState(false)

  const rows = useMemo(
    () =>
      [...users].sort((a, b) => a.displayName.localeCompare(b.displayName, 'zh-Hant')),
    [users],
  )

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 className="serif" style={{ margin: 0, fontSize: 28 }}>帳號管理</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--ink-soft)' }}>共 {rows.length} 個帳號</p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setIsNew(true)
            setEditing({
              id: createId('user'),
              email: '',
              password: Math.random().toString(36).slice(2, 10),
              displayName: '',
              active: true,
              createdAt: new Date().toISOString(),
            })
          }}
        >
          + 新增帳號
        </button>
      </header>

      <div className="admin-layout">
        <div className="admin-panel" style={{ padding: 0, overflow: 'hidden' }}>
          <table className="admin-table">
            <thead>
              <tr>
                <th>姓名</th>
                <th>帳號</th>
                <th>所屬專案</th>
                <th>狀態</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((u) => {
                const count = members.filter((m) => m.userId === u.id).length
                return (
                  <tr key={u.id} style={{ opacity: u.active ? 1 : 0.55 }}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span className="avatar-sm">{u.displayName.slice(0, 1)}</span>
                        <strong>{u.displayName}</strong>
                      </div>
                    </td>
                    <td>{u.email}</td>
                    <td>{count} 個專案</td>
                    <td>
                      <span className={`status-dot ${u.active ? 'on' : ''}`}>
                        {u.active ? '啟用' : '已停用'}
                      </span>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => {
                          setIsNew(false)
                          setEditing(u)
                        }}
                        aria-label="編輯"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        className="icon-btn"
                        onClick={() => {
                          if (
                            confirm(
                              '確定停用／刪除登入權限？此帳號建立過的缺失與歷程會保留，僅無法再登入。',
                            )
                          ) {
                            setUserActive(u.id, false)
                          }
                        }}
                        aria-label="停用"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {editing && (
          <aside className="admin-panel edit-panel">
            <h2 className="serif" style={{ margin: '0 0 4px', fontSize: 20 }}>
              {isNew ? '新增帳號' : '編輯帳號'}
            </h2>
            <p style={{ margin: '0 0 14px', color: 'var(--ink-soft)', fontSize: 13 }}>
              {editing.email || '尚未設定帳號'}
            </p>

            {isNew && (
              <div className="field">
                <label>帳號（email）</label>
                <input
                  value={editing.email}
                  onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  placeholder="name@site.tw"
                />
              </div>
            )}

            <div className="field">
              <label>顯示名稱</label>
              <input
                value={editing.displayName}
                onChange={(e) => setEditing({ ...editing, displayName: e.target.value })}
              />
            </div>

            <button type="button" className="btn btn-ghost" style={{ width: '100%', marginBottom: 14 }}>
              產生新密碼並通知
            </button>

            <div style={{ fontWeight: 800, marginBottom: 8 }}>專案與權限指派</div>
            <div style={{ display: 'grid', gap: 10 }}>
              {projects.map((p) => {
                const current =
                  members.find((m) => m.userId === editing.id && m.projectId === p.id)?.role ?? null
                return (
                  <div key={p.id} className="glass" style={{ padding: 12 }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>{p.name}</div>
                    <div className="chip-row">
                      {(['admin', 'inspector', 'viewer'] as MemberRole[]).map((role) => (
                        <button
                          key={role}
                          type="button"
                          className={`chip ${current === role ? `on ${ROLE_TONE[role]}` : ''}`}
                          onClick={() => setMemberRole(editing.id, p.id, role)}
                        >
                          {ROLE_LABEL[role].replace('人員', '').replace('僅', '')}
                        </button>
                      ))}
                      <button
                        type="button"
                        className={`chip ${current === null ? 'on' : ''}`}
                        onClick={() => setMemberRole(editing.id, p.id, null)}
                      >
                        {current ? '移除' : '加入'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 16 }}
              onClick={() => {
                if (!editing.displayName.trim() || !editing.email.trim()) {
                  alert('請填寫顯示名稱與帳號')
                  return
                }
                upsertUser({ ...editing, active: true })
                setEditing(null)
                setIsNew(false)
              }}
            >
              儲存變更
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%', marginTop: 8 }}
              onClick={() => {
                setEditing(null)
                setIsNew(false)
              }}
            >
              取消
            </button>
          </aside>
        )}
      </div>
    </div>
  )
}
