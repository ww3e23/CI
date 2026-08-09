import { useState } from 'react'
import { useProjectStore } from '../../store/useProjectStore'
import { countActiveUnits, newBuildingDraft, summarizeBuilding } from '../../lib/units'
import { BuildingEditor } from './BuildingEditor'
import type { BuildingRule } from '../../types'

export function SettingsPage() {
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
    <div className="rise">
      <header style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, letterSpacing: '0.08em', color: 'var(--muted)', fontWeight: 700 }}>
          PROJECT SETUP
        </div>
        <h1 style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 800 }}>棟別、樓層與戶別</h1>
        <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 13, lineHeight: 1.5 }}>
          以規則批次建立結構：設定有哪幾棟、每棟樓層範圍、各層戶別編號。可重新命名、調整或停用，既有缺失紀錄仍會保留。
        </p>
      </header>

      <div
        className="card"
        style={{
          padding: 12,
          marginBottom: 12,
          display: 'flex',
          justifyContent: 'space-between',
          gap: 8,
          background: 'var(--green-50)',
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>目前結構</div>
          <div style={{ fontWeight: 800, fontSize: 16 }}>
            {activeBuildings.length} 棟 · {totalActiveUnits} 可查驗戶
          </div>
        </div>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 40 }} onClick={resetDemoData}>
          還原示範
        </button>
      </div>

      <div style={{ display: 'grid', gap: 10 }}>
        {activeBuildings.map((b) => (
          <article
            key={b.id}
            className="card"
            style={{
              padding: 14,
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              alignItems: 'center',
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>
                {b.name}
                <span style={{ color: 'var(--muted)', fontWeight: 600, fontSize: 13, marginLeft: 8 }}>
                  {summarizeBuilding(b)}
                </span>
              </div>
              <div style={{ marginTop: 4, color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>
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

      <div className="section-label">
        <h2>
          TEMPLATES
          <span className="zh">查驗範本</span>
        </h2>
      </div>

      <div style={{ display: 'grid', gap: 8 }}>
        {categories
          .filter((c) => c.active)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((cat) => (
            <article
              key={cat.id}
              className="card"
              style={{
                padding: 12,
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
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
                <div style={{ color: 'var(--muted)', fontSize: 12, fontWeight: 600 }}>
                  {cat.itemCount} 細項
                </div>
              </div>
              <button type="button" className="btn btn-ghost" style={{ minHeight: 40 }}>
                編輯
              </button>
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
