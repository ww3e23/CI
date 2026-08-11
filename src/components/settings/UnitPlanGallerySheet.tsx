import { useMemo, useState } from 'react'
import { ImagePlus, Map as MapIcon, X } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { useCurrentRole, useCurrentUser } from '../../store/useAuthStore'
import { fileToCompressedDataUrl } from '../../lib/imageCompress'
import { floorRank as floorSortKey, sortFloorsDesc } from '../../lib/floors'
import { Modal } from '../ui/Modal'
import { GlassSelect } from '../ui/GlassSelect'
import { TitleHint } from '../ui/TitleHint'
import type { Unit } from '../../types'

const ALL = ''

function compareUnits(
  a: Unit,
  b: Unit,
  buildingOrder: Map<string, number>,
) {
  const bo =
    (buildingOrder.get(a.buildingId) ?? 999) - (buildingOrder.get(b.buildingId) ?? 999)
  if (bo !== 0) return bo
  const fo = floorSortKey(b.floor) - floorSortKey(a.floor)
  if (fo !== 0) return fo
  return a.code.localeCompare(b.code, 'zh-Hant', { numeric: true })
}

export function UnitPlanGallerySheet({ onClose }: { onClose: () => void }) {
  const buildings = useProjectStore((s) => s.buildings)
  const units = useProjectStore((s) => s.units)
  const setUnitDefaultPlan = useProjectStore((s) => s.setUnitDefaultPlan)
  const role = useCurrentRole()
  const user = useCurrentUser()
  const canEdit = role === 'admin' || role === 'inspector' || Boolean(user?.systemAdmin)

  const [buildingId, setBuildingId] = useState(ALL)
  const [floor, setFloor] = useState(ALL)
  const [uploading, setUploading] = useState<Record<string, boolean>>({})
  const [messages, setMessages] = useState<Record<string, string>>({})
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  const activeBuildings = useMemo(
    () =>
      [...buildings]
        .filter((b) => b.active)
        .sort((a, b) => a.sortOrder - b.sortOrder),
    [buildings],
  )

  const buildingOrder = useMemo(
    () => new Map(activeBuildings.map((b, i) => [b.id, i])),
    [activeBuildings],
  )

  const buildingOptions = useMemo(
    () => [
      { value: ALL, label: '全部棟別' },
      ...activeBuildings.map((b) => ({ value: b.id, label: b.name })),
    ],
    [activeBuildings],
  )

  const floorOptions = useMemo(() => {
    const source = buildingId
      ? activeBuildings.filter((b) => b.id === buildingId)
      : activeBuildings
    const floors = sortFloorsDesc([...new Set(source.flatMap((b) => b.floors))])
    return [{ value: ALL, label: '全部樓層' }, ...floors.map((f) => ({ value: f, label: f }))]
  }, [activeBuildings, buildingId])

  const effectiveFloor = floorOptions.some((o) => o.value === floor) ? floor : ALL

  const filteredUnits = useMemo(() => {
    return units
      .filter((u) => u.active)
      .filter((u) => (buildingId ? u.buildingId === buildingId : true))
      .filter((u) => (effectiveFloor ? u.floor === effectiveFloor : true))
      .sort((a, b) => compareUnits(a, b, buildingOrder))
  }, [units, buildingId, effectiveFloor, buildingOrder])

  const withPlan = filteredUnits.filter((u) => u.defaultPlanPhotoUrl).length

  async function onPickPlan(unitId: string, file: File | undefined) {
    if (!file || !canEdit || uploading[unitId]) return
    setUploading((prev) => ({ ...prev, [unitId]: true }))
    setMessages((prev) => ({ ...prev, [unitId]: '' }))
    try {
      const dataUrl = await fileToCompressedDataUrl(file, {
        maxEdge: 2048,
        quality: 0.9,
      })
      const result = await setUnitDefaultPlan(unitId, dataUrl)
      if (!result.ok) {
        setMessages((prev) => ({
          ...prev,
          [unitId]: result.error || '位置圖儲存失敗',
        }))
      } else {
        setMessages((prev) => ({ ...prev, [unitId]: '已上傳' }))
      }
    } catch {
      setMessages((prev) => ({
        ...prev,
        [unitId]: '讀取圖片失敗，請換一張再試',
      }))
    } finally {
      setUploading((prev) => {
        const next = { ...prev }
        delete next[unitId]
        return next
      })
    }
  }

  async function clearPlan(unitId: string) {
    if (!canEdit || uploading[unitId]) return
    if (!confirm('確定清除此戶預設位置圖？')) return
    setUploading((prev) => ({ ...prev, [unitId]: true }))
    setMessages((prev) => ({ ...prev, [unitId]: '' }))
    const result = await setUnitDefaultPlan(unitId, null)
    setUploading((prev) => {
      const next = { ...prev }
      delete next[unitId]
      return next
    })
    if (!result.ok) {
      setMessages((prev) => ({
        ...prev,
        [unitId]: result.error || '清除失敗',
      }))
    } else {
      setMessages((prev) => ({ ...prev, [unitId]: '已清除' }))
    }
  }

  return (
    <>
      <Modal onClose={onClose} aria-label="全部戶別位置圖" variant="bottom">
        <TitleHint
          as="h3"
          className="serif"
          style={{ margin: '0 0 6px', fontSize: 20 }}
          hint="可先篩選棟別／樓層再預覽。上傳中可繼續點其他戶上傳，不必等完。"
        >
          全部戶別位置圖
        </TitleHint>
        <p
          style={{
            margin: '0 0 12px',
            color: 'var(--ink-soft)',
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          已上傳 {withPlan}／{filteredUnits.length} 戶
          {canEdit ? ' · 可直接在此上傳或更換' : ' · 僅可預覽'}
        </p>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginBottom: 12,
          }}
        >
          <GlassSelect
            label="棟別"
            value={buildingId}
            options={buildingOptions}
            aria-label="篩選棟別"
            onChange={(value) => {
              setBuildingId(value)
              setFloor(ALL)
            }}
          />
          <GlassSelect
            label="樓層"
            value={effectiveFloor}
            options={floorOptions}
            aria-label="篩選樓層"
            onChange={setFloor}
          />
        </div>

        {filteredUnits.length === 0 ? (
          <div
            className="glass"
            style={{
              padding: 16,
              textAlign: 'center',
              color: 'var(--ink-soft)',
              fontWeight: 700,
            }}
          >
            {units.some((u) => u.active)
              ? '此篩選條件下沒有戶別'
              : '目前沒有可查驗戶別'}
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gap: 10,
              maxHeight: 'min(62vh, 520px)',
              overflow: 'auto',
              paddingRight: 2,
              paddingBottom: 8,
            }}
          >
            {filteredUnits.map((unit) => {
              const planUrl = unit.defaultPlanPhotoUrl
              const busy = Boolean(uploading[unit.id])
              const msg = messages[unit.id]
              return (
                <article
                  key={unit.id}
                  className="glass"
                  style={{ padding: 12 }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'baseline',
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>
                        {unit.code}戶
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: 'var(--ink-soft)',
                          marginTop: 2,
                        }}
                      >
                        {unit.buildingName} {unit.floor}
                      </div>
                    </div>
                    {busy && (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 800,
                          color: 'var(--green-deep)',
                        }}
                      >
                        上傳中…
                      </span>
                    )}
                  </div>

                  {planUrl ? (
                    <button
                      type="button"
                      onClick={() => setPreviewUrl(planUrl)}
                      style={{
                        display: 'block',
                        width: '100%',
                        padding: 0,
                        border: 'none',
                        background: 'rgba(255,252,246,0.9)',
                        borderRadius: 12,
                        cursor: 'zoom-in',
                        overflow: 'hidden',
                      }}
                      aria-label={`預覽 ${unit.code}戶位置圖`}
                    >
                      <img
                        src={planUrl}
                        alt={`${unit.code}戶位置圖`}
                        style={{
                          width: '100%',
                          maxHeight: 140,
                          objectFit: 'contain',
                          display: 'block',
                        }}
                      />
                    </button>
                  ) : (
                    <div
                      style={{
                        borderRadius: 12,
                        background: 'rgba(34,41,31,0.04)',
                        minHeight: 88,
                        display: 'grid',
                        placeItems: 'center',
                        padding: 12,
                        textAlign: 'center',
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 800,
                          fontSize: 13,
                          color: 'var(--ink-soft)',
                        }}
                      >
                        尚未上傳預設位置圖
                      </div>
                    </div>
                  )}

                  <div
                    style={{
                      display: 'flex',
                      gap: 8,
                      marginTop: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    {canEdit && (
                      <label
                        className="btn btn-primary"
                        style={{
                          flex: 1,
                          minWidth: 120,
                          minHeight: 40,
                          opacity: busy ? 0.7 : 1,
                          pointerEvents: busy ? 'none' : 'auto',
                        }}
                      >
                        <ImagePlus size={14} />
                        {busy
                          ? '處理中…'
                          : planUrl
                            ? '更換位置圖'
                            : '上傳位置圖'}
                        <input
                          type="file"
                          accept="image/*"
                          hidden
                          disabled={busy}
                          onChange={(e) => {
                            void onPickPlan(unit.id, e.target.files?.[0])
                            e.target.value = ''
                          }}
                        />
                      </label>
                    )}
                    {planUrl && canEdit && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        style={{
                          minHeight: 40,
                          color: 'var(--terracotta)',
                          fontWeight: 800,
                        }}
                        disabled={busy}
                        onClick={() => void clearPlan(unit.id)}
                      >
                        清除
                      </button>
                    )}
                  </div>
                  {msg && (
                    <div
                      style={{
                        marginTop: 8,
                        fontSize: 12,
                        fontWeight: 700,
                        color: msg.includes('失敗')
                          ? 'var(--terracotta)'
                          : 'var(--green-deep)',
                      }}
                    >
                      {msg}
                    </div>
                  )}
                </article>
              )
            })}
          </div>
        )}

        <button
          type="button"
          className="btn btn-ghost"
          style={{ width: '100%', marginTop: 12, minHeight: 40 }}
          onClick={onClose}
        >
          關閉
        </button>
      </Modal>

      {previewUrl && (
        <Modal
          onClose={() => setPreviewUrl(null)}
          aria-label="位置圖放大預覽"
          variant="center"
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 10,
            }}
          >
            <div style={{ fontWeight: 800, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <MapIcon size={16} /> 位置圖預覽
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 36, minWidth: 36, padding: 0 }}
              onClick={() => setPreviewUrl(null)}
              aria-label="關閉預覽"
            >
              <X size={18} />
            </button>
          </div>
          <img
            src={previewUrl}
            alt="位置圖放大"
            style={{
              width: '100%',
              maxHeight: '70vh',
              objectFit: 'contain',
              borderRadius: 12,
              background: 'rgba(255,252,246,0.95)',
            }}
          />
        </Modal>
      )}
    </>
  )
}
