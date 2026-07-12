/**
 * Characterization tests for the presentational form/header primitives moved
 * out of components/ui.tsx into src/ui/<Name>/ (A15). They pin the CURRENT
 * behaviour (labels, required marker, aria wiring, password reveal, content
 * pass-through) so the move stays behaviour-identical, and assert the legacy
 * components/ui shim re-exports the very same implementations.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef } from 'react'
import { Field, Input, Textarea, Select, PasswordInput } from './Field'
import { EmptyState } from './EmptyState'
import { PageHeader } from './PageHeader'
import { SectionTitle } from './SectionTitle'
import { LiveDot } from './LiveDot'
import * as shim from '../components/ui'

afterEach(cleanup)

describe('<Field /> (via <Input />)', () => {
  it('associates the label with the control and shows the required marker', () => {
    render(<Input label="Email" required />)
    // label ↔ control wired: querying by accessible name resolves the input.
    // The required "*" lives inside the <label>, so the accessible name is
    // "Email*" — match loosely (this pins the current marker-in-label behaviour).
    expect(screen.getByRole('textbox', { name: /Email/ })).toBeInTheDocument()
    // required draws a "*" marker
    expect(screen.getByText('*')).toBeInTheDocument()
  })

  it('omits the required marker when not required', () => {
    render(<Input label="Email" />)
    expect(screen.queryByText('*')).not.toBeInTheDocument()
  })

  it('wires a hint through aria-describedby (announced, not silent)', () => {
    render(<Input label="Email" hint="we never share it" />)
    const input = screen.getByRole('textbox', { name: 'Email' })
    const describedBy = input.getAttribute('aria-describedby')
    expect(describedBy).toBeTruthy()
    const hint = document.getElementById(describedBy!.split(' ')[0])
    expect(hint).toHaveTextContent('we never share it')
    expect(input).not.toHaveAttribute('aria-invalid')
  })

  it('flags aria-invalid and renders an alert-role error message when errored', () => {
    render(<Input label="Email" error="Required" />)
    const input = screen.getByRole('textbox', { name: 'Email' })
    expect(input).toHaveAttribute('aria-invalid', 'true')
    const err = screen.getByRole('alert')
    expect(err).toHaveTextContent('Required')
    expect(input.getAttribute('aria-errormessage')).toBe(err.id)
  })

  it('forwards the ref to the underlying <input>', () => {
    const ref = createRef<HTMLInputElement>()
    render(<Input label="Email" ref={ref} />)
    expect(ref.current).toBeInstanceOf(HTMLInputElement)
  })

  it('accepts an arbitrary child via <Field> and clones a11y props onto it', () => {
    render(
      <Field label="Custom" error="bad">
        <input aria-label="raw" />
      </Field>,
    )
    // Field injects id + aria-invalid onto its single valid child
    const raw = screen.getByLabelText('raw')
    expect(raw).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('<Textarea /> & <Select />', () => {
  it('<Textarea> renders a labelled multiline control', () => {
    render(<Textarea label="Notes" />)
    expect(screen.getByRole('textbox', { name: 'Notes' }).tagName).toBe('TEXTAREA')
  })

  it('<Select> renders a labelled combobox with its options', () => {
    render(
      <Select label="Country">
        <option value="my">Malaysia</option>
        <option value="sg">Singapore</option>
      </Select>,
    )
    expect(screen.getByRole('combobox', { name: 'Country' })).toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Malaysia' })).toBeInTheDocument()
  })
})

describe('<PasswordInput />', () => {
  it('starts masked and reveals the value when the toggle is clicked', async () => {
    render(<PasswordInput label="Password" />)
    const input = screen.getByLabelText('Password') as HTMLInputElement
    expect(input.type).toBe('password')
    const toggle = screen.getByRole('button', { name: 'Show password' })
    await userEvent.click(toggle)
    expect(input.type).toBe('text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()
  })

  it('the reveal toggle is not a tab stop (tabIndex -1)', () => {
    render(<PasswordInput label="Password" />)
    expect(screen.getByRole('button', { name: 'Show password' })).toHaveAttribute('tabindex', '-1')
  })
})

describe('presentational headers / empties', () => {
  it('<EmptyState> renders title, description and action', () => {
    render(<EmptyState title="Nothing here" description="Add your first item" action={<button>New</button>} />)
    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument()
    expect(screen.getByText('Add your first item')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'New' })).toBeInTheDocument()
  })

  it('<PageHeader> renders an h1 title with eyebrow, description and actions', () => {
    render(
      <PageHeader eyebrow="Admin" title="Dashboard" description="Overview" actions={<button>Act</button>} />,
    )
    expect(screen.getByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument()
    expect(screen.getByText('Admin')).toBeInTheDocument()
    expect(screen.getByText('Overview')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Act' })).toBeInTheDocument()
  })

  it('<SectionTitle> renders an h2 title', () => {
    render(<SectionTitle title="Recent" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Recent' })).toBeInTheDocument()
  })

  it('<LiveDot> renders its label', () => {
    render(<LiveDot label="Live" />)
    expect(screen.getByText('Live')).toBeInTheDocument()
  })
})

describe('legacy components/ui shim', () => {
  it('re-exports the exact same implementations (behaviour-identical move)', () => {
    expect(shim.Field).toBe(Field)
    expect(shim.Input).toBe(Input)
    expect(shim.Textarea).toBe(Textarea)
    expect(shim.Select).toBe(Select)
    expect(shim.PasswordInput).toBe(PasswordInput)
    expect(shim.EmptyState).toBe(EmptyState)
    expect(shim.PageHeader).toBe(PageHeader)
    expect(shim.SectionTitle).toBe(SectionTitle)
    expect(shim.LiveDot).toBe(LiveDot)
  })
})
