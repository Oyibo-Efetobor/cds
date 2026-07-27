export function resolveAdminAccess({ providedPassword, adminPassword, user, adminRow }) {
  const normalizedPassword = String(providedPassword ?? '').trim();
  const normalizedAdminPassword = String(adminPassword ?? '').trim();

  if (normalizedAdminPassword && normalizedPassword && normalizedPassword === normalizedAdminPassword) {
    return { allowed: true, reason: 'env-password' };
  }

  const hasAdminRow = Array.isArray(adminRow) ? adminRow.length > 0 : Boolean(adminRow);
  if (user && hasAdminRow) {
    return { allowed: true, reason: 'admin-row' };
  }

  return { allowed: false, reason: 'missing-admin-access' };
}
