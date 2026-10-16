// Identifies Nintendo games in a screenshot or photo using the OpenAI API.
//
// POST { image: "data:image/jpeg;base64,..." }
//   -> { games: [{ title, platform, confidence }] }
//
// Secrets: OPENAI_API_KEY (required), OPENAI_MODEL (optional, default gpt-5-mini)

import { callerIsMember } from '../_shared/auth.ts';
import { corsHeaders, env, json } from '../_shared/http.ts';

const MAX_IMAGE_CHARS = 12_000_000; // ~9 MB of base64

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

interface DetectedGame {
  title: string;
  platform: string | null;
  confidence: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  if (!(await callerIsMember(req))) {
    return json({ error: 'Only members of the group can scan screenshots.' }, 403);
  }

  const apiKey = env('OPENAI_API_KEY');
  if (!apiKey) {
    return json({ error: 'Screenshot scanning is not set up yet (missing OPENAI_API_KEY secret).' }, 501);
  }

  let image: unknown;
  try {
    ({ image } = await req.json());
  } catch {
    return json({ error: 'Expected a JSON body.' }, 400);
  }
  if (typeof image !== 'string' || !/^data:image\/(png|jpe?g|webp|gif);base64,/.test(image)) {
    return json({ error: 'Expected "image" to be a base64 data URL (PNG, JPEG, WebP or GIF).' }, 400);
  }
  if (image.length > MAX_IMAGE_CHARS) {
    return json({ error: 'That image is too large — try a smaller screenshot.' }, 413);
  }

  const model = env('OPENAI_MODEL', 'gpt-5-mini')!;
  const body: Record<string, unknown> = {
    model,
    response_format: RESPONSE_FORMAT,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Which Nintendo games are in this image?' },
          { type: 'image_url', image_url: { url: image, detail: 'high' } },
        ],
      },
    ],
  };
  // Reasoning models accept an effort hint; low keeps scans quick and cheap.
  if (/^(gpt-5|o\d)/.test(model)) body.reasoning_effort = 'low';

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error('OpenAI error', response.status, detail);
    return json({ error: `The recognition service returned an error (${response.status}).` }, 502);
  }

  const completion = await response.json();
  const content: string | undefined = completion?.choices?.[0]?.message?.content;
  let games: DetectedGame[] = [];
  try {
    games = (JSON.parse(content ?? '{}').games ?? []) as DetectedGame[];
  } catch {
    console.error('Could not parse model output', content);
  }

  const seen = new Set<string>();
  const cleaned = games
    .map((g) => ({
      title: String(g.title ?? '').replace(/[™®©]/g, '').replace(/\s+/g, ' ').trim(),
      platform: g.platform ?? null,
      confidence: Math.max(0, Math.min(1, Number(g.confidence) || 0)),
    }))
    .filter((g) => {
      const key = g.title.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 40);

  return json({ games: cleaned });
});
