import { useMemo, useState } from 'react'
import type { BuildingRule } from '../../types'
import { expandFloorRange, naKey, parseUnitCodes, sortFloorsAsc } from '../../lib/floors'
import { countActiveUnits } from '../../lib/units'
import { Modal } from '../ui/Modal'
import { TitleHint } from '../ui/TitleHint'

const FLOOR_PRESETS: [string, string][] = [
  ['1F', '7F'],
  ['B1F', 'RF'],
  ['B3F', 'R2F'],
  ['1F', '12F'],
]

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
  const [naFloorText, setNaFloorText] = useState(guessNaFloors(initial).join(', '))
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
      naCount: floors.length * unitCodes.length - countActiveUnits(draft),
    }
  }, [initial, name, floors, unitCodes, naFloors])

  const canSave = Boolean(name.trim() && floors.length > 0 && unitCodes.length > 0)
  const displayName = name.trim() || initial.name || '新棟別'

  return (
    <Modal
      onClose={onCancel}
      aria-label="編輯棟別結構"
      variant="bottom"
      className="building-editor-sheet"
    >
      <div className="building-editor-body">
        <header className="building-editor-header">
          <TitleHint
            as="h3"
            className="serif"
            style={{ margin: 0, fontSize: 20, fontWeight: 700 }}
            hint="只需設定「棟別、樓層範圍、各層戶別編號」，系統自動展開成數百戶，不必一戶一戶新增。"
          >
            {initial.name ? `編輯 ${initial.name}` : '新增棟別'}
          </TitleHint>
        </header>

        <section className="glass building-editor-card">
          <div className="building-editor-card-title">棟別名稱</div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="building-name">名稱</label>
            <input
              id="building-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例如 A棟"
              autoFocus
            />
          </div>
        </section>

        <section className="glass building-editor-card">
          <div className="building-editor-card-title">樓層範圍</div>

          <div className="field-grid-2">
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="floor-from">樓層起</label>
              <input
                id="floor-from"
                value={floorFrom}
                onChange={(e) => setFloorFrom(e.target.value)}
                placeholder="B3F / 1F"
              />
            </div>
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="floor-to">樓層迄</label>
              <input
                id="floor-to"
                value={floorTo}
                onChange={(e) => setFloorTo(e.target.value)}
                placeholder="7F / R2F"
              />
            </div>
          </div>

          <div className="chip-row" style={{ marginTop: 12 }}>
            {FLOOR_PRESETS.map(([from, to]) => {
              const on = floorFrom === from && floorTo === to
              return (
                <button
                  key={`${from}-${to}`}
                  type="button"
                  className={`chip ${on ? 'on' : ''}`}
                  onClick={() => {
                    setFloorFrom(from)
                    setFloorTo(to)
                  }}
                >
                  {from}-{to}
                </button>
              )
            })}
          </div>

          <div className="field" style={{ marginTop: 14, marginBottom: 0 }}>
            <label htmlFor="extra-floors">額外樓層（可選）</label>
            <input
              id="extra-floors"
              value={extraFloors}
              onChange={(e) => setExtraFloors(e.target.value)}
              placeholder="例如 M1F, RF"
            />
          </div>

          <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
            <label htmlFor="na-floors">整層不適用</label>
            <input
              id="na-floors"
              value={naFloorText}
              onChange={(e) => setNaFloorText(e.target.value)}
              placeholder="例如 B3F, B2F, B1F, R1F, R2F"
            />
          </div>
        </section>

        <section className="glass building-editor-card">
          <div className="building-editor-card-title">戶別編號規則</div>
          <div className="field" style={{ marginBottom: 0 }}>
            <label htmlFor="unit-codes">
              <TitleHint as="span" hint="同一套編號會套用到每一層，適合「每層戶號規則相同」的建案。">
                各層戶別編號（逗號分隔）
              </TitleHint>
            </label>
            <input
              id="unit-codes"
              value={unitCodesText}
              onChange={(e) => setUnitCodesText(e.target.value)}
              placeholder="例如 A1, A2, A3, A5"
            />
          </div>
        </section>

        <section className="glass-green building-editor-preview">
          <div className="building-editor-preview-label">展開預覽</div>
          <div className="serif building-editor-preview-title">
            {displayName}
            {floors.length > 0 && unitCodes.length > 0
              ? `・${floors[0]}–${floors[floors.length - 1]}・${unitCodes.length} 戶型`
              : ''}
          </div>
          <div className="building-editor-preview-stats">
            <div>
              <span className="nums building-editor-preview-num">{preview.totalSlots}</span>
              <span>個格位</span>
            </div>
            <div>
              <span className="nums building-editor-preview-num">{preview.activeUnits}</span>
              <span>可查驗戶</span>
            </div>
            <div>
              <span className="nums building-editor-preview-num">{preview.naCount}</span>
              <span>不適用</span>
            </div>
          </div>
          <div className="building-editor-preview-meta">
            樓層 {floors.length ? floors.join('、') : '尚未設定'}
            <br />
            戶別 {unitCodes.length ? unitCodes.join('、') : '尚未設定'}
          </div>
        </section>
      </div>

      <footer className="building-editor-footer">
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={!canSave}
          onClick={() => onSave(preview.draft)}
        >
          儲存並自動展開戶別
        </button>
        <button type="button" className="building-editor-cancel" onClick={onCancel}>
          取消
        </button>
        {onDelete && (
          <button type="button" className="building-editor-delete" onClick={onDelete}>
            刪除／停用此棟
          </button>
        )}
      </footer>
    </Modal>
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
