// test-supabase.js

// This line loads your .env.local variables
require('dotenv').config({ path: './.env.local' });

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Check if the variables were loaded
if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Make sure you have created a .env.local file with your Supabase URL and Key.');
  return;
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function getProducts() {
  console.log('Attempting to fetch products...');

  const { data, error } = await supabase.from('products').select('*');

  if (error) {
    console.error('--- TEST FAILED ---');
    console.error('Error object:', error);
  } else {
    console.log('--- TEST SUCCEEDED ---');
    console.log('Data:', data);
  }
}

getProducts();