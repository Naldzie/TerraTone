/* Gemini integration — optional AI explanations of sonifications.
 *
 * Online-only, key-gated, and ALWAYS labeled AI-generated: responses may be
 * wrong and are never presented as NASA data. The model is picked at runtime
 * from the models list (no hardcoded model name to go stale).
 * Docs: https://ai.google.dev/gemini-api/docs
 */
import { getGeminiKey } from './keys';

export interface DatasetBrief {
  title: string;
  units: string;
  range: [number, number];
  summary: string;
  mappingNote: string;
  profile: string;
}

/** Build the grounded prompt from local stats (pure, tested). */
export function buildExplainPrompt(b: DatasetBrief): string {
  return [
    'You explain data sonification to a curious beginner in 120 words or fewer.',
    'Use plain language, no hype, no emojis. End with one sentence starting "Remember:" that loudness follows the chosen mapping, not danger.',
    '',
    `Dataset: ${b.title}`,
    `Units and range: ${b.units}, ${b.range[0]} to ${b.range[1]}`,
    `Statistics: ${b.summary}`,
    `Sound mapping: ${b.mappingNote}`,
    `Sound profile: ${b.profile}`,
    '',
    'Explain what a listener would hear as the piece plays from start to finish.',
  ].join('\n');
}

interface ModelEntry {
  name?: string;
  supportedGenerationMethods?: string[];
}

/** Pick a generateContent-capable model, preferring flash-class (pure, tested). */
export function pickModel(models: ModelEntry[]): string | null {
  return rankModels(models)[0] ?? null;
}

/**
 * All usable model IDs, best first: flash-class, then stable names, with
 * preview/experimental and single-purpose models (TTS, image, transcribe…)
 * demoted to last resort — those 404 most often. Pure (tested).
 */
export function rankModels(models: ModelEntry[]): string[] {
  const capable = models
    .filter((m) => (m.name ?? '').startsWith('models/'))
    .filter((m) => !m.supportedGenerationMethods || m.supportedGenerationMethods.includes('generateContent'))
    .map((m) => m.name as string);
  const score = (n: string): number => {
    let s = 0;
    if (/flash/i.test(n)) s += 10;
    // Floating -latest aliases can dangle (proven 404); prefer versioned IDs.
    if (/-latest$/.test(n)) s -= 3;
    else if (/latest/i.test(n)) s += 2;
    if (/preview|experimental|tts|transcribe|image|robotics|computer-use|deep-research|lyria|gemma|nano-banana|omni|antigravity/i.test(n)) s -= 20;
    return s;
  };
  return [...new Set(capable)].sort((a, b) => score(b) - score(a));
}

/** Extract readable text from a generateContent response (pure, tested). */
export function extractText(json: unknown): string {
  const root = json as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
  };
  const text = root.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('').trim() ?? '';
  if (!text) {
    if (root.promptFeedback?.blockReason) {
      throw new Error(`The AI declined to answer (safety filter: ${root.promptFeedback.blockReason}). Rephrase and try again.`);
    }
    throw new Error('The AI returned an empty response. Try again.');
  }
  return text;
}

/** Error carrying the HTTP status so callers can react (404 → try next model). */
export class AiHttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AiHttpError';
  }
}

let cachedModels: string[] | null = null;

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 25000);
  try {
    const res = await fetch(url, init);
    if (res.status === 400 || res.status === 403) {
      throw new AiHttpError(res.status, 'The AI service rejected the key (HTTP ' + res.status + '). Check the Gemini key in Settings → API keys — AI Studio keys start with "AIza".');
    }
    if (res.status === 429) throw new AiHttpError(429, 'AI quota exceeded. Wait a bit and retry.');
    if (res.status === 404) throw new AiHttpError(404, 'That AI model ID is gone (HTTP 404).');
    if (!res.ok) throw new AiHttpError(res.status, `AI service error (HTTP ${res.status}). Retry later.`);
    return (await res.json()) as unknown;
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') throw new Error('AI request timed out. Check your connection.');
    throw e instanceof Error ? e : new Error('AI request failed.');
  } finally {
    clearTimeout(t);
  }
}

async function listModels(key: string): Promise<string[]> {
  const list = (await fetchJson(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(key)}`)) as { models?: ModelEntry[] };
  const ranked = rankModels(list.models ?? []);
  if (ranked.length === 0) throw new Error('No text-capable Gemini model is available for this key.');
  return ranked;
}

/** Explain a dataset's sonification with Gemini. Requires a stored key + network. */
export async function explainWithGemini(brief: DatasetBrief): Promise<string> {
  return generateText(buildExplainPrompt(brief), 300, 0.4);
}

/** Generic grounded completion (NPC guides, etc.). Requires a stored key + network. */
export async function generateText(prompt: string, maxTokens = 400, temperature = 0.5): Promise<string> {
  const key = getGeminiKey();
  if (!key) throw new Error('No Gemini key saved. Add one in Settings → API keys first.');
  if (!cachedModels) cachedModels = await listModels(key);
  const tried: string[] = [];
  // Walk the ranked list: a 404 means that model ID retired — try the next.
  // Anything else (key, quota, network) aborts immediately.
  for (const model of cachedModels) {
    tried.push(model);
    try {
      const body = await fetchJson(`https://generativelanguage.googleapis.com/v1beta/${model}:generateContent?key=${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens, temperature },
        }),
      });
      cachedModels = [model, ...cachedModels.filter((m) => m !== model)]; // promote the winner
      return extractText(body);
    } catch (e) {
      if (e instanceof AiHttpError && e.status === 404) continue;
      throw e;
    }
  }
  // Every known ID 404'd — the list is stale. Forget it so the next retry refetches.
  cachedModels = null;
  throw new Error(`All known AI models answered 404 (retired IDs?). Tried: ${tried.join(', ') || 'none'}. Wait a moment and retry — the model list refreshes automatically.`);
}
