// FILE: app/(auth)/sign-in/[[...sign-in]]/page.tsx
// Clerk sign-in page. The [[...sign-in]] folder name is required by Clerk.

import { SignIn } from '@clerk/nextjs'

export default function SignInPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <SignIn />
    </div>
  )
}
