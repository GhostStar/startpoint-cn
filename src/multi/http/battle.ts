import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { MultiStartBody, MultiFinishBody, MultiAbortBody, PlayContinueBody } from "../types";
import { generateDataHeaders } from "../../utils";
import { getRoom, setRoomBattle, disbandRoom } from "../room/manager";
import { sessionManager } from "../state/SessionManager";
import { insertActiveQuest, activeQuests } from "../../routes/api/singleBattleQuest";
import {
    deletePlayerActiveQuestSync,
    updatePlayerActiveQuestContinueCountSync,
    getPlayerSync,
    getPlayerSingleQuestProgressSync,
    insertPlayerQuestProgressSync,
    updatePlayerQuestProgressSync,
    updatePlayerSync,
    getSession,
} from "../../data/wdfpData";
import { getQuestFromCategorySync } from "../../lib/assets";
import { givePlayerCharactersExpSync } from "../../lib/character";
import { computeRealTimeStamina, getRankDegree, getMaxStamina } from "../../lib/stamina";
import { resolvePlayerIdSync } from "../../data/activeAccount";
import { BattleQuest } from "../../lib/types";
import type { Player } from "../../data/types";

interface PlayerContext { playerId: number; player: Player }

async function resolvePlayer(viewerId: number): Promise<PlayerContext | null> {
    const session = await getSession(viewerId.toString());
    if (!session) return null;
    const playerId = resolvePlayerIdSync(session.accountId);
    if (!playerId) return null;
    const player = getPlayerSync(playerId);
    if (!player) return null;
    return { playerId, player };
}

export function registerBattleRoutes(fastify: FastifyInstance): void {

    // ---- start ----
    fastify.post("/start", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as MultiStartBody;
        const { viewer_id, quest_id, category, party_id, use_boost_point, use_boss_boost_point, is_auto_start_mode, room_number, mate_player_ids, play_id } = body;
        console.log(`[MULTI] start: viewer=${viewer_id} quest=${quest_id} category=${category} party=${party_id} room=${room_number}`);

        if (isNaN(viewer_id) || isNaN(party_id) || isNaN(quest_id) || isNaN(category) || use_boost_point === undefined || use_boss_boost_point === undefined || is_auto_start_mode === undefined) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        }

        const ctx = await resolvePlayer(viewer_id);
        if (!ctx) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid viewer id or no player bound."
            });
        }

        const questData = getQuestFromCategorySync(category, quest_id) as BattleQuest | null;
        if (questData === null || !('rankPointReward' in questData)) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Quest doesn't exist."
            });
        }

        const room = getRoom(room_number);
        if (!room) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Room doesn't exist."
            });
        }

        setRoomBattle(room_number);

        const mateComIds = room.mates.map(m => m.com_id);
        insertActiveQuest(ctx.playerId, {
            questId: quest_id,
            category,
            useBoostPoint: use_boost_point,
            useBossBoostPoint: use_boss_boost_point,
            isAutoStartMode: is_auto_start_mode,
            isMulti: true,
            roomNumber: room_number,
            matePlayerIds: mate_player_ids,
            mateComIds,
            playId: play_id,
            continueCount: 0,
        });

        if (questData.fixedParty === undefined) {
            updatePlayerSync({ id: ctx.playerId, partySlot: party_id });
        }

        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": generateDataHeaders({ viewer_id }),
            "data": {
                "is_multi": "multi",
                "play_id": play_id,
            }
        });
    });

    // ---- finish ----
    fastify.post("/finish", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as MultiFinishBody;
        const viewerId = body.viewer_id;
        console.log(`[MULTI] finish: viewer=${viewerId} quest=${body.quest_id} category=${body.category} room=${body.room_number}`);

        if (!viewerId || isNaN(viewerId)) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        }

        const ctx = await resolvePlayer(viewerId);
        if (!ctx || !ctx.player) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid viewer id."
            });
        }

        const { playerId, player } = ctx;

        const activeQuestData = activeQuests[playerId];
        if (activeQuestData === undefined) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "No active quest to finish."
            });
        }

        const questCategory = activeQuestData.category;
        const questId = activeQuestData.questId;
        const questData = getQuestFromCategorySync(questCategory, questId) as BattleQuest | null;
        if (questData === null || !('rankPointReward' in questData)) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Quest doesn't exist."
            });
        }

        delete activeQuests[playerId];
        deletePlayerActiveQuestSync(playerId);

        if (activeQuestData.roomNumber) {
            sessionManager.clearBattleExpectedCount(activeQuestData.roomNumber);
        }

        if (activeQuestData.roomNumber) {
            const room = getRoom(activeQuestData.roomNumber);
            if (room) {
                room.raising_state = 1;
                console.log(`[MULTI] finish: room ${activeQuestData.roomNumber} reset to raising_state=1`);
            }
        }

        const beforeExp = player.expPool;
        const beforeMana = player.freeMana;
        const beforeRankPoint = player.rankPoint;

        const newExpPool = beforeExp + questData.poolExpReward;
        const newRankPoint = beforeRankPoint + questData.rankPointReward;
        const newMana = beforeMana + questData.manaReward;

        let newBoostPoint = player.boostPoint - (activeQuestData.useBoostPoint ? 1 : 0);
        let newBossBoostPoint = player.bossBoostPoint - (activeQuestData.useBossBoostPoint ? 1 : 0);

        const oldRkDegree = getRankDegree(beforeRankPoint);
        const newDegreeId = getRankDegree(newRankPoint);
        const didLevelUp = newDegreeId > oldRkDegree;

        updatePlayerSync({
            id: playerId,
            freeMana: newMana,
            expPool: newExpPool,
            rankPoint: newRankPoint,
            boostPoint: newBoostPoint,
            bossBoostPoint: newBossBoostPoint,
            ...(didLevelUp ? { stamina: player.stamina + getMaxStamina(newDegreeId), staminaHealTime: new Date() } : {}),
        });

        if (didLevelUp) {
            player.stamina = player.stamina + getMaxStamina(newDegreeId);
            player.staminaHealTime = new Date();
            console.log(`[MULTI-FINISH] player ${playerId} leveled up: ${oldRkDegree} -> ${newDegreeId}, stamina refilled`);
        }

        const clearTime = body.battle_time;
        const questProgress = getPlayerSingleQuestProgressSync(playerId, questCategory, questId);
        const questPreviouslyCompleted = questProgress !== null;

        if (questPreviouslyCompleted) {
            updatePlayerQuestProgressSync(playerId, questCategory, {
                questId,
                finished: true,
                bestElapsedTimeMs: questProgress.bestElapsedTimeMs === undefined || questProgress.bestElapsedTimeMs === null
                    ? clearTime : Math.min(clearTime, questProgress.bestElapsedTimeMs),
                highScore: questProgress.highScore === undefined
                    ? body.clear_phase : Math.max(body.clear_phase, questProgress.highScore),
            });
        } else {
            insertPlayerQuestProgressSync(playerId, questCategory, {
                questId,
                finished: true,
                bestElapsedTimeMs: clearTime,
                highScore: body.clear_phase,
                clearRank: 5,
            });
        }

        const partyStats = body.quest_statistics.party;
        const characterIds: number[] = [];
        for (const c of partyStats.characters) {
            if (c !== null && c.id !== null) characterIds.push(c.id);
        }
        for (const c of partyStats.unison_characters) {
            if (c !== null && c.id !== null) characterIds.push(c.id);
        }

        const rewardCharacterExpResult = givePlayerCharactersExpSync(
            playerId, characterIds, questData.characterExpReward,
            questData.fixedParty !== undefined
        );

        const stamina = computeRealTimeStamina(player);

        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": generateDataHeaders({ viewer_id: viewerId }),
            "data": {
                player_exp: { before: beforeExp, after: rewardCharacterExpResult.exp_pool },
                player_mana: { before: beforeMana, after: newMana },
                rank_point: { before: beforeRankPoint, after: newRankPoint },
                contribution_score: 1000,
                mate_player_result: (body.mate_player_ids || []).map(id => ({ viewer_id: id, score: 1000 })),
                stamina,
                rank: newDegreeId,
            }
        });
    });

    // ---- abort ----
    fastify.post("/abort", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as MultiAbortBody;
        const viewerId = body.viewer_id;
        console.log(`[MULTI] abort: viewer=${viewerId} quest=${body.quest_id} category=${body.category}`);

        if (isNaN(viewerId)) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        }

        const ctx = await resolvePlayer(viewerId);
        if (!ctx) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid viewer id or no player bound."
            });
        }

        const { playerId, player } = ctx;
        const activeQuestData = activeQuests[playerId];

        if (activeQuestData) {
            delete activeQuests[playerId];
            deletePlayerActiveQuestSync(playerId);
            if (activeQuestData.roomNumber) {
                sessionManager.clearBattleExpectedCount(activeQuestData.roomNumber);
            }
        }

        if (body.room_number) {
            const room = getRoom(body.room_number);
            if (room) {
                sessionManager.broadcastToRoom(body.room_number, [1, [3, body.room_number]]);
                disbandRoom(body.room_number);
                console.log(`[MULTI] abort: room ${body.room_number} disbanded`);
            }
        }

        const stamina = computeRealTimeStamina(player);
        const rank = getRankDegree(player.rankPoint);

        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": generateDataHeaders({ viewer_id: viewerId }),
            "data": {
                player_exp: { before: player.expPool, after: player.expPool },
                player_mana: { before: player.freeMana, after: player.freeMana },
                rank_point: { before: player.rankPoint, after: player.rankPoint },
                contribution_score: 0,
                mate_player_result: [],
                stamina,
                rank,
            }
        });
    });

    // ---- play_continue ----
    fastify.post("/play_continue", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as PlayContinueBody;
        const viewerId = body.viewer_id;
        console.log(`[MULTI] play_continue: viewer=${viewerId} quest=${body.quest_id} category=${body.category}`);

        if (isNaN(viewerId)) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid request body."
            });
        }

        const ctx = await resolvePlayer(viewerId);
        if (!ctx || !ctx.player) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "Invalid viewer id or no player bound."
            });
        }

        const { playerId } = ctx;

        if (activeQuests[playerId] === undefined) {
            return reply.status(400).send({
                "error": "Bad Request", "message": "No active quest to continue."
            });
        }

        const activeData = activeQuests[playerId];
        activeData.continueCount++;
        updatePlayerActiveQuestContinueCountSync(playerId, activeData.continueCount);

        reply.header("content-type", "application/x-msgpack");
        return reply.status(200).send({
            "data_headers": generateDataHeaders({ viewer_id: viewerId }),
            "data": {
                continue_count: activeData.continueCount,
            }
        });
    });
}
