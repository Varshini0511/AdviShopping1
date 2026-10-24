// src/app/visual-search/page.tsx
//
// A server component so the DISABLE_VISUAL_SEARCH flag is read on every request
// (it is a deployment setting) and passed to the interactive UI.

import VisualSearch from '@/components/VisualSearch';

export const dynamic = 'force-dynamic';

export default function VisualSearchPage() {
  return <VisualSearch disabled={process.env.DISABLE_VISUAL_SEARCH === 'true'} />;
}
