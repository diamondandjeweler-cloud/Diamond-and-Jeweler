// Dev seed panel — surfaces only on test domains (@dnj-test.my admins) and
// in local dev. Lets the admin populate parsed_resume + interview_answers
// blobs for tester talents so the matching engine has something to chew on.
//
// We keep the heuristic blobs deliberately representative-but-bland so they
// can stand in as compatible candidates for a Risk Manager / Operations Lead
// type role without hand-tuning per persona.

import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useSession } from '../../../state/useSession'
import { formatError } from '../../../lib/errors'
import LoadingSpinner from '../../../components/LoadingSpinner'

interface TesterTalent {
  talent_id: string
  profile_id: string
  email: string
  full_name: string
  has_parsed_resume: boolean
  has_interview_answers: boolean
}

const TEST_DOMAIN = 'dnj-test.my'

function isTestEnv(adminEmail: string | undefined): boolean {
  if (!adminEmail) return false
  if (import.meta.env.DEV) return true
  return adminEmail.toLowerCase().endsWith('@' + TEST_DOMAIN)
}

// Representative parsed_resume seed. Industry-neutral enough to slot against
// a Risk Manager / Operations Lead role without giving every tester an
// unrealistic 99% match.
function defaultParsedResume(fullName: string, industry: string): unknown {
  return {
    extracted_at: new Date().toISOString(),
    summary: `${industry} professional with seven years of experience leading cross-functional teams.`,
    skills: [
      'stakeholder management',
      'risk assessment',
      'operational excellence',
      'data-driven decision making',
      'team leadership',
    ],
    experience: [
      {
        title: `Senior ${industry} Specialist`,
        company: 'Anonymized — pilot seed',
        start: '2022-01',
        end: 'present',
        highlights: [
          'Led a 6-person team across three time zones.',
          'Reduced cycle time by 18% via process redesign.',
        ],
      },
      {
        title: `${industry} Analyst`,
        company: 'Anonymized — pilot seed',
        start: '2019-03',
        end: '2021-12',
        highlights: [
          'Built reporting that informed quarterly planning.',
          'Mentored two junior analysts to promotion.',
        ],
      },
    ],
    education: [
      { degree: 'Bachelor of Science', field: industry, year: 2018 },
    ],
    derived_tags: {
      'leadership.directness': 0.7,
      'leadership.consensus': 0.5,
      'work.pace': 0.65,
      'work.autonomy': 0.6,
      'culture.formality': 0.55,
    },
    seed_source: 'dev_seed_panel',
    candidate_name: fullName,
  }
}

function defaultInterviewAnswers(industry: string): Record<string, string> {
  return {
    motivation: `I'm looking for a role where I can apply seven years of ${industry} experience to a team that values both autonomy and clear structure.`,
    work_style: 'I prefer focused individual blocks for analytical work, with structured weekly syncs for alignment. I default to written-first communication.',
    decision_style: 'I gather data, weigh trade-offs explicitly, and bias toward reversible decisions. For irreversible calls I pull in one second opinion.',
    conflict: 'I name disagreements early and try to separate the issue from the person. I will escalate if blocked for more than 48 hours.',
    growth_area: 'I want to grow into a role where my technical depth informs broader strategic decisions.',
    seed_source: 'dev_seed_panel',
  }
}

export default function DevSeedPanel() {
  const { profile } = useSession()
  const enabled = isTestEnv(profile?.email)
  const [talents, setTalents] = useState<TesterTalent[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [msg, setMsg] = useState<string | null>(null)

  async function load() {
    setLoading(true); setErr(null)
    try {
      const { data, error } = await supabase
        .from('talents')
        .select(`
          id,
          profile_id,
          parsed_resume,
          interview_answers,
          profiles!inner (email, full_name)
        `)
        .like('profiles.email', '%@' + TEST_DOMAIN)
        .order('created_at', { ascending: true })
      if (error) throw error
      type Row = {
        id: string
        profile_id: string
        parsed_resume: unknown
        interview_answers: unknown
        profiles: { email: string; full_name: string } | { email: string; full_name: string }[]
      }
      const rows = (data ?? []) as Row[]
      const mapped: TesterTalent[] = rows.map((r) => {
        const prof = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles
        return {
          talent_id: r.id,
          profile_id: r.profile_id,
          email: prof?.email ?? '(unknown)',
          full_name: prof?.full_name ?? '(unknown)',
          has_parsed_resume: !!r.parsed_resume && Object.keys(r.parsed_resume as object).length > 0,
          has_interview_answers: !!r.interview_answers && Object.keys(r.interview_answers as object).length > 0,
        }
      })
      setTalents(mapped)
    } catch (e) {
      setErr(formatError(e))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (enabled) void load() }, [enabled])

  async function seedTalent(t: TesterTalent) {
    setBusyId(t.talent_id); setMsg(null); setErr(null)
    try {
      // Infer the persona industry from the email slug — emails are shaped
      // tNN.persona.industry@dnj-test.my.
      const slug = t.email.split('@')[0]
      const parts = slug.split('.')
      const industry = (parts[2] ?? 'general').replace(/_/g, ' ')

      const { error } = await supabase
        .from('talents')
        .update({
          parsed_resume: defaultParsedResume(t.full_name, industry),
          interview_answers: defaultInterviewAnswers(industry),
          extraction_status: 'complete',
          updated_at: new Date().toISOString(),
        })
        .eq('id', t.talent_id)
      if (error) throw error
      setMsg(`Seeded ${t.full_name} (${industry}).`)
      await load()
    } catch (e) {
      setErr(formatError(e))
    } finally {
      setBusyId(null)
    }
  }

  async function clearTalent(t: TesterTalent) {
    setBusyId(t.talent_id); setMsg(null); setErr(null)
    try {
      const { error } = await supabase
        .from('talents')
        .update({
          parsed_resume: null,
          interview_answers: null,
          extraction_status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', t.talent_id)
      if (error) throw error
      setMsg(`Cleared ${t.full_name}.`)
      await load()
    } catch (e) {
      setErr(formatError(e))
    } finally {
      setBusyId(null)
    }
  }

  if (!enabled) {
    return (
      <div className="rounded border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <p className="font-medium">Dev seed panel hidden in production.</p>
        <p className="mt-1">
          This panel is only visible to admins on <code>@{TEST_DOMAIN}</code> accounts or
          when running locally in dev mode.
        </p>
      </div>
    )
  }

  if (loading) return <LoadingSpinner />

  return (
    <div>
      <div className="mb-4 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-medium">Test-domain only.</p>
        <p className="mt-1">
          Seeds <code>parsed_resume</code> and <code>interview_answers</code> for tester
          talents (<code>@{TEST_DOMAIN}</code>) so the matching engine has something to
          score. Industry is inferred from the email slug.
        </p>
      </div>

      {err && <p className="mb-3 text-sm text-red-600">{err}</p>}
      {msg && <p className="mb-3 text-sm text-green-700">{msg}</p>}

      <div className="overflow-x-auto rounded border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr className="text-left">
              <th className="px-3 py-2 font-medium">Tester</th>
              <th className="px-3 py-2 font-medium">Email</th>
              <th className="px-3 py-2 font-medium">Resume</th>
              <th className="px-3 py-2 font-medium">Interview</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {talents.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-4 text-center text-gray-500">
                No <code>@{TEST_DOMAIN}</code> talents found. Run the tester seed first.
              </td></tr>
            )}
            {talents.map((t) => (
              <tr key={t.talent_id} className="border-t">
                <td className="px-3 py-2">{t.full_name}</td>
                <td className="px-3 py-2 font-mono text-xs">{t.email}</td>
                <td className="px-3 py-2">{t.has_parsed_resume ? '✓' : '—'}</td>
                <td className="px-3 py-2">{t.has_interview_answers ? '✓' : '—'}</td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => void seedTalent(t)}
                    disabled={busyId === t.talent_id}
                    className="rounded border px-2 py-1 text-xs hover:bg-gray-50 disabled:opacity-50"
                  >
                    {busyId === t.talent_id ? 'Working…' : 'Seed'}
                  </button>
                  {(t.has_parsed_resume || t.has_interview_answers) && (
                    <button
                      type="button"
                      onClick={() => void clearTalent(t)}
                      disabled={busyId === t.talent_id}
                      className="ml-2 rounded border px-2 py-1 text-xs text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      Clear
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
