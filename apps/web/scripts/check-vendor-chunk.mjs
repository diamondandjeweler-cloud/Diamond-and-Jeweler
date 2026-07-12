/**
 * check-vendor-chunk.mjs — post-build guard against the 2026-07-10 white-screen.
 *
 * WHAT IT GUARDS
 *   A cluster of React-coupled npm packages (Radix + its transitive
 *   floating-ui / react-remove-scroll / use-sidecar / aria-hidden deps) read
 *   `React.forwardRef` and React hooks (`useLayoutEffect`, …) at MODULE-EVAL
 *   time. If Rollup splits any of them into a chunk OTHER than the one that
 *   carries React itself, they evaluate before React is defined in that chunk's
 *   scope and throw "Cannot read properties of undefined (reading
 *   'useLayoutEffect')" — a full white screen in the production build. That is
 *   exactly the outage at commit 44be0cc (2026-07-10): the transitive deps fell
 *   into the catch-all `vendor` chunk instead of `vendor-react`.
 *
 *   vite.config.ts `manualChunks` pins every one of these packages into the
 *   `vendor-react` chunk. This script is the REGRESSION FENCE for that pin: it
 *   parses the freshly-built bundle and FAILS the build if any React-coupled
 *   package's code landed in a chunk whose name is not `vendor-react`.
 *
 * HOW IT KNOWS WHICH PACKAGE IS IN WHICH CHUNK
 *   `vite.config.ts` sets `sourcemap: 'hidden'`, so every emitted chunk has a
 *   sibling `<chunk>-<hash>.js.map` whose `sources[]` list the original
 *   node_modules paths that were bundled into that chunk. We read those maps.
 *   This script is therefore wired into `npm run build` AFTER `vite build` but
 *   BEFORE `strip-sourcemaps.mjs` deletes the maps (see package.json). It also
 *   powers the standalone `npm run build:check`.
 *
 * FAIL-CLOSED ONLY ON A POSITIVE DETECTION
 *   The script exits non-zero ONLY when it can prove a violation (a
 *   React-coupled source in a non-vendor-react chunk). If the maps are absent
 *   (e.g. run against an already-stripped dist) it prints a loud warning and
 *   exits 0 rather than blocking a build on a missing-input technicality.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = fileURLToPath(new URL('.', import.meta.url))
const ASSETS_DIR = path.join(__dirname, '..', 'dist', 'assets')

// Packages that MUST share React's chunk. Each entry is matched as the path
// segment immediately after `node_modules/`. Scoped roots end in `/` so e.g.
// `@radix-ui/` matches every `@radix-ui/*` package. Keep this list a superset
// of the `norm.includes('/<pkg>/')` cluster in vite.config.ts manualChunks.
const REACT_COUPLED = [
  '@radix-ui/',
  '@floating-ui/',
  '@react-aria/',
  'react-remove-scroll/',
  'react-remove-scroll-bar/',
  'react-style-singleton/',
  'use-sidecar/',
  'use-callback-ref/',
  'aria-hidden/',
]

// The one chunk allowed to contain the above (it is where React itself lives).
const ALLOWED_CHUNK_PREFIX = 'vendor-react'

/** Return the offending package prefix for a source path, or null. */
function reactCoupledPkg(source) {
  const n = source.replace(/\\/g, '/')
  const marker = 'node_modules/'
  const i = n.lastIndexOf(marker)
  if (i === -1) return null
  const rest = n.slice(i + marker.length)
  for (const pkg of REACT_COUPLED) {
    if (rest.startsWith(pkg)) return pkg.replace(/\/$/, '')
  }
  return null
}

function main() {
  if (!fs.existsSync(ASSETS_DIR)) {
    console.warn(
      `check-vendor-chunk: ${path.relative(process.cwd(), ASSETS_DIR)} not found — ` +
        `nothing to check (did \`vite build\` run?). Skipping (exit 0).`,
    )
    return 0
  }

  const maps = fs.readdirSync(ASSETS_DIR).filter((f) => f.endsWith('.js.map'))
  if (maps.length === 0) {
    console.warn(
      'check-vendor-chunk: no *.js.map files in dist/assets — the vendor-chunk ' +
        "guard needs hidden sourcemaps. If this ran AFTER strip-sourcemaps, that's " +
        'expected; wire this before the strip step. Skipping (exit 0).',
    )
    return 0
  }

  const violations = []
  let coupledInVendorReact = 0

  for (const mapFile of maps) {
    const isVendorReact = mapFile.startsWith(ALLOWED_CHUNK_PREFIX)
    let parsed
    try {
      parsed = JSON.parse(fs.readFileSync(path.join(ASSETS_DIR, mapFile), 'utf8'))
    } catch (e) {
      console.warn(`check-vendor-chunk: could not parse ${mapFile}: ${e.message}`)
      continue
    }
    const sources = Array.isArray(parsed.sources) ? parsed.sources : []
    const seenHere = new Set()
    for (const src of sources) {
      const pkg = reactCoupledPkg(src)
      if (!pkg) continue
      if (isVendorReact) {
        coupledInVendorReact++
        continue
      }
      const key = pkg
      if (seenHere.has(key)) continue
      seenHere.add(key)
      // strip the content hash for a stable chunk label in the message
      const chunkLabel = mapFile.replace(/-[A-Za-z0-9_-]{8,}\.js\.map$/, '.js')
      violations.push({ chunk: chunkLabel, chunkFile: mapFile.replace(/\.map$/, ''), pkg, source: src })
    }
  }

  if (violations.length > 0) {
    console.error(
      '\n✗ check-vendor-chunk: React-coupled package(s) bundled OUTSIDE the ' +
        `"${ALLOWED_CHUNK_PREFIX}" chunk.\n` +
        '  These read React.forwardRef / hooks at module-eval time and will ' +
        'white-screen the prod build (2026-07-10 outage class).\n',
    )
    for (const v of violations) {
      console.error(`    ${v.pkg}  →  ${v.chunk}`)
      console.error(`        (${v.source})`)
    }
    console.error(
      '\n  FIX: add the package to the `vendor-react` branch of manualChunks() in ' +
        'apps/web/vite.config.ts so it shares React\'s chunk.\n',
    )
    return 1
  }

  console.log(
    `✓ check-vendor-chunk: ${maps.length} chunk map(s) scanned; ` +
      `${coupledInVendorReact} React-coupled source(s) all in "${ALLOWED_CHUNK_PREFIX}". ` +
      'No cross-chunk React-coupling.',
  )
  if (coupledInVendorReact === 0) {
    console.warn(
      'check-vendor-chunk: NOTE — found zero React-coupled sources anywhere. ' +
        'If the app still uses Radix/floating-ui, the sourcemaps may lack `sources` ' +
        '(guard would be blind). Verify a Radix component is imported.',
    )
  }
  return 0
}

process.exit(main())
