import { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * Shared page chrome for /careers/* blog articles.
 *
 * Presentation-only extraction: reproduces the header, breadcrumb, article
 * eyebrow/title/published line, and footer that were byte-for-byte identical
 * across the five blog posts. The per-post SEO (`useSeo`), article body, CTA,
 * and RelatedLinks stay in each post file. The rendered DOM, classes, and aria
 * attributes are unchanged.
 */
export default function BlogArticleShell({
  breadcrumbLabel,
  eyebrow,
  title,
  published,
  readMinutes,
  children,
  afterArticle,
}: {
  /** Leaf label shown in the breadcrumb (usually a short form of the title). */
  breadcrumbLabel: string
  /** Eyebrow category line, e.g. "CAREERS · LUXURY · 2026". */
  eyebrow: string
  /** Article headline (h1). */
  title: ReactNode
  /** ISO published date, used for both the visible date and the <time> attr. */
  published: string
  /** Estimated read time in minutes. */
  readMinutes: number
  /** Article body — everything inside <article> below the published line. */
  children: ReactNode
  /** Content rendered inside <main> after </article> (e.g. RelatedLinks). */
  afterArticle?: ReactNode
}) {
  return (
    <div className="min-h-screen bg-white dark:bg-navy-900 text-navy-900 dark:text-white font-sans">
      <header className="border-b border-border dark:bg-navy-800">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2" aria-label="DNJ home">
            <span className="font-extrabold tracking-tight text-[20px]">DNJ</span>
            <span className="text-[10px] tracking-[0.22em] text-gray-500">DIAMOND &amp; JEWELER</span>
          </Link>
          <Link to="/careers" className="text-sm text-navy-700 underline underline-offset-4">All careers</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <nav aria-label="Breadcrumb" className="text-xs text-gray-500 mb-4">
          <Link to="/" className="hover:text-navy-900">Home</Link>
          <span className="mx-2">/</span>
          <Link to="/careers" className="hover:text-navy-900">Careers</Link>
          <span className="mx-2">/</span>
          <span aria-current="page" className="text-gray-700">{breadcrumbLabel}</span>
        </nav>

        <article>
          <p className="text-gold-500 tracking-[0.3em] text-[11px] font-semibold mb-2">{eyebrow}</p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">
            {title}
          </h1>
          <p className="text-xs text-gray-500 mb-6">Published <time dateTime={published}>{published}</time> · {readMinutes} min read</p>

          {children}
        </article>

        {afterArticle}
      </main>

      <footer className="border-t border-gray-100 mt-10 py-6 text-center text-xs text-gray-500">
        <Link to="/" className="hover:text-navy-900">Home</Link>
        <span className="mx-2">·</span>
        <Link to="/careers" className="hover:text-navy-900">Careers</Link>
        <span className="mx-2">·</span>
        <Link to="/privacy" className="hover:text-navy-900">Privacy</Link>
        <span className="mx-2">·</span>
        <Link to="/terms" className="hover:text-navy-900">Terms</Link>
      </footer>
    </div>
  )
}
