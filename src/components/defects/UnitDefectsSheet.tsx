import { useMemo, useState } from 'react'
import { ChevronRight, X } from 'lucide-react'
import type { Defect, DefectStatus } from '../../types'
import {
  defectInspectorLabel,
  defectListTitle,
  resolveDefectRemark,
} from '../../lib/defectDisplay'
import { statusLabel } from '../../lib/progress'
import { useProjectStore } from '../../store/useProjectStore'
import { Modal } from '../ui/Modal'
import { DefectDetailModal } from './DefectDetailModal'
import { PackUnitPhotosButton } from './PackUnitPhotosButton'

type QuickStatus = 'all' | DefectStatus

export function UnitDefectsSheet({
  unitId,
  categoryId,
  initialStatus = 'all',
  onClose,
}: {
  unitId: string
  /** 若指定則只顯示該大項缺失 */
  categoryId?: string
  initialStatus?: QuickStatus
  onClose: () => void
}) {
  const units = useProjectStore((s) => s.units)
  const categories = useProjectStore((s) => s.categories)
  const defects = useProjectStore((s) => s.defects)
  const items = useProjectStore((s) => s.checklistItems)
  const unit = units.find((u) => u.id === unitId)
  const category = categoryId ? categories.find((c) => c.id === categoryId) : undefined

  const [quickStatus, setQuickStatus] = useState<QuickStatus>(initialStatus)
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null)

  const unitDefects = useMemo(
    () =>
      defects
        .filter((d) => {
          if (d.unitId !== unitId || d.status === 'voided') return false
          if (categoryId && d.categoryId !== categoryId) return false
          return true
        })
        .sort((a, b) => a.defectNumber - b.defectNumber),
    [defects, unitId, categoryId],
  )

  const filtered = useMemo(
    () =>
      quickStatus === 'all'
        ? unitDefects
        : unitDefects.filter((d) => d.status === quickStatus),
    [unitDefects, quickStatus],
  )

  const counts = useMemo(
    () => ({
      all: unitDefects.length,
      pending_repair: unitDefects.filter((d) => d.status === 'pending_repair').length,
      pending_reinspection: unitDefects.filter((d) => d.status === 'pending_reinspection')
        .length,
      returned: unitDefects.filter((d) => d.status === 'returned').length,
      completed: unitDefects.filter((d) => d.status === 'completed').length,
    }),
    [unitDefects],
  )

  const tabs: { key: QuickStatus; label: string; count: number; cls?: string }[] = [
    { key: 'all', label: '全部', count: counts.all },
    { key: 'pending_repair', label: '待改善', count: counts.pending_repair, cls: 'amber' },
    {
      key: 'pending_reinspection',
      label: '待複驗',
      count: counts.pending_reinspection,
      cls: 'slate',
    },
    { key: 'returned', label: '退回', count: counts.returned, cls: 'terra' },
    { key: 'completed', label: '已改善', count: counts.completed, cls: 'muted' },
  ]

  const title = unit
    ? category
      ? `${unit.code}戶・${category.name}`
      : `${unit.buildingName} ${unit.floor} ${unit.code}戶`
    : '本戶缺失'

  return (
    <>
      <Modal variant="bottom" aria-label="缺失預覽" onClose={onClose}>
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            marginBottom: 12,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div className="eyebrow">{category ? 'CATEGORY DEFECTS' : 'UNIT DEFECTS'}</div>
            <div className="serif" style={{ fontWeight: 700, fontSize: 20, lineHeight: 1.25 }}>
              {title}缺失
            </div>
            <div style={{ marginTop: 4, fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)' }}>
              {category
                ? `僅此大項，共 ${unitDefects.length} 筆`
                : `僅此戶，共 ${unitDefects.length} 筆`}
            </div>
          </div>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 40, minWidth: 40, padding: 0, borderRadius: 999 }}
            onClick={onClose}
            aria-label="關閉"
          >
            <X size={18} />
          </button>
        </div>

        {!categoryId && (
          <div style={{ marginBottom: 12 }}>
            <PackUnitPhotosButton unitId={unitId} style={{ width: '100%' }} />
          </div>
        )}

        <div className="status-chip-row" role="tablist" aria-label="本戶狀態篩選">
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
              <span className="nums" style={{ opacity: 0.85 }}>
                （{t.count}）
              </span>
            </button>
          ))}
        </div>

        <div
          style={{
            display: 'grid',
            gap: 10,
            marginTop: 12,
            maxHeight: 'min(62vh, 560px)',
            overflowY: 'auto',
            paddingBottom: 8,
          }}
        >
          {filtered.map((d) => {
            const improved = d.status === 'completed'
            const rowTitle = defectListTitle(d, items)
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
                    {rowTitle}
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
                  <div
                    style={{
                      marginTop: 4,
                      color: 'var(--ink-soft)',
                      fontSize: 11,
                      fontWeight: 600,
                    }}
                  >
                    {d.categoryName} · {d.area} · {statusLabel(d.status)}
                    {inspector ? ` · 查驗 ${inspector}` : ''}
                  </div>
                </div>
                <ChevronRight size={18} color="var(--stone)" />
              </button>
            )
          })}
          {filtered.length === 0 && (
            <div
              className="glass"
              style={{ padding: 20, textAlign: 'center', color: 'var(--ink-soft)' }}
            >
              {unitDefects.length === 0 ? '此戶尚無缺失紀錄' : '此狀態沒有缺失'}
            </div>
          )}
        </div>
      </Modal>

      {selectedDefect && (
        <DefectDetailModal
          defect={selectedDefect}
          onClose={() => setSelectedDefect(null)}
        />
      )}
    </>
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
