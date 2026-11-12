#!/usr/bin/env node
/**
 * Compute lifetime npm downloads and write data/npm-downloads.json.
 *
 *   node scripts/npm-downloads.mjs [--out data] [--check]
 *
 * npm has no lifetime-downloads endpoint, and asking for one silently lies.
 * `/downloads/point/2020-01-01:2026-11-12/concord-engine` returns 200 with a
 * number — and a `start` of 2025-05-12, because the API clamps any window to
 * about 18 months and reports the window it actually used. Nothing errors. A
 * script that trusts the number it asked for undercounts every package older
 * than 18 months and never says so.
 *
 * So this walks contiguous sub-18-month windows from each package's first
 * publish to today, sums the daily series, and asserts two things per window:
 * that the API returned the window it was asked for, and that the summed daily
 * series equals the point total for the same window. Either mismatch throws.
 *
 * It also separates two numbers that are not the same claim:
 *
 *   total  — every download, including the publish-day spike.
 *   tail   — downloads from the 8th day after first publish onward.
 *
 * That split exists because the spike is not adoption. concord-engine took 523
 * of its first 1010 downloads on publish day; shadowjoin took 705 of 1212. In
 * both cases the three biggest days are about three quarters of all downloads,
 * which is registry propagation — mirrors and crawlers pulling a new version
 * once. data/header.json has said since 2026-10-17 that a usage number belongs
 * on the card "only when it reflects people choosing the package", and `tail`
 * is the figure that can carry that claim. `total` is the bigger number and the
 * one people usually publish; it is kept here, labelled for what it is, so the
 * choice of which to display is made in the data file and not by arithmetic
 * hidden in a renderer.
 *
 * No secrets, no auth: api.npmjs.org and registry.npmjs.org are both public.
 * If a source fails this throws before writing, so the last good file stays
 * committed rather than being replaced by a worse one.
 */
import { readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const OUT = resolve(ROOT, arg("out", "data"));
const CHECK = process.argv.includes("--check");

/** npm clamps a download window to ~18 months. 540 days stays inside that. */
const WINDOW_DAYS = 540;
/** Days from first publish treated as release propagation rather than use. */
const LAUNCH_DAYS = 7;
/**
 * npm's download stats begin here. Ask for a day before it and the API returns
 * HTTP 400 with {"error":"end date > start date"}, which is not the reason and
 * sends you looking at your own date arithmetic. Verified by probing: 2015-01-09
 * is a 400, 2015-01-10 is a 200. A package first published before this date
 * cannot have a true lifetime figure from this source, so its count starts here
 * and `countedFrom` records that rather than letting "lifetime" overclaim.
 */
const STATS_EPOCH = "2015-01-10";

const UA = { "User-Agent": "npm-downloads" };

async function getJson(url, { allow404 = false } = {}) {
  const r = await fetch(url, { headers: UA });
  if (r.status === 404 && allow404) return null;
  if (!r.ok) throw new Error(`${url} -> ${r.status}`);
  return r.json();
}

const day = (d) => d.toISOString().slice(0, 10);
const addDays = (iso, n) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return day(d); };
const daysBetween = (a, b) => Math.round((new Date(`${b}T00:00:00Z`) - new Date(`${a}T00:00:00Z`)) / 86400000);

/**
 * Contiguous windows covering [from, to], each at most WINDOW_DAYS long.
 * Contiguous and non-overlapping: a gap undercounts, an overlap double-counts,
 * and both look like a plausible total.
 */
function windows(from, to) {
  const out = [];
  let start = from;
  while (daysBetween(start, to) >= 0) {
    const end = daysBetween(start, to) > WINDOW_DAYS ? addDays(start, WINDOW_DAYS) : to;
    out.push([start, end]);
    start = addDays(end, 1);
  }
  return out;
}

/** Daily downloads for one package across one window, summed and cross-checked. */
async function windowDownloads(pkg, start, end) {
  // npm 404s a window it has no stats rows for at all, which is what a
  // package published in the last day or two looks like. The registry has
  // already confirmed this package exists, so that is a real zero rather than
  // a lookup failure; a misspelled name fails earlier, at time.created.
  const range = await getJson(`https://api.npmjs.org/downloads/range/${start}:${end}/${pkg}`, { allow404: true });
  if (range === null) return [];
  if (range.start !== start || range.end !== end) {
    throw new Error(`${pkg}: asked for ${start}:${end}, API answered ${range.start}:${range.end} — window was clamped, so the chunk size is wrong`);
  }
  const days = range.downloads ?? [];
  const summed = days.reduce((n, d) => n + d.downloads, 0);

  const point = await getJson(`https://api.npmjs.org/downloads/point/${start}:${end}/${pkg}`, { allow404: true });
  if (point && point.downloads !== summed) {
    throw new Error(`${pkg} ${start}:${end}: daily series sums to ${summed}, point endpoint says ${point.downloads}`);
  }
  return days;
}

async function forPackage(pkg, today) {
  const meta = await getJson(`https://registry.npmjs.org/${encodeURIComponent(pkg)}`);
  const created = meta.time?.created?.slice(0, 10);
  if (!created) throw new Error(`${pkg}: registry has no time.created`);
  const countedFrom = created < STATS_EPOCH ? STATS_EPOCH : created;

  // Published after the cutoff: nothing to count yet, and windows() would
  // otherwise be asked for a range that ends before it starts.
  const days = [];
  if (daysBetween(countedFrom, today) >= 0) {
    for (const [s, e] of windows(countedFrom, today)) days.push(...await windowDownloads(pkg, s, e));
  }

  const total = days.reduce((n, d) => n + d.downloads, 0);
  const tailFrom = addDays(countedFrom, LAUNCH_DAYS);
  const tail = days.filter((d) => d.day >= tailFrom).reduce((n, d) => n + d.downloads, 0);

  const ranked = [...days].sort((a, b) => b.downloads - a.downloads);
  const biggest = ranked[0] ?? { day: null, downloads: 0 };
  const top3 = ranked.slice(0, 3).reduce((n, d) => n + d.downloads, 0);

  return {
    name: pkg,
    firstPublish: created,
    countedFrom,
    ...(created < STATS_EPOCH ? { lifetimeTruncated: `npm has no download data before ${STATS_EPOCH}` } : {}),
    latest: meta["dist-tags"]?.latest ?? null,
    total,
    tail,
    tailFrom,
    biggestDay: biggest.day ? { day: biggest.day, downloads: biggest.downloads } : null,
    top3SharePct: total ? Math.round((1000 * top3) / total) / 10 : null,
    daysWithDownloads: days.filter((d) => d.downloads > 0).length,
    daysObserved: days.length,
  };
}

/**
 * The packages to count. Read from data/npm-packages.json so publishing a new
 * one is a one-line edit next to the other data files, not a code change.
 *
 * The registry's maintainer search is also consulted — not as the source of
 * truth, because a search-index gap would silently shrink the total and still
 * look like a real number, but to report anything published and not yet listed.
 */
async function packageList() {
  const file = resolve(ROOT, "data/npm-packages.json");
  const listed = JSON.parse(await readFile(file, "utf8")).packages;
  if (!Array.isArray(listed) || !listed.length) throw new Error("data/npm-packages.json has no packages");

  let unlisted = [];
  try {
    const found = await getJson("https://registry.npmjs.org/-/v1/search?text=maintainer:harsh-chandak&size=100");
    unlisted = (found.objects ?? []).map((o) => o.package.name).filter((n) => !listed.includes(n));
  } catch {
    // The search index is a convenience here. Losing it must not fail a run
    // whose actual inputs are the listed packages.
    unlisted = [];
  }
  return { listed, unlisted };
}

// npm publishes a daily rollup in arrears: there is no row for today. Counting
// to today would mean every run includes one window whose data does not exist
// yet, so the total would depend on when the job happened to run.
const asOf = addDays(day(new Date()), -1);
const { listed, unlisted } = await packageList();
const packages = [];
for (const p of listed) packages.push(await forPackage(p, asOf));

const total = packages.reduce((n, p) => n + p.total, 0);
const tail = packages.reduce((n, p) => n + p.tail, 0);

const out = {
  _comment:
    "Generated by scripts/npm-downloads.mjs. Do not edit. `total` counts every download including the publish-day spike; `tail` counts from the 8th day after each package's first publish, which is the figure that reflects someone choosing the package rather than a mirror pulling a new version once. See the script's header for why the two are reported separately, and data/header.json for the standing rule about putting a usage number on the card.",
  asOf,
  source: "api.npmjs.org/downloads (daily series, summed) + registry.npmjs.org for first-publish dates",
  method: `contiguous windows of at most ${WINDOW_DAYS} days from each package's first publish, because the downloads API clamps any wider window to about 18 months and reports the clamped one without erroring; each window's daily series is checked against the point total for the same window`,
  launchWindowDays: LAUNCH_DAYS,
  total,
  tail,
  packageCount: packages.length,
  packages,
  ...(unlisted.length ? { unlistedOnNpm: unlisted } : {}),
};

const file = resolve(OUT, "npm-downloads.json");
const next = `${JSON.stringify(out, null, 2)}\n`;
const prev = await readFile(file, "utf8").catch(() => "");

// asOf changes daily, so compare everything else: a date bump alone is not a
// change worth a commit in a repo whose workflow commits only on change.
const strip = (s) => s.replace(/^\s*"asOf":.*$/m, "");
const changed = strip(prev) !== strip(next);

if (!CHECK) await writeFile(file, next);

console.log(`${packages.length} packages · total ${total} · tail ${tail} (from day ${LAUNCH_DAYS + 1}) · as of ${asOf}`);
for (const p of packages) {
  console.log(`  ${p.name.padEnd(20)} total ${String(p.total).padStart(6)}  tail ${String(p.tail).padStart(6)}  biggest day ${p.biggestDay ? `${p.biggestDay.downloads} (${p.biggestDay.day})` : "none"}${p.top3SharePct !== null ? `  top3 ${p.top3SharePct}%` : ""}`);
}
if (unlisted.length) console.log(`\nnot in data/npm-packages.json: ${unlisted.join(", ")}`);
console.log(changed ? "\nfigures changed" : "\nfigures unchanged");

if (CHECK && changed) process.exit(1);
