export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const NOTION_KEY = process.env.NOTION_KEY;
  const DATABASE_ID = process.env.NOTION_DATABASE_ID;

  const headers = {
    'Authorization': `Bearer ${NOTION_KEY}`,
    'Notion-Version': '2022-06-28',
    'Content-Type': 'application/json'
  };

  const kstDefault = new Date(new Date().getTime() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];

  try {
    if (req.method === 'GET') {
      const targetDate = req.query.date || kstDefault;
      const queryRes = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ filter: { property: '날짜', date: { equals: targetDate } } })
      });
      const data = await queryRes.json();
      const page = data.results?.[0];
      const amount = page ? (page.properties['섭취량']?.number || 0) : 0;
      return res.status(200).json({ success: true, amount });
    }

    if (req.method === 'POST') {
      const bodyData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const amount = bodyData.amount;
      const targetDate = bodyData.date || kstDefault;

      const queryRes = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ filter: { property: '날짜', date: { equals: targetDate } } })
      });
      const data = await queryRes.json();
      const page = data.results?.[0];

      if (page) {
        await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ properties: { '섭취량': { number: amount } } })
        });
      } else {
        await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            parent: { database_id: DATABASE_ID },
            properties: {
              '날짜': { date: { start: targetDate } },
              '섭취량': { number: amount }
            }
          })
        });
      }
      return res.status(200).json({ success: true, amount });
    }
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}