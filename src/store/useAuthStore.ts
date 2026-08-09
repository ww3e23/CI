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
import { isValidAccountInput, normalizeLoginId } from '../lib/accountId'
import { createId } from '../lib/id'
import { getFirebaseAuth, isFirebaseConfigured } from '../lib/firebase'
import { deleteProjectMeta, syncProjectMeta } from '../services/cloudSync'
import { provisionFirebaseAuthUser } from '../services/firebaseAuthProvision'
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
  setUserActive: (userId: string, active: boolean) => void
  setMemberRole: (userId: string, projectId: string, role: MemberRole | null) => void
  upsertProject: (project: ProjectMeta) => void
  deleteProject: (projectId: string) => { ok: boolean; error?: string }
  resetAuthDemo: () => void
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

async function ensureFirebaseSession(email: string, password: string) {
  const auth = getFirebaseAuth()
  if (!auth || !isFirebaseConfigured()) return { ok: true as const }
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
        const raw = account.trim().toLowerCase()
        const loginId = normalizeLoginId(account)
        const matches = get().users.filter((u) => {
          const stored = normalizeLoginId(u.email)
          if (stored === loginId) return true
          // 允許只輸入 @ 前的帳號（例如 admin@site.tw → admin）
          if (!raw.includes('@') && stored.split('@')[0] === raw) return true
          return false
        })
        const user = matches.length === 1 ? matches[0] : matches.find((u) => u.active) ?? matches[0]
        if (!user || !user.active) {
          return { ok: false, error: matches.length > 1 ? '帳號不唯一，請改用完整帳號' : '帳號不存在或已停用' }
        }
        if (user.password !== password) {
          return { ok: false, error: '帳號或密碼不正確' }
        }

        if (isFirebaseConfigured()) {
          const session = await ensureFirebaseSession(normalizeLoginId(user.email), password)
          if (!session.ok) return session
        }

        const memberships = get().members.filter((m) => m.userId === user.id)
        const firstProject =
          memberships[0]?.projectId ??
          (user.systemAdmin ? get().projects[0]?.id ?? null : null)

        // 系統管理者可在尚無專案時登入，進後台建立
        if (!firstProject && !user.systemAdmin) {
          return { ok: false, error: '此帳號尚未被指派任何專案' }
        }

        set({ currentUserId: user.id, currentProjectId: firstProject })
        if (firstProject) {
          useProjectStore.getState().loadProjectBundle(firstProject)
          const lastUnit = get().lastUnitByProject[firstProject]
          if (lastUnit) useProjectStore.getState().setCurrentUnit(lastUnit)
        } else {
          useProjectStore.getState().resetDemoData()
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
        if (!nextUser.password || nextUser.password.length < 6) {
          return { ok: false, error: '密碼至少需 6 碼（Firebase 規定）' }
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

        const users = [...get().users]
        const idx = users.findIndex((u) => u.id === nextUser.id)
        if (idx >= 0) users[idx] = nextUser
        else users.push(nextUser)
        set({ users })
        return { ok: true, firebaseMessage }
      },

      setUserActive: (userId, active) => {
        set({
          users: get().users.map((u) => (u.id === userId ? { ...u, active } : u)),
        })
      },

      setMemberRole: (userId, projectId, role) => {
        const members = [...get().members]
        const idx = members.findIndex((m) => m.userId === userId && m.projectId === projectId)
        if (role === null) {
          if (idx >= 0) members.splice(idx, 1)
        } else if (idx >= 0) {
          members[idx] = { ...members[idx], role }
        } else {
          members.push({
            id: createId('pm'),
            userId,
            projectId,
            role,
            joinedAt: new Date().toISOString(),
            invitedBy: get().currentUserId ?? undefined,
          })
        }
        set({ members })
      },

      upsertProject: (project) => {
        const projects = [...get().projects]
        const idx = projects.findIndex((p) => p.id === project.id)
        if (idx >= 0) projects[idx] = project
        else {
          projects.push(project)
          useProjectStore.getState().ensureProjectBundle(project.id, project.name)
        }
        set({ projects })
        if (isFirebaseConfigured()) {
          void syncProjectMeta(project)
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
