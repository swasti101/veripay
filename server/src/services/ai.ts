// AI provider adapter. Supports Anthropic Claude (Messages API) and Google Gemini
// (generateContent REST) when keys are configured server-side. Otherwise every caller
// falls back to deterministic heuristics and labels its output "heuristic".

export interface ImageInput { mime: string; base64: string }

export type ProviderName = 'anthropic' | 'gemini' | 'groq';

// Groq is OpenAI-compatible. Its text models have no image input, so when a call carries
// screenshots we switch to a vision-capable Groq model for that call only.
// Verified against GET /openai/v1/models on a free-tier key: llama-3.3-70b-versatile is not
// available there, gpt-oss-120b is. Override with GROQ_MODEL if your account differs.
const GROQ_TEXT_DEFAULT = 'openai/gpt-oss-120b';
const GROQ_VISION_DEFAULT = 'qwen/qwen3.8-27b';

/** Which provider answers. AI_PROVIDER pins one explicitly; otherwise first key present wins. */
export function aiProvider(opts: { vision?: boolean } = {}): { name: ProviderName; model: string } | null {
  const pin = (process.env.AI_PROVIDER || '').toLowerCase() as ProviderName | '';
  const have = {
    anthropic: !!process.env.ANTHROPIC_API_KEY,
    gemini: !!process.env.GEMINI_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
  };
  const order: ProviderName[] = pin && have[pin] ? [pin] : (['anthropic', 'gemini', 'groq'] as ProviderName[]).filter((p) => have[p]);
  const pick = order[0];
  if (!pick) return null;
  if (pick === 'anthropic') return { name: 'anthropic', model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5' };
  if (pick === 'gemini') return { name: 'gemini', model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' };
  return {
    name: 'groq',
    model: opts.vision
      ? process.env.GROQ_VISION_MODEL || GROQ_VISION_DEFAULT
      : process.env.GROQ_MODEL || GROQ_TEXT_DEFAULT,
  };
}

export function aiLabel() {
  const p = aiProvider();
  return p ? `${p.name}:${p.model}` : 'heuristic (no AI provider configured)';
}

/** Ask the model for JSON. Returns null when no provider is configured or the call fails. */
export async function aiJSON<T = any>(system: string, user: string, images: ImageInput[] = [], maxTokens = 4000): Promise<{ data: T; source: string } | null> {
  const p = aiProvider({ vision: images.length > 0 });
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
    } else if (p.name === 'groq') {
      // OpenAI-compatible Chat Completions. Vision models take up to 3 images; each costs
      // ~2048 input tokens, so the cap is deliberate rather than arbitrary.
      const content: any[] = [{ type: 'text', text: instruction }];
      for (const im of images.slice(0, 3)) content.push({ type: 'image_url', image_url: { url: `data:${im.mime};base64,${im.base64}` } });
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model: p.model,
          max_completion_tokens: maxTokens,
          // Groq's strict JSON validator rejects valid-looking output from the vision model,
          // so JSON mode is only requested for text calls; vision output is parsed below.
          ...(images.length ? {} : { response_format: { type: 'json_object' } }),
          // gpt-oss models spend completion tokens on reasoning; keep that bounded so a long
          // QA prompt still leaves room for the answer.
          ...(/gpt-oss/.test(p.model) ? { reasoning_effort: 'low' } : {}),
          messages: [{ role: 'system', content: system }, { role: 'user', content: images.length ? content : instruction }],
        }),
      });
      if (!r.ok) throw new Error(`Groq ${r.status}: ${(await r.text()).slice(0, 300)}`);
      const j: any = await r.json();
      text = j.choices?.[0]?.message?.content || '';
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
