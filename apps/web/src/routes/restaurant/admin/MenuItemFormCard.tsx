import type { Dispatch, RefObject, SetStateAction } from 'react'
import { Alert, Button, Card, CardBody, Input, Select } from '../../../components/ui'
import type { CourseType, MenuCategory } from '../../../lib/restaurant/types'

/* ─────────────────────────────────────────────
   MENU ITEM FORM CARD (presentational — state stays in MenuTab)
───────────────────────────────────────────── */

export type ItemForm = {
  name: string; description: string; price: number; category_id: string
  station: string; course_type: CourseType; is_active: boolean
  image_url: string; available_from: string; available_until: string
  grab_id: string; foodpanda_id: string; shopee_id: string
}

export function MenuItemFormCard({ form, setForm, categories, uploading, err, fileRef, isEditing, onImageFile, onSave, onCancel }: {
  form: ItemForm
  setForm: Dispatch<SetStateAction<ItemForm>>
  categories: MenuCategory[]
  uploading: boolean
  err: string | null
  fileRef: RefObject<HTMLInputElement>
  isEditing: boolean
  onImageFile: (f: File) => void
  onSave: () => void
  onCancel: () => void
}) {
  return (
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
              ? <img src={form.image_url} alt="preview" loading="lazy" decoding="async" className="w-14 h-14 rounded-lg object-cover border border-ink-200" />
              : <div className="w-14 h-14 rounded-lg bg-ink-100 flex items-center justify-center text-ink-400 text-xs border border-ink-200">None</div>
            }
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void onImageFile(f) }} />
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
        <Button onClick={onSave}>{isEditing ? 'Update item' : 'Create item'}</Button>
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
      </div>
    </CardBody></Card>
  )
}
