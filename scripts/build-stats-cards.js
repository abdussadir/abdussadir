// Generates assets/stats-card.svg and assets/langs-card.svg from live GitHub data.
// Uses only the GitHub REST API (no third-party rendering service), so it never
// depends on an external site's uptime. Run with: node build-stats-cards.js <username>
// Needs a GITHUB_TOKEN (or gh CLI auth) for a decent rate limit; works unauthenticated too.

const https = require('https');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const USERNAME = process.argv[2] || 'abdussadir';
const OUT_DIR = process.argv[3] || '.';

function ghToken() {
  if (process.env.GITHUB_TOKEN) return process.env.GITHUB_TOKEN;
  try { return execSync('gh auth token', { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(); }
  catch { return null; }
}

function api(p) {
  return new Promise((resolve, reject) => {
    const token = ghToken();
    const headers = { 'User-Agent': 'stats-card-generator', 'Accept': 'application/vnd.github+json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    https.get({ hostname: 'api.github.com', path: p, headers }, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 400) return reject(new Error(`${p} -> ${res.statusCode}: ${data}`));
        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

const LANG_COLORS = {
  HTML: '#e34c26', CSS: '#563d7c', JavaScript: '#f1e05a', TypeScript: '#3178c6',
  PHP: '#4F5D95', Python: '#3572A5', Vue: '#41b883', SCSS: '#c6538c',
  'Jupyter Notebook': '#DA5B0B', Shell: '#89e051', Dockerfile: '#384d54',
};
const FALLBACK_COLORS = ['#38bdf8', '#22d3ee', '#34d399', '#f0b429', '#a78bfa', '#fb7185'];

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

function cardShell(title, height, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 ${height}" width="480" height="${height}" role="img" aria-label="${esc(title)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#080f1c"/><stop offset="55%" stop-color="#0b1a2b"/><stop offset="100%" stop-color="#07171a"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#38bdf8"/><stop offset="50%" stop-color="#22d3ee"/><stop offset="100%" stop-color="#34d399"/>
    </linearGradient>
    <clipPath id="clip"><rect width="480" height="${height}" rx="14"/></clipPath>
  </defs>
  <style>
    .mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
    .title { fill: #f8fafc; font-weight: 700; }
    .label { fill: #94a3b8; }
    .value { fill: #e2e8f0; font-weight: 600; }
    .accentText { fill: #22d3ee; }
  </style>
  <g clip-path="url(#clip)">
    <rect width="480" height="${height}" fill="url(#bg)"/>
    ${body}
    <rect x="0" y="${height - 3}" width="480" height="3" fill="url(#accent)"/>
    <rect x="0.5" y="0.5" width="479" height="${height - 1}" rx="14" fill="none" stroke="#1e3a4c"/>
  </g>
</svg>
`;
}

function buildStatsCard({ login, name, publicRepos, followers, following, createdAt, totalStars }) {
  const since = new Date(createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  const rows = [
    ['Public repos', publicRepos],
    ['Followers', followers],
    ['Following', following],
    ['Total stars', totalStars],
    ['On GitHub since', since],
  ];
  const rowsSvg = rows.map((r, i) => `
    <text class="mono label" x="28" y="${74 + i * 26}" font-size="13">${esc(r[0])}</text>
    <text class="mono value" x="452" y="${74 + i * 26}" font-size="13" text-anchor="end">${esc(r[1])}</text>`).join('');
  const body = `
    <text class="mono title" x="28" y="38" font-size="17">GitHub Stats</text>
    <text class="mono accentText" x="452" y="38" font-size="12" text-anchor="end">@${esc(login)}</text>
    <line x1="28" y1="50" x2="452" y2="50" stroke="#1e3a4c" stroke-width="1"/>
    ${rowsSvg}`;
  return cardShell(`GitHub stats for ${name || login}`, 74 + rows.length * 26 + 14, body);
}

function buildLangsCard(langBytes) {
  const total = Object.values(langBytes).reduce((a, b) => a + b, 0) || 1;
  const entries = Object.entries(langBytes).sort((a, b) => b[1] - a[1]).slice(0, 6);
  let colorIdx = 0;
  const withColor = entries.map(([name, bytes]) => {
    const color = LANG_COLORS[name] || FALLBACK_COLORS[colorIdx++ % FALLBACK_COLORS.length];
    return { name, bytes, pct: (bytes / total) * 100, color };
  });

  let x = 28;
  const barY = 56, barW = 424, barH = 10;
  const segs = withColor.map(l => {
    const w = Math.max((l.pct / 100) * barW, 2);
    const seg = `<rect x="${x.toFixed(2)}" y="${barY}" width="${w.toFixed(2)}" height="${barH}" fill="${l.color}"/>`;
    x += w;
    return seg;
  }).join('');

  const rows = withColor.map((l, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const cx = 28 + col * 220;
    const cy = 96 + row * 24;
    return `
    <circle cx="${cx}" cy="${cy - 4}" r="5" fill="${l.color}"/>
    <text class="mono label" x="${cx + 14}" y="${cy}" font-size="12.5">${esc(l.name)}</text>
    <text class="mono value" x="${cx + 210}" y="${cy}" font-size="12.5" text-anchor="end">${l.pct.toFixed(1)}%</text>`;
  }).join('');

  const height = 96 + Math.ceil(withColor.length / 2) * 24 + 6;
  const body = `
    <text class="mono title" x="28" y="34" font-size="17">Most Used Languages</text>
    <rect x="28" y="${barY}" width="${barW}" height="${barH}" rx="5" fill="#0f2233"/>
    <g clip-path="url(#clip)">${segs}</g>
    ${rows}`;
  return cardShell('Most used languages', height, body);
}

(async () => {
  const user = await api(`/users/${USERNAME}`);
  const repos = await api(`/users/${USERNAME}/repos?per_page=100&type=owner`);
  const nonForks = repos.filter(r => !r.fork);
  const totalStars = nonForks.reduce((s, r) => s + (r.stargazers_count || 0), 0);

  const langBytes = {};
  for (const r of nonForks) {
    const langs = await api(`/repos/${USERNAME}/${r.name}/languages`);
    for (const [lang, bytes] of Object.entries(langs)) {
      langBytes[lang] = (langBytes[lang] || 0) + bytes;
    }
  }

  const statsSvg = buildStatsCard({
    login: user.login, name: user.name,
    publicRepos: user.public_repos, followers: user.followers, following: user.following,
    createdAt: user.created_at, totalStars,
  });
  const langsSvg = buildLangsCard(langBytes);

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'stats-card.svg'), statsSvg);
  fs.writeFileSync(path.join(OUT_DIR, 'langs-card.svg'), langsSvg);
  console.log('Wrote stats-card.svg and langs-card.svg to', OUT_DIR);
})().catch(e => { console.error(e); process.exit(1); });
