// src/components/Navbar.tsx
'use client';

import { CartContext } from '@/context/CartContext';
import Link from 'next/link';
import { useContext, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { FiCamera, FiFileText, FiMenu, FiSearch, FiShoppingCart, FiX } from 'react-icons/fi';

const NAV_LINKS = [
  { href: '/', label: 'Home' },
  { href: '/category/electronics', label: 'Electronics' },
  { href: '/category/dress', label: 'Dress' },
  { href: '/category/books', label: 'Books' },
  { href: '/category/accessories', label: 'Accessories' },
];

export default function Navbar() {
  const { getCartItemCount } = useContext(CartContext);
  const itemCount = getCartItemCount();
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [user, setUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    getUser();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      router.refresh();
    });

    return () => subscription.unsubscribe();
  }, [supabase, router]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setMenuOpen(false);
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      setMenuOpen(false);
      router.push(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
    }
  };

  const linkClass = 'whitespace-nowrap text-sm font-medium text-slate-300 transition hover:text-white';

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
      {/* Phones: logo + cart + auth + menu on row 1, full-width search on row 2.
          md and up: a single row. */}
      <nav className="container mx-auto flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-3 md:flex-nowrap md:gap-5">
        {/* Wordmark */}
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">A</span>
          <span>
            Advi<span className="text-indigo-400">Shopping</span>
          </span>
        </Link>

        {/* Desktop links */}
        <div className="hidden items-center gap-5 lg:flex">
          {NAV_LINKS.map((link) => (
            <Link key={link.href} href={link.href} className={linkClass}>
              {link.label}
            </Link>
          ))}
          <Link href="/visual-search" className={`${linkClass} inline-flex items-center gap-1.5`}>
            <FiCamera aria-hidden /> Visual search
          </Link>
          <Link href="/extract" className={`${linkClass} inline-flex items-center gap-1.5`}>
            <FiFileText aria-hidden /> Documents
          </Link>
        </div>

        {/* Search */}
        <form
          onSubmit={handleSearch}
          role="search"
          className="order-last flex basis-full md:order-none md:ml-auto md:max-w-xs md:flex-1 md:basis-auto"
        >
          <div className="flex w-full items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-4 py-2 transition focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/30">
            <FiSearch className="shrink-0 text-slate-500" aria-hidden />
            <input
              type="search"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Try “device to call someone”"
              aria-label="Search products"
              className="w-full bg-transparent text-base text-slate-100 placeholder-slate-500 focus:outline-none sm:text-sm"
            />
          </div>
        </form>

        {/* Cart */}
        <Link
          href="/cart"
          className="relative ml-auto shrink-0 text-slate-300 transition hover:text-indigo-400 md:ml-0"
          aria-label={`Cart${itemCount > 0 ? `, ${itemCount} items` : ''}`}
        >
          <FiShoppingCart className="text-2xl" />
          {itemCount > 0 && (
            <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">
              {itemCount}
            </span>
          )}
        </Link>

        {/* Auth */}
        {user ? (
          <button
            onClick={handleLogout}
            className="shrink-0 rounded-full border border-slate-700 px-4 py-1.5 text-sm font-medium text-slate-200 transition hover:bg-slate-800"
          >
            Logout
          </button>
        ) : (
          <>
            <Link
              href="/login?mode=signup"
              className="hidden shrink-0 text-sm font-medium text-slate-300 transition hover:text-white sm:inline"
            >
              Sign up
            </Link>
            <Link
              href="/login"
              className="shrink-0 rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
            >
              Login
            </Link>
          </>
        )}

        {/* Mobile menu toggle */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          className="shrink-0 rounded-lg p-1.5 text-2xl text-slate-300 transition hover:bg-slate-800 hover:text-white lg:hidden"
          aria-label={menuOpen ? 'Close menu' : 'Open menu'}
          aria-expanded={menuOpen}
          aria-controls="mobile-menu"
        >
          {menuOpen ? <FiX /> : <FiMenu />}
        </button>
      </nav>

      {/* Mobile menu panel */}
      {menuOpen && (
        <div id="mobile-menu" className="border-t border-slate-800 bg-slate-900 lg:hidden">
          <div className="container mx-auto flex flex-col px-4 py-2">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMenuOpen(false)}
                className="rounded-lg px-2 py-3 text-base font-medium text-slate-200 hover:bg-slate-800"
              >
                {link.label}
              </Link>
            ))}
            <Link
              href="/visual-search"
              onClick={() => setMenuOpen(false)}
              className="inline-flex items-center gap-2 rounded-lg px-2 py-3 text-base font-medium text-slate-200 hover:bg-slate-800"
            >
              <FiCamera aria-hidden /> Visual search
            </Link>
            <Link
              href="/extract"
              onClick={() => setMenuOpen(false)}
              className="inline-flex items-center gap-2 rounded-lg px-2 py-3 text-base font-medium text-slate-200 hover:bg-slate-800"
            >
              <FiFileText aria-hidden /> Documents
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}
