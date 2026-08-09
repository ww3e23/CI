export type MemberRole = 'admin' | 'inspector' | 'viewer'

export interface UserAccount {
  id: string
  email: string
  /** 示範用明文；正式環境改 passwordHash */
  password: string
  displayName: string
  active: boolean
  createdAt: string
  /** 系統超級管理者（可進後台） */
  systemAdmin?: boolean
}

export interface ProjectMeta {
  id: string
  name: string
  code: string
  location: string
  status: 'active' | 'archived'
  createdAt: string
}

export interface ProjectMember {
  id: string
  userId: string
  projectId: string
  role: MemberRole
  joinedAt: string
  invitedBy?: string
}

export const ROLE_LABEL: Record<MemberRole, string> = {
  admin: '管理者',
  inspector: '查驗人員',
  viewer: '僅查看',
}

export const ROLE_TONE: Record<MemberRole, string> = {
  admin: 'role-admin',
  inspector: 'role-inspector',
  viewer: 'role-viewer',
}
