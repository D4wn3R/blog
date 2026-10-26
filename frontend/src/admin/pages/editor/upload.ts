import type { EditorView } from '@codemirror/view'
import { uploadImage } from '../../components/ImageUpload'
import { countRunes } from './toolbar'
import type { EditorStats } from './types'

// 选中的图片经 uploadImage 逐张上传后，在光标处插入 Markdown 图语法
// （粘贴/拖拽/工具栏选图共用）
export async function insertPickedImages(
  view: EditorView,
  files: File[],
  onStats: (s: EditorStats) => void,
): Promise<void> {
  let uploading = files.length
  const report = () =>
    onStats({
      runes: countRunes(view.state.doc.toString()),
      line: 0,
      col: 0,
      uploads: uploading,
    })
  report()
  try {
    for (const file of files) {
      let url: string
      try {
        url = await uploadImage(file)
      } catch {
        continue // 单张失败不中断其余；错误经全局 toast 提示
      }
      const pos = view.state.selection.main.head
      const insert = `![](${url})\n`
      view.dispatch({
        changes: { from: pos, insert },
        selection: { anchor: pos + insert.length },
        scrollIntoView: true,
      })
    }
  } finally {
    uploading -= files.length
    report()
  }
}
