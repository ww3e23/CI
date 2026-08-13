import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Download, Printer, X } from 'lucide-react'
import {
  buildPhotoReportHtml,
  downloadPhotoReport,
} from '../../lib/photoReportDocument'
import { setReportPreviewLock } from '../../lib/reportPreviewLock'
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

async function waitForImages(
  doc: Document,
  onProgress?: (done: number, total: number) => void,
): Promise<{ total: number; failed: number }> {
  const imgs = Array.from(doc.images)
  const total = imgs.length
  if (total === 0) {
    onProgress?.(0, 0)
    return { total: 0, failed: 0 }
  }

  let done = 0
  let failed = 0
  onProgress?.(0, total)

  await Promise.all(
    imgs.map(async (img) => {
      try {
        img.loading = 'eager'
        img.setAttribute('loading', 'eager')
        if (!(img.complete && img.naturalWidth > 0)) {
          await new Promise<void>((resolve) => {
            const finish = () => resolve()
            img.addEventListener('load', finish, { once: true })
            img.addEventListener('error', finish, { once: true })
            // 已在 cache 但尚未觸發 complete 的邊角
            if (img.complete) finish()
          })
        }
        if (img.naturalWidth > 0) {
          try {
            await img.decode()
          } catch {
            /* decode 失敗仍可列印已顯示的位圖 */
          }
        } else {
          failed += 1
        }
      } catch {
        failed += 1
      } finally {
        done += 1
        onProgress?.(done, total)
      }
    }),
  )

  return { total, failed }
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
  // 不可在 useProjectStore selector 裡每次 new object（會觸發 React #185 無限重渲）
  const [reportState, setReportState] = useState<ProjectState>(state)
  const [ready, setReady] = useState(false)
  const [imagesReady, setImagesReady] = useState(false)
  const [imgProgress, setImgProgress] = useState({ done: 0, total: 0 })
  const [imgFailed, setImgFailed] = useState(0)
  const [printBusy, setPrintBusy] = useState(false)
  /** 剛開啟時忽略點穿，避免關掉上一層後同一手指點到關閉／底欄 */
  const [guardPointer, setGuardPointer] = useState(true)

  useEffect(() => {
    setReportPreviewLock(true)
    const t = window.setTimeout(() => setGuardPointer(false), 500)
    return () => {
      window.clearTimeout(t)
      setReportPreviewLock(false)
    }
  }, [])

  // 開啟前把 IndexedDB 暫存圖灌回記憶體，再快照一次供報告使用
  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        await useProjectStore.getState().restorePendingMediaToMemory()
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) {
          setReportState(pickProjectState(useProjectStore.getState()))
          setReady(true)
        }
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  const input = useMemo(
    () => ({ projectName, recorderName, state: reportState, unitIds }),
    [projectName, recorderName, reportState, unitIds],
  )
  const { html, htmlError } = useMemo(() => {
    if (!ready) return { html: '', htmlError: null as string | null }
    try {
      return {
        html: buildPhotoReportHtml({ ...input, mode: 'embed' }),
        htmlError: null,
      }
    } catch (err) {
      console.error('[photo-report] build html failed', err)
      return {
        html: '',
        htmlError: err instanceof Error ? err.message : '產生報告失敗',
      }
    }
  }, [input, ready])

  // HTML 進 iframe 後，等全部圖片載入完才允許列印 PDF
  useEffect(() => {
    if (!ready || !html) return
    setImagesReady(false)
    setImgProgress({ done: 0, total: 0 })
    setImgFailed(0)

    let cancelled = false
    let generation = 0
    const frame = iframeRef.current
    if (!frame) return

    const run = async () => {
      const myGen = ++generation
      const doc = frame.contentDocument
      if (!doc || cancelled) return
      if (!doc.querySelector('.page')) return
      const result = await waitForImages(doc, (done, total) => {
        if (!cancelled && myGen === generation) setImgProgress({ done, total })
      })
      if (cancelled || myGen !== generation) return
      setImgFailed(result.failed)
      setImagesReady(true)
    }

    const onFrameLoad = () => {
      void run()
    }

    frame.addEventListener('load', onFrameLoad)
    const t = window.setTimeout(() => {
      void run()
    }, 80)

    return () => {
      cancelled = true
      window.clearTimeout(t)
      frame.removeEventListener('load', onFrameLoad)
    }
  }, [ready, html])

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

  async function printReport() {
    const frame = iframeRef.current
    const win = frame?.contentWindow
    const doc = frame?.contentDocument
    if (!win || !doc || !ready) {
      alert('報告尚未載入完成，請稍候再試')
      return
    }

    setPrintBusy(true)
    try {
      if (!imagesReady) {
        const result = await waitForImages(doc, (done, total) => {
          setImgProgress({ done, total })
        })
        setImgFailed(result.failed)
        setImagesReady(true)
      }
      // 再給瀏覽器一幀把圖畫上再叫列印
      await new Promise<void>((r) => requestAnimationFrame(() => r()))
      await new Promise<void>((r) => setTimeout(r, 80))
      win.focus()
      win.print()
    } finally {
      setPrintBusy(false)
    }
  }

  const progressLabel =
    !ready
      ? '準備報告…'
      : !imagesReady
        ? imgProgress.total > 0
          ? `圖片載入中 ${imgProgress.done}/${imgProgress.total}`
          : '圖片載入中…'
        : imgFailed > 0
          ? `可列印（${imgFailed} 張載入失敗）`
          : '圖片已就緒'

  return createPortal(
    <div
      className="report-preview"
      role="dialog"
      aria-modal="true"
      aria-label="圖片查驗報告預覽"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 200,
        /* 剛開啟時擋點穿：用透明攔截層而非 pointer-events:none，避免點到背後底欄 */
        pointerEvents: 'auto',
      }}
    >
      {guardPointer && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            background: 'transparent',
          }}
        />
      )}
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
          <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.85, marginTop: 2 }}>
            {progressLabel}
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
            disabled={!ready || printBusy}
            onClick={() => void printReport()}
            title={
              imagesReady
                ? '列印／存成 PDF'
                : '會先等圖片全部載入再列印，避免 PDF 空白'
            }
          >
            <Printer size={16} />
            {printBusy
              ? '準備列印…'
              : imagesReady
                ? '列印 PDF'
                : imgProgress.total > 0
                  ? `等圖中 ${imgProgress.done}/${imgProgress.total}`
                  : '等圖後列印'}
          </button>
          <button type="button" className="icon-btn report-bar-btn" aria-label="關閉" onClick={onClose}>
            <X size={18} />
          </button>
        </div>
      </header>
      {htmlError ? (
        <div
          className="report-preview-frame"
          style={{
            display: 'grid',
            placeItems: 'center',
            color: '#fff',
            fontWeight: 700,
            padding: 24,
            textAlign: 'center',
            gap: 12,
          }}
        >
          <div>報告產生失敗</div>
          <div style={{ fontSize: 13, fontWeight: 600, opacity: 0.85 }}>{htmlError}</div>
          <button type="button" className="btn btn-primary" onClick={onClose}>
            關閉
          </button>
        </div>
      ) : ready ? (
        <iframe
          key={`photo-report-${html.length}-${unitIds?.join(',') ?? 'all'}`}
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
      {ready && !imagesReady && (
        <div
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 16,
            zIndex: 6,
            padding: '12px 14px',
            borderRadius: 12,
            background: 'rgba(20,28,24,0.92)',
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 12,
            alignItems: 'center',
            pointerEvents: 'none',
          }}
        >
          <span>請稍候，圖片載入完成再列印，否則 PDF 會沒圖</span>
          <span style={{ opacity: 0.9, fontVariantNumeric: 'tabular-nums' }}>
            {imgProgress.total > 0 ? `${imgProgress.done}/${imgProgress.total}` : '…'}
          </span>
        </div>
      )}
    </div>,
    document.body,
  )
}
