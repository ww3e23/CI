import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { MemberRole, ProjectMember, ProjectMeta, UserAccount } from '../types/auth'
import { seedMembers, seedProjects, seedUsers } from '../data/authSeed'
import { createId } from '../lib/id'
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
  login: (email: string, password: string) => { ok: boolean; error?: string }
  logout: () => void
  updateDisplayName: (name: string) => void
  switchProject: (projectId: string) => void
  upsertUser: (user: UserAccount) => void
  setUserActive: (userId: string, active: boolean) => void
  setMemberRole: (userId: string, projectId: string, role: MemberRole | null) => void
  upsertProject: (project: ProjectMeta) => void
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

export const useAuthStore = create<AuthState & AuthActions>()(
  persist(
    (set, get) => ({
      ...projectSlice(),

      login: (email, password) => {
        const user = get().users.find(
          (u) => u.email.toLowerCase() === email.trim().toLowerCase(),
        )
        if (!user || !user.active) {
          return { ok: false, error: '帳號不存在或已停用' }
        }
        if (user.password !== password) {
          return { ok: false, error: '帳號或密碼不正確' }
        }
        const memberships = get().members.filter((m) => m.userId === user.id)
        const firstProject =
          memberships[0]?.projectId ??
          (user.systemAdmin ? get().projects[0]?.id : null)
        if (!firstProject) {
          return { ok: false, error: '此帳號尚未被指派任何專案' }
        }
        set({ currentUserId: user.id, currentProjectId: firstProject })
        useProjectStore.getState().loadProjectBundle(firstProject)
        const lastUnit = get().lastUnitByProject[firstProject]
        if (lastUnit) useProjectStore.getState().setCurrentUnit(lastUnit)
        return { ok: true }
      },

      logout: () => {
        const { currentProjectId } = get()
        if (currentProjectId) {
          useProjectStore.getState().saveProjectBundle(currentProjectId)
        }
        set({ currentUserId: null })
      },

      updateDisplayName: (name) => {
        const id = get().currentUserId
        if (!id) return
        const displayName = name.trim()
        if (!displayName) return
        set({
          users: get().users.map((u) => (u.id === id ? { ...u, displayName } : u)),
        })
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

      upsertUser: (user) => {
        const users = [...get().users]
        const idx = users.findIndex((u) => u.id === user.id)
        if (idx >= 0) users[idx] = user
        else users.push(user)
        set({ users })
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
      },

      resetAuthDemo: () => set(projectSlice()),
    }),
    {
      name: 'site-auth-v1',
      version: 1,
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
