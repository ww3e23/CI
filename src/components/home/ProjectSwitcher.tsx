import { useAuthStore, useCurrentProject } from '../../store/useAuthStore'
import { ROLE_LABEL, ROLE_TONE, type MemberRole } from '../../types/auth'
import { Modal } from '../ui/Modal'

export function ProjectSwitcher({ onClose }: { onClose: () => void }) {
  const userId = useAuthStore((s) => s.currentUserId)
  const projects = useAuthStore((s) => s.projects)
  const members = useAuthStore((s) => s.members)
  const users = useAuthStore((s) => s.users)
  const switchProject = useAuthStore((s) => s.switchProject)
  const current = useCurrentProject()
  const user = users.find((u) => u.id === userId)

  const accessible = projects.filter((p) => {
    if (user?.systemAdmin) return true
    if (p.status !== 'active') return false
    return members.some((m) => m.userId === userId && m.projectId === p.id)
  })

  function roleOf(projectId: string): MemberRole | null {
    if (user?.systemAdmin) return 'admin'
    return members.find((m) => m.userId === userId && m.projectId === projectId)?.role ?? null
  }

  return (
    <Modal onClose={onClose} aria-label="切換專案">
        <h3 className="serif" style={{ margin: '0 0 4px', fontSize: 20 }}>切換專案</h3>
        <p style={{ margin: '0 0 14px', color: 'var(--ink-soft)', fontSize: 13 }}>
          {user?.systemAdmin
            ? `系統管理者可查看全部 ${accessible.length} 個專案`
            : `你目前有 ${accessible.length} 個專案的存取權限`}
        </p>

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
                  <div style={{ fontSize: 12, opacity: selected ? 0.9 : 1, color: selected ? undefined : 'var(--ink-soft)', marginTop: 4, fontWeight: 600 }}>
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
