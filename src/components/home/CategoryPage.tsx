import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, CheckCircle2, ChevronRight } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import {
  defectListTitle,
  resolveDefectRemark,
} from '../../lib/defectDisplay'
import { statusLabel } from '../../lib/progress'
import { AddDefectSheet } from '../defects/AddDefectSheet'
import { DefectDetailModal } from '../defects/DefectDetailModal'
import { UnitDefectsSheet } from '../defects/UnitDefectsSheet'
import type { Defect, DefectStatus } from '../../types'

const statusClass: Record<DefectStatus, string> = {
  pending_repair: 'amber',
  pending_reinspection: 'slate',
  returned: 'terra',
  completed: 'muted',
  voided: '',
}

export function CategoryPage({
  categoryId,
  onBack,
}: {
  categoryId: string
  onBack: () => void
}) {
  const categories = useProjectStore((s) => s.categories)
  const items = useProjectStore((s) => s.checklistItems)
  const defects = useProjectStore((s) => s.defects)
  const units = useProjectStore((s) => s.units)
  const currentUnitId = useProjectStore((s) => s.currentUnitId)
  const unitCategoryDone = useProjectStore((s) => s.unitCategoryDone)
  const setUnitCategoryDone = useProjectStore((s) => s.setUnitCategoryDone)
  const unit = units.find((u) => u.id === currentUnitId)

  const cat = categories.find((c) => c.id === categoryId)
  const [addFor, setAddFor] = useState<string | null>(null)
  const [selectedDefect, setSelectedDefect] = useState<Defect | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const categoryDone = Boolean(
    unit && cat && (unitCategoryDone[unit.id] ?? []).includes(cat.id),
  )

  const catItems = useMemo(
    () =>
      items
        .filter((i) => i.categoryId === categoryId && i.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [items, categoryId],
  )

  const unitDefects = useMemo(
    () =>
      defects
        .filter(
          (d) =>
            d.unitId === unit?.id && d.categoryId === categoryId && d.status !== 'voided',
        )
        .sort((a, b) => b.defectNumber - a.defectNumber),
    [defects, unit?.id, categoryId],
  )

  if (!cat || !unit) {
    return (
      <div className="rise">
        <button type="button" className="btn btn-ghost" onClick={onBack}>返回</button>
        <p>找不到此大項</p>
      </div>
    )
  }

  return (
    <div className="rise" style={{ paddingBottom: 72 }}>
      <button
        type="button"
        onClick={onBack}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 6,
          color: 'var(--ink-soft)',
          fontWeight: 700,
          minHeight: 40,
          marginBottom: 8,
        }}
      >
        <ArrowLeft size={18} /> {unit.code}戶 ＞ {cat.name}
      </button>

      <h1 className="serif" style={{ margin: '0 0 10px', fontSize: 28, fontWeight: 700 }}>
        {cat.name}
      </h1>

      {unitDefects.length > 0 && (
        <section className="glass" style={{ padding: 12, marginBottom: 12 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              marginBottom: 8,
            }}
          >
            <div style={{ fontWeight: 800, fontSize: 14 }}>
              本大項缺失（{unitDefects.length}）
            </div>
            <button
              type="button"
              className="link"
              style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-deep)' }}
              onClick={() => setPreviewOpen(true)}
            >
              全部預覽
            </button>
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {unitDefects.slice(0, 5).map((d) => {
              const title = defectListTitle(d, items)
              const remark = resolveDefectRemark(d, items)
              return (
                <button
                  key={d.id}
                  type="button"
                  className="defect-row"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    width: '100%',
                    textAlign: 'left',
                    padding: '8px 10px',
                    borderRadius: 12,
                    border: '1px solid rgba(34,41,31,0.08)',
                    background: 'rgba(255,255,255,0.72)',
                  }}
                  onClick={() => setSelectedDefect(d)}
                >
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontWeight: 800,
                        fontSize: 13,
                        lineHeight: 1.35,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {title}
                    </div>
                    <div style={{ marginTop: 2, fontSize: 11, fontWeight: 600, color: 'var(--ink-soft)' }}>
                      {d.area} · {statusLabel(d.status)}
                      {remark ? ` · ${remark}` : ''}
                    </div>
                  </div>
                  <ChevronRight size={16} color="var(--stone)" />
                </button>
              )
            })}
            {unitDefects.length > 5 && (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: 36, width: '100%' }}
                onClick={() => setPreviewOpen(true)}
              >
                還有 {unitDefects.length - 5} 筆，點此看全部
              </button>
            )}
          </div>
        </section>
      )}

      <button
        type="button"
        className="btn"
        style={{
          width: '100%',
          marginBottom: 14,
          minHeight: 44,
          fontWeight: 800,
          background: categoryDone ? '#C6EFCE' : 'var(--surface, #fff)',
          color: categoryDone ? '#006100' : 'var(--ink)',
          border: categoryDone ? '1px solid rgba(0,97,0,0.28)' : '1px solid rgba(34,41,31,0.12)',
        }}
        onClick={() => setUnitCategoryDone(unit.id, cat.id, !categoryDone)}
      >
        <CheckCircle2 size={18} />
        {categoryDone ? '此大項已查畢（點此取消）' : '標記此大項已查畢'}
      </button>

      <div style={{ display: 'grid', gap: 10 }}>
        {catItems.map((item) => {
          const related = unitDefects.filter((d) => d.checklistItemId === item.id)
          return (
            <article key={item.id} className="glass" style={{ padding: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.45 }}>
                {item.description}
              </div>
              <div className="chip-row" style={{ marginTop: 10 }}>
                {related.length === 0 && (
                  <span className="chip" style={{ minHeight: 32, color: 'var(--stone)' }}>
                    尚無缺失
                  </span>
                )}
                {related.map((d) => {
                  const remark = resolveDefectRemark(d, items)
                  return (
                    <button
                      key={d.id}
                      type="button"
                      className={`chip on ${statusClass[d.status]}`}
                      style={{ minHeight: 32, maxWidth: '100%' }}
                      onClick={() => setSelectedDefect(d)}
                      title={remark || statusLabel(d.status)}
                    >
                      #{d.defectNumber} {statusLabel(d.status)}
                      {remark ? ` · ${remark}` : ''}
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ marginTop: 10, minHeight: 40, width: '100%' }}
                onClick={() => setAddFor(item.id)}
              >
                ＋ 新增此細項缺失
              </button>
            </article>
          )
        })}
      </div>

      {addFor !== null && (
        <AddDefectSheet
          categoryId={cat.id}
          checklistItemId={addFor || undefined}
          onClose={() => setAddFor(null)}
        />
      )}

      {selectedDefect && (
        <DefectDetailModal
          defect={selectedDefect}
          onClose={() => setSelectedDefect(null)}
        />
      )}

      {previewOpen && (
        <UnitDefectsSheet
          unitId={unit.id}
          categoryId={cat.id}
          onClose={() => setPreviewOpen(false)}
        />
      )}

      {createPortal(
        <button type="button" className="fab-defect" onClick={() => setAddFor('')}>
          ＋ 新增缺失
        </button>,
        document.body,
      )}
    </div>
  )
}
