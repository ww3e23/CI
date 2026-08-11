import { useMemo, useState } from 'react'
import { Settings2 } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { useCurrentRole, useCurrentUser } from '../../store/useAuthStore'
import { fileToCompressedDataUrl } from '../../lib/imageCompress'
import { getUnitAreas } from '../../lib/areas'
import type { Defect } from '../../types'
import { resolveDefectRemark } from '../../lib/defectDisplay'
import { Modal } from '../ui/Modal'
import { AnnotatePlanModal } from './AnnotatePlanModal'
import { UnitAreasEditor } from '../settings/UnitAreasEditor'

export function EditDefectSheet({
  defect,
  onClose,
}: {
  defect: Defect
  onClose: () => void
}) {
  const categories = useProjectStore((s) => s.categories)
  const units = useProjectStore((s) => s.units)
  const projectAreas = useProjectStore((s) => s.areas)
  const areaTemplates = useProjectStore((s) => s.areaTemplates) ?? []
  const checklistItems = useProjectStore((s) => s.checklistItems)
  const updateDefect = useProjectStore((s) => s.updateDefect)
  const role = useCurrentRole()
  const user = useCurrentUser()
  const canEdit = role === 'admin' || role === 'inspector' || Boolean(user?.systemAdmin)

  const unit = units.find((u) => u.id === defect.unitId)
  const areas = useMemo(() => {
    const list = getUnitAreas(unit, projectAreas, areaTemplates)
    return list.includes(defect.area) ? list : [defect.area, ...list]
  }, [unit, projectAreas, areaTemplates, defect.area])

  const activeCats = categories.filter((c) => c.active)
  const [catId, setCatId] = useState(defect.categoryId)
  const cat = activeCats.find((c) => c.id === catId) ?? activeCats[0]
  const catItems = useMemo(
    () =>
      checklistItems
        .filter((i) => i.categoryId === cat?.id && i.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [checklistItems, cat?.id],
  )
  const [itemId, setItemId] = useState<string | null>(defect.checklistItemId ?? null)
  const [area, setArea] = useState(defect.area)
  const [description, setDescription] = useState(() =>
    resolveDefectRemark(defect, useProjectStore.getState().checklistItems),
  )
  const [planPhoto, setPlanPhoto] = useState<string | undefined>(defect.planPhotoDataUrl)
  const [planOriginal, setPlanOriginal] = useState<string | undefined>(defect.planPhotoDataUrl)
  const [photos, setPhotos] = useState<string[]>([...(defect.photoDataUrls ?? [])])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [annotateOpen, setAnnotateOpen] = useState(false)
  const [areasOpen, setAreasOpen] = useState(false)

  // 換大項時：若目前細項不屬於新大項，改選該大項第一筆（或清空）
  const effectiveItemId = useMemo(() => {
    if (itemId && catItems.some((i) => i.id === itemId)) return itemId
    return catItems[0]?.id ?? null
  }, [itemId, catItems])

  async function onPick(file: File | undefined, kind: 'plan' | 'photo') {
    if (!file) return
    try {
      const url = await fileToCompressedDataUrl(file, {
        maxEdge: kind === 'plan' ? 2048 : 1600,
        quality: kind === 'plan' ? 0.9 : 0.84,
      })
      if (kind === 'plan') {
        setPlanOriginal(url)
        setPlanPhoto(url)
      } else {
        setPhotos((prev) => [...prev, url].slice(0, 6))
      }
    } catch {
      setError('讀取圖片失敗，請換一張再試')
    }
  }

  async function handleSave() {
    if (!canEdit) {
      setError('目前角色為僅查看，無法修改缺失')
      return
    }
    if (!cat) {
      setError('請選擇查驗大項')
      return
    }
    const text = description.trim()

    setSaving(true)
    setError('')
    const result = await updateDefect(defect.id, {
      categoryId: cat.id,
      categoryName: cat.name,
      checklistItemId: effectiveItemId,
      area,
      description: text,
      planPhotoDataUrl: planPhoto ?? null,
      photoDataUrls: photos,
    })
    setSaving(false)
    if (!result.ok) {
      setError(result.error || '儲存失敗')
      return
    }
    onClose()
  }

  return (
    <>
      <Modal onClose={onClose} aria-label="修改缺失">
        <h3 className="serif" style={{ margin: 0, fontSize: 20 }}>
          修改缺失 #{defect.defectNumber}
        </h3>
        <p style={{ margin: '8px 0 12px', color: 'var(--ink-soft)', fontSize: 13, lineHeight: 1.45 }}>
          {defect.buildingName}・{defect.floor}・{defect.unitCode}戶
        </p>

        {!canEdit && (
          <div style={{ color: 'var(--terracotta)', fontWeight: 700, fontSize: 13, marginBottom: 10 }}>
            目前為僅查看權限，無法修改。
          </div>
        )}

        <div className="field">
          <label>查驗大項</label>
          <div className="chip-row">
            {activeCats.map((c) => (
              <button
                key={c.id}
                type="button"
                className={`chip ${cat?.id === c.id ? 'on' : ''}`}
                onClick={() => {
                  setCatId(c.id)
                  const first = checklistItems
                    .filter((i) => i.categoryId === c.id && i.active)
                    .sort((a, b) => a.sortOrder - b.sortOrder)[0]
                  setItemId(first?.id ?? null)
                }}
                disabled={!canEdit}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>查驗細項</label>
          {catItems.length === 0 ? (
            <p style={{ margin: '8px 0 0', color: 'var(--terracotta)', fontSize: 12, fontWeight: 700 }}>
              此大項尚無啟用中的細項
            </p>
          ) : (
            <div
              className="chip-row"
              style={{
                flexDirection: 'column',
                alignItems: 'stretch',
                gap: 8,
                marginTop: 8,
                maxHeight: '28vh',
                overflow: 'auto',
              }}
            >
              {catItems.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`chip ${effectiveItemId === item.id ? 'on' : ''}`}
                  style={{
                    minHeight: 40,
                    justifyContent: 'flex-start',
                    textAlign: 'left',
                    whiteSpace: 'normal',
                    lineHeight: 1.35,
                    width: '100%',
                  }}
                  onClick={() => setItemId(item.id)}
                  disabled={!canEdit}
                >
                  {item.description}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="field">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <label style={{ margin: 0 }}>缺失區域（此戶）</label>
            {unit && canEdit && (
              <button
                type="button"
                className="link"
                style={{ fontSize: 12, fontWeight: 700, color: 'var(--green-deep)' }}
                onClick={() => setAreasOpen(true)}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <Settings2 size={14} /> 編輯區域
                </span>
              </button>
            )}
          </div>
          <div className="chip-row" style={{ flexWrap: 'nowrap', overflowX: 'auto', marginTop: 8 }}>
            {areas.map((a) => (
              <button
                key={a}
                type="button"
                className={`chip ${area === a ? 'on' : ''}`}
                onClick={() => setArea(a)}
                disabled={!canEdit}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>圖面位置照片</label>
          <div className="upload-actions">
            <label className="upload-box" style={{ cursor: canEdit ? 'pointer' : 'default' }}>
              {planPhoto ? '已有圖面，點擊可更換' : '上傳／拍攝圖面位置'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                disabled={!canEdit}
                onChange={(e) => void onPick(e.target.files?.[0], 'plan')}
              />
            </label>
            <button
              type="button"
              className="upload-box-btn"
              disabled={!canEdit || (!planOriginal && !planPhoto)}
              onClick={() => setAnnotateOpen(true)}
            >
              標註位置
            </button>
            {planPhoto && canEdit && (
              <button
                type="button"
                className="upload-box-btn"
                onClick={() => {
                  setPlanPhoto(undefined)
                  setPlanOriginal(undefined)
                }}
              >
                清除圖面
              </button>
            )}
          </div>
          {planPhoto && (
            <img className="photo-thumb" src={planPhoto} alt="圖面位置" style={{ marginTop: 8 }} />
          )}
        </div>

        <div className="field">
          <label>缺失現況照片</label>
          <div className="photo-row">
            {photos.map((p, i) => (
              <button
                key={`${i}-${p.slice(0, 24)}`}
                type="button"
                onClick={() => {
                  if (!canEdit) return
                  setPhotos((prev) => prev.filter((_, idx) => idx !== i))
                }}
                style={{ padding: 0, border: 0, background: 'transparent', position: 'relative' }}
                title={canEdit ? '點擊移除' : undefined}
              >
                <img className="photo-thumb" src={p} alt={`現況 ${i + 1}`} />
              </button>
            ))}
            {canEdit && photos.length < 6 && (
              <label className="upload-box" style={{ width: 72, height: 72, cursor: 'pointer', padding: 0 }}>
                +
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  hidden
                  onChange={(e) => void onPick(e.target.files?.[0], 'photo')}
                />
              </label>
            )}
          </div>
          {canEdit && photos.length > 0 && (
            <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--ink-soft)' }}>
              點擊照片可移除
            </p>
          )}
        </div>

        <div className="field">
          <label>備註說明（小字顯示，可留空）</label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            disabled={!canEdit}
            placeholder="例如：門鎖卡住，需施力才能開啟"
          />
        </div>

        {error && (
          <div style={{ color: 'var(--terracotta)', fontWeight: 700, fontSize: 13, marginBottom: 8 }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1 }}
            disabled={saving || !canEdit}
            onClick={() => void handleSave()}
          >
            {saving ? '儲存中…' : '儲存修改'}
          </button>
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
        </div>
      </Modal>

      {annotateOpen && (planOriginal || planPhoto) && (
        <AnnotatePlanModal
          imageUrl={planOriginal || planPhoto!}
          onCancel={() => setAnnotateOpen(false)}
          onSave={(url) => {
            setPlanPhoto(url)
            setAnnotateOpen(false)
          }}
        />
      )}

      {areasOpen && unit && (
        <UnitAreasEditor unitId={unit.id} onClose={() => setAreasOpen(false)} />
      )}
    </>
  )
}
