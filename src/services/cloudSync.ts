import {
  collection,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { getDb, isFirebaseConfigured } from '../lib/firebase'
import type { BuildingRule, Defect, ProjectState } from '../types'

/** 將棟別規則與缺失同步到 Firestore（有設定 Firebase 時） */
export async function syncProjectStructure(state: ProjectState): Promise<boolean> {
  const db = getDb()
  if (!db) return false
  const projectId = 'default'
  const projectRef = doc(db, 'projects', projectId)
  await setDoc(
    projectRef,
    {
      name: state.projectName,
      updatedAt: serverTimestamp(),
      mode: 'site-inspection',
    },
    { merge: true },
  )

  for (const b of state.buildings) {
    await setDoc(doc(db, 'projects', projectId, 'buildings', b.id), serializeBuilding(b), {
      merge: true,
    })
  }
  return true
}

export async function syncDefect(defect: Defect): Promise<boolean> {
  const db = getDb()
  if (!db) return false
  const projectId = 'default'
  await setDoc(
    doc(collection(db, 'projects', projectId, 'defects'), defect.id),
    {
      ...defect,
      updatedAt: serverTimestamp(),
      createdAt: defect.createdAt,
    },
    { merge: true },
  )
  return true
}

function serializeBuilding(b: BuildingRule) {
  return {
    name: b.name,
    floors: b.floors,
    unitCodes: b.unitCodes,
    naKeys: b.naKeys,
    sortOrder: b.sortOrder,
    active: b.active,
  }
}

export function cloudReady(): boolean {
  return isFirebaseConfigured()
}
