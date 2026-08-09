import { useMemo, useState } from 'react'
import { useAuthStore } from '../../store/useAuthStore'
import { useProjectStore } from '../../store/useProjectStore'
import { formatActivity } from '../../lib/progress'
import { TitleHint } from '../ui/TitleHint'

export function AuditPage() {
  const projects = useAuthStore((s) => s.projects)
  const currentProjectId = useAuthStore((s) => s.currentProjectId)
  const bundles = useProjectStore((s) => s.bundles)
  const activeProjectId = useProjectStore((s) => s.activeProjectId)
  const liveActivities = useProjectStore((s) => s.activities)

  const [filterProjectId, setFilterProjectId] = useState<string | null>(
    () => currentProjectId ?? projects[0]?.id ?? null,
  )

  const selectedId =
    filterProjectId && projects.some((p) => p.id === filterProjectId)
      ? filterProjectId
      : (currentProjectId ?? projects[0]?.id ?? null)

  const selectedProject = projects.find((p) => p.id === selectedId) ?? null

  const activities = useMemo(() => {
    if (!selectedId) return []
    if (selectedId === activeProjectId) return liveActivities
    return bundles[selectedId]?.activities ?? []
  }, [selectedId, activeProjectId, liveActivities, bundles])

  return (
    <div>
      <header style={{ marginBottom: 18 }}>
        <TitleHint
          as="h1"
          className="serif"
          style={{ margin: 0, fontSize: 28 }}
          hint="依專案查閱現場操作紀錄，不會把所有專案混在一起。"
        >
          操作歷程
        </TitleHint>
      </header>

      <div className="chip-row" style={{ marginBottom: 14 }}>
        {projects.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`chip ${selectedId === p.id ? 'on' : ''}`}
            onClick={() => setFilterProjectId(p.id)}
          >
            {p.name}
            <span style={{ opacity: 0.75, fontWeight: 600, marginLeft: 4 }}>
              {(p.id === activeProjectId
                ? liveActivities
                : bundles[p.id]?.activities ?? []
              ).length}
            </span>
          </button>
        ))}
      </div>

      {selectedProject && (
        <div
          style={{
            marginBottom: 10,
            fontSize: 13,
            fontWeight: 700,
            color: 'var(--ink-soft)',
          }}
        >
          {selectedProject.name}
          <span style={{ fontWeight: 600 }}>
            {' '}
            · {selectedProject.code} · 共 {activities.length} 筆
          </span>
        </div>
      )}

      <div className="admin-panel" style={{ padding: '4px 18px' }}>
        {activities.length === 0 && (
          <div style={{ padding: '22px 0', color: 'var(--ink-soft)', fontWeight: 600 }}>
            此專案尚無操作紀錄
          </div>
        )}
        {activities.map((a) => (
          <div
            key={a.id}
            style={{
              display: 'grid',
              gridTemplateColumns: '88px 1fr 100px',
              gap: 12,
              padding: '14px 0',
              borderBottom: '1px solid rgba(34,41,31,0.08)',
              fontSize: 14,
            }}
          >
            <span style={{ color: 'var(--ink-soft)', fontWeight: 600 }}>{a.at}</span>
            <span>
              <strong>{formatActivity(a)}</strong>
              <span style={{ color: 'var(--ink-soft)' }}> · {a.summary}</span>
            </span>
            <span style={{ color: 'var(--ink-soft)', textAlign: 'right' }}>{a.actorName}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
