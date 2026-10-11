// GlitchTip v6.2.6 issue API: GET/PUT /api/0/issues/{id}/.
// Credentials and exact provider origin are supplied by the server owner.
export function glitchtipApi({ origin, token }, request = fetch) {
  const base = new URL(origin);
  if (base.protocol !== 'https:' || base.origin !== origin || base.username || base.password || typeof token !== 'string' || !token) {
    throw new Error('Exact HTTPS provider origin and credential required');
  }
  const call = async (id, method, body) => {
    if (typeof id !== 'string' || !/^[1-9][0-9]{0,19}$/.test(id)) throw new Error('Invalid issue ID');
    const response = await request(`${origin}/api/0/issues/${id}/`, {
      method,
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
      redirect: 'error',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) throw new Error('GlitchTip request failed');
    return response.json();
  };
  return {
    readIssue: id => call(id, 'GET'),
    resolveIssue: id => call(id, 'PUT', { status: 'resolved' }),
  };
}
