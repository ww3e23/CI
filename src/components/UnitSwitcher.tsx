import { useMemo, useState } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import { sortFloorsDesc } from '../lib/floors'

export function UnitSwitcher({ onClose }: { onClose: () => void }) {
  const buildings = useProjectStore((s) => s.buildings)
  const units = useProjectStore((s) => s.units)
  const recentUnitIds = useProjectStore((s) => s.recentUnitIds)
  const setCurrentUnit = useProjectStore((s) => s.setCurrentUnit)

  const activeBuildings = useMemo(
    () => [...buildings].filter((b) => b.active).sort((a, b) => a.sortOrder - b.sortOrder),
    [buildings],
  )

  const [buildingId, setBuildingId] = useState(activeBuildings[0]?.id ?? '')
  const building = activeBuildings.find((b) => b.id === buildingId) ?? activeBuildings[0]
  const floors = useMemo(
    () => (building ? sortFloorsDesc(building.floors) : []),
    [building],
  )
  const [floor, setFloor] = useState(floors[0] ?? '')
  const effectiveFloor = floors.includes(floor) ? floor : floors[0] ?? ''

  const floorUnits = useMemo(() => {
    if (!building) return []
    return units.filter(
      (u) =>
        u.buildingId === building.id &&
        u.floor === effectiveFloor &&
        u.active,
    )
  }, [units, building, effectiveFloor])

  const [unitId, setUnitId] = useState('')
  const selected =
    floorUnits.find((u) => u.id === unitId) ?? floorUnits[0] ?? null

  const recent = recentUnitIds
    .map((id) => units.find((u) => u.id === id))
    .filter(Boolean)
    .slice(0, 5)

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="切換戶別">
        <div className="sheet-handle" />
        <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>快速切換戶別</h3>
        <p style={{ margin: '0 0 14px', color: 'var(--muted)', fontSize: 13 }}>
          先選棟別 → 樓層 → 戶別，不必回到設定頁逐戶翻找。
        </p>

        {recent.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--muted)', marginBottom: 8 }}>
              最近使用
            </div>
            <div className="chip-row">
              {recent.map((u) =>
                u ? (
                  <button
                    key={u.id}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setCurrentUnit(u.id)
                      onClose()
                    }}
                  >
                    {u.buildingName} {u.floor} {u.code}
                  </button>
                ) : null,
              )}
            </div>
          </div>
        )}

        <div className="field">
          <label>1. 棟別</label>
          <div className="chip-row">
            {activeBuildings.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`chip ${building?.id === b.id ? 'active' : ''}`}
                onClick={() => {
                  setBuildingId(b.id)
                  setUnitId('')
                }}
              >
                {b.name}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>2. 樓層</label>
          <div className="chip-row">
            {floors.map((f) => (
              <button
                key={f}
                type="button"
                className={`chip ${effectiveFloor === f ? 'active' : ''}`}
                onClick={() => {
                  setFloor(f)
                  setUnitId('')
                }}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>3. 戶別</label>
          <div className="chip-row">
            {floorUnits.map((u) => (
              <button
                key={u.id}
                type="button"
                className={`chip ${(selected?.id === u.id) ? 'active' : ''}`}
                onClick={() => setUnitId(u.id)}
              >
                {u.code}
              </button>
            ))}
            {floorUnits.length === 0 && (
              <span style={{ color: 'var(--muted)', fontSize: 13 }}>此樓層無可查驗戶別</span>
            )}
          </div>
        </div>

        <div
          className="card"
          style={{ padding: 14, marginBottom: 14, background: 'var(--green-50)' }}
        >
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 700 }}>即將查驗</div>
          <div style={{ fontSize: 20, fontWeight: 800, marginTop: 4 }}>
            {selected ? selected.label : '尚未選擇'}
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={!selected}
          onClick={() => {
            if (!selected) return
            setCurrentUnit(selected.id)
            onClose()
          }}
        >
          開始查驗此戶
        </button>
      </div>
    </>
  )
}
