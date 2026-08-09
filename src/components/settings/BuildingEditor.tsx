import { useMemo, useState } from 'react'
import type { BuildingRule } from '../../types'
import { expandFloorRange, naKey, parseUnitCodes, sortFloorsAsc } from '../../lib/floors'
import { countActiveUnits } from '../../lib/units'

export function BuildingEditor({
  initial,
  onSave,
  onCancel,
  onDelete,
}: {
  initial: BuildingRule
  onSave: (building: BuildingRule) => void
  onCancel: () => void
  onDelete?: () => void
}) {
  const [name, setName] = useState(initial.name)
  const [floorFrom, setFloorFrom] = useState(initial.floors[0] ?? '1F')
  const [floorTo, setFloorTo] = useState(initial.floors[initial.floors.length - 1] ?? '7F')
  const [unitCodesText, setUnitCodesText] = useState(initial.unitCodes.join(', '))
  const [naFloorText, setNaFloorText] = useState(
    guessNaFloors(initial).join(', '),
  )
  const [extraFloors, setExtraFloors] = useState('')

  const floors = useMemo(() => {
    const base = expandFloorRange(floorFrom, floorTo)
    const extra = parseUnitCodes(extraFloors).map((s) => s.toUpperCase())
    return sortFloorsAsc([...new Set([...base, ...extra])])
  }, [floorFrom, floorTo, extraFloors])

  const unitCodes = useMemo(() => parseUnitCodes(unitCodesText), [unitCodesText])
  const naFloors = useMemo(
    () => parseUnitCodes(naFloorText).map((s) => s.toUpperCase()),
    [naFloorText],
  )

  const preview = useMemo(() => {
    const naKeys: string[] = []
    for (const floor of naFloors) {
      for (const code of unitCodes) {
        naKeys.push(naKey(floor, code))
      }
    }
    const draft: BuildingRule = {
      ...initial,
      name: name.trim() || initial.name,
      floors,
      unitCodes,
      naKeys,
      active: true,
    }
    return {
      draft,
      activeUnits: countActiveUnits(draft),
      totalSlots: floors.length * unitCodes.length,
    }
  }, [initial, name, floors, unitCodes, naFloors])

  return (
    <>
      <div className="sheet-backdrop" onClick={onCancel} />
      <div className="sheet" role="dialog" aria-label="編輯棟別結構">
        <div className="sheet-handle" />
        <h3 style={{ margin: '0 0 4px', fontSize: 18 }}>
          {initial.name ? `編輯 ${initial.name}` : '新增棟別'}
        </h3>
        <p style={{ margin: '0 0 14px', color: 'var(--muted)', fontSize: 13 }}>
          只需設定「棟別、樓層範圍、各層戶別編號」，系統自動展開成數百戶，不必一戶一戶新增。
        </p>

        <div className="field">
          <label>棟別名稱</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如 A棟" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div className="field">
            <label>樓層起</label>
            <input value={floorFrom} onChange={(e) => setFloorFrom(e.target.value)} placeholder="B3F / 1F" />
          </div>
          <div className="field">
            <label>樓層迄</label>
            <input value={floorTo} onChange={(e) => setFloorTo(e.target.value)} placeholder="7F / R2F" />
          </div>
        </div>

        <div className="chip-row" style={{ marginBottom: 12 }}>
          {[
            ['1F', '7F'],
            ['B1F', 'RF'],
            ['B3F', 'R2F'],
            ['1F', '12F'],
          ].map(([from, to]) => (
            <button
              key={`${from}-${to}`}
              type="button"
              className="chip"
              onClick={() => {
                setFloorFrom(from)
                setFloorTo(to)
              }}
            >
              {from}-{to}
            </button>
          ))}
        </div>

        <div className="field">
          <label>額外樓層（可選，逗號分隔）</label>
          <input
            value={extraFloors}
            onChange={(e) => setExtraFloors(e.target.value)}
            placeholder="例如 M1F, RF"
          />
        </div>

        <div className="field">
          <label>各層戶別編號（逗號分隔）</label>
          <input
            value={unitCodesText}
            onChange={(e) => setUnitCodesText(e.target.value)}
            placeholder="例如 A1, A2, A3, A5"
          />
          <div style={{ fontSize: 12, color: 'var(--muted)' }}>
            同一套編號會套用到每一層，適合「每層戶號規則相同」的建案。
          </div>
        </div>

        <div className="field">
          <label>整層不適用（地下室／屋頂等，逗號分隔）</label>
          <input
            value={naFloorText}
            onChange={(e) => setNaFloorText(e.target.value)}
            placeholder="例如 B3F, B2F, B1F, R1F, R2F"
          />
        </div>

        <div
          className="card"
          style={{ padding: 12, marginBottom: 14, background: 'var(--green-50)' }}
        >
          <div style={{ fontWeight: 800, marginBottom: 6 }}>展開預覽</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.55 }}>
            樓層：{floors.join('、') || '尚未設定'}
            <br />
            戶別：{unitCodes.join('、') || '尚未設定'}
            <br />
            將產生 <strong>{preview.totalSlots}</strong> 個格位，其中可查驗{' '}
            <strong>{preview.activeUnits}</strong> 戶
            （NA {preview.totalSlots - preview.activeUnits}）。
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!name.trim() || floors.length === 0 || unitCodes.length === 0}
            onClick={() => onSave(preview.draft)}
          >
            儲存並自動展開戶別
          </button>
          <button type="button" className="btn btn-ghost" onClick={onCancel}>
            取消
          </button>
          {onDelete && (
            <button
              type="button"
              className="btn"
              style={{ color: 'var(--danger)', fontWeight: 700 }}
              onClick={onDelete}
            >
              刪除／停用此棟
            </button>
          )}
        </div>
      </div>
    </>
  )
}

function guessNaFloors(b: BuildingRule): string[] {
  const counts = new Map<string, number>()
  for (const key of b.naKeys) {
    const floor = key.split('|')[0]
    counts.set(floor, (counts.get(floor) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([, n]) => n >= b.unitCodes.length)
    .map(([floor]) => floor)
}
