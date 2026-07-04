import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Async } from './Async'

afterEach(cleanup)

describe('<Async />', () => {
  it('renders the custom loading fallback while loading', () => {
    render(
      <Async data={undefined} isLoading loading={<div>loading…</div>}>
        {() => <div>loaded</div>}
      </Async>,
    )
    expect(screen.getByText('loading…')).toBeInTheDocument()
    expect(screen.queryByText('loaded')).not.toBeInTheDocument()
  })

  it('defaults to a skeleton status region while loading', () => {
    render(
      <Async data={undefined} isLoading>
        {() => <div>loaded</div>}
      </Async>,
    )
    expect(screen.getAllByRole('status').length).toBeGreaterThan(0)
    expect(screen.queryByText('loaded')).not.toBeInTheDocument()
  })

  it('shows an error with a working retry when the fetch failed', async () => {
    const onRetry = vi.fn()
    render(
      <Async data={undefined} isLoading={false} error={new Error('boom')} onRetry={onRetry}>
        {() => <div>loaded</div>}
      </Async>,
    )
    expect(screen.getByRole('alert')).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('shows the default empty state for an empty array', () => {
    render(
      <Async data={[]} isLoading={false}>
        {() => <div>loaded</div>}
      </Async>,
    )
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
    expect(screen.queryByText('loaded')).not.toBeInTheDocument()
  })

  it('renders a custom empty slot when provided', () => {
    render(
      <Async data={[]} isLoading={false} empty={<div>no rows yet</div>}>
        {() => <div>loaded</div>}
      </Async>,
    )
    expect(screen.getByText('no rows yet')).toBeInTheDocument()
  })

  it('renders children with resolved data', () => {
    render(
      <Async data={['a', 'b']} isLoading={false}>
        {(rows) => <div>{rows.join(',')}</div>}
      </Async>,
    )
    expect(screen.getByText('a,b')).toBeInTheDocument()
  })

  it('prefers already-resolved data over a late error (no error flash)', () => {
    render(
      <Async data={['x']} isLoading={false} error={new Error('late')}>
        {(rows) => <div>{rows.join(',')}</div>}
      </Async>,
    )
    expect(screen.getByText('x')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('honours a custom isEmpty predicate', () => {
    render(
      <Async data={{ items: [] }} isLoading={false} isEmpty={(d) => d.items.length === 0}>
        {() => <div>loaded</div>}
      </Async>,
    )
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument()
  })
})
