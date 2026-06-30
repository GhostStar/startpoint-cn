import { serializePlayerData, SerializePlayerDataOptions } from "./serialize-player"
import { getDateFromServerTime, getServerTime, getServerDate, realToVirtual } from "../../utils"
import { ClientPlayerData, DailyChallengePointListEntry, MergedPlayerData, PartyCategory, Player, PlayerBoxGacha, PlayerCharacter, PlayerCharacterBondToken, PlayerDrawnQuest, PlayerEquipment, PlayerGachaCampaign, PlayerGachaInfo, PlayerMultiSpecialExchangeCampaign, PlayerParty, PlayerPartyGroup, PlayerQuestProgress, PlayerRushEvent, PlayerRushEventPlayedParty, PlayerStartDashExchangeCampaign, RushEventBattleType, UserBoxGacha, UserCharacter, UserCharacterBondTokenStatus, UserEquipment, UserGachaCampaign, UserPartyGroup, UserPartyGroupTeam, UserQuestProgress, UserRushEvent, UserRushEventPlayedParty, UserRushEventPlayedPartyList, UserTutorial } from "../types"
import { deserializePlayerRushEventPlayedParty, deserializeRushEvent, getPlayerActiveMissionsSync, getPlayerBoxGachasSync, getPlayerCharactersManaNodesSync, getPlayerCharactersSync, getPlayerClearedRegularMissionListSync, getPlayerDailyChallengePointListSync, getPlayerDrawnQuestsSync, getPlayerEquipmentListSync, getPlayerGachaCampaignListSync, getPlayerGachaInfoListSync, getPlayerItemsSync, getPlayerMailCountSync, getPlayerMultiSpecialExchangeCampaignsSync, getPlayerOptionsSync, getPlayerPartyGroupListSync, getPlayerPeriodicRewardPointsSync, getPlayerQuestProgressSync, getPlayerRushEventListClearedFoldersSync, getPlayerRushEventListPlayedPartiesSync, getPlayerRushEventListSync, getPlayerStartDashExchangeCampaignsSync, getPlayerSync, getPlayerTriggeredTutorialsSync, serializePlayerRushEventPlayedParty, updatePlayerSync } from "../wdfpData"
import { filterToActiveMissions } from "../../lib/mission"

/**
 * Generates default player data.
 * 
 * @returns The generated default player data.
 */
export function getDefaultPlayerData(): Omit<Player, 'id'> {
    const now = getServerDate();
    // Default values aligned with CN client PlayerSaveDataTools.createDummy()
    return {
        stamina: 10,
        staminaHealTime: new Date(),
        boostPoint: 10,
        bossBoostPoint: 3,
        transitionState: 0,
        role: 1,
        name: "冒险者",
        lastLoginTime: now,
        comment: "よろしくお願いします",
        vmoney: 100,
        freeVmoney: 100,
        rankPoint: 0,
        starCrumb: 2,
        bondToken: 10,
        expPool: 0,
        expPooledTime: now,
        leaderCharacterId: 1,
        partySlot: 1,
        degreeId: 1,
        birth: 19900101,
        freeMana: 2000,
        paidMana: 2000,
        enableAuto3x: false,
        totalStaminaUsed: 0,
        totalPowerflips: 0,
        totalDashes: 0,
        totalManaObtained: 0,
        maxComboAchieved: 0,
        tutorialStep: 0,
        tutorialSkipFlag: null,
        tutorialGachaCharacterId: null,
        timeOffset: null
    }
}


/**
 * Takes a playerID and returns all of the necessary data for the game client.
 * 
 * @param playerId 
 * @param viewerId 
 * @returns 
 */
export function getClientSerializedData(
    playerId: number,
    options: SerializePlayerDataOptions
): ClientPlayerData | null {

    const playerData = getPlayerSync(playerId)
    if (playerData === null) return null

    const doSerializeRushEventData = options.serializeRushEventData ?? false

    return serializePlayerData({
        player: playerData,
        dailyChallengePointList: getPlayerDailyChallengePointListSync(playerId),
        triggeredTutorial: getPlayerTriggeredTutorialsSync(playerId),
        clearedRegularMissionList: getPlayerClearedRegularMissionListSync(playerId),
        characterList: getPlayerCharactersSync(playerId),
        characterManaNodeList: getPlayerCharactersManaNodesSync(playerId),
        partyGroupList: getPlayerPartyGroupListSync(playerId),
        itemList: getPlayerItemsSync(playerId),
        equipmentList: getPlayerEquipmentListSync(playerId),
        questProgress: getPlayerQuestProgressSync(playerId),
        gachaInfoList: getPlayerGachaInfoListSync(playerId),
        gachaCampaignList: getPlayerGachaCampaignListSync(playerId),
        drawnQuestList: getPlayerDrawnQuestsSync(playerId),
        periodicRewardPointList: getPlayerPeriodicRewardPointsSync(playerId),
        allActiveMissionList: filterToActiveMissions(getPlayerActiveMissionsSync(playerId)),
        boxGachaList: getPlayerBoxGachasSync(playerId),
        purchasedTimesList: {},
        startDashExchangeCampaignList: getPlayerStartDashExchangeCampaignsSync(playerId),
        multiSpecialExchangeCampaignList: getPlayerMultiSpecialExchangeCampaignsSync(playerId),
        userOption: getPlayerOptionsSync(playerId),
        rushEventList: doSerializeRushEventData ? getPlayerRushEventListSync(playerId) : undefined,
        rushEventClearedFolderList: doSerializeRushEventData ? getPlayerRushEventListClearedFoldersSync(playerId) : undefined,
        rushEventPlayedPartyList: doSerializeRushEventData ? getPlayerRushEventListPlayedPartiesSync(playerId) : undefined
    }, options)
}


/**
 * Assembles a player's full server-side MergedPlayerData (no client serialization).
 * Used by the admin save export/import (snapshot round-trip).
 */
export function getMergedPlayerDataSync(
    playerId: number
): MergedPlayerData | null {
    const playerData = getPlayerSync(playerId)
    if (playerData === null) return null

    return {
        player: playerData,
        dailyChallengePointList: getPlayerDailyChallengePointListSync(playerId),
        triggeredTutorial: getPlayerTriggeredTutorialsSync(playerId),
        clearedRegularMissionList: getPlayerClearedRegularMissionListSync(playerId),
        characterList: getPlayerCharactersSync(playerId),
        characterManaNodeList: getPlayerCharactersManaNodesSync(playerId),
        partyGroupList: getPlayerPartyGroupListSync(playerId),
        itemList: getPlayerItemsSync(playerId),
        equipmentList: getPlayerEquipmentListSync(playerId),
        questProgress: getPlayerQuestProgressSync(playerId),
        gachaInfoList: getPlayerGachaInfoListSync(playerId),
        gachaCampaignList: getPlayerGachaCampaignListSync(playerId),
        drawnQuestList: getPlayerDrawnQuestsSync(playerId),
        periodicRewardPointList: getPlayerPeriodicRewardPointsSync(playerId),
        allActiveMissionList: getPlayerActiveMissionsSync(playerId),
        boxGachaList: getPlayerBoxGachasSync(playerId),
        purchasedTimesList: {},
        startDashExchangeCampaignList: getPlayerStartDashExchangeCampaignsSync(playerId),
        multiSpecialExchangeCampaignList: getPlayerMultiSpecialExchangeCampaignsSync(playerId),
        userOption: getPlayerOptionsSync(playerId),
        rushEventList: getPlayerRushEventListSync(playerId),
        rushEventClearedFolderList: getPlayerRushEventListClearedFoldersSync(playerId),
        rushEventPlayedPartyList: getPlayerRushEventListPlayedPartiesSync(playerId)
    }
}

