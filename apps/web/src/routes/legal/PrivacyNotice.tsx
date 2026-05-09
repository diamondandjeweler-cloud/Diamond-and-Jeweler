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
  lastUpdated: '1 May 2026',
  version: '3.1',
}

export default function PrivacyNotice() {
  useSeo({
    title: 'Privacy notice',
    description: 'How DNJ collects, uses, and protects your personal data under the Personal Data Protection Act 2010 (Malaysia).',
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

  const entity = copy.entityName ?? 'CRM Solution (003808986-A)'

  return (
    <article className="max-w-3xl mx-auto px-4 py-10">
      <Link to="/" className="text-brand-600 text-sm underline">← Home</Link>
      <h1 className="text-3xl font-bold mt-4 mb-1">Privacy Notice</h1>
      <p className="text-xs text-gray-500 mb-6">
        Last updated: {copy.lastUpdated}
        {!copy.legalReviewed && ' · Draft pending legal review'}
        {' · Version: '}{copy.version}
      </p>
      <p className="text-sm text-gray-700 mb-6">
        This Privacy Notice is issued in accordance with the Personal Data Protection Act 2010
        (&ldquo;PDPA&rdquo;).
      </p>

      <Section title="0. Data Controller (Data User)">
        <p>
          DNJ Recruitment Platform is operated by <strong>{entity}</strong>, Malaysia
          (&ldquo;DNJ&rdquo;, &ldquo;we&rdquo;, &ldquo;our&rdquo;, &ldquo;us&rdquo;).
        </p>
        <p>{entity} is the Data User for the purposes of the PDPA.</p>
        <p>
          Data Protection Officer:{' '}
          <a href={`mailto:${copy.dpoEmail}`} className="underline">{copy.dpoEmail}</a>
        </p>
        <p>
          Privacy contact:{' '}
          <a href={`mailto:${copy.contactEmail}`} className="underline">{copy.contactEmail}</a>
        </p>
      </Section>

      <Section title="1. Personal Data We Collect">
        <p className="font-semibold mt-2">A. Account Identity — Required for Account Creation</p>
        <ul className="list-disc ml-6 space-y-1">
          <li>Full name</li>
          <li>Email address</li>
          <li>Phone number</li>
          <li>Date of birth (DOB)</li>
        </ul>
        <p className="font-semibold mt-3">Date of Birth</p>
        <p>
          Your date of birth is a required parameter in our matching system. It is used to ensure
          the roles recommended to you are appropriate for your career stage and profile. Without
          your date of birth, the platform cannot generate meaningful matches and you will not be
          able to use the service.
        </p>
        <p>
          Your DOB is encrypted at database column level and is never disclosed to hiring
          companies or other users.
        </p>

        <p className="font-semibold mt-3">B. Professional Data (Talents)</p>
        <ul className="list-disc ml-6 space-y-1">
          <li>Résumé / CV</li>
          <li>Employment history</li>
          <li>Interview responses</li>
        </ul>
        <p className="mt-2">
          This information enables us to assess your professional background, competencies, and
          experience so that we can match you with roles that are genuinely suitable.
        </p>

        <p className="font-semibold mt-3">C. Workplace Preferences and Salary Expectations</p>
        <p>
          Your stated workplace preferences and salary expectations allow the platform to
          recommend opportunities, work environments, and roles that align with your goals and
          expectations.
        </p>

        <p className="font-semibold mt-3">D. Company Data (Hiring Users)</p>
        <ul className="list-disc ml-6 space-y-1">
          <li>SSM registration number</li>
          <li>Business licence information</li>
          <li>Role requirements</li>
        </ul>

        <p className="font-semibold mt-3">E. Technical Data</p>
        <ul className="list-disc ml-6 space-y-1">
          <li>IP address</li>
          <li>Browser user agent</li>
          <li>Session identifiers</li>
        </ul>

        <p className="font-semibold mt-3">F. Optional Identity Verification Data (Voluntary)</p>
        <p>Collected only if you opt into the Identity Verification Badge:</p>
        <ul className="list-disc ml-6 space-y-1">
          <li>NRIC / Passport number and copy</li>
          <li>Photograph</li>
        </ul>
        <p className="mt-2">
          This information is <strong>not required</strong> to use the platform&rsquo;s matching
          features and is used strictly for verification.
        </p>
      </Section>

      <Section title="2. Purposes of Processing">
        <p>Your personal data is processed to:</p>
        <ul className="list-disc ml-6 space-y-1">
          <li>Create and authenticate accounts</li>
          <li>Perform talent-to-role matching and interview scheduling</li>
          <li>Generate compatibility scores using profile data</li>
          <li>Provide anonymised salary insights</li>
          <li>Send transactional communications</li>
          <li>Send WhatsApp communications where you opt in</li>
          <li>Perform optional identity verification</li>
          <li>Maintain platform security, fraud prevention, and audit logging</li>
          <li>Comply with legal and regulatory obligations</li>
        </ul>
        <p className="mt-2">
          Sensitive identifiers (NRIC, Passport, full DOB digits) are never disclosed to hiring
          companies or other users.
        </p>
      </Section>

      <Section title="3. Legal Basis of Processing">
        <p>Processing is based on:</p>
        <ul className="list-disc ml-6 space-y-1">
          <li>Your consent at registration; and</li>
          <li>The necessity of processing to provide the platform services you request.</li>
        </ul>
        <p className="mt-2">
          You may withdraw consent at any time. Where the withdrawn data is essential to platform
          functionality (e.g. DOB), you may no longer be able to use the service.
        </p>
      </Section>

      <Section title="4. Mandatory Notice under Section 7 PDPA">
        <p>You are informed that:</p>
        <ul className="list-none ml-2 space-y-1">
          <li>
            <strong>(a)</strong> Data listed as &ldquo;required&rdquo; in Section 1 is obligatory
            to create an account.
          </li>
          <li>
            <strong>(b)</strong> Failure to provide required data prevents account creation and
            platform use.
          </li>
          <li>
            <strong>(c)</strong> You may request access to and correction of your personal data.
          </li>
          <li>
            <strong>(d)</strong> You may limit or withdraw consent to processing.
          </li>
          <li>
            <strong>(e)</strong> Personal data may be disclosed to:
            <ul className="list-disc ml-6 mt-1 space-y-1">
              <li>Our appointed data processors (listed in Section 6),</li>
              <li>Hiring companies to the extent described in Section 6,</li>
              <li>Authorities where legally required.</li>
            </ul>
          </li>
          <li>
            <strong>(f)</strong> All personal data is collected directly from you.
          </li>
        </ul>
      </Section>

      <Section title="5. Security Measures">
        <p>We implement concrete technical and organisational safeguards including:</p>
        <ul className="list-disc ml-6 space-y-1">
          <li>TLS (HTTPS) encryption in transit</li>
          <li>AES-256 encryption at rest</li>
          <li>Column-level encryption for DOB</li>
          <li>Role-based access control with audit logging</li>
          <li>Private storage architecture with access policies</li>
        </ul>
        <p className="mt-2">
          Administrative access is strictly limited to verification, dispute resolution, legal
          compliance, and security auditing. All access to sensitive data is logged.
        </p>
        <p className="mt-2">
          NRIC / Passport copies (if provided) are permanently deleted 30 days after verification.
        </p>
      </Section>

      <Section title="6. Disclosure of Personal Data">
        <p className="font-semibold mt-2">Hiring Companies see only:</p>
        <ul className="list-disc ml-6 space-y-1">
          <li>Derived professional tags</li>
          <li>Preference ratings</li>
          <li>Salary expectations</li>
        </ul>
        <p className="mt-2">
          They do not see your DOB, NRIC, email, or full name unless you explicitly make your
          profile public.
        </p>

        <p className="font-semibold mt-3">Talents</p>
        <p>Talents see only their own matches and company names.</p>

        <p className="font-semibold mt-3">Platform Administrators</p>
        <p>
          Access data only under strict role control and logging for legitimate operational
          purposes.
        </p>

        <p className="font-semibold mt-3">Data Processors (under written agreements)</p>
        <ul className="list-disc ml-6 space-y-1">
          <li>
            Supabase Inc. — Infrastructure hosting (Singapore) —{' '}
            <a href="https://supabase.com" target="_blank" rel="noopener noreferrer" className="underline">Supabase</a>
          </li>
          <li>
            Resend Inc. — Transactional email delivery —{' '}
            <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="underline">Resend</a>
          </li>
          <li>
            WATI — WhatsApp delivery (opt-in only) —{' '}
            <a href="https://www.wati.io" target="_blank" rel="noopener noreferrer" className="underline">WATI</a>
          </li>
        </ul>
        <p className="mt-2">These parties process data strictly on our instructions.</p>
      </Section>

      <Section title="7. Cross-Border Transfer (Section 129 PDPA)">
        <p>
          Your data is hosted in Singapore by Supabase. We ensure through contractual safeguards
          that our processors provide a level of protection comparable to the PDPA.
        </p>
        <p>
          By using the platform, you consent to this transfer. Withdrawal of consent may affect
          your ability to use the service.
        </p>
      </Section>

      <Section title="8. Data Breach Notification">
        <p>Where a breach is likely to result in significant harm:</p>
        <ul className="list-disc ml-6 space-y-1">
          <li>
            The Jabatan Perlindungan Data Peribadi (JPDP) will be notified within{' '}
            <strong>72 hours</strong> of detection.
          </li>
          <li>Affected users will be notified without undue delay.</li>
          <li>Incident records are retained for <strong>2 years</strong>.</li>
        </ul>
      </Section>

      <Section title="9. Retention of Data">
        <ul className="list-disc ml-6 space-y-1">
          <li>Personal data is retained while your account is active.</li>
          <li>NRIC / Passport copies deleted after 30 days.</li>
          <li>
            Upon deletion request, a 30-day soft-delete period applies before permanent erasure.
          </li>
          <li>De-identified audit logs retained only as required by law.</li>
        </ul>
      </Section>

      <Section title="10. Your Rights">
        <p>You have the right to:</p>
        <ul className="list-disc ml-6 space-y-1">
          <li>Access your personal data</li>
          <li>Correct inaccurate data</li>
          <li>Request deletion (subject to legal retention requirements)</li>
          <li>Withdraw consent</li>
          <li>Request a portable copy of your data</li>
        </ul>
        <p className="mt-2">
          Requests are handled within <strong>21 days</strong> via the{' '}
          <Link to="/data-requests" className="text-brand-600 underline">Data Requests</Link>{' '}
          page.
        </p>
      </Section>

      <Section title="11. Browser Storage (localStorage)">
        <p>We do not use advertising or tracking cookies.</p>
        <p>Browser storage is used strictly for essential platform functions including:</p>
        <ul className="list-disc ml-6 space-y-1">
          <li>Session management</li>
          <li>Admin re-authentication timer</li>
          <li>Temporary signup state</li>
          <li>Storage acknowledgement flag</li>
        </ul>
        <p className="mt-2">
          These items are strictly necessary for platform operation and cannot be disabled
          without breaking core features.
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
        <p className="mt-3 text-xs text-gray-500 italic">
          Issued in compliance with the Personal Data Protection Act 2010 (Malaysia).
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
