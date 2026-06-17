// Netlify Function: analytics-proxy
// Server-side proxy to Google Apps Script — avoids browser CORS restrictions

exports.handler = async (event) => {
  const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbxjwqhvhO4HmdKIz8Dg2xbpnyZXKRnnVyWZ6bQ30-6xoon5sq-0ZGq2RNSRX0uQ4d0/exec';

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-store',
  };

  try {
    const res = await fetch(SHEETS_URL + '?action=getOrders', {
      method: 'GET',
      redirect: 'follow',
      headers: { 'Accept': 'application/json' },
    });

    const text = await res.text();

    // If the response is HTML, Google likely returned an error page
    // This means doGet() is missing or not deployed yet
    if (text.trim().startsWith('<')) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: false,
          error: 'Apps Script returned HTML instead of JSON. This means the doGet() function is missing or not yet deployed. Please add doGet() to your Apps Script and redeploy with a New Version.',
        }),
      };
    }

    // Try to parse as JSON
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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(json),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: String(err) }),
    };
  }
};
