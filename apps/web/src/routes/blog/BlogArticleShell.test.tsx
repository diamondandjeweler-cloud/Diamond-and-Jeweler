import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, it, expect } from 'vitest'
import BlogArticleShell from './BlogArticleShell'

// Characterization test locking the shared blog page chrome to the markup that
// was previously inlined byte-for-byte across the five /careers/* posts
// (header, breadcrumb, article eyebrow/title/published line, footer). Phase 4
// dedup must preserve the rendered DOM, classes, and aria attributes exactly.

function renderShell() {
  return render(
    <MemoryRouter>
      <BlogArticleShell
        breadcrumbLabel="Diamond Grader vs Gemologist"
        eyebrow="CAREERS · LUXURY · 2026"
        title="Diamond Grader vs Gemologist — Career Path in Malaysia"
        published="2026-05-09"
        readMinutes={7}
        afterArticle={<div data-testid="related">related</div>}
      >
        <p data-testid="body">body copy</p>
      </BlogArticleShell>
    </MemoryRouter>,
  )
}

describe('<BlogArticleShell />', () => {
  it('renders the DNJ header logo and "All careers" link', () => {
    const { container, getByText } = renderShell()
    const header = container.querySelector('header')!
    expect(header.className).toContain('border-b')
    const home = header.querySelector('a[aria-label="DNJ home"]')!
    expect(home.getAttribute('href')).toBe('/')
    expect(home.textContent).toContain('DNJ')
    expect(home.textContent).toContain('DIAMOND & JEWELER')
    const careers = getByText('All careers')
    expect(careers.getAttribute('href')).toBe('/careers')
  })

  it('renders the breadcrumb with the leaf label marked aria-current', () => {
    const { container } = renderShell()
    const nav = container.querySelector('nav[aria-label="Breadcrumb"]')!
    const current = nav.querySelector('[aria-current="page"]')!
    expect(current.textContent).toBe('Diamond Grader vs Gemologist')
    const links = nav.querySelectorAll('a')
    expect(links[0].getAttribute('href')).toBe('/')
    expect(links[1].getAttribute('href')).toBe('/careers')
  })

  it('renders the article eyebrow, h1 title, and published/read-time line', () => {
    const { container } = renderShell()
    const article = container.querySelector('article')!
    const eyebrow = article.querySelector('p')!
    expect(eyebrow.textContent).toBe('CAREERS · LUXURY · 2026')
    const h1 = article.querySelector('h1')!
    expect(h1.textContent).toContain('Diamond Grader vs Gemologist — Career Path in Malaysia')
    const time = article.querySelector('time')!
    expect(time.getAttribute('dateTime')).toBe('2026-05-09')
    expect(time.textContent).toBe('2026-05-09')
    expect(article.textContent).toContain('7 min read')
  })

  it('renders children inside <article> and afterArticle inside <main> after the article', () => {
    const { container, getByTestId } = renderShell()
    const article = container.querySelector('article')!
    expect(article.contains(getByTestId('body'))).toBe(true)
    const main = container.querySelector('main')!
    const related = getByTestId('related')
    expect(main.contains(related)).toBe(true)
    expect(article.contains(related)).toBe(false)
  })

  it('renders the footer with Home / Careers / Privacy / Terms links', () => {
    const { container } = renderShell()
    const footer = container.querySelector('footer')!
    const hrefs = Array.from(footer.querySelectorAll('a')).map((a) => a.getAttribute('href'))
    expect(hrefs).toEqual(['/', '/careers', '/privacy', '/terms'])
  })
})
