// Gemma writes the remembrance. Code decides whether it may be carved.
//
// Every number, date, month, name, file and identifier in Gemma's words has to be found in the
// facts git gave us (or in the code itself). One invented detail and the remembrance is
// rejected; Gemma gets one more try; after that the stone gets a plain, true inscription instead.

import { displayName, years, yr, ymd, type Death, type Person, type Survival } from './git.ts';

export type Ask = (prompt: string, temperature: number) => Promise<string>;

export interface Facts {
  kind: 'ghost' | 'grave';
  title: string; // the name on the stone
  lines: string[]; // "fact: value" lines, exactly what Gemma sees
  code: string; // code snippet (graves) or oldest surviving line (ghosts)
  // What each number counts, and which year belongs to which event, so a true number can't be
  // attached to the wrong thing ("3,527 silent years" when 3,527 is commits).
  counts: [number, Unit][];
  bornYear: number;
  goneYear: number;
  makers: string[]; // who wrote it / who it was (lowercase)
  breaker: string; // who deleted it (graves), lowercase
}

export type Unit = 'lines' | 'commits' | 'years' | 'files' | 'people' | 'days';
const UNITS: [RegExp, Unit][] = [
  [/^lines?$/, 'lines'],
  [/^(commits?|changes?|edits?)$/, 'commits'],
  [/^(years?|yrs?)$/, 'years'],
  [/^files?$/, 'files'],
  [/^(people|persons?|contributors?|authors?|hands|souls|developers?|maintainers?|friends)$/, 'people'],
  [/^days?$/, 'days'],
];

const fmtN = (n: number) => n.toLocaleString('en-US');
const ageCount = (ms: number): [number, Unit] => {
  const y = years(ms);
  return y >= 1 ? [Math.floor(y), 'years'] : [Math.max(1, Math.round(ms / 86_400_000)), 'days'];
};
const age = (ms: number) => {
  const y = years(ms);
  return y >= 1 ? `${Math.floor(y)} year${Math.floor(y) === 1 ? '' : 's'}` : `${Math.max(1, Math.round(ms / 86_400_000))} days`;
};

export function ghostFacts(p: Person, s: Survival, now: number): Facts {
  const top = [...s.files.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  return {
    kind: 'ghost',
    title: displayName(p),
    lines: [
      `name: ${displayName(p)}`,
      `first commit: ${ymd(p.first)} ("${p.firstMessage}")`,
      `last commit: ${ymd(p.last)} ("${p.lastMessage}")`,
      `commits: ${fmtN(p.commits)}`,
      `silent for: ${age(now - p.last)}`,
      `lines still running today: ${fmtN(s.lines)}`,
      `files those lines live in: ${fmtN(s.files.size)}`,
      `most of them are in: ${top.map(([f, n]) => `${f} (${fmtN(n)} lines)`).join(', ')}`,
      ...(s.oldest ? [`oldest line of theirs still here, from ${yr(s.oldest.at)}, in ${s.oldest.file}: ${s.oldest.line}`] : []),
    ],
    code: s.oldest?.line ?? '',
    counts: [
      [p.commits, 'commits'],
      ageCount(now - p.last),
      [s.lines, 'lines'],
      [s.files.size, 'files'],
      ...top.map(([, k]) => [k, 'lines'] as [number, Unit]),
      [Math.floor(years(p.last - p.first)), 'years'],
    ],
    bornYear: yr(p.first),
    goneYear: yr(p.last),
    makers: [...p.names].map((x) => x.toLowerCase()),
    breaker: '',
  };
}

export function graveFacts(d: Death): Facts {
  return {
    kind: 'grave',
    title: d.path,
    lines: [
      `file: ${d.path}`,
      `born: ${ymd(d.born)}, written by ${d.bornBy} ("${d.bornMessage}")`,
      `died: ${ymd(d.died)}, removed by ${d.diedBy}`,
      `cause of death (the commit that deleted it): "${d.causeOfDeath}"`,
      `lived: ${age(d.died - d.born)}`,
      `size at death: ${fmtN(d.lines)} lines`,
      `commits in its life: ${fmtN(d.commits)}`,
      `people who changed it: ${d.authors.slice(0, 4).join(', ')}${d.authors.length > 4 ? ` and ${d.authors.length - 4} more` : ''}`,
    ],
    code: d.snippet,
    counts: [ageCount(d.died - d.born), [d.lines, 'lines'], [d.commits, 'commits'], [d.authors.length, 'people']],
    bornYear: yr(d.born),
    goneYear: yr(d.died),
    makers: [d.bornBy, ...d.authors].map((x) => x.toLowerCase()),
    breaker: d.diedBy.toLowerCase(),
  };
}

export function promptFor(f: Facts, mistake?: string): string {
  const who =
    f.kind === 'ghost'
      ? 'a person who no longer works on this project, but whose code still runs in it'
      : 'a source file that was deleted from this project';
  return `Write a short remembrance for ${who}, in the spirit of Día de los Muertos: warm, a little eerie, never mocking. It will be carved on a tombstone on a graveyard page for the repository.

Rules:
- At most 2 sentences and 40 words.
- Use ONLY the facts below. Do not invent any number, date, month, name, file, function or event.
- You may say what the code did if the code shows it.
- Plain text only. No title, no quotation of these rules.
${mistake ? `\nYour last attempt was rejected because it mentioned ${mistake}, which is not in the facts. Leave it out.\n` : ''}
Facts:
${f.lines.join('\n')}
${f.code ? `\nCode:\n${f.code}` : ''}

Remembrance:`;
}

// ---------- the checker ----------

const SMALL: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70,
  eighty: 80, ninety: 90, dozen: 12, dozens: 12, decade: 10, decades: 10,
};
const SCALE: Record<string, number> = { hundred: 100, hundreds: 100, thousand: 1000, thousands: 1000 };
const NUMBER_PHRASE = new RegExp(
  `\\b(?:${[...Object.keys(SMALL), ...Object.keys(SCALE)].join('|')})(?:[\\s-]+(?:and[\\s-]+)?(?:${[...Object.keys(SMALL), ...Object.keys(SCALE)].join('|')}))*\\b`,
  'gi',
);

/** "eighty-four" → 84, "two hundred" → 200, "twenty-eleven" → 2011 (said like a year). */
export function wordsToNumber(phrase: string): number | null {
  const parts = phrase.toLowerCase().split(/[\s-]+/).filter((w) => w && w !== 'and');
  // Years said aloud: "twenty-eleven", "nineteen ninety-nine".
  if (parts.length >= 2 && (parts[0] === 'twenty' || parts[0] === 'nineteen') && !(parts[1] in SCALE)) {
    const rest = wordsToNumber(parts.slice(1).join(' '));
    if (rest !== null && rest >= 10 && rest < 100) return SMALL[parts[0]] * 100 + rest;
  }
  let total = 0;
  let current = 0;
  for (const w of parts) {
    if (w in SMALL) current += SMALL[w];
    else if (w in SCALE) {
      current = (current || 1) * SCALE[w];
      if (SCALE[w] >= 1000) (total += current), (current = 0);
    } else return null;
  }
  return total + current;
}

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];

// Capitalised words that are ordinary English (or the occasion), not names.
const ORDINARY = new Set(
  `a an and as at but by for from here in into it its now of on or so the their them they this those to was were what when where who whose with yet
  rest peace day dead muertos día dia los las de del ghost ghosts spirit spirits remember remembered remembering still today tonight forever always never
  once every each some many few all no not only even though though although while may light candle candles marigold marigolds stone grave graves
  beloved gone lost left loved born died lived lives life code lines line file files commit commits project repository repo world night soul souls
  you your we our us he she his her him hers i my me one two three four five six seven eight nine ten`.split(/\s+/),
);

/** Lowercased words, numbers and identifiers that the facts and the code allow. */
function allowed(f: Facts) {
  const text = `${f.title}\n${f.lines.join('\n')}\n${f.code}`;
  const nums = new Set<number>();
  for (const m of text.matchAll(/\d[\d,]*(\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ''));
    nums.add(n);
    nums.add(Math.round(n));
  }
  // Dates in the facts allow their parts: "2014-02-19" allows 2014, February, 19.
  const months = new Set<string>();
  for (const m of text.matchAll(/(\d{4})-(\d{2})-(\d{2})/g)) {
    months.add(MONTHS[Number(m[2]) - 1]);
    nums.add(Number(m[3]));
  }
  const words = new Set(text.toLowerCase().match(/[\p{L}\p{N}_$.\/-]+/gu) ?? []);
  for (const w of [...words]) for (const part of w.split(/[._\/-]+/)) words.add(part);
  return { text: text.toLowerCase(), nums, months, words };
}

const toNumber = (t: string): number | null => {
  if (/\d/.test(t)) {
    const n = Number(t.replace(/,/g, ''));
    return Number.isFinite(n) ? n : null;
  }
  return wordsToNumber(t);
};

/** A number right before a unit word must be a fact about that unit. */
function badCount(r: string, f: Facts): string | null {
  const num = `\\d[\\d,]*|${NUMBER_PHRASE.source.replace(/^\\b|\\b$/g, '')}`;
  const re = new RegExp(`\\b(${num})(?:[\\s-]+(?:silent|long|lonely|quiet|faithful|whole|full|more|old|of))*[\\s-]+([a-z]+)\\b`, 'gi');
  for (const m of r.matchAll(re)) {
    const n = toNumber(m[1]);
    const unit = UNITS.find(([u]) => u.test(m[2].toLowerCase()))?.[1];
    if (n === null || !unit || /^(one|a)$/i.test(m[1])) continue;
    const ok = f.counts.some(([x, u]) => u === unit && (x === n || (x >= 1000 && Math.abs(x - n) / x < 0.05 && n % 100 === 0)));
    if (!ok) return `"${m[0].trim()}"`;
  }
  return null;
}

/** "born in 2014" must be the year it was born; "deleted in 2021" the year it died. */
function badYear(r: string, f: Facts): string | null {
  for (const m of r.matchAll(/\b(born|began|begun|started|arrived|first|written|created|since)\b\D{0,24}?\b((?:19|20)\d{2})\b/gi)) {
    if (Number(m[2]) !== f.bornYear && !(m[1].toLowerCase() === 'since' && Number(m[2]) === f.goneYear)) return `"${m[0]}"`;
  }
  for (const m of r.matchAll(/\b(died|deleted|removed|gone|buried|laid to rest|left|departed|fell silent|silent since|last (?:seen|commit))\b\D{0,24}?\b((?:19|20)\d{2})\b/gi)) {
    if (Number(m[2]) !== f.goneYear) return `"${m[0]}"`;
  }
  return null;
}

/** "written by X" must be someone who wrote it; "removed by Y" the one who removed it. */
function badRole(r: string, f: Facts): string | null {
  const firstWord = (name: string) => name.toLowerCase();
  const matches = (who: string, list: string[]) => list.some((x) => x === who || x.split(/\s+/).includes(who) || x.startsWith(who + ' '));
  for (const m of r.matchAll(/\b(?:written|crafted|created|authored|made|built|shaped|tended|born)\s+(?:by|to|of)\s+(\p{L}[\p{L}'-]+(?:\s\p{Lu}[\p{L}'-]+)*)/giu)) {
    if (!/^\p{Lu}/u.test(m[1])) continue; // "written by many hands" names nobody
    const who = firstWord(m[1].replace(/'s$/, ''));
    if (!matches(who, f.makers) && !matches(who.split(' ')[0], f.makers)) return `"${m[0]}"`;
  }
  if (f.kind === 'grave') {
    for (const m of r.matchAll(/\b(?:removed|deleted|silenced|retired|buried|ended|laid to rest|put to rest)\s+by\s+(\p{L}[\p{L}'-]+(?:\s\p{Lu}[\p{L}'-]+)*)/giu)) {
      if (!/^\p{Lu}/u.test(m[1])) continue;
      const who = firstWord(m[1]);
      if (!matches(who, [f.breaker]) && !matches(who.split(' ')[0], [f.breaker])) return `"${m[0]}"`;
    }
  }
  return null;
}

/** Returns what the remembrance says that the facts don't, or null if every detail checks out. */
export function unsupported(remembrance: string, f: Facts): string | null {
  const ok = allowed(f);
  const r = remembrance.replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const bound = badCount(r, f) ?? badYear(r, f) ?? badRole(r, f);
  if (bound) return bound;

  // Numbers, digits or words. Approximate wording ("over 3,000", "nearly a decade") must still
  // round to a real number, so the claim stays honest.
  for (const m of r.matchAll(/\d[\d,]*(\.\d+)?/g)) {
    const n = Number(m[0].replace(/,/g, ''));
    if (!ok.nums.has(n) && ![...ok.nums].some((x) => x >= 1000 && Math.abs(x - n) / x < 0.05 && n % 100 === 0)) return `the number ${m[0]}`;
  }
  for (const m of r.matchAll(NUMBER_PHRASE)) {
    if (/^(one|a)$/i.test(m[0])) continue;
    const n = wordsToNumber(m[0]);
    if (n === null) continue;
    const vague = /hundreds|thousands|dozens|decades/i.test(m[0]); // "hundreds of lines" just needs one big enough
    const fits = vague ? [...ok.nums].some((x) => x >= n) : ok.nums.has(n) || (/decade/i.test(m[0]) && [...ok.nums].some((x) => x >= 10 && x < 20));
    if (!fits) return `"${m[0]}"`;
  }
  for (const m of r.toLowerCase().matchAll(/\b([a-z]+)\b/g)) {
    if (MONTHS.includes(m[1]) && m[1] !== 'may' && !ok.months.has(m[1])) return `the month ${m[1]}`;
  }

  // Quoted words must be quoted from the facts or the code.
  for (const m of r.matchAll(/"([^"]{3,})"/g)) {
    if (!ok.text.includes(m[1].toLowerCase().replace(/[.,!?]+$/, ''))) return `the quote "${m[1]}"`;
  }

  // Code-looking things: file names, function calls, camelCase, snake_case, dotted paths.
  for (const m of r.matchAll(/`([^`]+)`|\b[\w$]+\.(?:js|ts|json|md|py|go|rs|rb|java|c|h|css|html|yml|yaml)\b|\b[a-z]+[A-Z]\w*\b|\b\w+_\w+\b|\b[\w$]+\(\)/g)) {
    const t = (m[1] ?? m[0]).toLowerCase().replace(/\(\)$/, '');
    if (!ok.text.includes(t)) return `"${m[1] ?? m[0]}"`;
  }

  // Capitalised words mid-sentence are usually names. They must be in the facts.
  const sentences = r.split(/(?<=[.!?;:—–-])\s+/);
  for (const s of sentences) {
    const words = s.match(/[\p{L}'][\p{L}'-]*/gu) ?? [];
    words.slice(1).forEach((w) => {
      const lw = w.toLowerCase().replace(/'s$/, '');
      if (MONTHS.includes(lw)) return; // checked above, against the real dates
      if (/^\p{Lu}/u.test(w) && !ORDINARY.has(lw) && !ok.words.has(lw) && !ok.text.includes(lw)) throw new Unsupported(`the name "${w}"`);
    });
  }
  return null;
}

class Unsupported extends Error {}

export function check(remembrance: string, f: Facts): string | null {
  try {
    return unsupported(remembrance, f);
  } catch (e) {
    if (e instanceof Unsupported) return e.message;
    throw e;
  }
}

/** Tidy Gemma's text: one paragraph, no wrapping quotes, no "Remembrance:" label. */
export function tidy(text: string): string {
  return text
    .replace(/^\s*(remembrance|epitaph)\s*:\s*/i, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^["“](.*)["”]$/, '$1');
}

/** The inscription for when Gemma can't be trusted: nothing but facts. */
export function plainInscription(f: Facts): string {
  const get = (k: string) => f.lines.find((l) => l.startsWith(k + ':'))?.slice(k.length + 2) ?? '';
  if (f.kind === 'ghost') {
    return `Last seen ${get('last commit').slice(0, 10)}. ${get('lines still running today')} of their lines still run here.`;
  }
  return `Born ${get('born').slice(0, 10)}, gone ${get('died').slice(0, 10)}. Lived ${get('lived')}.`;
}

export interface Remembrance {
  text: string;
  by: 'gemma' | 'gemma-retry' | 'facts';
  rejected: { text: string; why: string }[];
}

export async function remember(f: Facts, ask: Ask): Promise<Remembrance> {
  const rejected: Remembrance['rejected'] = [];
  let mistake: string | undefined;
  for (const [attempt, temperature] of [[0, 0.7], [1, 0.4]] as const) {
    const text = tidy(await ask(promptFor(f, mistake), temperature));
    const words = text.split(/\s+/).length;
    const why = !text ? 'it was empty' : words > 55 ? `it was ${words} words long` : check(text, f);
    if (!why) return { text, by: attempt === 0 ? 'gemma' : 'gemma-retry', rejected };
    rejected.push({ text, why });
    mistake = why;
  }
  return { text: plainInscription(f), by: 'facts', rejected };
}
