// 08 — Vercel SHA.
// DNJ has no git integration → prod and main can drift silently.
// We add a build step that writes git SHA to dist/version.txt;
// QA fetches that URL and compares with local HEAD.

import { execSync } from 'child_process'
import { config } from '../config.mjs'

export default async function check() {
  let localSha
  try {
    localSha = execSync('git rev-parse HEAD', { cwd: process.cwd() })
      .toString().trim()
  } catch (err) {
    return { name: 'Vercel SHA', status: 'SKIP', detail: 'git not available', evidence: [err.message] }
  }

  const url = `${config.QA_BASE_URL}/version.txt`
  let remoteSha
  try {
    const res = await fetch(url, { redirect: 'follow' })
    if (!res.ok) {
      return {
        name: 'Vercel SHA',
        status: 'FAIL',
        detail: `${url} returned ${res.status} — build hook not deployed yet`,
        evidence: [`Run a fresh \`vercel deploy --prod\` after merging the inject-meta.mjs SHA hook.`],
      }
    }
    remoteSha = (await res.text()).trim()
  } catch (err) {
    return { name: 'Vercel SHA', status: 'FAIL', detail: 'fetch failed', evidence: [err.message] }
  }

  if (localSha === remoteSha) {
    return {
      name: 'Vercel SHA',
      status: 'PASS',
      detail: `prod = main HEAD (${localSha.slice(0, 7)})`,
      evidence: [],
    }
  }
  return {
    name: 'Vercel SHA',
    status: 'FAIL',
    detail: `drift! prod=${remoteSha.slice(0, 7)} local=${localSha.slice(0, 7)}`,
    evidence: [
      `prod  ${remoteSha}`,
      `local ${localSha}`,
      `Run: vercel deploy --prod`,
    ],
  }
}
