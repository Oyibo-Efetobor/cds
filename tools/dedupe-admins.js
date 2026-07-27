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
    console.log('Fetching admins rows...');
    const { data, error } = await supabase
      .from('admins')
      .select('id,user_id,created_at')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching admins:', error);
      process.exit(1);
    }

    const map = new Map();
    for (const row of data || []) {
      const arr = map.get(row.user_id) || [];
      arr.push(row);
      map.set(row.user_id, arr);
    }

    const toDelete = [];
    for (const [user_id, rows] of map.entries()) {
      if (rows.length > 1) {
        // keep the earliest (rows are ordered by created_at asc)
        const keep = rows[0];
        const extras = rows.slice(1);
        console.log(`User ${user_id} has ${rows.length} rows, keeping ${keep.id}, deleting ${extras.map(r=>r.id).join(',')}`);
        toDelete.push(...extras.map(r => r.id));
      }
    }

    if (toDelete.length === 0) {
      console.log('No duplicate admins found.');
      process.exit(0);
    }

    console.log('Deleting duplicate admin rows:', toDelete.join(', '));
    const { error: delErr } = await supabase
      .from('admins')
      .delete()
      .in('id', toDelete);

    if (delErr) {
      console.error('Error deleting duplicates:', delErr);
      process.exit(1);
    }

    console.log('Deleted duplicates successfully.');

    // report remaining rows
    const { data: remaining } = await supabase.from('admins').select('id,user_id,created_at').order('created_at', { ascending: true });
    console.log('Remaining admins rows:', remaining);
    process.exit(0);
  } catch (err) {
    console.error('Unexpected error:', err);
    process.exit(1);
  }
})();
