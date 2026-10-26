import type { KeyboardEvent } from 'react'

// 多行输入统一键盘约定：Enter 提交 / Shift+Enter 换行。
// 输入法组合态（中文选词回车）不触发提交，避免选词时误发送。
export interface EnterKeyEvent {
  key: string
  shiftKey: boolean
  nativeEvent: { isComposing: boolean; keyCode: number }
}

export function isSubmitEnter(e: EnterKeyEvent): boolean {
  return (
    e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && e.nativeEvent.keyCode !== 229
  )
}

export function onEnterSubmit(e: KeyboardEvent<HTMLTextAreaElement>, submit: () => void): void {
  if (!isSubmitEnter(e)) return
  e.preventDefault()
  submit()
}
