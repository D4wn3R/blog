// 复制到剪贴板：优先异步 Clipboard API（仅安全上下文可用），
// 不可用或被拒时回退 execCommand('copy')（HTTP 部署/旧浏览器）。
// 复制是尽力而为的交互：失败返回 false 由调用方展示失败态，绝不把异常抛给 React
export async function copyText(value: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value)
      return true
    } catch {
      // 权限拒绝/非安全上下文：继续走下方兜底
    }
  }
  return copyByExecCommand(value)
}

// execCommand 兜底：临时 textarea 选中后复制，用完即移除（不污染焦点与 DOM）。
// 环境未实现 execCommand（部分内嵌浏览器/jsdom）时直接判失败，不抛异常
function copyByExecCommand(value: string): boolean {
  if (typeof document.execCommand !== 'function') return false
  const ta = document.createElement('textarea')
  ta.value = value
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '-9999px'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  const ok = document.execCommand('copy')
  ta.remove()
  return ok
}