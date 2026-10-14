// Route-level metadata for the (client-component) cart page.

import type { Metadata } from 'next';
import type { PropsWithChildren } from 'react';

export const metadata: Metadata = { title: 'Your cart' };

export default function CartLayout({ children }: PropsWithChildren) {
  return children;
}
