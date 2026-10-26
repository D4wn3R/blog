// 浏览器本地防丢稿缓存（纯前端行为，不涉及后端 D-no-draft 契约）：
// key 按 id/'new' 区分，存 title/contentMd/savedAt；提交成功清除。

const KEY_PREFIX = 'blog.editor-draft:'

export interface DraftData {
  title: string
  contentMd: string
  savedAt: number
}

export function draftKey(id: string | null): string {
  return `${KEY_PREFIX}${id ?? 'new'}`
}

export function loadDraft(id: string | null): DraftData | null {
  try {
    const raw = localStorage.getItem(draftKey(id))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<DraftData>
    if (typeof parsed.title !== 'string' || typeof parsed.contentMd !== 'string') return null
    return {
      title: parsed.title,
      contentMd: parsed.contentMd,
      savedAt: typeof parsed.savedAt === 'number' ? parsed.savedAt : 0,
    }
  } catch {
    // JSON 损坏等异常按无草稿处理
    return null
  }
}

export function saveDraft(id: string | null, title: string, contentMd: string): void {
  const data: DraftData = { title, contentMd, savedAt: Date.now() }
  try {
    localStorage.setItem(draftKey(id), JSON.stringify(data))
  } catch {
    // 存储满/隐私模式等场景静默降级：缓存只是兜底，不阻塞编辑
  }
}

export function clearDraft(id: string | null): void {
  try {
    localStorage.removeItem(draftKey(id))
  } catch {
    // 同上
  }
}

// 是否存在「比基准内容更新」的草稿：编辑回显后，草稿内容与基准任一不同且非空即视为可恢复。
// contentMd 用 rune 计数粗判：内容一致时长度相等（同源字符串），避免整串比较的额外开销无意义——
// 这里直接整串比较，语义清晰，正文最长 16MiB 也在可接受范围
export function hasRecoverableDraft(
  draft: DraftData | null,
  baseTitle: string,
  baseContentMd: string,
): boolean {
  if (!draft) return false
  if (draft.title === baseTitle && draft.contentMd === baseContentMd) return false
  return draft.title !== '' || draft.contentMd !== ''
}
