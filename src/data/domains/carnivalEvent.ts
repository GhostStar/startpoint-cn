import { getDb } from "../db";
import { PlayerCarnivalEventRecord, RawPlayerCarnivalEventRecord } from "../types";
import { deserializeNumberList, serializeNumberList } from "../utils";

function buildRecord(raw: RawPlayerCarnivalEventRecord): PlayerCarnivalEventRecord {
    return {
        eventId: raw.event_id,
        folderId: raw.folder_id,
        bestScore: raw.best_score,
        previousScore: raw.previous_score,
        previousCharacterIds: raw.previous_character_ids !== null ? deserializeNumberList(raw.previous_character_ids) : null,
        previousUnisonCharacterIds: raw.previous_unison_character_ids !== null ? deserializeNumberList(raw.previous_unison_character_ids) : null,
    }
}

export function getPlayerCarnivalEventRecordsSync(
    playerId: number,
    eventId: number
): PlayerCarnivalEventRecord[] {
    const rows = getDb().prepare(`
    SELECT player_id, event_id, folder_id, best_score, previous_score, previous_character_ids, previous_unison_character_ids
    FROM players_carnival_event_records
    WHERE player_id = ? AND event_id = ?
    `).all(playerId, eventId) as RawPlayerCarnivalEventRecord[]

    return rows.map(buildRecord)
}

export function getPlayerCarnivalEventRecordSync(
    playerId: number,
    eventId: number,
    folderId: number
): PlayerCarnivalEventRecord | null {
    const raw = getDb().prepare(`
    SELECT player_id, event_id, folder_id, best_score, previous_score, previous_character_ids, previous_unison_character_ids
    FROM players_carnival_event_records
    WHERE player_id = ? AND event_id = ? AND folder_id = ?
    `).get(playerId, eventId, folderId) as RawPlayerCarnivalEventRecord | undefined

    return raw ? buildRecord(raw) : null
}

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

export function upsertPlayerCarnivalEventRecordSync(
    playerId: number,
    eventId: number,
    folderId: number,
    score: number,
    characterIds: (number | null)[],
    unisonCharacterIds: (number | null)[]
): PlayerCarnivalEventRecord {
    const existing = getPlayerCarnivalEventRecordSync(playerId, eventId, folderId)
    const bestScore = existing ? Math.max(existing.bestScore ?? 0, score) : score

    getDb().prepare(`
    INSERT INTO players_carnival_event_records (player_id, event_id, folder_id, best_score, previous_score, previous_character_ids, previous_unison_character_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(player_id, event_id, folder_id) DO UPDATE SET
        best_score = excluded.best_score,
        previous_score = excluded.previous_score,
        previous_character_ids = excluded.previous_character_ids,
        previous_unison_character_ids = excluded.previous_unison_character_ids
    `).run(
        playerId,
        eventId,
        folderId,
        bestScore,
        score,
        serializeNumberList(characterIds),
        serializeNumberList(unisonCharacterIds)
    )

    return {
        eventId,
        folderId,
        bestScore,
        previousScore: score,
        previousCharacterIds: characterIds,
        previousUnisonCharacterIds: unisonCharacterIds,
    }
}

export function sumPlayerCarnivalEventBestScoreSync(
    playerId: number,
    eventId: number
): number {
    const row = getDb().prepare(`
    SELECT COALESCE(SUM(best_score), 0) AS total
    FROM players_carnival_event_records
    WHERE player_id = ? AND event_id = ? AND best_score IS NOT NULL
    `).get(playerId, eventId) as { total: number } | undefined

    return row?.total ?? 0
}

export function resetPlayerCarnivalEventRecordsSync(
    playerId: number,
    eventId: number,
    folderIds: number[]
): void {
    if (folderIds.length === 0) {
        return
    }

    const placeholders = folderIds.map(() => "?").join(", ")
    const db = getDb()
    const statement = db.prepare(`
    UPDATE players_carnival_event_records
    SET best_score = NULL,
        previous_score = NULL,
        previous_character_ids = NULL,
        previous_unison_character_ids = NULL
    WHERE player_id = ? AND event_id = ? AND folder_id IN (${placeholders})
    `)
    const resetRecords = db.transaction(() => {
        statement.run(playerId, eventId, ...folderIds)
    })

    resetRecords()
}

export function getReceivedCarnivalEventTotalScoreRewardIdsSync(
    playerId: number,
    eventId: number
): number[] {
    const rows = getDb().prepare(`
    SELECT reward_id
    FROM players_carnival_event_total_score_rewards
    WHERE player_id = ? AND event_id = ?
    ORDER BY reward_id ASC
    `).all(playerId, eventId) as { reward_id: number }[]

    return rows.map((row) => row.reward_id)
}

export function insertReceivedCarnivalEventTotalScoreRewardSync(
    playerId: number,
    eventId: number,
    rewardId: number
): void {
    getDb().prepare(`
    INSERT OR IGNORE INTO players_carnival_event_total_score_rewards (player_id, event_id, reward_id)
    VALUES (?, ?, ?)
    `).run(playerId, eventId, rewardId)
}
