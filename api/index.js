import express from 'express';
import cors from 'cors';
import path from 'path';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const supabaseUrl = process.env.SUPABASE_URL?.trim();
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
const adminTokens = new Map();

if (!supabaseUrl || !supabaseKey) {
  console.warn('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are not configured');
}

const supabase = supabaseUrl && supabaseKey
  ? createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } })
  : null;

app.use(cors());
app.use(express.json());

const requireAdmin = async (req, res, next) => {
  const authHeader = String(req.headers.authorization ?? '');
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const storedEmail = adminTokens.get(token);
  if (storedEmail) {
    req.adminUser = { id: `admin:${storedEmail}`, email: storedEmail };
    return next();
  }

  return res.status(401).json({ error: 'Unauthorized' });
};

app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

app.get('/scan', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/scan.html'));
});

app.post('/api/admin/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  if (!supabase) {
    return res.status(500).json({ error: 'Supabase is not configured' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedPassword = String(password).trim();

  const { data: adminRow, error: adminError } = await supabase
    .from('admin')
    .select('email, password')
    .eq('email', normalizedEmail)
    .maybeSingle();

  if (adminError) {
    return res.status(500).json({ error: 'Internal server error' });
  }

  if (!adminRow || adminRow.password !== normalizedPassword) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const accessToken = randomUUID();
  adminTokens.set(accessToken, normalizedEmail);
  return res.json({ access_token: accessToken });
});

app.get('/api/admin/sessions', requireAdmin, async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase is not configured' });
  }

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(100);

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

app.get('/api/admin/session/:id/attendance', requireAdmin, async (req, res) => {
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase is not configured' });
  }

  const { data, error } = await supabase
    .from('attendance_records')
    .select('*')
    .eq('session_id', req.params.id)
    .order('timestamp', { ascending: false });

  if (error) {
    return res.status(500).json({ error: error.message });
  }

  res.json(data);
});

app.post('/api/submit-attendance', async (req, res) => {
  const { token, full_name, state_code, phone, lat, long } = req.body;
  if (!supabase) {
    return res.status(500).json({ error: 'Supabase is not configured' });
  }

  const sessionId = extractSessionId(String(token ?? ''));
  if (!sessionId || !full_name || !state_code) {
    return res.status(400).json({ error: 'Missing attendance fields' });
  }

  const { data: session, error: sessionError } = await supabase
    .from('sessions')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (sessionError || !session) {
    return res.status(400).json({ error: 'Invalid session ID' });
  }

  const ipAddress = extractIp(req);
  const { data: ipRecord, error: ipError } = await supabase
    .from('attendance_records')
    .select('id')
    .eq('session_id', sessionId)
    .eq('status', 'verified')
    .eq('ip_address', ipAddress)
    .limit(1)
    .maybeSingle();

  if (ipError) {
    return res.status(500).json({ error: ipError.message });
  }

  if (ipRecord) {
    return res.json({ status: 'rejected', message: 'This device already checked in', reason: 'device' });
  }

  const { data: stateRecord, error: stateError } = await supabase
    .from('attendance_records')
    .select('id')
    .eq('session_id', sessionId)
    .eq('status', 'verified')
    .eq('state_code', state_code)
    .limit(1)
    .maybeSingle();

  if (stateError) {
    return res.status(500).json({ error: stateError.message });
  }

  if (stateRecord) {
    return res.json({ status: 'rejected', message: 'This state code already checked in', reason: 'state' });
  }

  if (lat == null || long == null) {
    return res.json({ status: 'flagged', message: 'Location unavailable', reason: 'location' });
  }

  const distance = calculateDistanceMeters(session.venue_lat, session.venue_long, Number(lat), Number(long));
  const status = distance <= session.radius_meters ? 'verified' : 'flagged';
  const message = status === 'verified' ? 'Check-in successful' : 'Location is outside the allowed radius and has been flagged.';
  return res.json({ status, message, reason: status === 'verified' ? 'success' : 'location' });
});

function extractSessionId(token) {
  try {
    const url = new URL(token);
    const sessionId = url.searchParams.get('sessionId');
    if (sessionId) {
      return sessionId;
    }
  } catch {
    // ignore invalid URL
  }

  const match = token.match(/[?&]sessionId=([^&]+)/);
  if (match) {
    return decodeURIComponent(match[1]);
  }

  return token.trim();
}

function extractIp(req) {
  const header = req.headers['x-forwarded-for'];
  if (typeof header === 'string') {
    return header.split(',')[0].trim();
  }
  if (Array.isArray(header) && header.length > 0) {
    return String(header[0]).split(',')[0].trim();
  }
  return req.socket.remoteAddress || 'unknown';
}

function calculateDistanceMeters(lat1, lon1, lat2, lon2) {
  const toRad = (value) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return 6371000 * c;
}

export default app;
