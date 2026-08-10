import { useEffect, useRef, useState } from 'react'
import { Download, ExternalLink, Share2, X } from 'lucide-react'
import {
  isLikelyMobile,
  prepareImageDownload,
  revokePrepared,
  shareOrDownloadPrepared,
  type PreparedImage,
} from '../../lib/download'
import { Modal } from '../ui/Modal'

type PhotoItem = { src: string; filename: string; kind: string }

/**
 * 儲存照片面板：
 * - 桌面：按鈕為「下載檔案」，直接另存
 * - 手機：按鈕為「分享／儲存到照片」
 */
export function SavePhotosSheet({
  photos,
  onClose,
}: {
  photos: PhotoItem[]
  onClose: () => void
}) {
  const mobile = isLikelyMobile()
  const preparedRef = useRef<(PreparedImage | null)[]>(photos.map(() => null))
  const [items, setItems] = useState<(PreparedImage | null)[]>(() => photos.map(() => null))
  const [errors, setErrors] = useState<(string | null)[]>(() => photos.map(() => null))
  const [loading, setLoading] = useState(true)
  const [busyIndex, setBusyIndex] = useState<number | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const prepared: (PreparedImage | null)[] = photos.map(() => null)
    const errs: (string | null)[] = photos.map(() => null)
    preparedRef.current = prepared

    ;(async () => {
      await Promise.all(
        photos.map(async (photo, i) => {
          try {
            prepared[i] = await prepareImageDownload(photo.src, photo.filename, photo.kind)
          } catch (err) {
            errs[i] = err instanceof Error ? err.message : '載入失敗'
          }
        }),
      )
      if (cancelled) {
        for (const p of prepared) revokePrepared(p)
        return
      }
      preparedRef.current = prepared
      setItems([...prepared])
      setErrors([...errs])
      setLoading(false)
    })()

    return () => {
      cancelled = true
      // 真正卸載時才釋放；成功路徑由 ref 持有
      for (const p of preparedRef.current) revokePrepared(p)
      preparedRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave(index: number) {
    const image = items[index]
    if (!image) return
    setBusyIndex(index)
    setHint(null)
    try {
      const mode = await shareOrDownloadPrepared(image, { forceDownload: !mobile })
      setHint(
        mode === 'shared'
          ? '請在選單點「儲存影像」或「存到照片」'
          : mobile
            ? '若沒有跳出選單，請長按上方圖片 → 儲存到照片'
            : '已開始下載，請查看瀏覽器下載列／下載資料夾',
      )
    } catch (err) {
      setHint(err instanceof Error ? err.message : '儲存失敗')
    } finally {
      setBusyIndex(null)
    }
  }

  async function handleSaveAll() {
    setHint(null)
    let ok = 0
    for (let i = 0; i < items.length; i += 1) {
      if (!items[i]) continue
      setBusyIndex(i)
      try {
        await shareOrDownloadPrepared(items[i]!, { forceDownload: !mobile })
        ok += 1
        await new Promise((r) => setTimeout(r, 350))
      } catch (err) {
        console.warn(err)
      }
    }
    setBusyIndex(null)
    if (ok === 0) {
      setHint('下載失敗。可改按「開原圖」後右鍵另存，或檢查是否封鎖多檔下載。')
    } else {
      setHint(
        mobile
          ? `已處理 ${ok} 張，請在分享選單儲存`
          : `已下載 ${ok} 張。若只下到 1 張，請允許瀏覽器「下載多個檔案」。`,
      )
    }
  }

  const readyCount = items.filter(Boolean).length

  return (
    <Modal onClose={onClose} aria-label="儲存照片" variant="bottom">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
        <div>
          <div className="eyebrow">SAVE PHOTOS</div>
          <h3 className="serif" style={{ margin: '4px 0 0', fontSize: 20 }}>
            儲存照片
          </h3>
          <p style={{ margin: '8px 0 0', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600 }}>
            {mobile
              ? '點「分享／儲存到照片」，再選「儲存影像」。也可長按圖片存到相簿。'
              : '電腦請點「下載檔案」，檔案會存到瀏覽器的下載資料夾。'}
          </p>
        </div>
        <button type="button" className="icon-btn" aria-label="關閉" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      {loading && (
        <p style={{ margin: '14px 0 0', fontWeight: 700, color: 'var(--ink-soft)', fontSize: 13 }}>
          正在準備照片…
        </p>
      )}
      {hint && (
        <p style={{ margin: '12px 0 0', fontWeight: 700, color: 'var(--green-deep)', fontSize: 13 }}>
          {hint}
        </p>
      )}

      {!loading && readyCount > 1 && (
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 12 }}
          disabled={busyIndex !== null}
          onClick={() => void handleSaveAll()}
        >
          <Download size={16} />
          {mobile ? `分享全部（${readyCount}）` : `下載全部（${readyCount}）`}
        </button>
      )}

      <div style={{ display: 'grid', gap: 14, marginTop: 14, maxHeight: '58vh', overflow: 'auto' }}>
        {photos.map((p, index) => {
          const ready = items[index]
          const err = errors[index]
          return (
            <article
              key={p.filename}
              className="glass"
              style={{ padding: 10, display: 'grid', gap: 10 }}
            >
              <div style={{ fontWeight: 800, fontSize: 13 }}>{p.kind}</div>
              <img
                src={ready?.objectUrl || p.src}
                alt={p.kind}
                style={{
                  width: '100%',
                  maxHeight: 240,
                  objectFit: 'contain',
                  borderRadius: 12,
                  background: '#1c211d',
                  display: 'block',
                  WebkitTouchCallout: 'default',
                  WebkitUserSelect: 'auto',
                  userSelect: 'auto',
                }}
              />
              {err && (
                <div style={{ color: 'var(--terracotta)', fontWeight: 700, fontSize: 12 }}>
                  準備失敗：{err}
                </div>
              )}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: 1, minWidth: 140 }}
                  disabled={!ready || busyIndex === index}
                  onClick={() => void handleSave(index)}
                >
                  {mobile ? <Share2 size={16} /> : <Download size={16} />}
                  {busyIndex === index
                    ? '處理中…'
                    : ready
                      ? mobile
                        ? '分享／儲存到照片'
                        : '下載檔案'
                      : '準備中…'}
                </button>
                <a
                  className="btn btn-ghost"
                  style={{ minHeight: 48, textDecoration: 'none' }}
                  href={ready?.objectUrl || p.src}
                  target="_blank"
                  rel="noopener noreferrer"
                  download={ready ? ready.filename : undefined}
                >
                  <ExternalLink size={16} /> 開原圖
                </a>
              </div>
            </article>
          )
        })}
      </div>

      <button
        type="button"
        className="btn btn-ghost"
        style={{ width: '100%', marginTop: 12 }}
        onClick={onClose}
      >
        完成
      </button>
    </Modal>
  )
}
