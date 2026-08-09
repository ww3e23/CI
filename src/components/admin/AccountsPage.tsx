import { useMemo, useState } from 'react'
import { Pencil, Trash2 } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { accountDisplay } from '../../lib/accountId'
import { isFirebaseConfigured } from '../../lib/firebase'
import { createId } from '../../lib/id'
import { type MemberRole, type UserAccount } from '../../types/auth'
import { TitleHint } from '../ui/TitleHint'

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
  const deleteUser = useAuthStore((s) => s.deleteUser)
  const setMemberRole = useAuthStore((s) => s.setMemberRole)
  const currentUserId = useAuthStore((s) => s.currentUserId)
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
          <TitleHint
            as="h1"
            className="serif"
            style={{ margin: 0, fontSize: 28 }}
            hint={
              <>
                共 {rows.length} 個帳號。儲存前請先加入專案
                {cloud ? '；會同步 Firebase 登入與雲端目錄。' : '；尚未接 Firebase（僅本機）。'}
              </>
            }
          >
            帳號管理
          </TitleHint>
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
                    <td style={{ color: 'var(--ink-soft)' }}>{accountDisplay(u.email)}</td>
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
                        disabled={u.id === currentUserId}
                        onClick={() => {
                          void (async () => {
                            if (
                              !confirm(
                                `確定刪除帳號「${u.displayName}」（${accountDisplay(u.email)}）？\n將從名單與 Firebase 登入移除，無法復原。`,
                              )
                            ) {
                              return
                            }
                            const result = await deleteUser(u.id)
                            if (!result.ok) {
                              alert(result.error || '刪除失敗')
                              return
                            }
                            if (editing?.id === u.id) {
                              setEditing(null)
                              setIsNew(false)
                            }
                          })()
                        }}
                        aria-label="刪除帳號"
                        title={u.id === currentUserId ? '無法刪除自己' : '刪除帳號'}
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
            <TitleHint
              as="h2"
              className="serif"
              style={{ margin: '0 0 16px', fontSize: 20 }}
              hint={
                cloud
                  ? '直接填帳號＋密碼即可；儲存時會同步到 Firebase 登入。'
                  : '直接填帳號＋密碼即可（目前未接 Firebase，僅存本機）。'
              }
            >
              {isNew ? '新增帳號' : '編輯帳號'}
            </TitleHint>

            <div className="field">
              <label>
                <TitleHint as="span" hint="可用純帳號（英數），也可填完整 email。">
                  帳號
                </TitleHint>
              </label>
              <input
                value={isNew ? editing.email : accountDisplay(editing.email)}
                onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                placeholder="例如 inspector01"
                disabled={!isNew && Boolean(editing.email)}
                autoComplete="off"
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
              <label>
                <TitleHint
                  as="span"
                  hint="請把帳號密碼交給人員使用。若 Firebase 已有此帳號，不會覆寫既有密碼。"
                >
                  密碼
                </TitleHint>
              </label>
              <input
                value={editing.password}
                onChange={(e) => setEditing({ ...editing, password: e.target.value })}
                placeholder="至少 4 碼"
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
            </div>

            <TitleHint
              as="div"
              style={{ fontWeight: 800, marginBottom: 8, fontSize: 14 }}
              hint="一般帳號至少要加入一個專案，儲存後才能登入現場 App。"
            >
              專案與權限指派（必填）
            </TitleHint>
            {projects.length === 0 ? (
              <p style={{ color: 'var(--terracotta)', fontSize: 13, fontWeight: 600 }}>
                尚無專案，請先到「專案管理」新增，再回來建立帳號。
              </p>
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
                          <button
                            type="button"
                            className="chip join-chip"
                            onClick={() => setMemberRole(editing.id, p.id, null)}
                          >
                            移出
                          </button>
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
                  alert(
                    `${msg}\n\n帳號：${accountDisplay(editing.email.trim())}\n密碼：${editing.password.trim()}`,
                  )
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
