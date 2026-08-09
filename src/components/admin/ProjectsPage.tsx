import { useMemo, useState } from 'react'
import { Trash2, UserMinus } from 'lucide-react'
import { useAuthStore } from '../../store/useAuthStore'
import { createId } from '../../lib/id'
import { nextProjectCode } from '../../lib/projectCode'
import { driveFolderUrl, parseDriveFolderId } from '../../lib/driveFolder'
import {
  ROLE_LABEL,
  type MemberRole,
  type ProjectMeta,
} from '../../types/auth'
import { Modal } from '../ui/Modal'
import { TitleHint } from '../ui/TitleHint'

const ROLE_SHORT: Record<MemberRole, string> = {
  admin: '管理',
  inspector: '查驗',
  viewer: '查看',
}

const ROLE_OPTIONS: MemberRole[] = ['admin', 'inspector', 'viewer']

export function ProjectsPage() {
  const projects = useAuthStore((s) => s.projects)
  const members = useAuthStore((s) => s.members)
  const users = useAuthStore((s) => s.users)
  const upsertProject = useAuthStore((s) => s.upsertProject)
  const deleteProject = useAuthStore((s) => s.deleteProject)
  const setMemberRole = useAuthStore((s) => s.setMemberRole)
  const switchProject = useAuthStore((s) => s.switchProject)
  const currentProjectId = useAuthStore((s) => s.currentProjectId)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState({ name: '', location: '', driveInput: '' })
  const [driveInput, setDriveInput] = useState('')
  const [driveMsg, setDriveMsg] = useState('')
  const [memberQuery, setMemberQuery] = useState('')

  const selected = projects.find((p) => p.id === selectedId) ?? null
  const selectedMembers = members.filter((m) => m.projectId === selectedId)

  const memberRows = useMemo(() => {
    return selectedMembers
      .map((m) => {
        const user = users.find((u) => u.id === m.userId)
        return user ? { member: m, user } : null
      })
      .filter(Boolean)
      .sort((a, b) =>
        a!.user.displayName.localeCompare(b!.user.displayName, 'zh-Hant'),
      ) as { member: (typeof selectedMembers)[number]; user: (typeof users)[number] }[]
  }, [selectedMembers, users])

  const q = memberQuery.trim().toLowerCase()
  const filteredMembers = useMemo(() => {
    if (!q) return memberRows
    return memberRows.filter(
      ({ user }) =>
        user.displayName.toLowerCase().includes(q) ||
        user.email.toLowerCase().includes(q),
    )
  }, [memberRows, q])

  const candidates = useMemo(() => {
    const inProject = new Set(selectedMembers.map((m) => m.userId))
    return users
      .filter((u) => u.active && !inProject.has(u.id))
      .filter(
        (u) =>
          !q ||
          u.displayName.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q),
      )
      .sort((a, b) => a.displayName.localeCompare(b.displayName, 'zh-Hant'))
  }, [users, selectedMembers, q])

  function selectProject(id: string) {
    setSelectedId(id)
    const p = projects.find((x) => x.id === id)
    setDriveInput(p?.driveFolderUrl || p?.driveFolderId || '')
    setDriveMsg('')
    setMemberQuery('')
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
          <TitleHint
            as="h1"
            className="serif"
            style={{ margin: 0, fontSize: 28 }}
            hint={`共 ${projects.filter((p) => p.status === 'active').length} 個進行中專案。點專案即可指派人員。`}
          >
            專案管理
          </TitleHint>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setCreating(true)
            setDraft({ name: '', location: '', driveInput: '' })
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
            setDraft({ name: '', location: '', driveInput: '' })
          }}
        >
          <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--green-deep)' }}>+</div>
          <div style={{ fontWeight: 800, color: 'var(--green-deep)' }}>新增專案</div>
        </button>
      </div>

      {selected && (
        <section className="admin-panel" style={{ marginTop: 18, padding: 18 }}>
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12,
              marginBottom: 12,
              flexWrap: 'wrap',
            }}
          >
            <TitleHint
              as="h2"
              className="serif"
              style={{ margin: 0 }}
              hint="系統管理者可進入任一專案查看現場進度與缺失。"
            >
              {selected.name} · 設定
            </TitleHint>
            <button
              type="button"
              className="btn btn-primary"
              style={{ minHeight: 40 }}
              onClick={() => {
                switchProject(selected.id)
                window.location.hash = '#/'
              }}
            >
              進入現場查看
            </button>
          </div>

          <details style={{ marginBottom: 16, marginTop: 14 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 800, color: 'var(--ink-soft)', fontSize: 13, listStyle: 'none' }}>
              <TitleHint
                as="span"
                style={{ pointerEvents: 'auto' }}
                hint="需另部署 Cloud Function 才會自動鏡像；目前以 Firebase Storage＋App 內下載／報告為主。暫可不設定。"
              >
                Google 雲端硬碟
              </TitleHint>
            </summary>
            <div className="field" style={{ marginTop: 10 }}>
              <label>資料夾網址</label>
              <input
                value={driveInput}
                onChange={(e) => setDriveInput(e.target.value)}
                placeholder="https://drive.google.com/drive/folders/xxxxx"
              />
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

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'baseline',
              gap: 12,
              marginBottom: 8,
              flexWrap: 'wrap',
            }}
          >
            <TitleHint
              as="h3"
              className="serif"
              style={{ margin: 0, fontSize: 18 }}
              hint="以本專案為中心設定誰可進入、以及角色（管理／查驗／查看）。人數多時可先搜尋再加入。"
            >
              成員指派
              <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)', marginLeft: 8 }}>
                {selectedMembers.length} 人
              </span>
            </TitleHint>
          </div>

          <div className="field" style={{ marginBottom: 12, marginTop: 12 }}>
            <label>搜尋人員</label>
            <input
              value={memberQuery}
              onChange={(e) => setMemberQuery(e.target.value)}
              placeholder="姓名或帳號"
            />
          </div>

          <div className="project-member-list">
            {filteredMembers.map(({ member, user }) => (
              <div key={member.id} className="perm-row project-member-row">
                <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                  <span className="avatar-sm">{user.displayName.slice(0, 1)}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 800 }}>{user.displayName}</div>
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--ink-soft)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {user.email}
                    </div>
                  </div>
                </div>
                <div className="project-member-actions">
                  <div className="chip-row">
                    {ROLE_OPTIONS.map((role) => (
                      <button
                        key={role}
                        type="button"
                        className={`chip ${member.role === role ? 'on' : ''}`}
                        title={ROLE_LABEL[role]}
                        onClick={() => setMemberRole(user.id, selected.id, role)}
                      >
                        {ROLE_SHORT[role]}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`移出 ${user.displayName}`}
                    title="移出本專案"
                    onClick={() => {
                      if (confirm(`將「${user.displayName}」移出「${selected.name}」？`)) {
                        setMemberRole(user.id, selected.id, null)
                      }
                    }}
                  >
                    <UserMinus size={16} />
                  </button>
                </div>
              </div>
            ))}
            {selectedMembers.length === 0 && (
              <p style={{ color: 'var(--ink-soft)', margin: '8px 0 0' }}>
                尚無成員，請從下方名單加入。
              </p>
            )}
            {selectedMembers.length > 0 && filteredMembers.length === 0 && (
              <p style={{ color: 'var(--ink-soft)', margin: '8px 0 0' }}>沒有符合搜尋的已加入成員</p>
            )}
          </div>

          <div style={{ marginTop: 18 }}>
            <TitleHint
              as="div"
              style={{ fontWeight: 800, marginBottom: 10, fontSize: 14 }}
              hint="點「加入」預設為查驗；加入後可再改角色。"
            >
              加入人員
            </TitleHint>
            {candidates.length === 0 ? (
              <p style={{ color: 'var(--ink-soft)', margin: 0, fontSize: 13 }}>
                {q ? '沒有符合搜尋的可加入帳號' : '所有啟用帳號都已在本專案中'}
              </p>
            ) : (
              <div className="project-candidate-list">
                {candidates.map((u) => (
                  <div key={u.id} className="perm-row project-member-row">
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', minWidth: 0 }}>
                      <span className="avatar-sm">{u.displayName.slice(0, 1)}</span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{u.displayName}</div>
                        <div style={{ fontSize: 12, color: 'var(--ink-soft)' }}>{u.email}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="chip join-chip"
                      onClick={() => setMemberRole(u.id, selected.id, 'inspector')}
                    >
                      加入
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: 22,
              paddingTop: 16,
              borderTop: '1px solid rgba(34,41,31,0.1)',
            }}
          >
            <TitleHint
              as="h3"
              className="serif"
              style={{ margin: '0 0 12px', fontSize: 18, color: 'var(--terracotta)' }}
              hint="刪除後會移除本專案的查驗資料、成員指派與操作歷程，且無法復原。"
            >
              危險操作
            </TitleHint>
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
          <TitleHint
            as="h3"
            className="serif"
            style={{ marginTop: 0 }}
            hint={`代號由系統自動編號（例如 ${nextProjectCode(projects.map((p) => p.code))}）。`}
          >
            新增專案
          </TitleHint>
          <div className="field">
            <label>專案名稱</label>
            <input
              value={draft.name}
              onChange={(e) => setDraft({ ...draft, name: e.target.value })}
              placeholder="例如 晴川院子"
              autoFocus
            />
          </div>
          <div className="field">
            <label>地址／區域（可選）</label>
            <input
              value={draft.location}
              onChange={(e) => setDraft({ ...draft, location: e.target.value })}
              placeholder="例如 新竹市東區"
            />
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
              if (!draft.name.trim()) {
                alert('請填寫專案名稱')
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
                code: nextProjectCode(projects.map((p) => p.code)),
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
