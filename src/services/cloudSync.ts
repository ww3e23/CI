import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore'
import { getDb, getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase'
import type { Defect, ProjectState } from '../types'
import type { MemberRole, ProjectMember, ProjectMeta, UserAccount } from '../types/auth'
import { pushProjectState } from './projectSync'

export { pullProjectState, pushProjectState, mergeProjectStates } from './projectSync'

function stripHeavyPhotos(defect: Defect): Record<string, unknown> {
  const plan = defect.planPhotoDataUrl
  const photos = defect.photoDataUrls ?? []
  return {
    ...defect,
    // Firestore 不適合放大 base64；已上 Storage 的才保留 URL
    planPhotoDataUrl: plan?.startsWith('http') ? plan : plan ? '[local-pending-upload]' : null,
    photoDataUrls: photos.map((p) => (p.startsWith('http') ? p : '[local-pending-upload]')),
    // 保留客戶端 ISO，供合併時可靠比較（serverTimestamp 拉回後曾被 String() 破壞）
    clientUpdatedAt: defect.updatedAt,
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
      // driveOwner* 由 Cloud Functions 寫入，前端勿覆蓋
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

/** 將完整現場狀態同步到 Firestore（棟別／範本／缺失／進度） */
export async function syncProjectStructure(
  projectId: string,
  state: ProjectState,
  meta?: Partial<ProjectMeta>,
): Promise<boolean> {
  return pushProjectState(projectId, state, meta)
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

export function cloudReady(): boolean {
  return isFirebaseConfigured()
}

/** 同步帳號目錄（不含密碼；登入以 Firebase Auth 為準） */
export async function syncUserAccount(user: UserAccount): Promise<boolean> {
  const db = getDb()
  if (!db) return false
  await setDoc(
    doc(db, 'users', user.id),
    {
      email: user.email,
      displayName: user.displayName,
      active: user.active,
      systemAdmin: Boolean(user.systemAdmin),
      createdAt: user.createdAt,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  return true
}

export async function deleteUserAccountDoc(userId: string): Promise<boolean> {
  const db = getDb()
  if (!db) return false
  await deleteDoc(doc(db, 'users', userId))
  return true
}

export async function syncProjectMember(member: ProjectMember): Promise<boolean> {
  const db = getDb()
  if (!db) return false
  await setDoc(
    doc(db, 'projectMembers', member.id),
    {
      userId: member.userId,
      projectId: member.projectId,
      role: member.role,
      joinedAt: member.joinedAt,
      invitedBy: member.invitedBy ?? null,
      userEmail: member.userEmail ? member.userEmail.toLowerCase() : null,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  )
  return true
}

export async function deleteProjectMemberDoc(memberId: string): Promise<boolean> {
  const db = getDb()
  if (!db) return false
  await deleteDoc(doc(db, 'projectMembers', memberId))
  return true
}

/** 拉取雲端帳號／成員／專案目錄（需已 Firebase 登入） */
export async function pullAuthDirectory(): Promise<{
  users: UserAccount[]
  members: ProjectMember[]
  projects: ProjectMeta[]
} | null> {
  const db = getDb()
  if (!db || !isFirebaseConfigured()) return null

  const auth = getFirebaseAuth()
  if (auth) {
    await auth.authStateReady()
    if (!auth.currentUser) return null
  }

  try {
    const [usersSnap, membersSnap, projectsSnap] = await Promise.all([
      getDocs(collection(db, 'users')),
      getDocs(collection(db, 'projectMembers')),
      getDocs(collection(db, 'projects')),
    ])

    const users: UserAccount[] = usersSnap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        email: String(data.email ?? ''),
        password: '', // 密碼不以雲端為準
        displayName: String(data.displayName ?? ''),
        active: data.active !== false,
        createdAt: String(data.createdAt ?? new Date().toISOString()),
        systemAdmin: Boolean(data.systemAdmin),
      }
    })

    const members: ProjectMember[] = membersSnap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        userId: String(data.userId ?? ''),
        projectId: String(data.projectId ?? ''),
        role: (data.role as MemberRole) ?? 'viewer',
        joinedAt: String(data.joinedAt ?? new Date().toISOString()),
        invitedBy: data.invitedBy ? String(data.invitedBy) : undefined,
        userEmail: data.userEmail ? String(data.userEmail) : undefined,
      }
    })

    const projects: ProjectMeta[] = projectsSnap.docs.map((d) => {
      const data = d.data()
      return {
        id: d.id,
        name: String(data.name ?? d.id),
        code: String(data.code ?? ''),
        location: String(data.location ?? ''),
        status: data.status === 'archived' ? 'archived' : 'active',
        createdAt: String(data.createdAt ?? new Date().toISOString()),
        driveFolderId: data.driveFolderId ? String(data.driveFolderId) : undefined,
        driveFolderUrl: data.driveFolderUrl ? String(data.driveFolderUrl) : undefined,
        driveOwnerConnected: Boolean(data.driveOwnerConnected),
        driveOwnerEmail: data.driveOwnerEmail ? String(data.driveOwnerEmail) : undefined,
      }
    })

    return { users, members, projects }
  } catch (err) {
    console.warn('[pullAuthDirectory] failed', err)
    return null
  }
}

export async function pullAuthDirectoryWithRetry(times = 3): Promise<{
  users: UserAccount[]
  members: ProjectMember[]
  projects: ProjectMeta[]
} | null> {
  let last: Awaited<ReturnType<typeof pullAuthDirectory>> = null
  for (let i = 0; i < times; i++) {
    last = await pullAuthDirectory()
    if (last) return last
    await new Promise((r) => setTimeout(r, 350 * (i + 1)))
  }
  return last
}
