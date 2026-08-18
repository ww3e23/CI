import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Camera, Check, SwitchCamera, X } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { useCurrentRole, useCurrentUser } from '../../store/useAuthStore'
import { cloudReady } from '../../services/cloudSync'
import { computeNextDefectNumber } from '../../services/projectSync'
import { compressImageDataUrl, fileToCompressedDataUrl } from '../../lib/imageCompress'
import { getUnitAreas } from '../../lib/areas'
import {
  pickDefaultDefectArea,
  rememberLastDefectArea,
} from '../../lib/defectFormPrefs'
import { Modal } from '../ui/Modal'
import { TitleHint } from '../ui/TitleHint'

type ShotLog = { defectNumber: number; preview?: string }
type QueueItem = { kind: 'file'; file: File } | { kind: 'dataUrl'; dataUrl: string }

/**
 * 連拍：選區域後開啟「App 內鏡頭」常駐預覽。
 * 每按一次快門＝一張現況照＝一筆缺失。
 * （不用系統相機自動再開：多數手機瀏覽器會擋非手勢的 input.click）
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
  const [queueLen, setQueueLen] = useState(0)
  const [error, setError] = useState('')
  const [shots, setShots] = useState<ShotLog[]>([])
  const [lastSaved, setLastSaved] = useState<number | null>(null)
  const [pendingNumber, setPendingNumber] = useState<number | null>(null)
  const [cameraOpen, setCameraOpen] = useState(false)
  const [cameraReady, setCameraReady] = useState(false)
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment')
  const [snapFlash, setSnapFlash] = useState(false)

  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const areaRef = useRef(area)
  const queueRef = useRef<QueueItem[]>([])
  const drainingRef = useRef(false)
  const snappingRef = useRef(false)

  const busy = queueLen > 0 || pendingNumber != null

  useEffect(() => {
    areaRef.current = area
  }, [area])

  useEffect(() => {
    if (!areas.length) return
    setArea((prev) => (prev && areas.includes(prev) ? prev : pickDefaultDefectArea(areas)))
  }, [areas])

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  // 鏡頭開啟／切換時綁定 stream
  useEffect(() => {
    if (!cameraOpen) return
    let cancelled = false

    void (async () => {
      setCameraReady(false)
      setError('')
      stopCamera()
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('此瀏覽器不支援 App 內鏡頭')
        }
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            facingMode: { ideal: facingMode },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
        })
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        streamRef.current = stream
        const video = videoRef.current
        if (video) {
          video.srcObject = stream
          await video.play().catch(() => undefined)
        }
        setCameraReady(true)
      } catch (err) {
        console.warn('[burst] getUserMedia failed', err)
        setCameraOpen(false)
        setCameraReady(false)
        setError(
          err instanceof Error
            ? `無法開啟 App 內鏡頭：${err.message}。可改用下方「系統相機單張」`
            : '無法開啟 App 內鏡頭，請改用系統相機單張',
        )
      }
    })()

    return () => {
      cancelled = true
    }
  }, [cameraOpen, facingMode])

  function stopCamera() {
    const stream = streamRef.current
    if (stream) {
      stream.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
    const video = videoRef.current
    if (video) video.srcObject = null
    setCameraReady(false)
  }

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

  async function drainQueue() {
    if (drainingRef.current) return
    drainingRef.current = true
    try {
      while (queueRef.current.length > 0) {
        const itemQ = queueRef.current.shift()!
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
          const url =
            itemQ.kind === 'dataUrl'
              ? await compressImageDataUrl(itemQ.dataUrl, { maxEdge: 1280, quality: 0.72 })
              : await fileToCompressedDataUrl(itemQ.file, { maxEdge: 1280, quality: 0.72 })
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
        } catch (err) {
          console.warn('[burst] save failed', err)
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

  function enqueue(itemQ: QueueItem) {
    queueRef.current.push(itemQ)
    setQueueLen(queueRef.current.length)
    void drainQueue()
  }

  function startInAppCamera() {
    if (!canEdit) {
      setError('目前角色為僅查看，無法新增缺失')
      return
    }
    if (!area.trim()) {
      setError('請先選擇區域')
      return
    }
    rememberLastDefectArea(area)
    setError('')
    setCameraOpen(true)
  }

  function snapFromVideo() {
    if (!canEdit || snappingRef.current) return
    const video = videoRef.current
    if (!video || !cameraReady || video.videoWidth < 2) {
      setError('鏡頭尚未就緒，請稍候再拍')
      return
    }
    if (!areaRef.current.trim()) {
      setError('請先選擇區域')
      return
    }

    snappingRef.current = true
    setSnapFlash(true)
    window.setTimeout(() => setSnapFlash(false), 120)

    try {
      const maxEdge = 1280
      const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight))
      const w = Math.max(1, Math.round(video.videoWidth * scale))
      const h = Math.max(1, Math.round(video.videoHeight * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('無法截圖')
      ctx.drawImage(video, 0, 0, w, h)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.72)
      setError('')
      enqueue({ kind: 'dataUrl', dataUrl })
    } catch (err) {
      console.warn('[burst] snap failed', err)
      setError(err instanceof Error ? err.message : '截圖失敗')
    } finally {
      // 允許快速連按，略延遲防抖
      window.setTimeout(() => {
        snappingRef.current = false
      }, 180)
    }
  }

  function onSystemPick(file: File | undefined) {
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
    if (fileRef.current) fileRef.current.value = ''
    enqueue({ kind: 'file', file })
  }

  function finishAll() {
    if (busy) {
      setError('還有照片在背景存檔，請稍候再按完成')
      return
    }
    stopCamera()
    setCameraOpen(false)
    onClose()
  }

  const cameraUi =
    cameraOpen &&
    createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-label="連拍鏡頭"
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 2400,
          background: '#0b0d0a',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            position: 'relative',
            flex: 1,
            minHeight: 0,
            background: '#000',
            overflow: 'hidden',
          }}
        >
          <video
            ref={videoRef}
            playsInline
            muted
            autoPlay
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              transform: facingMode === 'user' ? 'scaleX(-1)' : undefined,
            }}
          />
          {snapFlash && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(255,255,255,0.55)',
                pointerEvents: 'none',
              }}
            />
          )}

          <div
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              padding: '12px 14px',
              paddingTop: 'max(12px, env(safe-area-inset-top))',
              display: 'flex',
              justifyContent: 'space-between',
              gap: 10,
              background: 'linear-gradient(to bottom, rgba(0,0,0,0.55), transparent)',
              color: '#fff',
            }}
          >
            <button
              type="button"
              className="icon-btn"
              aria-label="關閉鏡頭"
              onClick={() => {
                stopCamera()
                setCameraOpen(false)
              }}
              style={{ background: 'rgba(255,255,255,0.14)', color: '#fff' }}
            >
              <X size={20} />
            </button>
            <div style={{ textAlign: 'center', minWidth: 0 }}>
              <div style={{ fontSize: 12, fontWeight: 700, opacity: 0.9 }}>
                {area}｜已拍 {shots.length}
                {queueLen > 0 ? `｜佇列 ${queueLen}` : ''}
              </div>
              <div className="nums" style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>
                #{pendingNumber ?? nextNumber}
              </div>
              <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>
                {pendingNumber != null
                  ? `正在存 #${pendingNumber}`
                  : lastSaved != null
                    ? `剛存 #${lastSaved}｜下一張 #${nextNumber}`
                    : '按快門連續拍，每張＝一筆缺失'}
              </div>
            </div>
            <button
              type="button"
              className="icon-btn"
              aria-label="切換鏡頭"
              onClick={() =>
                setFacingMode((m) => (m === 'environment' ? 'user' : 'environment'))
              }
              style={{ background: 'rgba(255,255,255,0.14)', color: '#fff' }}
            >
              <SwitchCamera size={20} />
            </button>
          </div>
        </div>

        <div
          style={{
            padding: '16px 18px',
            paddingBottom: 'max(16px, env(safe-area-inset-bottom))',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 16,
            background: '#12150f',
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 44, color: '#fff', borderColor: 'rgba(255,255,255,0.2)' }}
            disabled={busy}
            onClick={finishAll}
          >
            <Check size={16} />
            完成
          </button>

          <button
            type="button"
            aria-label={`拍攝缺失 #${nextNumber}`}
            disabled={!cameraReady || !canEdit}
            onClick={snapFromVideo}
            style={{
              width: 76,
              height: 76,
              borderRadius: '50%',
              border: '4px solid rgba(255,255,255,0.85)',
              background: cameraReady ? 'var(--terracotta)' : 'rgba(255,255,255,0.25)',
              boxShadow: '0 0 0 6px rgba(174,76,59,0.28)',
              color: '#fff',
              fontWeight: 800,
              fontSize: 14,
            }}
          >
            #{nextNumber}
          </button>

          <div style={{ minWidth: 72, textAlign: 'right', color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: 700 }}>
            {cameraReady ? '連拍中' : '啟動中…'}
          </div>
        </div>
      </div>,
      document.body,
    )

  return (
    <>
      <Modal onClose={onClose} aria-label="連拍新增缺失" variant="bottom" className="unit-pick-sheet">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <TitleHint
              as="h3"
              className="serif"
              style={{ margin: 0, fontSize: 20 }}
              hint="會開啟 App 內鏡頭常駐預覽：按快門即可連續拍，不必每次重開系統相機。每張＝一筆缺失。"
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
                App 內鏡頭
                <br />
                可連續按快門
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
          <label style={{ margin: 0 }}>缺失區域</label>
          <div className="chip-row" style={{ flexWrap: 'nowrap', overflowX: 'auto', marginTop: 8 }}>
            {areas.map((a) => (
              <button
                key={a}
                type="button"
                className={`chip ${area === a ? 'on' : ''}`}
                disabled={!canEdit}
                onClick={() => setArea(a)}
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

        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', minHeight: 48, marginTop: 4 }}
          disabled={!canEdit || !area || areas.length === 0}
          onClick={startInAppCamera}
        >
          <Camera size={18} />
          開啟連拍鏡頭 → #{nextNumber}
        </button>

        <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ flex: 1, minHeight: 44 }}
            disabled={!canEdit || !area}
            onClick={() => fileRef.current?.click()}
          >
            系統相機單張
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 44, minWidth: 96 }}
            disabled={busy}
            onClick={finishAll}
          >
            <Check size={16} />
            完成
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          disabled={!canEdit}
          onChange={(e) => onSystemPick(e.target.files?.[0])}
        />

        <div className="sync-hint" style={{ marginTop: 8 }}>
          {busy
            ? `背景處理中（佇列 ${queueLen}）${pendingNumber != null ? `｜正在存 #${pendingNumber}` : ''}`
            : cloudReady()
              ? `點「開啟連拍鏡頭」後可持續按快門；每張自動存成 #${nextNumber} 起`
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

      {cameraUi}
    </>
  )
}
