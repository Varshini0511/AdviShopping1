// Route-level metadata for the (client-component) visual search page.

import type { Metadata } from 'next';
import type { PropsWithChildren } from 'react';

export const metadata: Metadata = {
  title: 'Visual search',
  description: 'Upload a photo and find visually similar products using CLIP image embeddings.',
};

export default function VisualSearchLayout({ children }: PropsWithChildren) {
  return children;
}
