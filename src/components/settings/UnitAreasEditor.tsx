import { useMemo, useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import {
  getUnitAreas,
  isUnitAreasCustomized,
  isUnitFollowingTemplate,
  normalizeAreaName,
} from '../../lib/areas'
import { fileToCompressedDataUrl } from '../../lib/imageCompress'
import { createId } from '../../lib/id'
import { Modal } from '../ui/Modal'
import { TitleHint } from '../ui/TitleHint'
import { useCurrentRole, useCurrentUser } from '../../store/useAuthStore'

type AreaRow = { key: string; name: string; origin?: string }

export function UnitAreasEditor({
  unitId,
  onClose,
}: {
  unitId: string
  onClose: () => void
}) {
  const units = useProjectStore((s) => s.units)
  const defects = useProjectStore((s) => s.defects)
  const setUnitAreas = useProjectStore((s) => s.setUnitAreas)
  const setUnitDefaultPlan = useProjectStore((s) => s.setUnitDefaultPlan)
  const resetUnitAreasToProjectDefault = useProjectStore(
    (s) => s.resetUnitAreasToProjectDefault,
  )
  const role = useCurrentRole()
  const user = useCurrentUser()
  const canEdit = role === 'admin' || role === 'inspector' || Boolean(user?.systemAdmin)

  const unit = units.find((u) => u.id === unitId)
  const areaTemplates = useProjectStore((s) => s.areaTemplates) ?? []
  const [rows, setRows] = useState<AreaRow[]>(() => {
    const st = useProjectStore.getState()
    const names = getUnitAreas(
      st.units.find((u) => u.id === unitId),
      st.areas,
      st.areaTemplates ?? [],
    )
    return names.map((name) => ({
      key: createId('area'),
      name,
      origin: name,
    }))
  })
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [planBusy, setPlanBusy] = useState(false)
  const [planMsg, setPlanMsg] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)

  const liveUnit = useProjectStore((s) => s.units.find((u) => u.id === unitId))
  const planUrl = liveUnit?.defaultPlanPhotoUrl

  const usedAreas = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of defects) {
      if (d.unitId !== unitId || d.status === 'voided') continue
      map.set(d.area, (map.get(d.area) ?? 0) + 1)
    }
    return map
  }, [defects, unitId])

  if (!unit) {
    return (
      <Modal onClose={onClose} aria-label="查驗區域">
        <p>找不到此戶別</p>
        <button type="button" className="btn btn-primary" style={{ marginTop: 12 }} onClick={onClose}>
          關閉
        </button>
      </Modal>
    )
  }

  async function onPickPlan(file: File | undefined) {
    if (!file || !canEdit) return
    setPlanBusy(true)
    setPlanMsg('')
    setError('')
    try {
      const dataUrl = await fileToCompressedDataUrl(file, {
        maxEdge: 2048,
        quality: 0.9,
      })
      const result = await setUnitDefaultPlan(unitId, dataUrl)
      if (!result.ok) {
        setError(result.error || '位置圖儲存失敗')
      } else {
        setPlanMsg('已設定此戶預設位置圖；新增缺失時會自動帶入')
      }
    } catch {
      setError('讀取圖片失敗，請換一張再試')
    } finally {
      setPlanBusy(false)
    }
  }

  async function clearPlan() {
    if (!canEdit) return
    if (!confirm('確定清除此戶預設位置圖？')) return
    setPlanBusy(true)
    setError('')
    const result = await setUnitDefaultPlan(unitId, null)
    setPlanBusy(false)
    if (!result.ok) setError(result.error || '清除失敗')
    else setPlanMsg('已清除預設位置圖')
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
    setRows((prev) => [...prev, { key: createId('area'), name }])
    setDraft('')
    setError('')
  }

  function removeRow(index: number) {
    const row = rows[index]
    if (!row) return
    const count = usedAreas.get(row.origin ?? row.name) ?? usedAreas.get(row.name) ?? 0
    if (count > 0) {
      if (
        !confirm(
          `「${row.name}」已有 ${count} 筆缺失紀錄。刪除區域後，舊缺失仍會保留原名稱，但新增時不再出現此選項。確定刪除？`,
        )
      ) {
        return
      }
    }
    setRows((prev) => prev.filter((_, i) => i !== index))
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

  function handleSave() {
    if (!canEdit) {
      setError('目前為僅查看權限，無法修改')
      return
    }
    const names = rows.map((r) => normalizeAreaName(r.name)).filter(Boolean)
    if (names.length === 0) {
      setError('至少需要保留一個查驗區域')
      return
    }
    const unique = new Set(names)
    if (unique.size !== names.length) {
      setError('區域名稱不可重複')
      return
    }

    const renames = rows
      .filter((r) => r.origin && normalizeAreaName(r.origin) !== normalizeAreaName(r.name))
      .map((r) => ({ from: r.origin!, to: normalizeAreaName(r.name) }))

    const result = setUnitAreas(unitId, names, renames)
    if (!result.ok) {
      setError(result.error || '儲存失敗')
      return
    }
    onClose()
  }

  return (
    <Modal onClose={onClose} aria-label="此戶設定" variant="bottom">
      <TitleHint
        as="h3"
        className="serif"
        style={{ margin: '0 0 6px', fontSize: 20 }}
        hint="可先為此戶上傳預設位置圖；之後新增缺失會自動帶入，方便直接標註。下方可自訂此戶查驗區域。"
      >
        {unit.code}戶・設定
      </TitleHint>
      <p style={{ margin: '0 0 14px', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600 }}>
        {unit.buildingName} {unit.floor}
      </p>

      <section className="glass" style={{ padding: 12, marginBottom: 14 }}>
        <div style={{ fontWeight: 800, fontSize: 14 }}>預設位置圖</div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', marginTop: 4, lineHeight: 1.45 }}>
          上傳此戶平面／位置圖後，新增缺失會自動帶出，可直接標註位置。
        </div>
        {planUrl && (
          <img
            src={planUrl}
            alt="預設位置圖"
            style={{
              width: '100%',
              maxHeight: 160,
              objectFit: 'contain',
              marginTop: 10,
              borderRadius: 12,
              background: 'rgba(255,252,246,0.9)',
            }}
          />
        )}
        <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
          <label
            className="btn btn-primary"
            style={{
              flex: 1,
              minWidth: 120,
              minHeight: 40,
              opacity: canEdit && !planBusy ? 1 : 0.55,
              pointerEvents: canEdit && !planBusy ? 'auto' : 'none',
            }}
          >
            {planBusy ? '處理中…' : planUrl ? '更換位置圖' : '上傳位置圖'}
            <input
              type="file"
              accept="image/*"
              hidden
              disabled={!canEdit || planBusy}
              onChange={(e) => {
                void onPickPlan(e.target.files?.[0])
                e.target.value = ''
              }}
            />
          </label>
          {planUrl && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 40, color: 'var(--terracotta)', fontWeight: 800 }}
              disabled={!canEdit || planBusy}
              onClick={() => void clearPlan()}
            >
              清除
            </button>
          )}
        </div>
        {planMsg && (
          <div style={{ marginTop: 8, fontSize: 12, fontWeight: 700, color: 'var(--green-deep)' }}>
            {planMsg}
          </div>
        )}
      </section>

      <div style={{ fontWeight: 800, fontSize: 14, marginBottom: 8 }}>查驗區域</div>
      <p style={{ margin: '0 0 10px', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 600 }}>
        {isUnitAreasCustomized(unit)
          ? '已手動自訂此戶區域（優先於範本／專案預設）'
          : isUnitFollowingTemplate(unit)
            ? `目前跟隨格局範本 ${areaTemplates.find((t) => t.id === unit.areaTemplateId)?.code ?? ''}；儲存後改為手動自訂`
            : '目前使用專案預設；儲存後改為手動自訂此戶'}
      </p>

      {!canEdit && (
        <div style={{ color: 'var(--terracotta)', fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
          目前為僅查看權限，無法增刪改。
        </div>
      )}

      <div style={{ display: 'grid', gap: 8, maxHeight: '36vh', overflow: 'auto', paddingRight: 2 }}>
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
            style={{
              padding: '8px 10px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <span style={{ color: 'var(--stone)', display: 'inline-flex', cursor: canEdit ? 'grab' : 'default' }}>
              <GripVertical size={16} />
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
                minWidth: 0,
                border: '1px solid rgba(34,41,31,0.12)',
                borderRadius: 10,
                padding: '8px 10px',
                fontWeight: 700,
                fontSize: 14,
                background: 'rgba(255,255,255,0.7)',
              }}
              aria-label={`區域 ${index + 1}`}
            />
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 36, minWidth: 36, padding: 0, color: 'var(--terracotta)' }}
              disabled={!canEdit || rows.length <= 1}
              onClick={() => removeRow(index)}
              aria-label="刪除區域"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ))}
      </div>

      {canEdit && (
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
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
          onClick={handleSave}
        >
          儲存此戶區域
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={!canEdit}
          onClick={() => {
            if (!confirm('確定還原為專案預設區域？將清除此戶手動自訂與範本綁定。')) return
            const result = resetUnitAreasToProjectDefault(unitId)
            if (!result.ok) {
              setError(result.error || '還原失敗')
              return
            }
            const names = getUnitAreas(
              { ...unit, areas: undefined, areaTemplateId: undefined },
              useProjectStore.getState().areas,
              useProjectStore.getState().areaTemplates ?? [],
            )
            setRows(
              names.map((name) => ({
                key: createId('area'),
                name,
                origin: name,
              })),
            )
          }}
        >
          還原預設
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          取消
        </button>
      </div>
    </Modal>
  )
}
