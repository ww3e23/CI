import { useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { isFirebaseConfigured } from '../../lib/firebase'
import { createId } from '../../lib/id'
import { type MemberRole, type UserAccount } from '../../types/auth'

const ROLE_SHORT: Record<MemberRole, string> = {
  admin: '管理',
  inspector: '查驗',
  viewer: '查看',
}

function randomPassword() {
  return Math.random().toString(36).slice(2, 10)
}

export function AccountsPage() {
  const users = useAuthStore((s) => s.users)
  const projects = useAuthStore((s) => s.projects)
  const members = useAuthStore((s) => s.members)
  const upsertUser = useAuthStore((s) => s.upsertUser)
  const setUserActive = useAuthStore((s) => s.setUserActive)
  const setMemberRole = useAuthStore((s) => s.setMemberRole)
  const cloud = isFirebaseConfigured()

  const [editing, setEditing] = useState<UserAccount | null>(null)
  const [isNew, setIsNew] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState('')

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
          <p style={{ margin: '6px 0 0', color: 'var(--ink-soft)', fontSize: 14 }}>
            共 {rows.length} 個帳號
            {cloud ? ' · 儲存時會同步登記到 Firebase Authentication' : ' · 尚未接 Firebase（僅本機）'}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setIsNew(true)
            setSaveMsg('')
            setEditing({
              id: createId('user'),
              email: '',
              password: randomPassword(),
              displayName: '',
              active: true,
              createdAt: new Date().toISOString(),
            })
          }}
        >
          + 新增帳號
        </button>
      </header>

      <div className={`admin-layout ${editing ? '' : 'single'}`}>
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
                    <td style={{ color: 'var(--ink-soft)' }}>{u.email}</td>
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
                          setSaveMsg('')
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
          <aside className="edit-panel">
            <h2 className="serif" style={{ margin: '0 0 4px', fontSize: 20 }}>
              {isNew ? '新增帳號' : '編輯帳號'}
            </h2>
            <p style={{ margin: '0 0 16px', color: 'var(--ink-soft)', fontSize: 13, lineHeight: 1.45 }}>
              {cloud
                ? '儲存後會嘗試在 Firebase Authentication 建立相同 Email／密碼。'
                : '目前未接 Firebase，帳號僅存在本機。'}
            </p>

            <div className="field">
              <label>帳號（email）</label>
              <input
                value={editing.email}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                placeholder="name@site.tw"
                disabled={!isNew && Boolean(editing.email)}
              />
            </div>

            <div className="field">
              <label>顯示名稱</label>
              <input
                value={editing.displayName}
                onChange={(e) => setEditing({ ...editing, displayName: e.target.value })}
              />
            </div>

            <div className="field">
              <label>密碼</label>
              <input
                value={editing.password}
                onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                placeholder="至少 6 碼"
                autoComplete="new-password"
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: 36, padding: '0 12px' }}
                  onClick={() => setEditing({ ...editing, password: randomPassword() })}
                >
                  產生密碼
                </button>
              </div>
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ink-soft)', lineHeight: 1.45 }}>
                請把帳號密碼交給人員使用。若 Firebase 已有此 Email，不會覆寫對方既有密碼。
              </p>
            </div>

            <div style={{ fontWeight: 800, marginBottom: 4, fontSize: 14 }}>專案與權限指派</div>
            {projects.length === 0 ? (
              <p style={{ color: 'var(--ink-soft)', fontSize: 13 }}>尚無專案，請先到專案管理新增。</p>
            ) : (
              <div>
                {projects.map((p) => {
                  const current =
                    members.find((m) => m.userId === editing.id && m.projectId === p.id)?.role ?? null
                  return (
                    <div key={p.id} className="perm-row">
                      <div style={{ fontWeight: 700, fontSize: 14, minWidth: 0 }}>{p.name}</div>
                      {current ? (
                        <div className="chip-row">
                          {(['admin', 'inspector', 'viewer'] as MemberRole[]).map((role) => (
                            <button
                              key={role}
                              type="button"
                              className={`chip ${current === role ? 'on' : ''}`}
                              onClick={() => setMemberRole(editing.id, p.id, role)}
                            >
                              {ROLE_SHORT[role]}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <button
                          type="button"
                          className="chip join-chip"
                          onClick={() => setMemberRole(editing.id, p.id, 'inspector')}
                        >
                          加入
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

            {saveMsg && (
              <p
                style={{
                  margin: '14px 0 0',
                  fontSize: 13,
                  fontWeight: 600,
                  color: 'var(--green-deep)',
                  lineHeight: 1.45,
                }}
              >
                {saveMsg}
              </p>
            )}

            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%', marginTop: 18, boxShadow: '0 12px 24px -12px rgba(38, 75, 62, 0.55)' }}
              disabled={saving}
              onClick={() => {
                void (async () => {
                  setSaving(true)
                  setSaveMsg('')
                  const result = await upsertUser({ ...editing, active: true }, { provisionFirebase: true })
                  setSaving(false)
                  if (!result.ok) {
                    alert(result.error || '儲存失敗')
                    return
                  }
                  const msg = result.firebaseMessage || '已儲存'
                  setSaveMsg(msg)
                  alert(`${msg}\n\n帳號：${editing.email.trim()}\n密碼：${editing.password.trim()}`)
                  setEditing(null)
                  setIsNew(false)
                })()
              }}
            >
              {saving ? '儲存中…' : cloud ? '儲存並登記 Firebase' : '儲存變更'}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%', marginTop: 8 }}
              disabled={saving}
              onClick={() => {
                setEditing(null)
                setIsNew(false)
                setSaveMsg('')
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
