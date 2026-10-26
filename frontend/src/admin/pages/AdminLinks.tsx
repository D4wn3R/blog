import { useEffect, useState } from 'react'
import { FloppyDisk, PencilSimple, Plus } from '@phosphor-icons/react'
import { toast } from 'sonner'
import { api, errMsg } from '../../lib/api'
import type { AboutAggregate, FriendLinkDTO, SettingsDTO } from '../../types/api'
import { Card, EmptyState, Field, Input, LinkButton, PageHeader } from '../components/ui'
import { UserAvatar } from '../../components/UserAvatar'
import { SectionHeading } from '../../components/SectionHeading'
import { useAdminFriendLinks, useDeleteFriendLink } from '../queries'
import { ConfirmDeleteButton } from './about/parts'

// 友链管理：#01 本节点（site-settings 四键，#B18 部分更新）+ #02 已连节点（#F1/#F4）
type SiteDraft = Pick<SettingsDTO, 'site_name' | 'site_url' | 'site_desc' | 'site_image'>

const EMPTY_DRAFT: SiteDraft = { site_name: '', site_url: '', site_desc: '', site_image: '' }

export function AdminLinks() {
  const [draft, setDraft] = useState<SiteDraft>(EMPTY_DRAFT)
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState(false)
  const [settingsErr, setSettingsErr] = useState<string | null>(null)

  // 列表由 query 托管；删除失败与加载失败共用一个展示位
  const friends = useAdminFriendLinks()
  const removeFriend = useDeleteFriendLink()
  const friendList = friends.data ?? []
  const friendsErr = friends.isError
    ? errMsg(friends.error)
    : removeFriend.isError
      ? errMsg(removeFriend.error)
      : null

  useEffect(() => {
    api
      .get<AboutAggregate>('/api/about')
      .then((res) =>
        setDraft({
          site_name: res.settings.site_name,
          site_url: res.settings.site_url,
          site_desc: res.settings.site_desc,
          site_image: res.settings.site_image,
        }),
      )
      .catch((e) => setSettingsErr(errMsg(e)))
  }, [])

  const update = (field: keyof SiteDraft) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setDraft({ ...draft, [field]: e.target.value })

  // #B18 部分更新：只传本卡四键，响应为全量 7 键
  const save = async () => {
    if (saving) return
    setSaving(true)
    setSettingsErr(null)
    try {
      const res = await api.put<SettingsDTO>('/api/admin/site-settings', {
        site_name: draft.site_name,
        site_url: draft.site_url,
        site_desc: draft.site_desc,
        site_image: draft.site_image,
      })
      setDraft({
        site_name: res.site_name,
        site_url: res.site_url,
        site_desc: res.site_desc,
        site_image: res.site_image,
      })
      toast.success('已保存')
    } catch (e) {
      setSettingsErr(errMsg(e))
    } finally {
      setSaving(false)
    }
  }

  // #F4 物理删除，不存在幂等成功；删除后 invalidate 自动重拉列表
  const remove = async (friend: FriendLinkDTO) => {
    try {
      await removeFriend.mutateAsync(friend.id)
    } catch {
      // 错误经 removeFriend.isError 汇入 friendsErr 展示，无需在此处理
    }
  }

  return (
    <div className="p-8">
      <PageHeader
        title="友链管理"
        actions={
          <LinkButton variant="primary" to="/admin/links/new">
            <Plus size={14} weight="bold" />
            新增友链
          </LinkButton>
        }
      />

      <div className="mt-8">
        <SectionHeading num="#01" zh="本节点" en="Local Node" />
      </div>
      <Card className="mt-4 border-neon/40">
        <div className="flex flex-col gap-6 p-6 md:flex-row md:items-start">
          <div className="relative mx-auto w-fit shrink-0 md:mx-0">
            <span
              aria-hidden="true"
              className="absolute -left-2.5 -top-2.5 h-4 w-4 rounded-tl-md border-l-2 border-t-2 border-neon/60"
            />
            <span
              aria-hidden="true"
              className="absolute -right-2.5 -top-2.5 h-4 w-4 rounded-tr-md border-r-2 border-t-2 border-neon/60"
            />
            <span
              aria-hidden="true"
              className="absolute -bottom-2.5 -left-2.5 h-4 w-4 rounded-bl-md border-b-2 border-l-2 border-neon/60"
            />
            <span
              aria-hidden="true"
              className="absolute -bottom-2.5 -right-2.5 h-4 w-4 rounded-br-md border-b-2 border-r-2 border-neon/60"
            />
            <UserAvatar
              src={draft.site_image}
              alt={`${draft.site_name} 的头像`}
              className="img-cyber h-24 w-24 rounded-full border border-edge object-cover"
            />
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="flex items-center gap-1.5 rounded-full border border-neon/50 px-3 py-1 font-mono text-xs text-neon">
                <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-neon" />
                ONLINE
              </span>
              <span className="rounded-full border border-edge px-3 py-1 font-mono text-xs text-faint">
                ID · 00
              </span>
            </div>
            <p className="mt-3 text-2xl font-bold tracking-tight text-ink">{draft.site_name}</p>
            <p className="mt-1.5 truncate font-mono text-sm">
              <span className="text-faint">&gt; </span>
              <span className="text-neon">{draft.site_url}</span>
            </p>
            <p className="mt-2 text-sm leading-relaxed text-dim">{draft.site_desc}</p>
          </div>

          <button
            type="button"
            onClick={() => setEditing(!editing)}
            className="h-9 shrink-0 self-start rounded-md border border-edge px-3.5 text-sm text-dim transition-colors hover:border-neon/60 hover:text-ink"
          >
            {editing ? '收起' : '修改'}
          </button>
        </div>

        {editing && (
          <div className="flex flex-col gap-5 border-t border-edge p-6">
            <div className="grid gap-5 md:grid-cols-2">
              <Field label="site_name">
                <Input value={draft.site_name} onChange={update('site_name')} />
              </Field>
              <Field label="site_url">
                <Input
                  value={draft.site_url}
                  onChange={update('site_url')}
                  className="font-mono text-xs"
                />
              </Field>
              <Field label="site_desc">
                <Input value={draft.site_desc} onChange={update('site_desc')} />
              </Field>
              <Field label="site_image">
                <Input
                  value={draft.site_image}
                  onChange={update('site_image')}
                  className="font-mono text-xs"
                />
              </Field>
            </div>
            {settingsErr && (
              <p className="rounded-md border border-pulse/60 bg-pulse/10 px-4 py-2.5 text-sm text-pulse">
                {settingsErr}
              </p>
            )}
            <div className="flex items-center justify-between">
              <p className="font-mono text-xs text-faint">// 保存后 C 端友链页的本站名片同步更新</p>
              <button
                type="button"
                disabled={saving}
                onClick={() => void save()}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-neon px-4 text-sm font-medium text-void transition-colors hover:bg-neon/85 disabled:pointer-events-none disabled:opacity-50"
              >
                {saving ? (
                  <FloppyDisk size={14} className="animate-pulse" />
                ) : (
                  <FloppyDisk size={14} />
                )}
                {saving ? '保存中…' : '保存'}
              </button>
            </div>
          </div>
        )}
      </Card>

      <div className="mt-10">
        <SectionHeading num="#02" zh="已连节点" en="Linked Nodes" />
      </div>
      {friendsErr && (
        <p className="mt-4 rounded-md border border-pulse/60 bg-pulse/10 px-4 py-2.5 text-sm text-pulse">
          {friendsErr}
        </p>
      )}
      <div className="mt-4">
        {friendList.length === 0 ? (
          <EmptyState
            title="还没有友链"
            description="// 交换链接，从右上角「新增友链」开始"
            action={{
              label: '新增友链',
              onClick: () => window.location.assign('/admin/links/new'),
            }}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {friendList.map((friend, i) => (
              <Card
                key={friend.id}
                className="flex flex-col p-5 transition-all hover:-translate-y-0.5 hover:border-neon/40"
              >
                <div className="flex items-center gap-3.5">
                  <UserAvatar
                    src={friend.image}
                    alt={`${friend.name} 的头像`}
                    className="img-cyber h-12 w-12 rounded-full border border-edge object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-medium text-ink">
                      <span className="truncate">{friend.name}</span>
                      <span className="flex shrink-0 items-center gap-1 rounded-full border border-neon/40 px-2 py-0.5 font-mono text-[10px] text-neon">
                        <span aria-hidden="true" className="h-1 w-1 rounded-full bg-neon" />
                        LINK
                      </span>
                    </p>
                    <p className="mt-1 font-mono text-[11px] text-faint">
                      NODE · {String(i + 1).padStart(2, '0')}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1.5">
                    <LinkButton
                      variant="ghost"
                      size="sm"
                      to={`/admin/links/${friend.id}/edit`}
                      aria-label={`编辑 ${friend.name}`}
                      className="h-8 w-8 !px-0"
                    >
                      <PencilSimple size={13} />
                    </LinkButton>
                    <ConfirmDeleteButton
                      name={friend.name}
                      disabled={removeFriend.isPending}
                      onConfirm={() => void remove(friend)}
                    />
                  </div>
                </div>
                <p className="mt-4 text-sm leading-relaxed text-dim">{friend.description}</p>
                <p className="mt-auto pt-3 font-mono text-xs text-faint">{friend.url}</p>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
