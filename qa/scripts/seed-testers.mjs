// One-shot: seed parsed_resume + interview_answers for 3 testers via admin PATCH.
// Mirrors DevSeedPanel.tsx exactly so we know the panel will work too.

import { config } from '../config.mjs'
import { mintTokenFor } from '../lib/auth.mjs'
import { mgmtSql } from '../lib/http.mjs'

const TARGETS = [
  { email: 't02.weiming.finance@dnj-test.my',    industry: 'finance',    fullName: 'Tan Wei Ming' },
  { email: 't13.dharmendra.legal@dnj-test.my',   industry: 'legal',      fullName: 'Dharmendra Singh' },
  { email: 't15.rohan.consulting@dnj-test.my',   industry: 'consulting', fullName: 'Rohan Menon' },
]

function defaultParsedResume(fullName, industry) {
  return {
    extracted_at: new Date().toISOString(),
    summary: `${industry} professional with seven years of experience leading cross-functional teams.`,
    skills: ['stakeholder management', 'risk assessment', 'operational excellence', 'data-driven decision making', 'team leadership'],
    experience: [
      { title: `Senior ${industry} Specialist`, company: 'Anonymized — pilot seed', start: '2022-01', end: 'present',
        highlights: ['Led a 6-person team across three time zones.', 'Reduced cycle time by 18% via process redesign.'] },
      { title: `${industry} Analyst`, company: 'Anonymized — pilot seed', start: '2019-03', end: '2021-12',
        highlights: ['Built reporting that informed quarterly planning.', 'Mentored two junior analysts to promotion.'] },
    ],
    education: [{ degree: 'Bachelor of Science', field: industry, year: 2018 }],
    derived_tags: {
      'leadership.directness': 0.7, 'leadership.consensus': 0.5,
      'work.pace': 0.65, 'work.autonomy': 0.6, 'culture.formality': 0.55,
    },
    seed_source: 'dev_seed_panel',
    candidate_name: fullName,
  }
}

function defaultInterviewAnswers(industry) {
  return {
    motivation: `I'm looking for a role where I can apply seven years of ${industry} experience to a team that values both autonomy and clear structure.`,
    work_style: 'I prefer focused individual blocks for analytical work, with structured weekly syncs for alignment. I default to written-first communication.',
    decision_style: 'I gather data, weigh trade-offs explicitly, and bias toward reversible decisions. For irreversible calls I pull in one second opinion.',
    conflict: 'I name disagreements early and try to separate the issue from the person. I will escalate if blocked for more than 48 hours.',
    growth_area: 'I want to grow into a role where my technical depth informs broader strategic decisions.',
    seed_source: 'dev_seed_panel',
  }
}

const token = await mintTokenFor(config.TESTER_ADMIN)
console.log('Admin token minted.')

for (const t of TARGETS) {
  const rows = await mgmtSql(`select t.id::text as id from public.talents t join public.profiles p on p.id=t.profile_id where p.email='${t.email}'`)
  if (!rows[0]) { console.log(`✗ ${t.email}: not found`); continue }
  const res = await fetch(`${config.SUPABASE_URL}/rest/v1/talents?id=eq.${rows[0].id}`, {
    method: 'PATCH',
    headers: {
      apikey: config.SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({
      parsed_resume: defaultParsedResume(t.fullName, t.industry),
      interview_answers: defaultInterviewAnswers(t.industry),
      extraction_status: 'complete',
      updated_at: new Date().toISOString(),
    }),
  })
  console.log(`${res.status === 200 ? '✓' : '✗'} ${t.email} (${t.industry}) — status ${res.status}`)
}
