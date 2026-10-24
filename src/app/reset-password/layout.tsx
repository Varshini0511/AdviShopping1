// Route-level metadata for the (client-component) reset-password page.

import type { Metadata } from 'next';
import type { PropsWithChildren } from 'react';

export const metadata: Metadata = {
  title: 'Reset password',
  // A one-time-link landing page: nothing worth indexing.
  robots: { index: false, follow: false },
};

export default function ResetPasswordLayout({ children }: PropsWithChildren) {
  return children;
}
