// Netlify Function: warranty-sync
// Called when admin marks a job as "jobdone" = done
// Writes warranty record to Google Sheets "Warranty" tab via Apps Script

exports.handler = async (event) => {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const SHEETS_URL = 'https://script.google.com/macros/s/AKfycbzdf3SsRgKQ3ljq-lcg2tG-29XTIfTyiNLVa8FSOv_tthCNAcT1xidSPmgU8HZcgDI/exec';

  try {
    const body = JSON.parse(event.body || '{}');
    const { orderId, customer, signName, installDate, desc, phone } = body;

    if (!orderId || !installDate) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ ok: false, error: 'orderId and installDate are required' }),
      };
    }

    // Calculate warranty expiry dates
    function addMonths(dateStr, months) {
      const d = new Date(dateStr);
      d.setMonth(d.getMonth() + months);
      return d.toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    const payload = {
      action:      'logWarranty',
      orderId,
      customer:    customer || '',
      signName:    signName || '',
      phone:       phone || '',
      desc:        desc || '',
      installDate: new Date(installDate).toLocaleDateString('en-MY', { day: '2-digit', month: 'short', year: 'numeric' }),
      colourExpiry:      addMonths(installDate, 12),
      ledExpiry:         addMonths(installDate, 12),
      transformerExpiry: addMonths(installDate, 6),
      updatedAt: new Date().toISOString(),
    };

    // POST to Google Apps Script
    const res = await fetch(SHEETS_URL, {
      method: 'POST',
      redirect: 'follow',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const text = await res.text();

    let json;
    try { json = JSON.parse(text); } catch (e) { json = { ok: true, raw: text }; }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, result: json }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false, error: String(err) }),
    };
  }
};
