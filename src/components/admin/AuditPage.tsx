import { useProjectStore } from '../../store/useProjectStore'
import { formatActivity } from '../../lib/progress'

export function AuditPage() {
  const activities = useProjectStore((s) => s.activities)

  return (
    <div>
      <header style={{ marginBottom: 18 }}>
        <h1 className="serif" style={{ margin: 0, fontSize: 28 }}>操作歷程</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--ink-soft)' }}>
          顯示目前專案最近操作（示範資料；正式版會跨專案彙整）
        </p>
      </header>

      <div className="admin-panel" style={{ padding: '4px 18px' }}>
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
