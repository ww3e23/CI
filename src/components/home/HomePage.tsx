import { useEffect, useMemo, useState, type ComponentType } from 'react'
import {
  AppWindow,
  ChevronDown,
  DoorOpen,
  Grid3x3,
  Layers,
  Paintbrush,
  PanelTop,
  Square,
  type LucideProps,
} from 'lucide-react'
import { useProjectStore } from '../../store/useProjectStore'
import { useCurrentProject } from '../../store/useAuthStore'
import { unitCategoryProgress, unitIsInspectionComplete, unitProgress } from '../../lib/progress'
import { UnitSwitcher } from '../UnitSwitcher'
import { ProjectSwitcher } from './ProjectSwitcher'
import { TitleHint } from '../ui/TitleHint'
import { UnitAreasEditor } from '../settings/UnitAreasEditor'
import { getUnitAreas } from '../../lib/areas'
import type { ChecklistCategory } from '../../types'

const CATEGORY_ICONS: Record<string, ComponentType<LucideProps>> = {
  門: DoorOpen,
  窗: AppWindow,
  天花板: PanelTop,
  粉刷牆面: Paintbrush,
  地壁磚: Grid3x3,
  地磚: Grid3x3,
  木地板: Layers,
}

export function HomePage({
  onOpenCategory,
}: {
  onOpenCategory: (categoryId: string) => void
}) {
  const [switchOpen, setSwitchOpen] = useState(false)
  const [projectOpen, setProjectOpen] = useState(false)
  const [areasOpen, setAreasOpen] = useState(false)
  const projectName = useProjectStore((s) => s.projectName)
  const currentProject = useCurrentProject()
  const units = useProjectStore((s) => s.units)
  const categories = useProjectStore((s) => s.categories)
  const defects = useProjectStore((s) => s.defects)
  const projectAreas = useProjectStore((s) => s.areas)
  const currentUnitId = useProjectStore((s) => s.currentUnitId)
  const unitCategoryDone = useProjectStore((s) => s.unitCategoryDone)
  const unitCheckedCount = useProjectStore((s) => s.unitCheckedCount)
  const setUnitInspectionComplete = useProjectStore((s) => s.setUnitInspectionComplete)

  const unit = units.find((u) => u.id === currentUnitId) ?? units.find((u) => u.active)
  const state = useProjectStore.getState()
  const progress = unit ? unitProgress(unit, state) : null
  const catProg = unit ? unitCategoryProgress(unit.id, state) : null
  const unitComplete = unit ? unitIsInspectionComplete(state, unit.id) : false
  void unitCategoryDone
  void unitCheckedCount

  // 舊專案若沒有範本，自動套用預設查驗清單
  useEffect(() => {
    if (!categories.some((c) => c.active)) {
      useProjectStore.getState().applyDefaultChecklist('fill-if-empty')
    }
  }, [categories])

  const unitDefects = useMemo(
    () => defects.filter((d) => d.unitId === unit?.id && d.status !== 'voided'),
    [defects, unit?.id],
  )

  const stats = {
    repair: unitDefects.filter((d) => d.status === 'pending_repair').length,
    reinspect: unitDefects.filter((d) => d.status === 'pending_reinspection').length,
    returned: unitDefects.filter((d) => d.status === 'returned').length,
    done: unitDefects.filter((d) => d.status === 'completed').length,
  }

  if (!unit || !progress) {
    return (
      <div className="rise">
        <header style={{ marginBottom: 12 }}>
          <div className="eyebrow">SITE INSPECTION</div>
          <TitleHint
            as="h1"
            className="serif"
            style={{ margin: '4px 0 0', fontSize: 22 }}
            hint="此專案尚未建立棟樓戶結構。請到「我的」設定棟別與查驗範本後再開始查驗。"
          >
            {currentProject?.name ?? projectName}
          </TitleHint>
        </header>
      </div>
    )
  }

  const ring = 2 * Math.PI * 42
  const offset = ring - (progress.percent / 100) * ring

  return (
    <div className="rise">
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 0 }}>
          <div className="eyebrow">SITE INSPECTION</div>
          <button
            type="button"
            className="glass"
            onClick={() => setProjectOpen(true)}
            style={{
              marginTop: 6,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              minHeight: 36,
              padding: '0 12px',
              borderRadius: 999,
              fontWeight: 700,
              fontSize: 13,
              maxWidth: '100%',
            }}
          >
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {currentProject ? `${currentProject.name}` : projectName}
            </span>
            <ChevronDown size={16} />
          </button>
          <div style={{ color: 'var(--ink-soft)', fontSize: 13, fontWeight: 600, marginTop: 6 }}>
            {unit.buildingName}・{unit.floor}・{unit.code}戶
          </div>
        </div>
        <button type="button" className="btn btn-ghost" style={{ minHeight: 40, borderRadius: 999, flexShrink: 0 }} onClick={() => setSwitchOpen(true)}>
          切換戶別
        </button>
      </header>

      <div className="hero-stack">
        <div className="hero-layer hero-layer-b" aria-hidden />
        <div className="hero-layer hero-layer-a" aria-hidden />
        <section className="glass-green hero-card">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, opacity: 0.85, fontWeight: 700 }}>目前查驗戶別</div>
              <div className="serif" style={{ fontSize: 34, fontWeight: 700, lineHeight: 1.1, marginTop: 4 }}>
                {unit.code} 戶
              </div>
              <div style={{ marginTop: 4, opacity: 0.9, fontWeight: 600 }}>
                {unit.buildingName} {unit.floor}
              </div>
            </div>
            <div style={{ position: 'relative', width: 104, height: 104 }}>
              <svg width="104" height="104" viewBox="0 0 104 104">
                <circle cx="52" cy="52" r="42" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="8" />
                <circle
                  cx="52"
                  cy="52"
                  r="42"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="8"
                  strokeLinecap="round"
                  strokeDasharray={ring}
                  strokeDashoffset={offset}
                  transform="rotate(-90 52 52)"
                  style={{ transition: 'stroke-dashoffset 0.4s ease' }}
                />
              </svg>
              <div
                style={{
                  position: 'absolute',
                  inset: 0,
                  display: 'grid',
                  placeItems: 'center',
                  textAlign: 'center',
                }}
              >
                <div>
                  <div className="nums" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>
                    {progress.percent}%
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.85, fontWeight: 700 }}>完成率</div>
                </div>
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, marginTop: 14 }}>
            <div className="status-pill status-pill-amber">
              <span className="n nums">{stats.repair}</span>
              <span className="l">待改善</span>
            </div>
            <div className="status-pill status-pill-slate">
              <span className="n nums">{stats.reinspect}</span>
              <span className="l">待複驗</span>
            </div>
            <div className="status-pill status-pill-terra">
              <span className="n nums">{stats.returned}</span>
              <span className="l">退回</span>
            </div>
            <div className="status-pill status-pill-done">
              <span className="n nums">{stats.done}</span>
              <span className="l">已改善</span>
            </div>
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            style={{
              width: '100%',
              marginTop: 12,
              minHeight: 40,
              background: 'rgba(255,255,255,0.14)',
              color: '#fff',
              borderColor: 'rgba(255,255,255,0.28)',
            }}
            onClick={() => setAreasOpen(true)}
          >
            查驗區域 {getUnitAreas(unit, projectAreas).length} 項・點此增刪改
          </button>

          <button
            type="button"
            className="btn btn-ghost"
            style={{
              width: '100%',
              marginTop: 8,
              minHeight: 40,
              background: unitComplete ? 'rgba(198,239,206,0.95)' : 'rgba(255,255,255,0.14)',
              color: unitComplete ? '#006100' : '#fff',
              borderColor: unitComplete ? 'rgba(0,97,0,0.35)' : 'rgba(255,255,255,0.28)',
              fontWeight: 800,
            }}
            onClick={() => {
              const next = !unitComplete
              const msg = next
                ? `確認標記「${unit.code}戶」全部大項查驗完成？完成後報表會以綠底標示，避免重複查驗。`
                : `確認清除「${unit.code}戶」的查驗完成標記？`
              if (!window.confirm(msg)) return
              setUnitInspectionComplete(unit.id, next)
            }}
          >
            {unitComplete
              ? '✓ 本戶查驗完成（點此取消）'
              : `標記本戶查驗完成（${catProg?.done ?? 0}/${catProg?.total ?? 0} 大項）`}
          </button>
        </section>
      </div>

      <div className="section-row">
        <h2>查驗大項</h2>
        <span className="link">
          {catProg ? `${catProg.done}/${catProg.total} 已查畢` : '查看全部'}
        </span>
      </div>

      <div className="grid-2">
        {categories
          .filter((c) => c.active)
          .sort((a, b) => a.sortOrder - b.sortOrder)
          .map((cat) => (
            <CategoryCard
              key={cat.id}
              cat={cat}
              defectCount={unitDefects.filter((d) => d.categoryId === cat.id).length}
              done={Boolean(catProg?.doneIds.includes(cat.id))}
              onClick={() => onOpenCategory(cat.id)}
            />
          ))}
      </div>

      {switchOpen && <UnitSwitcher onClose={() => setSwitchOpen(false)} />}
      {projectOpen && <ProjectSwitcher onClose={() => setProjectOpen(false)} />}
      {areasOpen && unit && (
        <UnitAreasEditor unitId={unit.id} onClose={() => setAreasOpen(false)} />
      )}
    </div>
  )
}

function CategoryCard({
  cat,
  defectCount,
  done,
  onClick,
}: {
  cat: ChecklistCategory
  defectCount: number
  done: boolean
  onClick: () => void
}) {
  const Icon = CATEGORY_ICONS[cat.name] ?? Square
  return (
    <button
      type="button"
      className="glass cat-card"
      onClick={onClick}
      style={
        done
          ? {
              background: 'linear-gradient(180deg, #e8f8ec 0%, #d7f0de 100%)',
              boxShadow: 'inset 0 0 0 1px rgba(0,97,0,0.18)',
            }
          : undefined
      }
    >
      <span className={`badge ${defectCount > 0 ? 'warn' : 'zero'}`}>{defectCount}</span>
      <div className="cat-icon" aria-hidden>
        <Icon size={20} strokeWidth={1.8} />
      </div>
      <div className="serif" style={{ fontSize: 18, fontWeight: 700 }}>{cat.name}</div>
      <div style={{ marginTop: 4, color: done ? '#006100' : 'var(--ink-soft)', fontSize: 12, fontWeight: 700 }}>
        {done ? '已查畢' : `${cat.itemCount} 細項`}
      </div>
    </button>
  )
}
