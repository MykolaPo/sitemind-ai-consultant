/**
 * Pluggable LLM provider adapter (Gemini, OpenAI-compatible, local Ollama).
 * Falls back cleanly to null when provider === 'local' or when unconfigured.
 */

async function generateWithProvider({ site, query, contextText, lang = 'ru', isComplex = false }) {
  const provider = (site.llm_provider || 'local').toLowerCase();
  if (provider === 'local') return null;

  const apiKey = site.llm_api_key || process.env.LLM_API_KEY || '';
  const systemInstruction = [
    site.system_prompt || 'Отвечай кратко, вежливо и строго по подтверждённым данным.',
    'STRICT RULE: Use ONLY facts, prices, and stock numbers from the VERIFIED CONTEXT below. Never invent or guess any price, discount, or specification. Reply in language: ' + lang + '.',
  ].join('\n');

  const userPrompt = `VERIFIED CONTEXT:\n${contextText}\n\nUSER QUESTION:\n${query}`;

  if (provider === 'gemini') {
    if (!apiKey) return null;
    const model = site.llm_model || (isComplex ? 'gemini-2.5-pro' : 'gemini-2.5-flash');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemInstruction }] },
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 512 },
      }),
    });
    if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return null;
    const tokens = (data.usageMetadata?.promptTokenCount || 0) + (data.usageMetadata?.candidatesTokenCount || 0);
    return { text, modelUsed: `gemini:${model}`, tokensUsed: tokens || 80 };
  }

  if (provider === 'openai') {
    if (!apiKey) return null;
    const baseUrl = (site.llm_base_url || 'https://api.openai.com/v1').replace(/\/$/, '');
    const model = site.llm_model || (isComplex ? 'gpt-4o' : 'gpt-4o-mini');
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 512,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    if (!text) return null;
    const tokens = data.usage?.total_tokens || 80;
    return { text, modelUsed: `openai:${model}`, tokensUsed: tokens };
  }

  if (provider === 'ollama') {
    const baseUrl = (site.llm_base_url || 'http://127.0.0.1:11434').replace(/\/$/, '');
    const model = site.llm_model || 'llama3.1';
    const res = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(15000),
      body: JSON.stringify({
        model,
        stream: false,
        options: { temperature: 0.1 },
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userPrompt },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
    const data = await res.json();
    const text = data.message?.content?.trim();
    if (!text) return null;
    return { text, modelUsed: `ollama:${model}`, tokensUsed: (data.eval_count || 60) + (data.prompt_eval_count || 40) };
  }

  return null;
}

module.exports = { generateWithProvider };
