import { useMemo, useState } from 'react'
import { GripVertical, Plus, Trash2 } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { getUnitAreas, normalizeAreaName } from '../../lib/areas'
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
  const resetUnitAreasToProjectDefault = useProjectStore(
    (s) => s.resetUnitAreasToProjectDefault,
  )
  const role = useCurrentRole()
  const user = useCurrentUser()
  const canEdit = role === 'admin' || role === 'inspector' || Boolean(user?.systemAdmin)

  const unit = units.find((u) => u.id === unitId)
  const [rows, setRows] = useState<AreaRow[]>(() => {
    const names = getUnitAreas(
      useProjectStore.getState().units.find((u) => u.id === unitId),
      useProjectStore.getState().areas,
    )
    return names.map((name) => ({
      key: createId('area'),
      name,
      origin: name,
    }))
  })
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)

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

  const usedAreas = useMemo(() => {
    const map = new Map<string, number>()
    for (const d of defects) {
      if (d.unitId !== unitId || d.status === 'voided') continue
      map.set(d.area, (map.get(d.area) ?? 0) + 1)
    }
    return map
  }, [defects, unitId])

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
    <Modal onClose={onClose} aria-label="編輯查驗區域" variant="bottom">
      <TitleHint
        as="h3"
        className="serif"
        style={{ margin: '0 0 6px', fontSize: 20 }}
        hint="每戶可自訂不同區域名稱與編號（例如臥室1／臥室2）。修改名稱會同步更新此戶既有缺失的區域欄位。"
      >
        {unit.code}戶・查驗區域
      </TitleHint>
      <p style={{ margin: '0 0 14px', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600 }}>
        {unit.buildingName} {unit.floor} · {unit.areas?.length ? '已自訂此戶區域' : '目前使用專案預設，儲存後將獨立套用此戶'}
      </p>

      {!canEdit && (
        <div style={{ color: 'var(--terracotta)', fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
          目前為僅查看權限，無法增刪改區域。
        </div>
      )}

      <div style={{ display: 'grid', gap: 8, maxHeight: '46vh', overflow: 'auto', paddingRight: 2 }}>
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
            if (!confirm('確定還原為專案預設區域？此戶自訂名稱會被覆蓋。')) return
            const result = resetUnitAreasToProjectDefault(unitId)
            if (!result.ok) {
              setError(result.error || '還原失敗')
              return
            }
            const names = getUnitAreas(
              { ...unit, areas: undefined },
              useProjectStore.getState().areas,
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
