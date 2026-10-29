// Bhoot dashboard. Reads /<repo>/data.json (graveyard.json plus git stats) and draws it.

const REPOS = { express: 'expressjs/express', request: 'request/request', underscore: 'jashkenas/underscore' };
const REPO_TINT = { express: '#ffd34d', request: '#c7a6f7', underscore: '#bfe6b8' };
const PALETTE = ['#ffd34d', '#c7a6f7', '#ffb3a0', '#bfe6b8', '#a7d8f0', '#ffcf9e', '#e8c6f2', '#d9e98f'];
// Overall checker results, from eval/labels.json (see README "Numbers").
const EVAL = { devCaught: '22/22', devFalseAlarm: '0/56', heldCaught: '3/3', heldFalseAlarm: '1/13' };

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const n = (x) => Number(x).toLocaleString('en-US');
const yr = (ms) => new Date(ms).getUTCFullYear();
const day = (ms) => new Date(ms).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const hash = (s) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const tint = (name) => PALETTE[hash(name) % PALETTE.length];
const initials = (name) => {
  const parts = name.replace(/[^\p{L}\s-]/gu, '').split(/[\s-]+/).filter(Boolean);
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : name.slice(0, 2)).toUpperCase();
};
const base = (p) => String(p).split('/').pop();
const life = (ms) => {
  const y = ms / (365.25 * 864e5);
  return y >= 1 ? `${Math.floor(y)}y` : `${Math.round(ms / 864e5)}d`;
};

let repo = new URLSearchParams(location.search).get('repo');
if (!REPOS[repo]) repo = 'express';
let data = null;
const cache = {};
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};

// ---------- tooltip ----------
const tip = $('#tip');
document.addEventListener('pointerover', (e) => {
  const t = e.target.closest('[data-tip]');
  if (!t) return;
  tip.textContent = t.dataset.tip;
  tip.hidden = false;
});
document.addEventListener('pointermove', (e) => {
  if (tip.hidden) return;
  if (!e.target.closest('[data-tip]')) return void (tip.hidden = true);
  tip.style.left = e.clientX + 'px';
  tip.style.top = e.clientY + 'px';
});
document.addEventListener('pointerout', (e) => { if (e.target.closest('[data-tip]')) tip.hidden = true; });

// ---------- shell ----------
function shell() {
  $('#repoSel').value = repo;
  $('#swAva').textContent = REPOS[repo][0].toUpperCase();
  $('#swAva').style.background = REPO_TINT[repo];
  $('#crumb').textContent = REPOS[repo];
  $('#nGhosts').textContent = data.ghosts.length;
  $('#nGraves').textContent = data.graves.length;
  const caught = data.ghosts.concat(data.graves).reduce((k, s) => k + s.remembrance.rejected.length, 0);
  $('#nCaught').textContent = caught;
  $('#repos').innerHTML = Object.entries(REPOS)
    .map(([k, v]) => `<a href="?repo=${k}${location.hash}" class="${k === repo ? 'on' : ''}"><span class="dot" style="background:${REPO_TINT[k]}"></span>${esc(v.split('/')[1])}<small>${esc(v.split('/')[0])}</small></a>`)
    .join('');
  const g = data.ghosts;
  $('#stack').innerHTML =
    g.slice(0, 4).map((s) => `<span style="background:${tint(s.meta.name)}" data-tip="${esc(s.meta.name)}">${esc(initials(s.meta.name))}</span>`).join('') +
    (g.length > 4 ? `<span style="background:#fff">+${g.length - 4}</span>` : '');
  document.title = `Bhoot · ${REPOS[repo]}`;
}

$('#repoSel').addEventListener('change', (e) => { location.search = `?repo=${e.target.value}`; });
$('#burger').addEventListener('click', () => $('#side').classList.toggle('open'));
$('#copyCmd').addEventListener('click', async (e) => {
  try { await navigator.clipboard.writeText('node src/cli.ts /path/to/your/repo --out graveyard'); } catch {}
  e.target.textContent = 'Copied';
  setTimeout(() => (e.target.textContent = 'Copy command'), 1600);
});

// ---------- candles ----------
const candleKey = () => `bhoot:candles:${repo}`;
const lit = () => store.get(candleKey()) || {};
function candle(name) {
  const on = lit()[name];
  return `<button class="candle ${on ? 'lit' : ''}" data-candle="${esc(name)}" aria-pressed="${!!on}" aria-label="Light a candle for ${esc(name)}">
    <svg viewBox="0 0 34 40"><path class="fl" d="M17 15C11 9 15 4 17 1c3 4 6 9 0 14z" fill="#ffd34d" stroke="#141414" stroke-width="1.6"/><rect x="11" y="16" width="12" height="22" rx="3" fill="#fff6e5" stroke="#141414" stroke-width="1.6"/></svg>
  </button>`;
}
document.addEventListener('click', (e) => {
  const c = e.target.closest('[data-candle]');
  if (!c) return;
  e.stopPropagation();
  const l = lit();
  l[c.dataset.candle] = !l[c.dataset.candle];
  store.set(candleKey(), l);
  c.classList.toggle('lit', l[c.dataset.candle]);
  c.setAttribute('aria-pressed', !!l[c.dataset.candle]);
  syncLightAll();
}, true);
function syncLightAll() {
  const l = lit();
  $('#lightAll').classList.toggle('on', data.ghosts.every((g) => l[g.meta.name]));
}
$('#lightAll').addEventListener('click', () => {
  const l = lit();
  const all = data.ghosts.every((g) => l[g.meta.name]);
  data.ghosts.forEach((g) => (l[g.meta.name] = !all));
  store.set(candleKey(), l);
  document.querySelectorAll('[data-candle]').forEach((c) => c.classList.toggle('lit', !!l[c.dataset.candle]));
  syncLightAll();
});

// ---------- charts ----------
function donut(slices, total, centre, label) {
  const R = 70, r = 46, C = 90;
  let a = -Math.PI / 2;
  const arcs = slices.map((s) => {
    const sweep = (s.v / total) * Math.PI * 2;
    const a2 = a + sweep;
    const large = sweep > Math.PI ? 1 : 0;
    const p = (rad, ang) => `${C + rad * Math.cos(ang)},${C + rad * Math.sin(ang)}`;
    const d = `M${p(R, a)}A${R},${R} 0 ${large} 1 ${p(R, a2)}L${p(r, a2)}A${r},${r} 0 ${large} 0 ${p(r, a)}Z`;
    a = a2;
    return `<path d="${d}" fill="${s.c}" stroke="#fff" stroke-width="2" data-tip="${esc(s.label)} · ${n(s.v)} lines (${Math.round((100 * s.v) / total)}%)"/>`;
  });
  return `<svg class="chart" viewBox="0 0 180 180" role="img" aria-label="${esc(label)}">${arcs.join('')}
    <text x="90" y="88" text-anchor="middle" font-family="Plus Jakarta Sans" font-weight="800" font-size="26" fill="#141414">${centre}</text>
    <text x="90" y="107" text-anchor="middle" font-family="Plus Jakarta Sans" font-weight="600" font-size="10.5" fill="#6b6860">${esc(label)}</text></svg>`;
}

function bars(entries, { h = 170, W = 420, label = (k, v) => `${k} · ${n(v)}`, unit = '' } = {}) {
  const pad = 22, gap = 4;
  const max = Math.max(...entries.map(([, v]) => v), 1);
  const bw = (W - pad) / entries.length - gap;
  const top = entries.reduce((b, e) => (e[1] > b[1] ? e : b), entries[0]);
  const step = Math.ceil(entries.length / 8);
  const rects = entries.map(([k, v], i) => {
    const bh = Math.max(2, ((h - 34) * v) / max);
    const x = pad + i * (bw + gap);
    const y = h - 18 - bh;
    const hi = k === top[0];
    return `<rect x="${x}" y="${y}" width="${Math.max(bw, 2)}" height="${bh}" rx="${Math.min(6, bw / 2)}" fill="${hi ? '#141414' : '#d9c6f8'}" data-tip="${esc(label(k, v))}"/>` +
      (i % step === 0 || hi ? `<text x="${x + bw / 2}" y="${h - 3}" text-anchor="middle" font-size="10" font-weight="600" fill="#a19d93" font-family="Plus Jakarta Sans">${esc(String(k).slice(-2) === k ? k : "'" + String(k).slice(-2))}</text>` : '') +
      (hi ? `<g transform="translate(${x + bw / 2},${y - 8})"><rect x="-30" y="-20" width="60" height="18" rx="9" fill="#141414"/><text y="-7" text-anchor="middle" fill="#fff" font-size="10.5" font-weight="700" font-family="Plus Jakarta Sans">${n(v)}${unit}</text></g>` : '');
  });
  return `<svg class="chart" viewBox="0 0 ${W} ${h}" role="img">${rects.join('')}</svg>`;
}

function gauge(value, total, label) {
  const pct = total ? value / total : 0;
  const R = 78, C = 100, sw = 16;
  const p = (ang) => `${C + R * Math.cos(ang)},${C + R * Math.sin(ang)}`;
  const start = Math.PI * 0.8, end = Math.PI * 2.2;
  const mid = start + (end - start) * pct;
  const arc = (a1, a2) => `M${p(a1)}A${R},${R} 0 ${a2 - a1 > Math.PI ? 1 : 0} 1 ${p(a2)}`;
  const ticks = Array.from({ length: 31 }, (_, i) => {
    const ang = start + ((end - start) * i) / 30;
    const r1 = R + 16, r2 = R + 21;
    return `<line x1="${C + r1 * Math.cos(ang)}" y1="${C + r1 * Math.sin(ang)}" x2="${C + r2 * Math.cos(ang)}" y2="${C + r2 * Math.sin(ang)}" stroke="${i / 30 <= pct ? '#141414' : '#e2ddd3'}" stroke-width="2" stroke-linecap="round"/>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 200 170" role="img" aria-label="${esc(label)}">
    ${ticks}
    <path d="${arc(start, end)}" fill="none" stroke="#efe5fd" stroke-width="${sw}" stroke-linecap="round"/>
    <path d="${arc(start, mid)}" fill="none" stroke="#c7a6f7" stroke-width="${sw}" stroke-linecap="round" data-tip="${value} of ${total}"/>
    <circle cx="${C + R * Math.cos(mid)}" cy="${C + R * Math.sin(mid)}" r="9" fill="#fff" stroke="#141414" stroke-width="2.5"/>
    <text x="100" y="104" text-anchor="middle" font-family="Plus Jakarta Sans" font-weight="800" font-size="34" fill="#141414">${Math.round(pct * 100)}%</text>
    <text x="100" y="124" text-anchor="middle" font-family="Plus Jakarta Sans" font-weight="600" font-size="11" fill="#6b6860">${value} of ${total}</text>
  </svg>`;
}

function spark(series, w = 220, h = 46, color = '#141414') {
  const max = Math.max(...series, 1);
  const step = w / Math.max(series.length - 1, 1);
  const pts = series.map((v, i) => `${(i * step).toFixed(1)},${(h - 4 - ((h - 8) * v) / max).toFixed(1)}`);
  return `<svg class="chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
    <path d="M0,${h} L${pts.join(' L')} L${w},${h} Z" fill="${color}" opacity=".08"/>
    <path d="M${pts.join(' L')}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
}

function heatmap(monthly, head) {
  const years = Object.keys(monthly).map((m) => +m.slice(0, 4));
  const y0 = Math.min(...years), y1 = yr(head);
  const max = Math.max(...Object.values(monthly));
  const shade = (v) => (!v ? '#efece5' : v < max * 0.1 ? '#e7dcfb' : v < max * 0.25 ? '#d2bcf6' : v < max * 0.5 ? '#ad8aeb' : v < max * 0.75 ? '#7b55c9' : '#3e2a72');
  const ys = [];
  for (let y = y0; y <= y1; y++) ys.push(y);
  let cells = '<span></span>' + ys.map((y) => `<span class="ml">${y % 2 ? '' : "'" + String(y).slice(2)}</span>`).join('');
  for (let m = 1; m <= 12; m++) {
    cells += `<span class="yl">${m % 3 === 1 ? MON[m - 1] : ''}</span>`;
    for (const y of ys) {
      const k = `${y}-${String(m).padStart(2, '0')}`;
      const v = monthly[k] || 0;
      cells += `<span class="c" style="background:${shade(v)}" data-tip="${MON[m - 1]} ${y} · ${n(v)} commit${v === 1 ? '' : 's'}"></span>`;
    }
  }
  return `<div class="heat" style="grid-template-columns:32px repeat(${y1 - y0 + 1},minmax(0,1fr))">${cells}</div>
    <div class="legend"><span>less</span>${['#efece5', '#e7dcfb', '#d2bcf6', '#ad8aeb', '#7b55c9', '#3e2a72'].map((c) => `<i style="background:${c}"></i>`).join('')}<span>more</span></div>`;
}

function monthsRange() {
  const ks = Object.keys(data.monthly).sort();
  const [a] = ks;
  const out = [];
  let y = +a.slice(0, 4), m = +a.slice(5);
  const endY = yr(data.head), endM = new Date(data.head).getUTCMonth() + 1;
  while (y < endY || (y === endY && m <= endM)) {
    out.push(`${y}-${String(m).padStart(2, '0')}`);
    if (++m > 12) (m = 1), y++;
  }
  return out;
}

const ICONS = {
  ghost: '<svg width="20" height="22" viewBox="0 0 30 34"><path d="M3 30V14C3 7 8 2 15 2s12 5 12 12v16l-4-3-4 3-4-3-4 3-4-3z" fill="#fff" stroke="#141414" stroke-width="2.4" stroke-linejoin="round"/><circle cx="11" cy="14" r="2" fill="#141414"/><circle cx="19" cy="14" r="2" fill="#141414"/></svg>',
  code: '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M8 7l-5 5 5 5M16 7l5 5-5 5" fill="none" stroke="#141414" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  grave: '<svg width="18" height="22" viewBox="0 0 26 30"><path d="M2 28V13C2 6 7 2 13 2s11 4 11 11v15z" fill="#fff" stroke="#141414" stroke-width="2.4" stroke-linejoin="round"/><path d="M13 8v12M8 12h10" stroke="#141414" stroke-width="2.4" stroke-linecap="round"/></svg>',
  check: '<svg width="20" height="20" viewBox="0 0 24 24"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="#141414" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  link: '<svg width="13" height="13" viewBox="0 0 24 24"><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  cal: '<svg width="13" height="13" viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M4 10h16M9 3v4M15 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
};

const badge = (r) =>
  r.by === 'gemma' ? '<span class="badge ok">✓ checked</span>' : r.by === 'gemma-retry' ? '<span class="badge re">↻ after a retry</span>' : '<span class="badge fx">plain facts</span>';

// ---------- views ----------
function overview() {
  const all = data.ghosts.concat(data.graves);
  const caught = all.reduce((k, s) => k + s.remembrance.rejected.length, 0);
  const byGemma = all.filter((s) => s.remembrance.by !== 'facts').length;
  const firstTry = all.filter((s) => s.remembrance.by === 'gemma').length;
  const pct = Math.round((100 * data.ghostLines) / data.headLines);
  const top = [...data.ghosts].sort((a, b) => b.meta.lines - a.meta.lines);
  const slices = top.slice(0, 5).map((g) => ({ v: g.meta.lines, c: tint(g.meta.name), label: g.meta.name }));
  const restG = Math.max(0, data.ghostLines - slices.reduce((k, s) => k + s.v, 0));
  if (restG) slices.push({ v: restG, c: '#efe5fd', label: 'Other ghosts' });
  slices.push({ v: Math.max(0, data.headLines - data.ghostLines), c: '#e7e3da', label: 'Everyone still active' });
  const age = Object.entries(data.ageOfCode).sort();

  return `
  <div class="head"><div><h1>${esc(REPOS[repo])}</h1><p>${n(data.commits)} commits · ${n(data.stats.people)} people · read ${day(data.head)}</p></div></div>
  <div class="banner"><span class="gi">${ICONS.ghost}</span><p><b>Gemma wrote ${all.length} remembrances.</b> Git threw out ${caught} made-up detail${caught === 1 ? '' : 's'}.</p><button data-go="checker">See them</button></div>
  <div class="kpis">
    <button class="kpi" data-go="ghosts"><div class="row"><span class="ico" style="background:var(--yellow2)">${ICONS.ghost}</span><span class="more">View ›</span></div><b>${data.ghosts.length}</b><span>Ghosts</span></button>
    <button class="kpi" data-go="ghosts"><div class="row"><span class="ico" style="background:var(--purple2)">${ICONS.code}</span><span class="more">View ›</span></div><b>${n(data.ghostLines)}<small style="background:var(--purple2)">${pct}%</small></b><span>Lines still haunting</span></button>
    <button class="kpi" data-go="graves"><div class="row"><span class="ico" style="background:var(--pink2)">${ICONS.grave}</span><span class="more">View ›</span></div><b>${n(data.stats.deaths)}</b><span>Files that died</span></button>
    <button class="kpi" data-go="checker"><div class="row"><span class="ico" style="background:var(--green2)">${ICONS.check}</span><span class="more">View ›</span></div><b>${byGemma}/${all.length}</b><span>Carved in Gemma's words</span></button>
  </div>
  <div class="grid g3">
    <div class="box"><div class="bh"><h3>Whose code runs today</h3><small>${n(data.headLines)} lines</small></div>
      <div class="donut">${donut(slices, data.headLines, pct + '%', 'by ghosts')}</div>
      <div class="legend">${slices.map((s) => `<span><i style="background:${s.c}"></i>${esc(s.label.split(' ')[0])}</span>`).join('')}</div></div>
    <div class="box"><div class="bh"><h3>Age of the running code</h3><small>lines by year written</small></div>
      ${bars(age, { label: (k, v) => `written in ${k} · ${n(v)} lines` })}</div>
    <div class="box"><div class="bh"><h3>Gemma's first try</h3><small>no retry</small></div>
      <div class="donut">${gauge(firstTry, all.length, "Gemma's first try")}</div></div>
  </div>
  <div class="grid g2" style="margin-top:14px">
    <div class="box"><div class="bh"><h3>Commits, month by month</h3><small>${Object.keys(data.monthly)[0].slice(0, 4)} to ${yr(data.head)}</small></div>${heatmap(data.monthly, data.head)}</div>
    <div class="box"><div class="bh"><h3>Most haunting</h3><small>share of today's code</small></div>
      <div class="lst">${top.slice(0, 7).map((g) => `
        <div class="it" data-open="g:${esc(g.meta.name)}">
          <span class="ava" style="background:${tint(g.meta.name)}">${esc(initials(g.meta.name))}</span>
          <div style="min-width:0;flex:0 1 150px"><div class="nm">${esc(g.meta.name)}</div><div class="sub">silent since ${yr(g.meta.last)}</div></div>
          <span class="bar"><i style="width:${(100 * g.meta.lines) / data.headLines}%;background:${tint(g.meta.name)};box-shadow:inset 0 0 0 1px rgba(0,0,0,.25)"></i></span>
          <span class="num">${n(g.meta.lines)}</span>
        </div>`).join('')}</div></div>
  </div>`;
}

let ghostSort = 'lines';
function ghosts() {
  const months = monthsRange();
  const list = [...data.ghosts].sort((a, b) => (ghostSort === 'lines' ? b.meta.lines - a.meta.lines : a.meta.last - b.meta.last));
  return `
  <div class="head"><div><h1>Ghosts</h1><p>${data.ghosts.length} people who left. Their code didn't.</p></div>
    <div class="seg" role="tablist"><button class="${ghostSort === 'lines' ? 'on' : ''}" data-sort="lines">Most lines</button><button class="${ghostSort === 'silent' ? 'on' : ''}" data-sort="silent">Longest silent</button></div></div>
  <div class="cards">${list.map((g) => {
    const m = g.meta;
    const series = months.map((k) => (data.ghostMonthly[m.name] || {})[k] || 0);
    const silent = Math.floor((data.head - m.last) / (365.25 * 864e5));
    return `<div class="gcard" data-open="g:${esc(m.name)}" tabindex="0" role="button" aria-label="${esc(m.name)}">
      ${candle(m.name)}
      <div class="r1"><span class="ava" style="background:${tint(m.name)}">${esc(initials(m.name))}</span><div><div class="nm">${esc(m.name)}</div><div class="yrs">${yr(m.first)} – ${yr(m.last)}</div></div></div>
      <div class="big">${n(m.lines)}<span>lines still run</span></div>
      ${spark(series, 220, 46, '#7b55c9')}
      <div class="pills"><span class="pill r">silent ${silent}y</span><span class="pill">${n(m.commits)} commit${m.commits === 1 ? '' : 's'}</span><span class="pill p">${n(m.files)} files</span></div>
    </div>`;
  }).join('')}</div>`;
}

function plots() {
  const byHash = {};
  data.graves.forEach((g) => (byHash[g.meta.hash] = [...(byHash[g.meta.hash] || []), g]));
  const used = new Set();
  const out = [];
  for (const g of data.graves) {
    if (used.has(g)) continue;
    const grp = byHash[g.meta.hash];
    if (grp.length >= 3) { grp.forEach((x) => used.add(x)); out.push([grp[0], grp.slice(1)]); } else { used.add(g); out.push([g, []]); }
  }
  return out;
}

function graves() {
  const span = [Math.min(...data.graves.map((g) => g.meta.born)), data.head];
  const cols = [
    ['gemma', 'Carved first try', '#3fae4a', 'var(--green2)'],
    ['gemma-retry', 'After a retry', '#e0a400', 'var(--yellow2)'],
    ['facts', 'Plain facts', '#a19d93', '#efece5'],
  ];
  const card = ([g, sib]) => {
    const m = g.meta;
    const L = ((m.born - span[0]) / (span[1] - span[0])) * 100, W = ((m.died - m.born) / (span[1] - span[0])) * 100;
    return `<button class="tomb ${sib.length ? 'fam' : ''}" data-open="t:${esc(m.path)}">
      ${sib.length ? `<span class="fam-n">+${sib.length}</span>` : ''}
      <div class="pth">${ICONS.link}<span>${esc(m.path)}</span></div>
      <h4>${esc(base(m.path))}</h4>
      <div class="cause">“${esc(m.cause)}”</div>
      <div class="pills"><span class="pill">${ICONS.cal} ${yr(m.born)} – ${yr(m.died)}</span><span class="pill p">${life(m.died - m.born)}</span></div>
      <div class="life" data-tip="lived ${yr(m.born)} to ${yr(m.died)}"><i style="left:${L}%;width:${Math.max(W, 1.5)}%"></i></div>
      <div class="foot"><span>${n(m.lines)} lines</span><span>${n(m.commits)} commit${m.commits === 1 ? '' : 's'}</span></div>
    </button>`;
  };
  const ps = plots();
  const deaths = Object.entries(data.deathsByYear).sort();
  return `
  <div class="head"><div><h1>Graves</h1><p>${n(data.stats.deaths)} files died · ${data.graves.length} remembered</p></div></div>
  <div class="box" style="margin-bottom:14px"><div class="bh"><h3>Deaths by year</h3><small>every deleted file, renames excluded</small></div>${bars(deaths, { h: 150, W: 1100, label: (k, v) => `${k} · ${n(v)} file${v === 1 ? '' : 's'} deleted` })}</div>
  <div class="board">${cols.map(([k, t, dot, bg]) => {
    const items = ps.filter(([g]) => g.remembrance.by === k);
    return `<div class="col"><div class="colh"><span class="st" style="background:${bg}"><i style="background:${dot}"></i>${t}</span><b>${items.length}</b></div>
      ${items.map(card).join('') || '<div class="empty">none</div>'}</div>`;
  }).join('')}</div>`;
}

function timeline() {
  const rows = [
    ...[...data.ghosts].sort((a, b) => a.meta.first - b.meta.first).map((g) => ({ k: 'g', id: g.meta.name, label: g.meta.name, a: g.meta.first, b: g.meta.last })),
    ...[...data.graves].sort((a, b) => a.meta.born - b.meta.born).map((g) => ({ k: 't', id: g.meta.path, label: base(g.meta.path), a: g.meta.born, b: g.meta.died })),
  ];
  const t0 = Math.min(...rows.map((r) => r.a)), t1 = data.head;
  const LW = 170, W = 1000, RH = 24, top = 30;
  const x = (t) => LW + ((t - t0) / (t1 - t0)) * (W - LW - 16);
  const H = top + rows.length * RH + 50;
  const ghostCount = data.ghosts.length;
  let svg = '';
  for (let y = yr(t0); y <= yr(t1); y++) {
    const xx = x(Date.UTC(y, 0, 1));
    if (xx < LW) continue;
    svg += `<line x1="${xx}" y1="${top - 8}" x2="${xx}" y2="${H - 14}" stroke="#ece8e0"/>` + (y % 2 === 0 ? `<text x="${xx}" y="${top - 14}" text-anchor="middle">${y}</text>` : '');
  }
  svg += `<text x="0" y="${top + 4}" font-weight="800" fill="#141414">GHOSTS</text>`;
  svg += `<text x="0" y="${top + ghostCount * RH + 34}" font-weight="800" fill="#141414">GRAVES</text>`;
  rows.forEach((r, i) => {
    const y = top + 26 + i * RH + (r.k === 't' ? 30 : 0);
    const label = r.label.length > 22 ? r.label.slice(0, 21) + '…' : r.label;
    svg += `<g class="row" data-open="${r.k}:${esc(r.id)}" style="cursor:pointer">
      <text x="0" y="${y + 4}" fill="#3b3934">${esc(label)}</text>
      ${r.k === 'g'
        ? `<rect x="${x(r.a)}" y="${y - 7}" width="${Math.max(x(r.b) - x(r.a), 4)}" height="14" rx="7" fill="${tint(r.label)}" stroke="#141414" stroke-width="1.2" data-tip="${esc(r.label)} · active ${yr(r.a)}–${yr(r.b)}"/>
           <line x1="${x(r.b) + 2}" y1="${y}" x2="${x(t1)}" y2="${y}" stroke="#141414" stroke-dasharray="2 4" stroke-width="1.4" data-tip="${esc(r.label)} · code still running"/>`
        : `<rect x="${x(r.a)}" y="${y - 6}" width="${Math.max(x(r.b) - x(r.a), 4)}" height="12" rx="6" fill="#ffd34d" stroke="#141414" stroke-width="1.2" data-tip="${esc(r.label)} · ${yr(r.a)}–${yr(r.b)}"/>
           <text x="${x(r.b) + 6}" y="${y + 4}" font-size="11" fill="#a8371c">✕</text>`}
    </g>`;
  });
  return `
  <div class="head"><div><h1>Timeline</h1><p>Solid: when they were here. Dotted: their code since.</p></div></div>
  <div class="box tl"><svg viewBox="0 0 ${W} ${H + 24}" style="min-width:760px;width:100%" role="img" aria-label="Timeline of ghosts and graves">${svg}</svg></div>`;
}

let ckFilter = 'all';
function checker() {
  const all = data.ghosts.map((s) => ['g', s.meta.name, s]).concat(data.graves.map((s) => ['t', s.meta.path, s]));
  const rej = all.filter(([, , s]) => s.remembrance.rejected.length && (ckFilter === 'all' || s.remembrance.by === ckFilter));
  const mark = (text, why) => {
    const q = (why.match(/"([^"]+)"/) || [])[1] || (why.match(/the month (\w+)/) || [])[1];
    if (!q) return esc(text);
    const i = text.toLowerCase().indexOf(q.toLowerCase());
    return i < 0 ? esc(text) : esc(text.slice(0, i)) + `<mark>${esc(text.slice(i, i + q.length))}</mark>` + esc(text.slice(i + q.length));
  };
  return `
  <div class="head"><div><h1>Checker</h1><p>What Gemma wrote, what git said.</p></div>
    <div class="seg"><button class="${ckFilter === 'all' ? 'on' : ''}" data-ck="all">All</button><button class="${ckFilter === 'gemma-retry' ? 'on' : ''}" data-ck="gemma-retry">Fixed on retry</button><button class="${ckFilter === 'facts' ? 'on' : ''}" data-ck="facts">Plain facts</button></div></div>
  <div class="tiles">
    <div class="tile" style="background:var(--green2)"><b>${EVAL.heldCaught}</b><span>caught · held-out repo</span></div>
    <div class="tile" style="background:var(--yellow2)"><b>${EVAL.heldFalseAlarm}</b><span>true ones rejected · held out</span></div>
    <div class="tile" style="background:#fff"><b>${EVAL.devCaught}</b><span>caught · express + request</span></div>
    <div class="tile" style="background:var(--purple2)"><b>${EVAL.devFalseAlarm}</b><span>true ones rejected · express + request</span></div>
  </div>
  <div class="ck">${rej.map(([k, id, s]) => {
    const r = s.remembrance;
    return `<div class="ckit" data-open="${k}:${esc(id)}">
      <div class="who">${esc(k === 'g' ? id : base(id))}</div>
      <div class="bad">${mark(r.rejected[0].text, r.rejected[0].why)}</div>
      <div class="good"><span>→</span><span>${esc(r.text)}</span></div>
      <div class="why">${badge(r)}</div>
    </div>`;
  }).join('') || '<div class="empty">Nothing here.</div>'}</div>`;
}

// ---------- drawer ----------
function openDrawer(key) {
  const [k, ...rest] = key.split(':');
  const id = rest.join(':');
  const s = k === 'g' ? data.ghosts.find((g) => g.meta.name === id) : data.graves.find((g) => g.meta.path === id);
  if (!s) return;
  const m = s.meta, r = s.remembrance;
  const sib = k === 't' ? data.graves.filter((g) => g.meta.hash === m.hash && g !== s) : [];
  const facts = k === 'g'
    ? [[n(m.lines), 'lines still run'], [n(m.files), 'files'], [n(m.commits), 'commits'], [`${Math.floor((data.head - m.last) / (365.25 * 864e5))} years`, 'silent']]
    : [[n(m.lines), 'lines at death'], [n(m.commits), 'commits'], [life(m.died - m.born).replace('y', ' years').replace('d', ' days'), 'lived'], [n(m.authors.length) + (m.authors.length >= 4 ? '+' : ''), 'people']];
  $('#drawer').innerHTML = `
    <div class="dr-top"><button class="dr-x" id="drX" aria-label="Close">✕</button>
      <div class="rip">${k === 'g' ? 'still haunting' : 'here lies'}</div>
      <h2>${esc(k === 'g' ? m.name : base(m.path))}</h2>
      <div class="dates">${k === 'g' ? `${yr(m.first)} – ${yr(m.last)}` : `${yr(m.born)} – ${yr(m.died)}`}</div>
    </div>
    <div class="dr-body">
      <p class="quote">${esc(r.text)}</p>
      <div>${badge(r)}</div>
      <div class="facts">${facts.map(([b, t]) => `<div><b>${b}</b><span>${t}</span></div>`).join('')}</div>
      ${k === 'g' && m.oldestLine ? `<div><p class="dr-sec">Oldest line still here · ${yr(m.oldestAt)}</p><div class="codeline">${esc(m.oldestLine)}</div><p class="dr-sec" style="margin-top:6px;text-transform:none;letter-spacing:0">${esc(m.oldestFile)}</p></div>` : ''}
      ${k === 't' ? `<div><p class="dr-sec">Cause of death</p><a class="codeline" style="display:block" href="https://github.com/${esc(data.repo)}/commit/${esc(m.hash)}" target="_blank" rel="noopener">“${esc(m.cause)}” ↗</a></div>
        <div><p class="dr-sec">Born to · laid to rest by</p><div class="pills"><span class="pill y">${esc(m.bornBy)}</span><span class="pill">${esc(m.diedBy)}</span></div></div>` : ''}
      ${sib.length ? `<div><p class="dr-sec">Family plot · ${sib.length} more, same commit</p>${sib.map((x) => `<div class="codeline" style="margin-top:4px">${esc(x.meta.path)}</div>`).join('')}</div>` : ''}
      ${r.rejected.length ? `<div><p class="dr-sec">Thrown out by the checker</p>${r.rejected.map((x) => `<div class="rej" style="margin-top:6px"><s>${esc(x.text)}</s><em>${esc(x.why)}</em></div>`).join('')}</div>` : ''}
    </div>`;
  $('#drawer').classList.add('open');
  $('#drawer').setAttribute('aria-hidden', 'false');
  $('#scrim').hidden = false;
  $('#drawer').focus();
  $('#drX').addEventListener('click', closeDrawer);
}
function closeDrawer() {
  $('#drawer').classList.remove('open');
  $('#drawer').setAttribute('aria-hidden', 'true');
  $('#scrim').hidden = true;
}
$('#scrim').addEventListener('click', closeDrawer);
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeDrawer();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('[data-open][tabindex]')) { e.preventDefault(); openDrawer(e.target.dataset.open); }
});

// ---------- routing ----------
const VIEWS = { overview, ghosts, graves, timeline, checker };
function render() {
  const v = location.hash.slice(1) in VIEWS ? location.hash.slice(1) : 'overview';
  document.querySelectorAll('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.view === v));
  $('#view').innerHTML = VIEWS[v]();
  $('#view').style.animation = 'none';
  void $('#view').offsetWidth;
  $('#view').style.animation = '';
  $('#side').classList.remove('open');
  syncLightAll();
}
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) return void (location.hash = go.dataset.go);
  const open = e.target.closest('[data-open]');
  if (open && !e.target.closest('[data-candle]')) return openDrawer(open.dataset.open);
  const s = e.target.closest('[data-sort]');
  if (s) { ghostSort = s.dataset.sort; return render(); }
  const c = e.target.closest('[data-ck]');
  if (c) { ckFilter = c.dataset.ck; return render(); }
});
window.addEventListener('hashchange', () => { closeDrawer(); render(); });

async function load() {
  $('#view').innerHTML = '<div class="empty">Reading the graveyard…</div>';
  data = cache[repo] ||= await (await fetch(`/${repo}/data.json`)).json();
  shell();
  render();
}
load().catch((e) => ($('#view').innerHTML = `<div class="empty">Couldn't load this graveyard. ${esc(e.message)}</div>`));
