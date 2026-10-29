// Everything Bhoot knows, it learns from git. No model touches this file: these are the facts
// every remembrance is checked against.

import { execFileSync } from 'node:child_process';

const DAY = 86_400_000;

export function git(repo: string, args: string[], maxBuffer = 512 * 1024 * 1024): string {
  return execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8', maxBuffer, stdio: ['ignore', 'pipe', 'ignore'] });
}

// Files whose lines don't say much about who built a project.
const SKIP =
  /(^|\/)(node_modules|vendor|dist|build|coverage|\.git)\/|(^|\/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|Cargo\.lock|go\.sum|poetry\.lock)$|\.(png|jpe?g|gif|ico|svg|webp|pdf|zip|gz|woff2?|ttf|eot|mp4|mp3|min\.js|map|lock)$/i;

export function isInteresting(path: string): boolean {
  return !SKIP.test(path);
}

/** One person, however many names and emails git has for them. */
export interface Person {
  key: string;
  names: Set<string>;
  emails: Set<string>;
  commits: number;
  first: number; // ms
  last: number; // ms
  firstMessage: string;
  lastMessage: string;
}

/**
 * People merged across spellings: same email (case-insensitive), or same name (case-insensitive).
 * "TJ Holowaychuk", "Tj Holowaychuk" and "visionmedia <tj@vision-media.ca>" become one person.
 */
export function people(repo: string): Map<string, Person> {
  const out = git(repo, ['log', '--use-mailmap', '--no-merges', '--format=%aN%x1f%aE%x1f%at%x1f%s']);
  const rows = out.trim().split('\n').filter(Boolean).map((l) => l.split('\x1f')).reverse(); // oldest first

  // Union-find over identities: every name and every email is a node; a commit joins its name and email.
  const parent = new Map<string, string>();
  const root = (x: string): string => {
    while (parent.get(x) !== x) {
      parent.set(x, parent.get(parent.get(x)!)!);
      x = parent.get(x)!;
    }
    return x;
  };
  const add = (x: string) => parent.has(x) || parent.set(x, x);
  const join = (a: string, b: string) => parent.set(root(a), root(b));
  // Shared bot/placeholder emails would glue strangers together, so they don't join anything.
  const shared = (e: string) => !e || /noreply|no-reply|localhost|example\.com|^none$|^unknown$/.test(e);
  for (const [name, email] of rows) {
    const n = `n:${name.trim().toLowerCase()}`;
    add(n);
    const e = email.trim().toLowerCase();
    if (!shared(e)) {
      add(`e:${e}`);
      join(`e:${e}`, n);
    }
  }

  const byId = new Map<string, Person>();
  for (const [name, email, at, subject] of rows) {
    const key = root(`n:${name.trim().toLowerCase()}`);
    const ms = Number(at) * 1000;
    let p = byId.get(key);
    if (!p) {
      p = { key, names: new Set(), emails: new Set(), commits: 0, first: ms, last: ms, firstMessage: subject, lastMessage: subject };
      byId.set(key, p);
    }
    p.names.add(name.trim());
    const e = email.trim().toLowerCase();
    if (!shared(e)) p.emails.add(e);
    p.commits++;
    if (ms < p.first) (p.first = ms), (p.firstMessage = subject);
    if (ms >= p.last) (p.last = ms), (p.lastMessage = subject);
  }
  return byId;
}

/** The name to show: the spelling they used most recently that has a capital letter in it. */
export function displayName(p: Person): string {
  const names = [...p.names];
  return names.filter((n) => /[A-Z]/.test(n) && /\s/.test(n)).pop() ?? names.pop() ?? p.key;
}

export interface Survival {
  lines: number;
  files: Map<string, number>; // file -> surviving lines
  oldest: { at: number; line: string; file: string } | null; // their oldest line still in HEAD
}

/** git blame on every interesting file at HEAD: whose lines are still here. */
export function survivors(repo: string, who: Map<string, Person>, onFile?: (i: number, n: number) => void): Map<string, Survival> {
  const lookup = new Map<string, string>();
  for (const p of who.values()) {
    for (const e of p.emails) lookup.set(`e:${e}`, p.key);
    for (const n of p.names) lookup.set(`n:${n.toLowerCase()}`, p.key);
  }
  const files = git(repo, ['ls-files']).split('\n').filter((f) => f && isInteresting(f));
  const result = new Map<string, Survival>();
  files.forEach((file, i) => {
    onFile?.(i, files.length);
    let out: string;
    try {
      out = git(repo, ['blame', '--line-porcelain', '-w', 'HEAD', '--', file]);
    } catch {
      return;
    }
    let name = '';
    let email = '';
    let at = 0;
    for (const line of out.split('\n')) {
      if (line.startsWith('author ')) name = line.slice(7).trim();
      else if (line.startsWith('author-mail ')) email = line.slice(12).replace(/[<>]/g, '').trim().toLowerCase();
      else if (line.startsWith('author-time ')) at = Number(line.slice(12)) * 1000;
      else if (line.startsWith('\t')) {
        const key = lookup.get(`e:${email}`) ?? lookup.get(`n:${name.toLowerCase()}`);
        if (!key) continue;
        let s = result.get(key);
        if (!s) result.set(key, (s = { lines: 0, files: new Map(), oldest: null }));
        s.lines++;
        s.files.set(file, (s.files.get(file) ?? 0) + 1);
        const text = line.slice(1).trim();
        if (text.length > 12 && (!s.oldest || at < s.oldest.at)) s.oldest = { at, line: text.slice(0, 100), file };
      }
    }
  });
  return result;
}

export interface Death {
  path: string;
  born: number;
  bornBy: string;
  bornMessage: string;
  died: number;
  diedBy: string;
  causeOfDeath: string; // the deleting commit's subject
  diedIn: string; // short hash
  lines: number; // at death
  authors: string[]; // everyone who touched it, most commits first
  commits: number;
  snippet: string; // the start of the file as it was the day before it died
}

/** Files that were deleted (renames don't count: a renamed file didn't die). */
export function deaths(repo: string): Death[] {
  const out = git(repo, ['log', '-M', '--diff-filter=D', '--name-only', '--use-mailmap', '--format=@@%H%x1f%aN%x1f%at%x1f%s']);
  const found: Death[] = [];
  let commit: string[] = [];
  for (const line of out.split('\n')) {
    if (line.startsWith('@@')) commit = line.slice(2).split('\x1f');
    else if (line.trim() && isInteresting(line.trim())) {
      const path = line.trim();
      const [hash, name, at, subject] = commit;
      found.push({
        path,
        born: 0,
        bornBy: '',
        bornMessage: '',
        died: Number(at) * 1000,
        diedBy: name,
        causeOfDeath: subject,
        diedIn: hash,
        lines: 0,
        authors: [],
        commits: 0,
        snippet: '',
      });
    }
  }
  return found;
}

/** Fill in a death's life story: birth, authors, size and last contents. Costs a few git calls. */
export function lifeStory(repo: string, d: Death): Death {
  const hist = git(repo, ['log', '--use-mailmap', '--follow', '--format=%aN%x1f%at%x1f%s', `${d.diedIn}^`, '--', d.path])
    .trim()
    .split('\n')
    .filter(Boolean)
    .map((l) => l.split('\x1f'));
  if (!hist.length) return d;
  const [bornBy, bornAt, bornMessage] = hist[hist.length - 1];
  const counts = new Map<string, number>();
  for (const [n] of hist) counts.set(n, (counts.get(n) ?? 0) + 1);
  let content = '';
  try {
    content = git(repo, ['show', `${d.diedIn}^:${d.path}`], 64 * 1024 * 1024);
  } catch {
    /* binary or missing */
  }
  return {
    ...d,
    born: Number(bornAt) * 1000,
    bornBy,
    bornMessage,
    commits: hist.length,
    authors: [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([n]) => n),
    lines: content ? content.split('\n').length : 0,
    snippet: content.split('\n').slice(0, 40).join('\n').slice(0, 1800),
  };
}

export function headTime(repo: string): number {
  return Number(git(repo, ['log', '-1', '--format=%ct']).trim()) * 1000;
}

export function repoName(repo: string): string {
  try {
    const url = git(repo, ['remote', 'get-url', 'origin']).trim();
    return url.replace(/\.git$/, '').split(/[/:]/).slice(-2).join('/');
  } catch {
    return repo.split('/').filter(Boolean).pop() ?? 'repo';
  }
}

export const years = (ms: number) => ms / (365.25 * DAY);
export const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);
export const yr = (ms: number) => new Date(ms).getUTCFullYear();
