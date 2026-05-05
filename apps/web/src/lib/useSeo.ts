import { useEffect } from 'react'

const SUFFIX = ' · DNJ'
const DEFAULT_TITLE = 'DNJ — Three matches, zero noise'
const DEFAULT_DESC = 'DNJ — curated recruitment that matches talent and leaders in Malaysia. Three matches, zero noise.'
const ORIGIN = 'https://diamondandjeweler.com'

interface SeoOptions {
  title?: string
  description?: string
  noindex?: boolean
  canonicalPath?: string
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

export function useSeo(opts: SeoOptions): void {
  const { title, description, noindex, canonicalPath } = opts

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

    const path = canonicalPath ?? (typeof window !== 'undefined' ? window.location.pathname : '/')
    const canonicalUrl = ORIGIN + path
    setLink('canonical', canonicalUrl)
    setMeta('meta[property="og:url"]', 'content', canonicalUrl)

    if (noindex) {
      setMeta('meta[name="robots"]', 'content', 'noindex, nofollow')
    } else {
      setMeta('meta[name="robots"]', 'content', 'index, follow')
    }

    return () => {
      document.title = prevTitle || DEFAULT_TITLE
      if (description) {
        setMeta('meta[name="description"]', 'content', DEFAULT_DESC)
      }
      if (noindex) {
        removeMeta('meta[name="robots"]')
      }
    }
  }, [title, description, noindex, canonicalPath])
}

export function useDocumentTitle(title: string | undefined): void {
  useSeo({ title })
}
