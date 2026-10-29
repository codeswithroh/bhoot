#!/usr/bin/env node
// bhoot <repo> [--out site/] [--ghosts 12] [--graves 30] [--quiet-years 1] [--min-lines 50]
// Reads a repository's past, finds its ghosts and its graves, and asks a local Gemma to remember them.

import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { people, survivors, deaths, lifeStory, headTime, repoName, displayName, years, type Death } from './git.ts';
import { ghostFacts, graveFacts, remember, type Facts, type Remembrance } from './remember.ts';
import { ask, MODEL, ollamaUp } from './ollama.ts';
import { render } from './render.ts';

const args = process.argv.slice(2);
const flag = (name: string, def: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : def;
};
const repo = path.resolve(args.find((a, i) => !a.startsWith('--') && !args[i - 1]?.startsWith('--')) ?? '.');
const out = path.resolve(flag('out', 'site'));
const maxGhosts = Number(flag('ghosts', '12'));
const maxGraves = Number(flag('graves', '30'));
const quietYears = Number(flag('quiet-years', '1'));
const minLines = Number(flag('min-lines', '50'));

const log = (s: string) => process.stderr.write(s + '\n');

export interface Stone {
  facts: Facts;
  remembrance: Remembrance;
  meta: Record<string, string | number | string[]>;
}

export interface Graveyard {
  repo: string;
  head: number;
  model: string;
  generatedAt: string;
  ghosts: Stone[];
  graves: Stone[];
  stats: { people: number; deaths: number; blamedFiles: number };
}

async function main() {
  if (!(await ollamaUp())) throw new Error('Ollama is not running. Start it, then `ollama pull gemma3:4b`.');
  const name = repoName(repo);
  const now = headTime(repo);
  log(`Bhoot is reading ${name}…`);

  const who = people(repo);
  log(`  ${who.size} people in the history`);
  const alive = survivors(repo, who, (i, n) => i % 25 === 0 && log(`  blame ${i}/${n}`));

  const ghosts = [...who.values()]
    .filter((p) => years(now - p.last) >= quietYears && (alive.get(p.key)?.lines ?? 0) >= minLines)
    .sort((a, b) => alive.get(b.key)!.lines - alive.get(a.key)!.lines)
    .slice(0, maxGhosts);

  const dead = deaths(repo);
  log(`  ${dead.length} files died; reading their life stories…`);
  // Rank the dead by a long, busy, substantial life, then keep the most memorable.
  const told = dead
    .map((d) => lifeStory(repo, d))
    .filter((d) => d.lines >= 20 && d.died - d.born > 30 * 86_400_000 && d.commits >= 2)
    .sort((a, b) => score(b) - score(a))
    .slice(0, maxGraves);

  const cachePath = path.join(out, 'remembrances.json');
  const cache: Record<string, Remembrance> = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, 'utf8')) : {};
  const recall = async (f: Facts, label: string): Promise<Remembrance> => {
    const key = createHash('sha256').update(MODEL + f.lines.join('\n') + f.code).digest('hex').slice(0, 16);
    if (cache[key]) return cache[key];
    const r = await remember(f, ask);
    log(`  ${r.by === 'gemma' ? '✓' : r.by === 'gemma-retry' ? '↻' : '✗'} ${label}${r.rejected.length ? `   (rejected: ${r.rejected.map((x) => x.why).join('; ')})` : ''}`);
    cache[key] = r;
    fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(cachePath, JSON.stringify(cache, null, 1));
    return r;
  };

  const yard: Graveyard = {
    repo: name,
    head: now,
    model: MODEL,
    generatedAt: new Date().toISOString(),
    ghosts: [],
    graves: [],
    stats: { people: who.size, deaths: dead.length, blamedFiles: 0 },
  };

  for (const p of ghosts) {
    const s = alive.get(p.key)!;
    const facts = ghostFacts(p, s, now);
    yard.ghosts.push({
      facts,
      remembrance: await recall(facts, displayName(p)),
      meta: { name: displayName(p), first: p.first, last: p.last, commits: p.commits, lines: s.lines, files: s.files.size, oldestLine: s.oldest?.line ?? '', oldestFile: s.oldest?.file ?? '', oldestAt: s.oldest?.at ?? 0 },
    });
  }
  for (const d of told) {
    const facts = graveFacts(d);
    yard.graves.push({
      facts,
      remembrance: await recall(facts, d.path),
      meta: { path: d.path, born: d.born, died: d.died, bornBy: d.bornBy, diedBy: d.diedBy, cause: d.causeOfDeath, hash: d.diedIn, lines: d.lines, commits: d.commits, authors: d.authors.slice(0, 4) },
    });
  }

  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'graveyard.json'), JSON.stringify(yard, null, 1));
  fs.writeFileSync(path.join(out, 'index.html'), render(yard));
  const by = (k: string) => [...yard.ghosts, ...yard.graves].filter((s) => s.remembrance.by === k).length;
  log(`\n${yard.ghosts.length} ghosts, ${yard.graves.length} graves → ${path.join(out, 'index.html')}`);
  log(`Gemma first try: ${by('gemma')} · after one retry: ${by('gemma-retry')} · plain facts instead: ${by('facts')}`);
}

function score(d: Death): number {
  return years(d.died - d.born) * Math.log10(d.lines + 10) * Math.log2(d.commits + 1);
}

main().catch((e) => {
  log(String(e?.message ?? e));
  process.exit(1);
});
