import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

(async function(){
  try {
    const { data, error } = await supabase
      .from('admins')
      .select('id,user_id,is_admin,created_at');
    if (error) {
      console.error('Error fetching admins:', error);
      process.exit(1);
    }
    console.log('admins rows:', data);

    const { data: users, error: usersErr } = await supabase
      .from('auth.users')
      .select('id,email')
      .limit(10);
    if (usersErr) {
      console.error('Error fetching auth.users:', usersErr);
    } else {
      console.log('sample auth.users:', users.slice(0,10));
    }
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
})();
