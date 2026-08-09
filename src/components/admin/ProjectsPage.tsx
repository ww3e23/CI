import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { createId } from '../../lib/id'
import { driveFolderUrl, parseDriveFolderId } from '../../lib/driveFolder'
import { ROLE_LABEL, ROLE_TONE, type ProjectMeta } from '../../types/auth'
import { Modal } from '../ui/Modal'

export function ProjectsPage() {
  const projects = useAuthStore((s) => s.projects)
  const members = useAuthStore((s) => s.members)
  const users = useAuthStore((s) => s.users)
  const upsertProject = useAuthStore((s) => s.upsertProject)
  const deleteProject = useAuthStore((s) => s.deleteProject)
  const setMemberRole = useAuthStore((s) => s.setMemberRole)
  const currentProjectId = useAuthStore((s) => s.currentProjectId)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ name: '', code: '', location: '', driveInput: '' })
  const [driveInput, setDriveInput] = useState('')
  const [driveMsg, setDriveMsg] = useState('')

  const selected = projects.find((p) => p.id === selectedId) ?? null
  const selectedMembers = members.filter((m) => m.projectId === selectedId)

  function selectProject(id: string) {
    setSelectedId(id)
    const p = projects.find((x) => x.id === id)
    setDriveInput(p?.driveFolderUrl || p?.driveFolderId || '')
    setDriveMsg('')
  }

  function saveDriveFolder() {
    if (!selected) return
    const folderId = parseDriveFolderId(driveInput)
    if (driveInput.trim() && !folderId) {
      setDriveMsg('無法辨識資料夾網址，請貼上 Google 雲端硬碟資料夾連結')
      return
    }
    const next: ProjectMeta = {
      ...selected,
      driveFolderId: folderId ?? undefined,
      driveFolderUrl: folderId ? driveFolderUrl(folderId) : undefined,
    }
    upsertProject(next)
    setDriveMsg(folderId ? '已儲存，照片上傳後會鏡像到此資料夾（需部署 Cloud Function）' : '已清除雲端硬碟設定')
  }

  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 className="serif" style={{ margin: 0, fontSize: 28 }}>專案管理</h1>
          <p style={{ margin: '6px 0 0', color: 'var(--ink-soft)' }}>
            共 {projects.filter((p) => p.status === 'active').length} 個進行中專案
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setCreating(true)
            setDraft({ name: '', code: '', location: '', driveInput: '' })
          }}
        >
          + 新增專案
        </button>
      </header>

      <div className="project-grid">
        {projects.map((p) => {
          const count = members.filter((m) => m.projectId === p.id).length
          const highlight = p.id === currentProjectId || p.id === selectedId
          return (
            <button
              key={p.id}
              type="button"
              className={`project-card ${highlight ? 'on' : ''}`}
              onClick={() => selectProject(p.id)}
            >
              <div className="serif" style={{ fontSize: 22, fontWeight: 700 }}>{p.name}</div>
              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>
                {p.code} · {p.location}
              </div>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{count} 位成員</span>
                <span className="pill" style={{ minHeight: 28 }}>
                  {p.driveFolderId ? '已綁 Drive' : p.status === 'active' ? '進行中' : '封存'}
                </span>
              </div>
            </button>
          )
        })}

        <button
          type="button"
          className="project-card dashed"
          onClick={() => {
            setCreating(true)
            setDraft({ name: '', code: '', location: '', driveInput: '' })
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--green-deep)' }}>+</div>
          <div style={{ fontWeight: 800, color: 'var(--green-deep)' }}>新增專案</div>
        </button>
      </div>

      {selected && (
        <section className="admin-panel" style={{ marginTop: 18, padding: 18 }}>
          <h2 className="serif" style={{ margin: '0 0 8px' }}>{selected.name} · 設定</h2>

          <details style={{ marginBottom: 16 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 13 }}>
              Google 雲端硬碟（進階／暫可不設定）
            </summary>
            <div className="field" style={{ marginTop: 10 }}>
              <label>資料夾網址</label>
              <input
                value={driveInput}
                onChange={(e) => setDriveInput(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/xxxxx"
              />
              <div style={{ fontSize: 12, color: 'var(--ink-soft)', marginTop: 6, lineHeight: 1.45 }}>
                需另部署 Cloud Function 才會自動鏡像；目前以 Firebase Storage＋App 內下載／報告為主。
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                <button type="button" className="btn btn-ghost" onClick={saveDriveFolder}>
                  儲存（可選）
                </button>
                {selected.driveFolderUrl && (
                  <a
                    className="btn btn-ghost"
                    href={selected.driveFolderUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: 'none' }}
                  >
                    開啟資料夾
                  </a>
                )}
              </div>
              {driveMsg && (
                <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600, color: 'var(--green-deep)' }}>
                  {driveMsg}
                </div>
              )}
            </div>
          </details>

          <h3 className="serif" style={{ margin: '0 0 8px', fontSize: 18 }}>成員</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            {selectedMembers.map((m) => {
              const u = users.find((x) => x.id === m.userId)
              if (!u) return null
              return (
                <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span className="avatar-sm">{u.displayName.slice(0, 1)}</span>
                    <div>
                      <div style={{ fontWeight: 800 }}>{u.displayName}</div>
                      <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{u.email}</div>
                    </div>
                  </div>
                  <span className={`role-tag ${ROLE_TONE[m.role]}`}>{ROLE_LABEL[m.role]}</span>
                </div>
              )
            })}
            {selectedMembers.length === 0 && (
              <p style={{ color: 'var(--ink-soft)' }}>尚無成員，請到帳號管理指派。</p>
            )}
          </div>

          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 800, marginBottom: 8 }}>快速加入既有帳號（查驗）</div>
            <div className="chip-row">
              {users
                .filter((u) => u.active && !selectedMembers.some((m) => m.userId === u.id))
                .map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    className="chip"
                    onClick={() => setMemberRole(u.id, selected.id, 'inspector')}
                  >
                    + {u.displayName}
                  </button>
                ))}
            </div>
          </div>

          <div
            style={{
              marginTop: 22,
              paddingTop: 16,
              borderTop: '1px solid rgba(34,41,31,0.1)',
            }}
          >
            <h3 className="serif" style={{ margin: '0 0 6px', fontSize: 18, color: 'var(--terracotta)' }}>
              危險操作
            </h3>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--ink-soft)', lineHeight: 1.45 }}>
              刪除後會移除本專案的查驗資料、成員指派與操作歷程，且無法復原。
            </p>
            <button
              type="button"
              className="btn btn-ghost"
              style={{
                color: 'var(--terracotta)',
                borderColor: 'rgba(174,76,59,0.35)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
              }}
              onClick={() => {
                const name = selected.name
                if (
                  !confirm(
                    `確定刪除專案「${name}」？\n將一併清除該專案的查驗資料、成員與操作歷程，此操作無法復原。`,
                  )
                ) {
                  return
                }
                if (!confirm(`再次確認：真的要刪除「${name}」？`)) return
                const result = deleteProject(selected.id)
                if (!result.ok) {
                  alert(result.error || '刪除失敗')
                  return
                }
                setSelectedId(null)
                setDriveMsg('')
              }}
            >
              <Trash2 size={16} />
              刪除此專案
            </button>
          </div>
        </section>
      )}

      {creating && (
        <Modal onClose={() => setCreating(false)} aria-label="新增專案" className="modal-wide">
          <h3 className="serif" style={{ marginTop: 0 }}>新增專案</h3>
          <div className="field">
            <label>專案名稱</label>
            <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
          </div>
          <div className="field">
            <label>代號</label>
            <input value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} placeholder="YS-2026-X" />
          </div>
          <div className="field">
            <label>地址／區域</label>
            <input value={draft.location} onChange={(e) => setDraft({ ...draft, location: e.target.value })} />
          </div>
          <div className="field">
            <label>Google 雲端硬碟資料夾（可選）</label>
            <input
              value={draft.driveInput}
              onChange={(e) => setDraft({ ...draft, driveInput: e.target.value })}
              placeholder="資料夾網址"
            />
          </div>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={() => {
              if (!draft.name.trim() || !draft.code.trim()) {
                alert('請填寫名稱與代號')
                return
              }
              const folderId = parseDriveFolderId(draft.driveInput)
              if (draft.driveInput.trim() && !folderId) {
                alert('雲端硬碟資料夾網址無法辨識')
                return
              }
              const project: ProjectMeta = {
                id: createId('proj'),
                name: draft.name.trim(),
                code: draft.code.trim(),
                location: draft.location.trim() || '未填寫',
                status: 'active',
                createdAt: new Date().toISOString(),
                driveFolderId: folderId ?? undefined,
                driveFolderUrl: folderId ? driveFolderUrl(folderId) : undefined,
              }
              upsertProject(project)
              setCreating(false)
              selectProject(project.id)
            }}
          >
            建立專案
          </button>
        </Modal>
      )}
    </div>
  )
}
