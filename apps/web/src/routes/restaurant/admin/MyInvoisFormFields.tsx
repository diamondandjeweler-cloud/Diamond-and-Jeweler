import type { Dispatch, SetStateAction } from 'react'
import { Input, Select } from '../../../components/ui'
import type { MyInvoisConfig } from '../../../lib/restaurant/einvoice'

/* ─────────────────────────────────────────────
   MYINVOIS CONFIG FIELD GRID (presentational — cfg/save state stays in MyInvoisTab)
───────────────────────────────────────────── */

export function MyInvoisFormFields({ form, setForm }: {
  form: Partial<MyInvoisConfig>
  setForm: Dispatch<SetStateAction<Partial<MyInvoisConfig>>>
}) {
  return (
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
  )
}
