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

const JST_OFFSET_MS = 9 * 60 * 60 * 1000
const MASTER_TIME_RE = /^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/

function hasPresentMasterTime(value?: string | null): boolean {
    if (value == null) return false
    const trimmed = value.trim()
    return trimmed !== "" && trimmed !== "(None)"
}

export function parseJstMasterTime(value?: string | null): number | null {
    if (value == null) return null

    const trimmed = value.trim()
    if (trimmed === "" || trimmed === "(None)") return null

    const match = MASTER_TIME_RE.exec(trimmed)
    if (!match) return null

    const [, yearRaw, monthRaw, dayRaw, hourRaw, minuteRaw, secondRaw] = match
    const year = Number(yearRaw)
    const month = Number(monthRaw)
    const day = Number(dayRaw)
    const hour = Number(hourRaw)
    const minute = Number(minuteRaw)
    const second = Number(secondRaw)

    const utcMs = Date.UTC(year, month - 1, day, hour, minute, second) - JST_OFFSET_MS
    const parsed = new Date(utcMs + JST_OFFSET_MS)

    if (
        parsed.getUTCFullYear() !== year ||
        parsed.getUTCMonth() !== month - 1 ||
        parsed.getUTCDate() !== day ||
        parsed.getUTCHours() !== hour ||
        parsed.getUTCMinutes() !== minute ||
        parsed.getUTCSeconds() !== second
    ) {
        return null
    }

    return utcMs
}

export function getCarnivalEventPeriod(
    eventId: number,
    lookup: CarnivalEventPeriodLookup,
): CarnivalEventPeriod | null {
    return lookup[String(eventId)] ?? null
}

export function getCarnivalQuestPeriod(
    questId: number,
    lookup: CarnivalQuestPeriodLookup,
): CarnivalQuestPeriod | null {
    return lookup[String(questId)] ?? null
}

export function isCarnivalEventIndexInPeriod(
    event: CarnivalEventPeriod | null | undefined,
    nowMs: number = Date.now(),
): boolean {
    if (event == null) return false

    const startMs = parseJstMasterTime(event.start_time)
    if (startMs == null || nowMs < startMs) return false

    let endMs = parseJstMasterTime(event.exchangeable_end_time)
    if (hasPresentMasterTime(event.exchangeable_end_time) && endMs == null) return false
    if (endMs == null) {
        endMs = parseJstMasterTime(event.playable_end_time)
        if (hasPresentMasterTime(event.playable_end_time) && endMs == null) return false
    }
    if (endMs != null && nowMs >= endMs) return false

    return true
}

export function isCarnivalQuestStartInPeriod(
    quest: CarnivalQuestPeriod | null | undefined,
    event: CarnivalEventPeriod | null | undefined,
    nowMs: number = Date.now(),
): boolean {
    if (quest == null || event == null) return false
    if (quest.event_id !== event.event_id) return false

    const eventStartMs = parseJstMasterTime(event.start_time)
    const questStartMs = parseJstMasterTime(quest.start_time)
    const questEndMs = parseJstMasterTime(quest.end_time)
    if (eventStartMs == null) return false
    if (questStartMs == null) return false
    if (hasPresentMasterTime(quest.end_time) && questEndMs == null) return false
    if (nowMs < eventStartMs) return false
    if (nowMs < questStartMs) return false
    if (questEndMs != null && nowMs >= questEndMs) return false

    const playableEndMs = parseJstMasterTime(event.playable_end_time)
    if (hasPresentMasterTime(event.playable_end_time) && playableEndMs == null) return false
    if (playableEndMs != null && nowMs >= playableEndMs) return false

    return true
}
