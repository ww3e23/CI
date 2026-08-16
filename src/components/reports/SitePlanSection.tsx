import { useRef, useState } from 'react'
import { ImagePlus, Map, Pencil, Trash2 } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { fileToCompressedDataUrl } from '../../lib/imageCompress'
import { TitleHint } from '../ui/TitleHint'
import { SitePlanAnnotateModal } from './SitePlanAnnotateModal'

/** 報表頁：全區棟別配置圖上傳／標註／預覽 */
export function SitePlanSection() {
  const sitePlanMapUrl = useProjectStore((s) => s.sitePlanMapUrl)
  const sitePlanSourceUrl = useProjectStore((s) => s.sitePlanSourceUrl)
  const buildings = useProjectStore((s) => s.buildings)
  const setSitePlanMap = useProjectStore((s) => s.setSitePlanMap)
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [annotateSrc, setAnnotateSrc] = useState<string | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)

  const buildingNames = buildings
    .filter((b) => b.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((b) => b.name)

  const displayUrl = sitePlanMapUrl || sitePlanSourceUrl

  async function onPickFile(file: File | null) {
    if (!file || busy) return
    setBusy(true)
    try {
      const dataUrl = await fileToCompressedDataUrl(file, {
        maxEdge: 2400,
        quality: 0.9,
      })
      // 先存原始，再開標註
      const saved = await setSitePlanMap({ sourceUrl: dataUrl, mapUrl: dataUrl })
      if (!saved.ok) {
        window.alert(saved.error || '上傳失敗')
        return
      }
      setAnnotateSrc(useProjectStore.getState().sitePlanSourceUrl || dataUrl)
    } catch (err) {
      console.warn('[site-plan] upload failed', err)
      window.alert('圖片處理失敗，請換一張再試')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function clearPlan() {
    if (!confirm('確定清除全區棟別配置圖？')) return
    setBusy(true)
    try {
      await setSitePlanMap({ sourceUrl: null, mapUrl: null })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="glass" style={{ padding: 14, marginBottom: 14 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          gap: 10,
          alignItems: 'flex-start',
          flexWrap: 'wrap',
        }}
      >
        <TitleHint
          as="h2"
          className="serif"
          style={{ margin: 0, fontSize: 18, fontWeight: 700 }}
          hint="上傳全區平面／空拍圖後，可用文字、方框、粗線標示各棟位置，方便報表對照。"
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <Map size={18} />
            全區棟別配置
          </span>
        </TitleHint>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-primary"
            style={{ minHeight: 40 }}
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <ImagePlus size={16} />
            {busy ? '處理中…' : displayUrl ? '更換圖片' : '上傳圖片'}
          </button>
          {displayUrl && (
            <>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: 40 }}
                disabled={busy}
                onClick={() =>
                  setAnnotateSrc(sitePlanSourceUrl || sitePlanMapUrl || null)
                }
              >
                <Pencil size={16} />
                編輯標註
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: 40, color: 'var(--terracotta)' }}
                disabled={busy}
                onClick={() => void clearPlan()}
              >
                <Trash2 size={16} />
                清除
              </button>
            </>
          )}
        </div>
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={(e) => void onPickFile(e.target.files?.[0] ?? null)}
      />

      {!displayUrl ? (
        <p
          style={{
            margin: '12px 0 0',
            color: 'var(--ink-soft)',
            fontSize: 13,
            fontWeight: 600,
            lineHeight: 1.5,
          }}
        >
          尚未上傳。建議使用全區總平面或空拍圖，標註後可在此預覽各棟位置。
        </p>
      ) : (
        <button
          type="button"
          onClick={() => setPreviewOpen(true)}
          style={{
            display: 'block',
            width: '100%',
            marginTop: 12,
            padding: 0,
            border: 'none',
            background: 'transparent',
            borderRadius: 16,
            overflow: 'hidden',
            cursor: 'zoom-in',
          }}
          aria-label="放大預覽配置圖"
        >
          <img
            src={displayUrl}
            alt="全區棟別配置圖"
            style={{
              width: '100%',
              maxHeight: 280,
              objectFit: 'contain',
              background: 'rgba(34,41,31,0.04)',
              display: 'block',
            }}
          />
        </button>
      )}

      {annotateSrc && (
        <SitePlanAnnotateModal
          imageUrl={annotateSrc}
          buildingNames={buildingNames}
          onCancel={() => setAnnotateSrc(null)}
          onSave={(dataUrl) => {
            void (async () => {
              setBusy(true)
              try {
                const source = sitePlanSourceUrl || annotateSrc
                const r = await setSitePlanMap({
                  sourceUrl: source,
                  mapUrl: dataUrl,
                })
                if (!r.ok) window.alert(r.error || '儲存失敗')
                else setAnnotateSrc(null)
              } finally {
                setBusy(false)
              }
            })()
          }}
        />
      )}

      {previewOpen && displayUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="全區棟別配置預覽"
          onClick={() => setPreviewOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 1200,
            background: 'rgba(20, 24, 18, 0.92)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 12,
            cursor: 'zoom-out',
          }}
        >
          <img
            src={displayUrl}
            alt="全區棟別配置圖預覽"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              borderRadius: 8,
            }}
          />
        </div>
      )}
    </section>
  )
}
