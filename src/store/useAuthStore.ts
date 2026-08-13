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
  pullAuthDirectoryWithRetry,
  syncProjectMember,
  syncProjectMeta,
  syncUserAccount,
} from '../services/cloudSync'
import {
  deleteFirebaseAuthUser,
  provisionFirebaseAuthUser,
} from '../services/firebaseAuthProvision'
import { useProjectStore } from './useProjectStore'
import { bindCurrentActorGetter } from '../lib/currentActor'

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
  refreshDirectory: () => Promise<{ ok: boolean; error?: string }>
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

/** 同一 email 可能有多個舊 id；收斂成一個 canonical id，並修正成員指派 */
function canonicalizeDirectory(input: {
  users: UserAccount[]
  members: ProjectMember[]
  projects: ProjectMeta[]
}) {
  const usersByEmail = new Map<string, UserAccount>()
  for (const u of input.users) {
    const key = normalizeLoginId(u.email)
    if (!key) continue
    const prev = usersByEmail.get(key)
    if (!prev) {
      usersByEmail.set(key, u)
      continue
    }
    usersByEmail.set(key, {
      ...prev,
      ...u,
      // 固定用先出現的 id，避免成員 userId 對不上
      id: prev.id,
      password: prev.password || u.password,
      displayName: u.displayName || prev.displayName,
      active: prev.active !== false && u.active !== false,
      systemAdmin: Boolean(prev.systemAdmin || u.systemAdmin),
    })
  }

  const idRemap = new Map<string, string>()
  for (const u of input.users) {
    const canon = usersByEmail.get(normalizeLoginId(u.email))
    if (canon) idRemap.set(u.id, canon.id)
  }

  const memberMap = new Map<string, ProjectMember>()
  for (const m of input.members) {
    const userId = idRemap.get(m.userId) ?? m.userId
    const next = { ...m, userId }
    memberMap.set(`${next.userId}|${next.projectId}`, next)
  }

  const projectMap = new Map<string, ProjectMeta>()
  for (const p of input.projects) projectMap.set(p.id, p)

  return {
    users: [...usersByEmail.values()],
    members: [...memberMap.values()],
    projects: [...projectMap.values()],
  }
}

/** 雲端目錄合併進本機：保留本機密碼；並修正成員 userId */
function mergeDirectory(
  local: { users: UserAccount[]; members: ProjectMember[]; projects: ProjectMeta[] },
  remote: { users: UserAccount[]; members: ProjectMember[]; projects: ProjectMeta[] },
) {
  return canonicalizeDirectory({
    users: [...local.users, ...remote.users],
    members: [...local.members, ...remote.members],
    projects: [...local.projects, ...remote.projects],
  })
}

function membershipsForUser(
  members: ProjectMember[],
  users: UserAccount[],
  user: UserAccount,
): ProjectMember[] {
  const email = normalizeLoginId(user.email)
  const ids = new Set(
    users.filter((u) => normalizeLoginId(u.email) === email).map((u) => u.id),
  )
  ids.add(user.id)
  return members.filter(
    (m) =>
      ids.has(m.userId) ||
      (m.userEmail ? normalizeLoginId(m.userEmail) === email : false),
  )
}

export function userCanAccessProject(
  user: UserAccount | null | undefined,
  projectId: string,
  members: ProjectMember[],
  users: UserAccount[],
): boolean {
  if (!user) return false
  if (user.systemAdmin) return true
  return membershipsForUser(members, users, user).some((m) => m.projectId === projectId)
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

        // 有 Firebase：先驗證 Auth，再拉取雲端帳號目錄
        if (isFirebaseConfigured()) {
          const session = await ensureFirebaseSession(loginId, password)
          if (!session.ok) {
            const localMatches = findUserByAccount(get().users, account)
            const localUser =
              localMatches.length === 1
                ? localMatches[0]
                : localMatches.find((u) => u.active) ?? localMatches[0]
            if (!localUser?.active || localUser.password !== password) {
              return session
            }
          } else {
            const remote = await pullAuthDirectoryWithRetry(4)
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
            } else {
              const local = canonicalizeDirectory({
                users: get().users,
                members: get().members,
                projects: get().projects,
              })
              set(local)
            }
          }
        } else {
          const local = canonicalizeDirectory({
            users: get().users,
            members: get().members,
            projects: get().projects,
          })
          set(local)
        }

        let matches = findUserByAccount(get().users, account)
        let user = matches.length === 1 ? matches[0] : matches.find((u) => u.active) ?? matches[0]

        // Firebase 已通過，但目錄尚無此帳號：若成員指派有同 email，沿用其 userId
        if ((!user || !user.active) && isFirebaseConfigured()) {
          const auth = getFirebaseAuth()
          if (auth?.currentUser) {
            const memberHit = get().members.find(
              (m) => m.userEmail && normalizeLoginId(m.userEmail) === loginId,
            )
            const created: UserAccount = {
              id: memberHit?.userId || createId('user'),
              email: loginId,
              password: password.trim(),
              displayName: auth.currentUser.displayName || accountDisplay(loginId),
              active: true,
              createdAt: new Date().toISOString(),
            }
            const nextUsers = [...get().users.filter((u) => u.id !== created.id), created]
            const healed = canonicalizeDirectory({
              users: nextUsers,
              members: get().members,
              projects: get().projects,
            })
            set(healed)
            void syncUserAccount(created)
            user = findUserByAccount(healed.users, account)[0] ?? created
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

        // 再收斂一次，並把「同 email 的舊成員指派」掛回此帳號
        const healed = canonicalizeDirectory({
          users: get().users,
          members: get().members,
          projects: get().projects,
        })
        const healedMembers = membershipsForUser(healed.members, healed.users, user).map((m) => ({
          ...m,
          userId: user!.id,
          userEmail: normalizeLoginId(user!.email),
        }))
        const memberMap = new Map(healed.members.map((m) => [`${m.userId}|${m.projectId}`, m]))
        for (const m of healedMembers) memberMap.set(`${m.userId}|${m.projectId}`, m)
        const nextMembers = [...memberMap.values()]
        set({ users: healed.users, members: nextMembers, projects: healed.projects })

        const projectIds = new Set(get().projects.map((p) => p.id))
        const allMemberships = membershipsForUser(nextMembers, healed.users, user)
        const knownMemberships = allMemberships.filter((m) => projectIds.has(m.projectId))
        const firstProject =
          knownMemberships[0]?.projectId ??
          allMemberships[0]?.projectId ??
          (user.systemAdmin
            ? get().projects.find((p) => p.status === 'active')?.id ?? get().projects[0]?.id ?? null
            : null)

        // 有指派但專案目錄缺漏時，補上空白專案殼，避免被當成「未指派」
        if (firstProject && !projectIds.has(firstProject)) {
          const shell: ProjectMeta = {
            id: firstProject,
            name: firstProject,
            code: '',
            location: '',
            status: 'active',
            createdAt: new Date().toISOString(),
          }
          set({ projects: [...get().projects, shell] })
          useProjectStore.getState().ensureProjectBundle(firstProject, shell.name)
          void syncProjectMeta(shell)
        }

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
          // 登出前先把現場資料推上雲端，避免滑掉 App／換裝置後遺失
          await useProjectStore.getState().flushSyncNow()
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
        const { currentUserId, currentProjectId, members, users } = get()
        if (!currentUserId) return
        const me = users.find((u) => u.id === currentUserId)
        const allowed = userCanAccessProject(me, projectId, members, users)
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

        // 補上成員的 userEmail，方便手機端對應
        const email = normalizeLoginId(nextUser.email)
        const patchedMembers = get().members.map((m) =>
          m.userId === nextUser.id ? { ...m, userEmail: email } : m,
        )
        set({ members: patchedMembers })

        if (isFirebaseConfigured()) {
          try {
            await syncUserAccount(nextUser)
            const userMembers = patchedMembers.filter((m) => m.userId === nextUser.id)
            await Promise.all(userMembers.map((m) => syncProjectMember(m)))
            // 一併推送專案目錄，避免手機端只有成員沒有專案名稱
            await Promise.all(get().projects.map((p) => syncProjectMeta(p)))
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
        const targetUser = get().users.find((u) => u.id === userId)
        const userEmail = targetUser ? normalizeLoginId(targetUser.email) : undefined
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
          members[idx] = { ...members[idx], role, userEmail: userEmail ?? members[idx].userEmail }
          upserted = members[idx]
        } else {
          upserted = {
            id: createId('pm'),
            userId,
            projectId,
            role,
            joinedAt: new Date().toISOString(),
            invitedBy: get().currentUserId ?? undefined,
            userEmail,
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
          void syncProjectMeta(project).catch((err) => {
            console.warn('[syncProjectMeta] failed', err)
          })
        }
        // 系統管理者建立專案後若尚未選專案，自動進入以便查看
        if (isNew) {
          const me = get().users.find((u) => u.id === get().currentUserId)
          if (me?.systemAdmin && !get().currentProjectId) {
            get().switchProject(project.id)
          }
        }
      },

      refreshDirectory: async () => {
        if (!isFirebaseConfigured()) {
          return { ok: false, error: '尚未設定 Firebase' }
        }
        const auth = getFirebaseAuth()
        if (auth) await auth.authStateReady()
        if (!auth?.currentUser) {
          return { ok: false, error: '請先登入後再同步' }
        }
        const permissionHint =
          'Firestore 規則未允許讀寫。請到 Firebase Console → 專案 ci-inspection → Firestore → 規則，貼上本專案 firestore.rules 後按「發布」，再重新登入並同步。'

        // 先把本機目錄推上雲端，再拉回來（電腦建的資料可到手機）
        try {
          const snap = get()
          await Promise.all(snap.users.map((u) => syncUserAccount(u)))
          await Promise.all(
            snap.members.map((m) => {
              const u = snap.users.find((x) => x.id === m.userId)
              return syncProjectMember({
                ...m,
                userEmail: m.userEmail || (u ? normalizeLoginId(u.email) : undefined),
              })
            }),
          )
          await Promise.all(snap.projects.map((p) => syncProjectMeta(p)))
        } catch (err) {
          console.warn('[refreshDirectory] push failed', err)
          const msg = err instanceof Error ? err.message : String(err)
          if (/permission|insufficient/i.test(msg)) {
            return { ok: false, error: permissionHint }
          }
        }

        const remote = await pullAuthDirectoryWithRetry(4)
        if (!remote) {
          return {
            ok: false,
            error: `${permissionHint}（若已發布仍失敗，請確認網路與已用 Email 登入 Firebase）`,
          }
        }
        const merged = mergeDirectory(
          {
            users: get().users,
            members: get().members,
            projects: get().projects,
          },
          remote,
        )
        const me = merged.users.find((u) => u.id === get().currentUserId)
        let nextMembers = merged.members
        if (me) {
          const fixed = membershipsForUser(merged.members, merged.users, me).map((m) => ({
            ...m,
            userId: me.id,
            userEmail: normalizeLoginId(me.email),
          }))
          const map = new Map(merged.members.map((m) => [`${m.userId}|${m.projectId}`, m]))
          for (const m of fixed) map.set(`${m.userId}|${m.projectId}`, m)
          nextMembers = [...map.values()]
        }
        set({
          users: merged.users,
          members: nextMembers,
          projects: merged.projects,
        })

        const currentId = get().currentUserId
        const currentUser = get().users.find((u) => u.id === currentId)
        if (currentUser && !get().currentProjectId) {
          const ms = membershipsForUser(get().members, get().users, currentUser)
          const pid = ms[0]?.projectId
          if (pid) get().switchProject(pid)
        }
        return { ok: true }
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

// 專案 store 寫活動／缺失時用目前登入者姓名（避免循環 import）
bindCurrentActorGetter(() => {
  const s = useAuthStore.getState()
  const u = s.users.find((x) => x.id === s.currentUserId)
  if (!u) {
    return { name: '現場查驗', accountHint: '', isSystemAdmin: false }
  }
  const email = (u.email || '').trim()
  const accountHint =
    (email.includes('@') ? email.split('@')[0] : '') ||
    accountDisplay(email) ||
    email ||
    ''
  const rawName = (u.displayName || '').trim()
  // 系統管理者／佔位顯示名：現場紀錄改用帳號提示（a11897…）
  const invalidDisplay =
    !rawName ||
    rawName === '現場查驗' ||
    rawName === '现场查验' ||
    rawName === '系統管理者' ||
    rawName === '系统管理者'
  const name = !invalidDisplay ? rawName : accountHint || '現場查驗'
  return {
    name,
    accountHint,
    isSystemAdmin: Boolean(u.systemAdmin),
  }
})
