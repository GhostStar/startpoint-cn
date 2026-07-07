import crypto from "node:crypto";
import { promises as fs } from "node:fs";
import fssync from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { findInArchiveDir } from "./zip-source.js";

export const SALT = "K6R9T9Hz22OpeIGEWB0ui6c6PYFQnJGy";

export const TABLE_ALIASES = {
  ability: "master/ability/ability.orderedmap",
  character: "master/character/character.orderedmap",
  character_status: "master/character/character_status.orderedmap",
  leader_ability: "master/ability/leader_ability.orderedmap",
  ability_soul: "master/ability/ability_soul.orderedmap",
  character_awake_status: "master/character/character_awake_status.orderedmap",
  action_skill: "master/skill/action_skill.orderedmap",
  weapon_ability: "master/equipment_enhancement/equipment_enhancement_ability.orderedmap",
  equipment: "master/item/equipment.orderedmap",
  equipment_enhancement: "master/equipment_enhancement/equipment_enhancement.orderedmap",
  character_text: "master/character/character_text.orderedmap",
  character_speech: "master/character/character_speech.orderedmap",
  skill_preview_character: "master/skill_preview/skill_preview_character.orderedmap",
  mana_board2_open_condition: "master/mana_board/mana_board2_open_condition.orderedmap",
  upskill: "master/mana_board/upskill.orderedmap",
  character_stance_detail: "master/stance_detail/character_stance_detail.orderedmap",
  character_image: "master/generated/character_image.orderedmap",
  full_shot_image_attribute: "master/character/full_shot_image_attribute.orderedmap",
  mana_board: "master/generated/mana_board.orderedmap",
  mana_node: "master/mana_board/mana_node.orderedmap",
  character_gacha_sound: "master/character/character_gacha_sound.orderedmap",
  general_boss: "master/battle/boss/general_boss.orderedmap",
  general_boss_state: "master/battle/boss/general_boss_state.orderedmap",
  general_boss_variable: "master/battle/boss/general_boss_variable.orderedmap",
  boss_level: "master/battle/boss/boss_level.orderedmap",
  standard_boss: "master/battle/boss/standard_boss.orderedmap",
  general_zako: "master/battle/zako/general_zako.orderedmap",
  zako_level: "master/battle/zako/zako_level.orderedmap",
  zone: "master/battle/zone.orderedmap",
  field_data: "master/battle/field_data.orderedmap",
  field: "master/battle/field.orderedmap",
  boss_battle_quest: "master/quest/boss_battle_quest.orderedmap",
  boss_battle_stage_node: "master/quest/boss_battle_stage_node.orderedmap",
  rush_event: "master/quest/event/rush_event.orderedmap",
  rush_event_quest: "master/quest/event/rush_event_quest.orderedmap",
  rush_event_quest_folder: "master/quest/event/rush_event_quest_folder.orderedmap",
  rush_event_correction: "master/quest/event/rush_event_battle_quest_correction.orderedmap",
  event_list: "master/quest/event/event_list.orderedmap",
  switched_action_skill: "master/skill/switched_action_skill.orderedmap",
};

export const RAW_ROW_TABLES = new Set([
  TABLE_ALIASES.character_status,
  TABLE_ALIASES.action_skill,
  TABLE_ALIASES.character_image,
  TABLE_ALIASES.full_shot_image_attribute,
  TABLE_ALIASES.mana_board,
  TABLE_ALIASES.mana_node,
  TABLE_ALIASES.character_gacha_sound,
]);

export function sha1Path(logicalPath) {
  return crypto.createHash("sha1").update(`${logicalPath}${SALT}`, "utf8").digest("hex");
}

export function logicalFromAlias(aliasOrLogical) {
  return TABLE_ALIASES[aliasOrLogical] || aliasOrLogical;
}

export function tablePath(store, logicalPath) {
  const digest = sha1Path(logicalPath);
  return path.join(store, digest.slice(0, 2), digest.slice(2));
}

export function relativeUploadPath(logicalPath) {
  const digest = sha1Path(logicalPath);
  return `${digest.slice(0, 2)}/${digest.slice(2)}`;
}

export function timestamp() {
  const d = new Date();
  const pad = n => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export function parseIndex(raw) {
  if (raw.length < 8) throw new Error("file is too small for orderedmap");
  const indexLen = raw.readUInt32LE(0);
  if (indexLen <= 0 || 4 + indexLen > raw.length) throw new Error("invalid orderedmap index length");
  const index = zlib.inflateSync(raw.subarray(4, 4 + indexLen));
  const count = index.readUInt32LE(0);
  const pairs = [];
  for (let i = 0; i < count; i += 1) {
    const off = 4 + i * 8;
    pairs.push({ keyEnd: index.readUInt32LE(off), rowEnd: index.readUInt32LE(off + 4) });
  }
  const keyBlob = index.subarray(4 + count * 8);
  const keys = [];
  let prev = 0;
  for (const pair of pairs) {
    keys.push(keyBlob.subarray(prev, pair.keyEnd).toString("utf8"));
    prev = pair.keyEnd;
  }
  return { keys, pairs, indexLen };
}

export function decodeOrderedMap(raw, { rawRows = false, logicalPath = "" } = {}) {
  const { keys, pairs, indexLen } = parseIndex(raw);
  const blob = raw.subarray(4 + indexLen);
  const rows = [];
  let prev = 0;
  for (const pair of pairs) {
    const chunk = blob.subarray(prev, pair.rowEnd);
    prev = pair.rowEnd;
    rows.push(rawRows ? Buffer.from(chunk) : (chunk.length ? zlib.inflateSync(chunk) : Buffer.alloc(0)));
  }
  return { logicalPath, keys, rows };
}

function firstRowLooksLikeOrderedMap(raw) {
  const { pairs, indexLen } = parseIndex(raw);
  const blob = raw.subarray(4 + indexLen);
  let prev = 0;
  for (const pair of pairs) {
    const chunk = blob.subarray(prev, pair.rowEnd);
    prev = pair.rowEnd;
    if (!chunk.length) continue;
    try {
      parseIndex(chunk);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function decodeTable(raw, { rawRows = false, logicalPath = "" } = {}) {
  if (rawRows) return { ...decodeOrderedMap(raw, { rawRows: true, logicalPath }), rawRows: true };
  try {
    return { ...decodeOrderedMap(raw, { rawRows: false, logicalPath }), rawRows: false };
  } catch (error) {
    if (firstRowLooksLikeOrderedMap(raw)) {
      return { ...decodeOrderedMap(raw, { rawRows: true, logicalPath }), rawRows: true };
    }
    throw error;
  }
}

export function encodeOrderedMap(ordered, { rawRows = false } = {}) {
  const keyChunks = [];
  const rowChunks = [];
  const pairs = [];
  let keyLength = 0;
  let rowLength = 0;
  for (let i = 0; i < ordered.keys.length; i += 1) {
    const keyBuf = Buffer.from(String(ordered.keys[i]), "utf8");
    keyChunks.push(keyBuf);
    keyLength += keyBuf.length;
    const row = Buffer.isBuffer(ordered.rows[i]) ? ordered.rows[i] : Buffer.from(String(ordered.rows[i] || ""), "utf8");
    const rowBuf = rawRows ? row : (row.length ? zlib.deflateSync(row) : Buffer.alloc(0));
    rowChunks.push(rowBuf);
    rowLength += rowBuf.length;
    pairs.push({ keyEnd: keyLength, rowEnd: rowLength });
  }
  const keyBlob = Buffer.concat(keyChunks);
  const index = Buffer.allocUnsafe(4 + pairs.length * 8 + keyBlob.length);
  index.writeUInt32LE(pairs.length, 0);
  for (let i = 0; i < pairs.length; i += 1) {
    index.writeUInt32LE(pairs[i].keyEnd, 4 + i * 8);
    index.writeUInt32LE(pairs[i].rowEnd, 4 + i * 8 + 4);
  }
  keyBlob.copy(index, 4 + pairs.length * 8);
  const packedIndex = zlib.deflateSync(index);
  const head = Buffer.allocUnsafe(4);
  head.writeUInt32LE(packedIndex.length, 0);
  return Buffer.concat([head, packedIndex, ...rowChunks]);
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (ch !== "\r") {
      cell += ch;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter(r => !(r.length === 1 && r[0] === ""));
}

export function writeCsv(rows) {
  return rows.map(row => row.map(value => {
    const s = String(value ?? "");
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }).join(",")).join("\n");
}

export async function loadTable({ store, sourceStore, sourceArchiveDir, logicalPath }) {
  const rawRows = RAW_ROW_TABLES.has(logicalPath);
  const target = tablePath(store, logicalPath);
  if (fssync.existsSync(target)) {
    try {
      const raw = await fs.readFile(target);
      return { ...decodeTable(raw, { rawRows, logicalPath }), sourcePath: target };
    } catch (error) {
      if (!sourceStore) throw error;
    }
  }
  if (sourceStore) {
    const source = tablePath(sourceStore, logicalPath);
    if (fssync.existsSync(source)) {
      const raw = await fs.readFile(source);
      return { ...decodeTable(raw, { rawRows, logicalPath }), sourcePath: source };
    }
  }
  if (sourceArchiveDir) {
    const entryName = `production/upload/${relativeUploadPath(logicalPath)}`;
    const archived = await findInArchiveDir(sourceArchiveDir, entryName);
    if (archived) {
      return { ...decodeTable(archived.data, { rawRows, logicalPath }), sourcePath: archived.sourcePath };
    }
  }
  throw new Error(`cannot find table ${logicalPath}`);
}

export function tableSummary(table, limit = 200) {
  return {
    logicalPath: table.logicalPath,
    rawRows: table.rawRows,
    sourcePath: table.sourcePath,
    count: table.keys.length,
    keys: table.keys.slice(0, limit).map((key, index) => ({
      key,
      index,
      size: table.rows[index]?.length || 0,
    })),
  };
}

export function getRow(table, key) {
  const index = table.keys.indexOf(String(key));
  if (index === -1) throw new Error(`missing key: ${key}`);
  const row = table.rows[index] || Buffer.alloc(0);
  if (table.rawRows) {
    const out = { key, rawRows: true, size: row.length, base64: row.toString("base64") };
    try {
      const nested = decodeOrderedMap(row, { rawRows: false, logicalPath: `${table.logicalPath}#${key}` });
      out.nestedRows = nested.keys.map((innerKey, innerIndex) => {
        const text = (nested.rows[innerIndex] || Buffer.alloc(0)).toString("utf8");
        return { key: innerKey, text, rows: parseCsv(text) };
      });
    } catch {
      // Some raw-row tables may not be nested orderedmaps. Keep base64 fallback.
    }
    return out;
  }
  const text = row.toString("utf8");
  return { key, rawRows: false, text, rows: parseCsv(text) };
}

export function setTextRow(table, key, text) {
  const k = String(key);
  const index = table.keys.indexOf(k);
  const row = Buffer.from(String(text || ""), "utf8");
  if (index === -1) {
    table.keys.push(k);
    table.rows.push(row);
  } else {
    table.rows[index] = row;
  }
}

export function setCsvCell(table, key, line, column, value) {
  if (table.rawRows) throw new Error("raw-row table does not support CSV cell editing yet");
  const current = getRow(table, key);
  const rows = current.rows;
  const rowIndex = Math.max(0, Number(line) - 1);
  const colIndex = Math.max(0, Number(column));
  while (rows.length <= rowIndex) rows.push([]);
  while (rows[rowIndex].length <= colIndex) rows[rowIndex].push("");
  rows[rowIndex][colIndex] = String(value ?? "");
  setTextRow(table, key, writeCsv(rows));
  return rows;
}

export function setNestedCsvCell(table, outerKey, nestedKey, line, column, value) {
  if (!table.rawRows) throw new Error("nested cell editing requires a raw-row table");
  const outerIndex = table.keys.indexOf(String(outerKey));
  if (outerIndex === -1) throw new Error(`missing key: ${outerKey}`);
  const outerRow = table.rows[outerIndex] || Buffer.alloc(0);
  const nested = decodeOrderedMap(outerRow, { rawRows: false, logicalPath: `${table.logicalPath}#${outerKey}` });
  const innerIndex = nested.keys.indexOf(String(nestedKey));
  if (innerIndex === -1) throw new Error(`missing nested key: ${nestedKey}`);
  const text = (nested.rows[innerIndex] || Buffer.alloc(0)).toString("utf8");
  const rows = parseCsv(text);
  const rowIndex = Math.max(0, Number(line) - 1);
  const colIndex = Math.max(0, Number(column));
  while (rows.length <= rowIndex) rows.push([]);
  while (rows[rowIndex].length <= colIndex) rows[rowIndex].push("");
  rows[rowIndex][colIndex] = String(value ?? "");
  nested.rows[innerIndex] = Buffer.from(writeCsv(rows), "utf8");
  table.rows[outerIndex] = encodeOrderedMap(nested, { rawRows: false });
  return rows;
}

export async function writeTable({ table, store, backupTag = "nodeweb" }) {
  const target = tablePath(store, table.logicalPath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  let backup = null;
  if (fssync.existsSync(target)) {
    backup = `${target}.bak-wfmod-${backupTag}-${timestamp()}`;
    await fs.copyFile(target, backup);
  }
  const raw = encodeOrderedMap(table, { rawRows: table.rawRows });
  await fs.writeFile(target, raw);
  return { target, backup, size: raw.length };
}

export async function readJsonIfExists(file, fallback) {
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return fallback;
  }
}

export async function addPending(workDir, store, targetPath) {
  const rel = path.relative(store, targetPath).split(path.sep).join("/");
  if (rel.startsWith("..")) throw new Error(`target not under store: ${targetPath}`);
  const file = path.join(workDir, "sync_pending.json");
  const items = await readJsonIfExists(file, []);
  if (!items.includes(rel)) items.push(rel);
  await fs.mkdir(workDir, { recursive: true });
  await fs.writeFile(file, JSON.stringify(items, null, 2), "utf8");
  return items;
}

export async function readPending(workDir) {
  return readJsonIfExists(path.join(workDir, "sync_pending.json"), []);
}

export async function clearPending(workDir) {
  await fs.mkdir(workDir, { recursive: true });
  await fs.writeFile(path.join(workDir, "sync_pending.json"), "[]", "utf8");
}

export async function recordChange(workDir, entry) {
  await fs.mkdir(workDir, { recursive: true });
  const line = JSON.stringify({
    ts: new Date().toISOString().replace("T", " ").slice(0, 19),
    version: null,
    ...entry,
  });
  await fs.appendFile(path.join(workDir, "changelog.jsonl"), `${line}\n`, "utf8");
}

export function loadProfiles(modRoot) {
  const file = path.join(modRoot, "profiles.json");
  if (!fssync.existsSync(file)) return null;
  return JSON.parse(fssync.readFileSync(file, "utf8"));
}

export function resolveProfile(modRoot, profileId = process.env.WF_PROFILE) {
  const data = loadProfiles(modRoot);
  if (!data?.profiles) return null;
  const id = profileId || data.active;
  const entry = data.profiles[id];
  if (!entry) return null;
  const root = path.resolve(modRoot, "..");
  const resolveMaybe = value => !value ? null : (path.isAbsolute(value) ? value : path.resolve(root, value));
  return {
    id,
    label: entry.label || id,
    store: resolveMaybe(entry.store),
    cdndata: resolveMaybe(entry.cdndata),
    resVersion: entry.res_version || "",
    fallback: resolveMaybe(entry.fallback),
  };
}
