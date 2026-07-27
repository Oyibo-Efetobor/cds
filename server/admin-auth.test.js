import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveAdminAccess } from './admin-auth.js';

test('allows env password login without a Supabase admin row', () => {
  const result = resolveAdminAccess({
    providedPassword: 'supersecret',
    adminPassword: 'supersecret',
    user: null,
    adminRow: null,
  });

  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'env-password');
});

test('allows Supabase admin row login', () => {
  const result = resolveAdminAccess({
    providedPassword: 'wrong',
    adminPassword: 'supersecret',
    user: { id: 'user-123' },
    adminRow: [{ id: 'row-1' }],
  });

  assert.equal(result.allowed, true);
  assert.equal(result.reason, 'admin-row');
});

test('rejects access when neither env password nor admin row is present', () => {
  const result = resolveAdminAccess({
    providedPassword: 'wrong',
    adminPassword: 'supersecret',
    user: { id: 'user-123' },
    adminRow: [],
  });

  assert.equal(result.allowed, false);
  assert.equal(result.reason, 'missing-admin-access');
});
