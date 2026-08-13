import { useEffect, useMemo, useState } from 'react'
import { Lock, Settings2 } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { useCurrentRole, useCurrentUser } from '../../store/useAuthStore'
import { cloudReady } from '../../services/cloudSync'
import { computeNextDefectNumber, isDefectNumberTaken } from '../../services/projectSync'
import { fileToCompressedDataUrl } from '../../lib/imageCompress'
import { getUnitAreas } from '../../lib/areas'
import { Modal } from '../ui/Modal'
import { TitleHint } from '../ui/TitleHint'
import { AnnotatePlanModal } from './AnnotatePlanModal'
import { UnitAreasEditor } from '../settings/UnitAreasEditor'

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
  const defects = useProjectStore((s) => s.defects)
  const categories = useProjectStore((s) => s.categories)
  const projectAreas = useProjectStore((s) => s.areas)
  const areaTemplates = useProjectStore((s) => s.areaTemplates) ?? []
  const currentUnitId = useProjectStore((s) => s.currentUnitId)
  const addDefect = useProjectStore((s) => s.addDefect)
  const role = useCurrentRole()
  const user = useCurrentUser()

  const unit = units.find((u) => u.id === currentUnitId) ?? units.find((u) => u.active)
  const areas = useMemo(
    () => getUnitAreas(unit, projectAreas, areaTemplates),
    [unit, projectAreas, areaTemplates],
  )
  const activeCats = categories.filter((c) => c.active)
  const [catId, setCatId] = useState(categoryId ?? activeCats[0]?.id ?? '')
  const cat = activeCats.find((c) => c.id === catId) ?? activeCats[0]
  const [area, setArea] = useState(() => areas[1] ?? areas[0] ?? '客廳')
  const [description, setDescription] = useState('')
  const defaultPlan = unit?.defaultPlanPhotoUrl
  const [planPhoto, setPlanPhoto] = useState<string | undefined>(() => defaultPlan)
  const [planOriginal, setPlanOriginal] = useState<string | undefined>(() => defaultPlan)
  const [planTouched, setPlanTouched] = useState(false)
  const [photos, setPhotos] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [annotateOpen, setAnnotateOpen] = useState(false)
  const [areasOpen, setAreasOpen] = useState(false)
  const [syncMsg, setSyncMsg] = useState(
    cloudReady() ? '儲存後將同步至雲端' : '示範模式：資料存在本機，尚未接 Firebase',
  )

  const unitId = unit?.id

  // 換戶時重新帶入該戶預設位置圖
  useEffect(() => {
    if (!unitId) return
    const live = useProjectStore.getState().units.find((u) => u.id === unitId)
    const plan = live?.defaultPlanPhotoUrl
    setPlanTouched(false)
    setPlanOriginal(plan)
    setPlanPhoto(plan)
  }, [unitId])

  // 預設位置圖更新：僅在尚未手動更換／標註時同步帶入（手動圖優先）
  useEffect(() => {
    if (planTouched) return
    setPlanOriginal(defaultPlan)
    setPlanPhoto(defaultPlan)
  }, [defaultPlan, planTouched])

  // 即時下一號：自動編號永遠用未作廢最大號 + 1
  const autoNumber = useMemo(() => {
    if (!unit) return 1
    return computeNextDefectNumber(unit.id, unit.nextDefectNumber, defects)
  }, [unit, defects])
  const [manualNumberOn, setManualNumberOn] = useState(false)
  const [manualNumberText, setManualNumberText] = useState('')
  const canEdit = role === 'admin' || role === 'inspector' || Boolean(user?.systemAdmin)

  const manualNumber = useMemo(() => {
    const n = Math.floor(Number(manualNumberText))
    return Number.isFinite(n) ? n : NaN
  }, [manualNumberText])

  const numberConflict =
    manualNumberOn &&
    unit &&
    Number.isFinite(manualNumber) &&
    manualNumber >= 1 &&
    isDefectNumberTaken(unit.id, manualNumber, defects)

  const displayNumber =
    manualNumberOn && Number.isFinite(manualNumber) && manualNumber >= 1
      ? manualNumber
      : autoNumber

  const itemHint = useMemo(() => {
    if (!checklistItemId) return null
    return useProjectStore.getState().checklistItems.find((i) => i.id === checklistItemId)
  }, [checklistItemId])

  // 自動下一號變了且未開手動時，同步顯示用（手動輸入框不強制覆寫）
  useEffect(() => {
    if (!manualNumberOn) setManualNumberText(String(autoNumber))
  }, [autoNumber, manualNumberOn])

  if (!unit || !cat) {
    return (
      <Modal onClose={onClose} aria-label="新增缺失">
        <p>請先設定可查驗戶別。</p>
        <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
          關閉
        </button>
      </Modal>
    )
  }

  async function onPick(file: File | undefined, kind: 'plan' | 'photo') {
    if (!file) return
    try {
      // 先壓縮再進表單／本機，避免 localStorage 配額爆掉與標註過糊
      const url = await fileToCompressedDataUrl(file, {
        maxEdge: kind === 'plan' ? 2048 : 1600,
        quality: kind === 'plan' ? 0.9 : 0.84,
      })
      if (kind === 'plan') {
        setPlanOriginal(url)
        setPlanPhoto(url)
        setPlanTouched(true)
      } else {
        setPhotos((prev) => [...prev, url].slice(0, 6))
      }
    } catch {
      setError('讀取圖片失敗，請換一張再試')
    }
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

    if (manualNumberOn) {
      const n = Math.floor(Number(manualNumberText))
      if (!Number.isFinite(n) || n < 1) {
        setError('請輸入有效的缺失編號（正整數）')
        return
      }
      if (isDefectNumberTaken(unit.id, n, useProjectStore.getState().defects)) {
        setError(`編號 #${n} 已被此戶其他缺失使用，請改其他號或改回自動編號`)
        return
      }
    }

    // 說明欄只存使用者備註；細項另以 checklistItemId 顯示，避免和細項混在一起
    const text = description.trim()

    setSaving(true)
    setError('')
    setSyncMsg(cloudReady() ? '正在同步…' : '正在儲存到本機…')

    try {
      const n = manualNumberOn ? Math.floor(Number(manualNumberText)) : undefined
      const d = await addDefect({
        unitId: unit.id,
        categoryId: cat.id,
        categoryName: cat.name,
        checklistItemId,
        area,
        description: text,
        planPhotoDataUrl: planPhoto,
        photoDataUrls: photos,
        defectNumber: n,
      })
      setSaving(false)
      if (!d) {
        setError(
          manualNumberOn
            ? '儲存失敗：編號可能已被使用或無效，請檢查後再試'
            : '儲存失敗，請確認已選擇可查驗戶別後再試',
        )
        setSyncMsg('儲存失敗')
        return
      }
      // 本機已存完就關閉；照片上傳在背景進行
      if (d.syncState === 'syncing' || d.syncState === 'pending') {
        setSyncMsg('已儲存，雲端同步中…')
      } else if (d.syncState === 'synced') {
        setSyncMsg('已同步至雲端')
      } else {
        setSyncMsg('已儲存')
      }
      onClose()
    } catch (e) {
      setSaving(false)
      setError(e instanceof Error ? e.message : '儲存時發生錯誤')
      setSyncMsg('儲存失敗')
    }
  }

  return (
    <>
      <Modal onClose={onClose} aria-label="新增缺失">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
          <h3 className="serif" style={{ margin: 0, fontSize: 20 }}>新增缺失</h3>
          <span className="chip on" style={{ minHeight: 34 }}>
            <Lock size={14} /> 編號 #{displayNumber}
          </span>
        </div>
        <p style={{ margin: '8px 0 12px', color: 'var(--ink-soft)', fontSize: 13 }}>
          {unit.buildingName}・{unit.floor}・{unit.code}戶
          {itemHint ? `｜${itemHint.description}` : ''}
        </p>

        <div className="field" style={{ marginBottom: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <TitleHint
              as="div"
              style={{ margin: 0, fontWeight: 700, fontSize: 13 }}
              hint="預設自動取「目前最大號 + 1」。若中間缺號，可自行輸入補上；不會改動已有缺失的編號。"
            >
              缺失編號
            </TitleHint>
            <button
              type="button"
              className="link"
              style={{ fontSize: 12, fontWeight: 700 }}
              disabled={!canEdit}
              onClick={() => {
                if (manualNumberOn) {
                  setManualNumberOn(false)
                  setManualNumberText(String(autoNumber))
                } else {
                  setManualNumberOn(true)
                  setManualNumberText(String(autoNumber))
                }
              }}
            >
              {manualNumberOn ? '改回自動編號' : '自行輸入編號'}
            </button>
          </div>
          {manualNumberOn ? (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <span style={{ fontWeight: 800 }}>#</span>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={manualNumberText}
                disabled={!canEdit}
                onChange={(e) => setManualNumberText(e.target.value)}
                style={{
                  width: 120,
                  border: '1px solid rgba(34,41,31,0.12)',
                  borderRadius: 12,
                  padding: '10px 12px',
                  fontWeight: 800,
                  fontSize: 16,
                }}
                aria-label="自行輸入缺失編號"
              />
              <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)' }}>
                自動下一號仍為 #{autoNumber}
              </span>
            </div>
          ) : (
            <div style={{ marginTop: 6, fontSize: 13, fontWeight: 600, color: 'var(--ink-soft)' }}>
              自動編號（最大號 + 1）
            </div>
          )}
          {numberConflict && (
            <div style={{ marginTop: 6, color: 'var(--terracotta)', fontWeight: 700, fontSize: 13 }}>
              此編號已被使用，請換一個
            </div>
          )}
        </div>

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
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
            <label style={{ margin: 0 }}>缺失區域（此戶）</label>
            {unit && (
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
              >
                {a}
              </button>
            ))}
          </div>
          {areas.length === 0 && (
            <p style={{ margin: '8px 0 0', color: 'var(--terracotta)', fontSize: 12, fontWeight: 700 }}>
              此戶尚無查驗區域，請先編輯新增。
            </p>
          )}
        </div>

        <div className="field">
          <label>圖面位置照片（與現況照片分開）</label>
          {planTouched && planPhoto ? (
            <div
              style={{
                marginBottom: 8,
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--green-deep)',
              }}
            >
              已使用本筆手動圖面／標註（優先於戶別預設，儲存後獨立留存）
            </div>
          ) : defaultPlan && planPhoto === defaultPlan ? (
            <div
              style={{
                marginBottom: 8,
                fontSize: 12,
                fontWeight: 700,
                color: 'var(--green-deep)',
              }}
            >
              已帶入此戶預設位置圖，可直接標註；手動更換後不會被預設蓋掉
            </div>
          ) : null}
          <div className="upload-actions">
            <label className="upload-box" style={{ cursor: 'pointer' }}>
              {planPhoto
                ? planTouched
                  ? '已選取圖面，點擊可更換'
                  : '已帶入預設圖，點擊可更換'
                : '上傳／拍攝圖面位置'}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                hidden
                onChange={(e) => onPick(e.target.files?.[0], 'plan')}
              />
            </label>
            <button
              type="button"
              className="upload-box-btn"
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
          {planPhoto && (
            <img className="photo-thumb" src={planPhoto} alt="圖面位置" style={{ marginTop: 8 }} />
          )}
          {!planPhoto && (
            <p style={{ margin: '8px 0 0', color: 'var(--ink-soft)', fontSize: 12, fontWeight: 600 }}>
              可先在首頁「區域／位置圖」為此戶上傳預設圖，之後就不用每次重選。
            </p>
          )}
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
          <label>
            <TitleHint as="span" hint="選填。列表會以小字顯示在細項下方，不會蓋過細項名稱。">
              備註說明
            </TitleHint>
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="例如：門鎖卡住，需施力才能開啟（可留空）"
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
          disabled={saving || !canEdit || Boolean(numberConflict)}
          onClick={handleSave}
        >
          {saving ? '儲存中…' : '儲存並同步雲端'}
        </button>
        <div className="sync-hint">{syncMsg}</div>
      </Modal>

      {annotateOpen && (planOriginal || planPhoto) && (
        <AnnotatePlanModal
          imageUrl={planOriginal || planPhoto!}
          onCancel={() => setAnnotateOpen(false)}
          onSave={(url) => {
            setPlanPhoto(url)
            setPlanTouched(true)
            setAnnotateOpen(false)
            setSyncMsg('圖面標註已套用，記得按下方儲存')
          }}
        />
      )}

      {areasOpen && unit && (
        <UnitAreasEditor
          unitId={unit.id}
          onClose={() => {
            setAreasOpen(false)
            const st = useProjectStore.getState()
            const next = getUnitAreas(
              st.units.find((u) => u.id === unit.id),
              st.areas,
              st.areaTemplates ?? [],
            )
            if (next.length && !next.includes(area)) setArea(next[0])
          }}
        />
      )}
    </>
  )
}
