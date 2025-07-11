import crypto from 'crypto';

function createSignature(apiPath, params, appSecret) {
  const sortedKeys = Object.keys(params).sort();
  let baseString = apiPath;
  for (const key of sortedKeys) {
    baseString += key + params[key];
  }
  return crypto.createHmac('sha256', appSecret).update(baseString).digest('hex').toUpperCase();
}

export default async function handler(req, res) {
  const APP_KEY = '516310';
  const APP_SECRET = 'BSW3B0R6bGJnOYqiAYxrr73joYxmoTjH';
  const API_PATH = '/auth/token/create';

  const code = req.query.code;
  if (!code) {
    return res.status(400).json({ error: 'Missing code parameter' });
  }

  const timestamp = Date.now().toString();
  const params = {
    app_key: APP_KEY,
    code,
    sign_method: 'sha256',
    timestamp,
    simplify: 'true',
  };

  const sign = createSignature(API_PATH, params, APP_SECRET);
  params.sign = sign;

  // צור את ה-URL עם כל הפרמטרים כולל החתימה
  const queryString = new URLSearchParams(params).toString();
  const url = `https://api-sg.aliexpress.com/rest${API_PATH}?${queryString}`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    return res.status(200).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}
