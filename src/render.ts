// The graveyard page: one self-contained HTML file per repository.

import type { Graveyard, Stone } from './cli.ts';

const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const yr = (ms: number) => new Date(ms).getUTCFullYear();
const day = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const n = (x: number) => x.toLocaleString('en-US');
const life = (ms: number) => {
  const y = ms / (365.25 * 86_400_000);
  return y >= 1 ? `${Math.floor(y)} year${Math.floor(y) === 1 ? '' : 's'}` : `${Math.round(ms / 86_400_000)} days`;
};

function badge(s: Stone) {
  const r = s.remembrance;
  const title =
    r.by === 'facts'
      ? `Gemma's words were rejected (${r.rejected.map((x) => x.why).join('; ')}), so the stone carries plain facts.`
      : `Written by Gemma. Every name, number, date and file in it was checked against git${r.by === 'gemma-retry' ? ` (first try rejected: ${r.rejected[0].why})` : ''}.`;
  return `<span class="badge ${r.by}" title="${esc(title)}">${r.by === 'facts' ? 'plain facts' : 'checked against git'}</span>`;
}

function ghost(s: Stone, repo: string) {
  const m = s.meta as Record<string, any>;
  return `<article class="ghost">
    <button class="candle" aria-label="Light a candle for ${esc(m.name)}"><span class="flame"></span></button>
    <h3>${esc(m.name)}</h3>
    <p class="years">${yr(m.first)} – ${yr(m.last)} · silent since ${day(m.last)}</p>
    <p class="haunt"><b>${n(m.lines)}</b> of their lines still run, in ${n(m.files)} file${m.files === 1 ? '' : 's'}</p>
    <blockquote>${esc(s.remembrance.text)}</blockquote>
    ${m.oldestLine ? `<p class="oldest">oldest line still here, from ${yr(m.oldestAt)}<br><code>${esc(m.oldestLine)}</code><span class="where">${esc(m.oldestFile)}</span></p>` : ''}
    ${badge(s)}
  </article>`;
}

function grave(s: Stone, repo: string, siblings: Stone[] = []) {
  const m = s.meta as Record<string, any>;
  const family = siblings.length
    ? `<details class="family"><summary>family plot · ${siblings.length} more laid to rest by the same commit</summary><ul>${siblings
        .map((x) => `<li><code>${esc(x.meta.path)}</code> <span>${yr(Number(x.meta.born))} – ${yr(Number(x.meta.died))}</span></li>`)
        .join('')}</ul></details>`
    : '';
  const file = String(m.path);
  const base = file.split('/').pop();
  return `<article class="grave">
    <div class="stone">
      <p class="rip">here lies</p>
      <h3 title="${esc(file)}">${esc(base)}</h3>
      <p class="path">${esc(file)}</p>
      <p class="dates">${yr(m.born)} – ${yr(m.died)}</p>
      <p class="lived">lived ${life(m.died - m.born)} · ${n(m.lines)} lines · ${n(m.commits)} commits</p>
      <blockquote>${esc(s.remembrance.text)}</blockquote>
      <p class="cause"><span>cause of death</span> <a href="https://github.com/${esc(repo)}/commit/${esc(m.hash)}" rel="noopener">“${esc(m.cause)}”</a></p>
      <p class="by">born to ${esc(m.bornBy)} · laid to rest by ${esc(m.diedBy)}</p>
      ${badge(s)}
      ${family}
    </div>
  </article>`;
}

/** Files deleted together by one commit share a plot: one stone, the siblings listed under it. */
function plots(graves: Stone[]): [Stone, Stone[]][] {
  const byCommit = new Map<string, Stone[]>();
  for (const g of graves) byCommit.set(String(g.meta.hash), [...(byCommit.get(String(g.meta.hash)) ?? []), g]);
  const used = new Set<Stone>();
  const out: [Stone, Stone[]][] = [];
  for (const g of graves) {
    if (used.has(g)) continue;
    const group = byCommit.get(String(g.meta.hash))!;
    if (group.length >= 3) {
      out.push([group[0], group.slice(1)]);
      group.forEach((x) => used.add(x));
    } else {
      out.push([g, []]);
      used.add(g);
    }
  }
  return out;
}

export function render(y: Graveyard): string {
  const all = [...y.ghosts, ...y.graves];
  const checked = all.filter((s) => s.remembrance.by !== 'facts').length;
  const caught = all.reduce((k, s) => k + s.remembrance.rejected.length, 0);
  const totalLines = y.ghosts.reduce((k, s) => k + Number(s.meta.lines), 0);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Bhoot · ${esc(y.repo)}</title>
<meta name="description" content="The ghosts and graves of ${esc(y.repo)}, read from its git history and remembered by a local Gemma.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,500;0,700;1,500&family=Inter:wght@400;600&family=JetBrains+Mono:wght@400&family=Tiro+Devanagari+Hindi&display=swap" rel="stylesheet">
<style>
:root{--night:#0d0b14;--night2:#17131f;--stone:#2a2633;--stone2:#3a3545;--bone:#efe6d6;--dim:#a79fb3;--marigold:#f5a524;--marigold2:#e8710a;--candle:#ffd27a}
*{box-sizing:border-box}
html,body{margin:0}
body{background:radial-gradient(1200px 600px at 70% -10%,#2b2140 0,transparent 60%),var(--night);color:var(--bone);font:16px/1.6 Inter,system-ui,sans-serif}
main{max-width:1160px;margin:0 auto;padding:56px 20px 80px}
header{display:grid;gap:10px;margin-bottom:44px}
.eyebrow{font-family:'Tiro Devanagari Hindi',serif;color:var(--marigold);letter-spacing:.04em;font-size:18px;margin:0}
h1{font:700 clamp(46px,9vw,92px)/1 'Cormorant Garamond',serif;margin:0;letter-spacing:-.01em}
h1 span{color:var(--marigold)}
.lede{font-size:19px;color:var(--dim);max-width:760px;margin:6px 0 0}
.lede b{color:var(--bone)}
.stats{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}
.stats span{background:var(--night2);border:1px solid #2f2840;border-radius:999px;padding:6px 14px;font-size:14px;color:var(--dim)}
.stats b{color:var(--candle)}
h2{font:700 38px/1.1 'Cormorant Garamond',serif;margin:56px 0 6px}
h2+p{color:var(--dim);margin:0 0 22px;max-width:760px}
.ghosts{display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:18px}
.ghost{position:relative;background:linear-gradient(180deg,rgba(239,230,214,.07),rgba(239,230,214,.02));border:1px solid rgba(239,230,214,.12);border-radius:20px;padding:22px 22px 18px;overflow:hidden}
.ghost::after{content:'';position:absolute;right:-30px;top:-30px;width:140px;height:140px;background:radial-gradient(circle,rgba(255,210,122,.10),transparent 70%);pointer-events:none}
.ghost h3{font:700 28px/1.1 'Cormorant Garamond',serif;margin:0 46px 4px 0}
.years{margin:0;color:var(--dim);font-size:14px}
.haunt{margin:10px 0;font-size:16px}.haunt b{color:var(--candle);font-size:22px}
blockquote{margin:12px 0;font:italic 500 20px/1.4 'Cormorant Garamond',serif;color:var(--bone)}
.oldest{font-size:13px;color:var(--dim);margin:10px 0 12px}
.oldest code{display:block;margin-top:4px;font:13px/1.45 'JetBrains Mono',monospace;color:#d7cce6;background:rgba(0,0,0,.3);padding:8px 10px;border-radius:8px;overflow-wrap:anywhere}
.where{display:block;margin-top:4px;font-size:12px}
.candle{position:absolute;top:18px;right:18px;width:30px;height:44px;border:0;background:none;cursor:pointer;padding:0}
.candle::before{content:'';position:absolute;bottom:0;left:9px;width:12px;height:26px;border-radius:3px;background:linear-gradient(#f3ead8,#cbbfa8)}
.flame{position:absolute;left:10px;bottom:26px;width:10px;height:14px;border-radius:50% 50% 50% 50%/60% 60% 40% 40%;background:radial-gradient(circle at 50% 70%,#fff6d6,var(--candle) 40%,var(--marigold2));opacity:.18;transition:opacity .4s;filter:blur(.3px)}
.candle.lit .flame{opacity:1;animation:flicker 1.6s infinite ease-in-out}
@keyframes flicker{50%{transform:scale(.92) rotate(-3deg) translateY(1px)}}
.graves{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:22px 18px;align-items:end}
.stone{background:linear-gradient(180deg,var(--stone2),var(--stone));border-radius:120px 120px 10px 10px;padding:30px 20px 18px;text-align:center;box-shadow:inset 0 2px 0 rgba(255,255,255,.06),0 18px 30px rgba(0,0,0,.35);border-bottom:6px solid #1c1924;position:relative}
.stone::after{content:'';position:absolute;left:-12px;right:-12px;bottom:-16px;height:14px;border-radius:50%;background:radial-gradient(ellipse at center,rgba(245,165,36,.25),transparent 70%)}
.rip{margin:0;text-transform:uppercase;letter-spacing:.2em;font-size:11px;color:var(--dim)}
.stone h3{font:700 24px/1.15 'Cormorant Garamond',serif;margin:6px 0 2px;overflow-wrap:anywhere}
.path{margin:0;font:12px 'JetBrains Mono',monospace;color:var(--dim);overflow-wrap:anywhere}
.dates{margin:8px 0 0;font:700 22px 'Cormorant Garamond',serif;color:var(--marigold)}
.lived{margin:0;font-size:12.5px;color:var(--dim)}
.stone blockquote{font-size:18px}
.cause{font-size:13px;margin:8px 0 4px}.cause span{display:block;text-transform:uppercase;letter-spacing:.14em;font-size:10px;color:var(--dim)}
.cause a{color:var(--bone);text-decoration-color:rgba(245,165,36,.5)}
.by{font-size:12px;color:var(--dim);margin:6px 0 10px}
.badge{display:inline-block;font-size:11px;letter-spacing:.04em;padding:3px 10px;border-radius:999px;border:1px solid rgba(245,165,36,.4);color:var(--marigold);cursor:help}
.badge.facts{border-color:rgba(167,159,179,.4);color:var(--dim)}
.family{margin-top:10px;text-align:left;font-size:12.5px;color:var(--dim)}.family summary{cursor:pointer;color:var(--marigold);text-align:center}.family ul{list-style:none;padding:0;margin:8px 0 0;max-height:220px;overflow:auto}.family li{display:flex;justify-content:space-between;gap:8px;padding:3px 0;border-top:1px solid rgba(255,255,255,.06)}.family code{font-size:11.5px;overflow-wrap:anywhere}
footer{margin-top:70px;color:var(--dim);font-size:14px;border-top:1px solid #2a2338;padding-top:20px}
footer a{color:var(--marigold)}
.marigolds{position:fixed;inset:auto 0 0 0;height:6px;background:repeating-linear-gradient(90deg,var(--marigold) 0 18px,var(--marigold2) 18px 36px);opacity:.75}
@media (prefers-reduced-motion:reduce){.candle.lit .flame{animation:none}}
</style>
</head>
<body>
<main>
<header>
  <p class="eyebrow">भूत · bhoot · ghost, and the past</p>
  <h1>The ghosts of <span>${esc(y.repo)}</span></h1>
  <p class="lede">People who left long ago but whose code still runs, and files that lived and died in the history. Read from git on one laptop. Remembered by <b>${esc(y.model)}</b>, running locally. Every name, number, date and file Gemma wrote was <b>checked against git</b> before it was carved.</p>
  <div class="stats">
    <span><b>${y.ghosts.length}</b> ghosts still running <b>${n(totalLines)}</b> lines</span>
    <span><b>${y.graves.length}</b> graves, of ${n(y.stats.deaths)} files that died</span>
    <span><b>${checked}</b> of ${all.length} remembrances by Gemma</span>
    <span><b>${caught}</b> invented details caught</span>
  </div>
</header>

<h2>Still haunting</h2>
<p>They haven't committed in a long time. Their code didn't get the message. Light a candle.</p>
<section class="ghosts">${y.ghosts.map((s) => ghost(s, y.repo)).join('\n')}</section>

<h2>The departed</h2>
<p>Files that were born, changed, and deleted. The cause of death is the commit that removed them.</p>
<section class="graves">${plots(y.graves).map(([s, sib]) => grave(s, y.repo, sib)).join('\n')}</section>

<footer>Made with <a href="https://github.com/codeswithroh/bhoot">Bhoot</a> from the history at ${esc(day(y.head))}. Hover a badge to see what was checked, or what was thrown out.</footer>
</main>
<div class="marigolds" aria-hidden="true"></div>
<script>
const key='bhoot-candles:${esc(y.repo)}';
let lit={};try{lit=JSON.parse(localStorage.getItem(key)||'{}')}catch(e){}
document.querySelectorAll('.candle').forEach((c,i)=>{
  if(lit[i])c.classList.add('lit');
  c.addEventListener('click',()=>{c.classList.toggle('lit');lit[i]=c.classList.contains('lit');try{localStorage.setItem(key,JSON.stringify(lit))}catch(e){}});
});
</script>
</body>
</html>`;
}
