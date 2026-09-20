export default async function handler(req, res) {
  // CORS 헤더 설정
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

  // 한국 시간(KST) 기준 기본 YYYY-MM-DD 생성
  const kstDefault = new Date(new Date().getTime() + (9 * 60 * 60 * 1000)).toISOString().split('T')[0];

  try {
    // 1. GET 요청: 날짜별 섭취량 조회
    if (req.method === 'GET') {
      const targetDate = req.query.date || kstDefault;
      
      const queryRes = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          filter: { 
            property: 'Title', 
            title: { equals: targetDate } 
          } 
        })
      });
      
      const data = await queryRes.json();
      if (!queryRes.ok) throw new Error(data.message || 'Notion API Query Error');

      const page = data.results?.[0];
      // Amount 또는 기존 섭취량 속성 대응
      const amount = page ? (page.properties['Amount']?.number ?? page.properties['섭취량']?.number ?? 0) : 0;
      
      return res.status(200).json({ success: true, amount });
    }

    // 2. POST 요청: 섭취량 기록 (생성 또는 업데이트)
    if (req.method === 'POST') {
      const bodyData = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      
      // 대소문자 모두 대응 (Amount / amount, Title / Date / date)
      const amount = Number(bodyData.Amount ?? bodyData.amount ?? 0);
      const targetDate = bodyData.Title || bodyData.Date || bodyData.date || kstDefault;

      // 기존 날짜 데이터 존재 여부 확인
      const queryRes = await fetch(`https://api.notion.com/v1/databases/${DATABASE_ID}/query`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          filter: { 
            property: 'Title', 
            title: { equals: targetDate } 
          } 
        })
      });

      const data = await queryRes.json();
      if (!queryRes.ok) throw new Error(data.message || 'Notion Query Error');

      const page = data.results?.[0];

      if (page) {
        // 기존 페이지가 있으면 Amount(섭취량) 업데이트
        const updateRes = await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
          method: 'PATCH',
          headers,
          body: JSON.stringify({ 
            properties: { 
              'Amount': { number: amount } 
            } 
          })
        });
        const updateData = await updateRes.json();
        if (!updateRes.ok) throw new Error(updateData.message || 'Notion Update Error');
      } else {
        // 기존 페이지가 없으면 신규 생성 (Title, Date, Amount 모두 전송)
        const createRes = await fetch('https://api.notion.com/v1/pages', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            parent: { database_id: DATABASE_ID },
            properties: {
              'Title': { title: [{ text: { content: targetDate } }] }, // 노션 DB 필수 제목 속성
              'Date': { date: { start: targetDate } },
              'Amount': { number: amount }
            }
          })
        });
        const createData = await createRes.json();
        if (!createRes.ok) throw new Error(createData.message || 'Notion Create Error');
      }

      return res.status(200).json({ success: true, amount });
    }
  } catch (err) {
    console.error("Notion Handler Error:", err);
    return res.status(500).json({ success: false, error: err.message });
  }
}
