// AI provider adapter. Supports Anthropic Claude (Messages API) and Google Gemini
// (generateContent REST) when keys are configured server-side. Otherwise every caller
// falls back to deterministic heuristics and labels its output "heuristic".

export interface ImageInput { mime: string; base64: string }

export function aiProvider(): { name: string; model: string } | null {
  if (process.env.ANTHROPIC_API_KEY) return { name: 'anthropic', model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5' };
  if (process.env.GEMINI_API_KEY) return { name: 'gemini', model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' };
  return null;
}

export function aiLabel() {
  const p = aiProvider();
  return p ? `${p.name}:${p.model}` : 'heuristic (no AI provider configured)';
}

/** Ask the model for JSON. Returns null when no provider is configured or the call fails. */
export async function aiJSON<T = any>(system: string, user: string, images: ImageInput[] = [], maxTokens = 4000): Promise<{ data: T; source: string } | null> {
  const p = aiProvider();
  if (!p) return null;
  const instruction = `${user}\n\nRespond with a single valid JSON object only. No markdown fences, no commentary.`;
  try {
    let text = '';
    if (p.name === 'anthropic') {
      const content: any[] = images.slice(0, 6).map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mime, data: im.base64 } }));
      content.push({ type: 'text', text: instruction });
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
        body: JSON.stringify({ model: p.model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
      });
      if (!r.ok) throw new Error(`Anthropic ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const j: any = await r.json();
      text = (j.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('');
    } else {
      const parts: any[] = images.slice(0, 6).map((im) => ({ inline_data: { mime_type: im.mime, data: im.base64 } }));
      parts.push({ text: instruction });
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${p.model}:generateContent`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY! },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ role: 'user', parts }],
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: maxTokens },
        }),
      });
      if (!r.ok) throw new Error(`Gemini ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const j: any = await r.json();
      text = j.candidates?.[0]?.content?.parts?.map((x: any) => x.text || '').join('') || '';
    }
    const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    return { data: JSON.parse(cleaned.slice(start, end + 1)) as T, source: `${p.name}:${p.model}` };
  } catch (e: any) {
    console.error('[ai] call failed, falling back to heuristics:', e.message);
    return null;
  }
}
