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

  // SHAs differ — distinguish frontend drift (needs redeploy) from
  // server-side / docs / harness drift (doesn't ship to the bundle).
  // FRONTEND = anything in apps/web/ except tests; docs/qa/supabase/scripts
  // are out of the bundle.
  let changed = []
  try {
    const out = execSync(`git diff --name-only ${remoteSha}..${localSha}`, { cwd: process.cwd() })
      .toString().trim()
    changed = out ? out.split('\n') : []
  } catch (err) {
    return {
      name: 'Vercel SHA',
      status: 'WARN',
      detail: `prod ${remoteSha.slice(0, 7)} not in local history — fetch first`,
      evidence: [`prod  ${remoteSha}`, `local ${localSha}`, `Run: git fetch origin`],
    }
  }

  const isFrontend = (p) =>
    p.startsWith('apps/web/') &&
    !p.startsWith('apps/web/tests/') &&
    !p.startsWith('apps/web/node_modules/')
  const frontendChanges = changed.filter(isFrontend)
  const otherChanges = changed.filter((p) => !isFrontend(p))

  if (frontendChanges.length > 0) {
    return {
      name: 'Vercel SHA',
      status: 'FAIL',
      detail: `frontend drift: ${frontendChanges.length} file(s), redeploy needed`,
      evidence: [
        `prod  ${remoteSha.slice(0, 7)}`,
        `local ${localSha.slice(0, 7)}`,
        ...frontendChanges.slice(0, 5),
        'Run: vercel deploy --prod',
      ],
    }
  }
  return {
    name: 'Vercel SHA',
    status: 'WARN',
    detail: `non-frontend drift only (${otherChanges.length} file(s)); no redeploy needed`,
    evidence: [
      `prod  ${remoteSha.slice(0, 7)}`,
      `local ${localSha.slice(0, 7)}`,
      ...otherChanges.slice(0, 5),
    ],
  }
}
