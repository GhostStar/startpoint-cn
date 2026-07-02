// lib/mission barrel — unified mission system

import activeRewards from "../../../assets/mission_active_reward.json"

// Types
export type { MissionComputer, CategoryContext, ComputerRegistry, PlayerQuestProgressEntry } from "./types"

// Registry
export { getComputer } from "./registry"

// Stages
export { getMissionIdsByCategory, getCurrentStage, getCompletedStageNumbers } from "./stages"

// Rewards
export type { ActiveMissionReward } from "./rewards"
export { getActiveMissionRewards, getAwakeMissionRewards, getEventMissionRewards } from "./rewards"

// Patterns (for update_mission_progress)
export type { PatternMatch } from "./patterns"
export { getMissionsByPattern, getMissionPattern, isComputablePattern } from "./patterns"

// Character queries
export { getCharacterStoryQuestIds, getCharacterIdFromMission } from "./character-queries"

// Degree helpers
export { getTargetDegree } from "./computer-degree"

// ─── Active mission ID filter (C8601 prevention) ────────────────────────

const activeMissionIdSet: Set<number> = new Set(
    Object.keys(activeRewards as Record<string, any>).map(Number)
)

export function isActiveMissionId(id: number | string): boolean {
    return activeMissionIdSet.has(Number(id))
}

export function filterToActiveMissions<T>(missions: Record<string, T>): Record<string, T> {
    // No-op: return all missions unmodified.
    // Previously filtered to only active_reward entries, but this excluded
    // category 9 (awake) missions from the /load response, causing the
    // ability awakening page to show "未完成" even when all missions are done.
    return missions
}
