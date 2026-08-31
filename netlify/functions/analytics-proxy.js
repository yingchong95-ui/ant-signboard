// Netlify Function: analytics-proxy
// Server-side proxy to Google Apps Script — avoids browser CORS restrictions.
//
// ── Access control ────────────────────────────────────────────────────
// The caller must present a valid Firebase ID token belonging to one of the
// admin accounts. We verify the token server-side against Google's Identity
// Toolkit, so a forged or expired token is rejected here — nothing sensitive
// lives in the client, and there is no shared password to leak.
//
// Env vars (Netlify → Site settings → Environment variables):
//   ADMIN_EMAILS   comma-separated allow-list, e.g.
//                  antsign.shop@gmail.com,yingchong95@gmail.com
//   FIREBASE_API_KEY  (optional) Firebase Web API key. Falls back to the
//                  public web key below, which is safe to expose by design.
// ──────────────────────────────────────────────────────────────────────

const SHEETS_URL   = 'https://script.google.com/macros/s/AKfycbzdf3SsRgKQ3ljq-lcg2tG-29XTIfTyiNLVa8FSOv_tthCNAcT1xidSPmgU8HZcgDI/exec';
const ALLOW_ORIGIN = 'https://shop.jbsignboard.com';

// Firebase Web API keys are public identifiers, not secrets.
const FIREBASE_API_KEY = process.env.FIREBASE_API_KEY
  || 'AIzaSyD787ofMHEFjr6D_W1PsMjBV2SPP7qycX4';

function adminEmails() {
  return (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
}

function baseHeaders(origin) {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin === ALLOW_ORIGIN ? origin : ALLOW_ORIGIN,
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
  };
}

/** Verify a Firebase ID token and return its email, or null if invalid. */
async function verifyIdToken(idToken) {
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;               // expired / malformed / wrong project
    const data = await res.json();
    const user = data.users && data.users[0];
    if (!user || !user.email) return null;
    return String(user.email).toLowerCase();
  } catch (e) {
    return null;
  }
}

exports.handler = async (event) => {
  const origin  = (event.headers && (event.headers.origin || event.headers.Origin)) || '';
  const headers = baseHeaders(origin);

  // CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers, body: JSON.stringify({ ok: false, error: 'Method not allowed' }) };
  }

  // ── 1. Require a bearer token ──────────────────────────────────────
  const authHeader = (event.headers &&
    (event.headers.authorization || event.headers.Authorization)) || '';
  const idToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!idToken) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ ok: false, error: 'Sign-in required.' }),
    };
  }

  // ── 2. Verify it and check the allow-list ──────────────────────────
  const email = await verifyIdToken(idToken);
  if (!email) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ ok: false, error: 'Session expired. Please sign in again.' }),
    };
  }

  const allowed = adminEmails();
  if (allowed.length === 0) {
    // Fail closed rather than silently serving data to everyone.
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        ok: false,
        error: 'Server not configured: ADMIN_EMAILS environment variable is missing.',
      }),
    };
  }
  if (!allowed.includes(email)) {
    return {
      statusCode: 403,
      headers,
      body: JSON.stringify({ ok: false, error: 'This account is not authorised.' }),
    };
  }

  // ── 3. Authorised — fetch the sheet ────────────────────────────────
  try {
    const res  = await fetch(SHEETS_URL + '?action=getOrders', {
      method: 'GET',
      redirect: 'follow',
      headers: { Accept: 'application/json' },
    });
    const text = await res.text();

    if (text.trim().startsWith('<')) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Apps Script returned HTML instead of JSON. The doGet() function is missing or not yet deployed.',
        }),
      };
    }

    let json;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: false, error: 'Invalid JSON from Apps Script: ' + text.slice(0, 200) }),
      };
    }

    return { statusCode: 200, headers, body: JSON.stringify(json) };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: String(err) }),
    };
  }
};
