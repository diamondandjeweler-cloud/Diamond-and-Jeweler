import { lazy, Suspense, useEffect } from 'react'
import { Routes, Route, Navigate, useSearchParams } from 'react-router-dom'
import { useSession, bootstrapSession } from './state/useSession'
import { useShallow } from 'zustand/react/shallow'
import { supabase } from './lib/supabase'
import Layout from './components/Layout'
import LoadingSpinner from './components/LoadingSpinner'
import RouteSkeleton from './components/RouteSkeleton'
import ProtectedRoute from './app/routing/guards/ProtectedRoute'
import { prefetchRoleHome, prefetchPublicNext } from './lib/prefetch'
import AdminGate from './app/routing/guards/AdminGate'
import ConsentGate from './app/routing/guards/ConsentGate'
import RoleGate from './app/routing/guards/RoleGate'
import Guarded from './app/routing/guards/Guarded'
import Landing from './routes/Landing'
import { LOCATION_SLUGS, HIRE_SLUGS } from './shared/content/silo-data'
import PwaInstallBanner from './components/PwaInstallBanner'
import { useDarkMode } from './lib/useDarkMode'
import type { RestaurantRole } from './types/db'

const SignUp           = lazy(() => import('./routes/auth/SignUp'))
const Login            = lazy(() => import('./routes/auth/Login'))
const Start            = lazy(() => import('./routes/Start'))
const About            = lazy(() => import('./routes/About'))
const Careers          = lazy(() => import('./routes/Careers'))
const UrgentHiringPost = lazy(() => import('./routes/UrgentHiringPost'))
const RoleSilo         = lazy(() => import('./routes/RoleSilo'))
const LocationSilo     = lazy(() => import('./routes/LocationSilo'))
const HireSilo         = lazy(() => import('./routes/HireSilo'))
const CadetPilotGuide  = lazy(() => import('./routes/blog/CadetPilotGuide'))
const DiamondVsGemPost = lazy(() => import('./routes/blog/DiamondGraderVsGemologist'))
const LuxuryRetailPost = lazy(() => import('./routes/blog/LuxuryRetailJobsPost'))
const AiRecruitmentPost = lazy(() => import('./routes/blog/AiRecruitmentPost'))
const JewelleryShopPost = lazy(() => import('./routes/blog/JewelleryShopHiringPost'))
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
const HMCompanyProfile = lazy(() => import('./routes/dashboard/HMCompanyProfile'))
const HMSettings       = lazy(() => import('./routes/dashboard/HMSettings'))
const HMAccount        = lazy(() => import('./routes/dashboard/HMAccount'))
const OrgChartList     = lazy(() => import('./routes/dashboard/OrgChartList'))
const OrgChartNew      = lazy(() => import('./routes/dashboard/OrgChartNew'))
const OrgChartDetail   = lazy(() => import('./routes/dashboard/OrgChartDetail'))

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
const Banned           = lazy(() => import('./routes/Banned'))
const Pricing          = lazy(() => import('./routes/Pricing'))
const MatchPreview     = lazy(() => import('./routes/dev/MatchPreview'))

// ===========================================================================
// RESTAURANT OS SEAM — everything restaurant-specific lives behind this single
// flag. The Restaurant OS is a separate module bolted onto the recruitment
// CORE; nothing above this line should reference it. Toggling
// VITE_ENABLE_RESTAURANT off (the production default) removes every restaurant
// route below without affecting recruitment routing.
//
// `RestaurantRole` ('restaurant_staff') is owned by this module — see
// types/db.ts. Core routing uses RecruitmentRole only.
//
// Own chunk per page; heavy and rarely all visited together.
// ---------------------------------------------------------------------------
const RESTAURANT_ENABLED = import.meta.env.VITE_ENABLE_RESTAURANT === 'true'

// Role that, in addition to 'admin', may access the Restaurant OS shell.
// Sourced from the restaurant role seam so this string is not hard-coded into
// the recruitment routing below.
const RESTAURANT_ROLE: RestaurantRole = 'restaurant_staff'

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
// ===========================================================================
// END RESTAURANT OS SEAM (imports)
// ===========================================================================

export default function App() {
  useDarkMode()
  const { loading, session, profile, isHM } = useSession(useShallow((s) => ({ loading: s.loading, session: s.session, profile: s.profile, isHM: s.isHM })))
  useEffect(() => { bootstrapSession() }, [])
  // Once we know the user's role, prefetch their likely dashboard chunk in
  // the background. By the time they click "Home" / "Dashboard", the chunk
  // is already in the browser's module cache — zero wait.
  useEffect(() => { if (profile?.role) prefetchRoleHome(profile.role) }, [profile?.role])
  // For unauthenticated visitors (the public Landing entry point), warm the
  // public next-step chunks (Careers, Start) during idle so the first click
  // feels instant. Runs once per tab; no-op after login.
  useEffect(() => { if (!loading && !session) prefetchPublicNext() }, [loading, session])

  // Self-heal isHM for hr_admin users. The bootstrap fetchIsHM runs inside
  // onAuthStateChange, where supabase-js can fail to attach the auth token to
  // PostgREST — yielding a false-negative that bounces "Switch to HM view".
  // refreshIsHM() runs here in a normal effect context (auth token reliably
  // attached), so it re-resolves the true value. Only fires for hr_admin with
  // isHM still false — talents/HMs are unaffected; one cheap query at most.
  useEffect(() => {
    if (session && profile?.role === 'hr_admin' && !isHM) {
      void useSession.getState().refreshIsHM()
    }
  }, [session, profile?.role, isHM])

  // Initial session check — show the route skeleton instead of a centred spinner
  // so the perceived layout matches what's about to render. LoadingSpinner kept
  // for narrow cases (e.g. Signout where the user is mid-redirect).
  if (loading && !session) return <RouteSkeleton />

  return (
    <>
    <Suspense fallback={<RouteSkeleton />}>
      <Routes>
        {/* Public */}
        <Route path="/" element={<Landing />} />
        <Route path="/about" element={<About />} />
        <Route path="/pricing" element={<Pricing />} />
        <Route path="/careers" element={<Careers />} />
        {/* F19 — /job-vacancy was a duplicate URL of /careers (SEO cannibalisation
            risk). Canonicalise to /careers via a client-side redirect. */}
        <Route path="/job-vacancy" element={<Navigate to="/careers" replace />} />
        <Route path="/careers/urgent-hiring-malaysia-2026" element={<UrgentHiringPost />} />
        <Route path="/careers/cadet-pilot-program-malaysia-guide" element={<CadetPilotGuide />} />
        <Route path="/careers/diamond-grader-vs-gemologist" element={<DiamondVsGemPost />} />
        <Route path="/careers/luxury-retail-jobs-malaysia" element={<LuxuryRetailPost />} />
        <Route path="/careers/ai-recruitment-explained" element={<AiRecruitmentPost />} />
        <Route path="/careers/jewellery-shop-hiring-malaysia" element={<JewelleryShopPost />} />
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
        <Route path="/signup" element={loading ? <RouteSkeleton /> : session && profile ? <SignupLoggedIn /> : <SignUp />} />
        <Route path="/signout" element={<Signout />} />
        <Route path="/login"  element={session ? <Navigate to="/home" replace /> : <Login />} />
        <Route path="/password-reset" element={<PasswordReset />} />
        <Route path="/privacy" element={<PrivacyNotice />} />
        <Route path="/terms"   element={<Terms />} />
        <Route path="/mfa/challenge" element={<ProtectedRoute><MfaChallenge /></ProtectedRoute>} />
        <Route path="/mfa/enroll"    element={<ProtectedRoute><MfaEnroll /></ProtectedRoute>} />

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

          {/* Dashboards (consent + onboarding gated) — the RoleGate→ConsentGate
              →OnboardingGate triple is composed into one <Guarded> wrapper.
              Byte-identical to the hand-stacked form; see Guarded.test.tsx. */}
          <Route path="/talent" element={<Guarded roles={['talent']}><TalentDashboard /></Guarded>} />
          <Route path="/talent/profile" element={<Guarded roles={['talent']}><TalentProfile /></Guarded>} />
          <Route path="/hm"     element={<Guarded roles={['hiring_manager']} alsoAllowHRwithHM><HMDashboard /></Guarded>} />
          <Route path="/hm/post-role" element={<Guarded roles={['hiring_manager']} alsoAllowHRwithHM><PostRole /></Guarded>} />
          <Route path="/hm/post-role/:id" element={<Guarded roles={['hiring_manager']} alsoAllowHRwithHM><PostRole /></Guarded>} />
          <Route path="/hm/roles" element={<Guarded roles={['hiring_manager']} alsoAllowHRwithHM><MyRoles /></Guarded>} />
          <Route path="/hm/roles/:id/edit" element={<Guarded roles={['hiring_manager']} alsoAllowHRwithHM><EditRole /></Guarded>} />
          <Route path="/hm/company" element={<Guarded roles={['hiring_manager']} alsoAllowHRwithHM><HMCompanyProfile /></Guarded>} />
          <Route path="/hm/settings" element={<Guarded roles={['hiring_manager']} alsoAllowHRwithHM><HMSettings /></Guarded>} />
          <Route path="/hm/account" element={<Guarded roles={['hiring_manager']} alsoAllowHRwithHM><HMAccount /></Guarded>} />
          <Route path="/hm/org-chart" element={<Guarded roles={['hiring_manager']} alsoAllowHRwithHM><OrgChartList /></Guarded>} />
          <Route path="/hm/org-chart/new" element={<Guarded roles={['hiring_manager']} alsoAllowHRwithHM><OrgChartNew /></Guarded>} />
          <Route path="/hm/org-chart/:id" element={<Guarded roles={['hiring_manager']} alsoAllowHRwithHM><OrgChartDetail /></Guarded>} />
          <Route path="/hr"     element={<Guarded roles={['hr_admin']}><HRDashboard /></Guarded>} />
          <Route path="/hr/invite" element={<Guarded roles={['hr_admin']}><InviteHM /></Guarded>} />
          <Route path="/admin"  element={<AdminGate><AdminDashboard /></AdminGate>} />
          <Route path="/data-requests" element={<DataRequests />} />
          <Route path="/feedback/:matchId" element={<InterviewFeedback />} />
          <Route path="/referrals" element={<ConsentGate><Referrals /></ConsentGate>} />
          <Route path="/points"   element={<ConsentGate><PointsWallet /></ConsentGate>} />
          <Route path="/consult" element={<Consult />} />
          <Route path="/consult/return" element={<Consult />} />

          {/* === RESTAURANT OS SEAM (routes) ===
              Gated to admin + the restaurant role only. Hidden in production
              unless VITE_ENABLE_RESTAURANT=true. The restaurant role string is
              sourced from RESTAURANT_ROLE (restaurant seam) so recruitment
              routing never hard-codes 'restaurant_staff'. */}
          {RESTAURANT_ENABLED && (
            <Route path="/restaurant" element={<RoleGate allow={['admin', RESTAURANT_ROLE]}><RestaurantLayout /></RoleGate>}>
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

        <Route path="/banned" element={<Banned />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </Suspense>
    <PwaInstallBanner />
    </>
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
  const { profile } = useSession(useShallow((s) => ({ profile: s.profile })))
  if (!profile) return <Navigate to="/" replace />

  // The restaurant role has no recruitment onboarding flow — skip the gate.
  // (admin is the other no-onboarding role; both are seam exceptions.)
  const isRestaurantRole = profile.role === RESTAURANT_ROLE
  if (!profile.onboarding_complete && profile.role !== 'admin' && !isRestaurantRole) {
    if (profile.role === 'talent')         return <Navigate to="/onboarding/talent" replace />
    if (profile.role === 'hiring_manager') return <Navigate to="/onboarding/hm" replace />
    if (profile.role === 'hr_admin')       return <Navigate to="/onboarding/company" replace />
  }
  // Recruitment-core role homes.
  if (profile.role === 'talent')            return <Navigate to="/talent" replace />
  if (profile.role === 'hiring_manager')   return <Navigate to="/hm" replace />
  if (profile.role === 'hr_admin')         return <Navigate to="/hr" replace />
  if (profile.role === 'admin')            return <Navigate to="/admin" replace />
  // === RESTAURANT OS SEAM (role home) — only when the module is enabled. ===
  if (isRestaurantRole && RESTAURANT_ENABLED) return <Navigate to="/restaurant" replace />
  return <Navigate to="/" replace />
}
