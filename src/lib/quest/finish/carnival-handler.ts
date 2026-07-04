import { QuestCategory } from "../../types"
import { PlayerRewardResult, Reward, RewardType } from "../../types/rewards"
import type { PlayerCarnivalEventRecord } from "../../../data/types"

export interface CarnivalEventData {
    is_record_valid: boolean
    leader_character_id: number
    new_degree_ids: number[]
    previous_total_best_score: number
    reward_ids: number[]
    score: { difficulty_bonus: number, time_bonus: number }
}

export interface CarnivalQuestScoreInfo {
    difficulty_score: number
    time_limit_ms: number
    folder_id: number
    event_id: number
}

export type CarnivalQuestRecord = PlayerCarnivalEventRecord

export interface CarnivalTotalScoreRewardItem {
    kind: number
    id: number | null
    number: number
}

export interface CarnivalTotalScoreReward {
    id: number
    event_id: number
    score: number
    rewards: CarnivalTotalScoreRewardItem[]
}

export interface CarnivalFinishResult {
    clientData: CarnivalEventData | null
    rewardResult: PlayerRewardResult | null
}

interface CarnivalFinishParams {
    questCategory: number
    questAccomplished: boolean
    questId: number
    clearTime: number
    party: {
        characters: ({ id: number | null } | null)[]
        unison_characters: ({ id: number | null } | null)[]
        leader?: { id: number | null } | null
    }
    playerId: number
    carnivalLookup: Record<string, CarnivalQuestScoreInfo>
    getRecordsFn?: (playerId: number, eventId: number) => CarnivalQuestRecord[]
    resetRecordsFn?: (playerId: number, eventId: number, folderIds: number[]) => void
    upsertFn: (
        playerId: number,
        eventId: number,
        folderId: number,
        score: number,
        chars: (number | null)[],
        unisons: (number | null)[]
    ) => CarnivalQuestRecord | void
    totalScoreRewards?: CarnivalTotalScoreReward[]
    getReceivedRewardIdsFn?: (playerId: number, eventId: number) => number[]
    insertReceivedRewardFn?: (playerId: number, eventId: number, rewardId: number) => void
    giveRewardsFn?: (playerId: number, rewards: Reward[]) => PlayerRewardResult | null
}

function containsAnyCharacter(record: CarnivalQuestRecord, characterIds: Set<number>): boolean {
    const previousIds = [
        ...(record.previousCharacterIds ?? []),
        ...(record.previousUnisonCharacterIds ?? []),
    ]
    return previousIds.some((id) => id !== null && characterIds.has(id))
}

export function convertCarnivalRewardsToPlayerRewards(rewards: CarnivalTotalScoreRewardItem[]): Reward[] {
    const converted: Reward[] = []

    for (const reward of rewards) {
        const count = reward.number

        switch (reward.kind) {
            case 0: {
                if (reward.id !== null) converted.push({ type: RewardType.ITEM, id: reward.id, count } as Reward)
                break
            }
            case 1: {
                if (reward.id !== null) converted.push({ type: RewardType.EQUIPMENT, id: reward.id, count } as Reward)
                break
            }
            case 3:
                converted.push({ type: RewardType.MANA, count } as Reward)
                break
            case 4:
                converted.push({ type: RewardType.EXP, count } as Reward)
                break
            case 6: {
                if (reward.id !== null) converted.push({ type: RewardType.CHARACTER, id: reward.id } as Reward)
                break
            }
            case 7:
                break
        }
    }

    return converted
}

export function handleCarnivalEventFinish(params: CarnivalFinishParams): CarnivalFinishResult {
    const { questCategory, questAccomplished, questId, clearTime, party, playerId, carnivalLookup, upsertFn } = params

    if (questCategory !== QuestCategory.CARNIVAL_EVENT || !questAccomplished) {
        return { clientData: null, rewardResult: null }
    }

    const carnivalInfo = carnivalLookup[String(questId)]
    if (!carnivalInfo) return { clientData: null, rewardResult: null }

    const eventId = carnivalInfo.event_id
    const folderId = carnivalInfo.folder_id
    const records = params.getRecordsFn?.(playerId, eventId) ?? []
    const previousTotalBestScore = records.reduce((total, record) => total + (record.bestScore ?? 0), 0)

    const characterIds = party.characters.map((value) => value?.id ?? null)
    const unisonCharacterIds = party.unison_characters.map((value) => value?.id ?? null)
    const currentCharacterIdSet = new Set(
        [...characterIds, ...unisonCharacterIds].filter((id): id is number => id !== null)
    )

    const resetFolderIds = new Set<number>()
    for (const record of records) {
        if (record.folderId === folderId) continue
        if (!containsAnyCharacter(record, currentCharacterIdSet)) continue

        resetFolderIds.add(record.folderId)
    }
    if (resetFolderIds.size > 0) params.resetRecordsFn?.(playerId, eventId, [...resetFolderIds])

    const difficultyBonus = Math.round(carnivalInfo.difficulty_score)
    const timeBonus = Math.max(0, carnivalInfo.time_limit_ms - Math.round(clearTime))
    const score = difficultyBonus + timeBonus
    const upsertedRecord = upsertFn(playerId, eventId, folderId, score, characterIds, unisonCharacterIds)
    const currentBestScore = upsertedRecord?.bestScore ?? Math.max(
        records.find((record) => record.folderId === folderId)?.bestScore ?? 0,
        score
    )

    let newTotalBestScore = 0
    let sawCurrentFolder = false
    for (const record of records) {
        if (resetFolderIds.has(record.folderId)) continue
        if (record.folderId === folderId) {
            sawCurrentFolder = true
            newTotalBestScore += currentBestScore ?? 0
            continue
        }
        newTotalBestScore += record.bestScore ?? 0
    }
    if (!sawCurrentFolder) newTotalBestScore += currentBestScore ?? 0

    const receivedRewardIds = new Set(params.getReceivedRewardIdsFn?.(playerId, eventId) ?? [])
    const reachedRewards = (params.totalScoreRewards ?? [])
        .filter((reward) => reward.event_id === eventId)
        .filter((reward) => previousTotalBestScore < reward.score && reward.score <= newTotalBestScore)
        .filter((reward) => !receivedRewardIds.has(reward.id))

    const rewardIds: number[] = []
    const newDegreeIds: number[] = []
    const playerRewards: Reward[] = []

    for (const reachedReward of reachedRewards) {
        rewardIds.push(reachedReward.id)
        params.insertReceivedRewardFn?.(playerId, eventId, reachedReward.id)

        for (const item of reachedReward.rewards) {
            if (item.kind === 7) {
                if (item.id !== null) newDegreeIds.push(item.id)
            }
        }
        playerRewards.push(...convertCarnivalRewardsToPlayerRewards(reachedReward.rewards))
    }

    const rewardResult = playerRewards.length > 0
        ? params.giveRewardsFn?.(playerId, playerRewards) ?? null
        : null

    return {
        clientData: {
            is_record_valid: true,
            leader_character_id: party.leader?.id ?? 0,
            new_degree_ids: newDegreeIds,
            previous_total_best_score: previousTotalBestScore,
            reward_ids: rewardIds,
            score: { difficulty_bonus: difficultyBonus, time_bonus: timeBonus },
        },
        rewardResult,
    }
}
