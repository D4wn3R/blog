// 后端契约类型：字段名与 docs/API 各文档的 JSON 输出一一对应（snake_case 原样）
import type { PageDTO } from './page'

// --- 认证（auth.md） ---

export interface UserDTO {
  id: number
  username: string
  email: string
  avatar: string
  role: 'admin' | 'user'
}

export interface TokenPair {
  access_token: string
  expires_in: number
  refresh_token: string
  user: UserDTO
}

// --- 文章（article.md） ---

export interface ArticleListItem {
  id: number
  slug: string
  title: string
  summary: string
  cover_url: string
  category_name: string
  tags: string[]
  pinned: boolean
  minutes: number
  published_at: string | null
  views: number
  has_password: boolean
}

export interface AdminArticleListItem extends ArticleListItem {
  status: 1 | 2
  created_at: string
}

export interface ArticleDetail {
  id: number
  slug: string
  title: string
  summary: string
  cover_url: string
  has_password: boolean
  content_md: string
  unlocked: boolean
  pinned: boolean
  minutes: number
  published_at: string | null
  views: number
  category: { id: number; name: string }
  tags: { id: number; name: string }[]
}

// #A5 全字段回显：#A4 列表项 + 正文/表单编辑所需字段（tags 覆盖为 {id,name}，区别于列表项的名字数组）
export interface AdminArticleDetail extends Omit<AdminArticleListItem, 'tags'> {
  content_md: string
  category_id: number
  tags: { id: number; name: string }[]
}

export interface UnlockResult {
  unlock_token: string
  expires_in: number
}

export interface IdName {
  id: number
  name: string
}

export interface ArchiveItem {
  year: string
  month: string
  count: number
}

// --- 评论（comment.md） ---

export interface CommentUser {
  id: number
  username: string
  avatar: string
}

export interface CommentNode {
  id: number
  parent_id: number
  root_id: number
  user: CommentUser
  reply_to?: { id: number; username: string }
  content: string
  created_at: string
  deleted?: boolean
  replies?: CommentNode[]
}

// --- 动态（moment.md） ---

export interface MomentDTO {
  id: number
  content: string
  images: string[]
  created_at: string
}

// --- 友链（friend-link.md） ---

export interface FriendLinkDTO {
  id: number
  name: string
  url: string
  description: string
  image: string
}

// --- 关于页（about.md） ---

export interface ProfileDTO {
  nickname: string
  title_en: string
  bio: string
}

export interface SettingsDTO {
  hero_prefix: string
  hero_accent: string
  hero_tagline: string
  site_title: string
  site_name: string
  site_url: string
  site_desc: string
  site_image: string
}

export interface SkillDTO {
  id: number
  name: string
  percent: number
  items: string[]
}

export interface ProjectDTO {
  id: number
  name: string
  url: string
  description: string
  tags: string[]
}

export interface JourneyDTO {
  id: number
  time: string
  title: string
  description: string
  tags: string[]
}

export interface ContactDTO {
  id: number
  label: string
  value: string
  icon: string
}

export interface AboutAggregate {
  profile: ProfileDTO
  settings: SettingsDTO
  skills: SkillDTO[]
  projects: ProjectDTO[]
  journey: JourneyDTO[]
  contacts: ContactDTO[]
}

// --- 上传（upload.md） ---

export interface UploadResult {
  public_url: string
  object_key: string
}

export type { PageDTO }
