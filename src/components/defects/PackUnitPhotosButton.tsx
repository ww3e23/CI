import { useState, type CSSProperties } from 'react'
import { Archive, X } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { useCurrentProject } from '../../store/useAuthStore'
import {
  countUnitPhotos,
  downloadUnitPhotosZip,
} from '../../lib/unitPhotoZip'
import { Modal } from '../ui/Modal'
import { TitleHint } from '../ui/TitleHint'

type PackScope = 'all' | 'filtered'

/** 打包並下載本戶圖片（全部或目前篩選）成 ZIP */
export function PackUnitPhotosButton({
  unitId,
  filteredDefectIds,
  filterLabel,
  variant = 'ghost',
  style,
}: {
  unitId: string
  /** 目前列表／篩選後的缺失 id；用於「打包已篩選」 */
  filteredDefectIds?: string[]
  /** 目前篩選名稱，例如「待改善」；未傳或「全部」時不顯示篩選選項 */
  filterLabel?: string
  variant?: 'primary' | 'ghost'
  style?: CSSProperties
}) {
  const project = useCurrentProject()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; current?: string } | null>(
    null,
  )
  const [resultMsg, setResultMsg] = useState<string | null>(null)
  const [packingTitle, setPackingTitle] = useState('打包本戶圖片')

  const allCount = useProjectStore((s) => countUnitPhotos(s, unitId))
  const filteredCount = useProjectStore((s) =>
    filteredDefectIds?.length
      ? countUnitPhotos(s, unitId, filteredDefectIds)
      : 0,
  )

  const filterActive = Boolean(filterLabel && filteredDefectIds)
  const canPackAnything = allCount > 0

  async function runPack(scope: PackScope) {
    if (busy) return
    const defectIds = scope === 'filtered' ? filteredDefectIds : undefined
    const scopeLabel = scope === 'filtered' ? filterLabel : undefined
    const expected =
      scope === 'filtered'
        ? countUnitPhotos(useProjectStore.getState(), unitId, defectIds)
        : allCount

    if (expected <= 0) {
      window.alert(
        scope === 'filtered'
          ? '目前篩選結果沒有可打包的圖片'
          : '此戶目前沒有可打包的圖片',
      )
      return
    }

    setPickerOpen(false)
    setPackingTitle(
      scope === 'filtered' && filterLabel
        ? `打包已篩選（${filterLabel}）`
        : '打包本戶圖片',
    )
    setBusy(true)
    setResultMsg(null)
    setProgress({ done: 0, total: expected, current: '準備中…' })
    try {
      const state = useProjectStore.getState()
      const res = await downloadUnitPhotosZip({
        state,
        unitId,
        projectName: project?.name ?? state.projectName,
        defectIds,
        scopeLabel,
        onProgress: setProgress,
      })
      setResultMsg(
        res.failed > 0
          ? `已下載 ZIP（成功 ${res.ok} 張，略過 ${res.failed} 張讀取失敗）`
          : `已下載 ZIP，共 ${res.ok} 張圖片`,
      )
    } catch (err) {
      setResultMsg(err instanceof Error ? err.message : '打包失敗')
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  function openPickerOrPack() {
    if (busy || !canPackAnything) {
      if (!canPackAnything) window.alert('此戶目前沒有可打包的圖片')
      return
    }
    if (filterActive) {
      setPickerOpen(true)
      return
    }
    void runPack('all')
  }

  const showProgressModal = busy || Boolean(resultMsg)

  return (
    <>
      <button
        type="button"
        className={`btn btn-${variant}`}
        style={style}
        disabled={busy || !canPackAnything}
        title={
          canPackAnything
            ? filterActive
              ? `可選擇打包本戶全部或目前篩選「${filterLabel}」`
              : `打包本戶全部圖片（${allCount} 張）成 ZIP 下載`
            : '此戶尚無可打包圖片'
        }
        onClick={openPickerOrPack}
      >
        <Archive size={16} />
        {busy
          ? '打包中…'
          : filterActive
            ? `打包照片（全部 ${allCount}／篩選 ${filteredCount}）`
            : `打包本戶圖片${allCount > 0 ? `（${allCount}）` : ''}`}
      </button>

      {pickerOpen && !busy && !resultMsg && (
        <Modal
          onClose={() => setPickerOpen(false)}
          aria-label="選擇打包範圍"
          variant="center"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
            <TitleHint
              as="h3"
              className="serif"
              style={{ margin: 0, fontSize: 20 }}
              hint="可打包本戶全部缺失的照片，或只打包目前狀態篩選後的項目。"
            >
              選擇打包範圍
            </TitleHint>
            <button
              type="button"
              className="icon-btn"
              aria-label="關閉"
              onClick={() => setPickerOpen(false)}
            >
              <X size={18} />
            </button>
          </div>

          <div style={{ display: 'grid', gap: 10, marginTop: 16 }}>
            <button
              type="button"
              className="btn btn-primary"
              style={{ width: '100%' }}
              disabled={allCount <= 0}
              onClick={() => void runPack('all')}
            >
              <Archive size={16} />
              打包本戶全部{allCount > 0 ? `（${allCount} 張）` : ''}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%' }}
              disabled={filteredCount <= 0}
              onClick={() => void runPack('filtered')}
            >
              <Archive size={16} />
              打包已篩選「{filterLabel}」
              {filteredCount > 0 ? `（${filteredCount} 張）` : '（無圖）'}
            </button>
          </div>
        </Modal>
      )}

      {showProgressModal && (
        <Modal
          onClose={() => {
            if (busy) return
            setResultMsg(null)
          }}
          aria-label={packingTitle}
          variant="center"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
            <TitleHint
              as="h3"
              className="serif"
              style={{ margin: 0, fontSize: 20 }}
              hint="會把選定範圍內缺失的圖面位置與現況照片打包成一個 ZIP 檔下載。"
            >
              {packingTitle}
            </TitleHint>
            {!busy && (
              <button
                type="button"
                className="icon-btn"
                aria-label="關閉"
                onClick={() => setResultMsg(null)}
              >
                <X size={18} />
              </button>
            )}
          </div>

          {busy && progress && (
            <div style={{ marginTop: 14 }}>
              <div style={{ fontWeight: 800, fontSize: 14 }}>
                處理中 {Math.min(progress.done, progress.total)}／{progress.total}
              </div>
              <div style={{ marginTop: 6, color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600 }}>
                {progress.current || '…'}
              </div>
              <div
                style={{
                  marginTop: 12,
                  height: 8,
                  borderRadius: 999,
                  background: 'rgba(34,41,31,0.1)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${progress.total ? Math.round((progress.done / progress.total) * 100) : 0}%`,
                    height: '100%',
                    background: 'var(--green-deep)',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            </div>
          )}

          {!busy && resultMsg && (
            <p style={{ margin: '14px 0 0', fontWeight: 700, color: 'var(--green-deep)', fontSize: 14 }}>
              {resultMsg}
            </p>
          )}

          {!busy && (
            <button
              type="button"
              className="btn btn-ghost"
              style={{ width: '100%', marginTop: 14 }}
              onClick={() => setResultMsg(null)}
            >
              關閉
            </button>
          )}
        </Modal>
      )}
    </>
  )
}
