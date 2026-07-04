const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const EVENT_TABLE = "92/917c6aeceee7cf73b275883653bcb89a43f3df";
const QUEST_TABLE = "8e/d3874807da6b5881be725cf6198d7a50ead0e0";
const TOTAL_SCORE_REWARD_TABLE = "18/a0d46e2924421136823dafc32f316795cfb024";

function resolveUploadFile(sourceUpload, tablePath) {
  return path.join(sourceUpload, ...tablePath.split("/"));
}

function parseCsvLine(line) {
  const cells = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\"") {
      if (inQuotes && line[i + 1] === "\"") {
        cell += "\"";
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      cells.push(cell);
      cell = "";
    } else {
      cell += ch;
    }
  }

  cells.push(cell);
  return cells;
}

function nullable(value) {
  return value === undefined || value === "" || value === "(None)" ? null : value;
}

function parseOptionalInt(value) {
  const normalized = nullable(value);
  if (normalized === null) return null;

  const parsed = Number.parseInt(normalized, 10);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function parseRequiredInt(value, fieldName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`invalid integer for ${fieldName}: ${value}`);
  }
  return parsed;
}

function parseTimeLimitMs(value) {
  const parsed = parseRequiredInt(value, "battle_time_limit");
  return parsed >= 1000 ? parsed : parsed * 1000;
}

function parseOrderedMapIndex(buffer) {
  if (buffer.length < 8) {
    throw new Error("orderedmap is too small");
  }

  const indexLength = buffer.readUInt32LE(0);
  if (indexLength <= 0 || 4 + indexLength > buffer.length) {
    throw new Error(`invalid orderedmap index length: ${indexLength}`);
  }

  const index = zlib.inflateSync(buffer.subarray(4, 4 + indexLength));
  const rowCount = index.readUInt32LE(0);
  const pairs = [];
  for (let i = 0; i < rowCount; i += 1) {
    const offset = 4 + i * 8;
    pairs.push({
      keyEnd: index.readUInt32LE(offset),
      rowEnd: index.readUInt32LE(offset + 4),
    });
  }

  const keyBlob = index.subarray(4 + rowCount * 8);
  const keys = [];
  let keyStart = 0;
  for (const pair of pairs) {
    keys.push(keyBlob.subarray(keyStart, pair.keyEnd).toString("utf8"));
    keyStart = pair.keyEnd;
  }

  return { indexLength, keys, pairs };
}

function readOrderedMapRawRows(buffer) {
  const { indexLength, keys, pairs } = parseOrderedMapIndex(buffer);
  const rows = buffer.subarray(4 + indexLength);
  const out = new Map();
  let rowStart = 0;

  for (let i = 0; i < keys.length; i += 1) {
    const rowEnd = pairs[i].rowEnd;
    out.set(keys[i], rows.subarray(rowStart, rowEnd));
    rowStart = rowEnd;
  }

  return out;
}

function readOrderedMapTextRows(buffer) {
  const rawRows = readOrderedMapRawRows(buffer);
  const out = new Map();

  for (const [key, row] of rawRows.entries()) {
    out.set(key, row.length === 0 ? "" : zlib.inflateSync(row).toString("utf8"));
  }

  return out;
}

function readUploadTable(sourceUpload, tablePath) {
  return fs.readFileSync(resolveUploadFile(sourceUpload, tablePath));
}

function readCarnivalEventPeriods(sourceUpload) {
  const rows = readOrderedMapTextRows(readUploadTable(sourceUpload, EVENT_TABLE));
  const out = {};

  for (const [key, row] of rows.entries()) {
    const cols = parseCsvLine(row);
    const eventId = parseRequiredInt(key, "event_id");
    out[key] = {
      event_id: eventId,
      start_time: cols[20],
      playable_end_time: nullable(cols[21]),
      exchangeable_end_time: nullable(cols[22]),
    };
  }

  return out;
}

function readCarnivalQuestPeriods(sourceUpload) {
  const outerRows = readOrderedMapRawRows(readUploadTable(sourceUpload, QUEST_TABLE));
  const out = {};

  for (const [eventIdText, innerOrderedMap] of outerRows.entries()) {
    const eventId = parseRequiredInt(eventIdText, "event_id");
    const innerRows = readOrderedMapTextRows(innerOrderedMap);
    for (const row of innerRows.values()) {
      const cols = parseCsvLine(row);
      const questId = parseRequiredInt(cols[0], "quest_id");
      out[String(questId)] = {
        quest_id: questId,
        event_id: eventId,
        folder_id: parseRequiredInt(cols[1], "folder_id"),
        start_time: cols[7],
        end_time: nullable(cols[8]),
        difficulty_score: parseRequiredInt(cols[95], "difficulty_score"),
        time_limit_ms: parseTimeLimitMs(cols[100]),
      };
    }
  }

  return out;
}

function readCarnivalTotalScoreRewards(sourceUpload) {
  const rows = readOrderedMapTextRows(readUploadTable(sourceUpload, TOTAL_SCORE_REWARD_TABLE));
  const out = {};

  for (const [key, row] of rows.entries()) {
    const cols = parseCsvLine(row);
    const rewards = [];

    for (let slot = 0; slot < 6; slot += 1) {
      const offset = 4 + slot * 3;
      const kind = parseOptionalInt(cols[offset]);
      if (kind === null) continue;

      rewards.push({
        kind,
        id: parseOptionalInt(cols[offset + 1]),
        number: parseRequiredInt(cols[offset + 2], `reward_${slot + 1}_number`),
      });
    }

    out[key] = {
      id: parseRequiredInt(key, "reward_id"),
      event_id: parseRequiredInt(cols[0], "event_id"),
      score: parseRequiredInt(cols[2], "score"),
      rewards,
    };
  }

  return out;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

module.exports = {
  readCarnivalEventPeriods,
  readCarnivalQuestPeriods,
  readCarnivalTotalScoreRewards,
  writeJson,
};
