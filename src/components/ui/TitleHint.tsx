import {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
} from 'react'
import { createPortal } from 'react-dom'

type Props = {
  /** 長按後顯示的說明 */
  hint: ReactNode
  children: ReactNode
  as?: 'h1' | 'h2' | 'h3' | 'div' | 'span'
  className?: string
  style?: CSSProperties
}

type Pop = {
  top: number
  left: number
  width: number
  placement: 'below' | 'above'
}

const LONG_MS = 420

/**
 * 標題長按顯示說明：氣泡貼在標題旁並隨捲動重算，點外側／Esc 關閉。
 * 會一直顯示到使用者主動關閉，不會一放開就消失。
 */
export function TitleHint({ hint, children, as = 'div', className, style }: Props) {
  const Tag = as
  const tipId = useId()
  const anchorRef = useRef<HTMLElement | null>(null)
  const bubbleRef = useRef<HTMLDivElement | null>(null)
  const timerRef = useRef<number | null>(null)
  const [open, setOpen] = useState(false)
  const [pop, setPop] = useState<Pop | null>(null)

  const clearTimer = () => {
    if (timerRef.current != null) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  const measure = () => {
    const el = anchorRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const margin = 12
    const maxW = Math.min(320, window.innerWidth - margin * 2)
    let left = rect.left
    if (left + maxW > window.innerWidth - margin) {
      left = window.innerWidth - margin - maxW
    }
    if (left < margin) left = margin

    const spaceBelow = window.innerHeight - rect.bottom
    const preferBelow = spaceBelow > 120 || spaceBelow >= rect.top
    const placement: Pop['placement'] = preferBelow ? 'below' : 'above'
    const top = preferBelow ? rect.bottom + 8 : Math.max(margin, rect.top - 8)

    setPop({ top, left, width: maxW, placement })
  }

  const showHint = () => {
    measure()
    setOpen(true)
  }

  const onPointerDown = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    // 已開啟時點標題本身不關閉（避免長按放開後的殘餘手勢立刻關掉）
    clearTimer()
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      showHint()
    }, LONG_MS)
  }

  const endPress = () => clearTimer()

  useEffect(() => {
    if (!open) return
    measure()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onOutside = (e: Event) => {
      const t = e.target as Node
      if (anchorRef.current?.contains(t)) return
      if (bubbleRef.current?.contains(t)) return
      setOpen(false)
    }
    const onScrollOrResize = () => measure()

    document.addEventListener('keydown', onKey)
    // 等長按手指放開後再監聽外側點擊，避免同一手勢把氣泡立刻關掉
    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', onOutside, true)
      document.addEventListener('touchstart', onOutside, true)
    }, 450)
    window.addEventListener('scroll', onScrollOrResize, true)
    window.addEventListener('resize', onScrollOrResize)
    return () => {
      window.clearTimeout(id)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('pointerdown', onOutside, true)
      document.removeEventListener('touchstart', onOutside, true)
      window.removeEventListener('scroll', onScrollOrResize, true)
      window.removeEventListener('resize', onScrollOrResize)
    }
  }, [open])

  useEffect(() => () => clearTimer(), [])

  return (
    <>
      <Tag
        ref={anchorRef as never}
        className={`title-hint-anchor ${open ? 'is-open' : ''} ${className ?? ''}`.trim()}
        style={style}
        onPointerDown={onPointerDown}
        onPointerUp={endPress}
        onPointerLeave={endPress}
        onPointerCancel={endPress}
        onContextMenu={(e) => {
          if (!hint) return
          e.preventDefault()
          // 系統長按選單：只負責開啟，不要 toggle 關掉剛開的氣泡
          showHint()
        }}
        aria-describedby={open ? tipId : undefined}
      >
        <span className="title-hint-label">{children}</span>
        <span className="title-hint-mark" aria-hidden title="長按查看說明" />
      </Tag>
      {open &&
        pop &&
        createPortal(
          <div
            ref={bubbleRef}
            id={tipId}
            role="tooltip"
            className={`title-hint-bubble ${pop.placement === 'above' ? 'is-above' : 'is-below'}`}
            style={{
              top: pop.top,
              left: pop.left,
              width: pop.width,
              transform: pop.placement === 'above' ? 'translateY(-100%)' : undefined,
            }}
          >
            <div className="title-hint-bubble-body">{hint}</div>
            <button
              type="button"
              className="title-hint-dismiss"
              onClick={() => setOpen(false)}
            >
              知道了
            </button>
          </div>,
          document.body,
        )}
    </>
  )
}
