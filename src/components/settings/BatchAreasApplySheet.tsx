import { useMemo, useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { useCurrentRole, useCurrentUser } from '../../store/useAuthStore'
import {
  DEFAULT_AREAS,
  isUnitAreasCustomized,
  isUnitFollowingTemplate,
  normalizeAreaName,
  sanitizeAreaList,
} from '../../lib/areas'
import { sortFloorsDesc } from '../../lib/floors'
import { createId } from '../../lib/id'
import { Modal } from '../ui/Modal'
import { TitleHint } from '../ui/TitleHint'
import type { AreaTemplate, BuildingRule, Unit } from '../../types'

type AreaRow = { key: string; name: string }

function unitKey(buildingId: string, floor: string, code: string) {
  return `${buildingId}|${floor}|${code}`
}

export function BatchAreasApplySheet({ onClose }: { onClose: () => void }) {
  const buildings = useProjectStore((s) => s.buildings)
  const units = useProjectStore((s) => s.units)
  const projectAreas = useProjectStore((s) => s.areas)
  const areaTemplates = useProjectStore((s) => s.areaTemplates) ?? []
  const saveAreaTemplate = useProjectStore((s) => s.saveAreaTemplate)
  const deleteAreaTemplate = useProjectStore((s) => s.deleteAreaTemplate)
  const applyAreaTemplateToUnits = useProjectStore((s) => s.applyAreaTemplateToUnits)
  const resetUnitsAreasToProjectDefault = useProjectStore(
    (s) => s.resetUnitsAreasToProjectDefault,
  )
  const role = useCurrentRole()
  const user = useCurrentUser()
  const canEdit = role === 'admin' || role === 'inspector' || Boolean(user?.systemAdmin)

  const activeBuildings = useMemo(
    () =>
      [...buildings]
        .filter((b) => b.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [buildings],
  )

  const unitByKey = useMemo(() => {
    const m = new Map<string, Unit>()
    for (const u of units) {
      if (!u.active) continue
      m.set(unitKey(u.buildingId, u.floor, u.code), u)
    }
    return m
  }, [units])

  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(
    areaTemplates[0]?.id ?? null,
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editorOpen, setEditorOpen] = useState(false)
  const [tplName, setTplName] = useState('')
  const [rows, setRows] = useState<AreaRow[]>([])
  const [draft, setDraft] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const [buildingId, setBuildingId] = useState(activeBuildings[0]?.id ?? '')
  const [selected, setSelected] = useState<Record<string, boolean>>({})
  const [overwriteCustomized, setOverwriteCustomized] = useState(false)
  const [error, setError] = useState('')
  const [msg, setMsg] = useState('')

  const building =
    activeBuildings.find((b) => b.id === buildingId) ?? activeBuildings[0] ?? null
  const floors = useMemo(
    () => (building ? sortFloorsDesc(building.floors) : []),
    [building],
  )
  const unitCodes = building?.unitCodes ?? []

  const selectedTemplate =
    areaTemplates.find((t) => t.id === selectedTemplateId) ?? null

  const selectedIds = useMemo(() => {
    const ids: string[] = []
    for (const [key, on] of Object.entries(selected)) {
      if (!on) continue
      const u = unitByKey.get(key)
      if (u) ids.push(u.id)
    }
    return ids
  }, [selected, unitByKey])

  const selectedCustomized = selectedIds.filter((id) =>
    isUnitAreasCustomized(units.find((u) => u.id === id)),
  ).length

  function openCreateEditor() {
    setEditingId(null)
    setTplName('')
    setRows(
      (projectAreas.length ? projectAreas : DEFAULT_AREAS).map((name) => ({
        key: createId('barea'),
        name,
      })),
    )
    setDraft('')
    setError('')
    setEditorOpen(true)
  }

  function openEditEditor(tpl: AreaTemplate) {
    setEditingId(tpl.id)
    setTplName(tpl.name)
    setRows(tpl.areas.map((name) => ({ key: createId('barea'), name })))
    setDraft('')
    setError('')
    setEditorOpen(true)
  }

  function moveRow(from: number, to: number) {
    if (to < 0 || to >= rows.length || from === to) return
    setRows((prev) => {
      const next = [...prev]
      const [item] = next.splice(from, 1)
      next.splice(to, 0, item)
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

  function handleSaveTemplate() {
    if (!canEdit) {
      setError('目前為僅查看權限，無法修改')
      return
    }
    const areas = sanitizeAreaList(rows.map((r) => r.name))
    if (areas.length === 0) {
      setError('至少需要一個查驗區域')
      return
    }
    const result = saveAreaTemplate({
      id: editingId ?? undefined,
      name: tplName,
      areas,
    })
    if (!result.ok || !result.template) {
      setError(result.error || '儲存失敗')
      return
    }
    setSelectedTemplateId(result.template.id)
    setEditorOpen(false)
    setMsg(`已儲存範本 ${result.template.code} ${result.template.name}`)
    setError('')
  }

  function toggleCell(key: string, unit: Unit | undefined) {
    if (!unit) return
    setSelected((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  function toggleFloor(b: BuildingRule, floor: string) {
    const keys = b.unitCodes
      .map((code) => unitKey(b.id, floor, code))
      .filter((k) => unitByKey.has(k))
    if (keys.length === 0) return
    const allOn = keys.every((k) => selected[k])
    setSelected((prev) => {
      const next = { ...prev }
      for (const k of keys) next[k] = !allOn
      return next
    })
  }

  function toggleColumn(b: BuildingRule, code: string) {
    const keys = floors
      .map((floor) => unitKey(b.id, floor, code))
      .filter((k) => unitByKey.has(k))
    if (keys.length === 0) return
    const allOn = keys.every((k) => selected[k])
    setSelected((prev) => {
      const next = { ...prev }
      for (const k of keys) next[k] = !allOn
      return next
    })
  }

  function selectWholeBuilding(b: BuildingRule) {
    const keys: string[] = []
    for (const floor of b.floors) {
      for (const code of b.unitCodes) {
        const k = unitKey(b.id, floor, code)
        if (unitByKey.has(k)) keys.push(k)
      }
    }
    const allOn = keys.length > 0 && keys.every((k) => selected[k])
    setSelected((prev) => {
      const next = { ...prev }
      for (const k of keys) next[k] = !allOn
      return next
    })
  }

  function handleApply() {
    if (!canEdit) {
      setError('目前為僅查看權限，無法修改')
      return
    }
    if (!selectedTemplate) {
      setError('請先選擇格局範本')
      return
    }
    if (selectedIds.length === 0) {
      setError('請在矩陣勾選要套用的戶別')
      return
    }
    if (
      overwriteCustomized &&
      selectedCustomized > 0 &&
      !confirm(`將覆蓋 ${selectedCustomized} 戶已手動自訂的區域。確定繼續？`)
    ) {
      return
    }
    const result = applyAreaTemplateToUnits(selectedIds, selectedTemplate.id, {
      overwriteCustomized,
    })
    if (!result.ok) {
      setError(result.error || '套用失敗')
      setMsg('')
      return
    }
    setSelected({})
    setError('')
    setMsg(
      `已綁定 ${selectedTemplate.code}：${result.applied} 戶（跟著範本，不算自訂）` +
        (result.skipped ? `，略過 ${result.skipped} 戶` : ''),
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
        `將把選取的 ${selectedIds.length} 戶還原為專案預設區域。確定？`,
      )
    ) {
      return
    }
    const result = resetUnitsAreasToProjectDefault(selectedIds)
    if (!result.ok) {
      setError(result.error || '還原失敗')
      return
    }
    setSelected({})
    setError('')
    setMsg(result.reset ? `已還原 ${result.reset} 戶` : '選取戶別本來就沒有自訂')
  }

  return (
    <Modal onClose={onClose} aria-label="格局區域範本" variant="bottom">
      <TitleHint
        as="h3"
        className="serif"
        style={{ margin: '0 0 6px', fontSize: 20 }}
        hint="套用範本是「綁定跟著走」，不是複製成自訂。橘色「自」只代表該戶曾手動改過區域。"
      >
        格局區域範本
      </TitleHint>
      <p style={{ margin: '0 0 12px', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600 }}>
        已選 {selectedIds.length} 戶
        {selectedTemplate ? ` · 套用 ${selectedTemplate.code}` : ''}
      </p>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ minHeight: 36 }}
          disabled={!canEdit}
          onClick={openCreateEditor}
        >
          <Plus size={14} /> 新增範本
        </button>
        {selectedTemplate && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 36 }}
            disabled={!canEdit}
            onClick={() => openEditEditor(selectedTemplate)}
          >
            編輯此範本
          </button>
        )}
        {selectedTemplate && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 36, color: 'var(--terracotta)', fontWeight: 800 }}
            disabled={!canEdit}
            onClick={() => {
              if (!confirm(`刪除範本 ${selectedTemplate.code}？不會改已套用過的戶別。`)) return
              const removedId = selectedTemplate.id
              const removedCode = selectedTemplate.code
              const r = deleteAreaTemplate(removedId)
              if (!r.ok) {
                setError(r.error || '刪除失敗')
                return
              }
              const next = areaTemplates.filter((t) => t.id !== removedId)
              setSelectedTemplateId(next[0]?.id ?? null)
              setMsg(`已刪除 ${removedCode}`)
            }}
          >
            刪除範本
          </button>
        )}
      </div>

      {areaTemplates.length === 0 ? (
        <div className="glass" style={{ padding: 14, marginBottom: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
          尚無範本。請先「新增範本」設定一組區域（可拖曳排序），儲存後再矩陣套用。
        </div>
      ) : (
        <div className="chip-row" style={{ marginBottom: 12, flexWrap: 'wrap' }}>
          {areaTemplates.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`chip ${selectedTemplateId === t.id ? 'on' : ''}`}
              onClick={() => setSelectedTemplateId(t.id)}
              title={t.areas.join('、')}
            >
              {t.code} {t.name}
            </button>
          ))}
        </div>
      )}

      {selectedTemplate && (
        <div
          className="glass"
          style={{
            padding: 10,
            marginBottom: 12,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--ink-soft)',
            lineHeight: 1.45,
          }}
        >
          <span style={{ fontWeight: 800, color: 'var(--ink)' }}>
            {selectedTemplate.code} {selectedTemplate.name}
          </span>
          <br />
          {selectedTemplate.areas.join(' → ')}
        </div>
      )}

      {activeBuildings.length > 0 && (
        <>
          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>勾選套用戶別</div>
          <div className="chip-row" style={{ marginBottom: 8, flexWrap: 'wrap' }}>
            {activeBuildings.map((b) => (
              <button
                key={b.id}
                type="button"
                className={`chip ${building?.id === b.id ? 'on' : ''}`}
                onClick={() => setBuildingId(b.id)}
              >
                {b.name}
              </button>
            ))}
          </div>

          {building && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: 34 }}
                onClick={() => selectWholeBuilding(building)}
              >
                全選／取消此棟
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: 34 }}
                onClick={() => setSelected({})}
              >
                清除勾選
              </button>
            </div>
          )}

          {building && (
            <div className="glass matrix-scroll" style={{ marginBottom: 12, maxHeight: '36vh' }}>
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th className="floor-cell">樓層</th>
                    {unitCodes.map((code) => (
                      <th key={code}>
                        <button
                          type="button"
                          className="link"
                          style={{ fontSize: 11, fontWeight: 800 }}
                          onClick={() => toggleColumn(building, code)}
                          title={`全選／取消 ${code}`}
                        >
                          {code}
                        </button>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {floors.map((floor) => (
                    <tr key={floor}>
                      <td className="floor-cell">
                        <button
                          type="button"
                          className="link"
                          style={{ fontSize: 11, fontWeight: 800 }}
                          onClick={() => toggleFloor(building, floor)}
                          title={`全選／取消 ${floor}`}
                        >
                          {floor}
                        </button>
                      </td>
                      {unitCodes.map((code) => {
                        const key = unitKey(building.id, floor, code)
                        const unit = unitByKey.get(key)
                        const on = Boolean(selected[key])
                        const customized = unit ? isUnitAreasCustomized(unit) : false
                        const following = unit ? isUnitFollowingTemplate(unit) : false
                        const sameTpl =
                          following && unit?.areaTemplateId === selectedTemplateId
                        const otherTpl = following && !sameTpl
                        const tplCode = following
                          ? areaTemplates.find((t) => t.id === unit?.areaTemplateId)?.code
                          : ''
                        const cls = !unit
                          ? 'na'
                          : on
                            ? 'done'
                            : customized
                              ? 'defect'
                              : following
                                ? 'tpl'
                                : 'empty'
                        const label = on
                          ? '✓'
                          : customized
                            ? '自'
                            : sameTpl
                              ? '範'
                              : otherTpl
                                ? (tplCode ?? '範')
                                : ''
                        return (
                          <td key={key}>
                            <button
                              type="button"
                              className={`matrix-cell ${cls}`}
                              disabled={!unit}
                              title={
                                unit
                                  ? `${building.name} ${floor} ${code}${
                                      customized
                                        ? '｜手動自訂'
                                        : sameTpl
                                          ? `｜跟隨 ${selectedTemplate?.code ?? '範本'}`
                                          : otherTpl
                                            ? `｜跟隨 ${tplCode}`
                                            : '｜專案預設'
                                    }${on ? '｜已勾選' : ''}`
                                  : '不適用'
                              }
                              onClick={() => toggleCell(key, unit)}
                            >
                              {label}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-soft)', marginBottom: 10 }}>
            綠勾＝勾選中（套用／還原後會自動清除）　藍「範」＝已綁目前範本　橘「自」＝手動改過　空白＝專案預設
          </div>
        </>
      )}

      <label
        style={{
          display: 'flex',
          gap: 8,
          alignItems: 'flex-start',
          marginBottom: 10,
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
        <span>覆蓋手動自訂戶別（預設不勾；已綁範本會跟著更新，不算自訂）</span>
      </label>

      {error && (
        <div style={{ color: 'var(--terracotta)', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
          {error}
        </div>
      )}
      {msg && (
        <div style={{ color: 'var(--green-deep)', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
          {msg}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1, minWidth: 140 }}
          disabled={!canEdit || !selectedTemplate}
          onClick={handleApply}
        >
          套用選取範本
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          style={{ minWidth: 110, color: 'var(--terracotta)', fontWeight: 800 }}
          disabled={!canEdit}
          onClick={handleReset}
        >
          還原預設
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          關閉
        </button>
      </div>

      {editorOpen && (
        <Modal
          onClose={() => setEditorOpen(false)}
          aria-label={editingId ? '編輯格局範本' : '新增格局範本'}
          variant="bottom"
        >
          <TitleHint
            as="h3"
            className="serif"
            style={{ margin: '0 0 8px', fontSize: 18 }}
            hint="拖曳左側把手可調整區域順序。儲存後系統會自動編碼（如 G01）。"
          >
            {editingId ? '編輯格局範本' : '新增格局範本'}
          </TitleHint>
          {!editingId && (
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)' }}>
              儲存後自動編碼（G01、G02…）
            </p>
          )}
          {editingId && selectedTemplate?.id === editingId && (
            <p style={{ margin: '0 0 10px', fontSize: 12, fontWeight: 800, color: 'var(--green-deep)' }}>
              編碼 {selectedTemplate.code}（固定不變）
            </p>
          )}

          <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 6 }}>
            範本名稱
          </label>
          <input
            value={tplName}
            disabled={!canEdit}
            onChange={(e) => setTplName(e.target.value)}
            placeholder="例如：三房兩廳、A戶型"
            style={{
              width: '100%',
              border: '1px solid rgba(34,41,31,0.12)',
              borderRadius: 12,
              padding: '10px 12px',
              fontWeight: 700,
              marginBottom: 12,
            }}
          />

          <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>區域順序（可拖曳）</div>
          <div style={{ display: 'grid', gap: 8, maxHeight: '40vh', overflow: 'auto', paddingRight: 2 }}>
            {rows.map((row, index) => (
              <div
                key={row.key}
                className="glass"
                draggable={canEdit}
                onDragStart={() => setDragIndex(index)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex === null) return
                  moveRow(dragIndex, index)
                  setDragIndex(null)
                }}
                style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <span
                  style={{
                    color: 'var(--stone)',
                    display: 'inline-flex',
                    cursor: canEdit ? 'grab' : 'default',
                  }}
                >
                  <GripVertical size={16} />
                </span>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--ink-soft)', width: 20 }}>
                  {index + 1}
                </span>
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

          {error && (
            <div style={{ color: 'var(--terracotta)', fontWeight: 700, fontSize: 13, marginTop: 10 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ flex: 1, minWidth: 120 }}
              disabled={!canEdit}
              onClick={handleSaveTemplate}
            >
              儲存範本
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setEditorOpen(false)}>
              取消
            </button>
          </div>
        </Modal>
      )}
    </Modal>
  )
}
