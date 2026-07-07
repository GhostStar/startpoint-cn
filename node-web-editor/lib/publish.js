import { promises as fs } from "node:fs";
import fssync from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { logicalFromAlias, relativeUploadPath, readPending, clearPending } from "./wf-core.js";

const versionRe = /^pinball-(\d+\.\d+\.\d+)-(\d+\.\d+\.\d+)-\d+-/;

function cmpVersion(a, b) {
  const av = a.split(".").map(Number);
  const bv = b.split(".").map(Number);
  for (let i = 0; i < Math.max(av.length, bv.length); i += 1) {
    const diff = (av[i] || 0) - (bv[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

function bumpVersion(v) {
  const parts = v.split(".").map(Number);
  parts[2] = (parts[2] || 0) + 1;
  return parts.join(".");
}

export async function currentMaxVersion(cdnDiffDir, fallback = "1.4.54") {
  let best = fallback;
  try {
    const entries = await fs.readdir(cdnDiffDir);
    for (const name of entries) {
      const match = versionRe.exec(name);
      if (match && cmpVersion(match[2], best) > 0) best = match[2];
    }
  } catch {
    // Missing diff dir means fallback version.
  }
  return best;
}

const crcTable = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  return c >>> 0;
});

function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function dosTime(date = new Date()) {
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

function u16(value) {
  const b = Buffer.allocUnsafe(2);
  b.writeUInt16LE(value & 0xffff, 0);
  return b;
}

function u32(value) {
  const b = Buffer.allocUnsafe(4);
  b.writeUInt32LE(value >>> 0, 0);
  return b;
}

export async function writeZip(outFile, files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  const dt = dosTime();

  for (const file of files) {
    const name = Buffer.from(file.name, "utf8");
    const data = await fs.readFile(file.path);
    const compressed = zlib.deflateRawSync(data, { level: 9 });
    const crc = crc32(data);
    const local = Buffer.concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(8), u16(dt.time), u16(dt.day),
      u32(crc), u32(compressed.length), u32(data.length), u16(name.length), u16(0), name, compressed,
    ]);
    locals.push(local);
    centrals.push(Buffer.concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(8), u16(dt.time), u16(dt.day),
      u32(crc), u32(compressed.length), u32(data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name,
    ]));
    offset += local.length;
  }

  const centralStart = offset;
  const central = Buffer.concat(centrals);
  const centralSize = central.length;
  const eocd = Buffer.concat([
    u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length),
    u32(centralSize), u32(centralStart), u16(0),
  ]);
  await fs.mkdir(path.dirname(outFile), { recursive: true });
  await fs.writeFile(outFile, Buffer.concat([...locals, central, eocd]));
}

export async function collectPublishFiles({ workDir, tables, store, cdnRoot }) {
  let rels = [];
  if (tables) {
    rels = String(tables).split(",").map(s => s.trim()).filter(Boolean)
      .map(t => relativeUploadPath(logicalFromAlias(t)));
  } else {
    rels = await readPending(workDir);
  }

  const groupDefs = {
    "": { root: store, outDir: path.join(cdnRoot, "archive-common-diff"), arcbase: "production/upload" },
    "medium:": { root: path.join(path.dirname(store), "medium_upload"), outDir: path.join(cdnRoot, "archive-medium-diff"), arcbase: "production/medium_upload" },
    "android:": { root: path.join(path.dirname(store), "android_upload"), outDir: path.join(cdnRoot, "archive-android-diff"), arcbase: "production/android_upload" },
  };

  const grouped = {};
  for (const [prefix, def] of Object.entries(groupDefs)) grouped[prefix] = { ...def, files: [] };
  for (const rel of rels) {
    const prefix = rel.startsWith("medium:") ? "medium:" : rel.startsWith("android:") ? "android:" : "";
    const cleanRel = rel.slice(prefix.length);
    const def = grouped[prefix];
    const src = path.join(def.root, cleanRel);
    if (!fssync.existsSync(src)) continue;
    def.files.push({ path: src, name: `${def.arcbase}/${cleanRel}`, rel });
  }
  return grouped;
}

async function readChangelog(workDir) {
  const file = path.join(workDir, "changelog.jsonl");
  try {
    const text = await fs.readFile(file, "utf8");
    return text.split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        try { return JSON.parse(line); } catch { return null; }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

async function stampChangelog(workDir, version, publishDir) {
  const file = path.join(workDir, "changelog.jsonl");
  const mdFile = path.join(workDir, "changelog.md");
  const entries = await readChangelog(workDir);
  let stamped = 0;
  for (const entry of entries) {
    if (entry.version == null) {
      entry.version = version;
      stamped += 1;
    }
  }
  await fs.mkdir(workDir, { recursive: true });
  if (entries.length > 0) {
    await fs.writeFile(file, entries.map(e => JSON.stringify(e)).join("\n") + "\n", "utf8");
  }
  const lines = [
    "# WF Mod Change Log",
    "",
    "| Time | Table | Keys | Summary | Version | Backup |",
    "|---|---|---|---|---|---|",
  ];
  for (const entry of [...entries].reverse()) {
    const keys = (entry.keys || []).join(",") || "-";
    const summary = String(entry.summary || "").replace(/\n/g, " / ").replace(/\|/g, "/");
    const backup = entry.backup ? path.basename(entry.backup) : "-";
    lines.push(`| ${entry.ts || ""} | ${entry.table || ""} | ${keys} | ${summary} | ${entry.version || "(pending)"} | ${backup} |`);
  }
  await fs.writeFile(mdFile, lines.join("\n") + "\n", "utf8");
  if (publishDir) {
    await fs.mkdir(publishDir, { recursive: true });
    await fs.copyFile(mdFile, path.join(publishDir, "changelog.md"));
  }
  return { stamped, mdFile };
}

export async function publishDiff({ workDir, tables, store, cdnRoot, listOnly = false, fromVersion }) {
  const commonDiff = path.join(cdnRoot, "archive-common-diff");
  const from = fromVersion || await currentMaxVersion(commonDiff);
  const to = bumpVersion(from);
  const grouped = await collectPublishFiles({ workDir, tables, store, cdnRoot });
  const allFiles = Object.values(grouped).flatMap(g => g.files);
  if (allFiles.length === 0) throw new Error("no publishable files");

  const summary = {
    fromVersion: from,
    toVersion: to,
    files: allFiles.map(f => ({ rel: f.rel, archivePath: f.name, source: f.path })),
    outputs: [],
    listOnly,
  };
  if (listOnly) return summary;

  const tag = new Date().toISOString().replace(/\D/g, "").slice(4, 12);
  for (const group of Object.values(grouped)) {
    if (group.files.length === 0) continue;
    const out = path.join(group.outDir, `pinball-${from}-${to}-1-mod${tag}.zip`);
    await writeZip(out, group.files);
    const stat = await fs.stat(out);
    summary.outputs.push({ path: out, size: stat.size, count: group.files.length });
  }
  summary.changelog = await stampChangelog(workDir, to, commonDiff);
  if (!tables) await clearPending(workDir);
  return summary;
}
