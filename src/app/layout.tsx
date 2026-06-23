// app/layout.tsx

import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { CartProvider } from '@/context/CartContext';
import Navbar from '@/components/Navbar'; // We will create this next
//import { Lora } from 'next/font/google'; 
import { PropsWithChildren } from 'react';
const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Next.js Supabase Shop',
  description: 'A simple shopping app',
};

export default function RootLayout({
  children,
}: PropsWithChildren) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <CartProvider>
          <Navbar />
          <main className="min-h-[calc(100vh-8rem)]">{children}</main>
          <footer className="mt-12 border-t border-slate-800 bg-slate-900">
            <div className="container mx-auto px-4 py-6 text-center text-sm text-slate-400">
              © 2026 AdviShopping · Built with Next.js + Supabase
            </div>
          </footer>
        </CartProvider>
      </body>
    </html>
  );
}