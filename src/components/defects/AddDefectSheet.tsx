import { useMemo, useState } from 'react'
import { Lock } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { useCurrentRole, useCurrentUser } from '../../store/useAuthStore'
import { cloudReady } from '../../services/cloudSync'
import { AnnotatePlanModal } from './AnnotatePlanModal'

export function AddDefectSheet({
  onClose,
  categoryId,
  checklistItemId,
}: {
  onClose: () => void
  categoryId?: string
  checklistItemId?: string
}) {
  const units = useProjectStore((s) => s.units)
  const categories = useProjectStore((s) => s.categories)
  const areas = useProjectStore((s) => s.areas)
  const currentUnitId = useProjectStore((s) => s.currentUnitId)
  const addDefect = useProjectStore((s) => s.addDefect)
  const role = useCurrentRole()
  const user = useCurrentUser()

  const unit = units.find((u) => u.id === currentUnitId) ?? units.find((u) => u.active)
  const activeCats = categories.filter((c) => c.active)
  const [catId, setCatId] = useState(categoryId ?? activeCats[0]?.id ?? '')
  const cat = activeCats.find((c) => c.id === catId) ?? activeCats[0]
  const [area, setArea] = useState(areas[1] ?? areas[0] ?? '客廳')
  const [description, setDescription] = useState('')
  const [planPhoto, setPlanPhoto] = useState<string | undefined>()
  const [planOriginal, setPlanOriginal] = useState<string | undefined>()
  const [photos, setPhotos] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [annotateOpen, setAnnotateOpen] = useState(false)
  const [syncMsg, setSyncMsg] = useState(
    cloudReady() ? '儲存後將同步至雲端' : '示範模式：資料存在本機，尚未接 Firebase',
  )

  const nextNumber = unit?.nextDefectNumber ?? 1
  const canEdit = role === 'admin' || role === 'inspector' || Boolean(user?.systemAdmin)

  const itemHint = useMemo(() => {
    if (!checklistItemId) return null
    return useProjectStore.getState().checklistItems.find((i) => i.id === checklistItemId)
  }, [checklistItemId])

  if (!unit || !cat) {
    return (
      <>
        <div className="sheet-backdrop" onClick={onClose} />
        <div className="sheet">
          <div className="sheet-handle" />
          <p>請先設定可查驗戶別。</p>
          <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
            關閉
          </button>
        </div>
      </>
    )
  }

  async function onPick(file: File | undefined, kind: 'plan' | 'photo') {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      const url = String(reader.result || '')
      if (!url) return
      if (kind === 'plan') {
        setPlanOriginal(url)
        setPlanPhoto(url)
      } else {
        setPhotos((prev) => [...prev, url].slice(0, 6))
      }
    }
    reader.readAsDataURL(file)
  }

  async function handleSave() {
    if (!canEdit) {
      setError('目前角色為僅查看，無法新增缺失')
      return
    }
    if (!unit || !cat) {
      setError('找不到目前戶別或大項')
      return
    }

    const text =
      description.trim() ||
      `${cat.name}｜${area}${itemHint ? `｜${itemHint.description}` : ''}`

    setSaving(true)
    setError('')
    setSyncMsg(cloudReady() ? '正在同步…' : '正在儲存到本機…')

    try {
      const d = await addDefect({
        unitId: unit.id,
        categoryId: cat.id,
        categoryName: cat.name,
        checklistItemId,
        area,
        description: text,
        planPhotoDataUrl: planPhoto,
        photoDataUrls: photos,
      })
      setSaving(false)
      if (!d) {
        setError('儲存失敗，請確認已選擇可查驗戶別後再試')
        setSyncMsg('儲存失敗')
        return
      }
      if (d.syncState === 'synced') setSyncMsg('已同步至雲端')
      else if (d.syncState === 'failed') setSyncMsg('同步失敗，資料已留在本機')
      else setSyncMsg('已儲存')
      // 稍等讓使用者看到提示
      window.setTimeout(() => onClose(), 280)
    } catch (e) {
      setSaving(false)
      setError(e instanceof Error ? e.message : '儲存時發生錯誤')
      setSyncMsg('儲存失敗')
    }
  }

  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-label="新增缺失">
        <div className="sheet-handle" />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <h3 className="serif" style={{ margin: 0, fontSize: 20 }}>新增缺失</h3>
          <span className="chip on" style={{ minHeight: 34 }}>
            <Lock size={14} /> 編號 #{nextNumber}
          </span>
        </div>
        <p style={{ margin: '8px 0 12px', color: 'var(--ink-soft)', fontSize: 13 }}>
          {unit.buildingName}・{unit.floor}・{unit.code}戶
          {itemHint ? `｜${itemHint.description}` : ''}
        </p>

        {!canEdit && (
          <div style={{ color: 'var(--terracotta)', fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
            目前為僅查看權限，無法新增缺失。請切換至查驗／管理角色的專案。
          </div>
        )}

        <div className="field">
          <label>查驗大項</label>
          <div className="chip-row">
            {activeCats.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip ${cat.id === c.id ? 'on' : ''}`}
                onClick={() => setCatId(c.id)}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>缺失區域</label>
          <div className="chip-row" style={{ flexWrap: 'nowrap', overflowX: 'auto' }}>
            {areas.map((a) => (
              <button
                key={a}
                type="button"
                className={`chip ${area === a ? 'on' : ''}`}
                onClick={() => setArea(a)}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>圖面位置照片（與現況照片分開）</label>
          <label className="upload-box" style={{ cursor: 'pointer' }}>
            {planPhoto ? '已選取圖面，點擊可更換' : '上傳／拍攝圖面位置'}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={(e) => onPick(e.target.files?.[0], 'plan')}
            />
          </label>
          {planPhoto && (
            <img className="photo-thumb" src={planPhoto} alt="圖面位置" style={{ marginTop: 8 }} />
          )}
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: 8, width: '100%' }}
            disabled={!planOriginal && !planPhoto}
            onClick={() => {
              if (!planOriginal && !planPhoto) {
                setError('請先上傳圖面，再進行標註')
                return
              }
              setAnnotateOpen(true)
            }}
          >
            {planPhoto && planOriginal && planPhoto !== planOriginal
              ? '重新標註位置'
              : '標註位置（全螢幕）'}
          </button>
        </div>

        <div className="field">
          <label>缺失現況照片</label>
          <div className="photo-row">
            {photos.map((p, i) => (
              <img key={i} className="photo-thumb" src={p} alt={`現況 ${i + 1}`} />
            ))}
            <label className="upload-box" style={{ width: 72, height: 72, cursor: 'pointer', padding: 0 }}>
              +
              <input
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => onPick(e.target.files?.[0], 'photo')}
              />
            </label>
          </div>
        </div>

        <div className="field">
          <label>補充說明（可留空，系統會帶入大項／區域）</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="例如：門鎖卡住，需施力才能開啟"
          />
        </div>

        {error && (
          <div style={{ color: 'var(--terracotta)', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
            {error}
          </div>
        )}

        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%' }}
          disabled={saving || !canEdit}
          onClick={handleSave}
        >
          {saving ? '儲存中…' : '儲存並同步雲端'}
        </button>
        <div className="sync-hint">{syncMsg}</div>
      </div>

      {annotateOpen && (planOriginal || planPhoto) && (
        <AnnotatePlanModal
          imageUrl={planOriginal || planPhoto!}
          onCancel={() => setAnnotateOpen(false)}
          onSave={(url) => {
            setPlanPhoto(url)
            setAnnotateOpen(false)
            setSyncMsg('圖面標註已套用，記得按下方儲存')
          }}
        />
      )}
    </>
  )
}
