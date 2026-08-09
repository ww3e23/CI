import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth'
import type { MemberRole, ProjectMember, ProjectMeta, UserAccount } from '../types/auth'
import { seedMembers, seedProjects, seedUsers } from '../data/authSeed'
import { accountDisplay, isValidAccountInput, normalizeLoginId } from '../lib/accountId'
import { createId } from '../lib/id'
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase'
import { APP_MIN_PASSWORD_LENGTH, isValidAppPassword, toFirebasePassword } from '../lib/password'
import {
  deleteProjectMemberDoc,
  deleteProjectMeta,
  deleteUserAccountDoc,
  pullAuthDirectory,
  syncProjectMember,
  syncProjectMeta,
  syncUserAccount,
} from '../services/cloudSync'
import {
  deleteFirebaseAuthUser,
  provisionFirebaseAuthUser,
} from '../services/firebaseAuthProvision'
import { useProjectStore } from './useProjectStore'

interface AuthState {
  users: UserAccount[]
  projects: ProjectMeta[]
  members: ProjectMember[]
  currentUserId: string | null
  currentProjectId: string | null
  /** 各專案上次選的戶別 */
  lastUnitByProject: Record<string, string | null>
}

interface AuthActions {
  login: (account: string, password: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => Promise<void>
  updateDisplayName: (name: string) => void
  switchProject: (projectId: string) => void
  upsertUser: (
    user: UserAccount,
    options?: { provisionFirebase?: boolean },
  ) => Promise<{ ok: boolean; firebaseMessage?: string; error?: string }>
  deleteUser: (userId: string) => Promise<{ ok: boolean; error?: string }>
  setUserActive: (userId: string, active: boolean) => void
  setMemberRole: (userId: string, projectId: string, role: MemberRole | null) => void
  upsertProject: (project: ProjectMeta) => void
  deleteProject: (projectId: string) => { ok: boolean; error?: string }
  resetAuthDemo: () => void
}

function findUserByAccount(users: UserAccount[], account: string): UserAccount[] {
  const raw = account.trim().toLowerCase()
  const loginId = normalizeLoginId(account)
  return users.filter((u) => {
    const stored = normalizeLoginId(u.email)
    if (stored === loginId) return true
    if (!raw.includes('@') && stored.split('@')[0] === raw) return true
    return false
  })
}

/** 雲端目錄合併進本機：保留本機密碼；雲端有、本機無則新增 */
function mergeDirectory(
  local: { users: UserAccount[]; members: ProjectMember[]; projects: ProjectMeta[] },
  remote: { users: UserAccount[]; members: ProjectMember[]; projects: ProjectMeta[] },
) {
  const localPwd = new Map(local.users.map((u) => [normalizeLoginId(u.email), u.password]))
  const localById = new Map(local.users.map((u) => [u.id, u]))

  const usersByEmail = new Map<string, UserAccount>()
  for (const u of local.users) usersByEmail.set(normalizeLoginId(u.email), u)
  for (const ru of remote.users) {
    const key = normalizeLoginId(ru.email)
    const existing = usersByEmail.get(key) ?? localById.get(ru.id)
    usersByEmail.set(key, {
      ...ru,
      id: existing?.id ?? ru.id,
      password: localPwd.get(key) || existing?.password || '',
      systemAdmin: existing?.systemAdmin || ru.systemAdmin,
    })
  }

  const memberMap = new Map<string, ProjectMember>()
  for (const m of [...local.members, ...remote.members]) {
    memberMap.set(`${m.userId}|${m.projectId}`, m)
  }
  const projectMap = new Map<string, ProjectMeta>()
  for (const p of [...local.projects, ...remote.projects]) {
    projectMap.set(p.id, p)
  }

  return {
    users: [...usersByEmail.values()],
    members: [...memberMap.values()],
    projects: [...projectMap.values()],
  }
}

function projectSlice(): Omit<AuthState, never> {
  return {
    users: seedUsers,
    projects: seedProjects,
    members: seedMembers,
    currentUserId: null,
    currentProjectId: null,
    lastUnitByProject: {},
  }
}

async function ensureFirebaseSession(email: string, appPassword: string) {
  const auth = getFirebaseAuth()
  if (!auth || !isFirebaseConfigured()) return { ok: true as const }
  const password = toFirebasePassword(appPassword)
  try {
    await signInWithEmailAndPassword(auth, email, password)
    return { ok: true as const }
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code
    if (code === 'auth/user-not-found' || code === 'auth/invalid-credential') {
      try {
        const cred = await createUserWithEmailAndPassword(auth, email, password)
        await updateProfile(cred.user, { displayName: email.split('@')[0] })
        return { ok: true as const }
      } catch (createErr: unknown) {
        // 可能是密碼錯，或帳號已存在但密碼不符
        const createCode = (createErr as { code?: string })?.code
        if (createCode === 'auth/email-already-in-use') {
          return { ok: false as const, error: 'Firebase 帳號密碼不符，請用 Firebase Authentication 中的密碼' }
        }
        return {
          ok: false as const,
          error: '無法建立 Firebase 登入工作階段，請確認 Authentication 已啟用',
        }
      }
    }
    if (code === 'auth/wrong-password') {
      return { ok: false as const, error: 'Firebase 密碼不正確' }
    }
    return {
      ok: false as const,
      error: 'Firebase 登入失敗，請確認 Authentication（Email/密碼）已啟用',
    }
  }
}

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      ...projectSlice(),

      login: async (account, password) => {
        const loginId = normalizeLoginId(account)
        if (!loginId || !password.trim()) {
          return { ok: false, error: '請輸入帳號與密碼' }
        }

        // 有 Firebase：先驗證 Auth，再拉取雲端帳號目錄（解決「後台新增後別台登不進去」）
        if (isFirebaseConfigured()) {
          const session = await ensureFirebaseSession(loginId, password)
          if (!session.ok) {
            // 若本機有帳號且密碼正確，仍允許本機登入（雲端尚未同步時）
            const localMatches = findUserByAccount(get().users, account)
            const localUser =
              localMatches.length === 1
                ? localMatches[0]
                : localMatches.find((u) => u.active) ?? localMatches[0]
            if (!localUser?.active || localUser.password !== password) {
              return session
            }
          } else {
            const remote = await pullAuthDirectory()
            if (remote) {
              const merged = mergeDirectory(
                {
                  users: get().users,
                  members: get().members,
                  projects: get().projects,
                },
                remote,
              )
              set({
                users: merged.users,
                members: merged.members,
                projects: merged.projects,
              })
            }
          }
        }

        let matches = findUserByAccount(get().users, account)
        let user = matches.length === 1 ? matches[0] : matches.find((u) => u.active) ?? matches[0]

        // Firebase 已通過，但目錄尚無此帳號：建立本機＋雲端基本資料
        if ((!user || !user.active) && isFirebaseConfigured()) {
          const auth = getFirebaseAuth()
          if (auth?.currentUser) {
            const created: UserAccount = {
              id: createId('user'),
              email: loginId,
              password: password.trim(),
              displayName: auth.currentUser.displayName || accountDisplay(loginId),
              active: true,
              createdAt: new Date().toISOString(),
            }
            set({ users: [...get().users, created] })
            void syncUserAccount(created)
            user = created
          }
        }

        if (!user || !user.active) {
          return {
            ok: false,
            error: matches.length > 1 ? '帳號不唯一，請改用完整帳號' : '帳號不存在或已停用',
          }
        }

        // 本機密碼核對；若 Firebase 已登入成功，以雲端為準並更新本機密碼快取
        const firebaseReady = Boolean(isFirebaseConfigured() && getFirebaseAuth()?.currentUser)
        if (user.password && user.password !== password && !firebaseReady) {
          return { ok: false, error: '帳號或密碼不正確' }
        }
        if (user.password !== password) {
          set({
            users: get().users.map((u) =>
              u.id === user!.id ? { ...u, password: password.trim() } : u,
            ),
          })
        }

        const memberships = get().members.filter((m) => m.userId === user!.id)
        const firstProject =
          memberships[0]?.projectId ??
          (user.systemAdmin ? get().projects[0]?.id ?? null : null)

        set({ currentUserId: user.id, currentProjectId: firstProject })
        if (firstProject) {
          useProjectStore.getState().loadProjectBundle(firstProject)
          const lastUnit = get().lastUnitByProject[firstProject]
          if (lastUnit) useProjectStore.getState().setCurrentUnit(lastUnit)
        } else {
          useProjectStore.getState().resetDemoData()
        }

        // 登入後把本機帳號目錄推上雲端（讓後台剛建的帳號其他裝置也能用）
        if (isFirebaseConfigured()) {
          const snapshot = get()
          void (async () => {
            try {
              await Promise.all(snapshot.users.map((u) => syncUserAccount(u)))
              await Promise.all(snapshot.members.map((m) => syncProjectMember(m)))
              await Promise.all(snapshot.projects.map((p) => syncProjectMeta(p)))
            } catch {
              /* ignore */
            }
          })()
        }

        return { ok: true }
      },

      logout: async () => {
        const { currentProjectId } = get()
        if (currentProjectId) {
          useProjectStore.getState().saveProjectBundle(currentProjectId)
        }
        set({ currentUserId: null })
        const auth = getFirebaseAuth()
        if (auth) {
          try {
            await signOut(auth)
          } catch {
            /* ignore */
          }
        }
      },

      updateDisplayName: (name) => {
        const id = get().currentUserId
        if (!id) return
        const displayName = name.trim()
        if (!displayName) return
        set({
          users: get().users.map((u) => (u.id === id ? { ...u, displayName } : u)),
        })
        const auth = getFirebaseAuth()
        if (auth?.currentUser) {
          void updateProfile(auth.currentUser, { displayName })
        }
      },

      switchProject: (projectId) => {
        const { currentUserId, currentProjectId, members } = get()
        if (!currentUserId) return
        const allowed =
          get().users.find((u) => u.id === currentUserId)?.systemAdmin ||
          members.some((m) => m.userId === currentUserId && m.projectId === projectId)
        if (!allowed) return

        if (currentProjectId) {
          const unitId = useProjectStore.getState().currentUnitId
          useProjectStore.getState().saveProjectBundle(currentProjectId)
          set({
            lastUnitByProject: {
              ...get().lastUnitByProject,
              [currentProjectId]: unitId,
            },
          })
        }

        set({ currentProjectId: projectId })
        useProjectStore.getState().loadProjectBundle(projectId)
        const lastUnit = get().lastUnitByProject[projectId]
        if (lastUnit) useProjectStore.getState().setCurrentUnit(lastUnit)
      },

      upsertUser: async (user, options) => {
        if (!isValidAccountInput(user.email)) {
          return {
            ok: false,
            error: '帳號格式不正確（可用 inspector01，或完整 email）',
          }
        }
        const loginId = normalizeLoginId(user.email)
        const nextUser: UserAccount = {
          ...user,
          email: loginId,
          displayName: user.displayName.trim(),
          password: user.password.trim(),
          active: true,
        }
        if (!nextUser.displayName) {
          return { ok: false, error: '請填寫顯示名稱與帳號' }
        }
        if (!isValidAppPassword(nextUser.password)) {
          return { ok: false, error: `密碼至少需 ${APP_MIN_PASSWORD_LENGTH} 碼` }
        }

        const duplicate = get().users.some(
          (u) => u.id !== nextUser.id && normalizeLoginId(u.email) === loginId,
        )
        if (duplicate) {
          return { ok: false, error: '此帳號已被使用' }
        }

        const shouldProvision = options?.provisionFirebase !== false
        let firebaseMessage: string | undefined

        if (shouldProvision && isFirebaseConfigured()) {
          const provision = await provisionFirebaseAuthUser({
            email: nextUser.email,
            password: nextUser.password,
            displayName: nextUser.displayName,
          })
          if (!provision.ok) {
            return { ok: false, error: provision.error || 'Firebase 登記失敗' }
          }
          if (provision.created) {
            firebaseMessage = '已同步建立 Firebase 登入（可用帳號密碼登入）'
          } else if (provision.alreadyExists) {
            firebaseMessage =
              '本機已儲存；Firebase 已有此帳號（若密碼不同，請在 Console 重設或沿用原密碼）'
          } else {
            firebaseMessage = provision.error
          }
        } else if (shouldProvision) {
          firebaseMessage = '尚未設定 Firebase，僅存本機帳號'
        }

        // 非管理者必須先指派至少一個專案，否則無法登入現場
        if (!nextUser.systemAdmin) {
          const joined = get().members.some((m) => m.userId === nextUser.id)
          if (!joined) {
            return {
              ok: false,
              error: '請先為此帳號加入至少一個專案，再儲存（否則無法登入）',
            }
          }
        }

        const users = [...get().users]
        const idx = users.findIndex((u) => u.id === nextUser.id)
        if (idx >= 0) users[idx] = nextUser
        else users.push(nextUser)
        set({ users })

        if (isFirebaseConfigured()) {
          try {
            await syncUserAccount(nextUser)
            const userMembers = get().members.filter((m) => m.userId === nextUser.id)
            await Promise.all(userMembers.map((m) => syncProjectMember(m)))
            firebaseMessage = firebaseMessage
              ? `${firebaseMessage}；帳號目錄已同步雲端`
              : '帳號目錄已同步雲端'
          } catch {
            firebaseMessage = firebaseMessage
              ? `${firebaseMessage}；雲端目錄同步失敗`
              : '本機已儲存，但雲端目錄同步失敗'
          }
        }

        return { ok: true, firebaseMessage }
      },

      deleteUser: async (userId) => {
        const target = get().users.find((u) => u.id === userId)
        if (!target) return { ok: false, error: '找不到帳號' }
        if (target.id === get().currentUserId) {
          return { ok: false, error: '無法刪除目前登入中的帳號' }
        }
        if (target.systemAdmin) {
          const otherAdmins = get().users.filter((u) => u.systemAdmin && u.id !== userId && u.active)
          if (otherAdmins.length === 0) {
            return { ok: false, error: '至少需保留一位系統管理者' }
          }
        }

        if (isFirebaseConfigured() && target.password) {
          const removed = await deleteFirebaseAuthUser({
            email: target.email,
            password: target.password,
          })
          if (!removed.ok) {
            return { ok: false, error: removed.error || '無法刪除 Firebase 登入' }
          }
        }

        const removedMembers = get().members.filter((m) => m.userId === userId)
        set({
          users: get().users.filter((u) => u.id !== userId),
          members: get().members.filter((m) => m.userId !== userId),
          currentUserId: get().currentUserId === userId ? null : get().currentUserId,
        })

        if (isFirebaseConfigured()) {
          void deleteUserAccountDoc(userId)
          for (const m of removedMembers) {
            void deleteProjectMemberDoc(m.id)
          }
        }
        return { ok: true }
      },

      setUserActive: (userId, active) => {
        const users = get().users.map((u) => (u.id === userId ? { ...u, active } : u))
        set({ users })
        const user = users.find((u) => u.id === userId)
        if (user && isFirebaseConfigured()) {
          void syncUserAccount(user)
        }
      },

      setMemberRole: (userId, projectId, role) => {
        const members = [...get().members]
        const idx = members.findIndex((m) => m.userId === userId && m.projectId === projectId)
        let removed: ProjectMember | null = null
        let upserted: ProjectMember | null = null
        if (role === null) {
          if (idx >= 0) {
            removed = members[idx]
            members.splice(idx, 1)
          }
        } else if (idx >= 0) {
          members[idx] = { ...members[idx], role }
          upserted = members[idx]
        } else {
          upserted = {
            id: createId('pm'),
            userId,
            projectId,
            role,
            joinedAt: new Date().toISOString(),
            invitedBy: get().currentUserId ?? undefined,
          }
          members.push(upserted)
        }
        set({ members })
        if (isFirebaseConfigured()) {
          if (removed) void deleteProjectMemberDoc(removed.id)
          if (upserted) void syncProjectMember(upserted)
        }
      },

      upsertProject: (project) => {
        const projects = [...get().projects]
        const idx = projects.findIndex((p) => p.id === project.id)
        const isNew = idx < 0
        if (idx >= 0) projects[idx] = project
        else {
          projects.push(project)
          useProjectStore.getState().ensureProjectBundle(project.id, project.name)
        }
        set({ projects })
        if (isFirebaseConfigured()) {
          void syncProjectMeta(project)
        }
        // 系統管理者建立專案後若尚未選專案，自動進入以便查看
        if (isNew) {
          const me = get().users.find((u) => u.id === get().currentUserId)
          if (me?.systemAdmin && !get().currentProjectId) {
            get().switchProject(project.id)
          }
        }
      },

      deleteProject: (projectId) => {
        const { projects, currentProjectId, members, lastUnitByProject } = get()
        const target = projects.find((p) => p.id === projectId)
        if (!target) return { ok: false, error: '找不到專案' }

        if (currentProjectId) {
          useProjectStore.getState().saveProjectBundle(currentProjectId)
        }

        const nextProjects = projects.filter((p) => p.id !== projectId)
        const nextMembers = members.filter((m) => m.projectId !== projectId)
        const nextLast = { ...lastUnitByProject }
        delete nextLast[projectId]

        let nextCurrent = currentProjectId
        if (currentProjectId === projectId) {
          nextCurrent = nextProjects[0]?.id ?? null
        }

        set({
          projects: nextProjects,
          members: nextMembers,
          lastUnitByProject: nextLast,
          currentProjectId: nextCurrent,
        })

        useProjectStore.getState().removeProjectBundle(projectId)
        if (nextCurrent && nextCurrent !== currentProjectId) {
          useProjectStore.getState().loadProjectBundle(nextCurrent)
          const lastUnit = nextLast[nextCurrent]
          if (lastUnit) useProjectStore.getState().setCurrentUnit(lastUnit)
        } else if (!nextCurrent) {
          useProjectStore.getState().resetDemoData()
        }

        if (isFirebaseConfigured()) {
          void deleteProjectMeta(projectId)
        }
        return { ok: true }
      },

      resetAuthDemo: () => {
        set(projectSlice())
        useProjectStore.getState().resetDemoData()
      },
    }),
    {
      name: 'site-auth-v2',
      version: 2,
    },
  ),
)

export function useCurrentUser() {
  return useAuthStore((s) => s.users.find((u) => u.id === s.currentUserId) ?? null)
}

export function useCurrentProject() {
  return useAuthStore((s) => s.projects.find((p) => p.id === s.currentProjectId) ?? null)
}

export function useCurrentRole(): MemberRole | null {
  return useAuthStore((s) => {
    if (!s.currentUserId || !s.currentProjectId) return null
    const user = s.users.find((u) => u.id === s.currentUserId)
    if (user?.systemAdmin) return 'admin'
    return (
      s.members.find(
        (m) => m.userId === s.currentUserId && m.projectId === s.currentProjectId,
      )?.role ?? null
    )
  })
}
