import { useAuthStore, useCurrentProject, userCanAccessProject } from '../../store/useAuthStore'
import { ROLE_LABEL, ROLE_TONE, type MemberRole } from '../../types/auth'
import { Modal } from '../ui/Modal'
import { TitleHint } from '../ui/TitleHint'

export function ProjectSwitcher({ onClose }: { onClose: () => void }) {
  const userId = useAuthStore((s) => s.currentUserId)
  const projects = useAuthStore((s) => s.projects)
  const members = useAuthStore((s) => s.members)
  const users = useAuthStore((s) => s.users)
  const switchProject = useAuthStore((s) => s.switchProject)
  const refreshDirectory = useAuthStore((s) => s.refreshDirectory)
  const current = useCurrentProject()
  const user = users.find((u) => u.id === userId)

  const accessible = projects.filter((p) => {
    if (p.status !== 'active' && !user?.systemAdmin) return false
    return userCanAccessProject(user, p.id, members, users)
  })

  function roleOf(projectId: string): MemberRole | null {
    if (user?.systemAdmin) return 'admin'
    return (
      members.find(
        (m) =>
          m.projectId === projectId &&
          (m.userId === userId ||
            (user && m.userEmail && m.userEmail.toLowerCase() === user.email.toLowerCase())),
      )?.role ?? null
    )
  }

  return (
    <Modal onClose={onClose} aria-label="切換專案">
      <TitleHint
        as="h3"
        className="serif"
        style={{ margin: '0 0 14px', fontSize: 20 }}
        hint={
          accessible.length === 0
            ? '目前看不到專案。若你確定已被指派，請先同步雲端資料。'
            : user?.systemAdmin
              ? `系統管理者可查看全部 ${accessible.length} 個專案。`
              : `你目前有 ${accessible.length} 個專案的存取權限。`
        }
      >
        切換專案
      </TitleHint>

      {accessible.length === 0 && (
        <div style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={() => {
              void (async () => {
                const r = await refreshDirectory()
                if (!r.ok) alert(r.error || '同步失敗')
              })()
            }}
          >
            重新同步專案
          </button>
        </div>
      )}

      <div style={{ display: 'grid', gap: 10 }}>
        {accessible.map((p) => {
          const role = roleOf(p.id)
          const selected = current?.id === p.id
          return (
            <button
              key={p.id}
              type="button"
              className={selected ? 'glass-green' : 'glass'}
              style={{
                padding: 14,
                textAlign: 'left',
                borderRadius: 20,
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                alignItems: 'center',
              }}
              onClick={() => {
                switchProject(p.id)
                onClose()
              }}
            >
              <div>
                <div className="serif" style={{ fontWeight: 700, fontSize: 17 }}>{p.name}</div>
                <div
                  style={{
                    fontSize: 12,
                    opacity: selected ? 0.9 : 1,
                    color: selected ? undefined : 'var(--ink-soft)',
                    marginTop: 4,
                    fontWeight: 600,
                  }}
                >
                  {p.location} · {p.code}
                  {p.status !== 'active' ? ' · 封存' : ''}
                </div>
              </div>
              {role && (
                <span className={`role-tag ${ROLE_TONE[role]}`}>
                  {ROLE_LABEL[role]}
                  {selected ? ' · 目前' : ''}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </Modal>
  )
}
