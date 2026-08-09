import { useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { createId } from '../../lib/id'
import { ROLE_LABEL, ROLE_TONE, type ProjectMeta } from '../../types/auth'

export function ProjectsPage() {
  const projects = useAuthStore((s) => s.projects)
  const members = useAuthStore((s) => s.members)
  const users = useAuthStore((s) => s.users)
  const upsertProject = useAuthStore((s) => s.upsertProject)
  const setMemberRole = useAuthStore((s) => s.setMemberRole)
  const currentProjectId = useAuthStore((s) => s.currentProjectId)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ name: '', code: '', location: '' })

  const selected = projects.find((p) => p.id === selectedId) ?? null
  const selectedMembers = members.filter((m) => m.projectId === selectedId)

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
            setDraft({ name: '', code: '', location: '' })
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
              onClick={() => setSelectedId(p.id)}
            >
              <div className="serif" style={{ fontSize: 22, fontWeight: 700 }}>{p.name}</div>
              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--ink-soft)', fontWeight: 600 }}>
                {p.code} · {p.location}
              </div>
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>{count} 位成員</span>
                <span className="pill" style={{ minHeight: 28 }}>{p.status === 'active' ? '進行中' : '封存'}</span>
              </div>
            </button>
          )
        })}

        <button
          type="button"
          className="project-card dashed"
          onClick={() => {
            setCreating(true)
            setDraft({ name: '', code: '', location: '' })
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--green-deep)' }}>+</div>
          <div style={{ fontWeight: 800, color: 'var(--green-deep)' }}>新增專案</div>
        </button>
      </div>

      {selected && (
        <section className="admin-panel" style={{ marginTop: 18, padding: 18 }}>
          <h2 className="serif" style={{ margin: '0 0 8px' }}>{selected.name} · 成員</h2>
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
        </section>
      )}

      {creating && (
        <>
          <div className="sheet-backdrop" onClick={() => setCreating(false)} />
          <div className="sheet" style={{ maxWidth: 480 }}>
            <div className="sheet-handle" />
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
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%' }}
              onClick={() => {
                if (!draft.name.trim() || !draft.code.trim()) {
                  alert('請填寫名稱與代號')
                  return
                }
                const project: ProjectMeta = {
                  id: createId('proj'),
                  name: draft.name.trim(),
                  code: draft.code.trim(),
                  location: draft.location.trim() || '未填寫',
                  status: 'active',
                  createdAt: new Date().toISOString(),
                }
                upsertProject(project)
                setCreating(false)
                setSelectedId(project.id)
              }}
            >
              建立專案
            </button>
          </div>
        </>
      )}
    </div>
  )
}
