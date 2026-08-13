import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { resolveDefectRemark } from '../../lib/defectDisplay'
import { statusLabel } from '../../lib/progress'
import { AddDefectSheet } from '../defects/AddDefectSheet'
import { DefectDetailModal } from '../defects/DefectDetailModal'
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
      defects.filter(
        (d) =>
          d.unitId === unit?.id && d.categoryId === categoryId && d.status !== 'voided',
      ),
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

      <h1 className="serif" style={{ margin: '0 0 14px', fontSize: 28, fontWeight: 700 }}>
        {cat.name}
      </h1>

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
          const related = unitDefects
            .filter((d) => d.checklistItemId === item.id)
            .sort((a, b) => a.defectNumber - b.defectNumber)
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

      {createPortal(
        <button type="button" className="fab-defect" onClick={() => setAddFor('')}>
          ＋ 新增缺失
        </button>,
        document.body,
      )}
    </div>
  )
}
