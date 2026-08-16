import { useEffect, useMemo, useState } from 'react'
import type { BuildingRule } from '../../types'
import { expandFloorRange, naKey, parseUnitCodes, sortFloorsAsc } from '../../lib/floors'
import {
  codesForFloor,
  countActiveUnits,
  countTotalSlots,
  hasPerFloorUnitCodes,
} from '../../lib/units'
import { Modal } from '../ui/Modal'
import { TitleHint } from '../ui/TitleHint'

const FLOOR_PRESETS: [string, string][] = [
  ['1F', '7F'],
  ['B1F', 'RF'],
  ['B3F', 'R2F'],
  ['1F', '12F'],
]

function initFloorCodesText(b: BuildingRule): Record<string, string> {
  const map: Record<string, string> = {}
  for (const floor of b.floors) {
    map[floor] = codesForFloor(b, floor).join(', ')
  }
  return map
}

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
  const [perFloorMode, setPerFloorMode] = useState(() => hasPerFloorUnitCodes(initial))
  const [floorCodesText, setFloorCodesText] = useState<Record<string, string>>(() =>
    initFloorCodesText(initial),
  )
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

  // 樓層增減時，為新樓層補上預設戶別文字
  useEffect(() => {
    setFloorCodesText((prev) => {
      const next = { ...prev }
      let changed = false
      for (const floor of floors) {
        if (next[floor] === undefined) {
          next[floor] = unitCodesText || initial.unitCodes.join(', ')
          changed = true
        }
      }
      for (const key of Object.keys(next)) {
        if (!floors.includes(key)) {
          delete next[key]
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [floors, unitCodesText, initial.unitCodes])

  const preview = useMemo(() => {
    const floorUnitCodes: Record<string, string[]> | undefined = perFloorMode
      ? Object.fromEntries(
          floors.map((floor) => {
            const codes = parseUnitCodes(floorCodesText[floor] ?? '')
            return [floor, codes]
          }),
        )
      : undefined

    // 各層模式下，unitCodes 保留「預設範本」；若為空則用第一層
    const fallbackCodes =
      unitCodes.length > 0
        ? unitCodes
        : floors.length
          ? parseUnitCodes(floorCodesText[floors[0]!] ?? '')
          : []

    const draft: BuildingRule = {
      ...initial,
      name: name.trim() || initial.name,
      floors,
      unitCodes: fallbackCodes,
      floorUnitCodes:
        perFloorMode && floorUnitCodes && Object.values(floorUnitCodes).some((c) => c.length > 0)
          ? floorUnitCodes
          : undefined,
      naKeys: [],
      active: true,
    }

    const naKeys: string[] = []
    for (const floor of naFloors) {
      for (const code of codesForFloor(draft, floor)) {
        naKeys.push(naKey(floor, code))
      }
    }
    draft.naKeys = naKeys

    const totalSlots = countTotalSlots(draft)
    const activeUnits = countActiveUnits(draft)
    return {
      draft,
      activeUnits,
      totalSlots,
      naCount: totalSlots - activeUnits,
    }
  }, [
    initial,
    name,
    floors,
    unitCodes,
    perFloorMode,
    floorCodesText,
    naFloors,
  ])

  const canSave = useMemo(() => {
    if (!name.trim() || floors.length === 0) return false
    if (perFloorMode) {
      return floors.every((floor) => parseUnitCodes(floorCodesText[floor] ?? '').length > 0)
    }
    return unitCodes.length > 0
  }, [name, floors, perFloorMode, floorCodesText, unitCodes])

  const displayName = name.trim() || initial.name || '新棟別'

  function enablePerFloor(on: boolean) {
    setPerFloorMode(on)
    if (on) {
      setFloorCodesText((prev) => {
        const next = { ...prev }
        for (const floor of floors) {
          if (!next[floor]?.trim()) next[floor] = unitCodesText
        }
        return next
      })
    }
  }

  function applyDefaultToAllFloors() {
    if (!unitCodesText.trim()) return
    setFloorCodesText((prev) => {
      const next = { ...prev }
      for (const floor of floors) next[floor] = unitCodesText
      return next
    })
  }

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
            hint="可設每層相同戶號，或各樓層分別設定不同戶別編號。"
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

          <div className="chip-row" style={{ marginBottom: 12 }}>
            <button
              type="button"
              className={`chip ${!perFloorMode ? 'on' : ''}`}
              onClick={() => enablePerFloor(false)}
            >
              每層相同
            </button>
            <button
              type="button"
              className={`chip ${perFloorMode ? 'on' : ''}`}
              onClick={() => enablePerFloor(true)}
            >
              各層分別設定
            </button>
          </div>

          {!perFloorMode ? (
            <div className="field" style={{ marginBottom: 0 }}>
              <label htmlFor="unit-codes">
                <TitleHint as="span" hint="同一套編號套用到每一層。">
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
          ) : (
            <div style={{ display: 'grid', gap: 10 }}>
              <div className="field" style={{ marginBottom: 0 }}>
                <label htmlFor="unit-codes-template">
                  <TitleHint
                    as="span"
                    hint="可先填一組，再按「套用到全部樓層」當底稿，再針對少數樓層微調。"
                  >
                    預設底稿（可套用到全部樓層）
                  </TitleHint>
                </label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input
                    id="unit-codes-template"
                    value={unitCodesText}
                    onChange={(e) => setUnitCodesText(e.target.value)}
                    placeholder="例如 A1, A2, A3"
                    style={{ flex: 1, minWidth: 160 }}
                  />
                  <button
                    type="button"
                    className="btn btn-ghost"
                    style={{ minHeight: 40 }}
                    onClick={applyDefaultToAllFloors}
                  >
                    套用到全部樓層
                  </button>
                </div>
              </div>

              <div
                style={{
                  display: 'grid',
                  gap: 8,
                  maxHeight: '36vh',
                  overflow: 'auto',
                  paddingRight: 2,
                }}
              >
                {floors.map((floor) => {
                  const isNa = naFloors.includes(floor)
                  return (
                    <div
                      key={floor}
                      className="field"
                      style={{
                        marginBottom: 0,
                        opacity: isNa ? 0.55 : 1,
                      }}
                    >
                      <label htmlFor={`floor-codes-${floor}`}>
                        {floor}
                        {isNa ? '（整層不適用）' : ''}
                      </label>
                      <input
                        id={`floor-codes-${floor}`}
                        value={floorCodesText[floor] ?? ''}
                        onChange={(e) =>
                          setFloorCodesText((prev) => ({
                            ...prev,
                            [floor]: e.target.value,
                          }))
                        }
                        placeholder="例如 A1, A2"
                      />
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </section>

        <section className="glass-green building-editor-preview">
          <div className="building-editor-preview-label">展開預覽</div>
          <div className="serif building-editor-preview-title">
            {displayName}
            {floors.length > 0
              ? perFloorMode
                ? `・${floors[0]}–${floors[floors.length - 1]}・各層戶別不同`
                : unitCodes.length > 0
                  ? `・${floors[0]}–${floors[floors.length - 1]}・每層 ${unitCodes.length} 戶`
                  : ''
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
            {perFloorMode
              ? `各層戶別已分別設定（共 ${preview.activeUnits} 可查驗戶）`
              : `戶別 ${unitCodes.length ? unitCodes.join('、') : '尚未設定'}`}
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
    if (!floor) continue
    counts.set(floor, (counts.get(floor) ?? 0) + 1)
  }
  return [...counts.entries()]
    .filter(([floor, n]) => n >= codesForFloor(b, floor).length && codesForFloor(b, floor).length > 0)
    .map(([floor]) => floor)
}
