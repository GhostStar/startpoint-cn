import { promises as fs } from "node:fs";
import fssync from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

const archiveCache = new Map();

function readUInt32LE(buf, offset) {
  return buf.readUInt32LE(offset) >>> 0;
}

async function readTail(file, maxBytes = 1024 * 128) {
  const handle = await fs.open(file, "r");
  try {
    const stat = await handle.stat();
    const size = Math.min(stat.size, maxBytes);
    const buf = Buffer.allocUnsafe(size);
    await handle.read(buf, 0, size, stat.size - size);
    return { buf, fileSize: stat.size, tailStart: stat.size - size };
  } finally {
    await handle.close();
  }
}

async function parseZipCentral(file) {
  const cached = archiveCache.get(file);
  if (cached) return cached;

  const { buf, tailStart } = await readTail(file);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i -= 1) {
    if (readUInt32LE(buf, i) === EOCD) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error(`cannot find zip central directory: ${file}`);

  const entryCount = buf.readUInt16LE(eocd + 10);
  const centralSize = readUInt32LE(buf, eocd + 12);
  const centralOffset = readUInt32LE(buf, eocd + 16);
  const central = Buffer.allocUnsafe(centralSize);
  const handle = await fs.open(file, "r");
  try {
    await handle.read(central, 0, centralSize, centralOffset);
  } finally {
    await handle.close();
  }

  const entries = new Map();
  let pos = 0;
  for (let i = 0; i < entryCount && pos + 46 <= central.length; i += 1) {
    if (readUInt32LE(central, pos) !== CENTRAL) break;
    const method = central.readUInt16LE(pos + 10);
    const compressedSize = readUInt32LE(central, pos + 20);
    const uncompressedSize = readUInt32LE(central, pos + 24);
    const nameLen = central.readUInt16LE(pos + 28);
    const extraLen = central.readUInt16LE(pos + 30);
    const commentLen = central.readUInt16LE(pos + 32);
    const localOffset = readUInt32LE(central, pos + 42);
    const name = central.subarray(pos + 46, pos + 46 + nameLen).toString("utf8");
    entries.set(name, { method, compressedSize, uncompressedSize, localOffset });
    pos += 46 + nameLen + extraLen + commentLen;
  }

  const parsed = { file, entries, tailStart };
  archiveCache.set(file, parsed);
  return parsed;
}

async function readZipEntry(zipFile, entryName) {
  const zip = await parseZipCentral(zipFile);
  const entry = zip.entries.get(entryName);
  if (!entry) return null;

  const local = Buffer.allocUnsafe(30);
  const handle = await fs.open(zipFile, "r");
  try {
    await handle.read(local, 0, 30, entry.localOffset);
    if (readUInt32LE(local, 0) !== LOCAL) throw new Error(`invalid local zip header: ${zipFile}`);
    const nameLen = local.readUInt16LE(26);
    const extraLen = local.readUInt16LE(28);
    const data = Buffer.allocUnsafe(entry.compressedSize);
    await handle.read(data, 0, data.length, entry.localOffset + 30 + nameLen + extraLen);
    if (entry.method === 0) return data;
    if (entry.method === 8) return zlib.inflateRawSync(data, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    throw new Error(`unsupported zip method ${entry.method}: ${zipFile}!${entryName}`);
  } finally {
    await handle.close();
  }
}

export async function findInArchiveDir(archiveDir, entryName) {
  if (!archiveDir || !fssync.existsSync(archiveDir)) return null;
  const names = (await fs.readdir(archiveDir))
    .filter(name => name.endsWith(".zip"))
    .sort();
  for (const name of names) {
    const zipFile = path.join(archiveDir, name);
    const data = await readZipEntry(zipFile, entryName);
    if (data) return { data, sourcePath: `${zipFile}!${entryName}` };
  }
  return null;
}
