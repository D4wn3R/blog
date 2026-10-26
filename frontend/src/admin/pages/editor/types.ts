// 编辑器与页面层共享的轻量类型（避免组件文件混合导出破坏 fast refresh）

export interface EditorStats {
  runes: number
  line: number
  col: number
  uploads: number // 正在上传的图片数（>0 时顶栏提示）
}
