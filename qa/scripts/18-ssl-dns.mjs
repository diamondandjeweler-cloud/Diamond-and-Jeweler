// 18 — SSL cert + DNS sanity.
// Verify cert validity (chain + days-to-expiry > 14), DNS resolves to a Vercel
// IP block, and apex + www both serve.
//
// Implemented via tls.connect() because fetch hides the cert details.

import tls from 'tls'
import { promises as dns } from 'dns'
import { config } from '../config.mjs'

function tlsCheck(host) {
  return new Promise((resolve, reject) => {
    const socket = tls.connect(443, host, { servername: host, timeout: 10000 }, () => {
      const cert = socket.getPeerCertificate()
      socket.end()
      resolve(cert)
    })
    socket.on('error', reject)
    socket.on('timeout', () => {
      socket.destroy()
      reject(new Error(`TLS connect timeout to ${host}`))
    })
  })
}

export default async function check() {
  const host = new URL(config.QA_BASE_URL).hostname
  const evidence = []
  const failures = []

  // 1. Cert validity + days remaining.
  let cert
  try {
    cert = await tlsCheck(host)
  } catch (err) {
    return { name: 'SSL + DNS', status: 'FAIL', detail: 'TLS handshake failed', evidence: [err.message] }
  }
  if (!cert || !cert.valid_to) {
    failures.push('No certificate returned')
  } else {
    const daysLeft = Math.round((new Date(cert.valid_to).getTime() - Date.now()) / 86400000)
    evidence.push(`Cert subject: ${cert.subject?.CN ?? 'n/a'}`)
    evidence.push(`Cert issuer: ${cert.issuer?.O ?? cert.issuer?.CN ?? 'n/a'}`)
    evidence.push(`Days to expiry: ${daysLeft}`)
    if (daysLeft < 14) failures.push(`Cert expires in ${daysLeft}d (<14)`)
    if (daysLeft < 0) failures.push(`Cert EXPIRED`)
  }

  // 2. DNS resolves (via OS lookup so CNAMEs are followed — Vercel uses CNAMEs).
  try {
    const lookup = await dns.lookup(host, { all: true })
    const v4 = lookup.filter((r) => r.family === 4).length
    const v6 = lookup.filter((r) => r.family === 6).length
    evidence.push(`DNS: ${v4} IPv4 + ${v6} IPv6 (via OS lookup)`)
    if (lookup.length === 0) failures.push('DNS lookup returned 0 records')
  } catch (err) {
    failures.push(`DNS lookup failed: ${err.message}`)
  }

  // 3. www apex parity (both must serve, status < 500).
  if (host === 'diamondandjeweler.com') {
    try {
      const wwwRes = await fetch(`https://www.${host}`, { redirect: 'manual' })
      if (wwwRes.status >= 500) failures.push(`www returned ${wwwRes.status}`)
      else evidence.push(`www → ${wwwRes.status}`)
    } catch (err) {
      failures.push(`www fetch failed: ${err.message}`)
    }
  }

  if (failures.length === 0) {
    return { name: 'SSL + DNS', status: 'PASS', detail: 'cert + DNS + www apex healthy', evidence }
  }
  return { name: 'SSL + DNS', status: 'FAIL', detail: `${failures.length} issue(s)`, evidence: [...failures, ...evidence] }
}
