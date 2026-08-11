import { useEffect, useMemo, useRef, useState } from 'react'
import { Download, Printer, X } from 'lucide-react'
import {
  buildPhotoReportHtml,
  downloadPhotoReport,
} from '../../lib/photoReportDocument'
import { useProjectStore } from '../../store/useProjectStore'
import type { ProjectState } from '../../types'

function pickProjectState(s: {
  projectName: string
  buildings: ProjectState['buildings']
  units: ProjectState['units']
  categories: ProjectState['categories']
  checklistItems: ProjectState['checklistItems']
  defects: ProjectState['defects']
  unitCheckedCount: ProjectState['unitCheckedCount']
  unitCategoryDone: ProjectState['unitCategoryDone']
  activities: ProjectState['activities']
  currentUnitId: ProjectState['currentUnitId']
  recentUnitIds: ProjectState['recentUnitIds']
  areas: ProjectState['areas']
  areaTemplates: ProjectState['areaTemplates']
}): ProjectState {
  return {
    projectName: s.projectName,
    buildings: s.buildings,
    units: s.units,
    categories: s.categories,
    checklistItems: s.checklistItems,
    defects: s.defects,
    unitCheckedCount: s.unitCheckedCount,
    unitCategoryDone: s.unitCategoryDone,
    activities: s.activities,
    currentUnitId: s.currentUnitId,
    recentUnitIds: s.recentUnitIds,
    areas: s.areas,
    areaTemplates: s.areaTemplates,
  }
}

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
  const liveState = useProjectStore((s) => pickProjectState(s))
  const [ready, setReady] = useState(false)

  // 開啟前把 IndexedDB 暫存圖灌回記憶體，避免報告缺位置圖／現況照
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await useProjectStore.getState().restorePendingMediaToMemory()
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const reportState = ready ? liveState : state
  const input = useMemo(
    () => ({ projectName, recorderName, state: reportState, unitIds }),
    [projectName, recorderName, reportState, unitIds],
  )
  const html = useMemo(
    () => (ready ? buildPhotoReportHtml({ ...input, mode: 'embed' }) : ''),
    [input, ready],
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
    if (!win || !ready) {
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
            disabled={!ready}
            onClick={() => downloadPhotoReport(input)}
          >
            <Download size={16} /> 下載
          </button>
          <button
            type="button"
            className="btn btn-primary report-bar-btn"
            disabled={!ready}
            onClick={printReport}
          >
            <Printer size={16} /> 列印 PDF
          </button>
          <button type="button" className="icon-btn report-bar-btn" aria-label="關閉" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </header>
      {ready ? (
        <iframe
          ref={iframeRef}
          className="report-preview-frame"
          title="圖片查驗報告"
          srcDoc={html}
        />
      ) : (
        <div
          className="report-preview-frame"
          style={{
            display: 'grid',
            placeItems: 'center',
            color: 'rgba(255,255,255,0.8)',
            fontWeight: 700,
          }}
        >
          正在載入位置圖與照片…
        </div>
      )}
    </div>
  )
}
