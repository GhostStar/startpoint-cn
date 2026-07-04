# Carnival Event Remaining Flow Design

## Goal

Complete the remaining server-side carnival event flow so the offline server follows the official client protocol for event entry, battle start, load initialization, and total score rewards.

The previous core-flow slice already handles finish-time scoring, best-score persistence, duplicate party reset, total score reward receipt persistence, and reward grant merging. This design covers the missing surrounding flow.

## Client Evidence

The decompiled client confirms these protocol requirements:

- `CarnivalEventIndexRealRemote` maps result code `5303` to `CarnivalEventIndexRemoteInput.OutOfPeriod`.
- `QuestStartRealRemote` maps result code `4050` to `QuestStartRemoteInput.OutOfPeriodError`.
- `InitializeRealRemote` accepts optional `data.carnival_event_record_list`.
- `carnival_event_record_list` is keyed by event id and each value must be an object with `records`.
- Each initialization record accepts only `folder_id` and optional `best_score`; previous score and previous party data are initialized client-side as empty values.
- `CarnivalEventValues` exposes `start_time`, `playable_end_time`, and `exchangeable_end_time`.
- `CarnivalEventQuestValues` exposes quest-level `start_time`, optional `end_time`, `folder_id`, `difficulty_score`, and `battle_time_limit`.
- `CarnivalEventTotalScoreRewardValues` exposes `event_id`, `name`, `score`, `reason_id`, and six reward slots.

## Official Master Data Sources

The local source data needed for the remaining flow is available in `D:\WF\wf-assets\upload`:

- `92/917c6aeceee7cf73b275883653bcb89a43f3df`: carnival event table.
- `8e/d3874807da6b5881be725cf6198d7a50ead0e0`: nested carnival quest table, keyed by event id then folder id.
- `b3/155b283c72f27094fc0d8f90100de409816c8e`: nested carnival quest folder table, keyed by event id then folder id.
- `18/a0d46e2924421136823dafc32f316795cfb024`: carnival total score reward rows.
- `5c/278985a5ca3b2972ae31d3f4acd36b5b061c95`: AMF3 schema for the total score reward value layout.

The server should not keep `assets/carnival_event_total_score_reward.json` as an empty fallback. It should generate the asset from the official total score reward rows and use the decompiled value schema to preserve reward slot semantics.

## Scope

In scope:

- Convert official carnival event, quest, folder, and total score reward rows into server assets.
- Add a pure helper module for carnival period checks and quest lookup.
- Add result-code handling for out-of-period carnival index and quest start.
- Add `carnival_event_record_list` to load serialization using persisted best score records.
- Preserve the existing finish flow behavior and reward receipt table.
- Add focused tests before production changes.

Out of scope:

- Building a generic orderedmap converter for every master table.
- Implementing carnival UI, ranking UI, exchange shop behavior, or event missions.
- Reworking unrelated quest, rush, raid, or shop response error handling.
- Replacing the existing `carnival_event_quest_scores.json` score lookup unless the generated quest asset can safely produce the same fields.

## Recommended Approach

Use a narrow official-data asset layer:

1. Add a converter script that reads only the confirmed carnival master files.
2. Generate checked-in JSON assets consumed by the server at runtime.
3. Add small pure helpers for period checks and carnival quest metadata lookup.
4. Wire those helpers into `/carnival_event/index`, `/single_battle_quest/start`, and `/load`.

This keeps runtime code simple and testable, while leaving the official rows visible and reproducible through the converter.

## Data Shape

### `assets/carnival_event_periods.json`

Keyed by event id:

```json
{
  "250601": {
    "event_id": 250601,
    "start_time": "2024-12-31 14:00:00",
    "playable_end_time": "2025-01-14 20:59:59",
    "exchangeable_end_time": "2025-01-22 04:59:59"
  }
}
```

Times remain as the server-readable string format already present in master rows. Runtime helpers parse them explicitly as JST master timestamps and compare using UTC milliseconds, matching `ParseTools.parseJstDataToUtcTime` in the decompiled client.

### `assets/carnival_event_quest_periods.json`

Keyed by quest id:

```json
{
  "250601001": {
    "quest_id": 250601001,
    "event_id": 250601,
    "folder_id": 1,
    "start_time": "2024-12-31 14:00:00",
    "end_time": "2025-01-14 20:59:59",
    "difficulty_score": 20,
    "time_limit_ms": 108000
  }
}
```

This asset can share data with the existing `carnival_event_quest_scores.json`, but the implementation should first preserve the current lookup file to avoid changing finish scoring unexpectedly.

### `assets/carnival_event_total_score_reward.json`

Keyed by total score reward id. Each row keeps the current handler's expected fields:

```json
{
  "5": {
    "id": 5,
    "event_id": 1,
    "score": 10465000,
    "reward1_kind": 0,
    "reward1_id": 13001,
    "reward1_number": 1
  }
}
```

The converter should normalize `rewardN_kind.id` into `rewardN_id`. Reward kind `2` remains Stone and maps to beads at grant time, as already fixed in the core-flow slice.

## Period Rules

### Carnival Index

`/carnival_event/index` is considered in period when:

- `now >= event.start_time`
- `now < event.exchangeable_end_time` if exchangeable end exists
- otherwise `now < event.playable_end_time` if playable end exists
- otherwise no explicit end is enforced

If the request is out of period, the route returns a normal msgpack response with `data_headers.result_code = 5303` and an empty data object. This matches the client-side code path that looks for result code `5303`.

### Single Battle Start

`/single_battle_quest/start` is considered in period for carnival quests when:

- the quest id exists in the carnival quest asset
- `now >= quest.start_time`
- `now < quest.end_time` if quest end exists
- `now < event.playable_end_time` if event playable end exists

If out of period, the route returns `data_headers.result_code = 4050`, does not deduct entry items, does not deduct stamina, and does not insert an active quest.

When in period, the active quest record should include `eventId` from the carnival quest metadata.

## Load Initialization

Add an optional `serializeCarnivalEventData` flag to `SerializePlayerDataOptions`.

When enabled:

- Fetch all carnival event records for the player.
- Group them by `eventId`.
- Serialize as `carnival_event_record_list[eventId].records`.
- Each record includes `folder_id`.
- Include `best_score` only when it is not null or undefined.
- Do not include `previous_score`, `previous_character_ids`, or `previous_unison_character_ids`.

Enable this option for CN `/load`, because that is the initialization path where the decompiled client accepts this field.

## Error Handling

The implementation should follow the closest existing server pattern:

- Use HTTP 200 with `data_headers.result_code` for official client business errors.
- Keep existing HTTP 400 validation errors for malformed request bodies and invalid sessions.
- Keep msgpack content type on route responses that already use msgpack.

No generic RemoteError abstraction is required for this slice.

## Testing

Add tests before production changes:

- Converter test: verifies one known reward row from `18/a0d...` converts `event_id`, `score`, and reward slots correctly.
- Period helper test: verifies index uses `exchangeable_end_time`, start uses `playable_end_time`, and both reject before start.
- Start helper test: verifies carnival quest lookup returns `event_id` and `folder_id` for a known quest id.
- Serialization test: verifies load record shape groups by event id and excludes previous fields.
- Regression test: existing core-flow total score reward behavior still handles Stone, Degree, and receipt filtering.

Run:

```powershell
node tools/carnival_event_remaining_flow.test.cjs
node tools/carnival_event_core_flow.test.cjs
npm run typecheck
npm run build
```

## Decisions

- Keep generated assets checked in so the offline package works without requiring `D:\WF\wf-assets` at runtime.
- Keep converter script checked in so future master updates can be reproduced.
- Prefer minimal route wiring over broad response-handler refactors.
