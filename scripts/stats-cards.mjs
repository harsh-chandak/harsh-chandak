#!/usr/bin/env node
/**
 * Render assets/activity-{dark,light}.svg, assets/languages-{dark,light}.svg
 * and the small link badges.
 *
 *   node scripts/stats-cards.mjs [--out assets] [--check]
 *
 * Why there is no "stars / PRs / issues" card here, which is the usual thing to
 * put on a profile: counted over public repositories only — the honest way to
 * count, since private work cannot be verified by a reader — this account has
 * 0 pull requests and 0 issues. All 516 PRs and 432 issues are in private
 * repositories. A card reading "0 pull requests" is worse than no card, so this
 * renders what is both true and public: the contribution calendar, and the
 * language mix across the public repositories.
 *
 * Everything is drawn here rather than pulled from a third-party image service.
 * Those services rate-limit and return 503s, and a profile that renders a broken
 * image is worse than one with fewer panels.
 */
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT = resolve(ROOT, arg("out", "assets"));
const CHECK = process.argv.includes("--check");
const USER = process.env.GH_USER || "harsh-chandak";

const THEMES = {
  dark:  { bg0:"#17130f", bg1:"#241c14", line:"#413326", text:"#f6efe6", muted:"#b09b84", gold:"#f5a524" },
  light: { bg0:"#fdf6e8", bg1:"#f6e9d4", line:"#e0cfb2", text:"#2f2417", muted:"#7b6750", gold:"#b26a00" },
};

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const compact = (n) =>
  n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M" :
  n >= 1e3 ? (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K" : String(n);

const gh = async (path) => {
  const r = await fetch(`https://api.github.com/${path}`, {
    headers: {
      "User-Agent": "stats-cards", Accept: "application/vnd.github+json",
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  });
  if (!r.ok) throw new Error(`${path} -> ${r.status}`);
  return r.json();
};

/**
 * The public contribution calendar, read from the same page a visitor sees.
 * Dates come back oldest-first, which is what the streak walk below assumes.
 */
async function calendar() {
  const r = await fetch(`https://github.com/users/${USER}/contributions`, { headers: { "User-Agent": "stats-cards" } });
  if (!r.ok) throw new Error(`contributions -> ${r.status}`);
  const html = await r.text();
  // Every day cell carries data-date and data-level, including the empty ones.
  // The tooltip text only exists for days that have contributions, so parsing
  // that alone yields a calendar with no gaps in it — which made the longest
  // streak come out exactly equal to the number of active days.
  const cells = [...html.matchAll(/data-date="(\d{4}-\d{2}-\d{2})"[^>]*?data-level="(\d+)"/g)]
    .map((m) => ({ date: m[1], level: Number(m[2]) }))
    .sort((a, b) => a.date.localeCompare(b.date));   // document order is weekday-major, not chronological
  if (!cells.length) throw new Error("contributions: parsed zero day cells");

  // Totals still come from the tooltips, which are the only place the actual
  // per-day counts appear.
  const counts = [...html.matchAll(/>([0-9,]+) contributions? on/g)].map((m) => Number(m[1].replace(/,/g, "")));
  const total = counts.reduce((a, b) => a + b, 0);
  const activeDays = cells.filter((d) => d.level > 0).length;

  let streak = 0;
  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i].level > 0) streak++;
    // Today is legitimately empty until the first commit of the day, so one
    // trailing blank does not end the streak; any earlier blank does.
    else if (i < cells.length - 1) break;
  }
  let best = 0, run = 0;
  for (const d of cells) { run = d.level > 0 ? run + 1 : 0; if (run > best) best = run; }

  return { total, activeDays, streak, best, days: cells.length };
}

async function languages() {
  const repos = (await gh(`users/${USER}/repos?per_page=100&type=owner`)).filter((r) => !r.fork);
  const bytes = {};
  for (const r of repos) {
    const l = await gh(`repos/${USER}/${r.name}/languages`);
    for (const [k, v] of Object.entries(l)) bytes[k] = (bytes[k] || 0) + v;
  }
  const total = Object.values(bytes).reduce((a, b) => a + b, 0);
  const sorted = Object.entries(bytes).sort((a, b) => b[1] - a[1]);
  return { sorted, total, repoCount: repos.length, stars: repos.reduce((a, r) => a + (r.stargazers_count || 0), 0) };
}

// A fixed palette so a language keeps its colour between runs. Anything beyond
// the list falls back to the muted tone rather than picking a random hue.
const LANG_COLORS = {
  JavaScript: "#f5a524", Python: "#d98324", HTML: "#b26a00", Shell: "#8a6a3d",
  Solidity: "#c99a4e", Prolog: "#e0b36a", CSS: "#a07c45", Circom: "#d9c08a",
  Dockerfile: "#7b6750", TypeScript: "#eab54a", Jupyter_Notebook: "#c08a3e",
};

function activityCard(live, repo, t) {
  const W = 900, H = 190;
  const cells = [
    [live.total.toLocaleString(), "contributions, last year"],
    [String(live.activeDays), "days with a commit"],
    [String(live.best), "longest streak, days"],
    [String(repo.repoCount), "public repositories"],
  ];
  const x0 = 50, span = (W - 100) / cells.length;
  const alt = `Public GitHub activity: ${cells.map(([k, l]) => `${k} ${l}`).join(", ")}.`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(alt)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bg0}"/><stop offset="1" stop-color="${t.bg1}"/></linearGradient>
    <radialGradient id="glow" cx="82%" cy="6%" r="64%"><stop offset="0" stop-color="${t.gold}" stop-opacity=".18"/><stop offset="1" stop-color="${t.gold}" stop-opacity="0"/></radialGradient>
    <style>
      .k { font: 700 30px ui-monospace, SFMono-Regular, Menlo, monospace; fill:${t.gold} }
      .m { font: 400 13px -apple-system, "Segoe UI", Inter, sans-serif; fill:${t.muted} }
      .l { font: 400 11px -apple-system, "Segoe UI", Inter, sans-serif; fill:${t.muted} }
    </style>
  </defs>
  <rect width="${W}" height="${H}" rx="14" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" rx="14" fill="url(#glow)"/>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="14" fill="none" stroke="${t.line}"/>
  <circle cx="52" cy="40" r="5" fill="${t.gold}"/>
  <text x="68" y="45" class="l" letter-spacing="2.2">ACTIVITY, PUBLIC REPOSITORIES ONLY</text>
  <line x1="50" y1="70" x2="${W - 50}" y2="70" stroke="${t.line}"/>
${cells.map(([k, l], i) => {
  const x = Math.round(x0 + span * i);
  return `  <text x="${x}" y="124" class="k">${esc(k)}</text>\n  <text x="${x}" y="150" class="m">${esc(l)}</text>`;
}).join("\n")}
</svg>
`;
}

function languagesCard(lang, t) {
  const W = 900, H = 160, BW = W - 100;
  const top = lang.sorted.slice(0, 8);
  const shown = top.reduce((a, [, v]) => a + v, 0);
  const otherBytes = lang.total - shown;
  const rows = otherBytes > 0 ? [...top, ["Other", otherBytes]] : top;

  let x = 50;
  const bar = rows.map(([name, v]) => {
    const w = Math.max((v / lang.total) * BW, 2);
    const seg = `<rect x="${x.toFixed(1)}" y="72" width="${w.toFixed(1)}" height="14" fill="${LANG_COLORS[name.replace(/ /g, "_")] || t.muted}"/>`;
    x += w;
    return seg;
  }).join("\n  ");

  const legend = rows.slice(0, 5).map(([name, v], i) => {
    const lx = 50 + i * ((W - 100) / 5);
    const pct = ((v / lang.total) * 100).toFixed(1);
    return `  <circle cx="${lx + 5}" cy="116" r="5" fill="${LANG_COLORS[name.replace(/ /g, "_")] || t.muted}"/>\n` +
           `  <text x="${lx + 18}" y="121" class="m">${esc(name)} ${pct}%</text>`;
  }).join("\n");

  const alt = `Languages across every public repository, measured in bytes by GitHub Linguist: ` +
    rows.map(([n, v]) => `${n} ${((v / lang.total) * 100).toFixed(1)}%`).join(", ") + ".";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(alt)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.bg0}"/><stop offset="1" stop-color="${t.bg1}"/></linearGradient>
    <clipPath id="r"><rect x="50" y="72" width="${BW}" height="14" rx="7"/></clipPath>
    <style>
      .m { font: 400 13px -apple-system, "Segoe UI", Inter, sans-serif; fill:${t.muted} }
      .l { font: 400 11px -apple-system, "Segoe UI", Inter, sans-serif; fill:${t.muted} }
    </style>
  </defs>
  <rect width="${W}" height="${H}" rx="14" fill="url(#bg)"/>
  <rect x=".5" y=".5" width="${W - 1}" height="${H - 1}" rx="14" fill="none" stroke="${t.line}"/>
  <circle cx="52" cy="40" r="5" fill="${t.gold}"/>
  <text x="68" y="45" class="l" letter-spacing="2.2">LANGUAGES BY BYTES, LINGUIST</text>
  <g clip-path="url(#r)">
  ${bar}
  </g>
${legend}
</svg>
`;
}

function badge(label, t) {
  // Width is estimated from the label, since there is no font engine here. The
  // padding is generous enough that a wrong guess shows as a wide pill rather
  // than clipped text.
  const w = Math.max(96, Math.round(label.length * 8.1) + 44);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="34" viewBox="0 0 ${w} 34" role="img" aria-label="${esc(label)}">
  <rect x=".5" y=".5" width="${w - 1}" height="33" rx="17" fill="${t.bg1}" stroke="${t.line}"/>
  <circle cx="19" cy="17" r="4" fill="${t.gold}"/>
  <text x="32" y="22" font="400 13px -apple-system, 'Segoe UI', Inter, sans-serif"
        font-family="-apple-system, 'Segoe UI', Inter, sans-serif" font-size="13" fill="${t.text}">${esc(label)}</text>
</svg>
`;
}

const live = await calendar();
const lang = await languages();

let changed = 0;
const write = async (name, content) => {
  const path = resolve(OUT, name);
  const prev = existsSync(path) ? await readFile(path, "utf8") : "";
  if (content !== prev) { changed++; if (!CHECK) await writeFile(path, content); }
  console.log(`  ${name}  ${content === prev ? "unchanged" : CHECK ? "WOULD CHANGE" : "written"}`);
};

for (const [name, t] of Object.entries(THEMES)) {
  await write(`activity-${name}.svg`, activityCard(live, lang, t));
  await write(`languages-${name}.svg`, languagesCard(lang, t));
  for (const [slug, label] of [["site", "harsh-chandak.com"], ["linkedin", "LinkedIn"], ["email", "Email"]]) {
    await write(`link-${slug}-${name}.svg`, badge(label, t));
  }
}

console.log(`\n  ${live.total.toLocaleString()} contributions · ${live.activeDays} active days · ` +
            `longest streak ${live.best} · ${lang.repoCount} public repos · ` +
            `${lang.sorted.length} languages over ${compact(lang.total)} bytes`);
if (CHECK && changed) process.exit(1);
