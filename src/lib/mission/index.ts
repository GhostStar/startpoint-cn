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
    const out: Record<string, T> = {}
    for (const [id, value] of Object.entries(missions)) {
        if (activeMissionIdSet.has(Number(id))) out[id] = value
    }
    return out
}
