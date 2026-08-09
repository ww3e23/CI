import type { ProjectMember, ProjectMeta, UserAccount } from '../types/auth'

export const seedUsers: UserAccount[] = [
  {
    id: 'user_chen',
    email: 'inspector01@site.tw',
    password: 'demo1234',
    displayName: '陳工地',
    active: true,
    createdAt: '2026-01-10T00:00:00.000Z',
  },
  {
    id: 'user_lin',
    email: 'viewer01@site.tw',
    password: 'demo1234',
    displayName: '林查看',
    active: true,
    createdAt: '2026-02-01T00:00:00.000Z',
  },
  {
    id: 'user_admin',
    email: 'admin@site.tw',
    password: 'admin1234',
    displayName: '系統管理者',
    active: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    systemAdmin: true,
  },
  {
    id: 'user_disabled',
    email: 'old@site.tw',
    password: 'demo1234',
    displayName: '舊帳號',
    active: false,
    createdAt: '2025-06-01T00:00:00.000Z',
  },
]

export const seedProjects: ProjectMeta[] = [
  {
    id: 'proj_qingchuan',
    name: '晴川院子',
    code: 'YS-2026-A',
    location: '新竹市東區',
    status: 'active',
    createdAt: '2026-01-05T00:00:00.000Z',
  },
  {
    id: 'proj_songtao',
    name: '松濤匯',
    code: 'YS-2025-C',
    location: '新竹市香山區',
    status: 'active',
    createdAt: '2025-08-12T00:00:00.000Z',
  },
  {
    id: 'proj_hean',
    name: '河岸敘',
    code: 'YS-2026-B',
    location: '竹北市',
    status: 'active',
    createdAt: '2026-03-01T00:00:00.000Z',
  },
]

export const seedMembers: ProjectMember[] = [
  {
    id: 'pm_chen_qc',
    userId: 'user_chen',
    projectId: 'proj_qingchuan',
    role: 'inspector',
    joinedAt: '2026-01-12T00:00:00.000Z',
  },
  {
    id: 'pm_chen_st',
    userId: 'user_chen',
    projectId: 'proj_songtao',
    role: 'viewer',
    joinedAt: '2026-02-02T00:00:00.000Z',
  },
  {
    id: 'pm_chen_ha',
    userId: 'user_chen',
    projectId: 'proj_hean',
    role: 'admin',
    joinedAt: '2026-03-05T00:00:00.000Z',
  },
  {
    id: 'pm_lin_qc',
    userId: 'user_lin',
    projectId: 'proj_qingchuan',
    role: 'viewer',
    joinedAt: '2026-02-10T00:00:00.000Z',
  },
  {
    id: 'pm_admin_qc',
    userId: 'user_admin',
    projectId: 'proj_qingchuan',
    role: 'admin',
    joinedAt: '2026-01-05T00:00:00.000Z',
  },
  {
    id: 'pm_admin_st',
    userId: 'user_admin',
    projectId: 'proj_songtao',
    role: 'admin',
    joinedAt: '2025-08-12T00:00:00.000Z',
  },
  {
    id: 'pm_admin_ha',
    userId: 'user_admin',
    projectId: 'proj_hean',
    role: 'admin',
    joinedAt: '2026-03-01T00:00:00.000Z',
  },
]
