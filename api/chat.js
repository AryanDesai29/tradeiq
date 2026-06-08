// Vercel Serverless Function — Groq key stays SECRET on server
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { messages, systemPrompt } = req.body;
  if (!messages || !systemPrompt) return res.status(400).json({ error: 'Missing fields' });
  const GROQ_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_KEY) return res.status(500).json({ error: 'GROQ_API_KEY not set' });
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + GROQ_KEY },
      body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages: [{ role: 'system', content: systemPrompt }, ...messages], max_tokens: 900, temperature: 0.6 }),
    });
    const data = await response.json();
    if (data.error) return res.status(400).json({ error: data.error.message });
    return res.status(200).json({ reply: data.choices?.[0]?.message?.content || 'No response' });
  } catch (err) { return res.status(500).json({ error: err.message }); }
}