// Builds the "solar system" profile cards into assets/solar/.
// Usage: GITHUB_TOKEN=... node solar/build.mjs   (no dependencies, Node 20+)
import { mkdirSync, writeFileSync } from 'node:fs';

const LOGIN = 'AkramSyahmi';
const OUT = new URL('../assets/solar/', import.meta.url);
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error('GITHUB_TOKEN is not set');

// Markup and tooling languages are left out so the planets show programming languages.
const SKIP_LANGS = new Set(['CSS', 'SCSS', 'HTML', 'Shell', 'Batchfile', 'Dockerfile', 'Makefile', 'GDShader']);
// Linguist misreads some of MyPetakom's .php files as Hack.
const LANG_ALIAS = { Hack: 'PHP' };
const ABBR = { TypeScript: 'TS', JavaScript: 'JS', Python: 'Py', PHP: 'PHP', GDScript: 'GD', PLpgSQL: 'SQL', Java: 'Jv', Dart: 'Dt', Kotlin: 'Kt', Blade: 'Bl' };
const GOLD = '#ffd166';
const FONT = `-apple-system,'Segoe UI',Helvetica,Arial,sans-serif`;
const MONO = `ui-monospace,SFMono-Regular,Consolas,'Liberation Mono',monospace`;

const QUERY = `query($login:String!){user(login:$login){
  name login bio location avatarUrl(size:240) followers{totalCount}
  repositories(ownerAffiliations:OWNER,privacy:PUBLIC,isFork:false,first:100){totalCount nodes{
    name isArchived isEmpty pushedAt languages(first:20){edges{size node{name color}}}}}
  pinnedItems(first:4,types:REPOSITORY){nodes{...on Repository{
    name description url stargazerCount forkCount primaryLanguage{name color}}}}
  contributionsCollection{contributionCalendar{totalContributions weeks{contributionDays{date contributionCount}}}}
}}`;

async function gql() {
  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'User-Agent': 'solar-cards' },
    body: JSON.stringify({ query: QUERY, variables: { login: LOGIN } }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) throw new Error(JSON.stringify(body.errors ?? body));
  return body.data.user;
}

async function dataUri(url) {
  let res;
  for (let attempt = 0; attempt < 4; attempt++) {
    res = await fetch(url);
    if (res.status !== 429) break; // opengraph.githubassets.com rate-limits bursts
    await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)));
  }
  if (!res.ok) return null;
  const type = res.headers.get('content-type') ?? 'image/png';
  return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString('base64')}`;
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]);
const abbr = (name) => ABBR[name] ?? name.slice(0, 2);
const pct = (x) => `${Math.round(x * 100)}%`;
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

function wrap(text, width, maxLines) {
  const lines = [];
  let line = '';
  for (const word of String(text ?? '').split(/\s+/).filter(Boolean)) {
    if ((line + ' ' + word).trim().length > width && line) { lines.push(line); line = word; }
    else line = (line + ' ' + word).trim();
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    lines.length = maxLines;
    lines[maxLines - 1] = lines[maxLines - 1].replace(/\s*\S*$/, '') + '…';
  }
  return lines;
}

// Dark text on light planets (JavaScript yellow), light text elsewhere.
function inkFor(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1a1a1a' : '#ffffff';
}

// Each repo counts equally, so one repo with a vendored library cannot swamp the rest.
export function languageShares(repos) {
  const totals = new Map();
  const colors = new Map();
  let counted = 0;
  for (const repo of repos) {
    const sizes = new Map();
    for (const { size, node } of repo.languages.edges) {
      const name = LANG_ALIAS[node.name] ?? node.name;
      if (SKIP_LANGS.has(name)) continue;
      sizes.set(name, (sizes.get(name) ?? 0) + size);
      if (!colors.has(name)) colors.set(name, node.color ?? '#8b949e');
    }
    const sum = [...sizes.values()].reduce((a, b) => a + b, 0);
    if (!sum) continue;
    counted++;
    for (const [name, size] of sizes) totals.set(name, (totals.get(name) ?? 0) + size / sum);
  }
  const shares = [...totals].map(([name, t]) => ({ name, share: t / counted, color: colors.get(name) }))
    .filter((l) => l.share >= 0.03)
    .sort((a, b) => b.share - a.share)
    .slice(0, 6);
  const kept = shares.reduce((a, l) => a + l.share, 0);
  return shares.map((l) => ({ ...l, share: l.share / kept }));
}

export function streaks(days) {
  let longest = 0, run = 0;
  for (const d of days) { run = d.contributionCount ? run + 1 : 0; longest = Math.max(longest, run); }
  let i = days.length - 1;
  if (i >= 0 && !days[i].contributionCount) i--; // today may not have started yet
  let current = 0;
  while (i >= 0 && days[i].contributionCount) { current++; i--; }
  return { current, longest };
}

// Seeded so the star field stays the same between builds.
function rng(seed) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stars(w, h, count, seed) {
  const r = rng(seed);
  let out = '';
  for (let i = 0; i < count; i++) {
    const cls = r() < 0.3 ? ' class="tw"' : '';
    out += `<circle${cls} cx="${(r() * w).toFixed(1)}" cy="${(r() * h).toFixed(1)}" r="${(0.4 + r() * 0.9).toFixed(2)}" fill="#fff" opacity="${(0.25 + r() * 0.6).toFixed(2)}" style="animation-delay:-${(r() * 4).toFixed(1)}s"/>`;
  }
  return out;
}

function frame(w, h, seed, body, label) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">
<style>
  text{font-family:${FONT};fill:#e6edf3}
  .mono{font-family:${MONO}}
  .kicker{font-family:${MONO};font-size:12px;letter-spacing:2px;fill:${GOLD};font-weight:700}
  .muted{fill:#9aa4b8}
  .tw{animation:tw 4s ease-in-out infinite}
  @keyframes tw{50%{opacity:.1}}
</style>
<defs><linearGradient id="bg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0a0f24"/><stop offset="1" stop-color="#05070f"/></linearGradient></defs>
<rect width="${w}" height="${h}" rx="16" fill="url(#bg)"/>
${stars(w, h, Math.round((w * h) / 4500), seed)}
${body}
</svg>`;
}

function planetBadge(lang, r) {
  const fs = abbr(lang.name).length > 2 ? r * 0.62 : r * 0.8;
  return `<circle r="${r}" fill="${lang.color}" stroke="#ffffff33"/>
<text text-anchor="middle" dy="${(fs * 0.36).toFixed(1)}" font-size="${fs.toFixed(1)}" font-weight="700" class="mono" style="fill:${inkFor(lang.color)}">${esc(abbr(lang.name))}</text>`;
}

function orbitsCard(user, langs, avatar, moons, comets) {
  const W = 900, H = 480, cx = 450, cy = 244;
  let orbits = '', planets = '';
  langs.forEach((lang, i) => {
    const rx = 120 + i * 50, ry = Math.round(rx * 0.46);
    const path = `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${2 * rx},0 a${rx},${ry} 0 1,0 ${-2 * rx},0`;
    const r = Math.round(11 + lang.share * 22);
    const dur = 34 + i * 14;
    const begin = -((i * 0.37) % 1) * dur;
    const moonDots = moons.filter((m) => m.primaryLanguage?.name === lang.name).map((m, j) =>
      `<g><circle cx="${r + 7 + j * 5}" cy="0" r="2.6" fill="#dfe6ff"><title>${esc(m.name)}</title></circle>
<animateTransform attributeName="transform" type="rotate" from="${j * 140} 0 0" to="${360 + j * 140} 0 0" dur="${6 + j * 2}s" repeatCount="indefinite"/></g>`).join('');
    orbits += `<path d="${path}" fill="none" stroke="#ffffff" stroke-opacity=".13" stroke-dasharray="3 5"/>`;
    planets += `<g>${planetBadge(lang, r)}${moonDots}
<text y="${r + 15}" text-anchor="middle" font-size="11" font-weight="600" class="mono">${esc(lang.name)} ${pct(lang.share)}</text>
<animateMotion dur="${dur}s" begin="${begin.toFixed(1)}s" repeatCount="indefinite" path="${path}"/></g>`;
  });
  const cometSpots = [[70, 120], [600, 92], [90, 400]];
  const cometSvg = comets.slice(0, 3).map((name, i) => {
    const [x, y] = cometSpots[i];
    return `<g><line x1="${x - 70}" y1="${y - 18}" x2="${x}" y2="${y}" stroke="url(#tail)" stroke-width="2" stroke-linecap="round"/>
<circle cx="${x}" cy="${y}" r="3" fill="#fff"/><text x="${x + 8}" y="${y - 6}" font-size="11" class="mono">${esc(name)}</text>
<animateTransform attributeName="transform" type="translate" values="0 0;10 3;0 0" dur="${7 + i * 2}s" repeatCount="indefinite"/></g>`;
  }).join('');
  const body = `<defs>
<radialGradient id="sun"><stop offset="0" stop-color="${GOLD}" stop-opacity=".55"/><stop offset=".45" stop-color="#f4a261" stop-opacity=".18"/><stop offset="1" stop-color="#f4a261" stop-opacity="0"/></radialGradient>
<linearGradient id="tail"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".8"/></linearGradient>
<clipPath id="av"><circle cx="${cx}" cy="${cy}" r="34"/></clipPath></defs>
<text x="28" y="34" class="kicker" style="fill:#c9d1d9">SOLAR SYSTEM · @${esc(user.login.toUpperCase())}</text>
${orbits}
<circle cx="${cx}" cy="${cy}" r="95" fill="url(#sun)"><animate attributeName="r" values="88;100;88" dur="5s" repeatCount="indefinite"/></circle>
${avatar ? `<image href="${avatar}" x="${cx - 34}" y="${cy - 34}" width="68" height="68" clip-path="url(#av)"/>` : ''}
<circle cx="${cx}" cy="${cy}" r="35" fill="none" stroke="${GOLD}" stroke-width="3"/>
${cometSvg}
${planets}
<text x="28" y="${H - 20}" font-size="11" class="mono muted">${esc(user.login.toLowerCase())}</text>
<text x="${W - 28}" y="${H - 20}" font-size="11" text-anchor="end" class="mono muted">planets = languages · moons = pinned repos · comets = recent pushes</text>`;
  return frame(W, H, 7, body, `${user.name}'s languages as planets: ${langs.map((l) => `${l.name} ${pct(l.share)}`).join(', ')}`);
}

function aboutCard(user, avatar) {
  const W = 900, H = 230;
  const bio = wrap(user.bio, 62, 3);
  const meta = [user.location, plural(user.followers.totalCount, 'follower'), `${user.repositories.totalCount} public ${user.repositories.totalCount === 1 ? 'repository' : 'repositories'}`].filter(Boolean).join(' · ');
  const body = `<defs><clipPath id="av"><circle cx="780" cy="115" r="56"/></clipPath></defs>
<text x="40" y="52" class="kicker">THE SUN</text>
<text x="40" y="96" font-size="30" font-weight="700">${esc(user.name)}</text>
${bio.map((l, i) => `<text x="40" y="${130 + i * 24}" font-size="17" style="fill:#c9d1d9">${esc(l)}</text>`).join('')}
<text x="40" y="${138 + bio.length * 24}" font-size="12" class="mono muted">${esc(meta)}</text>
${avatar ? `<image href="${avatar}" x="724" y="59" width="112" height="112" clip-path="url(#av)"/>` : ''}
<circle cx="780" cy="115" r="57" fill="none" stroke="${GOLD}" stroke-width="4"/>`;
  return frame(W, H, 11, body, `About ${user.name}: ${user.bio ?? ''}`);
}

function moonCard(repo, i) {
  const W = 440, H = 190;
  const lang = repo.primaryLanguage ?? { name: 'Code', color: '#8b949e' };
  const desc = wrap(repo.description, 44, 3);
  const body = `<text x="26" y="40" class="kicker">MOON ${String(i + 1).padStart(2, '0')}</text>
<text x="26" y="72" font-size="17" font-weight="700" class="mono">${esc(repo.name)}</text>
${desc.map((l, j) => `<text x="26" y="${98 + j * 19}" font-size="14" style="fill:#c9d1d9">${esc(l)}</text>`).join('')}
<g transform="translate(392,36)"><ellipse rx="26" ry="8" fill="none" stroke="#ffffff55" stroke-width="2"/>${planetBadge(lang, 15)}</g>
<text x="26" y="168" font-size="12" class="mono muted">★ ${repo.stargazerCount}   ⑂ ${repo.forkCount}   ${esc(lang.name)}</text>`;
  return frame(W, H, 20 + i, body, `${repo.name}: ${repo.description ?? ''}`);
}

function stackCard(langs) {
  const W = 900, rowH = 34, H = 82 + langs.length * rowH;
  const max = Math.max(...langs.map((l) => l.share));
  const rows = langs.map((l, i) => {
    const y = 78 + i * rowH, w = Math.max(8, (l.share / max) * 470);
    return `<g transform="translate(46,${y})">${planetBadge(l, 11)}</g>
<text x="66" y="${y + 5}" font-size="15" font-weight="700">${esc(l.name)}</text>
<rect x="230" y="${y - 6}" width="470" height="12" rx="6" fill="#262c3d"/>
<rect x="230" y="${y - 6}" width="${w.toFixed(1)}" height="12" rx="6" fill="${l.color}"/>
<text x="${W - 46}" y="${y + 5}" font-size="13" text-anchor="end" class="mono muted">${pct(l.share)}</text>`;
  }).join('');
  return frame(W, H, 31, `<text x="36" y="44" class="kicker">PLANETS</text>${rows}`, `Languages: ${langs.map((l) => `${l.name} ${pct(l.share)}`).join(', ')}`);
}

function logCard(calendar) {
  const W = 900, H = 230;
  const weeks = calendar.weeks.slice(-26);
  const allDays = calendar.weeks.flatMap((w) => w.contributionDays);
  const { current, longest } = streaks(allDays);
  const counts = weeks.flatMap((w) => w.contributionDays.map((d) => d.contributionCount)).filter(Boolean).sort((a, b) => a - b);
  const q = (p) => counts[Math.floor(p * (counts.length - 1))] ?? 1;
  const top = counts.at(-1) ?? 0;
  const color = (n) => !n ? '#1a2033' : n === top ? GOLD : n >= q(0.75) ? '#8b93ff' : n >= q(0.5) ? '#5f69d6' : n >= q(0.25) ? '#4450a8' : '#323c7a';
  let cells = '';
  weeks.forEach((w, x) => w.contributionDays.forEach((d) => {
    const y = new Date(d.date + 'T00:00:00Z').getUTCDay();
    cells += `<rect x="${36 + x * 17.5}" y="${66 + y * 17.5}" width="14" height="14" rx="3" fill="${color(d.contributionCount)}"><title>${d.date}: ${d.contributionCount}</title></rect>`;
  }));
  const stat = (y, label, value) => `<text x="520" y="${y}" font-size="11" letter-spacing="1.5" class="mono muted">${label}</text><text x="520" y="${y + 24}" font-size="21" font-weight="700">${value}</text>`;
  const body = `<text x="36" y="44" class="kicker">ORBIT LOG · 26 WEEKS</text>${cells}
${stat(74, 'DAYS IN ORBIT', plural(current, 'day'))}${stat(124, 'LONGEST ORBIT', plural(longest, 'day'))}${stat(174, 'REVOLUTIONS THIS YEAR', calendar.totalContributions.toLocaleString('en-US'))}`;
  return frame(W, H, 41, body, `Last 26 weeks of contributions. Current streak ${current}, longest ${longest}, ${calendar.totalContributions} this year.`);
}

async function main() {
  const user = await gql();
  const repos = user.repositories.nodes.filter((r) => !r.isArchived && !r.isEmpty && r.name.toLowerCase() !== LOGIN.toLowerCase());
  const langs = languageShares(repos);
  const moons = user.pinnedItems.nodes;
  const monthAgo = Date.now() - 30 * 864e5;
  const comets = repos.filter((r) => Date.parse(r.pushedAt) > monthAgo).sort((a, b) => b.pushedAt.localeCompare(a.pushedAt)).map((r) => r.name);
  const avatar = await dataUri(user.avatarUrl);

  mkdirSync(OUT, { recursive: true });
  const write = (name, svg) => writeFileSync(new URL(name, OUT), svg);
  write('orbits.svg', orbitsCard(user, langs, avatar, moons, comets));
  write('about.svg', aboutCard(user, avatar));
  moons.forEach((m, i) => write(`moon-${i}.svg`, moonCard(m, i)));
  write('stack.svg', stackCard(langs));
  write('log.svg', logCard(user.contributionsCollection.contributionCalendar));
  console.log(`langs: ${langs.map((l) => `${l.name} ${pct(l.share)}`).join(', ')} | moons: ${moons.map((m) => m.name).join(', ')} | comets: ${comets.join(', ')}`);
}

if (process.argv[2] === '--check') {
  const repo = (edges) => ({ languages: { edges: edges.map(([name, size]) => ({ size, node: { name, color: '#000000' } })) } });
  const s = languageShares([repo([['PHP', 900], ['Hack', 100], ['CSS', 500]]), repo([['Python', 50], ['JavaScript', 50]])]);
  console.assert(s[0].name === 'PHP' && Math.abs(s[0].share - 0.5) < 1e-9, 'repo weighting, alias and skip', s);
  const d = (n) => ({ contributionCount: n });
  const st = streaks([d(1), d(1), d(1), d(0), d(2), d(3), d(0)]);
  console.assert(st.current === 2 && st.longest === 3, 'streaks', st);
  console.log('checks done');
} else {
  await main();
}
