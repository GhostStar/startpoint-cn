import http from "node:http";
import { promises as fs } from "node:fs";
import fssync from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  TABLE_ALIASES,
  logicalFromAlias,
  relativeUploadPath,
  loadTable,
  tableSummary,
  getRow,
  setTextRow,
  setCsvCell,
  setNestedCsvCell,
  writeTable,
  addPending,
  readPending,
  clearPending,
  recordChange,
  resolveProfile,
} from "./lib/wf-core.js";
import { publishDiff } from "./lib/publish.js";
import { buildTableMetadata, decorateSummary, decorateRow } from "./lib/metadata.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const modRoot = path.resolve(__dirname, "..");
const profile = resolveProfile(modRoot);
const host = process.env.WF_WEB_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.WF_WEB_PORT || "8787", 10);
const dataRoot = path.resolve(process.env.WF_DATA_ROOT || path.join(__dirname, ".."));
const defaultTargetStore = fssync.existsSync(path.join(dataRoot, ".cdn", "cn", "production", "upload"))
  ? path.join(dataRoot, ".cdn", "cn", "production", "upload")
  : path.join(dataRoot, "WorldFlipper", "dummy", "download", "production", "upload");
const targetStore = path.resolve(process.env.WF_TARGET_STORE || profile?.store || defaultTargetStore);
const sourceStore = process.env.WF_SOURCE_STORE || profile?.fallback || null;
const cdnRoot = path.resolve(process.env.WF_CDN_DIR || profile?.cdndata || path.join(dataRoot, ".cdn", "cn"));
const sourceArchiveDir = path.resolve(process.env.WF_COMMON_FULL_DIR || path.join(cdnRoot, "archive-common-full"));
const workDir = path.join(__dirname, "work");
const defaultAllowed = ["assets", ".cdn/cn", "web", "docs/generated", "node-web-editor/sandbox"];
const allowedDirs = (process.env.WF_ALLOWED_DIRS || defaultAllowed.join(","))
  .split(",")
  .map(s => s.trim())
  .filter(Boolean);

const maxBodyBytes = 32 * 1024 * 1024;
const textTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".md", "text/markdown; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".csv", "text/csv; charset=utf-8"],
]);

function tableContext() {
  return { store: targetStore, sourceStore, sourceArchiveDir, dataRoot, modRoot };
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, {
    "content-type": type,
    "content-length": Buffer.byteLength(payload),
    "cache-control": "no-store",
  });
  res.end(payload);
}

function fail(res, status, message) {
  send(res, status, { error: message });
}

function decodeUrlPath(value) {
  return decodeURIComponent(String(value || "").replace(/\+/g, " "));
}

function toPosixRelative(absPath) {
  return path.relative(dataRoot, absPath).split(path.sep).join("/");
}

function isAllowedRelative(rel) {
  const normalized = rel.split(path.sep).join("/");
  return allowedDirs.some(dir => normalized === dir || normalized.startsWith(`${dir}/`));
}

function resolveEditablePath(relInput) {
  const rel = decodeUrlPath(relInput).replace(/^\/+/, "");
  if (!rel || rel.includes("\0")) throw new Error("Invalid path");
  const abs = path.resolve(dataRoot, rel);
  const rootWithSep = dataRoot.endsWith(path.sep) ? dataRoot : dataRoot + path.sep;
  if (abs !== dataRoot && !abs.startsWith(rootWithSep)) throw new Error("Path escapes data root");
  const normalizedRel = toPosixRelative(abs);
  if (!isAllowedRelative(normalizedRel)) throw new Error(`Path is outside allowed dirs: ${normalizedRel}`);
  return { abs, rel: normalizedRel };
}

function resolveStaticPath(urlPath) {
  const rel = urlPath === "/" ? "index.html" : urlPath.replace(/^\/+/, "");
  const abs = path.resolve(__dirname, "public", rel);
  const root = path.resolve(__dirname, "public");
  if (abs !== root && !abs.startsWith(root + path.sep)) throw new Error("Invalid static path");
  return abs;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBodyBytes) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

async function listFiles(rootRel) {
  const { abs, rel } = resolveEditablePath(rootRel || allowedDirs[0]);
  const out = [];
  if (!fssync.existsSync(abs)) return { root: rel, files: out };
  async function walk(dir, depth) {
    if (depth > 6 || out.length >= 2000) return;
    const entries = await fs.readdir(dir, { withFileTypes: true });
    entries.sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith(".git")) continue;
      const full = path.join(dir, entry.name);
      const itemRel = toPosixRelative(full);
      if (entry.isDirectory()) {
        out.push({ path: itemRel, type: "dir" });
        await walk(full, depth + 1);
      } else if (/\.(json|txt|md|csv|html|js|css)$/i.test(entry.name)) {
        const stat = await fs.stat(full);
        out.push({ path: itemRel, type: "file", size: stat.size, mtime: stat.mtime.toISOString() });
      }
      if (out.length >= 2000) break;
    }
  }
  await walk(abs, 0);
  return { root: rel, files: out };
}

async function searchFiles(query, rootRel) {
  const q = String(query || "").toLowerCase();
  if (q.length < 2) return { query, results: [] };
  const listed = await listFiles(rootRel || allowedDirs[0]);
  const results = [];
  for (const item of listed.files) {
    if (item.type !== "file") continue;
    if (item.path.toLowerCase().includes(q)) {
      results.push({ path: item.path, match: "path" });
      continue;
    }
    if (results.length >= 100) break;
    if ((item.size || 0) > 2 * 1024 * 1024) continue;
    try {
      const { abs } = resolveEditablePath(item.path);
      const text = await fs.readFile(abs, "utf8");
      const idx = text.toLowerCase().indexOf(q);
      if (idx !== -1) {
        results.push({
          path: item.path,
          match: "content",
          preview: text.slice(Math.max(0, idx - 60), idx + 140).replace(/\s+/g, " "),
        });
      }
    } catch {
      // Ignore unreadable files during search.
    }
    if (results.length >= 100) break;
  }
  return { query, results };
}

function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

async function saveText(relPath, content) {
  const { abs, rel } = resolveEditablePath(relPath);
  const ext = path.extname(abs).toLowerCase();
  if (!textTypes.has(ext)) throw new Error(`Unsupported file type: ${ext}`);
  if (ext === ".json") JSON.parse(content);
  const old = fssync.existsSync(abs) ? await fs.readFile(abs) : null;
  let backup = null;
  if (old !== null) {
    backup = `${abs}.bak-nodeweb-${timestamp()}`;
    await fs.writeFile(backup, old);
  }
  await fs.mkdir(path.dirname(abs), { recursive: true });
  await fs.writeFile(abs, content, "utf8");
  const stat = await fs.stat(abs);
  return { ok: true, path: rel, backup: backup ? toPosixRelative(backup) : null, size: stat.size };
}

async function readChangelog() {
  const file = path.join(workDir, "changelog.jsonl");
  try {
    const text = await fs.readFile(file, "utf8");
    return text.split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean)
      .reverse();
  } catch {
    return [];
  }
}

function setJsonPointer(obj, pointer, value) {
  if (!pointer || pointer === "/") return value;
  const parts = pointer.split("/").slice(1).map(part => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const key = parts[i];
    if (cur[key] === undefined || cur[key] === null) {
      const next = parts[i + 1];
      cur[key] = /^\d+$/.test(next) ? [] : {};
    }
    cur = cur[key];
  }
  cur[parts[parts.length - 1]] = value;
  return obj;
}

async function routeApi(req, res, url) {
  if (req.method === "GET" && url.pathname === "/api/status") {
    return send(res, 200, {
      dataRoot,
      allowedDirs,
      node: process.version,
      profile: profile ? { id: profile.id, label: profile.label, resVersion: profile.resVersion } : null,
      targetStore,
      sourceStore,
      cdnRoot,
      sourceArchiveDir,
      pending: await readPending(workDir),
    });
  }
  if (req.method === "GET" && url.pathname === "/api/files") {
    return send(res, 200, await listFiles(url.searchParams.get("root") || allowedDirs[0]));
  }
  if (req.method === "GET" && url.pathname === "/api/search") {
    return send(res, 200, await searchFiles(url.searchParams.get("q"), url.searchParams.get("root")));
  }
  if (req.method === "GET" && url.pathname === "/api/file") {
    const { abs, rel } = resolveEditablePath(url.searchParams.get("path"));
    const stat = await fs.stat(abs);
    if (!stat.isFile()) throw new Error("Not a file");
    if (stat.size > maxBodyBytes) throw new Error("File is too large for editor");
    return send(res, 200, { path: rel, content: await fs.readFile(abs, "utf8"), size: stat.size, mtime: stat.mtime.toISOString() });
  }
  if (req.method === "POST" && url.pathname === "/api/file") {
    const body = await readBody(req);
    return send(res, 200, await saveText(body.path, String(body.content ?? "")));
  }
  if (req.method === "POST" && url.pathname === "/api/json/set") {
    const body = await readBody(req);
    const { abs } = resolveEditablePath(body.path);
    const data = JSON.parse(await fs.readFile(abs, "utf8"));
    const updated = setJsonPointer(data, String(body.pointer || ""), body.value);
    return send(res, 200, await saveText(body.path, JSON.stringify(updated, null, 2) + "\n"));
  }
  if (req.method === "GET" && url.pathname === "/api/mod/tables") {
    const tables = Object.entries(TABLE_ALIASES).map(([alias, logicalPath]) => {
      const rel = relativeUploadPath(logicalPath);
      const file = path.join(targetStore, rel);
      return { alias, logicalPath, rel, exists: fssync.existsSync(file), file };
    });
    return send(res, 200, { targetStore, sourceStore, sourceArchiveDir, cdnRoot, tables, pending: await readPending(workDir) });
  }
  if (req.method === "GET" && url.pathname === "/api/mod/changelog") {
    return send(res, 200, { entries: await readChangelog(), pending: await readPending(workDir) });
  }
  if (req.method === "GET" && url.pathname === "/api/mod/table") {
    const logicalPath = logicalFromAlias(url.searchParams.get("table") || "ability");
    const table = await loadTable({ ...tableContext(), logicalPath });
    const metadata = await buildTableMetadata(tableContext(), logicalPath);
    return send(res, 200, decorateSummary(tableSummary(table, Number.parseInt(url.searchParams.get("limit") || "500", 10)), metadata));
  }
  if (req.method === "GET" && url.pathname === "/api/mod/row") {
    const logicalPath = logicalFromAlias(url.searchParams.get("table") || "ability");
    const key = url.searchParams.get("key");
    if (!key) return fail(res, 400, "missing key");
    const table = await loadTable({ ...tableContext(), logicalPath });
    const metadata = await buildTableMetadata(tableContext(), logicalPath);
    return send(res, 200, { table: logicalPath, ...decorateRow(getRow(table, key), metadata) });
  }
  if (req.method === "POST" && url.pathname === "/api/mod/row") {
    const body = await readBody(req);
    const logicalPath = logicalFromAlias(body.table || "ability");
    const key = String(body.key || "");
    if (!key) return fail(res, 400, "missing key");
    const table = await loadTable({ ...tableContext(), logicalPath });
    if (table.rawRows) return fail(res, 400, "raw-row table editing is not implemented yet");
    setTextRow(table, key, String(body.text ?? ""));
    if (body.dryRun) return send(res, 200, { ok: true, dryRun: true, table: logicalPath, key });
    const written = await writeTable({ table, store: targetStore });
    const pending = await addPending(workDir, targetStore, written.target);
    await recordChange(workDir, {
      table: Object.entries(TABLE_ALIASES).find(([, v]) => v === logicalPath)?.[0] || logicalPath,
      logical: logicalPath,
      keys: [key],
      summary: `save row ${key}`,
      backup: written.backup,
    });
    return send(res, 200, { ok: true, table: logicalPath, key, written, pending });
  }
  if (req.method === "POST" && url.pathname === "/api/mod/cell") {
    const body = await readBody(req);
    const logicalPath = logicalFromAlias(body.table || "ability");
    const key = String(body.key || "");
    if (!key) return fail(res, 400, "missing key");
    const table = await loadTable({ ...tableContext(), logicalPath });
    const rows = setCsvCell(table, key, body.line || 1, body.column || 0, body.value ?? "");
    if (body.dryRun) return send(res, 200, { ok: true, dryRun: true, table: logicalPath, key, rows });
    const written = await writeTable({ table, store: targetStore });
    const pending = await addPending(workDir, targetStore, written.target);
    await recordChange(workDir, {
      table: Object.entries(TABLE_ALIASES).find(([, v]) => v === logicalPath)?.[0] || logicalPath,
      logical: logicalPath,
      keys: [key],
      summary: `set ${key} line=${body.line || 1} col=${body.column || 0} value=${body.value ?? ""}`,
      backup: written.backup,
    });
    return send(res, 200, { ok: true, table: logicalPath, key, written, pending });
  }
  if (req.method === "POST" && url.pathname === "/api/mod/nested-cell") {
    const body = await readBody(req);
    const logicalPath = logicalFromAlias(body.table || "ability");
    const key = String(body.key || "");
    const nestedKey = String(body.nestedKey || "");
    if (!key) return fail(res, 400, "missing key");
    if (!nestedKey) return fail(res, 400, "missing nestedKey");
    const table = await loadTable({ ...tableContext(), logicalPath });
    const rows = setNestedCsvCell(table, key, nestedKey, body.line || 1, body.column || 0, body.value ?? "");
    if (body.dryRun) return send(res, 200, { ok: true, dryRun: true, table: logicalPath, key, nestedKey, rows });
    const written = await writeTable({ table, store: targetStore });
    const pending = await addPending(workDir, targetStore, written.target);
    await recordChange(workDir, {
      table: Object.entries(TABLE_ALIASES).find(([, v]) => v === logicalPath)?.[0] || logicalPath,
      logical: logicalPath,
      keys: [key],
      summary: `set ${key}/${nestedKey} line=${body.line || 1} col=${body.column || 0} value=${body.value ?? ""}`,
      backup: written.backup,
    });
    return send(res, 200, { ok: true, table: logicalPath, key, nestedKey, written, pending });
  }
  if (req.method === "POST" && url.pathname === "/api/mod/publish") {
    const body = await readBody(req);
    const result = await publishDiff({
      workDir,
      tables: body.tables || null,
      store: targetStore,
      cdnRoot,
      listOnly: !!body.listOnly,
      fromVersion: body.fromVersion || null,
    });
    return send(res, 200, result);
  }
  if (req.method === "POST" && url.pathname === "/api/mod/pending/clear") {
    await clearPending(workDir);
    return send(res, 200, { ok: true, pending: [] });
  }
  fail(res, 404, "Not Found");
}

async function routeStatic(_req, res, url) {
  const abs = resolveStaticPath(url.pathname);
  const stat = await fs.stat(abs);
  if (!stat.isFile()) return fail(res, 404, "Not Found");
  const ext = path.extname(abs).toLowerCase();
  const type = textTypes.get(ext) || "application/octet-stream";
  const body = await fs.readFile(abs);
  res.writeHead(200, { "content-type": type, "content-length": body.length, "cache-control": "no-store" });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    if (url.pathname.startsWith("/api/")) return await routeApi(req, res, url);
    return await routeStatic(req, res, url);
  } catch (error) {
    fail(res, 400, error?.message || String(error));
  }
});

server.listen(port, host, () => {
  console.log(`WF Node Web Editor listening on http://${host}:${port}`);
  console.log(`data root: ${dataRoot}`);
  console.log(`target store: ${targetStore}`);
  console.log(`cdn root: ${cdnRoot}`);
  console.log(`source archive: ${sourceArchiveDir}`);
  console.log(`allowed dirs: ${allowedDirs.join(", ")}`);
});
