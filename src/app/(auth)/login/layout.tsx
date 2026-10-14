// Route-level metadata for the (client-component) login page.

import type { Metadata } from 'next';
import type { PropsWithChildren } from 'react';

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to use the AdviShopping cart and shopping agent, or try the shared demo account.',
};

export default function LoginLayout({ children }: PropsWithChildren) {
  return children;
}
