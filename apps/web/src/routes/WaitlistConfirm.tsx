import { Link } from 'react-router-dom'

export default function WaitlistConfirm() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white border rounded-lg p-6 shadow-sm text-center">
        <h1 className="text-xl font-semibold mb-2">You're on the list</h1>
        <p className="text-sm text-gray-600 mb-4">
          Thanks for your interest in DNJ. We'll reach out when it's your
          turn to join the pilot.
        </p>
        <Link to="/" className="text-brand-600 underline text-sm">Back to home</Link>
      </div>
    </div>
  )
}
