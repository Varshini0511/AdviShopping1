// src/components/Navbar.tsx
'use client';

import { CartContext } from '@/context/CartContext';
import Link from 'next/link';
import { useContext, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
import { FiSearch, FiShoppingCart } from 'react-icons/fi';

export default function Navbar() {
  const { getCartItemCount } = useContext(CartContext);
  const itemCount = getCartItemCount();
  const router = useRouter();
  const supabase = createClientComponentClient();
  const [user, setUser] = useState<User | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/category/electronics', label: 'Electronics' },
    { href: '/category/dress', label: 'Dress' },
    { href: '/category/books', label: 'Books' },
    { href: '/category/accessories', label: 'Accessories' },
  ];

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
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
    }
  };

  return (
    <header className="sticky top-0 z-50 border-b border-slate-800 bg-slate-900/80 backdrop-blur">
      <nav className="container mx-auto flex items-center gap-3 px-4 py-3 md:gap-5">
        {/* Wordmark */}
        <Link href="/" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-white">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">A</span>
          <span className="hidden sm:inline">Advi<span className="text-indigo-400">Shopping</span></span>
        </Link>

        {/* Nav links */}
        <div className="hidden items-center gap-5 lg:flex">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm font-medium text-slate-300 transition hover:text-white"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={handleSearch} className="ml-auto flex w-full max-w-xs flex-1">
          <div className="flex w-full items-center gap-2 rounded-full border border-slate-700 bg-slate-800 px-4 py-2 transition focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-500/30">
            <FiSearch className="shrink-0 text-slate-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search products..."
              className="w-full bg-transparent text-sm text-slate-100 placeholder-slate-500 focus:outline-none"
            />
          </div>
        </form>

        {/* Cart */}
        <Link href="/cart" className="relative shrink-0 text-slate-300 transition hover:text-indigo-400">
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
          <Link
            href="/login"
            className="shrink-0 rounded-full bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Login
          </Link>
        )}
      </nav>
    </header>
  );
}
