import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'

interface LegalCopy {
  legalReviewed: boolean
  lastUpdated: string
  version: string
}

const FALLBACK: LegalCopy = {
  legalReviewed: false,
  lastUpdated: '2026-04-21',
  version: '0.1',
}

export default function Terms() {
  const [copy, setCopy] = useState<LegalCopy>(FALLBACK)

  useEffect(() => {
    let cancelled = false
    void supabase.from('system_config')
      .select('key, value')
      .in('key', ['legal_reviewed', 'legal_last_updated', 'legal_version'])
      .then(({ data }) => {
        if (cancelled || !data) return
        const map = new Map<string, unknown>()
        for (const row of data as Array<{ key: string; value: unknown }>) map.set(row.key, row.value)
        setCopy({
          legalReviewed: map.get('legal_reviewed') === true || map.get('legal_reviewed') === 'true',
          lastUpdated: stringValue(map.get('legal_last_updated'), FALLBACK.lastUpdated),
          version: stringValue(map.get('legal_version'), FALLBACK.version),
        })
      })
    return () => { cancelled = true }
  }, [])

  return (
    <article className="max-w-3xl mx-auto px-4 py-10">
      <Link to="/" className="text-brand-600 text-sm underline">← Home</Link>
      <h1 className="text-3xl font-bold mt-4 mb-1">Terms of Service</h1>
      <p className="text-xs text-gray-500 mb-6">
        Last updated: {copy.lastUpdated}
        {!copy.legalReviewed && ' · Draft pending legal review'}
        {' · Version: '}{copy.version}
      </p>

      <Section title="1. The service">
        <p>DNJ is a curated recruitment platform operated from Malaysia. Matches are not applications; DNJ does not guarantee matches, interviews, or hires.</p>
      </Section>

      <Section title="2. Eligibility">
        <ul className="list-disc ml-6 space-y-1">
          <li>You must be at least 18 years old.</li>
          <li>Companies must be legally registered in Malaysia (SSM verified).</li>
          <li>You represent that the information you provide is true and current.</li>
        </ul>
      </Section>

      <Section title="3. Acceptable use">
        <p>You agree not to:</p>
        <ul className="list-disc ml-6 space-y-1">
          <li>Impersonate others or misrepresent your identity, education, or employment history.</li>
          <li>Post role requirements that are discriminatory under Malaysian employment law.</li>
          <li>Scrape, reverse-engineer, or extract bulk data from the platform.</li>
          <li>Use the platform to transmit spam, malware, or illegal content.</li>
        </ul>
      </Section>

      <Section title="4. Matching">
        <p>
          Our matching engine is proprietary. You acknowledge that matches are curated by the platform
          and that DNJ retains sole discretion over which matches are surfaced.
        </p>
      </Section>

      <Section title="5. Fees">
        <p>
          Pilot use is free. Future paid plans (subscriptions, success fees, refresh packs) will be
          disclosed before activation. You are not billed without explicit consent. Optional add-ons
          such as Diamond Points top-ups and 1-on-1 consult bookings are billed via Billplz FPX at the
          price shown on the relevant page.
        </p>
      </Section>

      <Section title="6. Account termination">
        <p>
          We may suspend or terminate accounts that violate these terms, show signs of repeated
          ghosting behaviour, or misrepresent identity. You may close your account at any time via the{' '}
          <Link to="/data-requests" className="text-brand-600 underline">Data Requests</Link> page.
        </p>
      </Section>

      <Section title="7. Warranties & limitation of liability">
        <p>
          The service is provided &ldquo;as is&rdquo;. To the maximum extent permitted by Malaysian law,
          DNJ disclaims all warranties and is not liable for indirect or consequential loss arising
          from your use of the platform.
        </p>
      </Section>

      <Section title="8. Governing law">
        <p>
          These terms are governed by the laws of Malaysia. Disputes are subject to the exclusive
          jurisdiction of the Malaysian courts.
        </p>
      </Section>

      <Section title="9. Changes">
        <p>
          We may update these terms. Material changes will be notified by email and require re-consent
          to continue using the platform.
        </p>
      </Section>

      {!copy.legalReviewed && (
        <>
          <hr className="my-8" />
          <p className="text-xs text-gray-500">
            <strong>Legal review pending.</strong> This document is a good-faith draft and will be revised
            by Malaysian counsel before public launch.
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

function stringValue(v: unknown, fallback: string): string {
  if (typeof v === 'string' && v.trim().length > 0) return v
  return fallback
}
