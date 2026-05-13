// FILE: app/(auth)/sign-up/[[...sign-up]]/page.tsx
// Clerk sign-up page. The [[...sign-up]] folder name is required by Clerk.

import { SignUp } from '@clerk/nextjs'

export default function SignUpPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <SignUp />
    </div>
  )
}
