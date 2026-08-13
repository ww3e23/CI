import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Redo2, Trash2, Undo2, X } from 'lucide-react'
import { TitleHint } from '../ui/TitleHint'

type Tool = 'pen' | 'circle' | 'arrow'

interface Stroke {
  tool: Tool
  color: string
  width: number
  points: { x: number; y: number }[]
}

function loadHtmlImage(src: string, crossOrigin?: 'anonymous'): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    if (crossOrigin) img.crossOrigin = crossOrigin
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('圖片載入失敗'))
    img.src = src
  })
}

/**
 * 遠端圖（Firebase Storage）若直接畫上 canvas 再 toDataURL，
 * 未帶 CORS／crossOrigin 會污染畫布，完成標註會靜默失敗。
 * 優先用 fetch→blob→objectURL，讓畫布同源可匯出。
 */
async function loadImageForAnnotation(imageUrl: string): Promise<{
  img: HTMLImageElement
  objectUrl?: string
}> {
  if (imageUrl.startsWith('data:') || imageUrl.startsWith('blob:')) {
    return { img: await loadHtmlImage(imageUrl) }
  }

  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    try {
      const res = await fetch(imageUrl, { mode: 'cors', credentials: 'omit' })
      if (res.ok) {
        const blob = await res.blob()
        const objectUrl = URL.createObjectURL(blob)
        try {
          const img = await loadHtmlImage(objectUrl)
          return { img, objectUrl }
        } catch (err) {
          URL.revokeObjectURL(objectUrl)
          throw err
        }
      }
    } catch {
      // fall through：改試 crossOrigin 圖片
    }
    const img = await loadHtmlImage(imageUrl, 'anonymous')
    return { img }
  }

  return { img: await loadHtmlImage(imageUrl) }
}

export function AnnotatePlanModal({
  imageUrl,
  onCancel,
  onSave,
}: {
  imageUrl: string
  onCancel: () => void
  onSave: (annotatedDataUrl: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState('#AE4C3B')
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [redoStack, setRedoStack] = useState<Stroke[]>([])
  const drawing = useRef<Stroke | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    strokesRef.current = strokes
  }, [strokes])

  useEffect(() => {
    let cancelled = false
    setReady(false)
    setLoadError('')
    setSaveError('')

    void (async () => {
      try {
        const { img, objectUrl } = await loadImageForAnnotation(imageUrl)
        if (cancelled) {
          if (objectUrl) URL.revokeObjectURL(objectUrl)
          return
        }
        if (objectUrlRef.current) {
          URL.revokeObjectURL(objectUrlRef.current)
          objectUrlRef.current = null
        }
        if (objectUrl) objectUrlRef.current = objectUrl
        imgRef.current = img

        const canvas = canvasRef.current
        if (!canvas) return
        // 畫布維持高解析度（最長邊最多 2048），畫面再用 CSS 縮放
        const maxEdge = 2048
        const scale = Math.min(1, maxEdge / Math.max(img.width, img.height))
        canvas.width = Math.max(1, Math.round(img.width * scale))
        canvas.height = Math.max(1, Math.round(img.height * scale))
        const displayW = Math.min(window.innerWidth - 24, canvas.width)
        canvas.style.width = `${displayW}px`
        canvas.style.height = `${Math.round((displayW / canvas.width) * canvas.height)}px`
        setReady(true)
        redraw([])
      } catch {
        if (!cancelled) {
          setLoadError('位置圖載入失敗，請關閉後重新上傳再標註')
        }
      }
    })()

    return () => {
      cancelled = true
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [imageUrl])

  useEffect(() => {
    if (ready) redraw(strokes)
  }, [strokes, ready])

  function redraw(list: Stroke[]) {
    const canvas = canvasRef.current
    const img = imgRef.current
    if (!canvas || !img) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    for (const s of list) {
      if (s?.points?.length) drawStroke(ctx, s)
    }
  }

  function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
    if (!s?.points?.length) return
    ctx.strokeStyle = s.color
    ctx.fillStyle = s.color
    ctx.lineWidth = s.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (s.tool === 'pen') {
      ctx.beginPath()
      s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.stroke()
      return
    }

    if (s.tool === 'circle' && s.points.length >= 2) {
      const a = s.points[0]
      const b = s.points[s.points.length - 1]
      const r = Math.hypot(b.x - a.x, b.y - a.y)
      ctx.beginPath()
      ctx.arc(a.x, a.y, Math.max(r, 2), 0, Math.PI * 2)
      ctx.stroke()
      return
    }

    if (s.tool === 'arrow' && s.points.length >= 2) {
      const a = s.points[0]
      const b = s.points[s.points.length - 1]
      const angle = Math.atan2(b.y - a.y, b.x - a.x)
      const head = Math.max(14, s.width * 4)
      ctx.beginPath()
      ctx.moveTo(a.x, a.y)
      ctx.lineTo(b.x, b.y)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(b.x, b.y)
      ctx.lineTo(b.x - head * Math.cos(angle - 0.4), b.y - head * Math.sin(angle - 0.4))
      ctx.lineTo(b.x - head * Math.cos(angle + 0.4), b.y - head * Math.sin(angle + 0.4))
      ctx.closePath()
      ctx.fill()
    }
  }

  function pos(e: ReactPointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect()
    const scaleX = e.currentTarget.width / rect.width
    const scaleY = e.currentTarget.height / rect.height
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    }
  }

  function finishStroke() {
    const stroke = drawing.current
    drawing.current = null
    if (!stroke?.points?.length) return
    const next = [...strokesRef.current, stroke]
    strokesRef.current = next
    setStrokes(next)
    setRedoStack([])
    redraw(next)
  }

  function handleComplete() {
    if (saving) return
    const canvas = canvasRef.current
    if (!canvas || !ready) {
      setSaveError('圖面尚未就緒，請稍候再試')
      return
    }
    setSaving(true)
    setSaveError('')
    try {
      // 先 redraw 確保筆畫都在
      redraw(strokesRef.current)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
      if (!dataUrl || dataUrl === 'data:,') {
        throw new Error('empty')
      }
      onSave(dataUrl)
    } catch (err) {
      console.warn('[annotate] toDataURL failed', err)
      setSaveError(
        '無法套用標註（雲端圖片跨網域限制）。請關閉後重新上傳此戶位置圖，再標註一次。',
      )
      setSaving(false)
    }
  }

  return createPortal(
    <div className="annotate-overlay" role="dialog" aria-modal="true" aria-label="標註圖面位置">
      <header className="annotate-bar">
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="關閉">
          <X size={20} />
        </button>
        <TitleHint
          as="div"
          className="serif"
          style={{ fontWeight: 700 }}
          hint="拖曳標註後放開即可；按「完成標註」套用回缺失表單。"
        >
          標註位置
        </TitleHint>
        <button
          type="button"
          className="btn btn-primary"
          style={{ minHeight: 40, padding: '0 14px' }}
          disabled={!ready || Boolean(loadError) || saving}
          onClick={handleComplete}
        >
          {saving ? '套用中…' : '完成標註'}
        </button>
      </header>

      {(loadError || saveError) && (
        <div
          style={{
            margin: '0 12px 8px',
            padding: '10px 12px',
            borderRadius: 12,
            background: 'rgba(174,76,59,0.14)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          {loadError || saveError}
        </div>
      )}

      <div className="annotate-tools">
        {(
          [
            ['pen', '畫筆'],
            ['circle', '圓圈'],
            ['arrow', '箭頭'],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            className={`chip ${tool === k ? 'on' : ''}`}
            onClick={() => setTool(k)}
          >
            {label}
          </button>
        ))}
        {['#AE4C3B', '#C97B2E', '#2F5D4C', '#3C6E8F'].map((c) => (
          <button
            key={c}
            type="button"
            className="color-dot"
            style={{
              background: c,
              outline: color === c ? '2px solid #22291F' : 'none',
              outlineOffset: 2,
            }}
            onClick={() => setColor(c)}
            aria-label={`顏色 ${c}`}
          />
        ))}
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            setStrokes((s) => {
              if (!s.length) return s
              const last = s[s.length - 1]
              setRedoStack((r) => [...r, last])
              const next = s.slice(0, -1)
              strokesRef.current = next
              return next
            })
          }}
          aria-label="復原"
        >
          <Undo2 size={18} />
        </button>
        <button
          type="button"
          className="icon-btn"
          disabled={redoStack.length === 0}
          onClick={() => {
            setRedoStack((r) => {
              if (!r.length) return r
              const last = r[r.length - 1]
              setStrokes((s) => {
                const next = [...s, last]
                strokesRef.current = next
                return next
              })
              return r.slice(0, -1)
            })
          }}
          aria-label="重做"
        >
          <Redo2 size={18} />
        </button>
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            strokesRef.current = []
            setStrokes([])
            setRedoStack([])
          }}
          aria-label="清除"
        >
          <Trash2 size={18} />
        </button>
      </div>

      <div className="annotate-canvas-wrap">
        {!ready && !loadError && (
          <div style={{ color: '#fff', fontWeight: 700, padding: 24 }}>載入圖面中…</div>
        )}
        <canvas
          ref={canvasRef}
          className="annotate-canvas"
          style={{ display: ready ? 'block' : 'none' }}
          onPointerDown={(e) => {
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
            const canvas = e.currentTarget
            const strokeScale = Math.max(1, canvas.width / 720)
            drawing.current = {
              tool,
              color,
              width: (tool === 'pen' ? 3.5 : 3) * strokeScale,
              points: [pos(e)],
            }
          }}
          onPointerMove={(e) => {
            const cur = drawing.current
            if (!cur?.points) return
            cur.points.push(pos(e))
            redraw([...strokesRef.current, cur])
          }}
          onPointerUp={finishStroke}
          onPointerCancel={finishStroke}
        />
      </div>
    </div>,
    document.body,
  )
}
