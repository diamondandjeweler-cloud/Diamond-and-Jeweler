import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

interface LegalCopy {
  entityName: string | null  // e.g. "DNJ Sdn Bhd (123456-A)"
  contactEmail: string       // e.g. "privacy@bole.my"
  legalReviewed: boolean     // when true, drops the "draft pending legal review" footer
  lastUpdated: string        // ISO date
  version: string            // semver-ish
}

const FALLBACK: LegalCopy = {
  entityName: null,
  contactEmail: 'privacy@bole.my',
  legalReviewed: false,
  lastUpdated: '2026-04-21',
  version: '0.1',
}

export default function PrivacyNotice() {
  const [copy, setCopy] = useState<LegalCopy>(FALLBACK)

  useEffect(() => {
    let cancelled = false
    void supabase.from('system_config')
      .select('key, value')
      .in('key', ['legal_entity_name', 'legal_contact_email', 'legal_reviewed', 'legal_last_updated', 'legal_version'])
      .then(({ data }) => {
        if (cancelled || !data) return
        const map = new Map<string, unknown>()
        for (const row of data as Array<{ key: string; value: unknown }>) map.set(row.key, row.value)
        setCopy({
          entityName: stringValue(map.get('legal_entity_name'), null),
          contactEmail: stringValue(map.get('legal_contact_email'), FALLBACK.contactEmail) ?? FALLBACK.contactEmail,
          legalReviewed: map.get('legal_reviewed') === true || map.get('legal_reviewed') === 'true',
          lastUpdated: stringValue(map.get('legal_last_updated'), FALLBACK.lastUpdated) ?? FALLBACK.lastUpdated,
          version: stringValue(map.get('legal_version'), FALLBACK.version) ?? FALLBACK.version,
        })
      })
    return () => { cancelled = true }
  }, [])

  return (
    <article className="max-w-3xl mx-auto px-4 py-10">
      <Link to="/" className="text-brand-600 text-sm underline">← Home</Link>
      <h1 className="text-3xl font-bold mt-4 mb-1">Privacy Notice</h1>
      <p className="text-xs text-gray-500 mb-6">
        Last updated: {copy.lastUpdated}
        {!copy.legalReviewed && ' · Draft pending legal review'}
        {' · Version: '}{copy.version}
      </p>

      <Section title="0. Data controller">
        <p>
          <strong>{copy.entityName ?? 'DNJ — operating company to be confirmed at registration'}</strong>,
          a company {copy.entityName ? 'registered' : 'in the process of being registered'} in Malaysia.
          Contact for privacy matters:{' '}
          <a href={`mailto:${copy.contactEmail}`} className="underline">{copy.contactEmail}</a>.
        </p>
      </Section>

      <Section title="1. Data we collect">
        <ul className="list-disc ml-6 space-y-1">
          <li><strong>Account identity:</strong> email, full name, phone number.</li>
          <li><strong>Sensitive personal data (talents only):</strong> date of birth (DOB), identity card or passport scan.</li>
          <li><strong>Professional data (talents):</strong> résumé, interview answers, workplace preference ratings, salary expectations.</li>
          <li><strong>Company data (hiring side):</strong> SSM registration number, business license, role requirements.</li>
          <li><strong>Technical data:</strong> IP address, browser user agent, session tokens.</li>
        </ul>
      </Section>

      <Section title="2. Purposes of processing">
        <ul className="list-disc ml-6 space-y-1">
          <li>Operating the platform: account authentication, matching, interview scheduling.</li>
          <li>AI-powered compatibility scoring using personal profile data. Your data is never shown to employers or other users without your consent.</li>
          <li>Anonymised market-rate comparisons.</li>
          <li>Transactional email notifications (via Resend Inc.) and optional WhatsApp messages (via WATI) when you opt in.</li>
        </ul>
      </Section>

      <Section title="3. Legal basis under PDPA Malaysia (2010)">
        <p>
          We rely on your explicit consent, captured at signup and recorded in your
          profile. You may withdraw consent at any time via the{' '}
          <Link to="/data-requests" className="text-brand-600 underline">Data Requests</Link>{' '}
          page.
        </p>
      </Section>

      <Section title="4. How your data is protected">
        <ul className="list-disc ml-6 space-y-1">
          <li>DOB is encrypted at the database column level using pgsodium (AES-IETF). Only admins and the server-side matching engine can decrypt.</li>
          <li>IC scans, résumés, and business licenses are stored in private Supabase storage buckets, gated by Row Level Security policies scoped to your user ID or company ID.</li>
          <li>TLS in transit (HTTPS) and AES-256 at rest.</li>
          <li>IC documents are automatically purged 30 days after verification completes.</li>
        </ul>
      </Section>

      <Section title="5. Who sees your data">
        <ul className="list-disc ml-6 space-y-1">
          <li><strong>Hiring managers</strong> see talents' derived tags, preference ratings, and salary expectation — never DOB, IC, email, or full name (unless privacy is set to &lsquo;public&rsquo;).</li>
          <li><strong>HR admins</strong> see the interview-scheduling queue for candidates their hiring managers shortlist. They do not browse talent data.</li>
          <li><strong>Talents</strong> see only their own matches and the company name attached to each role; they do not see other talents.</li>
          <li><strong>Platform admins</strong> may access any data for verification, dispute resolution, or compliance. All admin actions are logged.</li>
          <li><strong>Third parties:</strong> Supabase Inc. (infrastructure, data stored in Singapore), Resend Inc. (email delivery), and (optionally, when you opt in) WATI for WhatsApp delivery. All contractually bound by data-processing agreements.</li>
        </ul>
      </Section>

      <Section title="6. Retention">
        <ul className="list-disc ml-6 space-y-1">
          <li>Active account data is retained while the account is open.</li>
          <li>IC scans are purged 30 days after verification.</li>
          <li>After a deletion request is marked completed, sensitive data is purged 30 days later. De-identified audit rows are retained as required by law.</li>
        </ul>
      </Section>

      <Section title="7. Your rights">
        <p>Under PDPA you have the right to:</p>
        <ul className="list-disc ml-6 space-y-1">
          <li><strong>Access</strong> a copy of your personal data.</li>
          <li><strong>Correct</strong> inaccurate data.</li>
          <li><strong>Delete</strong> your personal data (subject to legal retention requirements).</li>
          <li><strong>Receive</strong> your data in a portable format.</li>
          <li><strong>Withdraw consent</strong> at any time.</li>
        </ul>
        <p className="mt-2">
          To exercise any of these rights, submit a{' '}
          <Link to="/data-requests" className="text-brand-600 underline">Data Request</Link>.
          We respond within 21 days.
        </p>
      </Section>

      <Section title="8. Contact">
        <p>
          Questions about this notice:{' '}
          <a href={`mailto:${copy.contactEmail}`} className="underline">{copy.contactEmail}</a>.
        </p>
      </Section>

      {!copy.legalReviewed && (
        <>
          <hr className="my-8" />
          <p className="text-xs text-gray-500">
            <strong>Legal review pending.</strong> This notice is a good-faith draft and
            will be revised by Malaysian counsel before public launch.
          </p>
        </>
      )}
    </article>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-xl font-semibold mb-2">{title}</h2>
      <div className="text-sm text-gray-700 space-y-2">{children}</div>
    </section>
  )
}

function stringValue(v: unknown, fallback: string | null): string | null {
  if (typeof v === 'string' && v.trim().length > 0) return v
  return fallback
}
