// app/layout.tsx

import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import Link from 'next/link';
import './globals.css';
import { CartProvider } from '@/context/CartContext';
import Navbar from '@/components/Navbar';
import ChatWidget from '@/components/ChatWidget';
import { PropsWithChildren } from 'react';
const inter = Inter({ subsets: ['latin'] });

// Absolute base URL so Open Graph / Twitter preview images resolve to a full
// URL when the link is shared (LinkedIn needs this). Set NEXT_PUBLIC_SITE_URL
// to override; Render injects RENDER_EXTERNAL_URL automatically.
function resolveSiteUrl(): URL {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:3000';
  try {
    return new URL(raw.startsWith('http') ? raw : `https://${raw}`);
  } catch {
    return new URL('http://localhost:3000');
  }
}

const TITLE = 'AdviShopping — AI search & shopping agent';
const DESCRIPTION =
  'Full-stack demo of hybrid search (keyword + semantic + rerank), a tool-calling shopping agent with a grounding guardrail, and CLIP visual search. Next.js, Supabase pgvector, Groq.';

export const metadata: Metadata = {
  metadataBase: resolveSiteUrl(),
  title: { default: TITLE, template: '%s · AdviShopping' },
  description: DESCRIPTION,
  openGraph: {
    type: 'website',
    siteName: 'AdviShopping',
    title: TITLE,
    description: DESCRIPTION,
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#070b14',
};

export default function RootLayout({ children }: PropsWithChildren) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <CartProvider>
          <Navbar />
          <main className="min-h-[calc(100vh-8rem)]">{children}</main>
          <footer className="mt-12 border-t border-slate-800 bg-slate-900">
            <div className="container mx-auto flex flex-col items-center gap-1 px-4 py-6 text-center text-sm text-slate-400 sm:flex-row sm:justify-between sm:text-left">
              <span>© 2026 AdviShopping · Portfolio demo — no real orders or payments</span>
              <span>
                <a
                  href="https://github.com/Varshini0511/AdviShopping1"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-slate-300 underline-offset-4 hover:text-white hover:underline"
                >
                  Source on GitHub
                </a>
                <span className="mx-2 text-slate-600">·</span>
                <Link href="/visual-search" className="text-slate-300 underline-offset-4 hover:text-white hover:underline">
                  Visual search
                </Link>
              </span>
            </div>
          </footer>
          <ChatWidget />
        </CartProvider>
      </body>
    </html>
  );
}
