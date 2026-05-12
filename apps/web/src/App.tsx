import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { useSession, bootstrapSession } from './state/useSession'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import LoadingSpinner from './components/LoadingSpinner'
import ProtectedRoute from './components/ProtectedRoute'
import OnboardingGate from './components/OnboardingGate'
import AdminGate from './components/AdminGate'
import ConsentGate from './components/ConsentGate'
import RoleGate from './components/RoleGate'
import Landing from './routes/Landing'
import SignUp from './routes/auth/SignUp'
import Login from './routes/auth/Login'
import { LOCATION_SLUGS, HIRE_SLUGS } from './data/silo-data'

const Start            = lazy(() => import('./routes/Start'))
const Careers          = lazy(() => import('./routes/Careers'))
const UrgentHiringPost = lazy(() => import('./routes/UrgentHiringPost'))
const RoleSilo         = lazy(() => import('./routes/RoleSilo'))
const LocationSilo     = lazy(() => import('./routes/LocationSilo'))
const HireSilo         = lazy(() => import('./routes/HireSilo'))
const CadetPilotGuide  = lazy(() => import('./routes/blog/CadetPilotGuide'))
const DiamondVsGemPost = lazy(() => import('./routes/blog/DiamondGraderVsGemologist'))
const WaitlistConfirm  = lazy(() => import('./routes/WaitlistConfirm'))
const PasswordReset    = lazy(() => import('./routes/auth/PasswordReset'))
const AuthCallback     = lazy(() => import('./routes/auth/AuthCallback'))
const MfaChallenge     = lazy(() => import('./routes/auth/MfaChallenge'))
const MfaEnroll        = lazy(() => import('./routes/auth/MfaEnroll'))

const TalentOnboarding = lazy(() => import('./routes/onboarding/TalentOnboarding'))
const HMOnboarding     = lazy(() => import('./routes/onboarding/HMOnboarding'))
const CompanyRegister  = lazy(() => import('./routes/onboarding/CompanyRegister'))
const CompanyVerify    = lazy(() => import('./routes/onboarding/CompanyVerify'))

const TalentDashboard  = lazy(() => import('./routes/dashboard/TalentDashboard'))
const HMDashboard      = lazy(() => import('./routes/dashboard/HMDashboard'))
const HRDashboard      = lazy(() => import('./routes/dashboard/HRDashboard'))
const AdminDashboard   = lazy(() => import('./routes/dashboard/AdminDashboard'))
const PostRole         = lazy(() => import('./routes/dashboard/PostRole'))
const InviteHM         = lazy(() => import('./routes/dashboard/InviteHM'))
const MyRoles          = lazy(() => import('./routes/dashboard/MyRoles'))
const EditRole         = lazy(() => import('./routes/dashboard/EditRole'))
const TalentProfile    = lazy(() => import('./routes/dashboard/TalentProfile'))

const PrivacyNotice    = lazy(() => import('./routes/legal/PrivacyNotice'))
const Terms            = lazy(() => import('./routes/legal/Terms'))
const Consent          = lazy(() => import('./routes/legal/Consent'))
const DataRequests     = lazy(() => import('./routes/DataRequests'))
const InterviewFeedback = lazy(() => import('./routes/InterviewFeedback'))
const Referrals        = lazy(() => import('./routes/Referrals'))
const PointsWallet     = lazy(() => import('./routes/PointsWallet'))
const Consult          = lazy(() => import('./routes/Consult'))
const PaymentReturn    = lazy(() => import('./routes/PaymentReturn'))
const NotFound         = lazy(() => import('./routes/NotFound'))
const MatchPreview     = lazy(() => import('./routes/dev/MatchPreview'))

// Restaurant OS — own chunk per page; heavy and rarely all visited together.
// Hard-disabled in production by default. Set VITE_ENABLE_RESTAURANT=true to surface.
const RESTAURANT_ENABLED = import.meta.env.VITE_ENABLE_RESTAURANT === 'true'

const GuestMenu        = lazy(() => import('./routes/restaurant/GuestMenu'))
const RestaurantLayout = lazy(() => import('./routes/restaurant/RestaurantLayout'))
const RestaurantHome   = lazy(() => import('./routes/restaurant/RestaurantHome'))
const RestaurantTrack  = lazy(() => import('./routes/restaurant/Track'))
const Kiosk            = lazy(() => import('./routes/restaurant/Kiosk'))
const Orders           = lazy(() => import('./routes/restaurant/Orders'))
const Kds              = lazy(() => import('./routes/restaurant/Kds'))
const BarKds           = lazy(() => import('./routes/restaurant/Kds').then(m => ({ default: m.BarKds })))
const Cashier          = lazy(() => import('./routes/restaurant/Cashier'))
const Floor            = lazy(() => import('./routes/restaurant/Floor'))
const Inventory        = lazy(() => import('./routes/restaurant/Inventory'))
const Purchasing       = lazy(() => import('./routes/restaurant/Purchasing'))
const Staff            = lazy(() => import('./routes/restaurant/Staff'))
const Accounting       = lazy(() => import('./routes/restaurant/Accounting'))
const Promotions       = lazy(() => import('./routes/restaurant/Promotions'))
const Audit            = lazy(() => import('./routes/restaurant/Audit'))
const Shifts           = lazy(() => import('./routes/restaurant/Shifts'))
const Branches         = lazy(() => import('./routes/restaurant/Branches'))
const Reports          = lazy(() => import('./routes/restaurant/Reports'))
const RestaurantAdmin  = lazy(() => import('./routes/restaurant/Admin'))

export default function App() {
  const { loading, session, profile } = useSession()
  useEffect(() => { bootstrapSession() }, [])

  if (loading && !session) return <LoadingSpinner full />

  return (
    <Suspense fallback={<LoadingSpinner full />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/careers" element={<Careers />} />
        {/* F19 — /job-vacancy was a duplicate URL of /careers (SEO cannibalisation
            risk). Canonicalise to /careers via a client-side redirect. */}
        <Route path="/job-vacancy" element={<Navigate to="/careers" replace />} />
        <Route path="/careers/urgent-hiring-malaysia-2026" element={<UrgentHiringPost />} />
        <Route path="/careers/cadet-pilot-program-malaysia-guide" element={<CadetPilotGuide />} />
        <Route path="/careers/diamond-grader-vs-gemologist" element={<DiamondVsGemPost />} />
        <Route path="/jobs/:slug" element={<RoleSilo />} />
        {/* React Router v6 cannot match a `:slug` parameter after a hyphen in literal path text,
            so /jobs-in-:slug and /hire-:slug fall through to NotFound. Enumerate explicitly. */}
        {LOCATION_SLUGS.map((slug) => (
          <Route key={`loc-${slug}`} path={`/jobs-in-${slug}`} element={<LocationSilo />} />
        ))}
        {HIRE_SLUGS.map((slug) => (
          <Route key={`hire-${slug}`} path={`/hire-${slug}`} element={<HireSilo />} />
        ))}
        <Route path="/start/:side" element={<Start />} />
        <Route path="/waitlist/confirm" element={<WaitlistConfirm />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/onboarding/company/verify" element={<CompanyVerify />} />
        <Route path="/payment/return" element={<PaymentReturn />} />
        <Route path="/payment/mock"   element={<PaymentReturn />} />
        <Route path="/signup" element={session && profile ? <SignupLoggedIn /> : <SignUp />} />
        <Route path="/signout" element={<Signout />} />
        <Route path="/login"  element={session && profile ? <Navigate to="/home" replace /> : <Login />} />
        <Route path="/password-reset" element={<PasswordReset />} />
        <Route path="/privacy" element={<PrivacyNotice />} />
        <Route path="/terms"   element={<Terms />} />
        <Route path="/mfa/challenge" element={<MfaChallenge />} />
        <Route path="/mfa/enroll"    element={<MfaEnroll />} />

        {import.meta.env.DEV && <Route path="/dev/match-preview" element={<MatchPreview />} />}

        {/* Public customer order tracker — anonymous, RLS-allowed read */}
        {RESTAURANT_ENABLED && (
          <Route path="/restaurant/track/:orderId" element={<RestaurantTrack />} />
        )}

        {/* Public QR menu — guest ordering, no login required */}
        {RESTAURANT_ENABLED && (
          <Route path="/menu/:branchId" element={<GuestMenu />} />
        )}

        {/* Authenticated (inside Layout) */}
        <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route path="/consent" element={<Consent />} />
          <Route path="/home" element={<ConsentGate><RoleHome /></ConsentGate>} />

          {/* Onboarding (consent first, then onboarding) */}
          <Route path="/onboarding/talent"  element={<ConsentGate><TalentOnboarding /></ConsentGate>} />
          <Route path="/onboarding/hm"      element={<ConsentGate><HMOnboarding /></ConsentGate>} />
          <Route path="/onboarding/company" element={<ConsentGate><CompanyRegister /></ConsentGate>} />

          {/* Dashboards (consent + onboarding gated) */}
          <Route path="/talent" element={<RoleGate allow={['talent']}><ConsentGate><OnboardingGate><TalentDashboard /></OnboardingGate></ConsentGate></RoleGate>} />
          <Route path="/talent/profile" element={<RoleGate allow={['talent']}><ConsentGate><OnboardingGate><TalentProfile /></OnboardingGate></ConsentGate></RoleGate>} />
          <Route path="/hm"     element={<RoleGate allow={['hiring_manager']} alsoAllowHRwithHM><ConsentGate><OnboardingGate><HMDashboard /></OnboardingGate></ConsentGate></RoleGate>} />
          <Route path="/hm/post-role" element={<RoleGate allow={['hiring_manager']} alsoAllowHRwithHM><ConsentGate><OnboardingGate><PostRole /></OnboardingGate></ConsentGate></RoleGate>} />
          <Route path="/hm/roles" element={<RoleGate allow={['hiring_manager']} alsoAllowHRwithHM><ConsentGate><OnboardingGate><MyRoles /></OnboardingGate></ConsentGate></RoleGate>} />
          <Route path="/hm/roles/:id/edit" element={<RoleGate allow={['hiring_manager']} alsoAllowHRwithHM><ConsentGate><OnboardingGate><EditRole /></OnboardingGate></ConsentGate></RoleGate>} />
          <Route path="/hr"     element={<RoleGate allow={['hr_admin']}><ConsentGate><OnboardingGate><HRDashboard /></OnboardingGate></ConsentGate></RoleGate>} />
          <Route path="/hr/invite" element={<RoleGate allow={['hr_admin']}><ConsentGate><OnboardingGate><InviteHM /></OnboardingGate></ConsentGate></RoleGate>} />
          <Route path="/admin"  element={<AdminGate><AdminDashboard /></AdminGate>} />
          <Route path="/data-requests" element={<DataRequests />} />
          <Route path="/feedback/:matchId" element={<InterviewFeedback />} />
          <Route path="/referrals" element={<ConsentGate><Referrals /></ConsentGate>} />
          <Route path="/points"   element={<ConsentGate><PointsWallet /></ConsentGate>} />
          <Route path="/consult" element={<Consult />} />
          <Route path="/consult/return" element={<Consult />} />

          {/* Restaurant OS — gated to admin and restaurant_staff only.
              Hidden in production unless VITE_ENABLE_RESTAURANT=true. */}
          {RESTAURANT_ENABLED && (
            <Route path="/restaurant" element={<RoleGate allow={['admin', 'restaurant_staff']}><RestaurantLayout /></RoleGate>}>
              <Route index element={<RestaurantHome />} />
              <Route path="kiosk"      element={<Kiosk />} />
              <Route path="orders"     element={<Orders />} />
              <Route path="kds"        element={<Kds />} />
              <Route path="bar"        element={<BarKds />} />
              <Route path="cashier"    element={<Cashier />} />
              <Route path="floor"      element={<Floor />} />
              <Route path="inventory"  element={<Inventory />} />
              <Route path="purchasing" element={<Purchasing />} />
              <Route path="staff"      element={<Staff />} />
              <Route path="accounting" element={<Accounting />} />
              <Route path="promotions" element={<Promotions />} />
              <Route path="audit"      element={<Audit />} />
              <Route path="shifts"     element={<Shifts />} />
              <Route path="branches"   element={<Branches />} />
              <Route path="reports"    element={<Reports />} />
              <Route path="admin"      element={<RestaurantAdmin />} />
            </Route>
          )}
        </Route>

        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
  )
}

/** Handles /signup when the user is already logged in.
 * If a ?ref= code is present, redirect to /referrals so they can see their own referral page.
 * Otherwise just go /home. */
function SignupLoggedIn() {
  const [params] = useSearchParams()
  const ref = params.get('ref')
  if (ref) return <Navigate to={`/referrals?notice=already_signed_in&ref=${ref}`} replace />
  return <Navigate to="/home" replace />
}

/** /signout — signs the user out and returns to the landing page. */
function Signout() {
  useEffect(() => {
    void supabase.auth.signOut().then(() => {
      window.location.replace('/')
    })
  }, [])
  return <LoadingSpinner full />
}

function RoleHome() {
  const { profile } = useSession()
  if (!profile) return <Navigate to="/" replace />

  if (!profile.onboarding_complete && profile.role !== 'admin' && profile.role !== 'restaurant_staff') {
    if (profile.role === 'talent')         return <Navigate to="/onboarding/talent" replace />
    if (profile.role === 'hiring_manager') return <Navigate to="/onboarding/hm" replace />
    if (profile.role === 'hr_admin')       return <Navigate to="/onboarding/company" replace />
  }
  if (profile.role === 'talent')            return <Navigate to="/talent" replace />
  if (profile.role === 'hiring_manager')   return <Navigate to="/hm" replace />
  if (profile.role === 'hr_admin')         return <Navigate to="/hr" replace />
  if (profile.role === 'admin')            return <Navigate to="/admin" replace />
  if (profile.role === 'restaurant_staff' && RESTAURANT_ENABLED) return <Navigate to="/restaurant" replace />
  return <Navigate to="/" replace />
}
