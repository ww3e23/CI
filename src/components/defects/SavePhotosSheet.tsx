import { useEffect, useRef, useState } from 'react'
import { Download, ExternalLink, Share2, X } from 'lucide-react'
import {
  isLikelyMobile,
  prepareImageDownload,
  revokePrepared,
  shareOrDownloadPrepared,
  buildAttachmentUrl,
  type PreparedImage,
} from '../../lib/download'
import { Modal } from '../ui/Modal'

type PhotoItem = { src: string; filename: string; kind: string }

/**
 * 儲存照片面板（不依賴 CORS）：
 * - 先立刻顯示預覽並啟用「下載」
 * - 背景再嘗試轉成 blob（若 Storage CORS 已設定則可分享／更穩）
 */
export function SavePhotosSheet({
  photos,
  onClose,
}: {
  photos: PhotoItem[]
  onClose: () => void
}) {
  const mobile = isLikelyMobile()
  const preparedRef = useRef<(PreparedImage | null)[]>([])
  const [items, setItems] = useState<(PreparedImage | null)[]>(() =>
    photos.map((p) => ({
      filename: p.filename,
      objectUrl: p.src,
      kind: p.kind,
      sourceUrl: p.src,
      remoteOnly: true,
    })),
  )
  const [busyIndex, setBusyIndex] = useState<number | null>(null)
  const [hint, setHint] = useState<string | null>(
    mobile
      ? '可直接點「分享／儲存」。若失敗請長按圖片存到相簿。'
      : '可直接點「下載檔案」。若瀏覽器只開圖、沒下載，請在新分頁右鍵「圖片另存為」。',
  )

  useEffect(() => {
    let cancelled = false
    preparedRef.current = items.map((x) => x)

    ;(async () => {
      const next = [...items]
      await Promise.all(
        photos.map(async (photo, i) => {
          try {
            const prepared = await prepareImageDownload(photo.src, photo.filename, photo.kind)
            if (cancelled) {
              revokePrepared(prepared)
              return
            }
            // 若成功拿到 blob，升級為本機檔；否則維持 remoteOnly
            next[i] = prepared
          } catch (err) {
            console.warn('[SavePhotosSheet] prepare', err)
          }
        }),
      )
      if (cancelled) return
      preparedRef.current = next
      setItems([...next])
      const local = next.filter((x) => x && !x.remoteOnly).length
      if (local > 0) {
        setHint(
          mobile
            ? `已備妥 ${local} 張，可分享到相簿`
            : `已備妥 ${local} 張本機檔，下載會更穩定`,
        )
      }
    })()

    return () => {
      cancelled = true
      for (const p of preparedRef.current) revokePrepared(p)
      preparedRef.current = []
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleSave(index: number) {
    const image = items[index]
    if (!image) return
    setBusyIndex(index)
    try {
      const mode = await shareOrDownloadPrepared(image, { forceDownload: !mobile })
      if (mode === 'shared') {
        setHint('請在選單點「儲存影像」或「存到照片」')
      } else if (mode === 'downloaded') {
        setHint('已開始下載，請查看瀏覽器下載列／下載資料夾')
      } else {
        setHint(
          mobile
            ? '已開啟原圖；請長按圖片 → 儲存到照片'
            : '已開啟下載／原圖分頁。若沒自動下載，請在分頁中右鍵圖片 →「圖片另存為」',
        )
      }
    } catch (err) {
      setHint(err instanceof Error ? err.message : '儲存失敗')
    } finally {
      setBusyIndex(null)
    }
  }

  async function handleSaveAll() {
    let ok = 0
    for (let i = 0; i < items.length; i += 1) {
      if (!items[i]) continue
      setBusyIndex(i)
      try {
        await shareOrDownloadPrepared(items[i]!, { forceDownload: !mobile })
        ok += 1
        await new Promise((r) => setTimeout(r, 300))
      } catch (err) {
        console.warn(err)
      }
    }
    setBusyIndex(null)
    setHint(
      ok > 0
        ? mobile
          ? `已處理 ${ok} 張`
          : `已觸發 ${ok} 張下載。若被擋，請允許「下載多個檔案」。`
        : '下載失敗，請改用「開原圖」後另存',
    )
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
            {mobile
              ? '手機：點下方按鈕分享，或長按圖片存到相簿。'
              : '電腦：點「下載檔案」。若只開圖沒下載，在新分頁右鍵另存即可。'}
          </p>
        </div>
        <button type="button" className="icon-btn" aria-label="關閉" onClick={onClose}>
          <X size={18} />
        </button>
      </div>

      {hint && (
        <p style={{ margin: '12px 0 0', fontWeight: 700, color: 'var(--green-deep)', fontSize: 13 }}>
          {hint}
        </p>
      )}

      {photos.length > 1 && (
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', marginTop: 12 }}
          disabled={busyIndex !== null}
          onClick={() => void handleSaveAll()}
        >
          <Download size={16} />
          {mobile ? `分享／儲存全部（${photos.length}）` : `下載全部（${photos.length}）`}
        </button>
      )}

      <div style={{ display: 'grid', gap: 14, marginTop: 14, maxHeight: '58vh', overflow: 'auto' }}>
        {photos.map((p, index) => {
          const ready = items[index]
          return (
            <article
              key={p.filename}
              className="glass"
              style={{ padding: 10, display: 'grid', gap: 10 }}
            >
              <div style={{ fontWeight: 800, fontSize: 13 }}>
                {p.kind}
                {ready?.remoteOnly === false ? (
                  <span style={{ marginLeft: 8, color: 'var(--green-deep)', fontWeight: 700 }}>
                    已可本機下載
                  </span>
                ) : null}
              </div>
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
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn btn-primary"
                  style={{ flex: 1, minWidth: 140 }}
                  disabled={busyIndex === index}
                  onClick={() => void handleSave(index)}
                >
                  {mobile ? <Share2 size={16} /> : <Download size={16} />}
                  {busyIndex === index
                    ? '處理中…'
                    : mobile
                      ? '分享／儲存到照片'
                      : '下載檔案'}
                </button>
                <a
                  className="btn btn-ghost"
                  style={{ minHeight: 48, textDecoration: 'none' }}
                  href={buildAttachmentUrl(p.src, p.filename)}
                  target="_blank"
                  rel="noopener noreferrer"
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
