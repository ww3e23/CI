import { useMemo, useState } from 'react'
import { ChevronRight, ListFilter, X } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { defectsByStatus, statusLabel } from '../../lib/progress'
import type { Defect, DefectStatus } from '../../types'
import {
  AdvancedFilterSheet,
  emptyFilters,
  type DefectFilters,
} from './AdvancedFilterSheet'

type QuickStatus = 'all' | DefectStatus

export function DefectsPage() {
  const defects = useProjectStore((s) => s.defects)
  const buildings = useProjectStore((s) => s.buildings)
  const units = useProjectStore((s) => s.units)
  const categories = useProjectStore((s) => s.categories)
  const items = useProjectStore((s) => s.checklistItems)

  const [quickStatus, setQuickStatus] = useState<QuickStatus>('all')
  const [filters, setFilters] = useState<DefectFilters>(emptyFilters())
  const [sheetOpen, setSheetOpen] = useState(false)

  const filtered = useMemo(
    () => applyFilters(defects, filters, quickStatus),
    [defects, filters, quickStatus],
  )

  const counts = defectsByStatus(defects)

  const activeChips = useMemo(
    () => describeFilters(filters, { buildings, units, categories, items }),
    [filters, buildings, units, categories, items],
  )

  const tabs: { key: QuickStatus; label: string; count: number; cls?: string }[] = [
    { key: 'all', label: '全部', count: counts.all },
    { key: 'pending_repair', label: '待改善', count: counts.pending_repair, cls: 'amber' },
    { key: 'pending_reinspection', label: '待複驗', count: counts.pending_reinspection, cls: 'slate' },
    { key: 'returned', label: '退回', count: counts.returned, cls: 'terra' },
    { key: 'completed', label: '已完成', count: counts.completed },
  ]

  return (
    <div className="rise">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
        <div>
          <div className="eyebrow">DEFECT LOG</div>
          <div className="serif" style={{ fontWeight: 700, fontSize: 22 }}>缺失紀錄</div>
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minHeight: 40, padding: '0 12px' }}
          onClick={() => setSheetOpen(true)}
        >
          <ListFilter size={16} /> 篩選
        </button>
      </header>

      <div className="chip-row" style={{ marginBottom: 10 }}>
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`chip ${quickStatus === t.key ? `on ${t.cls ?? ''}` : ''}`}
            onClick={() => setQuickStatus(t.key)}
          >
            {t.label} {t.count}
          </button>
        ))}
      </div>

      {(activeChips.length > 0 || filtered.length !== defects.filter((d) => d.status !== 'voided').length) && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
              結果 {filtered.length} 筆
              {activeChips.length > 0 ? ` · 已套用 ${activeChips.length} 個條件` : ''}
            </span>
            {activeChips.length > 0 && (
              <button
                type="button"
                className="link"
                style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-deep)' }}
                onClick={() => setFilters(emptyFilters())}
              >
                清除全部
              </button>
            )}
          </div>
          {activeChips.length > 0 && (
            <div className="chip-row">
              {activeChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className="chip on"
                  style={{ minHeight: 32 }}
                  onClick={() => setFilters(chip.clear)}
                >
                  {chip.label} <X size={14} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

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

      {sheetOpen && (
        <AdvancedFilterSheet
          initial={filters}
          onApply={setFilters}
          onClose={() => setSheetOpen(false)}
        />
      )}
    </div>
  )
}

function applyFilters(defects: Defect[], f: DefectFilters, quick: QuickStatus): Defect[] {
  return defects.filter((d) => {
    if (d.status === 'voided') return false

    if (quick !== 'all' && d.status !== quick) return false

    if (f.buildingIds.length && !f.buildingIds.includes(d.buildingId)) return false
    if (f.floors.length && !f.floors.includes(d.floor)) return false
    if (f.unitIds.length && !f.unitIds.includes(d.unitId)) return false
    if (f.categoryIds.length && !f.categoryIds.includes(d.categoryId)) return false
    if (f.checklistItemIds.length) {
      if (!d.checklistItemId || !f.checklistItemIds.includes(d.checklistItemId)) return false
    }
    if (f.areas.length && !f.areas.includes(d.area)) return false
    if (f.statuses.length && !f.statuses.includes(d.status)) return false

    if (f.createdFrom) {
      if (d.createdAt.slice(0, 10) < f.createdFrom) return false
    }
    if (f.createdTo) {
      if (d.createdAt.slice(0, 10) > f.createdTo) return false
    }
    // 複驗日期：示範用 updatedAt 近似
    if (f.reinspectFrom || f.reinspectTo) {
      if (d.status !== 'pending_reinspection' && d.status !== 'completed') return false
      const day = d.updatedAt.slice(0, 10)
      if (f.reinspectFrom && day < f.reinspectFrom) return false
      if (f.reinspectTo && day > f.reinspectTo) return false
    }

    if (f.inspectors.length) {
      // 示範資料未存 inspector 欄位時，用活動／預設對應；有則比對
      const inspector = (d as Defect & { inspectorName?: string }).inspectorName
      if (inspector && !f.inspectors.includes(inspector)) return false
      if (!inspector && !f.inspectors.includes('現場查驗') && !f.inspectors.includes('謝采辰')) {
        // 若選了特定人員但此筆無人員資訊，先放行示範資料中「現場查驗」以外的嚴格過濾
        if (f.inspectors.every((n) => n !== '現場查驗')) return false
      }
    }

    return true
  })
}

function describeFilters(
  f: DefectFilters,
  ctx: {
    buildings: { id: string; name: string }[]
    units: { id: string; buildingName: string; floor: string; code: string }[]
    categories: { id: string; name: string }[]
    items: { id: string; description: string }[]
  },
): { key: string; label: string; clear: DefectFilters }[] {
  const chips: { key: string; label: string; clear: DefectFilters }[] = []
  const clearOne = (patch: Partial<DefectFilters>): DefectFilters => ({ ...f, ...patch })

  if (f.buildingIds.length) {
    const names = f.buildingIds.map((id) => ctx.buildings.find((b) => b.id === id)?.name ?? id)
    chips.push({
      key: 'buildings',
      label: `棟別 ${names.join('、')}`,
      clear: clearOne({ buildingIds: [] }),
    })
  }
  if (f.floors.length) {
    chips.push({
      key: 'floors',
      label: `樓層 ${f.floors.join('、')}`,
      clear: clearOne({ floors: [] }),
    })
  }
  if (f.unitIds.length) {
    chips.push({
      key: 'units',
      label: `戶別 ${f.unitIds.length} 戶`,
      clear: clearOne({ unitIds: [] }),
    })
  }
  if (f.categoryIds.length) {
    const names = f.categoryIds.map((id) => ctx.categories.find((c) => c.id === id)?.name ?? id)
    chips.push({
      key: 'cats',
      label: `大項 ${names.join('、')}`,
      clear: clearOne({ categoryIds: [] }),
    })
  }
  if (f.checklistItemIds.length) {
    chips.push({
      key: 'items',
      label: `細項 ${f.checklistItemIds.length}`,
      clear: clearOne({ checklistItemIds: [] }),
    })
  }
  if (f.areas.length) {
    chips.push({
      key: 'areas',
      label: `區域 ${f.areas.join('、')}`,
      clear: clearOne({ areas: [] }),
    })
  }
  if (f.statuses.length) {
    chips.push({
      key: 'statuses',
      label: `狀態 ${f.statuses.map(statusLabel).join('、')}`,
      clear: clearOne({ statuses: [] }),
    })
  }
  if (f.inspectors.length) {
    chips.push({
      key: 'inspectors',
      label: `人員 ${f.inspectors.join('、')}`,
      clear: clearOne({ inspectors: [] }),
    })
  }
  if (f.createdFrom || f.createdTo) {
    chips.push({
      key: 'created',
      label: `建立 ${f.createdFrom || '…'}～${f.createdTo || '…'}`,
      clear: clearOne({ createdFrom: '', createdTo: '' }),
    })
  }
  if (f.reinspectFrom || f.reinspectTo) {
    chips.push({
      key: 'reinspect',
      label: `複驗 ${f.reinspectFrom || '…'}～${f.reinspectTo || '…'}`,
      clear: clearOne({ reinspectFrom: '', reinspectTo: '' }),
    })
  }
  return chips
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
