import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { countActiveUnits, newBuildingDraft, summarizeBuilding } from '../../lib/units'
import { getUnitAreas } from '../../lib/areas'
import { BuildingEditor } from './BuildingEditor'
import { TemplateEditor } from './TemplateEditor'
import { UnitAreasEditor } from './UnitAreasEditor'
import { ProjectAreasEditor } from './ProjectAreasEditor'
import { BatchAreasApplySheet } from './BatchAreasApplySheet'
import { UnitPlanGallerySheet } from './UnitPlanGallerySheet'
import { createId } from '../../lib/id'
import type { BuildingRule, ChecklistCategory } from '../../types'
import { TitleHint } from '../ui/TitleHint'

export function SettingsPage({ embedded = false }: { embedded?: boolean }) {
  const buildings = useProjectStore((s) => s.buildings)
  const categories = useProjectStore((s) => s.categories)
  const checklistItems = useProjectStore((s) => s.checklistItems)
  const units = useProjectStore((s) => s.units)
  const projectAreas = useProjectStore((s) => s.areas)
  const areaTemplates = useProjectStore((s) => s.areaTemplates) ?? []
  const currentUnitId = useProjectStore((s) => s.currentUnitId)
  const upsertBuilding = useProjectStore((s) => s.upsertBuilding)
  const removeBuilding = useProjectStore((s) => s.removeBuilding)
  const upsertCategory = useProjectStore((s) => s.upsertCategory)
  const removeCategory = useProjectStore((s) => s.removeCategory)
  const resetDemoData = useProjectStore((s) => s.resetDemoData)
  const applyDefaultChecklist = useProjectStore((s) => s.applyDefaultChecklist)

  const [editing, setEditing] = useState<BuildingRule | null>(null)
  const [editingCat, setEditingCat] = useState<ChecklistCategory | null>(null)
  const [isNewCat, setIsNewCat] = useState(false)
  const [unitAreasOpen, setUnitAreasOpen] = useState(false)
  const [projectAreasOpen, setProjectAreasOpen] = useState(false)
  const [batchAreasOpen, setBatchAreasOpen] = useState(false)
  const [planGalleryOpen, setPlanGalleryOpen] = useState(false)
  /** 棟很多時預設收合，避免整頁被棟別卡片占滿 */
  const [buildingsOpen, setBuildingsOpen] = useState(
    () => buildings.filter((b) => b.active).length <= 2,
  )

  const currentUnit =
    units.find((u) => u.id === currentUnitId) ?? units.find((u) => u.active)

  const activeBuildings = [...buildings]
    .filter((b) => b.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const totalActiveUnits = units.filter((u) => u.active).length
  const activeCats = categories
    .filter((c) => c.active)
    .sort((a, b) => a.sortOrder - b.sortOrder)

  return (
    <div className={embedded ? undefined : 'rise'}>
      {!embedded && (
        <header style={{ marginBottom: 14 }}>
          <div className="eyebrow">PROJECT SETUP</div>
          <h1 className="serif" style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700 }}>
            棟別、樓層與戶別
          </h1>
        </header>
      )}

      <div className="section-row" style={{ marginTop: embedded ? 0 : undefined }}>
        <TitleHint
          as="h2"
          hint={`以規則批次建立：棟別、樓層範圍、各層戶別編號。目前 ${activeBuildings.length} 棟・${totalActiveUnits} 可查驗戶。`}
        >
          棟別結構
        </TitleHint>
        <button
          type="button"
          className="link"
          onClick={() => {
            if (confirm('確定清空本專案的棟別、範本、缺失與歷程？此操作無法復原。')) {
              resetDemoData()
            }
          }}
        >
          清空本專案
        </button>
      </div>

      <div className="glass" style={{ padding: 0, overflow: 'hidden' }}>
        <button
          type="button"
          className="building-fold-toggle"
          aria-expanded={buildingsOpen}
          onClick={() => setBuildingsOpen((v) => !v)}
        >
          <div style={{ minWidth: 0, textAlign: 'left' }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>
              {activeBuildings.length} 棟 · {totalActiveUnits} 可查驗戶
            </div>
            <div
              style={{
                marginTop: 2,
                color: 'var(--ink-soft)',
                fontSize: 12,
                fontWeight: 600,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {activeBuildings.length === 0
                ? '尚未設定棟別'
                : buildingsOpen
                  ? '點此收合棟別清單'
                  : activeBuildings.map((b) => b.name).join('、')}
            </div>
          </div>
          <ChevronDown
            size={20}
            style={{
              flexShrink: 0,
              color: 'var(--ink-soft)',
              transform: buildingsOpen ? 'rotate(180deg)' : undefined,
              transition: 'transform 0.2s ease',
            }}
          />
        </button>

        {buildingsOpen && (
          <div style={{ display: 'grid', gap: 0, borderTop: '1px solid rgba(34,41,31,0.08)' }}>
            {activeBuildings.map((b) => (
              <div key={b.id} className="building-fold-row">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 800, fontSize: 14 }}>
                    {b.name}
                    <span
                      style={{
                        color: 'var(--ink-soft)',
                        fontWeight: 600,
                        fontSize: 12,
                        marginLeft: 8,
                      }}
                    >
                      {summarizeBuilding(b)}
                    </span>
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      color: 'var(--ink-soft)',
                      fontSize: 11,
                      fontWeight: 600,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {b.unitCodes.join('、')} · {countActiveUnits(b)} 戶
                  </div>
                </div>
                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ minHeight: 36, flexShrink: 0, padding: '0 12px' }}
                  onClick={() => setEditing(b)}
                >
                  編輯
                </button>
              </div>
            ))}

            <button
              type="button"
              className="btn-dashed"
              style={{ margin: 12, marginTop: 8 }}
              onClick={() => {
                const nextIndex = activeBuildings.length
                const letter = String.fromCharCode(65 + (nextIndex % 26))
                setEditing(
                  newBuildingDraft({
                    name: `${letter}棟`,
                    unitCodes: [`${letter}1`, `${letter}2`, `${letter}3`],
                    sortOrder: nextIndex,
                  }),
                )
              }}
            >
              + 新增棟別
            </button>
          </div>
        )}

        {!buildingsOpen && (
          <div style={{ padding: '0 12px 12px' }}>
            <button
              type="button"
              className="btn-dashed"
              style={{ width: '100%' }}
              onClick={() => {
                setBuildingsOpen(true)
                const nextIndex = activeBuildings.length
                const letter = String.fromCharCode(65 + (nextIndex % 26))
                setEditing(
                  newBuildingDraft({
                    name: `${letter}棟`,
                    unitCodes: [`${letter}1`, `${letter}2`, `${letter}3`],
                    sortOrder: nextIndex,
                  }),
                )
              }}
            >
              + 新增棟別
            </button>
          </div>
        )}
      </div>

      <div className="section-row" style={{ marginTop: 22 }}>
        <TitleHint
          as="h2"
          hint="此戶編輯、專案預設、格局範本（矩陣套用），以及位置圖總覽，都集中在這裡。"
        >
          查驗區域／位置圖
        </TitleHint>
      </div>
      <article className="glass" style={{ padding: 14, marginBottom: 8 }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink-soft)', lineHeight: 1.45 }}>
          {currentUnit
            ? `目前戶：${currentUnit.buildingName} ${currentUnit.floor} ${currentUnit.code}戶 · ${getUnitAreas(currentUnit, projectAreas, areaTemplates).join('、')}`
            : '尚未選擇可查驗戶別'}
          {projectAreas.length > 0 ? (
            <>
              <br />
              專案預設：{projectAreas.join('、')}
            </>
          ) : null}
        </div>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 8,
            marginTop: 12,
          }}
        >
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 40 }}
            disabled={!currentUnit}
            onClick={() => setUnitAreasOpen(true)}
          >
            此戶設定
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 40 }}
            onClick={() => setProjectAreasOpen(true)}
          >
            專案預設
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 40 }}
            onClick={() => setBatchAreasOpen(true)}
          >
            格局範本
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ minHeight: 40 }}
            onClick={() => setPlanGalleryOpen(true)}
          >
            位置圖總覽
          </button>
        </div>
      </article>

      <div className="section-row">
        <TitleHint
          as="h2"
          hint="新專案已預載標準查驗範本。編輯細項後會套用到所有戶別；已有缺失的項目刪除時會改為停用並保留紀錄。"
        >
          查驗範本
        </TitleHint>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="link"
            onClick={() => {
              if (activeCats.length === 0) {
                applyDefaultChecklist('fill-if-empty')
                return
              }
              if (
                confirm(
                  '要以預設查驗範本覆蓋目前大項嗎？\n（門／窗／天花板／粉刷牆面／地壁磚／木地板）',
                )
              ) {
                applyDefaultChecklist('replace')
              }
            }}
          >
            套用預設範本
          </button>
          <button
            type="button"
            className="link"
            onClick={() => {
              setIsNewCat(true)
              setEditingCat({
                id: createId('cat'),
                name: '',
                iconChar: '項',
                color: '#2F5D4C',
                itemCount: 0,
                sortOrder: categories.length,
                active: true,
              })
            }}
          >
            + 新增大項
          </button>
        </div>
      </div>

      {activeCats.length === 0 && (
        <button
          type="button"
          className="btn btn-primary"
          style={{ width: '100%', marginBottom: 12 }}
          onClick={() => applyDefaultChecklist('fill-if-empty')}
        >
          載入預設查驗範本
        </button>
      )}

      <div style={{ display: 'grid', gap: 8 }}>
        {activeCats.map((cat) => (
          <article
            key={cat.id}
            className="glass"
            style={{ padding: 12, display: 'flex', alignItems: 'center', gap: 12 }}
          >
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                background: cat.color,
                color: '#fff',
                display: 'grid',
                placeItems: 'center',
                fontWeight: 800,
              }}
            >
              {cat.iconChar}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800 }}>{cat.name}</div>
              <div style={{ color: 'var(--ink-soft)', fontSize: 12, fontWeight: 600 }}>
                {cat.itemCount} 細項
              </div>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ minHeight: 40 }}
              onClick={() => {
                setIsNewCat(false)
                setEditingCat(cat)
              }}
            >
              編輯
            </button>
          </article>
        ))}

        <button
          type="button"
          className="btn-dashed"
          onClick={() => {
            setIsNewCat(true)
            setEditingCat({
              id: createId('cat'),
              name: '',
              iconChar: '項',
              color: '#2F5D4C',
              itemCount: 0,
              sortOrder: categories.length,
              active: true,
            })
          }}
        >
          + 新增大項
        </button>
      </div>

      {editing && (
        <BuildingEditor
          initial={editing}
          onCancel={() => setEditing(null)}
          onSave={(b) => {
            upsertBuilding(b)
            setEditing(null)
          }}
          onDelete={
            buildings.some((b) => b.id === editing.id)
              ? () => {
                  removeBuilding(editing.id)
                  setEditing(null)
                }
              : undefined
          }
        />
      )}

      {editingCat && (
        <TemplateEditor
          initial={editingCat}
          initialItems={checklistItems
            .filter((i) => i.categoryId === editingCat.id && i.active)
            .sort((a, b) => a.sortOrder - b.sortOrder)}
          onCancel={() => {
            setEditingCat(null)
            setIsNewCat(false)
          }}
          onSave={(cat, items) => {
            upsertCategory(cat, items)
            setEditingCat(null)
            setIsNewCat(false)
          }}
          onDelete={
            isNewCat
              ? undefined
              : () => {
                  if (!confirm('確定刪除／停用此大項？若已有缺失紀錄將改為停用並保留歷史。')) return
                  const r = removeCategory(editingCat.id)
                  if (r.reason) alert(r.reason)
                  setEditingCat(null)
                  setIsNewCat(false)
                }
          }
        />
      )}

      {unitAreasOpen && currentUnit && (
        <UnitAreasEditor unitId={currentUnit.id} onClose={() => setUnitAreasOpen(false)} />
      )}
      {projectAreasOpen && <ProjectAreasEditor onClose={() => setProjectAreasOpen(false)} />}
      {batchAreasOpen && <BatchAreasApplySheet onClose={() => setBatchAreasOpen(false)} />}
      {planGalleryOpen && <UnitPlanGallerySheet onClose={() => setPlanGalleryOpen(false)} />}
    </div>
  )
}
