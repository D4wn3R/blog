import { useEffect, useRef } from 'react'
import { EditorView, keymap } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { cyberEditorExtensions } from './cm-theme'
import { countRunes } from './toolbar'
import { insertPickedImages } from './upload'
import type { EditorStats } from './types'

interface MarkdownEditorProps {
  value: string
  onChange: (v: string) => void
  onStats: (s: EditorStats) => void
  /** Ctrl/Cmd+S：返回 true 表示快捷键已被保存动作消费 */
  onSave: () => boolean
  /** 挂载后回传 EditorView（工具栏动作需要），卸载时回传 null */
  onReady: (view: EditorView | null) => void
  /** 初始挂载后聚焦正文 */
  autoFocus?: boolean
}

// CM6 封装：受控 value 只在「外部值 ≠ 编辑器当前值」时替换（避免每次 keystroke 全量 reset 丢光标）；
// 粘贴/拖拽图片自动上传并在落点插入
export function MarkdownEditor({
  value,
  onChange,
  onStats,
  onSave,
  onReady,
  autoFocus,
}: MarkdownEditorProps) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  // 回调经 ref 透传进扩展，避免依赖变化导致编辑器重装
  const cbRef = useRef({ onChange, onStats, onSave })
  cbRef.current = { onChange, onStats, onSave }

  useEffect(() => {
    const host = hostRef.current
    if (!host) return

    const isImageFile = (f: File) => f.type.startsWith('image/')

    const view = new EditorView({
      parent: host,
      doc: value,
      extensions: [
        cyberEditorExtensions,
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        EditorView.lineWrapping,
        EditorState.allowMultipleSelections.of(true),
        keymap.of([
          {
            key: 'Mod-s',
            preventDefault: true,
            run: () => cbRef.current.onSave(),
          },
        ]),
        EditorView.domEventHandlers({
          paste: (event, v) => {
            const files = [...(event.clipboardData?.files ?? [])].filter(isImageFile)
            if (files.length === 0) return false
            event.preventDefault()
            void insertPickedImages(v, files, cbRef.current.onStats)
            return true
          },
          drop: (event, v) => {
            const files = [...(event.dataTransfer?.files ?? [])].filter(isImageFile)
            if (files.length === 0) return false
            event.preventDefault()
            // 拖放落点优先于当前光标
            const pos = v.posAtCoords({ x: event.clientX, y: event.clientY })
            if (pos !== null) v.dispatch({ selection: { anchor: pos } })
            void insertPickedImages(v, files, cbRef.current.onStats)
            return true
          },
        }),
        EditorView.updateListener.of((u) => {
          if (u.docChanged) cbRef.current.onChange(u.state.doc.toString())
          const head = u.state.selection.main.head
          const line = u.state.doc.lineAt(head)
          cbRef.current.onStats({
            runes: countRunes(u.state.doc.toString()),
            line: line.number,
            col: head - line.from + 1,
            uploads: 0,
          })
        }),
      ],
    })
    viewRef.current = view
    onReady(view)
    if (autoFocus) view.focus()

    return () => {
      view.destroy()
      viewRef.current = null
      onReady(null)
    }
    // 挂载一次；value 经下方同步 effect 流入
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外部 value → 编辑器（仅当不一致时替换，保护光标与 undo 历史）
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    if (view.state.doc.toString() === value) return
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    })
  }, [value])

  return <div ref={hostRef} className="min-h-0 flex-1 overflow-hidden" />
}
