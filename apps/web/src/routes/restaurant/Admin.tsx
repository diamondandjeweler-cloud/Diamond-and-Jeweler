import { Fragment, useEffect, useRef, useState } from 'react'
import { Alert, Badge, Button, Card, CardBody, EmptyState, Input, Select, Spinner } from '../../components/ui'
import { useRestaurant } from '../../lib/restaurant/context'
import { useSession } from '../../state/useSession'
import {
  listAllMenuItems, createMenuItem, updateMenuItem, deleteMenuItem,
  listCategories, createCategory, updateCategory, deleteCategory,
  listTables, createTable, updateTable, deleteTable,
  listModifiersForItem, createModifier, updateModifier, deleteModifier,
  uploadMenuItemImage,
  listOrgMembers, addOrgMemberByEmail, removeOrgMember, updateOrgName,
  createBranch,
} from '../../lib/restaurant/store'
import type { CourseType, MenuCategory, MenuItem, Modifier, OrgMember, RestaurantTable, TableArea, TableShape } from '../../lib/restaurant/types'
import { MYR } from '../../lib/restaurant/format'
import { getMyInvoisConfig, upsertMyInvoisConfig, type MyInvoisConfig } from '../../lib/restaurant/einvoice'

const ADMIN_EMPLOYEE_ROLES = ['admin', 'owner', 'shift_manager']
const ADMIN_USER_ROLES     = ['admin', 'restaurant_staff']

export default function Admin() {
  const { branchId, employee, org, orgId, isOrgOwner, refreshOrg, refreshBranches } = useRestaurant()
  const { profile } = useSession()
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

type ItemForm = {
  name: string; description: string; price: number; category_id: string
  station: string; course_type: CourseType; is_active: boolean
  image_url: string; available_from: string; available_until: string
  grab_id: string; foodpanda_id: string; shopee_id: string
}

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
          <Card className="mb-4"><CardBody>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input label="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input label="Price (RM)" type="number" step="0.01" value={String(form.price)}
                onChange={(e) => setForm({ ...form, price: parseFloat(e.target.value) || 0 })} />
              <Select label="Category" value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
                <option value="">— none —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </Select>
              <Input label="Station" value={form.station} onChange={(e) => setForm({ ...form, station: e.target.value })} placeholder="kitchen / grill / bar…" />
              <Select label="Course type" value={form.course_type} onChange={(e) => setForm({ ...form, course_type: e.target.value as CourseType })}>
                {(['appetizer','main','dessert','drink','side','any'] as CourseType[]).map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </Select>
              <Select label="Active" value={form.is_active ? '1' : '0'} onChange={(e) => setForm({ ...form, is_active: e.target.value === '1' })}>
                <option value="1">Active</option><option value="0">Inactive</option>
              </Select>
              <div className="md:col-span-3">
                <Input label="Description" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
              </div>

              {/* Availability times */}
              <Input label="Available from (time)" type="time" value={form.available_from}
                onChange={(e) => setForm({ ...form, available_from: e.target.value })} />
              <Input label="Available until (time)" type="time" value={form.available_until}
                onChange={(e) => setForm({ ...form, available_until: e.target.value })} />

              {/* Delivery platform IDs */}
              <div className="md:col-span-3 border-t border-ink-100 pt-3 mt-1">
                <div className="text-xs font-semibold text-ink-500 uppercase tracking-wide mb-2">Delivery platform item IDs <span className="font-normal normal-case text-ink-400">(optional — paste the item ID from each platform portal)</span></div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <Input label="GrabFood item ID" value={form.grab_id} placeholder="e.g. GF-ITEM-12345"
                    onChange={(e) => setForm({ ...form, grab_id: e.target.value })} />
                  <Input label="FoodPanda item ID" value={form.foodpanda_id} placeholder="e.g. FP-456789"
                    onChange={(e) => setForm({ ...form, foodpanda_id: e.target.value })} />
                  <Input label="Shopee Food item ID" value={form.shopee_id} placeholder="e.g. SE-789012"
                    onChange={(e) => setForm({ ...form, shopee_id: e.target.value })} />
                </div>
              </div>

              {/* Image upload */}
              <div className="md:col-span-1">
                <div className="text-xs font-medium text-ink-700 mb-1">Photo</div>
                <div className="flex items-center gap-3">
                  {form.image_url
                    ? <img src={form.image_url} alt="preview" className="w-14 h-14 rounded-lg object-cover border border-ink-200" />
                    : <div className="w-14 h-14 rounded-lg bg-ink-100 flex items-center justify-center text-ink-400 text-xs border border-ink-200">None</div>
                  }
                  <input ref={fileRef} type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleImageFile(f) }} />
                  <div className="flex flex-col gap-1">
                    <Button size="sm" variant="secondary" loading={uploading} onClick={() => fileRef.current?.click()}>
                      {uploading ? 'Uploading…' : form.image_url ? 'Change' : 'Upload'}
                    </Button>
                    {form.image_url && (
                      <button className="text-xs text-red-500 hover:underline" onClick={() => setForm((f) => ({ ...f, image_url: '' }))}>Remove</button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {err && <Alert tone="red">{err}</Alert>}
            <div className="flex gap-2 mt-3">
              <Button onClick={save}>{editing ? 'Update item' : 'Create item'}</Button>
              <Button variant="ghost" onClick={reset}>Cancel</Button>
            </div>
          </CardBody></Card>
        )}

        <Card><CardBody className="p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-ink-500 bg-ink-50">
              <tr>
                <th className="p-3">Photo</th>
                <th className="p-3">Name</th>
                <th className="p-3">Category</th>
                <th className="p-3">Course</th>
                <th className="p-3 text-right">Price</th>
                <th className="p-3">Hours</th>
                <th className="p-3">Active</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((m) => {
                const cat = categories.find((c) => c.id === m.category_id)
                const modsOpen = expandedMods === m.id
                return (
                  <Fragment key={m.id}>
                    <tr className="border-t border-ink-100 hover:bg-ink-50/50">
                      <td className="p-3">
                        {m.image_url
                          ? <img src={m.image_url} alt={m.name} className="w-10 h-10 rounded-lg object-cover border border-ink-100" />
                          : <div className="w-10 h-10 rounded-lg bg-ink-100 flex items-center justify-center text-ink-300">
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                            </div>
                        }
                      </td>
                      <td className="p-3 font-medium">{m.name}</td>
                      <td className="p-3 text-ink-500">{cat?.name ?? '—'}</td>
                      <td className="p-3"><Badge tone="gray">{m.course_type}</Badge></td>
                      <td className="p-3 text-right font-medium">{MYR(Number(m.price))}</td>
                      <td className="p-3 text-xs text-ink-500">
                        {m.available_from && m.available_until
                          ? `${m.available_from}–${m.available_until}`
                          : m.available_from ? `From ${m.available_from}` : '—'}
                      </td>
                      <td className="p-3">
                        {m.is_active ? <Badge tone="green">on</Badge> : <Badge tone="red">off</Badge>}
                      </td>
                      <td className="p-3 space-x-1 whitespace-nowrap">
                        <button className="btn-ghost btn-sm" onClick={() => {
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
                        }}>Edit</button>
                        <button className="btn-ghost btn-sm text-brand-700"
                          onClick={() => setExpandedMods(modsOpen ? null : m.id)}>
                          Add-ons {modsOpen ? '▲' : '▼'}
                        </button>
                        <button className="btn-ghost btn-sm text-red-600"
                          onClick={async () => { if (window.confirm(`Delete "${m.name}"?`)) { await deleteMenuItem(m.id); await onChanged() } }}>
                          Delete
                        </button>
                      </td>
                    </tr>
                    {modsOpen && (
                      <tr className="border-t border-brand-100 bg-brand-50/40">
                        <td colSpan={8} className="p-0">
                          <ModifiersSection menuItemId={m.id} itemName={m.name} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
          </table>
        </CardBody></Card>
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
    if (!window.confirm(`Delete category "${name}"? Items in this category will have no category.`)) return
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
                    <button className="btn-ghost btn-sm text-brand-700" onClick={() => void save(c.id)}>Save</button>
                    <button className="btn-ghost btn-sm" onClick={() => setEditing(null)}>Cancel</button>
                  </>
                ) : (
                  <>
                    <span className="flex-1 text-sm text-ink-800">{c.name}</span>
                    <button className="btn-ghost btn-sm" onClick={() => { setEditing(c.id); setEditName(c.name) }}>Rename</button>
                    <button className="btn-ghost btn-sm text-red-600" onClick={() => void remove(c.id, c.name)}>Delete</button>
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
    if (!window.confirm(`Remove add-on "${name}"?`)) return
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
                  <button className="btn-ghost btn-sm text-brand-700 text-xs" onClick={() => void save(m.id)}>Save</button>
                  <button className="btn-ghost btn-sm text-xs" onClick={() => setEditing(null)}>✕</button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-ink-800">{m.name}</span>
                  <span className="text-ink-500 text-xs w-20 text-right">
                    {Number(m.price_delta) === 0 ? 'Free' : `+${MYR(Number(m.price_delta))}`}
                  </span>
                  <button className="btn-ghost btn-sm text-xs" onClick={() => { setEditing(m.id); setEditName(m.name); setEditPrice(String(m.price_delta)) }}>Edit</button>
                  <button className="btn-ghost btn-sm text-red-500 text-xs" onClick={() => void remove(m.id, m.name)}>✕</button>
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
                    <button className="btn-ghost btn-sm" onClick={() => setQrTableId(qrTableId === t.id ? null : t.id)}>QR</button>
                    <button className="btn-ghost btn-sm" onClick={async () => { await updateTable(t.id, { status: 'out_of_service' }); await onChanged() }}>Retire</button>
                    <button className="btn-ghost btn-sm text-red-600" onClick={async () => { if (window.confirm(`Delete table ${t.table_number}?`)) { await deleteTable(t.id); await onChanged() } }}>Delete</button>
                  </td>
                </tr>
                {qrTableId === t.id && (
                  <tr className="border-t border-brand-100 bg-brand-50">
                    <td colSpan={6} className="p-4">
                      <div className="flex items-center gap-6">
                        <img
                          alt={`QR for table ${t.table_number}`}
                          width={120} height={120}
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(`${window.location.origin}/menu/${branchId}?table=${t.id}`)}`}
                          className="rounded-lg border border-ink-200 bg-white p-1"
                        />
                        <div>
                          <div className="font-medium text-ink-900 mb-1">Table {t.table_number} — Guest Menu QR</div>
                          <div className="text-xs text-ink-500 mb-3 break-all font-mono">{window.location.origin}/menu/{branchId}?table={t.id}</div>
                          <a href={`https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=${encodeURIComponent(`${window.location.origin}/menu/${branchId}?table=${t.id}`)}`}
                            download={`table-${t.table_number}-qr.png`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm mr-2">
                            Download PNG
                          </a>
                          <a href={`/menu/${branchId}?table=${t.id}`} target="_blank" rel="noreferrer" className="btn-ghost btn-sm">
                            Preview menu →
                          </a>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </CardBody></Card>
    </div>
  )
}

/* ─────────────────────────────────────────────
   DELIVERY PLATFORMS TAB
───────────────────────────────────────────── */

const PLATFORMS = [
  {
    id:   'grab',
    name: 'GrabFood',
    color: 'bg-green-50 border-green-200',
    badge: 'bg-green-600',
    steps: [
      'Apply for GrabFood Merchant API access at grab.com/my/merchant',
      'After approval, go to Merchant Portal → Integrations → Webhooks',
      'Register webhook URL: https://www.diamondandjeweler.com/api/webhooks/grab',
      'Copy the signing secret → add to Vercel env as GRAB_SECRET',
      'Copy your Merchant ID  → add to Vercel env as GRAB_MERCHANT_ID',
      'Set GRAB_BRANCH_ID to your branch ID (visible in browser URL when on this page)',
    ],
    envVars: ['GRAB_SECRET', 'GRAB_MERCHANT_ID', 'GRAB_BRANCH_ID'],
  },
  {
    id:   'foodpanda',
    name: 'FoodPanda',
    color: 'bg-pink-50 border-pink-200',
    badge: 'bg-pink-600',
    steps: [
      'Contact FoodPanda Malaysia via vendor.foodpanda.my to request API access',
      'After approval, go to Vendor Portal → API & Webhooks',
      'Register webhook URL: https://www.diamondandjeweler.com/api/webhooks/foodpanda',
      'Copy the HMAC secret  → add to Vercel env as FOODPANDA_SECRET',
      'Set FOODPANDA_BRANCH_ID to your branch ID',
    ],
    envVars: ['FOODPANDA_SECRET', 'FOODPANDA_BRANCH_ID'],
  },
  {
    id:   'shopee',
    name: 'Shopee Food',
    color: 'bg-orange-50 border-orange-200',
    badge: 'bg-orange-500',
    steps: [
      'Apply for Shopee Food partner access at open.shopee.com',
      'After approval, go to Partner Portal → Webhook Settings',
      'Register webhook URL: https://www.diamondandjeweler.com/api/webhooks/shopee',
      'Copy the partner key  → add to Vercel env as SHOPEE_SECRET',
      'Set SHOPEE_BRANCH_ID to your branch ID',
    ],
    envVars: ['SHOPEE_SECRET', 'SHOPEE_BRANCH_ID'],
  },
]

function DeliveryTab() {
  return (
    <div className="space-y-5">
      {/* How it works */}
      <Card><CardBody>
        <h2 className="font-display text-lg mb-2">How delivery integration works</h2>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm text-ink-600">
          {[
            ['1. Register', 'Apply for API/merchant access with each platform. This requires a business registration.'],
            ['2. Add credentials', 'Paste the secret keys into Vercel → Project → Settings → Environment Variables.'],
            ['3. Map menu items', 'In Menu & pricing → Edit each item → fill in the platform item IDs so orders match correctly.'],
            ['4. Orders flow in', 'Platform orders hit your webhook → parsed → sent to KDS automatically, tagged with source.'],
          ].map(([title, desc]) => (
            <div key={title} className="bg-ink-50 rounded-xl p-4">
              <div className="font-semibold text-ink-800 mb-1">{title}</div>
              <div>{desc}</div>
            </div>
          ))}
        </div>
        <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
          <strong>Add env vars in Vercel:</strong> go to{' '}
          <a href="https://vercel.com/diamondandjeweler-5185s-projects/bole/settings/environment-variables"
            target="_blank" rel="noreferrer" className="underline font-medium">
            Vercel → bole → Settings → Environment Variables
          </a>{' '}
          and add each key below. Then redeploy.
        </div>
        <div className="mt-2 text-xs text-ink-500 font-mono bg-ink-50 rounded p-2">
          SUPABASE_SERVICE_ROLE_KEY = &lt;your-service-role-key-from-supabase-dashboard&gt;
        </div>
      </CardBody></Card>

      {/* Platform cards */}
      {PLATFORMS.map((p) => (
        <div key={p.id} className={`border rounded-xl overflow-hidden ${p.color}`}>
          <div className="px-5 py-4 flex items-center gap-3">
            <span className={`${p.badge} text-white text-xs font-bold px-2 py-0.5 rounded`}>{p.name}</span>
            <span className="text-sm text-ink-500">Not yet connected — follow the steps below</span>
          </div>
          <div className="bg-white px-5 py-4 border-t border-ink-100">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Steps */}
              <div>
                <div className="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-2">Setup steps</div>
                <ol className="space-y-1.5 text-sm text-ink-700 list-decimal list-inside">
                  {p.steps.map((s) => <li key={s}>{s}</li>)}
                </ol>
              </div>
              {/* Env vars + webhook URL */}
              <div>
                <div className="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-2">Vercel environment variables</div>
                <div className="space-y-1.5 mb-4">
                  {p.envVars.map((v) => (
                    <div key={v} className="font-mono text-xs bg-ink-50 border border-ink-200 rounded px-3 py-1.5 text-ink-700">{v}</div>
                  ))}
                </div>
                <div className="text-xs font-semibold text-ink-600 uppercase tracking-wide mb-1">Webhook URL to register</div>
                <div className="font-mono text-xs bg-ink-50 border border-ink-200 rounded px-3 py-2 text-brand-700 break-all">
                  https://www.diamondandjeweler.com/api/webhooks/{p.id}
                </div>
              </div>
            </div>
          </div>
        </div>
      ))}
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Input label="TIN" value={form.tin ?? ''} onChange={(e) => setForm({ ...form, tin: e.target.value })} />
          <Input label="SST registration no." value={form.sst_no ?? ''} onChange={(e) => setForm({ ...form, sst_no: e.target.value })} />
          <Input label="Business name" value={form.business_name ?? ''} onChange={(e) => setForm({ ...form, business_name: e.target.value })} />
          <Input label="SSM registration no." value={form.registration_no ?? ''} onChange={(e) => setForm({ ...form, registration_no: e.target.value })} />
          <Select label="Environment" value={form.environment ?? 'sandbox'} onChange={(e) => setForm({ ...form, environment: e.target.value as 'sandbox' | 'production' })}>
            <option value="sandbox">Sandbox</option><option value="production">Production</option>
          </Select>
          <Input label="Country code" value={form.country_code ?? 'MY'} onChange={(e) => setForm({ ...form, country_code: e.target.value })} />
          <div className="md:col-span-3"><Input label="Address line" value={form.address_line ?? ''} onChange={(e) => setForm({ ...form, address_line: e.target.value })} /></div>
          <Input label="City" value={form.city ?? ''} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <Input label="State" value={form.state ?? ''} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          <Input label="Postcode" value={form.postcode ?? ''} onChange={(e) => setForm({ ...form, postcode: e.target.value })} />
          <Input label="Vault: client_id name" value={form.client_id_secret_name ?? ''} onChange={(e) => setForm({ ...form, client_id_secret_name: e.target.value })} placeholder="myinvois_client_id_kl" />
          <Input label="Vault: client_secret name" value={form.client_secret_secret_name ?? ''} onChange={(e) => setForm({ ...form, client_secret_secret_name: e.target.value })} />
          <Input label="Vault: cert name" value={form.cert_secret_name ?? ''} onChange={(e) => setForm({ ...form, cert_secret_name: e.target.value })} />
          <Input label="Vault: cert password name" value={form.cert_password_secret_name ?? ''} onChange={(e) => setForm({ ...form, cert_password_secret_name: e.target.value })} />
          <Select label="Consolidate B2C nightly" value={form.consolidate_b2c ? '1' : '0'} onChange={(e) => setForm({ ...form, consolidate_b2c: e.target.value === '1' })}>
            <option value="1">Yes</option><option value="0">No</option>
          </Select>
          <Input label="B2C threshold (RM)" type="number" step="0.01" value={String(form.b2c_threshold_myr ?? 10000)} onChange={(e) => setForm({ ...form, b2c_threshold_myr: parseFloat(e.target.value) || 0 })} />
          <Select label="E-invoicing active" value={form.is_active ? '1' : '0'} onChange={(e) => setForm({ ...form, is_active: e.target.value === '1' })}>
            <option value="0">Inactive</option><option value="1">Active</option>
          </Select>
        </div>
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
          <table className="w-full text-sm">
            <thead><tr className="text-left text-ink-400 border-b border-ink-100">
              <th className="pb-2 font-medium">User ID</th>
              <th className="pb-2 font-medium">Role</th>
              <th className="pb-2 font-medium">Joined</th>
              {isOwner && <th />}
            </tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id} className="border-b border-ink-50 last:border-0">
                  <td className="py-2 font-mono text-xs text-ink-500">{m.user_id.slice(0, 8)}…</td>
                  <td className="py-2">
                    <Badge tone={m.is_owner ? 'amber' : 'gray'}>{m.is_owner ? 'Owner' : 'Member'}</Badge>
                  </td>
                  <td className="py-2 text-ink-400">{new Date(m.created_at).toLocaleDateString()}</td>
                  {isOwner && (
                    <td className="py-2 text-right">
                      <button
                        type="button"
                        onClick={() => void removeMember(m.user_id)}
                        className="text-red-500 hover:text-red-700 text-xs px-2 py-1 rounded hover:bg-red-50"
                      >
                        Remove
                      </button>
                    </td>
                  )}
                </tr>
              ))}
              {members.length === 0 && (
                <tr><td colSpan={4} className="py-4 text-center text-ink-400">No members yet.</td></tr>
              )}
            </tbody>
          </table>
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
            <p className="text-xs text-ink-400 mt-1">They must already have a BoLe account to be invited.</p>
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
