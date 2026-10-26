import { useEffect, useState } from 'react'
import { Plus } from '@phosphor-icons/react'
import { api, errMsg } from '../../../lib/api'
import { CONTACT_ICON_OPTIONS, contactLabel } from '../../../components/ContactIcons'
import type { ContactDTO } from '../../../types/api'
import { SectionHeading } from '../../../components/SectionHeading'
import { Input } from '../../components/ui'
import { ConfirmDeleteButton, ErrBar, IconSelect, SectionActions } from './parts'

// #05 联系方式（契约 #B15-#B17：含 icon，无 sort 接口，C 端按 id ASC）
export function ContactsSection({
  initial,
  onStats,
  onData,
}: {
  initial: ContactDTO[]
  onStats: (sectionId: string, count: number, dirty: boolean) => void
  onData: (d: { kind: 'contacts'; data: ContactDTO[] }) => void
}) {
  const [contacts, setContacts] = useState<ContactDTO[]>(initial)
  const [contactsSaved, setContactsSaved] = useState<ContactDTO[]>(initial)
  const [contactErrIds, setContactErrIds] = useState<number[]>([])
  const [contactsErr, setContactsErr] = useState<string | null>(null)
  // 渠道名随 icon 成对带出，不再单独输入
  const [newContact, setNewContact] = useState({ value: '', icon: '' })
  const contactDirty = JSON.stringify(contacts) !== JSON.stringify(contactsSaved)

  useEffect(() => {
    onStats('about-contacts', contacts.length, contactDirty)
  }, [onStats, contacts.length, contactDirty])

  useEffect(() => {
    onData({ kind: 'contacts', data: contacts })
  }, [onData, contacts])

  const updateContact = (id: number, patch: Partial<ContactDTO>) =>
    setContacts((ls) => ls.map((c) => (c.id === id ? { ...c, ...patch } : c)))
  // 选列表项 → 名称与图标一起换；选保底历史项则保留原名称
  const changeContactIcon = (row: ContactDTO, v: string) =>
    updateContact(row.id, {
      icon: v,
      label: CONTACT_ICON_OPTIONS.some((o) => o.value === v) ? contactLabel(v) : row.label,
    })
  const addContact = () => {
    if (!newContact.icon || !newContact.value.trim()) return
    setContacts((ls) => [
      ...ls,
      {
        id: Date.now(),
        label: contactLabel(newContact.icon),
        value: newContact.value.trim(),
        icon: newContact.icon,
      },
    ])
    setNewContact({ value: '', icon: '' })
  }
  const removeContact = async (row: ContactDTO) => {
    try {
      if (contactsSaved.some((c) => c.id === row.id)) {
        await api.del(`/api/admin/about/contacts/${row.id}`)
        setContactsSaved((ls) => ls.filter((c) => c.id !== row.id))
      }
      setContacts((ls) => ls.filter((c) => c.id !== row.id))
      setContactsErr(null)
    } catch (e) {
      setContactsErr(errMsg(e))
    }
  }
  const reloadContacts = async () => {
    const res = await api.get<{ contacts: ContactDTO[] }>('/api/about')
    setContacts(res.contacts)
    setContactsSaved(res.contacts)
  }
  const saveContacts = async (): Promise<boolean> => {
    const bad = contacts.filter((c) => !c.label.trim() || !c.value.trim()).map((c) => c.id)
    if (bad.length > 0) {
      setContactErrIds(bad)
      return false
    }
    setContactErrIds([])
    const savedById = new Map(contactsSaved.map((c) => [c.id, c]))
    try {
      for (const row of contacts) {
        const body = { label: row.label.trim(), value: row.value.trim(), icon: row.icon.trim() }
        if (!savedById.has(row.id)) {
          await api.post('/api/admin/about/contacts', body, true)
        } else if (JSON.stringify(row) !== JSON.stringify(savedById.get(row.id))) {
          await api.put(`/api/admin/about/contacts/${row.id}`, body)
        }
      }
      await reloadContacts()
    } catch (e) {
      setContactsErr(errMsg(e))
      return false
    }
    setContactsErr(null)
    return true
  }

  const undoContacts = () => {
    setContacts(contactsSaved)
    setContactErrIds([])
    setContactsErr(null)
  }

  return (
    <section id="about-contacts" className="mt-14 scroll-mt-20">
      <div className="mb-8 flex flex-wrap items-center gap-4">
        <SectionHeading
          num="#05"
          zh="联系方式"
          en="Contact"
          className="flex flex-1 flex-wrap items-center gap-4"
        />
        {contactErrIds.length > 0 && (
          <p className="font-mono text-[11px] text-pulse">渠道与内容不能为空，保存被拦截</p>
        )}
        <SectionActions
          dirty={contactDirty}
          onUndo={undoContacts}
          onSave={saveContacts}
          saveLabel="保存全部修改"
        />
      </div>
      {contactsErr && (
        <div className="mb-3">
          <ErrBar text={contactsErr} />
        </div>
      )}
      {contacts.length === 0 && (
        <p className="mb-2 border border-dashed border-edge px-4 py-6 text-center font-mono text-xs text-faint">
          暂无联系方式，在下方添加第一项
        </p>
      )}
      <div className="flex flex-col gap-2">
        {contacts.map((c) => (
          <div
            key={c.id}
            className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-2 border bg-panel p-3 sm:grid-cols-[11rem_minmax(0,1fr)_auto] ${
              contactErrIds.includes(c.id) ? 'border-pulse/60' : 'border-edge'
            }`}
          >
            <IconSelect
              value={c.icon}
              onChange={(v) => changeContactIcon(c, v)}
              className="col-start-1 row-start-1"
            />
            <div className="col-start-2 row-start-1 sm:col-start-3">
              <ConfirmDeleteButton
                name={c.label || '联系方式'}
                onConfirm={() => void removeContact(c)}
              />
            </div>
            <Input
              value={c.value}
              aria-label="联系内容"
              maxLength={100}
              onChange={(e) => updateContact(c.id, { value: e.target.value })}
              className="col-span-2 row-start-2 min-w-0 font-mono text-xs sm:col-span-1 sm:col-start-2 sm:row-start-1"
            />
          </div>
        ))}

        <div className="flex flex-col gap-2 pt-1 sm:flex-row">
          <IconSelect
            value={newContact.icon}
            onChange={(v) => setNewContact({ ...newContact, icon: v })}
            className="w-full sm:w-44"
          />
          <Input
            value={newContact.value}
            aria-label="新联系内容"
            maxLength={100}
            onChange={(e) => setNewContact({ ...newContact, value: e.target.value })}
            className="min-w-0 flex-1 font-mono text-xs"
          />
          <button
            type="button"
            onClick={addContact}
            disabled={!newContact.icon || !newContact.value.trim()}
            className="flex items-center justify-center gap-1.5 border border-neon/50 px-4 py-2 font-mono text-xs text-neon transition-colors hover:bg-neon hover:text-void disabled:pointer-events-none disabled:opacity-40"
          >
            <Plus size={12} weight="bold" />
            添加
          </button>
        </div>
      </div>
    </section>
  )
}
