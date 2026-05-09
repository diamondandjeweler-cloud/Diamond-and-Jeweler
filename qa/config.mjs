// Loads .env.qa from disk into process.env (no dotenv dep).

import { readFileSync, existsSync } from 'fs'
import { dirname, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '.env.qa')

if (existsSync(envPath)) {
  const lines = readFileSync(envPath, 'utf-8').split('\n')
  for (const line of lines) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!m) continue
    if (line.trim().startsWith('#')) continue
    const [, key, val] = m
    if (!process.env[key]) {
      // Strip optional surrounding quotes
      process.env[key] = val.replace(/^['"]|['"]$/g, '')
    }
  }
}

function need(key) {
  const v = process.env[key]
  if (!v) {
    throw new Error(`Missing env var: ${key}. See qa/.env.qa.example.`)
  }
  return v
}

function opt(key, fallback) {
  return process.env[key] || fallback
}

export const config = {
  QA_BASE_URL: opt('QA_BASE_URL', 'https://diamondandjeweler.com'),
  SUPABASE_URL: need('SUPABASE_URL'),
  SUPABASE_ANON_KEY: need('SUPABASE_ANON_KEY'),
  SUPABASE_SERVICE_ROLE_KEY: opt('SUPABASE_SERVICE_ROLE_KEY', ''),
  SUPABASE_PAT: opt('SUPABASE_PAT', ''),
  SUPABASE_PROJECT_ID: opt('SUPABASE_PROJECT_ID', 'sfnrpbsdscikpmbhrzub'),
  TESTER_PASSWORD: opt('TESTER_PASSWORD', 'TestDNJ#2026'),
  TESTER_ADMIN: opt('TESTER_ADMIN', 'a01.admin@dnj-test.my'),
  TESTER_HM_A: opt('TESTER_HM_A', 'h02.andrew.finance@dnj-test.my'),
  TESTER_HM_B: opt('TESTER_HM_B', 'h10.chloe.design@dnj-test.my'),
  TESTER_TALENT_A: opt('TESTER_TALENT_A', 't01.aiman.tech@dnj-test.my'),
  TESTER_TALENT_B: opt('TESTER_TALENT_B', 't05.sueann.health@dnj-test.my'),
  VERCEL_TOKEN: opt('VERCEL_TOKEN', ''),
  VERCEL_PROJECT_ID: opt('VERCEL_PROJECT_ID', ''),
}
