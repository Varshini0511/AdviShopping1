// Route-level metadata for the (client-component) Document AI page.

import type { Metadata } from 'next';
import type { PropsWithChildren } from 'react';

export const metadata: Metadata = {
  title: 'Document AI',
  description:
    'Extract structured data from invoices, receipts and product datasheets with a vision-capable model, schema validation and arithmetic cross-checks.',
};

export default function ExtractLayout({ children }: PropsWithChildren) {
  return children;
}
