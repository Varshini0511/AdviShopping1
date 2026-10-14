// scripts/create-demo-user.mjs
//
// Creates (or updates the password of) the shared demo account that the
// "Try the demo" button on /login signs in with.
//
// Reads from .env.local:
//   NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY
//   NEXT_PUBLIC_DEMO_EMAIL,   NEXT_PUBLIC_DEMO_PASSWORD
//
// Safe to re-run. Uses the service-role key (admin API), so run it locally —
// never ship that key to the browser.
//
//   node scripts/create-demo-user.mjs

import { config } from 'dotenv';
import { createClient } from '@supabase/supabase-js';

config({ path: '.env.local' });

const { NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY, NEXT_PUBLIC_DEMO_EMAIL, NEXT_PUBLIC_DEMO_PASSWORD } =
  process.env;

if (!NEXT_PUBLIC_SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_KEY in .env.local');
  process.exit(1);
}
if (!NEXT_PUBLIC_DEMO_EMAIL || !NEXT_PUBLIC_DEMO_PASSWORD) {
  console.error('Set NEXT_PUBLIC_DEMO_EMAIL and NEXT_PUBLIC_DEMO_PASSWORD in .env.local first.');
  process.exit(1);
}

const admin = createClient(NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Find an existing user by email (listUsers is paginated).
async function findUser(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw error;
    const hit = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (hit) return hit;
    if (data.users.length < 200) return null;
  }
  return null;
}

const existing = await findUser(NEXT_PUBLIC_DEMO_EMAIL);

if (existing) {
  const { error } = await admin.auth.admin.updateUserById(existing.id, {
    password: NEXT_PUBLIC_DEMO_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  console.log(`Updated existing demo user ${NEXT_PUBLIC_DEMO_EMAIL}`);
} else {
  const { error } = await admin.auth.admin.createUser({
    email: NEXT_PUBLIC_DEMO_EMAIL,
    password: NEXT_PUBLIC_DEMO_PASSWORD,
    email_confirm: true, // skip the confirmation email
  });
  if (error) throw error;
  console.log(`Created demo user ${NEXT_PUBLIC_DEMO_EMAIL}`);
}
