import { useEffect, useState } from 'react'
import { Share2, X } from 'lucide-react'
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
 * 手機下載專用：先在面板內備妥圖片，再用「分享／儲存」按鈕觸發（保留使用者手勢）。
 * iOS／PWA 對直接 <a download> 常完全沒反應。
 */
export function SavePhotosSheet({
  photos,
  onClose,
}: {
  photos: PhotoItem[]
  onClose: () => void
}) {
  const [items, setItems] = useState<(PreparedImage | null)[]>(() => photos.map(() => null))
  const [errors, setErrors] = useState<(string | null)[]>(() => photos.map(() => null))
  const [loading, setLoading] = useState(true)
  const [busyIndex, setBusyIndex] = useState<number | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const prepared: (PreparedImage | null)[] = photos.map(() => null)
    const errs: (string | null)[] = photos.map(() => null)

    ;(async () => {
      for (let i = 0; i < photos.length; i += 1) {
        if (cancelled) return
        try {
          prepared[i] = await prepareImageDownload(
            photos[i].src,
            photos[i].filename,
            photos[i].kind,
          )
        } catch (err) {
          errs[i] = err instanceof Error ? err.message : '載入失敗'
        }
        if (!cancelled) {
          setItems([...prepared])
          setErrors([...errs])
        }
      }
      if (!cancelled) setLoading(false)
    })()

    return () => {
      cancelled = true
      for (const p of prepared) revokePrepared(p)
    }
    // 只在開啟時依傳入 photos 準備一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave(index: number) {
    const image = items[index]
    if (!image) return
    setBusyIndex(index)
    setHint(null)
    try {
      const mode = await shareOrDownloadPrepared(image)
      setHint(
        mode === 'shared'
          ? '請在選單點「儲存影像」或「存到照片」'
          : isLikelyMobile()
            ? '若沒跳出檔案，請改成長按上方圖片 → 儲存到照片'
            : '已開始下載',
      )
    } catch (err) {
      setHint(err instanceof Error ? err.message : '儲存失敗')
    } finally {
      setBusyIndex(null)
    }
  }

  return (
    <Modal onClose={onClose} aria-label="儲存照片" variant="bottom">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
        <div>
          <div className="eyebrow">SAVE PHOTOS</div>
          <h3 className="serif" style={{ margin: '4px 0 0', fontSize: 20 }}>
            儲存照片
          </h3>
          <p style={{ margin: '8px 0 0', color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600 }}>
            手機請點「分享／儲存」，再選「儲存影像」。也可長按圖片直接存到相簿。
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
              {(ready || p.src) && (
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
                    // 允許 iOS 長按呼出儲存選單
                    WebkitTouchCallout: 'default',
                    WebkitUserSelect: 'auto',
                    userSelect: 'auto',
                  }}
                />
              )}
              {err && (
                <div style={{ color: 'var(--terracotta)', fontWeight: 700, fontSize: 12 }}>{err}</div>
              )}
              <button
                type="button"
                className="btn btn-primary"
                style={{ width: '100%' }}
                disabled={!ready || busyIndex === index}
                onClick={() => void handleSave(index)}
              >
                <Share2 size={16} />
                {busyIndex === index
                  ? '開啟中…'
                  : ready
                    ? '分享／儲存到照片'
                    : '準備中…'}
              </button>
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
