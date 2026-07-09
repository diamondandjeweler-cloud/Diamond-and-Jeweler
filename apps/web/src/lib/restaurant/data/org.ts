/**
 * Restaurant data access — ORGANIZATION (multi-tenancy).
 * Relocated verbatim from store.ts (P5 barrel split).
 */
import { supabase } from '../../supabase'
import { restaurantDb as db } from '../client'
import type { Organization, OrgMember } from '../types'

export async function getMyOrg(): Promise<{ org: Organization | null; isOwner: boolean; noOrg: boolean }> {
  const { data: members, error } = await db.from('org_member').select('organization_id, is_owner').limit(1)
  if (error) throw error
  if (!members || members.length === 0) return { org: null, isOwner: false, noOrg: true }
  const row = members[0] as { organization_id: string; is_owner: boolean }
  const { data: org, error: orgErr } = await db.from('organization').select('*').eq('id', row.organization_id).maybeSingle()
  if (orgErr) throw orgErr
  return { org: org as Organization ?? null, isOwner: row.is_owner, noOrg: false }
}

export async function listOrgMembers(orgId: string): Promise<Array<OrgMember & { email?: string; full_name?: string }>> {
  const { data, error } = await db.from('org_member').select('*').eq('organization_id', orgId).order('created_at')
  if (error) throw error
  return (data ?? []) as Array<OrgMember & { email?: string; full_name?: string }>
}

export async function updateOrgName(orgId: string, name: string): Promise<void> {
  const { error } = await db.from('organization').update({ name }).eq('id', orgId)
  if (error) throw error
}

// create_org / add_org_member / remove_org_member are LIVE-ONLY RPCs — present in
// the running DB but absent from db.generated (same category as the matcher RPCs
// flagged for a P7 migration backfill), so the args are cast past the typed-client
// name+arg check while runtime is unchanged.
export async function createOrg(orgName: string, branchName: string): Promise<{ org_id: string; branch_id: string; employee_id: string }> {
  const { data, error } = await supabase.rpc('create_org' as never, { p_org_name: orgName, p_branch_name: branchName } as never)
  if (error) throw error
  return data as { org_id: string; branch_id: string; employee_id: string }
}

export async function addOrgMemberByEmail(orgId: string, email: string, isOwner = false): Promise<{ user_id: string; name: string; is_owner: boolean }> {
  const { data, error } = await supabase.rpc('add_org_member' as never, { p_org_id: orgId, p_email: email, p_is_owner: isOwner } as never)
  if (error) throw error
  return data as { user_id: string; name: string; is_owner: boolean }
}

export async function removeOrgMember(orgId: string, userId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_org_member' as never, { p_org_id: orgId, p_user_id: userId } as never)
  if (error) throw error
}
