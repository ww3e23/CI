import { useEffect, type ReactNode, useRef } from 'react'
import { createPortal } from 'react-dom'

type Props = {
  children: ReactNode
  onClose: () => void
  'aria-label'?: string
  className?: string
  /** center = 獨立置中彈窗；bottom = 底部 Sheet（篩選等） */
  variant?: 'center' | 'bottom'
}

/**
 * 掛到 document.body，不受頁面 transform／捲動影響。
 */
export function Modal({
  children,
  onClose,
  'aria-label': ariaLabel,
  className,
  variant = 'center',
}: Props) {
  const ignoreBackdropUntil = useRef(0)

  useEffect(() => {
    // 剛開啟時忽略 backdrop 點擊，避免上一層 Modal 關掉後的「點穿」立刻關閉
    ignoreBackdropUntil.current = Date.now() + 400
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  const bottom = variant === 'bottom'

  const handleBackdrop = () => {
    if (Date.now() < ignoreBackdropUntil.current) return
    onClose()
  }

  return createPortal(
    <div className={`modal-layer ${bottom ? 'modal-bottom' : ''}`.trim()}>
      <div className="modal-backdrop" onClick={handleBackdrop} />
      <div
        className={`modal-dialog ${bottom ? 'sheet-bottom' : ''} ${className ?? ''}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
        onClick={(e) => e.stopPropagation()}
      >
        {bottom && <div className="sheet-handle" />}
        {children}
      </div>
    </div>,
    document.body,
  )
}
