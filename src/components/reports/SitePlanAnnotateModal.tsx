import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'
import { Redo2, Trash2, Undo2, X } from 'lucide-react'
import { TitleHint } from '../ui/TitleHint'

type Tool = 'text' | 'rect' | 'line' | 'pen'

interface Stroke {
  tool: Tool
  color: string
  width: number
  points: { x: number; y: number }[]
  text?: string
  fontSize?: number
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
      /* fall through */
    }
    return { img: await loadHtmlImage(imageUrl, 'anonymous') }
  }
  return { img: await loadHtmlImage(imageUrl) }
}

/** 全區棟別配置圖標註：文字、方框、粗線 */
export function SitePlanAnnotateModal({
  imageUrl,
  buildingNames = [],
  onCancel,
  onSave,
}: {
  imageUrl: string
  /** 快捷插入棟名文字 */
  buildingNames?: string[]
  onCancel: () => void
  onSave: (annotatedDataUrl: string) => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imgRef = useRef<HTMLImageElement | null>(null)
  const objectUrlRef = useRef<string | null>(null)
  const [tool, setTool] = useState<Tool>('text')
  const [color, setColor] = useState('#AE4C3B')
  const [lineWidth, setLineWidth] = useState<'normal' | 'thick'>('thick')
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [redoStack, setRedoStack] = useState<Stroke[]>([])
  const drawing = useRef<Stroke | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const [ready, setReady] = useState(false)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')
  const [saving, setSaving] = useState(false)
  const [pendingText, setPendingText] = useState('A棟')

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
        if (!cancelled) setLoadError('配置圖載入失敗，請關閉後重新上傳')
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
      if (s) drawStroke(ctx, s)
    }
  }

  function drawStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
    ctx.strokeStyle = s.color
    ctx.fillStyle = s.color
    ctx.lineWidth = s.width
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    if (s.tool === 'text' && s.text && s.points[0]) {
      const p = s.points[0]
      const size = s.fontSize ?? Math.max(22, s.width * 8)
      ctx.font = `800 ${size}px "Noto Sans TC", "PingFang TC", sans-serif`
      ctx.textBaseline = 'top'
      // 白邊提升可讀性
      ctx.lineWidth = Math.max(3, size / 10)
      ctx.strokeStyle = 'rgba(255,255,255,0.92)'
      ctx.strokeText(s.text, p.x, p.y)
      ctx.fillStyle = s.color
      ctx.fillText(s.text, p.x, p.y)
      return
    }

    if (s.tool === 'rect' && s.points.length >= 2) {
      const a = s.points[0]!
      const b = s.points[s.points.length - 1]!
      const x = Math.min(a.x, b.x)
      const y = Math.min(a.y, b.y)
      const w = Math.abs(b.x - a.x)
      const h = Math.abs(b.y - a.y)
      ctx.strokeRect(x, y, Math.max(w, 2), Math.max(h, 2))
      return
    }

    if ((s.tool === 'line' || s.tool === 'pen') && s.points.length >= 1) {
      ctx.beginPath()
      s.points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)))
      ctx.stroke()
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
    if (!stroke) return
    if (stroke.tool === 'text') {
      if (!stroke.text?.trim() || !stroke.points[0]) return
    } else if (!stroke.points?.length) {
      return
    }
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
      redraw(strokesRef.current)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.92)
      if (!dataUrl || dataUrl === 'data:,') throw new Error('empty')
      onSave(dataUrl)
    } catch (err) {
      console.warn('[site-plan-annotate] toDataURL failed', err)
      setSaveError('無法套用標註，請重新上傳圖片後再試')
      setSaving(false)
    }
  }

  const strokeScale = () => {
    const canvas = canvasRef.current
    if (!canvas) return 1
    return Math.max(1, canvas.width / 720)
  }

  return createPortal(
    <div className="annotate-overlay" role="dialog" aria-modal="true" aria-label="標註全區棟別配置">
      <header className="annotate-bar">
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="關閉">
          <X size={20} />
        </button>
        <TitleHint
          as="div"
          className="serif"
          style={{ fontWeight: 700 }}
          hint="用文字標棟名、方框框範圍、粗線條畫分隔；完成後會存成報表預覽圖。"
        >
          標註棟別配置
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
            ['text', '文字'],
            ['rect', '方框'],
            ['line', '粗線'],
            ['pen', '畫筆'],
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
        {['#AE4C3B', '#C97B2E', '#2F5D4C', '#3C6E8F', '#111111'].map((c) => (
          <button
            key={c}
            type="button"
            className="color-dot"
            style={{
              background: c,
              outline: color === c ? '2px solid #fff' : 'none',
              outlineOffset: 2,
            }}
            onClick={() => setColor(c)}
            aria-label={`顏色 ${c}`}
          />
        ))}
        {(tool === 'line' || tool === 'rect' || tool === 'pen') && (
          <>
            <button
              type="button"
              className={`chip ${lineWidth === 'normal' ? 'on' : ''}`}
              onClick={() => setLineWidth('normal')}
            >
              細
            </button>
            <button
              type="button"
              className={`chip ${lineWidth === 'thick' ? 'on' : ''}`}
              onClick={() => setLineWidth('thick')}
            >
              粗
            </button>
          </>
        )}
        <button
          type="button"
          className="icon-btn"
          onClick={() => {
            setStrokes((s) => {
              if (!s.length) return s
              const last = s[s.length - 1]!
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
              const last = r[r.length - 1]!
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

      {tool === 'text' && (
        <div
          style={{
            display: 'flex',
            gap: 8,
            padding: '0 12px 10px',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <input
            value={pendingText}
            onChange={(e) => setPendingText(e.target.value)}
            placeholder="輸入要標的棟名／文字"
            style={{
              flex: 1,
              minWidth: 140,
              minHeight: 40,
              borderRadius: 12,
              border: 'none',
              padding: '0 12px',
              fontWeight: 700,
            }}
          />
          {buildingNames.slice(0, 12).map((n) => (
            <button
              key={n}
              type="button"
              className={`chip ${pendingText === n ? 'on' : ''}`}
              onClick={() => setPendingText(n)}
            >
              {n}
            </button>
          ))}
        </div>
      )}

      <div className="annotate-canvas-wrap">
        {!ready && !loadError && (
          <div style={{ color: '#fff', fontWeight: 700, padding: 24 }}>載入配置圖中…</div>
        )}
        <canvas
          ref={canvasRef}
          className="annotate-canvas"
          style={{ display: ready ? 'block' : 'none' }}
          onPointerDown={(e) => {
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
            const scale = strokeScale()
            const p = pos(e)
            if (tool === 'text') {
              const text = pendingText.trim()
              if (!text) {
                window.alert('請先輸入要標註的文字（例如 A棟）')
                return
              }
              drawing.current = {
                tool: 'text',
                color,
                width: 3 * scale,
                points: [p],
                text,
                fontSize: Math.max(28, 36 * scale),
              }
              finishStroke()
              return
            }
            drawing.current = {
              tool,
              color,
              width:
                (tool === 'line'
                  ? lineWidth === 'thick'
                    ? 10
                    : 4
                  : tool === 'rect'
                    ? lineWidth === 'thick'
                      ? 6
                      : 3
                    : lineWidth === 'thick'
                      ? 5
                      : 2.5) * scale,
              points: [p],
            }
          }}
          onPointerMove={(e) => {
            const cur = drawing.current
            if (!cur?.points || cur.tool === 'text') return
            if (cur.tool === 'pen') {
              cur.points.push(pos(e))
            } else {
              // rect / line：只保留起點與目前點
              cur.points = [cur.points[0]!, pos(e)]
            }
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
