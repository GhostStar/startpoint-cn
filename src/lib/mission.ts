// Legacy barrel — re-exports from lib/mission/ modules
export type { ActiveMissionReward, PatternMatch } from "./mission/index"
export {
    getMissionIdsByCategory,
    getCurrentStage,
    getCompletedStageNumbers,
    getActiveMissionRewards,
    getAwakeMissionRewards,
    getEventMissionRewards,
    getMissionsByPattern,
    getMissionPattern,
    isComputablePattern,
    getCharacterStoryQuestIds,
    getCharacterIdFromMission,
    getTargetDegree,
    getComputer,
    filterToActiveMissions,
    isActiveMissionId,
} from "./mission/index"
