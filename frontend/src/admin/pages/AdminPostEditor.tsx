import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { ArrowLeft, Gear, ImageSquare, FloppyDisk } from '@phosphor-icons/react'
import { zodResolver } from '@hookform/resolvers/zod'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ApiError, api, errMsg } from '../../lib/api'
import { renderMarkdown } from '../../lib/markdown'
import { renderMermaidIn } from '../../lib/mermaid'
import type { AdminArticleDetail, IdName } from '../../types/api'
import { useAllCategories, useAllTags, useAdminArticle } from '../queries'
import { insertPickedImages } from './editor/upload'
import type { EditorStats } from './editor/types'
import { Button, LinkButton } from '../components/ui'
import { applyToolbarAction, countRunes, type ToolbarAction } from './editor/toolbar'
import { clearDraft, hasRecoverableDraft, loadDraft, saveDraft } from './editor/draft'
import { PublishDrawer } from './editor/PublishDrawer'

// CodeMirror 随编辑器路由 chunk 懒加载（掘金同款为 CodeMirror 系）
const MarkdownEditor = lazy(() =>
  import('./editor/MarkdownEditor').then((m) => ({ default: m.MarkdownEditor })),
)

// 发布状态两态（契约 D-no-draft：无草稿）
type Status = 1 | 2

// 表单按 UI 形状建模：categoryName/tagNames 为展示值，提交时映射为 id；
// password 三态（#A7）不进 RHF（null 语义与 string 冲突），独立 state 提交时合并
const editorSchema = z.object({
  title: z.string().trim().min(1, '标题必填'),
  slug: z.string().trim().min(1, 'SLUG 必填'),
  categoryName: z.string().min(1, '请选择或新建分类'),
  tagNames: z.array(z.string()),
  cover: z.string(),
  pinned: z.boolean(),
  status: z.union([z.literal(1), z.literal(2)]),
  contentMd: z.string(),
  summary: z.string(),
})

type EditorValues = z.infer<typeof editorSchema>

type ViewMode = 'edit' | 'split' | 'preview'

// 工具栏动作表（掘金式单行工具栏）
const TOOLBAR_ITEMS: { label: string; title: string; action: ToolbarAction }[] = [
  { label: 'H1', title: '一级标题', action: { kind: 'heading', level: 1 } },
  { label: 'H2', title: '二级标题', action: { kind: 'heading', level: 2 } },
  { label: 'B', title: '粗体', action: { kind: 'wrap', token: '**', placeholder: '粗体文字' } },
  { label: 'I', title: '斜体', action: { kind: 'wrap', token: '*', placeholder: '斜体文字' } },
  { label: 'S', title: '删除线', action: { kind: 'wrap', token: '~~', placeholder: '删除文字' } },
  { label: '`', title: '行内代码', action: { kind: 'wrap', token: '`', placeholder: '代码' } },
  { label: '引用', title: '引用', action: { kind: 'quote' } },
  { label: 'UL', title: '无序列表', action: { kind: 'ul' } },
  { label: 'OL', title: '有序列表', action: { kind: 'ol' } },
  { label: '任务', title: '任务列表', action: { kind: 'task' } },
  { label: '</>', title: '代码块', action: { kind: 'codeblock' } },
  { label: '🔗', title: '链接', action: { kind: 'link' } },
  { label: '表格', title: '表格', action: { kind: 'table' } },
  { label: '—', title: '分隔线', action: { kind: 'hr' } },
]

// 阅读分钟口径与后端 calcMinutes 一致：400 字/分钟、不足 1 记 1（backend article.go）
const READING_CHARS_PER_MIN = 400

const VIEW_LABELS: Record<ViewMode, string> = { edit: '编辑', split: '分屏', preview: '预览' }

export function AdminPostEditor() {
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const editId = searchParams.get('id')
  const editing = editId !== null && editId !== ''

  // password 三态（#A7）：null = 不变（提交省略字段，防静默取消加密）；'' = 显式取消加密；非空 = 设置/修改
  const [password, setPassword] = useState<string | null>(null)
  const [hasPassword, setHasPassword] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>(() =>
    window.innerWidth >= 1024 ? 'split' : 'edit',
  )
  const [stats, setStats] = useState<EditorStats>({ runes: 0, line: 1, col: 1, uploads: 0 })
  const [previewHtml, setPreviewHtml] = useState('')
  const [autosaveNote, setAutosaveNote] = useState<'idle' | 'saved'>('idle')
  const [draftNotice, setDraftNotice] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)

  const categoriesQuery = useAllCategories()
  const tagsQuery = useAllTags()
  const detailQuery = useAdminArticle(editing ? editId : null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    getValues,
    formState: { isSubmitting, errors },
  } = useForm<EditorValues>({
    resolver: zodResolver(editorSchema),
    defaultValues: {
      title: '',
      slug: '',
      categoryName: '',
      tagNames: [],
      cover: '',
      pinned: false,
      status: 1,
      contentMd: '',
      summary: '',
    },
  })

  const contentMd = watch('contentMd')
  const title = watch('title')
  const categories = useMemo(() => categoriesQuery.data ?? [], [categoriesQuery.data])
  const tags = useMemo(() => tagsQuery.data ?? [], [tagsQuery.data])
  const tagPool = useMemo(() => tags.map((t) => t.name), [tags])
  const tagIdByName = useMemo(() => new Map(tags.map((t) => [t.name, t.id])), [tags])

  // —— 编辑回显（#A5 全字段）+ 本地草稿恢复 ——
  // 回显完成时以服务端内容为基准；草稿可恢复则提示（恢复与否都以回显内容为脏检查基准）
  const baseRef = useRef<{ title: string; contentMd: string } | null>(null)
  const restoreRef = useRef<(() => void) | null>(null)

  useEffect(() => {
    if (!detailQuery.data) return
    const d: AdminArticleDetail = detailQuery.data
    reset({
      title: d.title,
      slug: d.slug,
      categoryName: d.category_name,
      tagNames: d.tags.map((t) => t.name),
      cover: d.cover_url || '',
      pinned: d.pinned,
      status: d.status as Status,
      contentMd: d.content_md,
      summary: d.summary,
    })
    setHasPassword(d.has_password)
    baseRef.current = { title: d.title, contentMd: d.content_md }

    const draft = loadDraft(editId)
    if (draft && hasRecoverableDraft(draft, d.title, d.content_md)) {
      setDraftNotice(true)
      restoreRef.current = () => {
        setValue('title', draft.title, { shouldDirty: true })
        setValue('contentMd', draft.contentMd, { shouldDirty: true })
        setDraftNotice(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detailQuery.data, reset])

  // 新建模式：本地草稿恢复（无服务端基准，草稿非空即可恢复）。
  // 基准恒为空内容：恢复草稿或输入任意内容后即视为脏，离开时确认
  useEffect(() => {
    if (editing) return
    baseRef.current = { title: '', contentMd: '' }
    const draft = loadDraft(null)
    if (draft && hasRecoverableDraft(draft, '', '')) {
      setDraftNotice(true)
      restoreRef.current = () => {
        setValue('title', draft.title, { shouldDirty: true })
        setValue('contentMd', draft.contentMd, { shouldDirty: true })
        setDraftNotice(false)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing])

  // —— 防丢稿：title/contentMd 防抖 800ms 写入 localStorage ——
  const draftTimerRef = useRef<number | undefined>(undefined)
  const autosaveTimerRef = useRef<number | undefined>(undefined)
  useEffect(
    () => () => {
      window.clearTimeout(draftTimerRef.current)
      window.clearTimeout(autosaveTimerRef.current)
    },
    [],
  )

  useEffect(() => {
    if (!title && !contentMd) return // 空初始态不写缓存
    window.clearTimeout(draftTimerRef.current)
    draftTimerRef.current = window.setTimeout(() => {
      saveDraft(editId, title, contentMd)
      setAutosaveNote('saved')
      window.clearTimeout(autosaveTimerRef.current)
      autosaveTimerRef.current = window.setTimeout(() => setAutosaveNote('idle'), 2000)
    }, 800)
  }, [title, contentMd, editId])

  // —— 预览：防抖渲染 + mermaid 异步补渲染 ——
  const previewRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const t = window.setTimeout(() => setPreviewHtml(renderMarkdown(contentMd)), 300)
    return () => window.clearTimeout(t)
  }, [contentMd])
  useEffect(() => {
    if (viewMode === 'edit' || !previewRef.current || !previewHtml) return
    void renderMermaidIn(previewRef.current)
  }, [previewHtml, viewMode])

  // —— 脏检查：当前 title/contentMd ≠ 回显基准（恢复草稿后基准仍为回显值，离开时同样提示）——
  const base = baseRef.current
  const dirty = useMemo(() => {
    if (!base) return false
    return title !== base.title || contentMd !== base.contentMd
  }, [base, title, contentMd])
  const dirtyRef = useRef(dirty)
  dirtyRef.current = dirty
  const savedRef = useRef(false) // 提交成功后放行
  const pendingNavRef = useRef<string | null>(null)

  const leave = useCallback(
    (to: string) => {
      if (!dirtyRef.current || savedRef.current) {
        navigate(to)
        return
      }
      pendingNavRef.current = to
      setConfirmLeave(true)
    },
    [navigate],
  )
  const back = useCallback(() => leave('/admin/posts'), [leave])

  // 浏览器后退不做 popstate 拦截：声明式 <BrowserRouter> 下 react-router 先于页面监听器
  // 更新 location，组件会先被卸载，哨兵时序不可靠。数据安全由三层兜底：
  // 页面内返回确认（leave）+ beforeunload（关标签页）+ 本地草稿防抖缓存（误退可恢复）

  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current && !savedRef.current) e.preventDefault()
    }
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [])

  // —— 工具栏：动作作用到 CM 实例（view 由 MarkdownEditor 挂载时回传）——
  const cmViewRef = useRef<import('@codemirror/view').EditorView | null>(null)
  const [editorReady, setEditorReady] = useState(false)
  const onEditorReady = useCallback((view: import('@codemirror/view').EditorView | null) => {
    cmViewRef.current = view
    setEditorReady(view !== null)
  }, [])

  const runAction = (action: ToolbarAction) => {
    const view = cmViewRef.current
    if (!view) return
    view.dispatch(applyToolbarAction(view.state, action))
    view.focus()
  }

  // 分类/标签：输入即建（沿用原 #A10/#A13/40900 并发处理）
  const createCategory = async (name: string): Promise<string | null> => {
    const hit = categories.find((c) => c.name === name)
    if (hit) {
      setValue('categoryName', hit.name, { shouldDirty: true })
      return null
    }
    try {
      const c = await api.post<IdName>('/api/admin/categories', { name }, true)
      qc.setQueryData<IdName[]>(['admin', 'categories'], (prev) =>
        prev?.some((x) => x.id === c.id) ? prev : [...(prev ?? []), c],
      )
      setValue('categoryName', c.name, { shouldDirty: true })
      return null
    } catch (e) {
      if (e instanceof ApiError && e.code === 40900) {
        const r = await api.get<{ list: IdName[] }>('/api/categories').catch(() => null)
        if (r) {
          qc.setQueryData(['admin', 'categories'], r.list)
          const again = r.list.find((x) => x.name === name)
          if (again) {
            setValue('categoryName', again.name, { shouldDirty: true })
            return null
          }
        }
      }
      return e instanceof Error ? e.message : '创建分类失败，请重试'
    }
  }

  const createTag = async (name: string): Promise<string | null> => {
    const tagNames = getValues('tagNames')
    const hit = tags.find((t) => t.name === name)
    if (hit) {
      setValue('tagNames', tagNames.includes(name) ? tagNames : [...tagNames, name], {
        shouldDirty: true,
      })
      return null
    }
    try {
      const tag = await api.post<IdName>('/api/admin/tags', { name }, true)
      qc.setQueryData<IdName[]>(['admin', 'tags'], (prev) =>
        prev?.some((t) => t.id === tag.id) ? prev : [...(prev ?? []), tag],
      )
      return null
    } catch (e) {
      if (e instanceof ApiError && e.code === 40900) {
        const r = await api.get<{ list: IdName[] }>('/api/tags').catch(() => null)
        if (r) {
          qc.setQueryData(['admin', 'tags'], r.list)
          setValue('tagNames', tagNames.includes(name) ? tagNames : [...tagNames, name], {
            shouldDirty: true,
          })
          return null
        }
      }
      return e instanceof Error ? e.message : '创建标签失败，请重试'
    }
  }

  // —— 提交：抽屉确认或 Ctrl+S；成功清草稿/失效列表缓存/跳列表 ——
  const doSubmit = handleSubmit(async (values) => {
    setSaveErr(null)
    try {
      const missing = values.tagNames.filter((n) => !tagIdByName.has(n))
      if (missing.length > 0) throw new Error(`标签尚未创建：${missing.join('、')}`)
      const cat = categories.find((c) => c.name === values.categoryName)
      if (!cat) throw new Error('请选择或新建分类')
      const body: Record<string, unknown> = {
        title: values.title,
        slug: values.slug,
        content_md: values.contentMd,
        summary: values.summary,
        cover_url: values.cover,
        category_id: cat.id,
        tag_ids: values.tagNames.map((n) => tagIdByName.get(n) as number),
        pinned: values.pinned,
        status: values.status,
      }
      if (editing) {
        if (password !== null) body.password = password
      } else if (password) {
        body.password = password
      }
      if (editing) await api.put(`/api/admin/articles/${editId}`, body)
      else await api.post('/api/admin/articles', body, true)
      savedRef.current = true
      clearDraft(editId)
      qc.invalidateQueries({ queryKey: ['admin', 'articles'] })
      qc.invalidateQueries({ queryKey: ['admin', 'article-counts'] })
      toast.success(editing ? '文章已更新' : '文章已发布')
      navigate('/admin/posts')
    } catch (e) {
      setSaveErr(e instanceof Error ? e.message : '保存失败，请稍后重试')
      setDrawerOpen(true)
    }
  })

  const onEditorSave = useCallback(() => {
    void doSubmit()
    return true
  }, [doSubmit])

  // 全局 Ctrl/Cmd+S：编辑器内由 CM keymap 先处理（preventDefault 标记），此处兜底标题框等焦点
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        if (e.defaultPrevented) return
        e.preventDefault()
        void doSubmit()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doSubmit])

  const onStats = useCallback((s: EditorStats) => {
    setStats((prev) => {
      // 图片上传回调只带 uploads：保留上次的行:列，避免状态栏闪成 0
      const line = s.line > 0 ? s.line : prev.line
      const col = s.line > 0 ? s.col : prev.col
      if (
        prev.runes === s.runes &&
        prev.line === line &&
        prev.col === col &&
        prev.uploads === s.uploads
      ) {
        return prev
      }
      return { runes: s.runes, line, col, uploads: s.uploads }
    })
  }, [])

  const loading =
    categoriesQuery.isPending || tagsQuery.isPending || (editing && detailQuery.isPending)
  const loadError = categoriesQuery.isError
    ? errMsg(categoriesQuery.error)
    : tagsQuery.isError
      ? errMsg(tagsQuery.error)
      : detailQuery.isError
        ? errMsg(detailQuery.error)
        : null

  const minutes = Math.max(1, Math.ceil(countRunes(contentMd) / READING_CHARS_PER_MIN))

  if (loading) {
    return (
      <div className="p-8">
        <p className="font-mono text-sm text-faint">loading...</p>
      </div>
    )
  }

  if (loadError) {
    return (
      <div className="p-8">
        <p className="rounded-md border border-pulse/60 bg-pulse/10 px-4 py-2.5 text-sm text-pulse">
          {loadError}
        </p>
        <LinkButton variant="secondary" size="sm" to="/admin/posts" className="mt-4">
          ← 返回文章列表
        </LinkButton>
      </div>
    )
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      {/* 顶栏：返回 / 标题 / 草稿恢复 / 自动保存态 / 设置 / 保存（全屏页天然置顶） */}
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-edge bg-panel px-3">
        <Button
          variant="ghost"
          size="sm"
          aria-label="返回文章列表"
          onClick={back}
          className="!px-2"
        >
          <ArrowLeft size={16} />
        </Button>
        <input
          {...register('title')}
          placeholder="输入文章标题…"
          className="h-10 min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 text-lg font-bold text-ink placeholder:text-faint transition-colors hover:border-edge focus:border-neon/40 focus:outline-none"
          aria-label="文章标题"
        />
        {draftNotice && (
          <span className="hidden shrink-0 items-center gap-2 text-xs text-dim sm:flex">
            检测到未保存草稿
            <button
              type="button"
              onClick={() => restoreRef.current?.()}
              className="text-neon transition-colors hover:underline"
            >
              恢复
            </button>
            <button
              type="button"
              onClick={() => {
                clearDraft(editId)
                setDraftNotice(false)
              }}
              className="text-faint transition-colors hover:text-pulse"
            >
              丢弃
            </button>
          </span>
        )}
        <span
          aria-live="polite"
          className="hidden shrink-0 font-mono text-[11px] text-faint md:block"
        >
          {autosaveNote === 'saved'
            ? '✓ 已存本地'
            : stats.uploads > 0
              ? `图片上传中 ×${stats.uploads}`
              : ''}
        </span>
        <Button variant="ghost" size="sm" onClick={() => setDrawerOpen(true)}>
          <Gear size={15} />
          <span className="hidden sm:inline">设置</span>
        </Button>
        <Button variant="primary" size="sm" loading={isSubmitting} onClick={() => void doSubmit()}>
          <FloppyDisk size={14} />
          保存
        </Button>
      </header>

      {(saveErr || errors.title || errors.slug || errors.categoryName) && (
        <p className="shrink-0 border-b border-pulse/60 bg-pulse/10 px-4 py-2 text-sm text-pulse">
          {saveErr ?? errors.title?.message ?? errors.slug?.message ?? errors.categoryName?.message}
        </p>
      )}

      {/* 工具栏（掘金式）：右侧为 编辑/分屏/预览 三态切换 */}
      <div className="flex h-10 shrink-0 items-center gap-0.5 overflow-x-auto border-b border-edge bg-panel px-2">
        {TOOLBAR_ITEMS.map((item) => (
          <button
            key={item.title}
            type="button"
            title={item.title}
            aria-label={item.title}
            onClick={() => runAction(item.action)}
            className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded px-1.5 font-mono text-xs text-dim transition-colors hover:bg-panel-2 hover:text-neon"
          >
            {item.label}
          </button>
        ))}
        <EditorPickImageButton
          disabled={!editorReady}
          onPick={(files) => {
            const view = cmViewRef.current
            if (!view || files.length === 0) return
            view.dispatch({ selection: { anchor: view.state.selection.main.head } })
            insertPickedImages(view, files, onStats)
          }}
        />
        <div className="ml-auto flex shrink-0 items-center gap-0.5 pl-2">
          {(Object.keys(VIEW_LABELS) as ViewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setViewMode(m)}
              className={
                viewMode === m
                  ? 'flex h-7 items-center rounded bg-neon/10 px-2 font-mono text-xs text-neon'
                  : 'flex h-7 items-center rounded px-2 font-mono text-xs text-dim transition-colors hover:bg-panel-2 hover:text-ink'
              }
            >
              {VIEW_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      {/* 主工作区：编辑/预览分栏。编辑器常挂载（CSS 显隐切换），
          避免三态切换时卸载 CM 实例丢 undo 历史与光标；纯预览态隐藏编辑侧 */}
      <div className="flex min-h-0 flex-1">
        <section
          className={
            viewMode === 'preview' ? 'hidden' : 'flex min-w-0 flex-1 flex-col border-r border-edge'
          }
        >
          <Suspense
            fallback={<div className="p-6 font-mono text-xs text-faint">editor loading...</div>}
          >
            <MarkdownEditor
              value={contentMd}
              onChange={(v) => setValue('contentMd', v, { shouldDirty: true })}
              onStats={onStats}
              onSave={onEditorSave}
              onReady={onEditorReady}
              autoFocus
            />
          </Suspense>
        </section>
        {viewMode !== 'edit' && (
          <section className="min-w-0 flex-1 overflow-y-auto bg-void">
            <div
              ref={previewRef}
              className="md-cyber min-h-full px-6 py-6"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </section>
        )}
      </div>

      {/* 状态栏：字数 / 阅读分钟 / 行:列 */}
      <footer className="flex h-8 shrink-0 items-center gap-4 border-t border-edge bg-panel px-3 font-mono text-[11px] text-faint">
        <span className="ml-auto">{countRunes(contentMd)} 字</span>
        <span>约 {minutes} 分钟</span>
        <span className="hidden sm:inline">
          行 {stats.line}, 列 {stats.col}
        </span>
      </footer>

      <PublishDrawer
        open={drawerOpen}
        onOpenChange={(open) => {
          setDrawerOpen(open)
          if (open) setSaveErr(null)
        }}
        slug={watch('slug')}
        categoryName={watch('categoryName') || null}
        tagNames={watch('tagNames')}
        cover={watch('cover')}
        summary={watch('summary')}
        pinned={watch('pinned')}
        status={watch('status')}
        password={password}
        hasPassword={hasPassword}
        categories={categories}
        tagPool={tagPool}
        submitting={isSubmitting}
        slugError={errors.slug?.message}
        categoryNameError={errors.categoryName?.message}
        onSlugChange={(v) => setValue('slug', v, { shouldDirty: true })}
        onPickCategory={(name) => setValue('categoryName', name, { shouldDirty: true })}
        onClearCategory={() => setValue('categoryName', '', { shouldDirty: true })}
        onCreateCategory={createCategory}
        onTagsChange={(next) => setValue('tagNames', next, { shouldDirty: true })}
        onCreateTag={createTag}
        onCoverChange={(v) => setValue('cover', v ?? '', { shouldDirty: true })}
        onSummaryChange={(v) => setValue('summary', v, { shouldDirty: true })}
        onPinnedChange={(v) => setValue('pinned', v, { shouldDirty: true })}
        onStatusChange={(v) => setValue('status', v, { shouldDirty: true })}
        onPasswordChange={setPassword}
        onSave={() => void doSubmit()}
      />

      {/* 离开确认：页面内返回（顶栏箭头/列表页链接跳转）时脏检查触发 */}
      {confirmLeave && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-void/85 p-4">
          <div className="w-full max-w-sm rounded-xl border border-neon/40 bg-panel p-6 shadow-[0_0_24px_rgba(46,230,255,0.18)]">
            <p className="text-lg font-semibold text-ink">离开此页面？</p>
            <p className="mt-2 text-sm leading-relaxed text-dim">
              当前修改尚未保存。本地草稿已自动缓存，下次进入可恢复。
            </p>
            <div className="mt-5 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setConfirmLeave(false)}
                className="inline-flex h-9 items-center rounded-md border border-edge px-4 text-sm text-dim transition-colors hover:border-neon/50 hover:text-ink"
              >
                继续编辑
              </button>
              <button
                type="button"
                onClick={() => {
                  savedRef.current = true
                  const target = pendingNavRef.current
                  pendingNavRef.current = null
                  setConfirmLeave(false)
                  if (target) navigate(target)
                  else navigate('/admin/posts')
                }}
                className="inline-flex h-9 items-center rounded-md border border-pulse/50 bg-pulse/10 px-4 text-sm font-medium text-pulse transition-colors hover:bg-pulse hover:text-void"
              >
                放弃修改并离开
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// 工具栏图片按钮：文件选择后经 uploadImage 在光标处插入 Markdown 图语法
function EditorPickImageButton({ onPick }: { disabled: boolean; onPick: (files: File[]) => void }) {
  return (
    <button
      type="button"
      aria-label="上传图片"
      title="上传图片"
      onClick={() => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = 'image/*'
        input.multiple = true
        input.onchange = () => {
          onPick([...(input.files ?? [])])
          input.value = ''
        }
        input.click()
      }}
      className="flex h-7 min-w-7 shrink-0 items-center justify-center rounded px-1.5 text-dim transition-colors hover:bg-panel-2 hover:text-neon disabled:pointer-events-none disabled:opacity-40"
    >
      <ImageSquare size={13} />
    </button>
  )
}
