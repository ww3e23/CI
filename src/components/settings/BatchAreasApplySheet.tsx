import { useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { useCurrentRole, useCurrentUser } from '../../store/useAuthStore'
import {
  DEFAULT_AREAS,
  getUnitAreas,
  isUnitAreasCustomized,
  normalizeAreaName,
  sanitizeAreaList,
} from '../../lib/areas'
import { floorRank as floorSortKey, sortFloorsDesc } from '../../lib/floors'
import { createId } from '../../lib/id'
import { Modal } from '../ui/Modal'
import { GlassSelect } from '../ui/GlassSelect'
import { TitleHint } from '../ui/TitleHint'
import type { Unit } from '../../types'

const ALL = ''

type AreaRow = { key: string; name: string }

function compareUnits(a: Unit, b: Unit, buildingOrder: Map<string, number>) {
  const bo =
    (buildingOrder.get(a.buildingId) ?? 999) - (buildingOrder.get(b.buildingId) ?? 999)
  if (bo !== 0) return bo
  const fo = floorSortKey(b.floor) - floorSortKey(a.floor)
  if (fo !== 0) return fo
  return a.code.localeCompare(b.code, 'zh-Hant', { numeric: true })
}

export function BatchAreasApplySheet({ onClose }: { onClose: () => void }) {
  const buildings = useProjectStore((s) => s.buildings)
  const units = useProjectStore((s) => s.units)
  const projectAreas = useProjectStore((s) => s.areas)
  const applyAreasToUnits = useProjectStore((s) => s.applyAreasToUnits)
  const resetUnitsAreasToProjectDefault = useProjectStore(
    (s) => s.resetUnitsAreasToProjectDefault,
  )
  const role = useCurrentRole()
  const user = useCurrentUser()
  const canEdit = role === 'admin' || role === 'inspector' || Boolean(user?.systemAdmin)

  const [buildingId, setBuildingId] = useState(ALL)
  const [floor, setFloor] = useState(ALL)
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [overwriteCustomized, setOverwriteCustomized] = useState(false)
  const [rows, setRows] = useState<AreaRow[]>(() =>
    (projectAreas.length ? projectAreas : DEFAULT_AREAS).map((name) => ({
      key: createId('barea'),
      name,
    })),
  )
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const activeBuildings = useMemo(
    () =>
      [...buildings]
        .filter((b) => b.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [buildings],
  )
  const buildingOrder = useMemo(
    () => new Map(activeBuildings.map((b, i) => [b.id, i])),
    [activeBuildings],
  )
  const buildingOptions = useMemo(
    () => [
      { value: ALL, label: '全部棟別' },
      ...activeBuildings.map((b) => ({ value: b.id, label: b.name })),
    ],
    [activeBuildings],
  )
  const floorOptions = useMemo(() => {
    const source = buildingId
      ? activeBuildings.filter((b) => b.id === buildingId)
      : activeBuildings
    const floors = sortFloorsDesc([...new Set(source.flatMap((b) => b.floors))])
    return [{ value: ALL, label: '全部樓層' }, ...floors.map((f) => ({ value: f, label: f }))]
  }, [activeBuildings, buildingId])
  const effectiveFloor = floorOptions.some((o) => o.value === floor) ? floor : ALL

  const filteredUnits = useMemo(() => {
    return units
      .filter((u) => u.active)
      .filter((u) => (buildingId ? u.buildingId === buildingId : true))
      .filter((u) => (effectiveFloor ? u.floor === effectiveFloor : true))
      .sort((a, b) => compareUnits(a, b, buildingOrder))
  }, [units, buildingId, effectiveFloor, buildingOrder])

  const selectedIds = filteredUnits.filter((u) => selected[u.id]).map((u) => u.id)
  const customizedInFilter = filteredUnits.filter((u) => isUnitAreasCustomized(u)).length
  const selectedCustomized = filteredUnits.filter(
    (u) => selected[u.id] && isUnitAreasCustomized(u),
  ).length

  function toggleAll(on: boolean) {
    setSelected((prev) => {
      const next = { ...prev }
      for (const u of filteredUnits) next[u.id] = on
      return next
    })
  }

  function addRow() {
    const name = normalizeAreaName(draft)
    if (!name) {
      setError('請輸入區域名稱')
      return
    }
    if (rows.some((r) => normalizeAreaName(r.name) === name)) {
      setError('此區域名稱已存在')
      return
    }
    setRows((prev) => [...prev, { key: createId('barea'), name }])
    setDraft('')
    setError('')
  }

  function loadFromProjectDefault() {
    const names = projectAreas.length ? projectAreas : DEFAULT_AREAS
    setRows(names.map((name) => ({ key: createId('barea'), name })))
    setMsg('已載入專案預設區域（尚未套用到戶別）')
    setError('')
  }

  function handleApply() {
    if (!canEdit) {
      setError('目前為僅查看權限，無法修改')
      return
    }
    const names = sanitizeAreaList(rows.map((r) => r.name))
    if (names.length === 0) {
      setError('至少需要一個查驗區域')
      return
    }
    if (selectedIds.length === 0) {
      setError('請先勾選要套用的戶別')
      return
    }
    if (
      overwriteCustomized &&
      selectedCustomized > 0 &&
      !confirm(
        `將覆蓋 ${selectedCustomized} 戶已手動自訂的區域清單。確定繼續？`,
      )
    ) {
      return
    }
    const result = applyAreasToUnits(selectedIds, names, { overwriteCustomized })
    if (!result.ok) {
      setError(result.error || '套用失敗')
      setMsg('')
      return
    }
    setError('')
    setMsg(
      `已套用 ${result.applied} 戶` +
        (result.skipped ? `，略過已自訂 ${result.skipped} 戶` : ''),
    )
  }

  function handleReset() {
    if (!canEdit) {
      setError('目前為僅查看權限，無法修改')
      return
    }
    if (selectedIds.length === 0) {
      setError('請先勾選要還原的戶別')
      return
    }
    if (
      !confirm(
        `將把選取的 ${selectedIds.length} 戶還原為「專案預設區域」（清除該戶自訂清單）。確定？`,
      )
    ) {
      return
    }
    const result = resetUnitsAreasToProjectDefault(selectedIds)
    if (!result.ok) {
      setError(result.error || '還原失敗')
      setMsg('')
      return
    }
    setError('')
    setMsg(result.reset ? `已還原 ${result.reset} 戶為專案預設` : '選取戶別本來就沒有自訂')
  }

  return (
    <Modal onClose={onClose} aria-label="批量套用查驗區域" variant="bottom">
      <TitleHint
        as="h3"
        className="serif"
        style={{ margin: '0 0 6px', fontSize: 20 }}
        hint="可對多棟／多層一次套用客廳、臥室1 等區域清單。已手動自訂的戶別預設不會被覆蓋；必要時可勾選覆蓋，或還原為專案預設。"
      >
        批量套用查驗區域
      </TitleHint>
      <p
        style={{
          margin: '0 0 12px',
          color: 'var(--ink-soft)',
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        篩選內 {filteredUnits.length} 戶 · 已自訂 {customizedInFilter} 戶 · 已勾選{' '}
        {selectedIds.length} 戶
      </p>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginBottom: 10,
        }}
      >
        <GlassSelect
          label="棟別"
          value={buildingId}
          options={buildingOptions}
          aria-label="篩選棟別"
          onChange={(value) => {
            setBuildingId(value)
            setFloor(ALL)
          }}
        />
        <GlassSelect
          label="樓層"
          value={effectiveFloor}
          options={floorOptions}
          aria-label="篩選樓層"
          onChange={setFloor}
        />
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 36 }} onClick={() => toggleAll(true)}>
          全選篩選結果
        </button>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 36 }} onClick={() => toggleAll(false)}>
          清除勾選
        </button>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 36 }} onClick={loadFromProjectDefault}>
          載入專案預設清單
        </button>
      </div>

      <div
        style={{
          display: 'grid',
          gap: 8,
          maxHeight: '22vh',
          overflow: 'auto',
          marginBottom: 12,
          paddingRight: 2,
        }}
      >
        {filteredUnits.length === 0 ? (
          <div className="glass" style={{ padding: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
            此篩選條件下沒有戶別
          </div>
        ) : (
          filteredUnits.map((unit) => {
            const customized = isUnitAreasCustomized(unit)
            const areas = getUnitAreas(unit, projectAreas)
            return (
              <label
                key={unit.id}
                className="glass"
                style={{
                  padding: '10px 12px',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'flex-start',
                  cursor: 'pointer',
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(selected[unit.id])}
                  onChange={(e) =>
                    setSelected((prev) => ({ ...prev, [unit.id]: e.target.checked }))
                  }
                  style={{ marginTop: 3, width: 18, height: 18 }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 800 }}>
                      {unit.buildingName} {unit.floor} {unit.code}戶
                    </span>
                    <span
                      className="chip"
                      style={{
                        minHeight: 26,
                        fontSize: 11,
                        background: customized
                          ? 'rgba(174,76,59,0.12)'
                          : 'rgba(45,90,61,0.12)',
                        color: customized ? 'var(--terracotta)' : 'var(--green-deep)',
                      }}
                    >
                      {customized ? '已自訂（優先保留）' : '沿用預設'}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 4,
                      fontSize: 12,
                      fontWeight: 600,
                      color: 'var(--ink-soft)',
                      lineHeight: 1.4,
                    }}
                  >
                    {areas.join('、')}
                  </div>
                </div>
              </label>
            )
          })
        )}
      </div>

      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>要套用的區域清單</div>
      <div style={{ display: 'grid', gap: 8, maxHeight: '22vh', overflow: 'auto', paddingRight: 2 }}>
        {rows.map((row, index) => (
          <div
            key={row.key}
            className="glass"
            style={{ padding: '8px 10px', display: 'flex', gap: 8, alignItems: 'center' }}
          >
            <input
              value={row.name}
              disabled={!canEdit}
              onChange={(e) => {
                const value = e.target.value
                setRows((prev) =>
                  prev.map((r, i) => (i === index ? { ...r, name: value } : r)),
                )
              }}
              style={{
                flex: 1,
                border: '1px solid rgba(34,41,31,0.12)',
                borderRadius: 10,
                padding: '8px 10px',
                fontWeight: 700,
              }}
            />
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 36, minWidth: 36, padding: 0, color: 'var(--terracotta)' }}
              disabled={!canEdit || rows.length <= 1}
              onClick={() => setRows((prev) => prev.filter((_, i) => i !== index))}
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {canEdit && (
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                addRow()
              }
            }}
            placeholder="新增區域，例如 臥室2"
            style={{
              flex: 1,
              border: '1px solid rgba(34,41,31,0.12)',
              borderRadius: 12,
              padding: '10px 12px',
              fontWeight: 600,
            }}
          />
          <button type="button" className="btn btn-ghost" onClick={addRow}>
            <Plus size={16} /> 新增
          </button>
        </div>
      )}

      <label
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
          marginTop: 12,
          fontSize: 13,
          fontWeight: 700,
          color: 'var(--ink-soft)',
          cursor: canEdit ? 'pointer' : 'default',
        }}
      >
        <input
          type="checkbox"
          checked={overwriteCustomized}
          disabled={!canEdit}
          onChange={(e) => setOverwriteCustomized(e.target.checked)}
          style={{ marginTop: 2, width: 18, height: 18 }}
        />
        <span>
          覆蓋已自訂戶別（預設不勾：手動改過的區域優先保留，避免誤改）
        </span>
      </label>

      {error && (
        <div style={{ color: 'var(--terracotta)', fontWeight: 700, fontSize: 13, marginTop: 10 }}>
          {error}
        </div>
      )}
      {msg && (
        <div style={{ color: 'var(--green-deep)', fontWeight: 700, fontSize: 13, marginTop: 10 }}>
          {msg}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1, minWidth: 140 }}
          disabled={!canEdit}
          onClick={handleApply}
        >
          套用到勾選戶別
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minWidth: 120, color: 'var(--terracotta)', fontWeight: 800 }}
          disabled={!canEdit}
          onClick={handleReset}
        >
          還原專案預設
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          關閉
        </button>
      </div>
    </Modal>
  )
}
