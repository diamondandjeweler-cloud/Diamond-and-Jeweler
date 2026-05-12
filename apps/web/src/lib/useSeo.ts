import { useEffect } from 'react'

const SUFFIX = ' · DNJ'
const DEFAULT_TITLE = 'DNJ — AI-Curated Recruitment Platform Malaysia | Jobs Across Every Industry'
const DEFAULT_DESC = 'DNJ is an AI-powered curated recruitment platform for Malaysia. We match talent with hiring companies across every industry — sales, admin, finance, marketing, IT and software, HR, customer service, operations, retail, hospitality, engineering, healthcare, banking, manufacturing, logistics, F&B, aviation and more. Three curated matches at a time, zero noise.'
const DEFAULT_KEYWORDS = 'AI recruitment Malaysia, curated recruitment, recruitment platform Malaysia, AI job matching, jobs in Malaysia, hiring now Malaysia, apply job online, fresh graduate jobs, no experience jobs, internship Malaysia, graduate trainee, sales executive job vacancy, admin executive job vacancy, finance job vacancy, marketing executive job vacancy, software developer job vacancy, IT job vacancy, customer service job vacancy, HR assistant job vacancy, operation job vacancy, retail job vacancy, hospitality job vacancy, engineering job vacancy, healthcare job vacancy, education job vacancy, banking job vacancy, logistics job vacancy, manufacturing job vacancy, jobs in Kuala Lumpur, jobs in PJ, jobs in Penang, work from home Kuala Lumpur, remote job Malaysia, career opportunity, talent matching, hiring manager Malaysia, pilot job vacancy, aviation job vacancy, jeweler job vacancy, luxury retail job'
const ORIGIN = 'https://diamondandjeweler.com'
const JSONLD_DATA_ID = 'data-dnj-jsonld'

interface SeoOptions {
  title?: string
  description?: string
  keywords?: string
  noindex?: boolean
  canonicalPath?: string
  jsonLd?: Record<string, unknown> | Array<Record<string, unknown>>
}

function setMeta(selector: string, attr: 'content', value: string) {
  let el = document.head.querySelector<HTMLMetaElement>(selector)
  if (!el) {
    el = document.createElement('meta')
    const match = selector.match(/\[(name|property)="([^"]+)"\]/)
    if (match) el.setAttribute(match[1], match[2])
    document.head.appendChild(el)
  }
  el.setAttribute(attr, value)
}

function setLink(rel: string, href: string) {
  let el = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

function removeMeta(selector: string) {
  document.head.querySelector(selector)?.remove()
}

function clearJsonLd() {
  const existing = document.head.querySelectorAll(`script[${JSONLD_DATA_ID}]`)
  existing.forEach((node) => node.remove())
}

function setJsonLd(data: Record<string, unknown> | Array<Record<string, unknown>>) {
  clearJsonLd()
  const blocks = Array.isArray(data) ? data : [data]
  for (const block of blocks) {
    const script = document.createElement('script')
    script.type = 'application/ld+json'
    script.setAttribute(JSONLD_DATA_ID, '1')
    script.text = JSON.stringify(block)
    document.head.appendChild(script)
  }
}

export function useSeo(opts: SeoOptions): void {
  const { title, description, keywords, noindex, canonicalPath, jsonLd } = opts

  useEffect(() => {
    const prevTitle = document.title
    if (title) document.title = title + SUFFIX

    if (description) {
      setMeta('meta[name="description"]', 'content', description)
      setMeta('meta[property="og:description"]', 'content', description)
      setMeta('meta[name="twitter:description"]', 'content', description)
    }

    if (title) {
      setMeta('meta[property="og:title"]', 'content', title + SUFFIX)
      setMeta('meta[name="twitter:title"]', 'content', title + SUFFIX)
    }

    if (keywords) {
      setMeta('meta[name="keywords"]', 'content', keywords)
    }

    const path = canonicalPath ?? (typeof window !== 'undefined' ? window.location.pathname : '/')
    const canonicalUrl = ORIGIN + path
    setLink('canonical', canonicalUrl)
    setMeta('meta[property="og:url"]', 'content', canonicalUrl)

    if (noindex) {
      setMeta('meta[name="robots"]', 'content', 'noindex, nofollow')
    } else {
      setMeta('meta[name="robots"]', 'content', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1')
    }

    if (jsonLd) setJsonLd(jsonLd)

    return () => {
      document.title = prevTitle || DEFAULT_TITLE
      if (description) {
        setMeta('meta[name="description"]', 'content', DEFAULT_DESC)
      }
      if (keywords) {
        setMeta('meta[name="keywords"]', 'content', DEFAULT_KEYWORDS)
      }
      if (noindex) {
        removeMeta('meta[name="robots"]')
      }
      if (jsonLd) clearJsonLd()
    }
  }, [title, description, keywords, noindex, canonicalPath, jsonLd])
}

export function useDocumentTitle(title: string | undefined): void {
  useSeo({ title })
}
