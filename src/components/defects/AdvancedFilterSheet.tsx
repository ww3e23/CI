import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { useProjectStore } from '../../store/useProjectStore'
import { collectAllAreas } from '../../lib/areas'
import type { DefectStatus } from '../../types'
import { Modal } from '../ui/Modal'
import { TitleHint } from '../ui/TitleHint'

export interface DefectFilters {
  buildingIds: string[]
  floors: string[]
  unitIds: string[]
  categoryIds: string[]
  checklistItemIds: string[]
  areas: string[]
  statuses: DefectStatus[]
  inspectors: string[]
  createdFrom: string
  createdTo: string
  reinspectFrom: string
  reinspectTo: string
}

export const emptyFilters = (): DefectFilters => ({
  buildingIds: [],
  floors: [],
  unitIds: [],
  categoryIds: [],
  checklistItemIds: [],
  areas: [],
  statuses: [],
  inspectors: [],
  createdFrom: '',
  createdTo: '',
  reinspectFrom: '',
  reinspectTo: '',
})

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

export function AdvancedFilterSheet({
  initial,
  onApply,
  onClose,
}: {
  initial: DefectFilters
  onApply: (f: DefectFilters) => void
  onClose: () => void
}) {
  const buildings = useProjectStore((s) => s.buildings)
  const units = useProjectStore((s) => s.units)
  const categories = useProjectStore((s) => s.categories)
  const items = useProjectStore((s) => s.checklistItems)
  const projectAreas = useProjectStore((s) => s.areas)
  const defects = useProjectStore((s) => s.defects)
  const activities = useProjectStore((s) => s.activities)
  const areas = useMemo(
    () => collectAllAreas({ areas: projectAreas, units, defects }),
    [projectAreas, units, defects],
  )

  const [draft, setDraft] = useState<DefectFilters>(initial)
  const [unitQuery, setUnitQuery] = useState('')

  const activeBuildings = buildings.filter((b) => b.active).sort((a, b) => a.sortOrder - b.sortOrder)
  const floorOptions = useMemo(() => {
    const set = new Set<string>()
    for (const b of activeBuildings) {
      if (draft.buildingIds.length && !draft.buildingIds.includes(b.id)) continue
      for (const f of b.floors) set.add(f)
    }
    return [...set]
  }, [activeBuildings, draft.buildingIds])

  const unitOptions = useMemo(() => {
    return units.filter((u) => {
      if (!u.active) return false
      if (draft.buildingIds.length && !draft.buildingIds.includes(u.buildingId)) return false
      if (draft.floors.length && !draft.floors.includes(u.floor)) return false
      if (unitQuery) {
        const q = unitQuery.trim().toLowerCase()
        return (
          u.code.toLowerCase().includes(q) ||
          u.label.toLowerCase().includes(q) ||
          u.buildingName.toLowerCase().includes(q)
        )
      }
      return true
    })
  }, [units, draft.buildingIds, draft.floors, unitQuery])

  const inspectors = useMemo(() => {
    const names = new Set<string>()
    for (const a of activities) {
      if (a.actorName?.trim()) names.add(a.actorName.trim())
    }
    for (const d of defects) {
      if (d.createdByName?.trim()) names.add(d.createdByName.trim())
      if (d.updatedByName?.trim()) names.add(d.updatedByName.trim())
    }
    return [...names].sort((a, b) => a.localeCompare(b, 'zh-Hant'))
  }, [activities, defects])

  const statusOpts: { key: DefectStatus; label: string; cls: string }[] = [
    { key: 'pending_repair', label: '待改善', cls: 'amber' },
    { key: 'pending_reinspection', label: '待複驗', cls: 'slate' },
    { key: 'returned', label: '退回', cls: 'terra' },
    { key: 'completed', label: '已改善', cls: 'muted' },
  ]

  return (
    <Modal onClose={onClose} aria-label="進階篩選" variant="bottom">
        <TitleHint
          as="h3"
          className="serif"
          style={{ margin: '0 0 14px', fontSize: 20 }}
          hint="可組合棟／樓／戶、查驗大項、區域、人員與日期；狀態請用上方快捷 chip。"
        >
          進階篩選
        </TitleHint>

        <Section title="棟別（可複選）">
          <div className="chip-row">
            {activeBuildings.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`chip ${draft.buildingIds.includes(b.id) ? 'on' : ''}`}
                onClick={() => setDraft((d) => ({ ...d, buildingIds: toggle(d.buildingIds, b.id) }))}
              >
                {b.name}
              </button>
            ))}
          </div>
        </Section>

        <Section title="樓層（可複選）">
          <div className="chip-row">
            {floorOptions.map((f) => (
              <button
                key={f}
                type="button"
                className={`chip ${draft.floors.includes(f) ? 'on' : ''}`}
                onClick={() => setDraft((d) => ({ ...d, floors: toggle(d.floors, f) }))}
              >
                {f}
              </button>
            ))}
          </div>
        </Section>

        <Section title="戶別（可複選，可搜尋）">
          <input
            value={unitQuery}
            onChange={(e) => setUnitQuery(e.target.value)}
            placeholder="搜尋戶別，例如 B3、3F"
            style={{
              width: '100%',
              minHeight: 44,
              marginBottom: 8,
              borderRadius: 14,
              border: '1px solid rgba(34,41,31,0.1)',
              padding: '0 12px',
              background: 'rgba(255,255,255,0.65)',
            }}
          />
          <div className="chip-row" style={{ maxHeight: 120, overflow: 'auto' }}>
            {unitOptions.slice(0, 40).map((u) => (
              <button
                key={u.id}
                type="button"
                className={`chip ${draft.unitIds.includes(u.id) ? 'on' : ''}`}
                onClick={() => setDraft((d) => ({ ...d, unitIds: toggle(d.unitIds, u.id) }))}
              >
                {u.buildingName} {u.floor} {u.code}
              </button>
            ))}
          </div>
        </Section>

        <Section title="大項／細項">
          <div className="chip-row" style={{ marginBottom: 8 }}>
            {categories.filter((c) => c.active).map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip ${draft.categoryIds.includes(c.id) ? 'on' : ''}`}
                onClick={() =>
                  setDraft((d) => ({ ...d, categoryIds: toggle(d.categoryIds, c.id) }))
                }
              >
                {c.name}
              </button>
            ))}
          </div>
          <div className="chip-row" style={{ maxHeight: 100, overflow: 'auto' }}>
            {items
              .filter(
                (i) =>
                  i.active &&
                  (!draft.categoryIds.length || draft.categoryIds.includes(i.categoryId)),
              )
              .map((i) => (
                <button
                  key={i.id}
                  type="button"
                  className={`chip ${draft.checklistItemIds.includes(i.id) ? 'on' : ''}`}
                  onClick={() =>
                    setDraft((d) => ({
                      ...d,
                      checklistItemIds: toggle(d.checklistItemIds, i.id),
                    }))
                  }
                  style={{ maxWidth: '100%' }}
                >
                  {i.description.slice(0, 18)}
                  {i.description.length > 18 ? '…' : ''}
                </button>
              ))}
          </div>
        </Section>

        <Section title="區域">
          <div className="chip-row">
            {areas.map((a) => (
              <button
                key={a}
                type="button"
                className={`chip ${draft.areas.includes(a) ? 'on' : ''}`}
                onClick={() => setDraft((d) => ({ ...d, areas: toggle(d.areas, a) }))}
              >
                {a}
              </button>
            ))}
          </div>
        </Section>

        <Section title="狀態（可複選）">
          <div className="chip-row">
            {statusOpts.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`chip ${draft.statuses.includes(s.key) ? `on ${s.cls}` : ''}`}
                onClick={() => setDraft((d) => ({ ...d, statuses: toggle(d.statuses, s.key) }))}
              >
                {s.label}
              </button>
            ))}
          </div>
        </Section>

        <Section title="查驗人員">
          <div className="chip-row">
            {inspectors.map((name) => (
              <button
                key={name}
                type="button"
                className={`chip ${draft.inspectors.includes(name) ? 'on' : ''}`}
                onClick={() => setDraft((d) => ({ ...d, inspectors: toggle(d.inspectors, name) }))}
              >
                {name}
              </button>
            ))}
          </div>
        </Section>

        <Section title="建立日期區間">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input
              type="date"
              value={draft.createdFrom}
              onChange={(e) => setDraft((d) => ({ ...d, createdFrom: e.target.value }))}
              style={dateInputStyle}
            />
            <input
              type="date"
              value={draft.createdTo}
              onChange={(e) => setDraft((d) => ({ ...d, createdTo: e.target.value }))}
              style={dateInputStyle}
            />
          </div>
        </Section>

        <Section title="複驗日期區間">
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <input
              type="date"
              value={draft.reinspectFrom}
              onChange={(e) => setDraft((d) => ({ ...d, reinspectFrom: e.target.value }))}
              style={dateInputStyle}
            />
            <input
              type="date"
              value={draft.reinspectTo}
              onChange={(e) => setDraft((d) => ({ ...d, reinspectTo: e.target.value }))}
              style={dateInputStyle}
            />
          </div>
        </Section>

        <div
          style={{
            position: 'sticky',
            bottom: 0,
            display: 'grid',
            gridTemplateColumns: '1fr 1.2fr',
            gap: 8,
            paddingTop: 12,
            background: 'linear-gradient(180deg, transparent, rgba(245,242,234,0.95) 30%)',
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => {
              const cleared = emptyFilters()
              setDraft(cleared)
              onApply(cleared)
              onClose()
            }}
          >
            清除全部
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              onApply(draft)
              onClose()
            }}
          >
            套用篩選
          </button>
        </div>
    </Modal>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 8 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

const dateInputStyle: CSSProperties = {
  minHeight: 44,
  borderRadius: 14,
  border: '1px solid rgba(34,41,31,0.1)',
  padding: '0 10px',
  background: 'rgba(255,255,255,0.65)',
}
