interface LogoProps {
  /** Rendered width/height in px. Default 28. */
  size?: number
  /** Gradient start color. Default '#1a2260' (Layout brand mark). */
  gradFrom?: string
  /** Gradient end color. Default '#3e4fd3' (Layout brand mark). */
  gradTo?: string
  /**
   * Gradient `<defs>` id. Load-bearing: must be unique per DOM instance
   * family. Layout uses a single static id; AuthShell derives a per-variant
   * id so multiple logos on one page don't collide on the shared defs id.
   * Default 'layout-logo-grad'.
   */
  gradId?: string
}

/**
 * Shared DNJ logo mark (rounded-rect gradient tile + diamond formed by two
 * triangular polygons, a center line, and an accent dot). Extracted from the
 * byte-identical copies previously inlined in Layout.tsx and AuthShell.tsx.
 * Props default to Layout's brand mark; pass gradFrom/gradTo/gradId to
 * reproduce AuthShell's per-variant parameterized mark.
 */
export default function Logo({
  size = 28,
  gradFrom = '#1a2260',
  gradTo = '#3e4fd3',
  gradId = 'layout-logo-grad',
}: LogoProps = {}) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={gradFrom} />
          <stop offset="1" stopColor={gradTo} />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gradId})`} />
      <polygon
        points="7,15 16,5 25,15"
        fill="rgba(245,247,255,0.18)"
        stroke="#f5f7ff"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <line x1="7" y1="15" x2="25" y2="15" stroke="#f5f7ff" strokeWidth="1" opacity="0.7" />
      <polygon
        points="7,15 25,15 16,28"
        fill="rgba(245,247,255,0.32)"
        stroke="#f5f7ff"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="13" cy="10" r="1" fill="#f5f7ff" opacity="0.75" />
    </svg>
  )
}
