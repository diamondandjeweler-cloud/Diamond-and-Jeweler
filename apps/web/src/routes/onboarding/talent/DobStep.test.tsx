/**
 * Characterization tests for the talent onboarding DOB step's single-selects.
 *
 * These pin the BEHAVIOUR that survives the RadioGroup(segmented) adoption:
 * gender / race / commute are single-choice controls whose selection drives the
 * parent setters, they keep the brand-filled pill styling (parity beats
 * purity), and they now carry real radio semantics (role=radiogroup / radio).
 * DobStep is a pure presentational sub-view (reads props, calls setters), so it
 * is rendered directly with a stub `t` — same pattern as ReviewStep's test.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { TFunction } from 'i18next'
import type { Gender } from '../../../shared/domain/lifeChart/lifeChartCharacter'
import DobStep from './DobStep'

afterEach(cleanup)

// Deterministic i18n stub: echoes the key so we can assert on visible keys.
const t = ((key: string) => key) as unknown as TFunction

type Props = Parameters<typeof DobStep>[0]

function makeProps(overrides: Partial<Props> = {}): Props {
  return {
    t,
    dob: '',
    setDob: vi.fn(),
    gender: '' as Gender | '',
    setGender: vi.fn(),
    race: '',
    setRace: vi.fn(),
    religion: '',
    setReligion: vi.fn(),
    languages: [],
    setLanguages: vi.fn(),
    locationMatters: null,
    setLocationMatters: vi.fn(),
    locationPostcode: '',
    setLocationPostcode: vi.fn(),
    openToNewField: false,
    setOpenToNewField: vi.fn(),
    dobConsent: false,
    setDobConsent: vi.fn(),
    dobAttempted: false,
    setDobAttempted: vi.fn(),
    err: null,
    setErr: vi.fn(),
    onValidContinue: vi.fn(),
    ...overrides,
  }
}

describe('<DobStep /> single-selects — RadioGroup(segmented) adoption', () => {
  it('renders gender / race / commute as labelled radiogroups of radios', () => {
    render(<DobStep {...makeProps()} />)
    expect(screen.getByRole('radiogroup', { name: 'talentOnboard.genderLabel' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'talentOnboard.raceLabel' })).toBeInTheDocument()
    expect(screen.getByRole('radiogroup', { name: 'talentOnboard.commuteQuestion' })).toBeInTheDocument()
    // Gender options are now radios (were plain <button>s with no radio role).
    expect(screen.getByRole('radio', { name: 'talentOnboard.male' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'talentOnboard.female' })).toBeInTheDocument()
    // Race: four options.
    expect(screen.getAllByRole('radio', { name: /talentOnboard\.race/ })).toHaveLength(4)
  })

  it('selecting a gender pill calls setGender with the option value', async () => {
    const setGender = vi.fn()
    render(<DobStep {...makeProps({ gender: '', setGender })} />)
    await userEvent.click(screen.getByRole('radio', { name: 'talentOnboard.male' }))
    expect(setGender).toHaveBeenCalledWith('male')
  })

  it('selecting a race pill calls setRace with the option value', async () => {
    const setRace = vi.fn()
    render(<DobStep {...makeProps({ race: '', setRace })} />)
    await userEvent.click(screen.getByRole('radio', { name: 'talentOnboard.raceChinese' }))
    expect(setRace).toHaveBeenCalledWith('chinese')
  })

  it('commute Yes selects true; No selects false AND clears the postcode (behaviour preserved)', async () => {
    const setLocationMatters = vi.fn()
    const setLocationPostcode = vi.fn()
    render(<DobStep {...makeProps({ locationMatters: null, setLocationMatters, setLocationPostcode })} />)

    await userEvent.click(screen.getByRole('radio', { name: 'talentOnboard.commuteYes' }))
    expect(setLocationMatters).toHaveBeenCalledWith(true)

    await userEvent.click(screen.getByRole('radio', { name: 'talentOnboard.commuteNo' }))
    expect(setLocationMatters).toHaveBeenCalledWith(false)
    expect(setLocationPostcode).toHaveBeenCalledWith('')
  })

  it('language multi-select toggles expose aria-pressed reflecting selection (secrecy-a11y-inj-3)', async () => {
    const setLanguages = vi.fn()
    render(<DobStep {...makeProps({ languages: ['english'], setLanguages })} />)
    // Selected + unselected options must announce their pressed state to AT.
    expect(screen.getByRole('button', { name: 'talentOnboard.langEnglish' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'talentOnboard.langBahasaMalaysia' })).toHaveAttribute('aria-pressed', 'false')
    // Toggling still drives the setter.
    await userEvent.click(screen.getByRole('button', { name: 'talentOnboard.langBahasaMalaysia' }))
    expect(setLanguages).toHaveBeenCalled()
  })

  it('reflects the current selection and keeps the brand-filled pill styling (parity)', () => {
    render(<DobStep {...makeProps({ gender: 'male' })} />)
    const male = screen.getByRole('radio', { name: 'talentOnboard.male' })
    const female = screen.getByRole('radio', { name: 'talentOnboard.female' })
    expect(male).toHaveAttribute('aria-checked', 'true')
    expect(female).toHaveAttribute('aria-checked', 'false')
    // Same pill look as the hand-rolled buttons it replaced.
    expect(male.className).toMatch(/rounded-lg/)
    expect(male.className).toMatch(/px-3/)
    expect(male.className).toMatch(/data-\[state=checked\]:bg-brand-500/)
    expect(male.className).toMatch(/data-\[state=unchecked\]:border-border/)
  })
})
