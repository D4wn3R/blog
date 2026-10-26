import { useState } from 'react'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { SignIn, Trash } from '@phosphor-icons/react'
import { Link } from 'react-router'
import { errMsg, fmtDateTime } from '../../lib/api'
import { onEnterSubmit } from '../../lib/keyboard'
import { useAddComment, useComments, useDeleteComment } from '../../lib/queries'
import { UserAvatar } from '../../components/UserAvatar'
import type { CommentNode as CommentNodeData, UserDTO } from '../../types/api'

// 楼中楼内联回复框
function InlineReply({
  name,
  busy,
  onCancel,
  onSubmit,
}: {
  name: string
  busy: boolean
  onCancel: () => void
  onSubmit: (content: string) => void
}) {
  const [text, setText] = useState('')
  return (
    <div className="mb-4 ml-12 border border-edge bg-void p-3">
      <textarea
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => onEnterSubmit(e, () => onSubmit(text))}
        placeholder={`回复 @${name}…`}
        className="w-full resize-none break-words bg-transparent text-sm text-ink placeholder:text-faint focus:outline-none"
      />
      <div className="mt-2 flex justify-end gap-2 font-mono text-xs">
        <button
          type="button"
          onClick={onCancel}
          className="border border-edge px-3 py-1 text-dim transition-colors hover:border-neon/40 hover:text-neon"
        >
          取消
        </button>
        <button
          type="button"
          disabled={busy || !text.trim()}
          onClick={() => onSubmit(text)}
          className="border border-neon/60 bg-neon/10 px-3 py-1 text-neon transition-colors hover:bg-neon hover:text-void disabled:opacity-50"
        >
          发表
        </button>
      </div>
    </div>
  )
}

function CommentItem({
  node,
  nested,
  me,
  isAdmin,
  loggedIn,
  replyToId,
  busy,
  onReply,
  onReplyCancel,
  onReplySubmit,
  onDelete,
}: {
  node: CommentNodeData
  nested?: boolean
  me: number
  isAdmin: boolean
  loggedIn: boolean
  replyToId: number
  busy: boolean
  onReply: (node: CommentNodeData) => void
  onReplyCancel: () => void
  onReplySubmit: (content: string, parentId: number) => void
  onDelete: (id: number) => void
}) {
  const mine = me > 0 && node.user.id === me
  // 本人可删自己的评论；管理员可删任意评论（与后端 #C3 归属校验口径一致）
  const canDelete = mine || isAdmin
  // 三层及更深回复在接口里被拍平到顶级 replies：单独标出被回复人，
  // 二级回复已经在顶级评论下方，不再重复 @ 顶级作者
  const showReplyTo = !!node.reply_to && node.parent_id !== node.root_id
  return (
    <div className={nested ? 'border-l-2 border-edge pl-4' : ''}>
      <div className="flex gap-3.5 py-4">
        <UserAvatar
          src={node.user.avatar}
          alt={`${node.user.username} 的头像`}
          className="img-cyber h-9 w-9 shrink-0 border border-edge object-cover"
        />
        <div className="min-w-0">
          <p className="break-words text-xs text-faint">
            <span className={mine ? 'text-neon' : 'text-ink'}>{node.user.username}</span>
            <span className="ml-2.5 font-mono">{fmtDateTime(node.created_at)}</span>
          </p>
          {node.deleted ? (
            <p className="mt-1.5 text-sm italic leading-relaxed text-faint">该评论已删除</p>
          ) : (
            <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-dim">
              {showReplyTo && (
                <span className="mr-1.5 font-mono text-xs text-neon/80">
                  回复 @{node.reply_to?.username}
                </span>
              )}
              {node.content}
            </p>
          )}
          {loggedIn && !node.deleted && (
            <p className="mt-1.5 flex items-center gap-3 font-mono text-[11px]">
              <button
                type="button"
                onClick={() => onReply(node)}
                className="text-faint transition-colors hover:text-neon"
              >
                回复
              </button>
              {canDelete && (
                <AlertDialog.Root>
                  <AlertDialog.Trigger asChild>
                    <button
                      type="button"
                      aria-label="删除评论"
                      title="删除评论"
                      className="text-faint transition-colors hover:text-pulse"
                    >
                      <Trash size={13} />
                    </button>
                  </AlertDialog.Trigger>
                  <AlertDialog.Portal>
                    <AlertDialog.Overlay className="fixed inset-0 z-50 bg-void/85" />
                    <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-sm -translate-x-1/2 -translate-y-1/2 border border-pulse/40 bg-panel p-6 shadow-[0_0_24px_rgba(255,46,136,0.15)]">
                      <AlertDialog.Title className="font-semibold">
                        删除这条评论？
                      </AlertDialog.Title>
                      <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-dim">
                        删除后该评论及其全部回复将一并移除，且不可恢复。
                      </AlertDialog.Description>
                      <div className="mt-5 flex justify-end gap-2.5">
                        <AlertDialog.Cancel asChild>
                          <button
                            type="button"
                            className="border border-edge px-4 py-1.5 font-mono text-xs text-dim transition-colors hover:border-neon/50 hover:text-neon"
                          >
                            取消
                          </button>
                        </AlertDialog.Cancel>
                        <AlertDialog.Action asChild>
                          <button
                            type="button"
                            onClick={() => onDelete(node.id)}
                            className="border border-pulse/60 bg-pulse/10 px-4 py-1.5 font-mono text-xs text-pulse transition-colors hover:bg-pulse hover:text-void"
                          >
                            确认删除
                          </button>
                        </AlertDialog.Action>
                      </div>
                    </AlertDialog.Content>
                  </AlertDialog.Portal>
                </AlertDialog.Root>
              )}
            </p>
          )}
        </div>
      </div>
      {replyToId === node.id && (
        <InlineReply
          name={node.user.username}
          busy={busy}
          onCancel={onReplyCancel}
          onSubmit={(content) => onReplySubmit(content, node.id)}
        />
      )}
      {node.replies?.map((reply) => (
        <CommentItem
          key={reply.id}
          node={reply}
          nested
          me={me}
          isAdmin={isAdmin}
          loggedIn={loggedIn}
          replyToId={replyToId}
          busy={busy}
          onReply={onReply}
          onReplyCancel={onReplyCancel}
          onReplySubmit={onReplySubmit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}

// 评论区：未登录显示登录示意，已登录显示输入框（登录态经 authStore 响应式订阅）
export function CommentSection({ slug, user }: { slug: string; user: UserDTO | null }) {
  const comments = useComments(slug)
  const addComment = useAddComment(slug)
  const deleteComment = useDeleteComment()
  const [draft, setDraft] = useState('')
  const [replyTo, setReplyTo] = useState<CommentNodeData | null>(null)

  const loggedIn = user !== null
  const isAdmin = user?.role === 'admin'
  const me = user?.id ?? 0
  const busy = addComment.isPending || deleteComment.isPending

  const submitComment = async (text: string, parentId = 0) => {
    const contentText = text.trim()
    if (!contentText || busy) return
    try {
      await addComment.mutateAsync({ content: contentText, parentId: parentId || undefined })
      setDraft('')
      setReplyTo(null)
    } catch {
      // 错误经 mutation isError 映射到 actionError，无需在此处理
    }
  }

  const commentList = comments.data ?? []
  const commentCount = commentList.reduce((n, c) => n + 1 + (c.replies?.length ?? 0), 0)
  const actionError = addComment.isError
    ? errMsg(addComment.error)
    : deleteComment.isError
      ? errMsg(deleteComment.error)
      : ''

  return (
    <section>
      <h2 className="text-xl font-semibold">
        评论 <span className="ml-2 font-mono text-sm text-faint">{commentCount}</span>
      </h2>

      {loggedIn ? (
        <div className="mt-5 border border-edge bg-panel p-5">
          <textarea
            rows={3}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => onEnterSubmit(e, () => void submitComment(draft))}
            className="w-full resize-none break-words border border-edge bg-void p-3.5 text-sm text-ink placeholder:text-faint focus:border-neon/60 focus:outline-none"
          />
          <div className="mt-3 flex items-center justify-between">
            <span className="flex items-center gap-2 font-mono text-xs text-neon">
              <UserAvatar
                src={user?.avatar ?? ''}
                alt={`${user?.username ?? ''} 的头像`}
                className="img-cyber h-6 w-6 shrink-0 border border-neon/40 object-cover"
              />
              ✓ 已登录：{user?.username}
            </span>
            <button
              type="button"
              disabled={busy || !draft.trim()}
              onClick={() => void submitComment(draft)}
              className="border border-neon/60 bg-neon/10 px-5 py-1.5 font-mono text-sm text-neon transition-colors hover:bg-neon hover:text-void disabled:opacity-50"
            >
              发表
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-5 flex items-center justify-between gap-4 border border-neon/30 bg-neon/5 px-5 py-3.5">
          <p className="text-sm text-dim">登录后即可参与讨论，访客仅可浏览。</p>
          <Link
            to="/login"
            className="flex shrink-0 items-center gap-2 border border-neon/60 bg-neon/10 px-4 py-1.5 font-mono text-sm text-neon transition-colors hover:bg-neon hover:text-void"
          >
            <SignIn size={14} weight="bold" />
            登录
          </Link>
        </div>
      )}

      {actionError && <p className="mt-3 font-mono text-xs text-pulse">error: {actionError}</p>}

      {comments.isPending ? (
        <p className="mt-6 font-mono text-xs text-faint">loading comments...</p>
      ) : comments.isError ? (
        <p className="mt-6 font-mono text-xs text-pulse">error: {errMsg(comments.error)}</p>
      ) : commentList.length === 0 ? (
        <p className="mt-6 font-mono text-xs text-faint">// no comments yet</p>
      ) : (
        <div className="mt-2 divide-y divide-edge/60">
          {commentList.map((node) => (
            <CommentItem
              key={node.id}
              node={node}
              me={me}
              isAdmin={isAdmin}
              loggedIn={loggedIn}
              replyToId={replyTo?.id ?? 0}
              busy={busy}
              onReply={setReplyTo}
              onReplyCancel={() => setReplyTo(null)}
              onReplySubmit={(text, parentId) => void submitComment(text, parentId)}
              onDelete={(id) => void deleteComment.mutateAsync(id).catch(() => {})}
            />
          ))}
        </div>
      )}
    </section>
  )
}
