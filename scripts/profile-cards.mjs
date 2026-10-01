#!/usr/bin/env node
/**
 * Render assets/header-{dark,light}.svg.
 *
 *   node scripts/profile-cards.mjs [--out assets] [--check]
 *
 * The header used to be two hand-written SVGs with the numbers typed into the
 * markup. That meant every figure froze the day it was written: the eligibility
 * precision on the card disagreed with the resume within weeks, and nobody
 * noticed because changing it meant editing SVG by hand.
 *
 * Now the facts live in data/header.json and the live strip comes from the
 * GitHub API plus, when it exists, a public gist of Claude Code usage. The
 * layout is identical to what it replaced; only the source of the text moved.
 *
 * No secrets. The workflow's built-in GITHUB_TOKEN reads public repository
 * metadata, and the gist is public and read anonymously. If a source fails this
 * throws before writing, the job goes red, and the last good card stays
 * committed rather than being replaced by a worse one.
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
const GIST = process.env.CLAUDE_STATS_GIST || "";

const THEMES = {
  dark:  { bg0:"#17130f", bg1:"#241c14", line:"#413326", text:"#f6efe6", muted:"#b09b84", gold:"#f5a524" },
  light: { bg0:"#fdf6e8", bg1:"#f6e9d4", line:"#e0cfb2", text:"#2f2417", muted:"#7b6750", gold:"#b26a00" },
};

/** XML-escape. A role or label with an ampersand must not produce invalid SVG. */
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const compact = (n) =>
  n >= 1e12 ? (n / 1e12).toFixed(1).replace(/\.0$/, "") + "T" :
  n >= 1e9  ? (n / 1e9).toFixed(1).replace(/\.0$/, "")  + "B" :
  n >= 1e6  ? (n / 1e6).toFixed(1).replace(/\.0$/, "")  + "M" :
  n >= 1e3  ? (n / 1e3).toFixed(1).replace(/\.0$/, "")  + "K" : String(n);

async function getJson(url, headers = {}) {
  const r = await fetch(url, { headers: { "User-Agent": "profile-cards", ...headers } });
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

/** Public contribution total, scraped from the same calendar a visitor sees. */
async function contributions() {
  const r = await fetch(`https://github.com/users/${USER}/contributions`, { headers: { "User-Agent": "profile-cards" } });
  if (!r.ok) throw new Error(`contributions -> ${r.status}`);
  const html = await r.text();
  const days = [...html.matchAll(/>([0-9,]+) contributions? on/g)].map((m) => Number(m[1].replace(/,/g, "")));
  if (!days.length) throw new Error("contributions: parsed zero days");
  return { total: days.reduce((a, b) => a + b, 0), activeDays: days.length };
}

/** Claude Code usage, if the gist is configured. Absent is fine; wrong is not. */
async function claudeStats() {
  if (!GIST) return null;
  const g = await getJson(`https://api.github.com/gists/${GIST}`);
  const f = g.files["stats.json"] || Object.values(g.files)[0];
  if (!f) throw new Error("gist has no files");
  const d = JSON.parse(f.content ?? (await (await fetch(f.raw_url)).text()));
  return { tokens: d.tokens?.total ?? null, sessions: d.sessions ?? null, streak: d.current_streak ?? d.streak ?? null };
}

function render(cfg, live, t) {
  const cells = cfg.stats.map((s) =>
    `    <text x="${s.x}" y="243" class="k">${esc(s.value)}</text><text x="${s.x}" y="263" class="l">${esc(s.label)}</text>`
  ).join("\n");

  // The live strip only renders what actually resolved. A card that invents a
  // number is worse than a card that omits one.
  const bits = [];
  if (live.contributions) bits.push(`${live.contributions.total.toLocaleString()} contributions · ${live.contributions.activeDays} active days`);
  if (live.claude?.tokens) bits.push(`${compact(live.claude.tokens)} Claude Code tokens`);
  if (live.claude?.sessions) bits.push(`${live.claude.sessions} sessions`);
  if (live.claude?.streak) bits.push(`${live.claude.streak}-day streak`);
  // Its own line under the stats, not top-right. End-anchored at 850 it was
  // 200px wide today and would be ~520px once the Claude figures land, which
  // runs straight into the "OPEN TO" badge. Down here it has the full width.
  const strip = bits.length
    ? `  <text x="50" y="288" class="l" opacity=".75">${esc(bits.join("  ·  "))}</text>\n`
    : "";

  const alt = `${cfg.name}. ${cfg.role}. ${cfg.meta}. ${cfg.stats.map((s) => `${s.value} ${s.label}`).join(". ")}.`
    + (bits.length ? ` Updated nightly: ${bits.join(", ")}.` : "");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="300" viewBox="0 0 900 300" role="img" aria-label="${esc(alt)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${t.bg0}"/><stop offset="1" stop-color="${t.bg1}"/>
    </linearGradient>
    <radialGradient id="glow" cx="78%" cy="6%" r="62%">
      <stop offset="0" stop-color="${t.gold}" stop-opacity=".20"/>
      <stop offset="1" stop-color="${t.gold}" stop-opacity="0"/>
    </radialGradient>
    <style>
      .n { font: 700 46px -apple-system, "Segoe UI", Inter, sans-serif; letter-spacing:-1.6px; fill:${t.text} }
      .r { font: 400 17.5px -apple-system, "Segoe UI", Inter, sans-serif; fill:${t.text}; opacity:.9 }
      .m { font: 400 13.5px -apple-system, "Segoe UI", Inter, sans-serif; fill:${t.muted} }
      .k { font: 700 19px ui-monospace, SFMono-Regular, Menlo, monospace; fill:${t.gold} }
      .l { font: 400 11px -apple-system, "Segoe UI", Inter, sans-serif; fill:${t.muted} }
    </style>
  </defs>
  <rect width="900" height="300" rx="14" fill="url(#bg)"/>
  <rect width="900" height="300" rx="14" fill="url(#glow)"/>
  <rect x=".5" y=".5" width="899" height="299" rx="14" fill="none" stroke="${t.line}"/>

  <circle cx="52" cy="52" r="5" fill="${t.gold}"/>
  <text x="68" y="57" class="l" letter-spacing="2.2">${esc(cfg.badge)}</text>

  <text x="50" y="126" class="n">${esc(cfg.name)}</text>
  <text x="50" y="158" class="r">${esc(cfg.role)}</text>
  <text x="50" y="182" class="m">${esc(cfg.meta)}</text>

  <line x1="50" y1="208" x2="850" y2="208" stroke="${t.line}"/>

  <g>
${cells}
  </g>
${strip}</svg>
`;
}

const cfg = JSON.parse(await readFile(resolve(ROOT, "data/header.json"), "utf8"));
const live = { contributions: await contributions(), claude: await claudeStats() };

let changed = 0;
for (const [name, t] of Object.entries(THEMES)) {
  const path = resolve(OUT, `header-${name}.svg`);
  const next = render(cfg, live, t);
  const prev = existsSync(path) ? await readFile(path, "utf8") : "";
  if (next !== prev) { changed++; if (!CHECK) await writeFile(path, next); }
  console.log(`  header-${name}.svg  ${next === prev ? "unchanged" : CHECK ? "WOULD CHANGE" : "written"}`);
}
console.log(`\n  ${live.contributions.total.toLocaleString()} contributions · ${live.contributions.activeDays} active days` +
            (live.claude ? ` · Claude Code: ${compact(live.claude.tokens)} tokens, ${live.claude.sessions} sessions` : " · no Claude gist configured"));
if (CHECK && changed) process.exit(1);
