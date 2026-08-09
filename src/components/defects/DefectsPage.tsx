import { useMemo, useState } from 'react'
import { ChevronRight, ListFilter } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { defectsByStatus, statusLabel } from '../../lib/progress'
import type { DefectStatus } from '../../types'

type FilterStatus = 'all' | DefectStatus

export function DefectsPage() {
  const defects = useProjectStore((s) => s.defects)
  const buildings = useProjectStore((s) => s.buildings)
  const [status, setStatus] = useState<FilterStatus>('all')
  const [buildingId, setBuildingId] = useState('all')

  const counts = defectsByStatus(defects)

  const filtered = useMemo(() => {
    return defects.filter((d) => {
      if (d.status === 'voided') return false
      if (buildingId !== 'all' && d.buildingId !== buildingId) return false
      if (status === 'all') return true
      if (status === 'pending_repair') {
        return d.status === 'pending_repair' || d.status === 'returned'
      }
      return d.status === status
    })
  }, [defects, status, buildingId])

  const tabs: { key: FilterStatus; label: string; count: number; cls?: string }[] = [
    { key: 'all', label: '全部', count: counts.all },
    { key: 'pending_repair', label: '待改善', count: counts.pending_repair, cls: 'amber' },
    { key: 'pending_reinspection', label: '待複驗', count: counts.pending_reinspection, cls: 'slate' },
    { key: 'completed', label: '已完成', count: counts.completed },
  ]

  return (
    <div className="rise">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div className="eyebrow">DEFECT LOG</div>
          <div className="serif" style={{ fontWeight: 700, fontSize: 22 }}>缺失紀錄</div>
        </div>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 40, padding: '0 12px' }}>
          <ListFilter size={16} /> 篩選
        </button>
      </header>

      <div className="chip-row" style={{ marginBottom: 12 }}>
        <select
          className="chip"
          value={buildingId}
          onChange={(e) => setBuildingId(e.target.value)}
          style={{ appearance: 'auto' }}
        >
          <option value="all">全部棟別</option>
          {buildings.filter((b) => b.active).map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        <span className="chip">全部工項</span>
      </div>

      <div className="chip-row" style={{ marginBottom: 14 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`chip ${status === t.key ? `on ${t.cls ?? ''}` : ''}`}
            onClick={() => setStatus(t.key)}
          >
            {t.label} {t.count}
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {filtered.map((d) => (
          <article key={d.id} className="glass" style={{ padding: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{ display: 'grid', gap: 4 }}>
              <Thumb label="位置" />
              <Thumb label="現況" />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                #{d.defectNumber} {d.area}｜{d.description}
              </div>
              <div style={{ marginTop: 4, color: 'var(--ink-soft)', fontSize: 12, fontWeight: 600 }}>
                {d.buildingName} {d.floor} {d.unitCode}戶 · {statusLabel(d.status)}
              </div>
            </div>
            <ChevronRight size={18} color="var(--stone)" />
          </article>
        ))}
        {filtered.length === 0 && (
          <div className="glass" style={{ padding: 20, textAlign: 'center', color: 'var(--ink-soft)' }}>
            沒有符合條件的缺失
          </div>
        )}
      </div>
    </div>
  )
}

function Thumb({ label }: { label: string }) {
  return (
    <div
      style={{
        width: 44,
        height: 44,
        borderRadius: 10,
        background: 'rgba(138,133,120,0.14)',
        color: 'var(--stone)',
        fontSize: 10,
        fontWeight: 700,
        display: 'grid',
        placeItems: 'center',
      }}
    >
      {label}
    </div>
  )
}
