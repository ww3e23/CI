import { useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { DEFAULT_AREAS, normalizeAreaName } from '../../lib/areas'
import { createId } from '../../lib/id'
import { Modal } from '../ui/Modal'
import { TitleHint } from '../ui/TitleHint'
import { useCurrentRole, useCurrentUser } from '../../store/useAuthStore'

type AreaRow = { key: string; name: string }

export function ProjectAreasEditor({ onClose }: { onClose: () => void }) {
  const projectAreas = useProjectStore((s) => s.areas)
  const setProjectAreas = useProjectStore((s) => s.setProjectAreas)
  const role = useCurrentRole()
  const user = useCurrentUser()
  const canEdit = role === 'admin' || role === 'inspector' || Boolean(user?.systemAdmin)

  const [rows, setRows] = useState<AreaRow[]>(() =>
    (projectAreas.length ? projectAreas : DEFAULT_AREAS).map((name) => ({
      key: createId('parea'),
      name,
    })),
  )
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')

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
    setRows((prev) => [...prev, { key: createId('parea'), name }])
    setDraft('')
    setError('')
  }

  function handleSave() {
    if (!canEdit) {
      setError('目前為僅查看權限，無法修改')
      return
    }
    const names = rows.map((r) => normalizeAreaName(r.name)).filter(Boolean)
    if (new Set(names).size !== names.length) {
      setError('區域名稱不可重複')
      return
    }
    const result = setProjectAreas(names)
    if (!result.ok) {
      setError(result.error || '儲存失敗')
      return
    }
    onClose()
  }

  return (
    <Modal onClose={onClose} aria-label="專案預設查驗區域" variant="bottom">
      <TitleHint
        as="h3"
        className="serif"
        style={{ margin: '0 0 8px', fontSize: 20 }}
        hint="這是新戶／尚未自訂戶別時的預設區域清單。各戶可在首頁另行增刪改，互不影響。"
      >
        專案預設查驗區域
      </TitleHint>

      <div style={{ display: 'grid', gap: 8, maxHeight: '46vh', overflow: 'auto' }}>
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
            placeholder="新增預設區域"
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

      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          type="button"
          className="btn btn-primary"
          style={{ flex: 1 }}
          disabled={!canEdit}
          onClick={handleSave}
        >
          儲存預設
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          取消
        </button>
      </div>
    </Modal>
  )
}
