// Numbers for the dashboard's charts, straight from git. No model is involved here.
// Usage: node src/stats.ts <repo> <graveyard dir>   → writes <graveyard dir>/data.json
//
// Adds to graveyard.json:
//   monthly   commits per month for the whole repo
//   ghostMonthly  commits per month for each ghost (their sparkline)
//   deathsByYear / birthsByYear   for files that died
//   ageOfCode lines running at HEAD, grouped by the year they were written
//   headLines total lines blamed at HEAD, and how many belong to the ghosts

import fs from 'node:fs';
import path from 'node:path';
import { git, isInteresting, people, displayName } from './git.ts';

const [repo, dir] = process.argv.slice(2).map((p) => path.resolve(p));
const yard = JSON.parse(fs.readFileSync(path.join(dir, 'graveyard.json'), 'utf8'));
const month = (ms: number) => new Date(ms).toISOString().slice(0, 7);

// Commits per month, whole repo and per ghost (matched through the same identity merging as cli.ts).
const who = people(repo);
const keyOf = new Map<string, string>();
for (const p of who.values()) {
  for (const n of p.names) keyOf.set(`n:${n.toLowerCase()}`, p.key);
  for (const e of p.emails) keyOf.set(`e:${e}`, p.key);
}
const ghostKeys = new Map<string, string>(); // person key -> ghost display name
for (const g of yard.ghosts) {
  const p = [...who.values()].find((x) => displayName(x) === g.meta.name);
  if (p) ghostKeys.set(p.key, g.meta.name);
}
const monthly = new Map<string, number>();
const ghostMonthly: Record<string, Record<string, number>> = {};
for (const line of git(repo, ['log', '--use-mailmap', '--no-merges', '--format=%aN%x1f%aE%x1f%at']).trim().split('\n')) {
  const [n, e, at] = line.split('\x1f');
  const m = month(Number(at) * 1000);
  monthly.set(m, (monthly.get(m) ?? 0) + 1);
  const key = keyOf.get(`e:${e.toLowerCase()}`) ?? keyOf.get(`n:${n.toLowerCase()}`);
  const ghost = key && ghostKeys.get(key);
  if (ghost) (ghostMonthly[ghost] ??= {})[m] = (ghostMonthly[ghost][m] ?? 0) + 1;
}

// Every death, not just the remembered ones: when files died, and when those files were born.
const deathsByYear: Record<string, number> = {};
for (const line of git(repo, ['log', '-M', '--diff-filter=D', '--name-only', '--format=@@%at']).split('\n')) {
  if (line.startsWith('@@')) (deathsByYear as any)._at = new Date(Number(line.slice(2)) * 1000).getUTCFullYear();
  else if (line.trim() && isInteresting(line.trim())) {
    const y = String((deathsByYear as any)._at);
    deathsByYear[y] = (deathsByYear[y] ?? 0) + 1;
  }
}
delete (deathsByYear as any)._at;

// How old is the code that runs today? Every line at HEAD, by the year it was written.
const ageOfCode: Record<string, number> = {};
let headLines = 0;
let ghostLines = 0;
const ghostEmails = new Set<string>();
const ghostNames = new Set<string>();
for (const k of ghostKeys.keys()) {
  const p = who.get(k)!;
  p.emails.forEach((e) => ghostEmails.add(e));
  p.names.forEach((n) => ghostNames.add(n.toLowerCase()));
}
for (const file of git(repo, ['ls-files']).split('\n').filter((f) => f && isInteresting(f))) {
  let out = '';
  try {
    out = git(repo, ['blame', '--line-porcelain', '-w', 'HEAD', '--', file]);
  } catch {
    continue;
  }
  let at = 0;
  let name = '';
  let email = '';
  for (const l of out.split('\n')) {
    if (l.startsWith('author ')) name = l.slice(7).trim().toLowerCase();
    else if (l.startsWith('author-mail ')) email = l.slice(12).replace(/[<>]/g, '').trim().toLowerCase();
    else if (l.startsWith('author-time ')) at = Number(l.slice(12)) * 1000;
    else if (l.startsWith('\t')) {
      headLines++;
      const y = String(new Date(at).getUTCFullYear());
      ageOfCode[y] = (ageOfCode[y] ?? 0) + 1;
      if (ghostEmails.has(email) || ghostNames.has(name)) ghostLines++;
    }
  }
}

const data = {
  ...yard,
  commits: [...monthly.values()].reduce((a, b) => a + b, 0),
  monthly: Object.fromEntries([...monthly.entries()].sort()),
  ghostMonthly,
  deathsByYear,
  ageOfCode,
  headLines,
  ghostLines,
};
fs.writeFileSync(path.join(dir, 'data.json'), JSON.stringify(data));
process.stderr.write(`${yard.repo}: ${data.commits} commits, ${headLines} lines at HEAD (${ghostLines} by the ghosts), ${Object.values(deathsByYear).reduce((a: number, b: any) => a + b, 0)} deaths\n`);
