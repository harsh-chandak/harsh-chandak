#!/usr/bin/env node
/**
 * Render a card per project into assets/project-<slug>-{dark,light}.svg.
 *
 *   node scripts/project-cards.mjs [--out assets] [--check]
 *
 * Same palette and type scale as the profile header, at 1280x640 so one image
 * works in three places that each want a different thing: a README hero, a
 * GitHub social preview (1280x640 exactly), and a LinkedIn featured card.
 *
 * The headline numbers come from data/projects.json, where every project
 * carries a "note" recording where its figures came from, the same way the
 * resume bank does. Stars and the primary language are read live from the
 * public API, because those are the two facts that go stale on their own.
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

const W = 1280, H = 640;
const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/**
 * Greedy wrap by estimated width. An exact measurement needs a font engine we
 * do not have here, so characters are bucketed: a line of "Illll" and a line of
 * "WWWWW" are nowhere near the same width and a flat per-character average puts
 * one of them off the card.
 */
const NARROW = new Set([..."ijlftr.,;:'!|()[]/\\ "]);
const WIDE = new Set([..."mwMWQ@%0123456789"]);
const emWidth = (ch) => (NARROW.has(ch) ? 0.30 : WIDE.has(ch) ? 0.62 : 0.52);
const textWidth = (s, px) => [...s].reduce((a, c) => a + emWidth(c), 0) * px;

function wrap(text, px, maxPx, maxLines) {
  const words = String(text).split(/\s+/).filter(Boolean);

  // Greedy first, to find how many lines the text actually needs.
  const greedy = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (textWidth(next, px) <= maxPx || !cur) { cur = next; continue; }
    greedy.push(cur); cur = w;
  }
  if (cur) greedy.push(cur);

  if (greedy.length > maxLines) {
    // Too long for the card. Clip rather than overflow, so the JSON being wrong
    // looks wrong instead of running off the edge.
    const kept = greedy.slice(0, maxLines);
    kept[maxLines - 1] = kept[maxLines - 1].replace(/[.,;:]?$/, "") + "\u2026";
    return kept;
  }
  if (greedy.length < 2) return greedy;

  // Greedy packs line one full and leaves an orphan ("...a single model" /
  // "call."). Re-break at the point that makes the longest line as short as
  // possible, which spreads the words evenly instead.
  const n = greedy.length;
  let best = greedy, bestMax = Infinity;
  const breaks = (start, depth, acc) => {
    if (depth === n - 1) {
      const lines = [...acc, words.slice(start).join(" ")];
      const widths = lines.map((l) => textWidth(l, px));
      if (Math.max(...widths) > maxPx) return;
      const worst = Math.max(...widths);
      if (worst < bestMax) { bestMax = worst; best = lines; }
      return;
    }
    for (let i = start + 1; i < words.length - (n - depth - 2); i++) {
      breaks(i, depth + 1, [...acc, words.slice(start, i).join(" ")]);
    }
  };
  breaks(0, 0, []);
  return best;
}

async function repoMeta(slug) {
  const r = await fetch(`https://api.github.com/repos/${USER}/${slug}`, {
    headers: {
      "User-Agent": "project-cards",
      Accept: "application/vnd.github+json",
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
  });
  if (!r.ok) throw new Error(`repos/${slug} -> ${r.status}`);
  const j = await r.json();
  return { stars: j.stargazers_count ?? 0, language: j.language || "", license: j.license?.spdx_id || "" };
}

function render(p, meta, t) {
  // The kicker names the domain only. Linguist's answer is a poor label for
  // several of these: it reports Prolog for Clingo answer-set programs and
  // JavaScript for a zero-knowledge project, so the card read "ANSWER SET
  // PROGRAMMING · PROLOG" and contradicted itself. The stack line at the foot
  // is hand-written per project and says what was actually used.
  const kicker = p.kicker;
  const lines = wrap(p.line, 27, W - 100, 2);
  const alt = `${p.name}. ${p.line} ${p.stats.map((s) => `${s.k} ${s.l}`).join(". ")}. Built with ${p.stack}.`;

  // Three evenly spaced stat cells across the usable width.
  const x0 = 50, span = (W - 100) / 3;
  const cells = p.stats.map((s, i) => {
    const x = Math.round(x0 + span * i);
    return `    <text x="${x}" y="458" class="k">${esc(s.k)}</text>\n` +
           `    <text x="${x}" y="488" class="m">${esc(s.l)}</text>`;
  }).join("\n");

  const right = [meta.stars ? `★ ${meta.stars}` : "", meta.license && meta.license !== "NOASSERTION" ? meta.license : ""]
    .filter(Boolean).join("   ·   ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(alt)}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${t.bg0}"/><stop offset="1" stop-color="${t.bg1}"/>
    </linearGradient>
    <radialGradient id="glow" cx="80%" cy="4%" r="64%">
      <stop offset="0" stop-color="${t.gold}" stop-opacity=".20"/>
      <stop offset="1" stop-color="${t.gold}" stop-opacity="0"/>
    </radialGradient>
    <style>
      .n { font: 700 72px -apple-system, "Segoe UI", Inter, sans-serif; letter-spacing:-2.4px; fill:${t.text} }
      .r { font: 400 27px -apple-system, "Segoe UI", Inter, sans-serif; fill:${t.text}; opacity:.9 }
      .m { font: 400 17px -apple-system, "Segoe UI", Inter, sans-serif; fill:${t.muted} }
      .k { font: 700 32px ui-monospace, SFMono-Regular, Menlo, monospace; fill:${t.gold} }
      .l { font: 400 14px -apple-system, "Segoe UI", Inter, sans-serif; fill:${t.muted} }
      .s { font: 400 16px ui-monospace, SFMono-Regular, Menlo, monospace; fill:${t.muted} }
    </style>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>

  <circle cx="54" cy="74" r="6" fill="${t.gold}"/>
  <text x="74" y="80" class="l" letter-spacing="2.6">${esc(kicker)}</text>

  <text x="50" y="214" class="n">${esc(p.name)}</text>
${lines.map((l, i) => `  <text x="50" y="${276 + i * 38}" class="r">${esc(l)}</text>`).join("\n")}

  <line x1="50" y1="398" x2="${W - 50}" y2="398" stroke="${t.line}"/>
  <g>
${cells}
  </g>

  <line x1="50" y1="548" x2="${W - 50}" y2="548" stroke="${t.line}"/>
  <text x="50" y="586" class="s">${esc(p.stack)}</text>
  <text x="${W - 50}" y="586" class="s" text-anchor="end">${esc(meta.footer || `github.com/${USER}/${p.slug}`)}</text>
  ${right ? `<text x="${W - 50}" y="80" class="l" text-anchor="end">${esc(right)}</text>` : ""}
</svg>
`;
}

// Some of his LinkedIn projects are coursework that never got a repository.
// They still want a card, so a project may set "repo": false — no API call, and
// the foot of the card points at the portfolio instead of a github.com path.
const cfg = JSON.parse(await readFile(resolve(ROOT, arg("data", "data/projects.json")), "utf8"));
let changed = 0;
for (const p of cfg.projects) {
  const meta = p.repo === false
    ? { stars: 0, language: "", license: "", footer: p.footer || "harsh-chandak.com" }
    : await repoMeta(p.slug);
  for (const [name, t] of Object.entries(THEMES)) {
    const path = resolve(OUT, `project-${p.slug}-${name}.svg`);
    const next = render(p, meta, t);
    const prev = existsSync(path) ? await readFile(path, "utf8") : "";
    if (next !== prev) { changed++; if (!CHECK) await writeFile(path, next); }
    console.log(`  project-${p.slug}-${name}.svg  ${next === prev ? "unchanged" : CHECK ? "WOULD CHANGE" : "written"}`);
  }
}
console.log(`\n  ${cfg.projects.length} projects, ${changed} file(s) ${CHECK ? "would change" : "written"}`);
if (CHECK && changed) process.exit(1);
