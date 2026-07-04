# Carnival Event Remaining Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete carnival event entry, start-period checks, official total score rewards, and load initialization records.

**Architecture:** Generate checked-in carnival JSON assets from the confirmed local master files, then consume those assets through a small pure helper module. Route handlers remain thin adapters: they validate session/body, call the helper, and return official result codes before consuming stamina or items.

**Tech Stack:** TypeScript, Node.js CommonJS test scripts with `ts-node/register`, checked-in JSON assets, existing Fastify routes, existing SQLite domain layer.

---

## File Structure

- Create `tools/carnival_event_assets.cjs`: reusable converter functions for the confirmed carnival master tables.
- Create `tools/rebuild_carnival_event_assets.cjs`: CLI wrapper that writes generated JSON assets.
- Create `tools/carnival_event_remaining_flow.test.cjs`: focused tests for conversion, period helpers, serialization shape, and route wiring.
- Create `src/lib/carnival-event.ts`: pure runtime helpers and result-code constants.
- Create `assets/carnival_event_periods.json`: generated event period asset.
- Create `assets/carnival_event_quest_periods.json`: generated quest period asset.
- Modify `assets/carnival_event_total_score_reward.json`: replace the empty object with generated official reward data.
- Modify `src/data/types.ts`: add carnival load initialization client types and merged-data fields.
- Modify `src/data/domains/carnivalEvent.ts`: add a query for all player carnival records.
- Modify `src/data/utils/serialize-player.ts`: add a pure serializer for `carnival_event_record_list` and optional inclusion in `serializePlayerData`.
- Modify `src/data/utils/player-data.ts`: fetch carnival records when requested.
- Modify `src/routes/cn/load.ts`: request carnival event data during CN initialization.
- Modify `src/routes/api/carnivalEvent.ts`: return result code `5303` for out-of-period index calls.
- Modify `src/routes/api/singleBattleQuest.ts`: return result code `4050` for out-of-period carnival quest starts and persist `eventId` on active quests.

## Task 1: Converter And Official Assets

**Files:**
- Create: `tools/carnival_event_assets.cjs`
- Create: `tools/rebuild_carnival_event_assets.cjs`
- Create: `tools/carnival_event_remaining_flow.test.cjs`
- Modify: `assets/carnival_event_total_score_reward.json`
- Create: `assets/carnival_event_periods.json`
- Create: `assets/carnival_event_quest_periods.json`

- [ ] **Step 1: Write the failing converter test**

Create `tools/carnival_event_remaining_flow.test.cjs` with this initial content:

```javascript
require("ts-node/register");

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "..");
const sourceUpload = process.env.WF_ASSET_UPLOAD || "D:\\WF\\wf-assets\\upload";

function assertSourceExists(relativePath) {
  const filePath = path.join(sourceUpload, ...relativePath.split("/"));
  assert(fs.existsSync(filePath), `missing source master file: ${filePath}`);
  return filePath;
}

const assetTools = require("./carnival_event_assets.cjs");

{
  assert.strictEqual(typeof assetTools.readCarnivalEventPeriods, "function");
  assert.strictEqual(typeof assetTools.readCarnivalQuestPeriods, "function");
  assert.strictEqual(typeof assetTools.readCarnivalTotalScoreRewards, "function");
}

{
  assertSourceExists("92/917c6aeceee7cf73b275883653bcb89a43f3df");
  assertSourceExists("8e/d3874807da6b5881be725cf6198d7a50ead0e0");
  assertSourceExists("18/a0d46e2924421136823dafc32f316795cfb024");
}

{
  const periods = assetTools.readCarnivalEventPeriods(sourceUpload);
  assert(periods["1"]);
  assert.strictEqual(periods["1"].event_id, 1);
  assert.strictEqual(periods["1"].start_time, "2023-01-22 14:00:00");
  assert.strictEqual(periods["1"].playable_end_time, "2023-01-29 20:59:59");
  assert.strictEqual(periods["1"].exchangeable_end_time, "2023-02-06 04:59:59");
}

{
  const quests = assetTools.readCarnivalQuestPeriods(sourceUpload);
  assert(quests["1001"]);
  assert.strictEqual(quests["1001"].quest_id, 1001);
  assert.strictEqual(quests["1001"].event_id, 1);
  assert.strictEqual(quests["1001"].folder_id, 1);
  assert.strictEqual(quests["1001"].start_time, "2023-01-22 14:00:00");
  assert.strictEqual(quests["1001"].end_time, "2023-01-29 20:59:59");
  assert.strictEqual(quests["1001"].difficulty_score, 20);
  assert.strictEqual(quests["1001"].time_limit_ms, 108000);
}

{
  const rewards = assetTools.readCarnivalTotalScoreRewards(sourceUpload);
  assert(rewards["1"]);
  assert.strictEqual(rewards["1"].id, 1);
  assert.strictEqual(rewards["1"].event_id, 1);
  assert.strictEqual(rewards["1"].score, 9745000);
  assert.deepStrictEqual(rewards["1"].rewards.slice(0, 4), [
    { kind: 1, id: 5030034, number: 1 },
    { kind: 0, id: 999001, number: 1 },
    { kind: 0, id: 90030, number: 300 },
    { kind: 6, id: 61030, number: 1 },
  ]);

  const stoneReward = rewards["7"];
  assert(stoneReward.rewards.some((reward) => reward.kind === 2 && reward.id === null && reward.number === 200));
}

console.log("carnival_event_remaining_flow tests passed");
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node tools/carnival_event_remaining_flow.test.cjs
```

Expected: FAIL with `Cannot find module './carnival_event_assets.cjs'`.

- [ ] **Step 3: Implement the converter module**

Create `tools/carnival_event_assets.cjs`:

```javascript
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const EVENT_TABLE = "92/917c6aeceee7cf73b275883653bcb89a43f3df";
const QUEST_TABLE = "8e/d3874807da6b5881be725cf6198d7a50ead0e0";
const TOTAL_SCORE_REWARD_TABLE = "18/a0d46e2924421136823dafc32f316795cfb024";

function resolveUploadFile(sourceUpload, logicalLocation) {
  return path.join(sourceUpload, ...logicalLocation.split("/"));
}

function parseCsvLine(line) {
  const out = [];
  let value = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        value += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(value);
      value = "";
    } else {
      value += ch;
    }
  }
  out.push(value);
  return out;
}

function noneToNull(value) {
  return value === undefined || value === "" || value === "(None)" ? null : value;
}

function parseOptionalInt(value) {
  const normalized = noneToNull(value);
  if (normalized === null) return null;
  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRequiredInt(value, fieldName) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) throw new Error(`invalid integer for ${fieldName}: ${value}`);
  return parsed;
}

function parseRequiredNumber(value, fieldName) {
  const parsed = Number.parseFloat(value);
  if (!Number.isFinite(parsed)) throw new Error(`invalid number for ${fieldName}: ${value}`);
  return parsed;
}

function parseIndex(buffer) {
  if (buffer.length < 8) throw new Error("file is too small for orderedmap");
  const indexLength = buffer.readUInt32LE(0);
  if (indexLength <= 0 || 4 + indexLength > buffer.length) throw new Error("invalid orderedmap index length");
  const index = zlib.inflateSync(buffer.subarray(4, 4 + indexLength));
  const count = index.readUInt32LE(0);
  const pairs = [];
  for (let i = 0; i < count; i++) {
    pairs.push({
      keyEnd: index.readUInt32LE(4 + i * 8),
      rowEnd: index.readUInt32LE(4 + i * 8 + 4),
    });
  }
  const keyBlob = index.subarray(4 + count * 8);
  const keys = [];
  let keyStart = 0;
  for (const pair of pairs) {
    keys.push(keyBlob.subarray(keyStart, pair.keyEnd).toString("utf8"));
    keyStart = pair.keyEnd;
  }
  return { indexLength, keys, pairs };
}

function readOrderedMapRawRows(buffer) {
  const { indexLength, keys, pairs } = parseIndex(buffer);
  const blob = buffer.subarray(4 + indexLength);
  const out = new Map();
  let rowStart = 0;
  for (let i = 0; i < keys.length; i++) {
    const rowEnd = pairs[i].rowEnd;
    out.set(keys[i], blob.subarray(rowStart, rowEnd));
    rowStart = rowEnd;
  }
  return out;
}

function readOrderedMapTextRows(buffer) {
  const rows = readOrderedMapRawRows(buffer);
  const out = new Map();
  for (const [key, row] of rows.entries()) {
    out.set(key, row.length === 0 ? "" : zlib.inflateSync(row).toString("utf8"));
  }
  return out;
}

function readFileBuffer(sourceUpload, logicalLocation) {
  return fs.readFileSync(resolveUploadFile(sourceUpload, logicalLocation));
}

function readCarnivalEventPeriods(sourceUpload) {
  const rows = readOrderedMapTextRows(readFileBuffer(sourceUpload, EVENT_TABLE));
  const out = {};
  for (const [eventId, row] of rows.entries()) {
    const cols = parseCsvLine(row);
    out[eventId] = {
      event_id: parseRequiredInt(eventId, "event_id"),
      start_time: cols[20],
      playable_end_time: noneToNull(cols[21]),
      exchangeable_end_time: noneToNull(cols[22]),
    };
  }
  return out;
}

function readCarnivalQuestPeriods(sourceUpload) {
  const outerRows = readOrderedMapRawRows(readFileBuffer(sourceUpload, QUEST_TABLE));
  const out = {};
  for (const [eventIdText, innerBuffer] of outerRows.entries()) {
    const eventId = parseRequiredInt(eventIdText, "event_id");
    const innerRows = readOrderedMapTextRows(innerBuffer);
    for (const row of innerRows.values()) {
      const cols = parseCsvLine(row);
      const questId = parseRequiredInt(cols[0], "quest_id");
      out[String(questId)] = {
        quest_id: questId,
        event_id: eventId,
        folder_id: parseRequiredInt(cols[1], "folder_id"),
        start_time: cols[7],
        end_time: noneToNull(cols[8]),
        difficulty_score: parseRequiredNumber(cols[104], "difficulty_score"),
        time_limit_ms: parseRequiredInt(cols[100], "battle_time_limit") * 1000,
      };
    }
  }
  return out;
}

function readCarnivalTotalScoreRewards(sourceUpload) {
  const rows = readOrderedMapTextRows(readFileBuffer(sourceUpload, TOTAL_SCORE_REWARD_TABLE));
  const out = {};
  for (const [rewardIdText, row] of rows.entries()) {
    const cols = parseCsvLine(row);
    const rewardId = parseRequiredInt(rewardIdText, "reward_id");
    const rewards = [];
    for (let slot = 0; slot < 6; slot++) {
      const kindIndex = 4 + slot * 3;
      const kind = parseOptionalInt(cols[kindIndex]);
      if (kind === null) continue;
      rewards.push({
        kind,
        id: parseOptionalInt(cols[kindIndex + 1]),
        number: parseRequiredInt(cols[kindIndex + 2], `reward${slot + 1}_number`),
      });
    }
    out[rewardIdText] = {
      id: rewardId,
      event_id: parseRequiredInt(cols[0], "event_id"),
      score: parseRequiredNumber(cols[2], "score"),
      rewards,
    };
  }
  return out;
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

module.exports = {
  readCarnivalEventPeriods,
  readCarnivalQuestPeriods,
  readCarnivalTotalScoreRewards,
  writeJson,
};
```

- [ ] **Step 4: Implement the rebuild CLI**

Create `tools/rebuild_carnival_event_assets.cjs`:

```javascript
#!/usr/bin/env node

const path = require("path");
const {
  readCarnivalEventPeriods,
  readCarnivalQuestPeriods,
  readCarnivalTotalScoreRewards,
  writeJson,
} = require("./carnival_event_assets.cjs");

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

const repoRoot = path.resolve(__dirname, "..");
const sourceUpload = readArg("--source", process.env.WF_ASSET_UPLOAD || "D:\\WF\\wf-assets\\upload");
const outputDir = path.resolve(repoRoot, readArg("--out", "assets"));

const eventPeriods = readCarnivalEventPeriods(sourceUpload);
const questPeriods = readCarnivalQuestPeriods(sourceUpload);
const totalScoreRewards = readCarnivalTotalScoreRewards(sourceUpload);

writeJson(path.join(outputDir, "carnival_event_periods.json"), eventPeriods);
writeJson(path.join(outputDir, "carnival_event_quest_periods.json"), questPeriods);
writeJson(path.join(outputDir, "carnival_event_total_score_reward.json"), totalScoreRewards);

console.log(`carnival event periods: ${Object.keys(eventPeriods).length}`);
console.log(`carnival quest periods: ${Object.keys(questPeriods).length}`);
console.log(`carnival total score rewards: ${Object.keys(totalScoreRewards).length}`);
```

- [ ] **Step 5: Run converter tests and verify GREEN**

Run:

```powershell
node tools/carnival_event_remaining_flow.test.cjs
```

Expected: PASS and prints `carnival_event_remaining_flow tests passed`.

- [ ] **Step 6: Generate official assets**

Run:

```powershell
node tools/rebuild_carnival_event_assets.cjs --source D:\WF\wf-assets\upload --out assets
```

Expected output includes:

```text
carnival event periods: 11
carnival quest periods: 99
carnival total score rewards: 832
```

- [ ] **Step 7: Inspect generated assets**

Run:

```powershell
node -e "const r=require('./assets/carnival_event_total_score_reward.json'); const q=require('./assets/carnival_event_quest_periods.json'); console.log(r['1']); console.log(q['1001']);"
```

Expected: reward `1` includes `event_id: 1`, `score: 9745000`, and quest `1001` includes `event_id: 1`, `folder_id: 1`, `time_limit_ms: 108000`.

- [ ] **Step 8: Commit converter and assets**

Run:

```powershell
git add tools/carnival_event_assets.cjs tools/rebuild_carnival_event_assets.cjs tools/carnival_event_remaining_flow.test.cjs assets/carnival_event_periods.json assets/carnival_event_quest_periods.json assets/carnival_event_total_score_reward.json
git commit -m "feat: generate carnival event assets"
```

## Task 2: Period And Quest Helper

**Files:**
- Modify: `tools/carnival_event_remaining_flow.test.cjs`
- Create: `src/lib/carnival-event.ts`

- [ ] **Step 1: Extend the test with failing helper assertions**

Append this block before the final `console.log` in `tools/carnival_event_remaining_flow.test.cjs`:

```javascript
const carnivalRuntime = require("../src/lib/carnival-event.ts");

{
  assert.strictEqual(carnivalRuntime.CARNIVAL_EVENT_OUT_OF_PERIOD_CODE, 5303);
  assert.strictEqual(carnivalRuntime.CARNIVAL_QUEST_OUT_OF_PERIOD_CODE, 4050);
  assert.strictEqual(carnivalRuntime.parseJstMasterTime("2025-01-14 20:59:59"), Date.UTC(2025, 0, 14, 11, 59, 59));
}

{
  const event = {
    event_id: 250601,
    start_time: "2024-12-31 14:00:00",
    playable_end_time: "2025-01-14 20:59:59",
    exchangeable_end_time: "2025-01-22 04:59:59",
  };
  assert.strictEqual(carnivalRuntime.isCarnivalEventIndexInPeriod(event, Date.UTC(2024, 11, 31, 4, 59, 59)), false);
  assert.strictEqual(carnivalRuntime.isCarnivalEventIndexInPeriod(event, Date.UTC(2024, 11, 31, 5, 0, 0)), true);
  assert.strictEqual(carnivalRuntime.isCarnivalEventIndexInPeriod(event, Date.UTC(2025, 0, 20, 0, 0, 0)), true);
  assert.strictEqual(carnivalRuntime.isCarnivalEventIndexInPeriod(event, Date.UTC(2025, 0, 21, 19, 59, 59)), false);
}

{
  const event = {
    event_id: 250601,
    start_time: "2024-12-31 14:00:00",
    playable_end_time: "2025-01-14 20:59:59",
    exchangeable_end_time: "2025-01-22 04:59:59",
  };
  const quest = {
    quest_id: 250601001,
    event_id: 250601,
    folder_id: 1,
    start_time: "2024-12-31 14:00:00",
    end_time: "2025-01-14 20:59:59",
    difficulty_score: 20,
    time_limit_ms: 108000,
  };
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod(quest, event, Date.UTC(2024, 11, 31, 4, 59, 59)), false);
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod(quest, event, Date.UTC(2025, 0, 1, 0, 0, 0)), true);
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod(quest, event, Date.UTC(2025, 0, 20, 0, 0, 0)), false);
}

{
  const lookup = {
    "250601001": {
      quest_id: 250601001,
      event_id: 250601,
      folder_id: 1,
      start_time: "2024-12-31 14:00:00",
      end_time: "2025-01-14 20:59:59",
      difficulty_score: 20,
      time_limit_ms: 108000,
    },
  };
  assert.strictEqual(carnivalRuntime.getCarnivalQuestPeriod(250601001, lookup).event_id, 250601);
  assert.strictEqual(carnivalRuntime.getCarnivalQuestPeriod(999999, lookup), null);
}
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node tools/carnival_event_remaining_flow.test.cjs
```

Expected: FAIL with `Cannot find module '../src/lib/carnival-event.ts'`.

- [ ] **Step 3: Implement the runtime helper**

Create `src/lib/carnival-event.ts`:

```typescript
export const CARNIVAL_EVENT_OUT_OF_PERIOD_CODE = 5303
export const CARNIVAL_QUEST_OUT_OF_PERIOD_CODE = 4050

export interface CarnivalEventPeriod {
    event_id: number
    start_time: string
    playable_end_time?: string | null
    exchangeable_end_time?: string | null
}

export interface CarnivalQuestPeriod {
    quest_id: number
    event_id: number
    folder_id: number
    start_time: string
    end_time?: string | null
    difficulty_score: number
    time_limit_ms: number
}

export type CarnivalEventPeriodLookup = Record<string, CarnivalEventPeriod>
export type CarnivalQuestPeriodLookup = Record<string, CarnivalQuestPeriod>

export function parseJstMasterTime(value: string | null | undefined): number | null {
    if (value === null || value === undefined || value === "" || value === "(None)") return null

    const match = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/.exec(value)
    if (!match) return null

    const [, year, month, day, hour, minute, second] = match
    return Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour) - 9,
        Number(minute),
        Number(second)
    )
}

function isWithinPeriod(start: string | null | undefined, end: string | null | undefined, nowMs: number): boolean {
    const startMs = parseJstMasterTime(start)
    if (startMs !== null && nowMs < startMs) return false

    const endMs = parseJstMasterTime(end)
    if (endMs !== null && nowMs >= endMs) return false

    return true
}

export function getCarnivalEventPeriod(
    eventId: string | number,
    lookup: CarnivalEventPeriodLookup
): CarnivalEventPeriod | null {
    return lookup[String(eventId)] ?? null
}

export function getCarnivalQuestPeriod(
    questId: string | number,
    lookup: CarnivalQuestPeriodLookup
): CarnivalQuestPeriod | null {
    return lookup[String(questId)] ?? null
}

export function isCarnivalEventIndexInPeriod(
    event: CarnivalEventPeriod | null,
    nowMs: number = Date.now()
): boolean {
    if (event === null) return false

    const end = event.exchangeable_end_time ?? event.playable_end_time ?? null
    return isWithinPeriod(event.start_time, end, nowMs)
}

export function isCarnivalQuestStartInPeriod(
    quest: CarnivalQuestPeriod | null,
    event: CarnivalEventPeriod | null,
    nowMs: number = Date.now()
): boolean {
    if (quest === null || event === null) return false
    if (quest.event_id !== event.event_id) return false
    if (!isWithinPeriod(quest.start_time, quest.end_time ?? null, nowMs)) return false

    const playableEndMs = parseJstMasterTime(event.playable_end_time)
    if (playableEndMs !== null && nowMs >= playableEndMs) return false

    return true
}
```

- [ ] **Step 4: Run helper tests and verify GREEN**

Run:

```powershell
node tools/carnival_event_remaining_flow.test.cjs
```

Expected: PASS.

- [ ] **Step 5: Commit helper**

Run:

```powershell
git add tools/carnival_event_remaining_flow.test.cjs src/lib/carnival-event.ts
git commit -m "feat: add carnival period helpers"
```

## Task 3: Load Initialization Serialization

**Files:**
- Modify: `tools/carnival_event_remaining_flow.test.cjs`
- Modify: `src/data/types.ts`
- Modify: `src/data/domains/carnivalEvent.ts`
- Modify: `src/data/utils/serialize-player.ts`
- Modify: `src/data/utils/player-data.ts`
- Modify: `src/routes/cn/load.ts`

- [ ] **Step 1: Add failing serialization tests**

Append this block before the final `console.log` in `tools/carnival_event_remaining_flow.test.cjs`:

```javascript
const serializePlayer = require("../src/data/utils/serialize-player.ts");
const carnivalDomain = require("../src/data/domains/carnivalEvent.ts");

{
  assert.strictEqual(typeof serializePlayer.serializeCarnivalEventRecordList, "function");
  assert.strictEqual(typeof carnivalDomain.getAllPlayerCarnivalEventRecordsSync, "function");

  const serialized = serializePlayer.serializeCarnivalEventRecordList([
    { eventId: 250601, folderId: 1, bestScore: 120, previousScore: 100, previousCharacterIds: [1], previousUnisonCharacterIds: [2] },
    { eventId: 250601, folderId: 2, bestScore: null, previousScore: null, previousCharacterIds: null, previousUnisonCharacterIds: null },
    { eventId: 250602, folderId: 1, bestScore: 220, previousScore: 200, previousCharacterIds: [3], previousUnisonCharacterIds: [4] },
  ]);

  assert.deepStrictEqual(serialized, {
    "250601": {
      records: [
        { folder_id: 1, best_score: 120 },
        { folder_id: 2 },
      ],
    },
    "250602": {
      records: [
        { folder_id: 1, best_score: 220 },
      ],
    },
  });

  assert.strictEqual("previous_score" in serialized["250601"].records[0], false);
  assert.strictEqual("previous_character_ids" in serialized["250601"].records[0], false);
  assert.strictEqual("previous_unison_character_ids" in serialized["250601"].records[0], false);
}

{
  const loadSource = fs.readFileSync(path.join(repoRoot, "src/routes/cn/load.ts"), "utf8");
  assert(loadSource.includes("serializeCarnivalEventData: true"));
}
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node tools/carnival_event_remaining_flow.test.cjs
```

Expected: FAIL because `serializeCarnivalEventRecordList` or `getAllPlayerCarnivalEventRecordsSync` is missing.

- [ ] **Step 3: Add client and merged data types**

Modify `src/data/types.ts` near the rush event client types:

```typescript
export interface UserCarnivalEventRecord {
    folder_id: number
    best_score?: number
}

export interface UserCarnivalEventRecordListEntry {
    records: UserCarnivalEventRecord[]
}

export type UserCarnivalEventRecordList = Record<string, UserCarnivalEventRecordListEntry>
```

Add to `ClientPlayerData`:

```typescript
carnival_event_record_list?: UserCarnivalEventRecordList
```

Add to `MergedPlayerData`:

```typescript
carnivalEventRecordList?: PlayerCarnivalEventRecord[]
```

- [ ] **Step 4: Add all-record domain query**

Modify `src/data/domains/carnivalEvent.ts` imports:

```typescript
import { PlayerCarnivalEventRecord, RawPlayerCarnivalEventRecord } from "../types";
```

Add this function after `getPlayerCarnivalEventRecordsSync`:

```typescript
export function getAllPlayerCarnivalEventRecordsSync(
    playerId: number
): PlayerCarnivalEventRecord[] {
    const rows = getDb().prepare(`
    SELECT player_id, event_id, folder_id, best_score, previous_score, previous_character_ids, previous_unison_character_ids
    FROM players_carnival_event_records
    WHERE player_id = ?
    ORDER BY event_id ASC, folder_id ASC
    `).all(playerId) as RawPlayerCarnivalEventRecord[]

    return rows.map(buildRecord)
}
```

- [ ] **Step 5: Add serializer helper and optional output**

Modify the import from `../types` in `src/data/utils/serialize-player.ts` to include:

```typescript
PlayerCarnivalEventRecord, UserCarnivalEventRecordList
```

Add to `SerializePlayerDataOptions`:

```typescript
serializeCarnivalEventData?: boolean
```

Add this exported helper before `serializePlayerData`:

```typescript
export function serializeCarnivalEventRecordList(
    records: PlayerCarnivalEventRecord[]
): UserCarnivalEventRecordList {
    const out: UserCarnivalEventRecordList = {}

    for (const record of records) {
        const eventId = String(record.eventId)
        if (out[eventId] === undefined) {
            out[eventId] = { records: [] }
        }

        const serialized: { folder_id: number, best_score?: number } = {
            folder_id: record.folderId,
        }
        if (record.bestScore !== null && record.bestScore !== undefined) {
            serialized.best_score = record.bestScore
        }

        out[eventId].records.push(serialized)
    }

    return out
}
```

Add near the existing rush event optional serialization block:

```typescript
if (options?.serializeCarnivalEventData ?? false) {
    clientData.carnival_event_record_list = serializeCarnivalEventRecordList(
        toSerialize.carnivalEventRecordList ?? []
    )
}
```

- [ ] **Step 6: Fetch carnival records for player data**

Modify imports in `src/data/utils/player-data.ts`:

```typescript
import { getAllPlayerCarnivalEventRecordsSync } from "../domains/carnivalEvent"
```

Inside `getClientSerializedData`, set:

```typescript
const doSerializeCarnivalEventData = options.serializeCarnivalEventData ?? false
```

Add this field to the `serializePlayerData` input object:

```typescript
carnivalEventRecordList: doSerializeCarnivalEventData ? getAllPlayerCarnivalEventRecordsSync(playerId) : undefined,
```

- [ ] **Step 7: Enable carnival serialization in CN load**

Modify `src/routes/cn/load.ts` line that calls `getClientSerializedData`:

```typescript
const clientData = getClientSerializedData(playerId, { viewerId: accountId, serializeCarnivalEventData: true }) as any;
```

- [ ] **Step 8: Run tests and verify GREEN**

Run:

```powershell
node tools/carnival_event_remaining_flow.test.cjs
npm run typecheck
```

Expected: both pass.

- [ ] **Step 9: Commit load serialization**

Run:

```powershell
git add tools/carnival_event_remaining_flow.test.cjs src/data/types.ts src/data/domains/carnivalEvent.ts src/data/utils/serialize-player.ts src/data/utils/player-data.ts src/routes/cn/load.ts
git commit -m "feat: serialize carnival records during load"
```

## Task 4: Route Period Wiring

**Files:**
- Modify: `tools/carnival_event_remaining_flow.test.cjs`
- Modify: `src/routes/api/carnivalEvent.ts`
- Modify: `src/routes/api/singleBattleQuest.ts`

- [ ] **Step 1: Add failing route wiring tests**

Append this block before the final `console.log` in `tools/carnival_event_remaining_flow.test.cjs`:

```javascript
{
  const carnivalRouteSource = fs.readFileSync(path.join(repoRoot, "src/routes/api/carnivalEvent.ts"), "utf8");
  assert(carnivalRouteSource.includes("CARNIVAL_EVENT_OUT_OF_PERIOD_CODE"));
  assert(carnivalRouteSource.includes("isCarnivalEventIndexInPeriod"));
  assert(carnivalRouteSource.includes("carnivalEventPeriods"));
  assert(carnivalRouteSource.includes("result_code: CARNIVAL_EVENT_OUT_OF_PERIOD_CODE"));
}

{
  const singleBattleSource = fs.readFileSync(path.join(repoRoot, "src/routes/api/singleBattleQuest.ts"), "utf8");
  assert(singleBattleSource.includes("CARNIVAL_QUEST_OUT_OF_PERIOD_CODE"));
  assert(singleBattleSource.includes("isCarnivalQuestStartInPeriod"));
  assert(singleBattleSource.includes("carnivalEventQuestPeriods"));
  assert(singleBattleSource.includes("eventId: carnivalQuestPeriod?.event_id"));
  assert(singleBattleSource.includes("result_code: CARNIVAL_QUEST_OUT_OF_PERIOD_CODE"));
}
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```powershell
node tools/carnival_event_remaining_flow.test.cjs
```

Expected: FAIL because route source does not yet contain the helper wiring.

- [ ] **Step 3: Wire `/carnival_event/index`**

Modify `src/routes/api/carnivalEvent.ts` imports:

```typescript
import carnivalEventPeriods from "../../../assets/carnival_event_periods.json";
import {
    CARNIVAL_EVENT_OUT_OF_PERIOD_CODE,
    getCarnivalEventPeriod,
    isCarnivalEventIndexInPeriod,
} from "../../lib/carnival-event";
```

After resolving `playerId` and before building party groups, add:

```typescript
const eventId = body.event_id
const eventPeriod = getCarnivalEventPeriod(eventId, carnivalEventPeriods)
if (!isCarnivalEventIndexInPeriod(eventPeriod)) {
    reply.header("content-type", "application/x-msgpack");
    return reply.status(200).send({
        "data_headers": generateDataHeaders({
            viewer_id: viewerId,
            result_code: CARNIVAL_EVENT_OUT_OF_PERIOD_CODE,
        }),
        "data": {}
    });
}
```

Then remove the duplicate later declaration:

```typescript
const eventId = body.event_id
```

- [ ] **Step 4: Wire `/single_battle_quest/start`**

Modify `src/routes/api/singleBattleQuest.ts` imports:

```typescript
import carnivalEventPeriods from "../../../assets/carnival_event_periods.json";
import carnivalEventQuestPeriods from "../../../assets/carnival_event_quest_periods.json";
import {
    CARNIVAL_QUEST_OUT_OF_PERIOD_CODE,
    getCarnivalEventPeriod,
    getCarnivalQuestPeriod,
    isCarnivalQuestStartInPeriod,
} from "../../lib/carnival-event";
```

After `questData` is validated and before entry cost deduction, add:

```typescript
const carnivalQuestPeriod = category === QuestCategory.CARNIVAL_EVENT
    ? getCarnivalQuestPeriod(questId, carnivalEventQuestPeriods)
    : null
if (category === QuestCategory.CARNIVAL_EVENT) {
    const carnivalEventPeriod = carnivalQuestPeriod !== null
        ? getCarnivalEventPeriod(carnivalQuestPeriod.event_id, carnivalEventPeriods)
        : null
    if (!isCarnivalQuestStartInPeriod(carnivalQuestPeriod, carnivalEventPeriod)) {
        reply.header("content-type", "application/x-msgpack")
        return reply.status(200).send({
            "data_headers": generateDataHeaders({
                viewer_id: viewerId,
                result_code: CARNIVAL_QUEST_OUT_OF_PERIOD_CODE,
            }),
            "data": {}
        })
    }
}
```

In the `activeQuests[playerId] = { ... }` object, add:

```typescript
eventId: carnivalQuestPeriod?.event_id,
```

- [ ] **Step 5: Run tests and verify GREEN**

Run:

```powershell
node tools/carnival_event_remaining_flow.test.cjs
npm run typecheck
```

Expected: both pass.

- [ ] **Step 6: Commit route wiring**

Run:

```powershell
git add tools/carnival_event_remaining_flow.test.cjs src/routes/api/carnivalEvent.ts src/routes/api/singleBattleQuest.ts
git commit -m "feat: enforce carnival event periods"
```

## Task 5: Full Regression Verification

**Files:**
- No production file changes unless verification reveals a defect.

- [ ] **Step 1: Run focused carnival tests**

Run:

```powershell
node tools/carnival_event_remaining_flow.test.cjs
node tools/carnival_event_core_flow.test.cjs
```

Expected:

```text
carnival_event_remaining_flow tests passed
carnival_event_core_flow tests passed
```

- [ ] **Step 2: Run TypeScript verification**

Run:

```powershell
npm run typecheck
```

Expected: command exits `0`.

- [ ] **Step 3: Run build verification**

Run:

```powershell
npm run build
```

Expected: command exits `0`. A Browserslist data age warning is acceptable if it matches the existing warning seen before this slice.

- [ ] **Step 4: Inspect git status**

Run:

```powershell
git status --short
```

Expected: no uncommitted changes, or only intentionally generated files already covered by a commit.

- [ ] **Step 5: Commit any verification-only fixes**

If a verification command exposes a real defect, stop at the failed area, fix the touched files from that task, rerun the failed command, and commit that focused fix with a message that names the failing area.

If no fix was required, do not create an empty commit.

## Final Handoff Notes

- The implementation must preserve existing core finish behavior in `src/lib/quest/finish/carnival-handler.ts`.
- Do not replace `assets/carnival_event_quest_scores.json` during this slice; finish scoring already consumes it.
- Generated assets are checked in so runtime does not require `D:\WF\wf-assets`.
- The converter may use `WF_ASSET_UPLOAD` for alternate local source roots, but the default source root remains `D:\WF\wf-assets\upload`.
