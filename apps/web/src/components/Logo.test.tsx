import { render } from '@testing-library/react'
import { describe, it, expect } from 'vitest'
import Logo from './Logo'

// Characterization test locking the shared Logo's rendered SVG to the two
// call-site variants it replaced (Layout brand mark + AuthShell per-variant
// mark). Phase 4 dedup must stay byte-identical to the previously inlined SVGs.

describe('<Logo />', () => {
  it('renders the Layout default brand mark (28px, static grad id)', () => {
    const { container } = render(<Logo size={28} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('28')
    expect(svg.getAttribute('height')).toBe('28')
    expect(svg.getAttribute('viewBox')).toBe('0 0 32 32')
    const grad = container.querySelector('linearGradient')!
    expect(grad.getAttribute('id')).toBe('layout-logo-grad')
    const stops = container.querySelectorAll('stop')
    expect(stops[0].getAttribute('stop-color')).toBe('#1a2260')
    expect(stops[1].getAttribute('stop-color')).toBe('#3e4fd3')
    expect(container.querySelector('rect')!.getAttribute('fill')).toBe('url(#layout-logo-grad)')
  })

  it('renders the Layout footer small mark at 18px', () => {
    const { container } = render(<Logo size={18} />)
    const svg = container.querySelector('svg')!
    expect(svg.getAttribute('width')).toBe('18')
    expect(svg.getAttribute('height')).toBe('18')
  })

  it('renders an AuthShell per-variant mark with parameterized gradient + derived id', () => {
    const gradFrom = '#b8860b'
    const { container } = render(
      <Logo
        size={28}
        gradFrom={gradFrom}
        gradTo="#e8c55a"
        gradId={`logo-grad-${gradFrom.replace('#', '')}`}
      />,
    )
    const grad = container.querySelector('linearGradient')!
    expect(grad.getAttribute('id')).toBe('logo-grad-b8860b')
    const stops = container.querySelectorAll('stop')
    expect(stops[0].getAttribute('stop-color')).toBe('#b8860b')
    expect(stops[1].getAttribute('stop-color')).toBe('#e8c55a')
    expect(container.querySelector('rect')!.getAttribute('fill')).toBe('url(#logo-grad-b8860b)')
  })

  it('renders the invariant diamond geometry (both polygons, line, dot)', () => {
    const { container } = render(<Logo />)
    const polygons = container.querySelectorAll('polygon')
    expect(polygons[0].getAttribute('points')).toBe('7,15 16,5 25,15')
    expect(polygons[1].getAttribute('points')).toBe('7,15 25,15 16,28')
    expect(container.querySelector('line')).not.toBeNull()
    const circle = container.querySelector('circle')!
    expect(circle.getAttribute('cx')).toBe('13')
    expect(circle.getAttribute('cy')).toBe('10')
    expect(svgIsAriaHidden(container.querySelector('svg')!)).toBe(true)
  })
})

function svgIsAriaHidden(svg: SVGSVGElement): boolean {
  return svg.getAttribute('aria-hidden') === 'true' || svg.hasAttribute('aria-hidden')
}
