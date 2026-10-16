// app/(auth)/callback/route.ts
//
// Landing point for the link in Supabase's confirmation email
// (emailRedirectTo = <origin>/callback). Supabase verifies the token FIRST and
// only then redirects here, so by the time we run the email is already
// confirmed — or the link was bad and we got an error instead.

import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

import type { NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const errorCode =
    requestUrl.searchParams.get('error_code') || requestUrl.searchParams.get('error');

  const toLogin = (key: string, value: string) => {
    const url = new URL('/login', requestUrl.origin);
    url.searchParams.set(key, value);
    return NextResponse.redirect(url);
  };

  // The link was invalid, expired, or already used (e.g. an older email after a
  // resend). Previously this was swallowed and the user landed on the home page
  // as if it had worked, then couldn't sign in.
  if (errorCode) return toLogin('authError', errorCode);

  if (code) {
    const supabase = createRouteHandlerClient({ cookies });
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    // The email IS confirmed at this point, but this browser can't finish the
    // session (typically the link was opened on another device/browser than the
    // one that signed up, so the PKCE verifier isn't here). Just ask them to
    // sign in.
    if (error) return toLogin('confirmed', '1');
  }

  // Signed in (or nothing to do) — go home.
  return NextResponse.redirect(requestUrl.origin);
}
