// Gemma, on this machine, through Ollama. Nothing in a repository leaves the laptop.

import http from 'node:http';

const BASE = new URL(process.env.OLLAMA_URL ?? 'http://127.0.0.1:11434');
export const MODEL = process.env.BHOOT_MODEL ?? 'gemma3:4b';

// Plain http instead of fetch: fetch gives up after 5 minutes without a response, and on an 8 GB
// laptop that's busy swapping, one slow answer can take longer than that. Slow is fine; failing isn't.
function post(path: string, body: unknown): Promise<string> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: BASE.hostname, port: BASE.port || 80, path, method: 'POST', headers: { 'content-type': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => (res.statusCode === 200 ? resolve(data) : reject(new Error(`Ollama ${res.statusCode}: ${data.slice(0, 200)}`))));
      },
    );
    req.on('error', reject);
    req.end(JSON.stringify(body));
  });
}

export async function ask(prompt: string, temperature: number): Promise<string> {
  const body = {
    model: MODEL,
    prompt,
    stream: false,
    keep_alive: '30m',
    options: { temperature, num_ctx: 3072, num_predict: 120, seed: 7 },
  };
  for (let attempt = 1; ; attempt++) {
    try {
      return (JSON.parse(await post('/api/generate', body)) as { response: string }).response;
    } catch (e) {
      if (attempt >= 3) throw e;
      process.stderr.write(`  (Ollama hiccup: ${(e as Error).message}; trying again)\n`);
      await new Promise((r) => setTimeout(r, 5000 * attempt));
    }
  }
}

export async function ollamaUp(): Promise<boolean> {
  try {
    return (await fetch(new URL('/api/tags', BASE), { signal: AbortSignal.timeout(3000) })).ok;
  } catch {
    return false;
  }
}
