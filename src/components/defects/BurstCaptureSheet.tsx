import { useEffect, useMemo, useRef, useState } from 'react'
import { Camera, Check } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { useCurrentRole, useCurrentUser } from '../../store/useAuthStore'
import { cloudReady } from '../../services/cloudSync'
import { computeNextDefectNumber } from '../../services/projectSync'
import { fileToCompressedDataUrl } from '../../lib/imageCompress'
import { getUnitAreas } from '../../lib/areas'
import {
  pickDefaultDefectArea,
  rememberLastDefectArea,
} from '../../lib/defectFormPrefs'
import { Modal } from '../ui/Modal'
import { TitleHint } from '../ui/TitleHint'

type ShotLog = { defectNumber: number; preview?: string }

/**
 * 連拍：選好區域後連續拍照，每張現況照＝一筆缺失（自動編號）。
 * 主打先拍來記錄；畫面明顯顯示下一號／剛存號，避免拍亂。
 */
export function BurstCaptureSheet({
  onClose,
  categoryId,
  checklistItemId,
}: {
  onClose: () => void
  categoryId: string
  checklistItemId: string
}) {
  const units = useProjectStore((s) => s.units)
  const categories = useProjectStore((s) => s.categories)
  const checklistItems = useProjectStore((s) => s.checklistItems)
  const defects = useProjectStore((s) => s.defects)
  const projectAreas = useProjectStore((s) => s.areas)
  const areaTemplates = useProjectStore((s) => s.areaTemplates) ?? []
  const currentUnitId = useProjectStore((s) => s.currentUnitId)
  const addDefect = useProjectStore((s) => s.addDefect)
  const role = useCurrentRole()
  const user = useCurrentUser()
  const canEdit = role === 'admin' || role === 'inspector' || Boolean(user?.systemAdmin)

  const unit = units.find((u) => u.id === currentUnitId) ?? units.find((u) => u.active)
  const cat = categories.find((c) => c.id === categoryId && c.active)
  const item = checklistItems.find((i) => i.id === checklistItemId)

  const areas = useMemo(
    () => getUnitAreas(unit, projectAreas, areaTemplates),
    [unit, projectAreas, areaTemplates],
  )

  const nextNumber = useMemo(() => {
    if (!unit) return 1
    return computeNextDefectNumber(unit.id, unit.nextDefectNumber, defects)
  }, [unit, defects])

  const [area, setArea] = useState('')
  const [areaLocked, setAreaLocked] = useState(false)
  const [queueLen, setQueueLen] = useState(0)
  const [error, setError] = useState('')
  const [shots, setShots] = useState<ShotLog[]>([])
  const [lastSaved, setLastSaved] = useState<number | null>(null)
  const [pendingNumber, setPendingNumber] = useState<number | null>(null)
  const [autoAgain, setAutoAgain] = useState(true)
  const fileRef = useRef<HTMLInputElement>(null)
  const autoAgainRef = useRef(true)
  const areaRef = useRef(area)
  const queueRef = useRef<File[]>([])
  const drainingRef = useRef(false)

  const busy = queueLen > 0 || pendingNumber != null

  useEffect(() => {
    autoAgainRef.current = autoAgain
  }, [autoAgain])

  useEffect(() => {
    areaRef.current = area
  }, [area])

  useEffect(() => {
    if (!areas.length) return
    setArea((prev) => (prev && areas.includes(prev) ? prev : pickDefaultDefectArea(areas)))
  }, [areas])

  if (!unit || !cat) {
    return (
      <Modal onClose={onClose} aria-label="連拍新增缺失">
        <p>請先設定可查驗戶別與大項。</p>
        <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 12 }} onClick={onClose}>
          關閉
        </button>
      </Modal>
    )
  }

  const liveUnit = unit
  const liveCat = cat

  function openCameraSoon(delayMs = 60) {
    window.setTimeout(() => fileRef.current?.click(), delayMs)
  }

  function startCapture() {
    if (!canEdit) {
      setError('目前角色為僅查看，無法新增缺失')
      return
    }
    if (!area.trim()) {
      setError('請先選擇區域')
      return
    }
    rememberLastDefectArea(area)
    setAreaLocked(true)
    setError('')
    openCameraSoon(80)
  }

  async function drainQueue() {
    if (drainingRef.current) return
    drainingRef.current = true
    try {
      while (queueRef.current.length > 0) {
        const file = queueRef.current.shift()!
        setQueueLen(queueRef.current.length)
        const st = useProjectStore.getState()
        const willBe = computeNextDefectNumber(
          liveUnit.id,
          liveUnit.nextDefectNumber,
          st.defects,
        )
        setPendingNumber(willBe)
        const shotArea = areaRef.current
        try {
          // 連拍用較小邊長／品質：體感快很多，現場記錄夠用
          const url = await fileToCompressedDataUrl(file, {
            maxEdge: 1280,
            quality: 0.72,
          })
          rememberLastDefectArea(shotArea)
          const d = await addDefect({
            unitId: liveUnit.id,
            categoryId: liveCat.id,
            categoryName: liveCat.name,
            checklistItemId,
            area: shotArea,
            description: '',
            photoDataUrls: [url],
            persistMedia: 'background',
          })
          if (!d) {
            setError('儲存失敗，請再試一次')
            continue
          }
          setLastSaved(d.defectNumber)
          setShots((prev) =>
            [{ defectNumber: d.defectNumber, preview: url }, ...prev].slice(0, 24),
          )
          setAreaLocked(true)
        } catch (err) {
          console.warn('[burst] capture failed', err)
          setError(err instanceof Error ? err.message : '拍照或儲存失敗')
        } finally {
          setPendingNumber(null)
        }
      }
    } finally {
      drainingRef.current = false
      setQueueLen(queueRef.current.length)
    }
  }

  function onPick(file: File | undefined) {
    if (!file) return
    if (!canEdit) {
      setError('目前角色為僅查看，無法新增缺失')
      return
    }
    if (!areaRef.current.trim()) {
      setError('請先選擇區域')
      return
    }

    setError('')
    // 立刻清掉 input，並視需要馬上再開鏡頭（不等壓縮／存檔）
    if (fileRef.current) fileRef.current.value = ''
    if (autoAgainRef.current) openCameraSoon(40)

    queueRef.current.push(file)
    setQueueLen(queueRef.current.length)
    void drainQueue()
  }

  return (
    <Modal onClose={onClose} aria-label="連拍新增缺失" variant="bottom" className="unit-pick-sheet">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <TitleHint
            as="h3"
            className="serif"
            style={{ margin: 0, fontSize: 20 }}
            hint="確認照片後會立刻再開鏡頭；壓縮與存檔在背景做，避免連拍卡住。畫面會顯示下一號。"
          >
            連拍記錄
          </TitleHint>
          <p style={{ margin: '6px 0 0', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600, lineHeight: 1.45 }}>
            {liveUnit.buildingName}・{liveUnit.floor}・{liveUnit.code}戶
            {item ? `｜${item.description}` : `｜${liveCat.name}`}
          </p>
        </div>
        <span className="chip on" style={{ minHeight: 32, flexShrink: 0 }}>
          已拍 {shots.length}
          {queueLen > 0 ? `｜佇列 ${queueLen}` : ''}
        </span>
      </div>

      <div
        style={{
          marginTop: 12,
          padding: '14px 16px',
          borderRadius: 16,
          background: 'rgba(174, 76, 59, 0.12)',
          border: '1px solid rgba(174, 76, 59, 0.28)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 12, fontWeight: 800, color: 'var(--terracotta)', letterSpacing: '0.04em' }}>
            {pendingNumber != null ? '正在存成' : '下一張照片＝'}
          </div>
          <div
            className="nums"
            style={{
              marginTop: 2,
              fontSize: 36,
              fontWeight: 800,
              lineHeight: 1,
              color: 'var(--terracotta)',
            }}
          >
            #{pendingNumber ?? nextNumber}
          </div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, fontWeight: 700, color: 'var(--ink-soft)', lineHeight: 1.45 }}>
          {lastSaved != null ? (
            <>
              剛存 <span style={{ color: 'var(--ink)', fontWeight: 800 }}>#{lastSaved}</span>
              <br />
              下一號 #{nextNumber}
            </>
          ) : (
            <>
              自動編號
              <br />
              最大號 + 1
            </>
          )}
        </div>
      </div>

      {!canEdit && (
        <div style={{ color: 'var(--terracotta)', fontWeight: 700, fontSize: 13, margin: '10px 0' }}>
          目前為僅查看權限，無法新增缺失。
        </div>
      )}

      <div className="field" style={{ marginTop: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          <label style={{ margin: 0 }}>缺失區域</label>
          {areaLocked && (
            <button
              type="button"
              className="link"
              style={{ fontSize: 12, fontWeight: 700 }}
              disabled={busy}
              onClick={() => setAreaLocked(false)}
            >
              更換區域
            </button>
          )}
        </div>
        <div className="chip-row" style={{ flexWrap: 'nowrap', overflowX: 'auto', marginTop: 8 }}>
          {areas.map((a) => (
            <button
              key={a}
              type="button"
              className={`chip ${area === a ? 'on' : ''}`}
              disabled={!canEdit || (areaLocked && a !== area)}
              onClick={() => {
                setArea(a)
                setAreaLocked(false)
              }}
            >
              {a}
            </button>
          ))}
        </div>
        {areas.length === 0 && (
          <p style={{ margin: '8px 0 0', color: 'var(--terracotta)', fontSize: 12, fontWeight: 700 }}>
            此戶尚無查驗區域，請先到設定新增。
          </p>
        )}
      </div>

      <label
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          margin: '4px 0 12px',
          cursor: 'pointer',
          userSelect: 'none',
          fontSize: 13,
          fontWeight: 700,
        }}
      >
        <input
          type="checkbox"
          checked={autoAgain}
          onChange={(e) => setAutoAgain(e.target.checked)}
          style={{ width: 18, height: 18, accentColor: 'var(--green-deep)' }}
        />
        確認後立刻再開鏡頭（背景存檔）
      </label>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        disabled={!canEdit}
        onChange={(e) => onPick(e.target.files?.[0])}
      />

      {!areaLocked ? (
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', minHeight: 48 }}
          disabled={!canEdit || !area || areas.length === 0}
          onClick={startCapture}
        >
          <Camera size={18} />
          開始連拍 → #{nextNumber}（{area || '未選'}）
        </button>
      ) : (
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ flex: 1, minHeight: 48 }}
            disabled={!canEdit}
            onClick={() => fileRef.current?.click()}
          >
            <Camera size={18} />
            {busy ? `背景存檔中… → #${nextNumber}` : `再拍一張 → #${nextNumber}`}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 48, minWidth: 96 }}
            disabled={busy}
            onClick={() => {
              if (busy) {
                setError('還有照片在背景存檔，請稍候再按完成')
                return
              }
              onClose()
            }}
          >
            <Check size={16} />
            完成
          </button>
        </div>
      )}

      <div className="sync-hint" style={{ marginTop: 8 }}>
        {busy
          ? `背景處理中（佇列 ${queueLen}）${pendingNumber != null ? `｜正在存 #${pendingNumber}` : ''}`
          : cloudReady()
            ? `下一張會存成 #${nextNumber}；確認照片後立刻可再拍`
            : `下一張會存成 #${nextNumber}（本機）`}
      </div>

      {error && (
        <div style={{ color: 'var(--terracotta)', fontWeight: 700, fontSize: 13, marginTop: 8 }}>
          {error}
        </div>
      )}

      {shots.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 13, marginBottom: 8 }}>本回合已建立</div>
          <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 4 }}>
            {shots.map((s, i) => (
              <div
                key={`${s.defectNumber}-${i}`}
                style={{
                  flexShrink: 0,
                  width: 72,
                  textAlign: 'center',
                }}
              >
                {s.preview ? (
                  <img
                    src={s.preview}
                    alt={`#${s.defectNumber}`}
                    className="photo-thumb"
                    style={{ width: 72, height: 72, objectFit: 'cover', display: 'block' }}
                  />
                ) : (
                  <div
                    className="photo-thumb"
                    style={{
                      width: 72,
                      height: 72,
                      display: 'grid',
                      placeItems: 'center',
                      background: 'rgba(34,41,31,0.06)',
                    }}
                  />
                )}
                <div style={{ marginTop: 4, fontWeight: 800, fontSize: 12 }}>#{s.defectNumber}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </Modal>
  )
}
