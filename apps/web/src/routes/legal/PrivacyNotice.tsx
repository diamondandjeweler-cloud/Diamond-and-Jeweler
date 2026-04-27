import { Link } from 'react-router-dom'

export default function PrivacyNotice() {
  return (
    <article className="max-w-3xl mx-auto px-4 py-10">
      <Link to="/" className="text-brand-600 text-sm underline">← Home</Link>
      <h1 className="text-3xl font-bold mt-4 mb-1">Privacy Notice</h1>
      <p className="text-xs text-gray-500 mb-6">
        Last updated: 2026-04-21 · Draft pending legal review · Version: 0.1
      </p>

      <Section title="0. Data controller">
        <p>
          <strong>[SSM entity name pending confirmation]</strong>, a company
          registered in Malaysia. Contact for privacy matters:{' '}
          <a href="mailto:privacy@diamondandjeweler.com" className="underline">privacy@diamondandjeweler.com</a>.
        </p>
      </Section>

      <Section title="1. Data we collect">
        <ul className="list-disc ml-6 space-y-1">
          <li><strong>Account identity:</strong> email, full name, phone number.</li>
          <li><strong>Sensitive personal data:</strong> date of birth (DOB), identity card or passport scan.</li>
          <li><strong>Professional data:</strong> résumé, interview answers, workplace preference ratings, salary expectations.</li>
          <li><strong>Technical data:</strong> IP address, browser user agent, session tokens.</li>
        </ul>
      </Section>

      <Section title="2. Purposes of processing">
        <ul className="list-disc ml-6 space-y-1">
          <li>Operating the DNJ platform: account authentication, matching, interview scheduling.</li>
          <li>AI-powered compatibility scoring using personal profile data. Your data is never shown to employers or other users.</li>
          <li>Anonymised market-rate comparisons.</li>
          <li>Transactional email notifications (via Resend Inc.).</li>
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
          <li>IC scans and résumés are stored in private Supabase storage buckets, gated by Row Level Security policies scoped to your user ID.</li>
          <li>TLS in transit (HTTPS) and AES-256 at rest.</li>
          <li>IC documents are automatically purged 30 days after verification completes.</li>
        </ul>
      </Section>

      <Section title="5. Who sees your data">
        <ul className="list-disc ml-6 space-y-1">
          <li><strong>Hiring managers</strong> see your derived tags, preference ratings, and salary expectation — never your DOB, IC, email, or full name (unless you set privacy to &lsquo;public&rsquo;).</li>
          <li><strong>HR admins</strong> see the interview-scheduling queue for candidates their hiring managers shortlist. They do not browse talent data.</li>
          <li><strong>DNJ platform admins</strong> may access any data for verification, dispute resolution, or compliance. All admin actions are logged.</li>
          <li><strong>Third parties:</strong> Supabase Inc. (infrastructure, data stored in Singapore), Resend Inc. (email delivery). Both contractually bound by data-processing agreements.</li>
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
          <a href="mailto:privacy@diamondandjeweler.com" className="underline">privacy@diamondandjeweler.com</a>.
        </p>
      </Section>

      <hr className="my-8" />
      <p className="text-xs text-gray-500">
        <strong>Legal review pending.</strong> This notice is a good-faith draft and
        will be revised by Malaysian counsel before public launch.
      </p>
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
