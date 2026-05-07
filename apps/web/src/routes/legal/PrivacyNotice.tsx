import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useSeo } from '../../lib/useSeo'

interface LegalCopy {
  entityName: string | null
  contactEmail: string
  dpoEmail: string
  legalReviewed: boolean
  lastUpdated: string
  version: string
}

const FALLBACK: LegalCopy = {
  entityName: null,
  contactEmail: 'privacy@diamondandjeweler.com',
  dpoEmail: 'dpo@diamondandjeweler.com',
  legalReviewed: false,
  lastUpdated: '2026-05-01',
  version: '2.0',
}

export default function PrivacyNotice() {
  useSeo({
    title: 'Privacy notice',
    description: 'How DNJ collects, uses, and protects your personal data under PDPA (Malaysia) and applicable privacy laws.',
  })
  const [copy, setCopy] = useState<LegalCopy>(FALLBACK)

  useEffect(() => {
    let cancelled = false
    void supabase.from('system_config')
      .select('key, value')
      .in('key', ['legal_entity_name', 'legal_contact_email', 'legal_dpo_email', 'legal_reviewed', 'legal_last_updated', 'legal_version'])
      .then(({ data }) => {
        if (cancelled || !data) return
        const map = new Map<string, unknown>()
        for (const row of data as Array<{ key: string; value: unknown }>) map.set(row.key, row.value)
        setCopy({
          entityName: stringValue(map.get('legal_entity_name'), null),
          contactEmail: stringValue(map.get('legal_contact_email'), FALLBACK.contactEmail) ?? FALLBACK.contactEmail,
          dpoEmail: stringValue(map.get('legal_dpo_email'), FALLBACK.dpoEmail) ?? FALLBACK.dpoEmail,
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

      <Section title="0. Data Controller">
        <p>
          DNJ Recruitment Platform operated by{' '}
          <strong>{copy.entityName ?? 'CRM Solution (003808986-A)'}</strong>,
          a company registered in Malaysia.
        </p>
        <p>
          Data Protection Officer (DPO):{' '}
          <a href={`mailto:${copy.dpoEmail}`} className="underline">{copy.dpoEmail}</a>
        </p>
        <p>
          Privacy contact:{' '}
          <a href={`mailto:${copy.contactEmail}`} className="underline">{copy.contactEmail}</a>
        </p>
      </Section>

      <Section title="1. Data We Collect">
        <p className="font-semibold mt-2">Account Identity (required to create account)</p>
        <ul className="list-disc ml-6 space-y-1">
          <li>Full name</li>
          <li>Email address</li>
          <li>Phone number</li>
        </ul>

        <p className="font-semibold mt-3">Date of Birth (required for matching)</p>
        <p>
          Your date of birth is required for our matching system to find roles where you&apos;ll
          thrive at this stage of your career. Without it we cannot produce matches and the
          platform serves no purpose for you. You may decline, but in that case you cannot use
          the platform. DOB is encrypted at the database column level and is never shown to
          employers or other users.
        </p>

        <p className="font-semibold mt-3">Professional Data (Talents)</p>
        <ul className="list-disc ml-6 space-y-1">
          <li>Résumé</li>
          <li>Interview answers</li>
          <li>Workplace preference ratings</li>
          <li>Salary expectations</li>
        </ul>

        <p className="font-semibold mt-3">Company Data (Hiring Side)</p>
        <ul className="list-disc ml-6 space-y-1">
          <li>SSM registration number</li>
          <li>Business license</li>
          <li>Role requirements</li>
        </ul>

        <p className="font-semibold mt-3">Technical Data</p>
        <ul className="list-disc ml-6 space-y-1">
          <li>IP address</li>
          <li>Browser user agent</li>
          <li>Session tokens</li>
        </ul>

        <p className="font-semibold mt-3">Optional Identity-Verification Data (Voluntary)</p>
        <p>
          The following are <strong>not required</strong> to use matching features and are
          collected only if you opt into the optional Identity-Verification Badge in future:
        </p>
        <ul className="list-disc ml-6 space-y-1">
          <li>NRIC / Passport number and copy</li>
          <li>Photograph</li>
        </ul>
      </Section>

      <Section title="2. Purposes of Processing">
        <ul className="list-disc ml-6 space-y-1">
          <li>Operating accounts and authentication.</li>
          <li>Performing matching and interview scheduling.</li>
          <li>
            Generating AI-powered match scores using profile data.{' '}
            <strong>Sensitive data (NRIC/Passport, full DOB digits) is never shown to employers
              or other users.</strong>
          </li>
          <li>Providing anonymised market-rate salary comparisons.</li>
          <li>Sending transactional emails via Resend Inc.</li>
          <li>Sending optional WhatsApp messages via WATI when you opt in.</li>
        </ul>
        <p className="mt-2">
          The matching methodology is proprietary and is treated as a trade secret. We do not
          disclose the exact rules.
        </p>
      </Section>

      <Section title="3. Legal Basis (PDPA)">
        <p>
          Processing is based on your <strong>explicit consent</strong>, captured at signup and
          recorded against your profile. You may withdraw consent at any time via the{' '}
          <Link to="/data-requests" className="text-brand-600 underline">Data Requests</Link>{' '}
          page. Withdrawal may end your access to the platform if the data is required for the
          service to function (e.g. DOB).
        </p>
      </Section>

      <Section title="4. Mandatory Notice under Section 7 PDPA">
        <ul className="list-disc ml-6 space-y-1">
          <li>
            <strong>(a)</strong> Data marked &ldquo;required&rdquo; in §1 is obligatory to create
            an account. Other data is voluntary.
          </li>
          <li>
            <strong>(b)</strong> Failure to provide required data prevents account creation. You
            cannot use the platform without DOB.
          </li>
          <li>
            <strong>(c)</strong> You may request access to and correction of your data via the{' '}
            <Link to="/data-requests" className="text-brand-600 underline">Data Requests</Link>{' '}
            page.
          </li>
          <li>
            <strong>(d)</strong> You may limit processing via privacy settings or by withdrawing
            consent.
          </li>
          <li>
            <strong>(e)</strong> Data may be disclosed to <strong>data processors</strong>{' '}
            (Supabase, Resend, WATI), to <strong>matched hiring companies</strong> as described
            in §6, or to <strong>authorities</strong> where legally required.
          </li>
          <li>
            <strong>(f)</strong> Data is obtained directly from you. We do not buy or scrape
            personal data from third parties.
          </li>
        </ul>
      </Section>

      <Section title="5. How Your Data Is Protected">
        <ul className="list-disc ml-6 space-y-1">
          <li>TLS (HTTPS) in transit, AES-256 at rest.</li>
          <li>Column-level encryption for DOB using pgcrypto.</li>
          <li>Private storage buckets with Row-Level Security policies.</li>
          <li>
            Role-based, logged admin access. Admin access is strictly for verification, dispute
            resolution, legal compliance, and security auditing — not browsing.
          </li>
          <li>NRIC / Passport copies (if provided for the optional badge) are deleted 30 days
            after verification completes.</li>
        </ul>
      </Section>

      <Section title="6. Who Sees Your Data">
        <ul className="list-disc ml-6 space-y-1">
          <li>
            <strong>Hiring managers</strong> see only derived tags, preference ratings, and
            salary expectations. They never see DOB, IC, email, or full name (unless you set your
            profile to &lsquo;public&rsquo;).
          </li>
          <li>
            <strong>HR admins</strong> see only the interview-scheduling queue for talents their
            hiring managers have shortlisted. They do not browse talent data.
          </li>
          <li>
            <strong>Talents</strong> see only their own matches and the company name attached to
            each role. They do not see other talents.
          </li>
          <li>
            <strong>Platform admins</strong> may access data <strong>strictly under role control
            and audit logging</strong> for verification, dispute resolution, legal compliance,
            and security auditing. All admin reads of sensitive data are logged.
          </li>
          <li>
            <strong>Third parties</strong> act as Data Processors under written agreements:
            <ul className="list-disc ml-6 mt-1 space-y-1">
              <li>Supabase Inc. — infrastructure hosting (Singapore)</li>
              <li>Resend Inc. — email delivery</li>
              <li>WATI — WhatsApp delivery (only if you opt in)</li>
            </ul>
          </li>
        </ul>
      </Section>

      <Section title="7. Cross-Border Transfer (Section 129 PDPA)">
        <p>
          Data is hosted in Singapore by Supabase Inc. Singapore provides protection
          substantially similar to the Malaysian PDPA. By using the platform you consent to this
          transfer. You may withdraw consent, but this may affect your ability to use the
          platform.
        </p>
      </Section>

      <Section title="8. Data Breach Notification">
        <p>If a data breach risks significant harm to you:</p>
        <ul className="list-disc ml-6 space-y-1">
          <li>JPDP will be notified within <strong>72 hours</strong> of detection.</li>
          <li>Affected users will be notified within <strong>7 days</strong> of detection.</li>
          <li>Records of the incident will be retained for <strong>2 years</strong>.</li>
        </ul>
      </Section>

      <Section title="9. Retention">
        <ul className="list-disc ml-6 space-y-1">
          <li>Active account data is retained while the account is open.</li>
          <li>NRIC / Passport (if provided) is deleted 30 days after verification.</li>
          <li>
            After a deletion request, the account enters soft-delete state. Sensitive data is
            purged 30 days later.
          </li>
          <li>De-identified audit log rows are retained as required by law.</li>
        </ul>
      </Section>

      <Section title="10. Your Rights">
        <p>Under PDPA you have the right to:</p>
        <ul className="list-disc ml-6 space-y-1">
          <li><strong>Access</strong> a copy of your personal data.</li>
          <li><strong>Correct</strong> inaccurate data.</li>
          <li><strong>Delete</strong> your personal data (subject to legal retention requirements).</li>
          <li><strong>Receive</strong> your data in a portable format (JSON+CSV bundle).</li>
          <li><strong>Withdraw consent</strong> at any time.</li>
        </ul>
        <p className="mt-2">
          To exercise any of these rights, submit a{' '}
          <Link to="/data-requests" className="text-brand-600 underline">Data Request</Link>.
          We respond within <strong>21 days</strong>.
        </p>
      </Section>

      <Section title="11. Browser Storage (localStorage)">
        <p>
          This platform does <strong>not</strong> use advertising cookies or third-party tracking
          cookies. We use browser <code>localStorage</code> for the following strictly necessary
          purposes only:
        </p>
        <ul className="list-disc ml-6 space-y-1 mt-2">
          <li>
            <strong>Session token</strong> — keeps you signed in across page reloads. Managed by
            Supabase Auth and cleared on sign-out.
          </li>
          <li>
            <strong>Admin re-authentication timestamp</strong> — records the time you last confirmed
            your password for admin access. Expires after 30 minutes.
          </li>
          <li>
            <strong>Signup referral code</strong> — stored temporarily during the registration flow
            and removed once account creation completes.
          </li>
          <li>
            <strong>Selected account role</strong> — stored temporarily during signup and removed
            after account creation.
          </li>
          <li>
            <strong>Storage acknowledgement flag</strong> (<code>dnj_storage_ack</code>) — records
            that you have seen this storage notice. No personal data.
          </li>
        </ul>
        <p className="mt-2">
          All items above are strictly necessary for the platform to function. They cannot be
          disabled without breaking core features. Because they are not optional, no opt-in or
          opt-out is offered for these items.
        </p>
        <p className="mt-2">
          No cross-site tracking, behavioural advertising, or analytics cookies are set.
        </p>
      </Section>

      <Section title="12. Contact">
        <p>
          DPO:{' '}
          <a href={`mailto:${copy.dpoEmail}`} className="underline">{copy.dpoEmail}</a>
        </p>
        <p>
          Privacy:{' '}
          <a href={`mailto:${copy.contactEmail}`} className="underline">{copy.contactEmail}</a>
        </p>
      </Section>

      {!copy.legalReviewed && (
        <>
          <hr className="my-8" />
          <p className="text-xs text-gray-500">
            <strong>Legal review pending.</strong> This notice is a good-faith draft and will be
            revised by Malaysian counsel before public launch.
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
