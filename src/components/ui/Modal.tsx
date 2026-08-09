import { useEffect, type ReactNode } from 'react'
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
  useEffect(() => {
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

  return createPortal(
    <div className={`modal-layer ${bottom ? 'modal-bottom' : ''}`.trim()}>
      <div className="modal-backdrop" onClick={onClose} />
      <div
        className={`modal-dialog ${bottom ? 'sheet-bottom' : ''} ${className ?? ''}`.trim()}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabel}
      >
        {bottom && <div className="sheet-handle" />}
        {children}
      </div>
    </div>,
    document.body,
  )
}
