import { useState } from 'react'
import { useProjectStore } from '../../store/useProjectStore'
import { countActiveUnits, newBuildingDraft, summarizeBuilding } from '../../lib/units'
import { BuildingEditor } from './BuildingEditor'
import type { BuildingRule } from '../../types'

export function SettingsPage({ embedded = false }: { embedded?: boolean }) {
  const buildings = useProjectStore((s) => s.buildings)
  const categories = useProjectStore((s) => s.categories)
  const units = useProjectStore((s) => s.units)
  const upsertBuilding = useProjectStore((s) => s.upsertBuilding)
  const removeBuilding = useProjectStore((s) => s.removeBuilding)
  const resetDemoData = useProjectStore((s) => s.resetDemoData)

  const [editing, setEditing] = useState<BuildingRule | null>(null)
  const activeBuildings = [...buildings]
    .filter((b) => b.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const totalActiveUnits = units.filter((u) => u.active).length

  return (
    <div className={embedded ? undefined : 'rise'}>
      {!embedded && (
        <header style={{ marginBottom: 14 }}>
          <div className="eyebrow">PROJECT SETUP</div>
          <h1 className="serif" style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700 }}>
            棟別、樓層與戶別
          </h1>
        </header>
      )}

      <div className="section-row" style={{ marginTop: embedded ? 0 : undefined }}>
        <h2>棟別結構</h2>
        <button type="button" className="link" onClick={resetDemoData}>還原示範</button>
      </div>

      <p style={{ margin: '0 0 12px', color: 'var(--ink-soft)', fontSize: 13, lineHeight: 1.5 }}>
        以規則批次建立：棟別、樓層範圍、各層戶別編號。目前 {activeBuildings.length} 棟・{totalActiveUnits} 可查驗戶。
      </p>

      <div style={{ display: 'grid', gap: 10 }}>
        {activeBuildings.map((b) => (
          <article
            key={b.id}
            className="glass"
            style={{
              padding: 14,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <div>
              <div className="serif" style={{ fontWeight: 700, fontSize: 17 }}>
                {b.name}
                <span style={{ color: 'var(--ink-soft)', fontWeight: 600, fontSize: 13, marginLeft: 8, fontFamily: 'Noto Sans TC, sans-serif' }}>
                  {summarizeBuilding(b)}
                </span>
              </div>
              <div style={{ marginTop: 4, color: 'var(--ink-soft)', fontSize: 12, fontWeight: 600 }}>
                戶別 {b.unitCodes.join('、')} · 可查驗 {countActiveUnits(b)} 戶
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 40, flexShrink: 0 }}
              onClick={() => setEditing(b)}
            >
              編輯
            </button>
          </article>
        ))}

        <button
          type="button"
          className="btn-dashed"
          onClick={() => {
            const nextIndex = activeBuildings.length
            const letter = String.fromCharCode(65 + (nextIndex % 26))
            setEditing(
              newBuildingDraft({
                name: `${letter}棟`,
                unitCodes: [`${letter}1`, `${letter}2`, `${letter}3`],
                sortOrder: nextIndex,
              }),
            )
          }}
        >
          + 新增棟別
        </button>
      </div>

      <div className="section-row">
        <h2>查驗範本</h2>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {categories
          .filter((c) => c.active)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((cat) => (
            <article
              key={cat.id}
              className="glass"
              style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 12,
                  background: cat.color,
                  color: '#fff',
                  display: 'grid',
                  placeItems: 'center',
                  fontWeight: 800,
                }}
              >
                {cat.iconChar}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800 }}>{cat.name}</div>
                <div style={{ color: 'var(--ink-soft)', fontSize: 12, fontWeight: 600 }}>
                  {cat.itemCount} 細項
                </div>
              </div>
            </article>
          ))}
      </div>

      {editing && (
        <BuildingEditor
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={(b) => {
            upsertBuilding(b)
            setEditing(null)
          }}
          onDelete={
            buildings.some((b) => b.id === editing.id)
              ? () => {
                  removeBuilding(editing.id)
                  setEditing(null)
                }
              : undefined
          }
        />
      )}
    </div>
  )
}
