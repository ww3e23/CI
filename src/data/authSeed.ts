import type { ProjectMember, ProjectMeta, UserAccount } from '../types/auth'

/** 僅保留系統管理者；其餘帳號／專案由後台自行建立 */
export const seedUsers: UserAccount[] = [
  {
    id: 'user_admin',
    email: 'admin@site.tw',
    password: 'admin1234',
    displayName: '系統管理者',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    systemAdmin: true,
  },
]

export const seedProjects: ProjectMeta[] = []

export const seedMembers: ProjectMember[] = []
