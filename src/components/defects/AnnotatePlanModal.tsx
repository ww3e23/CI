import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Redo2, Trash2, Undo2, X } from 'lucide-react'

type Tool = 'pen' | 'circle' | 'arrow'

interface Stroke {
  tool: Tool
  color: string
  width: number
  points: { x: number; y: number }[]
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
  const [tool, setTool] = useState<Tool>('pen')
  const [color, setColor] = useState('#AE4C3B')
  const [strokes, setStrokes] = useState<Stroke[]>([])
  const [redoStack, setRedoStack] = useState<Stroke[]>([])
  const drawing = useRef<Stroke | null>(null)
  const strokesRef = useRef<Stroke[]>([])
  const [ready, setReady] = useState(false)

  useEffect(() => {
    strokesRef.current = strokes
  }, [strokes])

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      imgRef.current = img
      const canvas = canvasRef.current
      if (!canvas) return
      const maxW = Math.min(window.innerWidth - 24, 720)
      const scale = maxW / img.width
      canvas.width = Math.round(img.width * scale)
      canvas.height = Math.round(img.height * scale)
      setReady(true)
      redraw([])
    }
    img.src = imageUrl
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
      const head = 14
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
    // 先取出 stroke 再清空 ref，避免 setState 延遲執行時 drawing.current 已是 null
    const stroke = drawing.current
    drawing.current = null
    if (!stroke?.points?.length) return
    const next = [...strokesRef.current, stroke]
    strokesRef.current = next
    setStrokes(next)
    setRedoStack([])
    redraw(next)
  }

  return (
    <div className="annotate-overlay" role="dialog" aria-label="標註圖面位置">
      <header className="annotate-bar">
        <button type="button" className="icon-btn" onClick={onCancel} aria-label="關閉">
          <X size={20} />
        </button>
        <div className="serif" style={{ fontWeight: 700 }}>標註位置</div>
        <button
          type="button"
          className="btn btn-primary"
          style={{ minHeight: 40, padding: '0 14px' }}
          onClick={() => {
            const canvas = canvasRef.current
            if (!canvas) return
            onSave(canvas.toDataURL('image/jpeg', 0.92))
          }}
        >
          完成標註
        </button>
      </header>

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
        <canvas
          ref={canvasRef}
          className="annotate-canvas"
          onPointerDown={(e) => {
            e.preventDefault()
            e.currentTarget.setPointerCapture(e.pointerId)
            drawing.current = {
              tool,
              color,
              width: tool === 'pen' ? 3.5 : 3,
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
      <p className="annotate-hint">拖曳標註後放開即可；按「完成標註」套用回缺失表單。</p>
    </div>
  )
}
