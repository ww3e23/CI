import {
  collection,
  deleteDoc,
  doc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { getDb, isFirebaseConfigured } from '../lib/firebase'
import type { BuildingRule, Defect, ProjectState } from '../types'
import type { ProjectMeta } from '../types/auth'

function stripHeavyPhotos(defect: Defect): Record<string, unknown> {
  const plan = defect.planPhotoDataUrl
  const photos = defect.photoDataUrls ?? []
  return {
    ...defect,
    // Firestore 不適合放大 base64；已上 Storage 的才保留 URL
    planPhotoDataUrl: plan?.startsWith('http') ? plan : plan ? '[local-pending-upload]' : null,
    photoDataUrls: photos.map((p) => (p.startsWith('http') ? p : '[local-pending-upload]')),
    updatedAt: serverTimestamp(),
    createdAt: defect.createdAt,
  }
}

export async function syncProjectMeta(project: ProjectMeta): Promise<boolean> {
  const db = getDb()
  if (!db) return false
  await setDoc(
    doc(db, 'projects', project.id),
    {
      name: project.name,
      code: project.code,
      location: project.location,
      status: project.status,
      driveFolderId: project.driveFolderId ?? null,
      driveFolderUrl: project.driveFolderUrl ?? null,
      updatedAt: serverTimestamp(),
      mode: 'site-inspection',
    },
    { merge: true },
  )
  return true
}

/** 刪除雲端專案文件（子集合建物／缺失需另行清理，此處先移除專案本體） */
export async function deleteProjectMeta(projectId: string): Promise<boolean> {
  const db = getDb()
  if (!db) return false
  await deleteDoc(doc(db, 'projects', projectId))
  return true
}

/** 將棟別規則與缺失同步到 Firestore（有設定 Firebase 時） */
export async function syncProjectStructure(
  projectId: string,
  state: ProjectState,
  meta?: Partial<ProjectMeta>,
): Promise<boolean> {
  const db = getDb()
  if (!db) return false
  const projectRef = doc(db, 'projects', projectId)
  await setDoc(
    projectRef,
    {
      name: meta?.name ?? state.projectName,
      code: meta?.code,
      location: meta?.location,
      status: meta?.status,
      driveFolderId: meta?.driveFolderId ?? null,
      driveFolderUrl: meta?.driveFolderUrl ?? null,
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

export async function syncDefect(projectId: string, defect: Defect): Promise<boolean> {
  const db = getDb()
  if (!db) return false
  await setDoc(
    doc(collection(db, 'projects', projectId, 'defects'), defect.id),
    stripHeavyPhotos(defect),
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
