// context/CartContext.tsx
'use client';

import { createContext, useState, useEffect, ReactNode } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';

// --- Define the correct, nested types for your data ---
type Product = {
  id: number;
  name: string;
};
type ProductVariant = {
  id: number;
  price: number;
  color: string;
  size: string;
  image_url: string;
  products: Product;
};
export type CartItem ={
  id: number; // This is the id from the cart_items table
  quantity: number;
  product_variants: ProductVariant;
}
export type AddToCartResult = 'added' | 'login_required' | 'error';
// --- End of Types ---

type CartContextType ={
  cart: CartItem[];
  loading: boolean;
  addToCart: (variantId: number, productId: number) => Promise<AddToCartResult>;
  removeFromCart: (cartItemId: number) => Promise<void>;
  increaseQuantity: (cartItemId: number) => Promise<void>;
  decreaseQuantity: (cartItemId: number) => Promise<void>;
  getCartTotal: () => number;
  getCartItemCount: () => number;
}

export const CartContext = createContext<CartContextType>({
  cart: [],
  loading: true,
  addToCart: async () => 'error',
  removeFromCart: async () => {},
  increaseQuantity: async () => {},
  decreaseQuantity: async () => {},
  getCartTotal: () => 0,
  getCartItemCount: () => 0,
});

export function CartProvider({ children }: { children: ReactNode }) {
  const supabase = createClientComponentClient();
  const [cart, setCart] = useState<CartItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCart = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setCart([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    // CORRECTED QUERY: Fetches cart_items, their variants, and the base product info
    const { data, error } = await supabase
      .from('cart_items')
      .select('id, quantity, product_variants(*, products(*))')
      .eq('user_id', user.id)
      .returns<CartItem[]>();

    if (error) {
      console.error('Error fetching cart:', error);
    } else {
      setCart(data || []);
        
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchCart();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
        fetchCart();
      }
    });
    return () => subscription.unsubscribe();
  }, [supabase]);

  // CORRECTED FUNCTION: Takes a variantId and quantity
  // Reports what actually happened so the caller can show a truthful message
  // (previously a failed/logged-out add still looked like a success).
  const addToCart = async (variantId: number, productId: number): Promise<AddToCartResult> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return 'login_required';

    const { data: existingItem } = await supabase
      .from('cart_items')
      .select('id, quantity')
      .eq('user_id', user.id)
      .eq('product_id', productId) // Ensure we check by product_id as well
      .eq('product_variant_id', variantId) // Use the correct column name
      .single();

    if (existingItem) {
      const { error } = await supabase
        .from('cart_items')
        .update({ quantity: existingItem.quantity + 1 })
        .match({ id: existingItem.id });
      if (error) {
        console.error('Error updating cart:', error);
        return 'error';
      }
    } else {
      const { error } = await supabase
        .from('cart_items')
        .insert({ user_id: user.id, product_variant_id: variantId, product_id:productId, quantity:1 }); // Use the correct column name
      if (error) {
        console.error('Error inserting into cart:', error);
        return 'error';
      }
    }
    await fetchCart();
    return 'added';
  };
  
  const removeFromCart = async (cartItemId: number) => {
    const { error } = await supabase
      .from('cart_items')
      .delete()
      .match({ id: cartItemId });
    if (error) console.error('Error removing from cart:', error);
    else await fetchCart();
  };
  
  const increaseQuantity = async (cartItemId: number) => {
    const item = cart.find(item => item.id === cartItemId);
    if (!item) return;
    const { error } = await supabase
      .from('cart_items')
      .update({ quantity: item.quantity + 1 })
      .match({ id: cartItemId });
    if (error) console.error('Error increasing quantity:', error);
    else await fetchCart();
  };

  const decreaseQuantity = async (cartItemId: number) => {
    const item = cart.find(item => item.id === cartItemId);
    if (!item) return;
    if (item.quantity > 1) {
      const { error } = await supabase
        .from('cart_items')
        .update({ quantity: item.quantity - 1 })
        .match({ id: cartItemId });
      if (error) console.error('Error decreasing quantity:', error);
      else await fetchCart();
    } else {
      await removeFromCart(cartItemId);
    }
  };

  const getCartItemCount = () => {
    return cart.reduce((total, item) => total + item.quantity, 0);
  };

  const getCartTotal = () => {
    return cart.reduce((total, item) => {
      // CORRECTED PATH: Accesses price through the nested variant object
      if (item.product_variants && item.product_variants.price) {
        return total + item.product_variants.price * item.quantity;
      }
      return total;
    }, 0);
  };

  return (
    <CartContext value={{ cart, loading, addToCart, removeFromCart, increaseQuantity, decreaseQuantity, getCartTotal, getCartItemCount }}>
      {children}
    </CartContext>
  );
}