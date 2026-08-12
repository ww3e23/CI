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

/** 打包並下載該戶所有缺失圖片（ZIP） */
export function PackUnitPhotosButton({
  unitId,
  variant = 'ghost',
  style,
}: {
  unitId: string
  variant?: 'primary' | 'ghost'
  style?: CSSProperties
}) {
  const project = useCurrentProject()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number; current?: string } | null>(
    null,
  )
  const [resultMsg, setResultMsg] = useState<string | null>(null)

  const photoCount = useProjectStore((s) => countUnitPhotos(s, unitId))

  async function runPack() {
    if (busy) return
    if (photoCount <= 0) {
      window.alert('此戶目前沒有可打包的圖片')
      return
    }
    setOpen(true)
    setBusy(true)
    setResultMsg(null)
    setProgress({ done: 0, total: photoCount, current: '準備中…' })
    try {
      const state = useProjectStore.getState()
      const res = await downloadUnitPhotosZip({
        state,
        unitId,
        projectName: project?.name ?? state.projectName,
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

  return (
    <>
      <button
        type="button"
        className={`btn btn-${variant}`}
        style={style}
        disabled={busy || photoCount <= 0}
        title={
          photoCount > 0
            ? `打包本戶全部圖片（${photoCount} 張）成 ZIP 下載`
            : '此戶尚無可打包圖片'
        }
        onClick={() => void runPack()}
      >
        <Archive size={16} />
        {busy ? '打包中…' : `打包本戶圖片${photoCount > 0 ? `（${photoCount}）` : ''}`}
      </button>

      {open && (
        <Modal
          onClose={() => {
            if (busy) return
            setOpen(false)
            setResultMsg(null)
          }}
          aria-label="打包本戶圖片"
          variant="center"
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
            <TitleHint
              as="h3"
              className="serif"
              style={{ margin: 0, fontSize: 20 }}
              hint="會把此戶所有缺失的圖面位置與現況照片打包成一個 ZIP 檔下載。"
            >
              打包本戶圖片
            </TitleHint>
            {!busy && (
              <button
                type="button"
                className="icon-btn"
                aria-label="關閉"
                onClick={() => {
                  setOpen(false)
                  setResultMsg(null)
                }}
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
              onClick={() => {
                setOpen(false)
                setResultMsg(null)
              }}
            >
              關閉
            </button>
          )}
        </Modal>
      )}
    </>
  )
}
