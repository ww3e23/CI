import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import {
  defectInspectorLabel,
  defectListTitle,
  resolveDefectRemark,
} from '../../lib/defectDisplay'
import { defectsByStatus, statusLabel } from '../../lib/progress'
import type { Defect, DefectStatus } from '../../types'
import { UnitSwitcher } from '../UnitSwitcher'
import { DefectDetailModal } from './DefectDetailModal'
import { PackUnitPhotosButton } from './PackUnitPhotosButton'

type QuickStatus = 'all' | DefectStatus

export function DefectsPage() {
  const defects = useProjectStore((s) => s.defects)
  const units = useProjectStore((s) => s.units)
  const items = useProjectStore((s) => s.checklistItems)
  const currentUnitId = useProjectStore((s) => s.currentUnitId)
  const backfillActorNames = useProjectStore((s) => s.backfillActorNames)

  const [quickStatus, setQuickStatus] = useState<QuickStatus>('all')
  const [unitOpen, setUnitOpen] = useState(false)
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null)

  useEffect(() => {
    backfillActorNames()
  }, [backfillActorNames])

  const unit =
    units.find((u) => u.id === currentUnitId) ?? units.find((u) => u.active) ?? null

  const unitDefects = useMemo(() => {
    if (!unit) return [] as Defect[]
    return defects.filter((d) => d.unitId === unit.id && d.status !== 'voided')
  }, [defects, unit])

  const filtered = useMemo(() => {
    const list =
      quickStatus === 'all'
        ? unitDefects
        : unitDefects.filter((d) => d.status === quickStatus)
    return [...list].sort((a, b) => a.defectNumber - b.defectNumber)
  }, [unitDefects, quickStatus])

  const counts = defectsByStatus(unitDefects)

  const tabs: { key: QuickStatus; label: string; count: number; cls?: string }[] = [
    { key: 'all', label: '全部', count: counts.all },
    { key: 'pending_repair', label: '待改善', count: counts.pending_repair, cls: 'amber' },
    { key: 'pending_reinspection', label: '待複驗', count: counts.pending_reinspection, cls: 'slate' },
    { key: 'returned', label: '退回', count: counts.returned, cls: 'terra' },
    { key: 'completed', label: '已改善', count: counts.completed, cls: 'muted' },
  ]

  const unitLabel = unit
    ? `${unit.buildingName} ${unit.floor} ${unit.code}戶`
    : '尚未選擇戶別'

  return (
    <div className="rise">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 10 }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">DEFECT LOG</div>
          <div className="serif" style={{ fontWeight: 700, fontSize: 22 }}>缺失紀錄</div>
          <div
            style={{
              marginTop: 4,
              fontSize: 13,
              fontWeight: 700,
              color: 'var(--green-deep)',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {unitLabel}
          </div>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minHeight: 40, padding: '0 12px', flexShrink: 0 }}
          onClick={() => setUnitOpen(true)}
        >
          切換戶別 <ChevronDown size={16} />
        </button>
      </header>

      {unit && (
        <div style={{ marginBottom: 12 }}>
          <PackUnitPhotosButton unitId={unit.id} style={{ width: '100%' }} />
        </div>
      )}

      <div className="status-chip-row" role="tablist" aria-label="本戶狀態快捷篩選">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={quickStatus === t.key}
            className={`chip ${t.cls ?? ''} ${quickStatus === t.key ? 'on' : ''}`}
            onClick={() => setQuickStatus(t.key)}
          >
            {t.label}
            <span className="nums" style={{ opacity: 0.85 }}>（{t.count}）</span>
          </button>
        ))}
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {filtered.map((d) => {
          const improved = d.status === 'completed'
          const title = defectListTitle(d, items)
          const remark = resolveDefectRemark(d, items)
          const inspector = defectInspectorLabel(d)
          return (
            <button
              key={d.id}
              type="button"
              className={`glass defect-row ${improved ? 'defect-row-improved' : ''}`}
              style={{
                padding: 12,
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                width: '100%',
                textAlign: 'left',
              }}
              onClick={() => setSelectedDefect(d)}
            >
              <div style={{ display: 'grid', gap: 4 }}>
                <Thumb label="位置" src={d.planPhotoDataUrl} />
                <Thumb label="現況" src={d.photoDataUrls[0]} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontWeight: 800,
                    fontSize: 14,
                    lineHeight: 1.35,
                    overflow: 'hidden',
                    display: '-webkit-box',
                    WebkitLineClamp: 2,
                    WebkitBoxOrient: 'vertical',
                  }}
                >
                  {title}
                </div>
                {remark ? (
                  <div
                    style={{
                      marginTop: 4,
                      color: 'var(--ink-soft)',
                      fontSize: 12,
                      fontWeight: 500,
                      lineHeight: 1.4,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    {remark}
                  </div>
                ) : null}
                <div style={{ marginTop: 4, color: 'var(--ink-soft)', fontSize: 11, fontWeight: 600 }}>
                  {d.categoryName} · {d.area} · {statusLabel(d.status)}
                  {inspector ? ` · 查驗 ${inspector}` : ''}
                </div>
              </div>
              <ChevronRight size={18} color="var(--stone)" />
            </button>
          )
        })}
        {filtered.length === 0 && (
          <div className="glass" style={{ padding: 20, textAlign: 'center', color: 'var(--ink-soft)' }}>
            {!unit
              ? '請先切換戶別'
              : quickStatus === 'all'
                ? '此戶尚無缺失紀錄'
                : '此狀態沒有缺失'}
          </div>
        )}
      </div>

      {unitOpen && <UnitSwitcher onClose={() => setUnitOpen(false)} />}

      {selectedDefect && (
        <DefectDetailModal defect={selectedDefect} onClose={() => setSelectedDefect(null)} />
      )}
    </div>
  )
}

function Thumb({ label, src }: { label: string; src?: string }) {
  if (src) {
    return (
      <img
        src={src}
        alt={label}
        style={{ width: 44, height: 44, borderRadius: 10, objectFit: 'cover' }}
      />
    )
  }
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
