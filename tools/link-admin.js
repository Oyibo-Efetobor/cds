import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const [,, uid] = process.argv;
if (!uid) {
  console.error('Usage: node tools/link-admin.js <user_id>');
  process.exit(1);
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

async function run() {
  try {
    console.log('Inserting admin row for', uid);
    const { data, error } = await supabase
      .from('admins')
      .insert({ user_id: uid, is_admin: true })
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('Insert error:', error.message || error);
      process.exit(1);
    }

    console.log('Inserted admin row:', data);
    process.exit(0);
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
}

run();
