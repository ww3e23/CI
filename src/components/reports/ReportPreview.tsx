import { useEffect, useMemo, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Download, Printer, X } from 'lucide-react'
import {
  buildInspectionReportHtml,
  downloadInspectionReport,
} from '../../lib/reportDocument'
import { setReportPreviewLock } from '../../lib/reportPreviewLock'
import type { ProjectState } from '../../types'

export function ReportPreview({
  projectName,
  projectCode,
  location,
  state,
  onClose,
}: {
  projectName: string
  projectCode?: string
  location?: string
  state: ProjectState
  onClose: () => void
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const input = useMemo(
    () => ({ projectName, projectCode, location, state }),
    [projectName, projectCode, location, state],
  )
  const html = useMemo(
    () => buildInspectionReportHtml({ ...input, mode: 'embed' }),
    [input],
  )

  useEffect(() => {
    setReportPreviewLock(true)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      setReportPreviewLock(false)
      document.body.style.overflow = prev
      document.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  function printReport() {
    const frame = iframeRef.current
    const win = frame?.contentWindow
    if (!win) {
      alert('報告尚未載入完成，請稍候再試')
      return
    }
    win.focus()
    win.print()
  }

  return createPortal(
    <div
      className="report-preview"
      role="dialog"
      aria-modal="true"
      aria-label="查驗報告預覽"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{ zIndex: 200 }}
    >
      <header className="report-preview-bar">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ color: 'rgba(255,255,255,0.7)' }}>REPORT</div>
          <div style={{ fontWeight: 800, fontSize: 16, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {projectName}・查驗報告
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button type="button" className="btn btn-ghost report-bar-btn" onClick={() => downloadInspectionReport(input)}>
            <Download size={16} /> 下載
          </button>
          <button type="button" className="btn btn-primary report-bar-btn" onClick={printReport}>
            <Printer size={16} /> 列印 PDF
          </button>
          <button type="button" className="icon-btn report-bar-btn" aria-label="關閉" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </header>
      <iframe
        ref={iframeRef}
        className="report-preview-frame"
        title="查驗報告"
        srcDoc={html}
      />
    </div>,
    document.body,
  )
}
