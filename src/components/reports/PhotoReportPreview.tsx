import { useEffect, useMemo, useRef } from 'react'
import { Download, Printer, X } from 'lucide-react'
import {
  buildPhotoReportHtml,
  downloadPhotoReport,
} from '../../lib/photoReportDocument'
import type { ProjectState } from '../../types'

export function PhotoReportPreview({
  projectName,
  recorderName,
  state,
  unitIds,
  onClose,
}: {
  projectName: string
  recorderName: string
  state: ProjectState
  unitIds?: string[]
  onClose: () => void
}) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const input = useMemo(
    () => ({ projectName, recorderName, state, unitIds }),
    [projectName, recorderName, state, unitIds],
  )
  const html = useMemo(
    () => buildPhotoReportHtml({ ...input, mode: 'embed' }),
    [input],
  )

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

  return (
    <div className="report-preview" role="dialog" aria-modal="true" aria-label="圖片查驗報告預覽">
      <header className="report-preview-bar">
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow" style={{ color: 'rgba(255,255,255,0.7)' }}>PHOTO REPORT</div>
          <div
            style={{
              fontWeight: 800,
              fontSize: 16,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {projectName}・圖片報告
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
          <button
            type="button"
            className="btn btn-ghost report-bar-btn"
            onClick={() => downloadPhotoReport(input)}
          >
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
        title="圖片查驗報告"
        srcDoc={html}
      />
    </div>
  )
}
