import { useMemo, useState } from 'react'
import { useProjectStore } from '../store/useProjectStore'
import { sortFloorsDesc } from '../lib/floors'
import { Modal } from './ui/Modal'
import { TitleHint } from './ui/TitleHint'

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
  const [floor, setFloor] = useState(floors.includes('3F') ? '3F' : floors[0] ?? '')
  const effectiveFloor = floors.includes(floor) ? floor : floors[0] ?? ''

  const floorUnits = useMemo(() => {
    if (!building) return []
    return units.filter(
      (u) => u.buildingId === building.id && u.floor === effectiveFloor && u.active,
    )
  }, [units, building, effectiveFloor])

  const [unitId, setUnitId] = useState('')
  const selected = floorUnits.find((u) => u.id === unitId) ?? floorUnits[0] ?? null

  const step = !building ? 1 : !effectiveFloor ? 2 : selected ? 3 : 2

  const recent = recentUnitIds
    .map((id) => units.find((u) => u.id === id))
    .filter(Boolean)
    .slice(0, 6)

  return (
    <Modal onClose={onClose} aria-label="快速切換戶別">
        <TitleHint
          as="h3"
          className="serif"
          style={{ margin: '0 0 12px', fontSize: 20 }}
          hint="棟別 → 樓層 → 戶別，適合數百戶現場導航。"
        >
          快速切換戶別
        </TitleHint>

        <div className="stepper">
          <div className={`step ${step >= 1 ? 'on' : ''} ${building ? 'done' : ''}`}>1. 棟別</div>
          <div className={`step ${step >= 2 ? 'on' : ''} ${effectiveFloor ? 'done' : ''}`}>2. 樓層</div>
          <div className={`step ${step >= 3 ? 'on' : ''} ${selected ? 'done' : ''}`}>3. 戶別</div>
        </div>

        {recent.length > 0 && (
          <div style={{ marginBottom: 14 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>最近使用</div>
            <div className="chip-row" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
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
          <label>棟別</label>
          <div className="chip-row">
            {activeBuildings.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`chip ${building?.id === b.id ? 'on' : ''}`}
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
          <label>樓層</label>
          <div className="chip-row">
            {floors.map((f) => (
              <button
                key={f}
                type="button"
                className={`chip ${effectiveFloor === f ? 'on' : ''}`}
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
          <label>戶別</label>
          <div className="chip-row">
            {floorUnits.map((u) => (
              <button
                key={u.id}
                type="button"
                className={`chip ${selected?.id === u.id ? 'on' : ''}`}
                onClick={() => setUnitId(u.id)}
              >
                {u.code}
              </button>
            ))}
            {floorUnits.length === 0 && (
              <span style={{ color: 'var(--ink-soft)', fontSize: 13 }}>此樓層無可查驗戶別</span>
            )}
          </div>
        </div>

        <div
          className="glass-green"
          style={{ padding: 12, marginBottom: 14, borderRadius: 16 }}
        >
          <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 700 }}>即將切換至</div>
          <div className="serif" style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>
            {selected
              ? `${selected.buildingName}・${selected.floor}・${selected.code}戶`
              : '尚未選擇'}
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
    </Modal>
  )
}
