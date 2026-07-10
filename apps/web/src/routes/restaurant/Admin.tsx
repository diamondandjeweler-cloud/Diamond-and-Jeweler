import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, Select, Spinner } from '../../components/ui'
import { confirmDialog } from '../../components/Modal'
import { useRestaurant } from '../../lib/restaurant/context'
import { useSession } from '../../state/useSession'
import { useShallow } from 'zustand/react/shallow'
import {
  listAllMenuItems, createMenuItem, updateMenuItem, deleteMenuItem,
  listCategories, createCategory, updateCategory, deleteCategory,
  listTables, createTable, updateTable, deleteTable,
  listModifiersForItem, createModifier, updateModifier, deleteModifier,
  uploadMenuItemImage,
  listOrgMembers, addOrgMemberByEmail, removeOrgMember, updateOrgName,
  createBranch,
} from '../../lib/restaurant/store'
import type { MenuCategory, MenuItem, Modifier, OrgMember, RestaurantTable, TableArea, TableShape } from '../../lib/restaurant/types'
import { MYR } from '../../lib/restaurant/format'
import { getMyInvoisConfig, upsertMyInvoisConfig, type MyInvoisConfig } from '../../lib/restaurant/einvoice'
import { DeliveryTab } from './admin/DeliveryTab'
import { MenuItemsTable } from './admin/MenuItemsTable'
import { MenuItemFormCard, type ItemForm } from './admin/MenuItemFormCard'
import { TableQrRow } from './admin/TableQrRow'
import { OrgMembersTable } from './admin/OrgMembersTable'
import { MyInvoisFormFields } from './admin/MyInvoisFormFields'

const ADMIN_EMPLOYEE_ROLES = ['admin', 'owner', 'shift_manager']
const ADMIN_USER_ROLES     = ['admin', 'restaurant_staff']

export default function Admin() {
  const { branchId, employee, org, orgId, isOrgOwner, refreshOrg, refreshBranches } = useRestaurant()
  const { profile } = useSession(useShallow((s) => ({ profile: s.profile })))
  const [tab, setTab] = useState<'menu' | 'tables' | 'myinvois' | 'delivery' | 'org'>('menu')
  const [cats, setCats]   = useState<MenuCategory[]>([])
  const [items, setItems] = useState<MenuItem[]>([])
  const [tables, setTables] = useState<RestaurantTable[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const canAdmin =
    (profile && ADMIN_USER_ROLES.includes(profile.role)) ||
    (employee && ADMIN_EMPLOYEE_ROLES.includes(employee.role))

  const refresh = async () => {
    if (!branchId) return
    setLoading(true); setErr(null)
    try {
      const [c, i, t] = await Promise.all([listCategories(branchId), listAllMenuItems(branchId), listTables(branchId)])
      setCats(c); setItems(i); setTables(t)
    } catch (e) { setErr((e as Error).message) } finally { setLoading(false) }
  }
  useEffect(() => { void refresh() }, [branchId])

  if (!branchId) return <EmptyState title="Pick a branch first" />

  if (!canAdmin) return (
    <div className="rounded-xl bg-amber-50 border border-amber-200 p-6 text-center">
      <div className="text-amber-800 font-medium mb-1">Owner / Manager access required</div>
      <div className="text-sm text-amber-700">Sign in with a staff PIN that has owner, admin, or shift manager role to access this page.</div>
    </div>
  )

  if (loading && items.length === 0 && tables.length === 0) return <div className="py-10 text-center"><Spinner /> Loading…</div>

  return (
    <div className="space-y-4">
      {err && <Alert tone="red">{err}</Alert>}
      <div className="flex gap-1 flex-wrap">
        {(['menu', 'tables', 'myinvois', 'delivery', 'org'] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium ${tab === t ? 'bg-brand-600 text-white' : 'bg-ink-100 text-ink-700 hover:bg-ink-200'}`}>
            {t === 'menu' ? 'Menu & pricing'
              : t === 'tables' ? 'Tables & floor'
              : t === 'myinvois' ? 'MyInvois (e-invoice)'
              : t === 'delivery' ? 'Delivery platforms'
              : 'Organisation'}
          </button>
        ))}
      </div>

      {tab === 'menu'     && <MenuTab categories={cats} items={items} branchId={branchId} onChanged={refresh} />}
      {tab === 'tables'   && <TablesTab tables={tables} branchId={branchId} onChanged={refresh} />}
      {tab === 'myinvois' && <MyInvoisTab branchId={branchId} />}
      {tab === 'delivery' && <DeliveryTab />}
      {tab === 'org'      && <OrgTab org={org} orgId={orgId} isOwner={isOrgOwner} onOrgUpdated={async () => { await refreshOrg() }} onBranchAdded={async () => { await refreshBranches() }} />}
    </div>
  )
}

/* ─────────────────────────────────────────────
   MENU TAB
───────────────────────────────────────────── */

const BLANK_ITEM: ItemForm = {
  name: '', description: '', price: 0, category_id: '', station: 'kitchen',
  course_type: 'main', is_active: true, image_url: '', available_from: '', available_until: '',
  grab_id: '', foodpanda_id: '', shopee_id: '',
}

function MenuTab({ categories, items, branchId, onChanged }: {
  categories: MenuCategory[]; items: MenuItem[]; branchId: string; onChanged: () => Promise<void>
}) {
  const [creating, setCreating]   = useState(false)
  const [editing, setEditing]     = useState<MenuItem | null>(null)
  const [form, setForm]           = useState<ItemForm>(BLANK_ITEM)
  const [uploading, setUploading] = useState(false)
  const [err, setErr]             = useState<string | null>(null)
  const [expandedMods, setExpandedMods] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const categoryById = useMemo(() => new Map(categories.map((c): [string, MenuCategory] => [c.id, c])), [categories])

  const reset = () => { setForm(BLANK_ITEM); setEditing(null); setCreating(false); setErr(null) }

  const handleImageFile = async (file: File) => {
    setUploading(true); setErr(null)
    try {
      const url = await uploadMenuItemImage(branchId, file)
      setForm((f) => ({ ...f, image_url: url }))
    } catch (e) { setErr(`Image upload failed: ${(e as Error).message}`) }
    finally { setUploading(false) }
  }

  const save = async () => {
    if (!form.name || form.price < 0) { setErr('Name and non-negative price required'); return }
    try {
      const platformIds: Record<string, string> = {}
      if (form.grab_id)      platformIds.grab      = form.grab_id
      if (form.foodpanda_id) platformIds.foodpanda = form.foodpanda_id
      if (form.shopee_id)    platformIds.shopee    = form.shopee_id
      const { grab_id: _g, foodpanda_id: _f, shopee_id: _s, ...rest } = form
      const patch = {
        ...rest,
        category_id:     form.category_id    || null,
        image_url:       form.image_url       || null,
        available_from:  form.available_from  || null,
        available_until: form.available_until || null,
        platform_ids:    platformIds,
      }
      if (editing) { await updateMenuItem(editing.id, patch) }
      else         { await createMenuItem({ ...patch, branch_id: branchId }) }
      await onChanged(); reset()
    } catch (e) { setErr((e as Error).message) }
  }

  // Hoisted verbatim from the (former inline) table-row JSX — bodies unchanged.
  const handleEdit = (m: MenuItem) => {
    setCreating(false); setEditing(m)
    setForm({
      name: m.name, description: m.description ?? '', price: Number(m.price),
      category_id: m.category_id ?? '', station: m.station ?? '',
      course_type: m.course_type, is_active: m.is_active,
      image_url: m.image_url ?? '',
      available_from: m.available_from ?? '',
      available_until: m.available_until ?? '',
      grab_id:      m.platform_ids?.grab      ?? '',
      foodpanda_id: m.platform_ids?.foodpanda ?? '',
      shopee_id:    m.platform_ids?.shopee    ?? '',
    })
  }

  const handleToggleMods = (id: string) => setExpandedMods(expandedMods === id ? null : id)

  const handleDelete = async (m: MenuItem) => {
    if (await confirmDialog({ title: 'Delete menu item?', message: `Delete "${m.name}"? This cannot be undone.`, confirmLabel: 'Delete', tone: 'danger' })) { await deleteMenuItem(m.id); await onChanged() }
  }

  return (
    <div className="space-y-5">
      {/* ── Categories ── */}
      <CategoriesSection categories={categories} branchId={branchId} onChanged={onChanged} />

      {/* ── Items ── */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg">Menu items ({items.length})</h2>
          <Button onClick={() => (creating || editing ? reset() : setCreating(true))}>
            {creating || editing ? 'Cancel' : '+ New item'}
          </Button>
        </div>

        {(creating || editing) && (
          <MenuItemFormCard
            form={form}
            setForm={setForm}
            categories={categories}
            uploading={uploading}
            err={err}
            fileRef={fileRef}
            isEditing={!!editing}
            onImageFile={handleImageFile}
            onSave={save}
            onCancel={reset}
          />
        )}

        <MenuItemsTable
          items={items}
          categoryById={categoryById}
          expandedMods={expandedMods}
          onEdit={handleEdit}
          onToggleMods={handleToggleMods}
          onDelete={handleDelete}
          renderExpanded={(m) => <ModifiersSection menuItemId={m.id} itemName={m.name} />}
        />
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   CATEGORIES SECTION
───────────────────────────────────────────── */

function CategoriesSection({ categories, branchId, onChanged }: {
  categories: MenuCategory[]; branchId: string; onChanged: () => Promise<void>
}) {
  const [open, setOpen]   = useState(false)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [err, setErr]     = useState<string | null>(null)

  const add = async () => {
    if (!newName.trim()) return
    try {
      await createCategory({ branch_id: branchId, name: newName.trim(), sort_order: categories.length + 1, is_active: true })
      setNewName(''); await onChanged()
    } catch (e) { setErr((e as Error).message) }
  }

  const save = async (id: string) => {
    if (!editName.trim()) return
    try { await updateCategory(id, { name: editName.trim() }); setEditing(null); await onChanged() }
    catch (e) { setErr((e as Error).message) }
  }

  const remove = async (id: string, name: string) => {
    if (!(await confirmDialog({ title: 'Delete category?', message: `Delete category "${name}"? Items in this category will have no category.`, confirmLabel: 'Delete', tone: 'danger' }))) return
    try { await deleteCategory(id); await onChanged() }
    catch (e) { setErr((e as Error).message) }
  }

  return (
    <div className="border border-ink-200 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 bg-ink-50 hover:bg-ink-100 text-sm font-medium text-ink-700"
      >
        <span>Categories ({categories.length})</span>
        <span className="text-ink-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="p-4 space-y-3 bg-white">
          {err && <Alert tone="red">{err}</Alert>}

          <div className="space-y-1">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center gap-2 py-1.5 border-b border-ink-50">
                {editing === c.id ? (
                  <>
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') void save(c.id); if (e.key === 'Escape') setEditing(null) }}
                      className="flex-1 border border-brand-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
                    />
                    <Button variant="ghost" size="sm" className="text-brand-700" onClick={() => void save(c.id)}>Save</Button>
                    <Button variant="ghost" size="sm" onClick={() => setEditing(null)}>Cancel</Button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-ink-800">{c.name}</span>
                    <Button variant="ghost" size="sm" onClick={() => { setEditing(c.id); setEditName(c.name) }}>Rename</Button>
                    <Button variant="ghost" size="sm" className="text-red-600" onClick={() => void remove(c.id, c.name)}>Delete</Button>
                  </>
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') void add() }}
              placeholder="New category name…"
              className="flex-1 border border-ink-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-400"
            />
            <Button size="sm" onClick={add} disabled={!newName.trim()}>Add</Button>
          </div>
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────
   MODIFIERS SECTION (per item)
───────────────────────────────────────────── */

function ModifiersSection({ menuItemId, itemName }: { menuItemId: string; itemName: string }) {
  const [mods, setMods]   = useState<Modifier[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newPrice, setNewPrice] = useState('0')
  const [editing, setEditing] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('0')
  const [err, setErr]     = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try { setMods(await listModifiersForItem(menuItemId)) }
    catch (e) { setErr((e as Error).message) }
    finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [menuItemId])

  const add = async () => {
    if (!newName.trim()) return
    try {
      await createModifier({ menu_item_id: menuItemId, name: newName.trim(), price_delta: parseFloat(newPrice) || 0, is_active: true })
      setNewName(''); setNewPrice('0'); await load()
    } catch (e) { setErr((e as Error).message) }
  }

  const save = async (id: string) => {
    try {
      await updateModifier(id, { name: editName.trim(), price_delta: parseFloat(editPrice) || 0 })
      setEditing(null); await load()
    } catch (e) { setErr((e as Error).message) }
  }

  const remove = async (id: string, name: string) => {
    if (!(await confirmDialog({ title: 'Remove add-on?', message: `Remove add-on "${name}"?`, confirmLabel: 'Remove', tone: 'danger' }))) return
    try { await deleteModifier(id); await load() }
    catch (e) { setErr((e as Error).message) }
  }

  return (
    <div className="px-4 py-3">
      <div className="text-xs font-semibold text-brand-700 uppercase tracking-wide mb-2">
        Add-ons for "{itemName}"
      </div>
      {err && <div className="text-xs text-red-600 mb-2">{err}</div>}
      {loading ? (
        <div className="text-xs text-ink-400">Loading…</div>
      ) : (
        <div className="space-y-1 mb-3">
          {mods.length === 0 && <div className="text-xs text-ink-400">No add-ons yet.</div>}
          {mods.map((m) => (
            <div key={m.id} className="flex items-center gap-2 text-sm py-1">
              {editing === m.id ? (
                <>
                  <input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 border border-brand-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400" />
                  <input type="number" step="0.50" value={editPrice} onChange={(e) => setEditPrice(e.target.value)}
                    className="w-20 border border-brand-300 rounded px-2 py-1 text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand-400" />
                  <span className="text-xs text-ink-400">RM</span>
                  <Button variant="ghost" size="sm" className="text-brand-700 text-xs" onClick={() => void save(m.id)}>Save</Button>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => setEditing(null)}>✕</Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-ink-800">{m.name}</span>
                  <span className="text-ink-500 text-xs w-20 text-right">
                    {Number(m.price_delta) === 0 ? 'Free' : `+${MYR(Number(m.price_delta))}`}
                  </span>
                  <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setEditing(m.id); setEditName(m.name); setEditPrice(String(m.price_delta)) }}>Edit</Button>
                  <Button variant="ghost" size="sm" className="text-red-500 text-xs" onClick={() => void remove(m.id, m.name)}>✕</Button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <input value={newName} onChange={(e) => setNewName(e.target.value)}
          placeholder="Add-on name (e.g. Extra cheese)"
          onKeyDown={(e) => { if (e.key === 'Enter') void add() }}
          className="flex-1 border border-ink-200 rounded px-2 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-brand-400" />
        <div className="flex items-center gap-1">
          <span className="text-xs text-ink-500">+RM</span>
          <input type="number" step="0.50" min="0" value={newPrice} onChange={(e) => setNewPrice(e.target.value)}
            className="w-16 border border-ink-200 rounded px-2 py-1.5 text-xs text-right focus:outline-none focus:ring-1 focus:ring-brand-400" />
        </div>
        <button onClick={add} disabled={!newName.trim()}
          className="px-3 py-1.5 rounded bg-brand-600 text-white text-xs font-medium disabled:opacity-40 hover:bg-brand-700">
          Add
        </button>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────
   TABLES TAB
───────────────────────────────────────────── */

function TablesTab({ tables, branchId, onChanged }: { tables: RestaurantTable[]; branchId: string; onChanged: () => Promise<void> }) {
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState<{ table_number: string; capacity: number; shape: TableShape; area: TableArea }>({ table_number: '', capacity: 2, shape: 'square', area: 'indoor' })
  const [err, setErr] = useState<string | null>(null)
  const [qrTableId, setQrTableId] = useState<string | null>(null)

  const save = async () => {
    if (!form.table_number) { setErr('Table number required'); return }
    try { await createTable({ ...form, branch_id: branchId, status: 'free' }); setForm({ table_number: '', capacity: 2, shape: 'square', area: 'indoor' }); setCreating(false); setErr(null); await onChanged() }
    catch (e) { setErr((e as Error).message) }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg">Tables ({tables.length})</h2>
        <Button onClick={() => setCreating(!creating)}>{creating ? 'Cancel' : '+ Add table'}</Button>
      </div>
      {creating && <Card><CardBody>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input label="Number" value={form.table_number} onChange={(e) => setForm({ ...form, table_number: e.target.value })} />
          <Input label="Capacity" type="number" min={1} value={String(form.capacity)} onChange={(e) => setForm({ ...form, capacity: parseInt(e.target.value) || 1 })} />
          <Select label="Shape" value={form.shape} onChange={(e) => setForm({ ...form, shape: e.target.value as TableShape })}>
            <option value="round">Round</option><option value="square">Square</option><option value="rectangle">Rectangle</option><option value="booth">Booth</option>
          </Select>
          <Select label="Area" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value as TableArea })}>
            <option value="indoor">Indoor</option><option value="outdoor">Outdoor</option><option value="bar">Bar</option><option value="patio">Patio</option><option value="private">Private</option>
          </Select>
        </div>
        {err && <Alert tone="red">{err}</Alert>}
        <Button onClick={save}>Save</Button>
      </CardBody></Card>}
      <Card><CardBody className="p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-ink-500 bg-ink-50">
            <tr><th className="p-3">Number</th><th className="p-3 text-right">Cap</th><th className="p-3">Shape</th><th className="p-3">Area</th><th className="p-3">Status</th><th className="p-3">Actions</th></tr>
          </thead>
          <tbody>
            {tables.map((t) => (
              <Fragment key={t.id}>
                <tr className="border-t border-ink-100">
                  <td className="p-3 font-medium">{t.table_number}</td>
                  <td className="p-3 text-right">{t.capacity}</td>
                  <td className="p-3">{t.shape ?? '—'}</td>
                  <td className="p-3">{t.area ?? '—'}</td>
                  <td className="p-3"><Badge tone={t.status === 'free' ? 'green' : t.status === 'occupied' ? 'red' : 'gray'}>{t.status}</Badge></td>
                  <td className="p-3 space-x-1">
                    <Button variant="ghost" size="sm" onClick={() => setQrTableId(qrTableId === t.id ? null : t.id)}>QR</Button>
                    <Button variant="ghost" size="sm" onClick={async () => { await updateTable(t.id, { status: 'out_of_service' }); await onChanged() }}>Retire</Button>
                    <Button variant="ghost" size="sm" className="text-red-600" onClick={async () => { if (await confirmDialog({ title: 'Delete table?', message: `Delete table ${t.table_number}?`, confirmLabel: 'Delete', tone: 'danger' })) { await deleteTable(t.id); await onChanged() } }}>Delete</Button>
                  </td>
                </tr>
                {qrTableId === t.id && <TableQrRow table={t} branchId={branchId} />}
              </Fragment>
            ))}
          </tbody>
        </table>
      </CardBody></Card>
    </div>
  )
}

/* ─────────────────────────────────────────────
   MYINVOIS TAB (unchanged)
───────────────────────────────────────────── */

function MyInvoisTab({ branchId }: { branchId: string }) {
  const [cfg, setCfg] = useState<MyInvoisConfig | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [okMsg, setOkMsg] = useState<string | null>(null)
  const [form, setForm] = useState<Partial<MyInvoisConfig>>({
    branch_id: branchId, environment: 'sandbox', country_code: 'MY',
    consolidate_b2c: true, b2c_threshold_myr: 10000, is_active: false,
  })

  useEffect(() => {
    let alive = true
    setLoading(true); setErr(null)
    void getMyInvoisConfig(branchId)
      .then((c) => {
        if (!alive) return
        setCfg(c)
        if (c) setForm(c); else setForm((f) => ({ ...f, branch_id: branchId }))
      })
      .catch((e) => alive && setErr((e as Error).message))
      .finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [branchId])

  const save = async () => {
    setSaving(true); setErr(null); setOkMsg(null)
    try {
      const next = await upsertMyInvoisConfig({ ...form, branch_id: branchId, b2c_threshold_myr: Number(form.b2c_threshold_myr ?? 10000) })
      setCfg(next); setForm(next); setOkMsg('Configuration saved.')
    } catch (e) { setErr((e as Error).message) } finally { setSaving(false) }
  }

  if (loading) return <div className="py-10 text-center"><Spinner /> Loading…</div>

  return (
    <div className="space-y-3">
      <Card><CardBody>
        <div className="flex items-start justify-between mb-3">
          <div>
            <h2 className="font-display text-lg">MyInvois (LHDN) configuration</h2>
            <p className="text-sm text-ink-500">Per-branch credentials for Malaysia's e-invoice mandate.</p>
          </div>
          <Badge tone={cfg?.is_active ? 'green' : 'gray'}>{cfg?.is_active ? 'active' : 'inactive'}</Badge>
        </div>
        <MyInvoisFormFields form={form} setForm={setForm} />
        {err && <Alert tone="red">{err}</Alert>}
        {okMsg && <Alert tone="green">{okMsg}</Alert>}
        <div className="mt-4"><Button onClick={save} loading={saving}>Save configuration</Button></div>
      </CardBody></Card>
    </div>
  )
}

/* ─────────────────────────────────────────────
   ORGANISATION TAB
───────────────────────────────────────────── */

import type { Organization } from '../../lib/restaurant/types'

function OrgTab({ org, orgId, isOwner, onOrgUpdated, onBranchAdded }: {
  org: Organization | null
  orgId: string | null
  isOwner: boolean
  onOrgUpdated: () => Promise<void>
  onBranchAdded: () => Promise<void>
}) {
  const [members, setMembers] = useState<Array<OrgMember & { email?: string; full_name?: string }>>([])
  const [loadingMembers, setLoadingMembers] = useState(false)
  const [orgName, setOrgName] = useState(org?.name ?? '')
  const [savingName, setSavingName] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteOwner, setInviteOwner] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [newBranch, setNewBranch] = useState('')
  const [addingBranch, setAddingBranch] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)

  useEffect(() => {
    if (!orgId) return
    setLoadingMembers(true)
    void listOrgMembers(orgId)
      .then(setMembers)
      .catch((e) => setErr((e as Error).message))
      .finally(() => setLoadingMembers(false))
  }, [orgId])

  const saveOrgName = async () => {
    if (!orgId || !orgName.trim()) return
    setSavingName(true); setErr(null); setOk(null)
    try {
      await updateOrgName(orgId, orgName.trim())
      await onOrgUpdated()
      setOk('Organisation name updated.')
    } catch (e) { setErr((e as Error).message) } finally { setSavingName(false) }
  }

  const invite = async () => {
    if (!orgId || !inviteEmail.trim()) return
    setInviting(true); setErr(null); setOk(null)
    try {
      const result = await addOrgMemberByEmail(orgId, inviteEmail.trim(), inviteOwner)
      setOk(`${result.name} added as ${result.is_owner ? 'owner' : 'member'}.`)
      setInviteEmail('')
      const updated = await listOrgMembers(orgId)
      setMembers(updated)
    } catch (e) { setErr((e as Error).message) } finally { setInviting(false) }
  }

  const removeMember = async (userId: string) => {
    if (!orgId) return
    setErr(null); setOk(null)
    try {
      await removeOrgMember(orgId, userId)
      setMembers((prev) => prev.filter((m) => m.user_id !== userId))
      setOk('Member removed.')
    } catch (e) { setErr((e as Error).message) }
  }

  const addBranch = async () => {
    if (!orgId || !newBranch.trim()) return
    setAddingBranch(true); setErr(null); setOk(null)
    try {
      await createBranch({ organization_id: orgId, name: newBranch.trim(), status: 'active' })
      await onBranchAdded()
      setOk(`Branch "${newBranch.trim()}" created.`)
      setNewBranch('')
    } catch (e) { setErr((e as Error).message) } finally { setAddingBranch(false) }
  }

  if (!org) return <EmptyState title="No organisation found" />

  return (
    <div className="space-y-4">
      {err && <Alert tone="red">{err}</Alert>}
      {ok  && <Alert tone="green">{ok}</Alert>}

      {/* Org name */}
      <Card><CardBody>
        <h2 className="font-display text-lg mb-3">Organisation settings</h2>
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Input label="Organisation name" value={orgName} onChange={(e) => setOrgName(e.target.value)} disabled={!isOwner} />
          </div>
          {isOwner && (
            <Button onClick={saveOrgName} loading={savingName}>Save</Button>
          )}
        </div>
        <div className="mt-2 flex gap-2 text-sm text-ink-500 items-center">
          <span>Plan: <Badge tone="amber">{org.plan_tier}</Badge></span>
          <span>·</span>
          <span>Status: <Badge tone={org.is_active ? 'green' : 'gray'}>{org.is_active ? 'active' : 'inactive'}</Badge></span>
        </div>
      </CardBody></Card>

      {/* Members */}
      <Card><CardBody>
        <h2 className="font-display text-lg mb-3">Team members</h2>
        {loadingMembers ? (
          <div className="py-4 text-center"><Spinner /></div>
        ) : (
          <OrgMembersTable members={members} isOwner={isOwner} onRemove={removeMember} />
        )}

        {isOwner && (
          <div className="mt-4 border-t border-ink-100 pt-4">
            <p className="text-sm font-medium mb-2">Invite by email</p>
            <div className="flex gap-2 flex-wrap">
              <Input
                placeholder="colleague@email.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                className="flex-1 min-w-[200px]"
              />
              <Select value={inviteOwner ? '1' : '0'} onChange={(e) => setInviteOwner(e.target.value === '1')}>
                <option value="0">Member</option>
                <option value="1">Owner</option>
              </Select>
              <Button onClick={invite} loading={inviting}>Invite</Button>
            </div>
            <p className="text-xs text-ink-400 mt-1">They must already have a DNJ account to be invited.</p>
          </div>
        )}
      </CardBody></Card>

      {/* Add branch */}
      {isOwner && (
        <Card><CardBody>
          <h2 className="font-display text-lg mb-3">Add a branch</h2>
          <div className="flex gap-2 items-end">
            <div className="flex-1">
              <Input label="Branch name" placeholder="e.g. Sunway Pyramid outlet" value={newBranch} onChange={(e) => setNewBranch(e.target.value)} />
            </div>
            <Button onClick={addBranch} loading={addingBranch}>Add branch</Button>
          </div>
        </CardBody></Card>
      )}
    </div>
  )
}
