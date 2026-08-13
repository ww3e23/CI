import type { ChecklistCategory, ChecklistItem } from '../types'

type CatDef = {
  id: string
  name: string
  iconChar: string
  color: string
  items: string[]
}

/** 預設查驗範本（門／窗／天花板／粉刷牆面／地壁磚／木地板） */
const DEFAULT_CATS: CatDef[] = [
  {
    id: 'cat_door',
    name: '門',
    iconChar: '門',
    color: '#2F5D4C',
    items: [
      '門鎖是否可以正常上鎖開鎖。',
      '鎖頭與鎖孔正確密合，不致鬆動?',
      '玄關門開啟及關閉是否有雜音?',
      '門片有無撞傷，凹損或脫漆、鏽蝕?',
      '門止是否存在，並且未經損壞?',
      '門扇關閉與地坪縫隙是否過大',
      '門扇關閉是否平整?門框是否閉合?',
    ],
  },
  {
    id: 'cat_window',
    name: '窗',
    iconChar: '窗',
    color: '#3C6E8F',
    items: [
      '是否可緊密閉合，上鎖不致鬆動?',
      '氣密窗上鎖時軌道孔氣密壓條是否閉鎖',
      '窗扇推拉時是否順暢',
      '窗框及玻璃的表面，是否有刮傷，破裂存在',
      '安裝水平與垂直度檢查',
      '框體與牆體接縫處檢查',
      '窗毛氈密封條，矽利康及排水孔檢查',
    ],
  },
  {
    id: 'cat_ceiling',
    name: '天花板',
    iconChar: '頂',
    color: '#A67C52',
    items: ['粉刷是否平整', '顏色是否均勻', '有無龜裂情形', '油漆有無脫落'],
  },
  {
    id: 'cat_paint',
    name: '粉刷牆面',
    iconChar: '牆',
    color: '#AE4C3B',
    items: [
      '粉刷是否平整',
      '顏色是否均勻',
      '有無龜裂情形',
      '油漆有無脫落，明顯之刷痕',
      '有無發霉情形',
      '檢查開關插座等電蓋板旁，是否有破口情形',
      '過牆套管孔隙是否填塞',
      '梁柱是否平整',
    ],
  },
  {
    id: 'cat_tile',
    name: '地壁磚',
    iconChar: '磚',
    color: '#6B7C8A',
    items: ['磁磚是否空心', '填縫是否確認，有無汙染', '收邊矽利康是否破損'],
  },
  {
    id: 'cat_wood',
    name: '木地板',
    iconChar: '木',
    color: '#8B6B4A',
    items: ['木地板是否平整', '收邊矽利康是否破損'],
  },
]

export function buildDefaultChecklist(): {
  categories: ChecklistCategory[]
  checklistItems: ChecklistItem[]
} {
  const categories: ChecklistCategory[] = []
  const checklistItems: ChecklistItem[] = []

  DEFAULT_CATS.forEach((cat, catIndex) => {
    categories.push({
      id: cat.id,
      name: cat.name,
      iconChar: cat.iconChar,
      color: cat.color,
      itemCount: cat.items.length,
      sortOrder: catIndex,
      active: true,
    })
    cat.items.forEach((description, itemIndex) => {
      checklistItems.push({
        id: `${cat.id}_item_${itemIndex + 1}`,
        categoryId: cat.id,
        description,
        sortOrder: itemIndex,
        active: true,
      })
    })
  })

  return { categories, checklistItems }
}
