// src/components/Navbar.tsx
'use client';

import { CartContext } from '@/context/CartContext';
import Link from 'next/link';
import Image from 'next/image';
import { useContext, useEffect, useState } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import { useRouter } from 'next/navigation';
import type { User } from '@supabase/supabase-js';
//import NavLinks from './NavLinks'; // Assuming NavLinks is in the same folder
import { FiSearch } from 'react-icons/fi'; // Assuming you use this icon

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
    { href: '/category/accessories', label: 'Accessories' }   
    
  ];

  // --- THIS useEffect IS NOW CORRECTED ---
  useEffect(() => {
    // Function to fetch the initial user
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      setUser(user);
    };
    
    // Fetch the user when the component mounts
    getUser();

    // Set up a listener for authentication state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      // You can also refresh the router if needed, especially on sign-out
      router.refresh();
    });

    // Cleanup the subscription when the component unmounts
    return () => {
      subscription.unsubscribe();
    };
  }, [supabase, router]);


  const handleLogout = async () => {
    await supabase.auth.signOut();
    // The onAuthStateChange listener will handle the rest
  };

  const handleSearch = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchTerm.trim())}`);
    }
  };

  return (
    <nav className="bg-gray-800 text-white p-4">
      <div className="container mx-auto flex justify-between items-center gap-4">
        {/* Your Logo */}
        <Link href="/">
          <Image
            src="https://lhwuknhgjmthkmxblpph.supabase.co/storage/v1/object/public/productimages/Advik.png"
            alt="Advi Logo"
            width={120}
            height={40}
            priority
          />
        </Link>

        {/* Your NavLinks component or hardcoded links */}
   <div className="hidden md:flex gap-6 items-center">
          {navLinks.map((link) => (
            <Link key={link.href} href={link.href} className="hover:underline">
              {link.label}
            </Link>
          ))}
        </div>

        {/* Your Search Form */}
        <form onSubmit={handleSearch} className="flex items-center border-2 border-gray-600 rounded-lg bg-gray-700">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search products..."
            className="bg-transparent px-4 py-1 text-white focus:outline-none w-48"
          />
          <button type="submit" className="px-3 text-xl hover:text-gray-300">
            <FiSearch />
          </button>
        </form>
        
        <div className="flex items-center space-x-6">
          <Link href="/cart" className="relative">
            Cart
            {itemCount > 0 && (
              <span className="absolute -top-2 -right-4 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                {itemCount}
              </span>
            )}
          </Link>
          {user ? (
            <button onClick={handleLogout} className="hover:underline">Logout</button>
          ) : (
            <Link href="/login" className="hover:underline">Login</Link>
          )}
        </div>
      </div>
    </nav>
  );
}