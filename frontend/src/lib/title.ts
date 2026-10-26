// 标签页标题：site_title（B 端站点管理的覆盖项）优先，未配置时用 site_name；
// 两者皆空则保持现值不动
import type { SettingsDTO } from '../types/api'

export function applySiteTitle(s: Pick<SettingsDTO, 'site_title' | 'site_name'>): void {
  const name = s.site_title.trim() || s.site_name.trim()
  if (name) document.title = name
}
