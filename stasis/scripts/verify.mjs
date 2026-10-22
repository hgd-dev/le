import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "..");
const failures = [];
const notes = [];

function ok(condition, message) {
  if (!condition) failures.push(message);
  else notes.push(`✓ ${message}`);
}

function read(rel) { return fs.readFileSync(path.join(root, rel), "utf8"); }

const expected = [
  "index.html", "style.css", "games.css", "games.js", "app.js", "config.js", "manifest.webmanifest", "sw.js",
  "icons/icon-192.png", "icons/icon-512.png", "supabase/schema.sql", "supabase/games_migration.sql", "supabase/stasis_v1_2_complete_upgrade.sql",
  "supabase/functions/send-push/index.ts"
];
expected.forEach(rel => ok(fs.existsSync(path.join(root, rel)), `exists: ${rel}`));

for (const rel of ["app.js", "games.js", "sw.js", "config.js"]) {
  try { new Function(read(rel)); ok(true, `JavaScript parses: ${rel}`); }
  catch (error) { ok(false, `JavaScript parse failed: ${rel}: ${error.message}`); }
}

let manifest;
try { manifest = JSON.parse(read("manifest.webmanifest")); ok(true, "manifest.webmanifest parses"); }
catch (error) { ok(false, `manifest.webmanifest parse failed: ${error.message}`); }
if (manifest) {
  for (const icon of manifest.icons || []) ok(fs.existsSync(path.join(root, icon.src)), `manifest icon exists: ${icon.src}`);
}

const html = read("index.html");
const refs = [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map(match => match[1]);
for (const ref of refs) {
  if (/^(https?:|#|mailto:)/.test(ref)) continue;
  ok(fs.existsSync(path.join(root, ref)), `HTML local asset exists: ${ref}`);
}

const app = read("app.js");
const games = read("games.js");
const schema = read("supabase/schema.sql");
const rpcs = new Set([...`${app}\n${games}`.matchAll(/\.rpc\("([^"]+)"/g)].map(match => match[1]));
const sqlFunctions = new Set([...schema.matchAll(/create or replace function public\.([a-zA-Z0-9_]+)/gi)].map(match => match[1]));
for (const rpc of [...rpcs].sort()) ok(sqlFunctions.has(rpc), `frontend RPC exists in schema: ${rpc}`);
const arcadeRpcs = [
  "create_stasis_game","join_stasis_game","leave_stasis_game","start_stasis_game",
  "submit_stasis_game_state","cancel_stasis_game","resign_stasis_game","rematch_stasis_game"
];
for (const rpc of arcadeRpcs) ok(sqlFunctions.has(rpc), `Arcade RPC exists in schema: ${rpc}`);

ok(schema.split("$$").length % 2 === 1, "SQL dollar-quote pairs are balanced");
ok(/alter table public\.stasis_cards enable row level security/i.test(schema), "RLS enabled for cards");
ok(/users update own card/i.test(schema), "own-card update policy present");
ok(/notification_outbox/i.test(schema), "notification outbox present");
ok(/create table if not exists public\.game_sessions/i.test(schema), "Arcade game_sessions table present");
ok(/room members read games/i.test(schema), "Arcade room-member RLS policy present");
ok(/submit_stasis_game_state/i.test(schema), "Arcade turn-state RPC present");
ok(/game_sessions.*supabase_realtime/is.test(schema), "Arcade realtime publication present");
const gameTypes = [...games.matchAll(/^\s{4}([a-z0-9_]+): \{ name:/gm)].map(m => m[1]);
ok(gameTypes.length >= 19, `Arcade exposes at least 19 games (${gameTypes.length})`);
for (const game of gameTypes) ok(new RegExp(`["']${game}["']`).test(schema), `game type exists in schema: ${game}`);
const upgrade = read("supabase/stasis_v1_2_complete_upgrade.sql");
ok(/char_length\(note\) <= 1500/i.test(upgrade), "one-shot upgrade raises note limit to 1500");
ok(/create table if not exists public\.game_sessions/i.test(upgrade), "one-shot upgrade includes Arcade table");

const forbidden = [
  /service_role\s*[:=]\s*["'][A-Za-z0-9._-]{20,}/i,
  /VAPID_PRIVATE_KEY\s*[:=]\s*["'][A-Za-z0-9_-]{20,}/i,
  /postgres(?:ql)?:\/\/[^\s"']+:[^\s"']+@/i
];
const repoText = ["app.js", "games.js", "config.js", "SETUP.md", "README.md", "supabase/schema.sql", "supabase/games_migration.sql"].map(read).join("\n");
for (const pattern of forbidden) ok(!pattern.test(repoText), `no committed secret matching ${pattern}`);

const configured = !read("config.js").includes("REPLACE_ME") && !read("config.js").includes("YOUR_PROJECT");
notes.push(configured ? "ℹ config.js appears connected" : "ℹ config.js intentionally still contains setup placeholders");

console.log(notes.join("\n"));
if (failures.length) {
  console.error("\nVerification failed:\n" + failures.map(item => `✗ ${item}`).join("\n"));
  process.exit(1);
}
console.log(`\nStasis static verification passed (${notes.filter(n => n.startsWith("✓")).length} checks).`);
