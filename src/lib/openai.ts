/*
 * Screenshot recognition with the person's OWN OpenAI API key.
 *
 * The key is saved only in this browser (localStorage) and is sent only to
 * api.openai.com, directly from the browser. It never touches our servers or
 * the family database, so every person who wants to scan adds their own key.
 */
import type { DetectedGame } from '../types';

const KEY = 'fge-openai-key';
const MODEL = 'fge-openai-model';
export const DEFAULT_MODEL = 'gpt-5-mini';

const read = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

export const getOpenAiKey = () => read(KEY);
export const getOpenAiModel = () => read(MODEL) || DEFAULT_MODEL;
export const hasOpenAiKey = () => !!getOpenAiKey();
export const keyHint = (key: string) => `sk-…${key.slice(-4)}`;

export function saveOpenAi(key: string | null, model?: string | null) {
  try {
    if (key) localStorage.setItem(KEY, key.trim());
    else localStorage.removeItem(KEY);
    if (model !== undefined) {
      if (model && model.trim() && model.trim() !== DEFAULT_MODEL) localStorage.setItem(MODEL, model.trim());
      else localStorage.removeItem(MODEL);
    }
  } catch {
    throw new Error('This browser blocked saving the key (private mode?).');
  }
  window.dispatchEvent(new Event('fge-openai-changed'));
}

export const looksLikeKey = (k: string) => /^sk-[A-Za-z0-9_-]{20,300}$/.test(k.trim());

/** Check a key with OpenAI before saving it. */
export async function testOpenAiKey(key: string): Promise<void> {
  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${key.trim()}` } });
  } catch {
    throw new Error('Couldn’t reach OpenAI — check your connection.');
  }
  if (res.status === 401) throw new Error('OpenAI didn’t accept that key.');
  if (!res.ok) throw new Error(`OpenAI returned an error (${res.status}).`);
}

const SYSTEM_PROMPT = `You identify Nintendo video games in images.
The image may be a Nintendo Switch / Switch 2 home screen or "All Software" list, a photo of game cases or cartridges, a shelf, an eShop page, a receipt, or a screenshot of a game itself.
Return every distinct game you can identify. Rules:
- Use the official English title as sold on the Nintendo eShop (e.g. "Mario Kart 8 Deluxe", "The Legend of Zelda: Tears of the Kingdom"). Omit ™ and ® symbols.
- Do not include DLC, apps (YouTube, Netflix), system menus, or Nintendo Switch Online.
- platform: "Nintendo Switch", "Nintendo Switch 2", or null if unsure.
- confidence: 0..1 — how sure you are the title is correct.
- If nothing is recognizable return an empty list.`;

const RESPONSE_FORMAT = {
  type: 'json_schema',
  json_schema: {
    name: 'detected_games',
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['games'],
      properties: {
        games: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['title', 'platform', 'confidence'],
            properties: {
              title: { type: 'string' },
              platform: { type: ['string', 'null'] },
              confidence: { type: 'number' },
            },
          },
        },
      },
    },
  },
};

export async function recognizeWithOpenAi(imageDataUrl: string): Promise<DetectedGame[]> {
  const key = getOpenAiKey();
  if (!key) throw new Error('Add your OpenAI API key in Settings to scan screenshots.');
  const model = getOpenAiModel();
  const body: Record<string, unknown> = {
    model,
    response_format: RESPONSE_FORMAT,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Which Nintendo games are in this image?' },
          { type: 'image_url', image_url: { url: imageDataUrl, detail: 'high' } },
        ],
      },
    ],
  };
  if (/^(gpt-5|o\d)/.test(model)) body.reasoning_effort = 'low';

  let res: Response;
  try {
    res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('Couldn’t reach OpenAI — check your connection.');
  }
  if (res.status === 401) throw new Error('OpenAI rejected your API key. Update it in Settings.');
  if (res.status === 429) throw new Error('Your OpenAI key is out of credit or rate-limited.');
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.error?.message ?? '';
    } catch {
      /* ignore */
    }
    throw new Error(`OpenAI returned an error (${res.status})${detail ? `: ${detail}` : ''}.`);
  }

  const completion = await res.json();
  let games: DetectedGame[] = [];
  try {
    games = JSON.parse(completion?.choices?.[0]?.message?.content ?? '{}').games ?? [];
  } catch {
    /* unparseable → no games */
  }
  const seen = new Set<string>();
  return games
    .map((g) => ({
      title: String(g.title ?? '').replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim(),
      platform: typeof g.platform === 'string' ? g.platform : null,
      confidence: Math.max(0, Math.min(1, Number(g.confidence) || 0)),
    }))
    .filter((g) => {
      const k = g.title.toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .slice(0, 40);
}
