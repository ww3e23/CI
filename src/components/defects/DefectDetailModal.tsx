import { Download, ImageDown } from 'lucide-react'
import type { Defect } from '../../types'
import { statusLabel } from '../../lib/progress'
import { downloadImage, downloadImages } from '../../lib/download'
import { Modal } from '../ui/Modal'

export function DefectDetailModal({
  defect,
  onClose,
}: {
  defect: Defect
  onClose: () => void
}) {
  const photos = [
    defect.planPhotoDataUrl
      ? { src: defect.planPhotoDataUrl, kind: '圖面位置', filename: `${defect.buildingName}-${defect.floor}-${defect.unitCode}-D${defect.defectNumber}-plan` }
      : null,
    ...(defect.photoDataUrls ?? []).map((src, i) => ({
      src,
      kind: `現況 ${i + 1}`,
      filename: `${defect.buildingName}-${defect.floor}-${defect.unitCode}-D${defect.defectNumber}-photo-${i + 1}`,
    })),
  ].filter(Boolean) as { src: string; kind: string; filename: string }[]

  return (
    <Modal onClose={onClose} aria-label="缺失詳情">
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'start' }}>
        <div>
          <div className="eyebrow">DEFECT #{defect.defectNumber}</div>
          <h2 className="serif" style={{ margin: '4px 0 0', fontSize: 22 }}>
            {defect.area}｜{defect.description}
          </h2>
          <p style={{ margin: '8px 0 0', color: 'var(--ink-soft)', fontSize: 13, lineHeight: 1.5 }}>
            {defect.categoryName} · {defect.buildingName} {defect.floor} {defect.unitCode}戶
            <br />
            狀態：{statusLabel(defect.status)}
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 14, flexWrap: 'wrap' }}>
        <button
          type="button"
          className="btn btn-primary"
          disabled={photos.length === 0}
          onClick={() => void downloadImages(photos)}
        >
          <ImageDown size={16} /> 下載全部照片
        </button>
        <button type="button" className="btn btn-ghost" onClick={onClose}>
          關閉
        </button>
      </div>

      <div style={{ display: 'grid', gap: 12, marginTop: 16 }}>
        {photos.length === 0 && (
          <div className="glass" style={{ padding: 16, color: 'var(--ink-soft)', textAlign: 'center' }}>
            此筆缺失沒有附圖
          </div>
        )}
        {photos.map((p) => (
          <figure
            key={p.filename}
            style={{
              margin: 0,
              borderRadius: 18,
              overflow: 'hidden',
              background: 'rgba(255,252,246,0.9)',
              border: '1px solid rgba(34,41,31,0.08)',
            }}
          >
            <img
              src={p.src}
              alt={p.kind}
              style={{ width: '100%', maxHeight: 280, objectFit: 'contain', display: 'block', background: '#1c211d' }}
            />
            <figcaption
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 8,
                padding: '10px 12px',
              }}
            >
              <span style={{ fontWeight: 800, fontSize: 13 }}>{p.kind}</span>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ minHeight: 36, padding: '0 12px' }}
                onClick={() => void downloadImage(p.src, p.filename)}
              >
                <Download size={15} /> 下載
              </button>
            </figcaption>
          </figure>
        ))}
      </div>
    </Modal>
  )
}
