// Netlify Function: analytics-proxy
// Proxies requests to Google Apps Script to avoid CORS issues

exports.handler = async (event) => {
  const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbxjwqhvhO4HmdKIz8Dg2xbpnyZXKRnnVyWZ6bQ30-6xoon5sq-0ZGq2RNSRX0uQ4d0/exec';

  try {
    const res = await fetch(SHEETS_URL + '?action=getOrders', {
      method: 'GET',
      redirect: 'follow',
    });

    if (!res.ok) {
      return {
        statusCode: res.status,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ ok: false, error: 'Upstream HTTP ' + res.status }),
      };
    }

    const text = await res.text();

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'no-store',
      },
      body: text,
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ ok: false, error: String(err) }),
    };
  }
};
