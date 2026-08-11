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
  /** Google 雲端硬碟資料夾 ID（每個建案可不同） */
  driveFolderId?: string
  /** 方便顯示的完整資料夾網址 */
  driveFolderUrl?: string
  /** 後台已綁定「雲端硬碟擁有者」（現場免各自登 Google） */
  driveOwnerConnected?: boolean
  /** 綁定的 Google 帳號（僅顯示用） */
  driveOwnerEmail?: string
}

export interface ProjectMember {
  id: string
  userId: string
  projectId: string
  role: MemberRole
  joinedAt: string
  invitedBy?: string
  /** 冗餘存放，方便手機端即使用戶 id 不一致也能對上指派 */
  userEmail?: string
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
