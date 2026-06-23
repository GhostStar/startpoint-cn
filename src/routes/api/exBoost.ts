// Handles EX boosts for characters.

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify"
import { getAccountPlayers, getPlayerCharacterSync, getPlayerItemSync, getPlayerSync, getSession, playerOwnsCharacterSync, updatePlayerCharacterSync, updatePlayerItemSync } from "../../data/wdfpData"
import { getCharacterDataSync, getExBoostItemSync, getExStatusPoolSync } from "../../lib/assets"
import { generateDataHeaders } from "../../utils"
import { randomInt } from "crypto"
import { clientSerializeDate } from "../../data/utils"
import { resolvePlayerIdSync } from "../../data/activeAccount";
import { characterMaxOverLimits } from "./character"
import orderedExAbility from "../../../assets/ex_ability.json"

interface ExBoostDrawBody {
    character_id: number,
    viewer_id: number,
    api_count: number,
    cost_item_id: number
}

interface ExBoostSelectBody {
    viewer_id: number,
    is_confirm: boolean,
    api_count: number
}

interface ExBoostDrawResult {
    characterId: number,
    statusId: number,
    abilityIdList: number[]
}

// ---- A/B group classification from orderedmap ability names ----

const A_PREFIXES = ['atk_self_', 'skilldamage_self_', 'directdamage_self_', 'abilitydamage_self_',
    'atk_party_', 'skilldamage_party_', 'directdamage_party_', 'abilitydamage_party_',
    'powerflipdamage_', 'hp_self_']

interface AbilityInfo { id: number, name: string, group: 'A' | 'B', rarity: number }

function classifyAbilities(data: Record<string, string[][]>): AbilityInfo[] {
    const list: AbilityInfo[] = []
    for (const [id, raw] of Object.entries(data)) {
        const name = raw[0]?.[0] || ''
        const isA = A_PREFIXES.some(p => name.startsWith(p))
        let rarity = 1 // brown
        if (name.endsWith('_r5')) rarity = 3
        else if (name.endsWith('_r4')) rarity = 2
        list.push({ id: Number(id), name, group: isA ? 'A' : 'B', rarity })
    }
    return list
}

const ALL_ABILITIES = classifyAbilities(orderedExAbility as Record<string, string[][]>)

// 6 pools: A/B × gold(3)/silver(2)/brown(1)
function poolCopy(abilities: AbilityInfo[], group: 'A' | 'B', rarity: number): number[] {
    return abilities.filter(a => a.group === group && a.rarity === rarity).map(a => a.id)
}

// ---- Material gold rate table ----

// Official A/B gold rates per material (破星结晶 / 崇高辉石)
const MATERIAL_GOLD_RATES: Record<number, { aGold: number, bGold: number }> = {}
{
    const crystalA = [1.50, 2.08, 9.00]
    const crystalB = [1.36, 1.89, 8.18]
    const stoneA   = [2.00, 2.67, 10.0]
    const stoneB   = [1.82, 2.43, 9.09]
    for (let tier = 1; tier <= 3; tier++) {
        const ti = tier - 1
        MATERIAL_GOLD_RATES[10000 + tier] = { aGold: crystalA[ti], bGold: crystalB[ti] }
        for (let elem = 0; elem <= 5; elem++) {
            const id = 14001 + ti * 6 + elem
            MATERIAL_GOLD_RATES[id] = { aGold: stoneA[ti], bGold: stoneB[ti] }
        }
    }
}

// ---- Draw pools (regenerated per draw to allow mutation) ----

function freshPools(): { A: Record<number, number[]>, B: Record<number, number[]> } {
    return {
        A: { 1: poolCopy(ALL_ABILITIES, 'A', 1), 2: poolCopy(ALL_ABILITIES, 'A', 2), 3: poolCopy(ALL_ABILITIES, 'A', 3) },
        B: { 1: poolCopy(ALL_ABILITIES, 'B', 1), 2: poolCopy(ALL_ABILITIES, 'B', 2), 3: poolCopy(ALL_ABILITIES, 'B', 3) },
    }
}

const playerDraws: Record<number, ExBoostDrawResult> = {}

// ---- Draw logic ----

function pickFromPools(groupPools: Record<number, number[]>, drawTier: number, goldRate: number): number | null {
    const roll = randomInt(1, 10001) / 100 // 0.01% precision

    if (roll <= goldRate * 100) {
        // Gold: try rarity 3, fallback 2, 1
        for (const r of [3, 2, 1]) {
            if (groupPools[r].length > 0) {
                const idx = randomInt(groupPools[r].length)
                return groupPools[r].splice(idx, 1)[0]
            }
        }
    } else if (drawTier >= 2) {
        // Silver: for tier 3 (5★) skip brown; for tier 2 try 2 then 1
        const rarities = drawTier >= 3 ? [2] : [2, 1]
        for (const r of rarities) {
            if (groupPools[r].length > 0) {
                const idx = randomInt(groupPools[r].length)
                return groupPools[r].splice(idx, 1)[0]
            }
        }
    }
    // Brown/default: try 1, 2, 3
    for (const r of [1, 2, 3]) {
        if (groupPools[r].length > 0) {
            const idx = randomInt(groupPools[r].length)
            return groupPools[r].splice(idx, 1)[0]
        }
    }
    return null
}

function drawExBoostAbilities(
    drawTier: number,
    materialId: number,
    exStatusPool: number[],
): { statusId: number, abilityIdList: number[] } {
    // Always get 1 status
    const statusId = exStatusPool[randomInt(exStatusPool.length)]

    const goldRate = MATERIAL_GOLD_RATES[materialId]
    if (!goldRate) return { statusId, abilityIdList: [] }

    const pools = freshPools()
    const abilityIdList: number[] = []

    // Ability count: tier 1-2: 0-2 random, tier 3: always 2 (A+B)
    const maxCount = drawTier >= 3 ? 2 : randomInt(0, 3)

    // Independent A/B draws
    let aDone = false, bDone = false
    for (let i = 0; i < maxCount; i++) {
        if (!aDone && (i === 0 || !bDone)) {
            const aid = pickFromPools(pools.A, drawTier, goldRate.aGold)
            if (aid !== null) abilityIdList.push(aid)
            aDone = true
        } else if (!bDone) {
            const bid = pickFromPools(pools.B, drawTier, goldRate.bGold)
            if (bid !== null) abilityIdList.push(bid)
            bDone = true
        }
    }

    return { statusId, abilityIdList }
}

// ---- Endpoint handler ----

const drawExpBoost = async (request: FastifyRequest, reply: FastifyReply, autoAccept: boolean) => {
    const body = request.body as ExBoostDrawBody

    const viewerId = body.viewer_id
    const characterId = body.character_id
    const costItemId = body.cost_item_id
    if (isNaN(viewerId) || isNaN(characterId) || isNaN(costItemId)) return reply.status(400).send({
        "error": "Bad Request", "message": "Invalid request body."
    })

    const viewerIdSession = await getSession(viewerId.toString())
    if (!viewerIdSession) return reply.status(400).send({
        "error": "Bad Request", "message": "Invalid viewer id."
    })

    const playerId = resolvePlayerIdSync(viewerIdSession.accountId)!
    if (playerId === null) return reply.status(500).send({
        "error": "Internal Server Error", "message": "No players bound to account."
    })

    const characterData = getPlayerCharacterSync(playerId, characterId)
    if (characterData === null) return reply.status(400).send({
        "error": "Bad Request", "message": "Player does not own character."
    })

    const characterAssetData = getCharacterDataSync(characterId)
    if (!characterAssetData) return reply.status(500).send({
        "error": "Internal Server Error", "message": "Character does not have data."
    })

    const costItemData = getExBoostItemSync(costItemId)
    if (!costItemData) return reply.status(400).send({
        "error": "Bad Request", "message": "Attempt to use invalid cost item."
    })

    if ((costItemData.element !== undefined) && (costItemData.element !== characterAssetData.element)) return reply.status(400).send({
        "error": "Bad Request", "message": "Attempt to use wrong item with different element from character."
    })

    const costItemAmount = getPlayerItemSync(playerId, costItemId)
    if (costItemAmount === null) return reply.status(400).send({
        "error": "Bad Request", "message": "You do not own item."
    })
    const afterCostItemAmount = costItemAmount - costItemData.count
    if (0 > afterCostItemAmount) return reply.status(400).send({
        "error": "Bad Request", "message": "Not enough of item."
    })

    // ensure max over limit step (aligned with client isMaxOverLimitStep)
    const rarity = characterAssetData.rarity
    const maxOver = characterMaxOverLimits[rarity]
    if (maxOver === undefined || characterData.overLimitStep < maxOver) return reply.status(400).send({
        "error": "Bad Request", "message": "Character not at max over limit step."
    })

    const drawTier = costItemData.tier
    const exStatusPool = getExStatusPoolSync(drawTier)
    if (exStatusPool === null) return reply.status(500).send({
        "error": "Internal Server Error", "message": "Status pool not found."
    })

    // deduct
    updatePlayerItemSync(playerId, costItemId, afterCostItemAmount)

    const draw = drawExBoostAbilities(drawTier, costItemId, exStatusPool)
    const drawResult: ExBoostDrawResult = {
        characterId, statusId: draw.statusId, abilityIdList: draw.abilityIdList
    }

    const headers = generateDataHeaders({ viewer_id: viewerId })

    reply.header("content-type", "application/x-msgpack")
    if (autoAccept) {
        updatePlayerCharacterSync(playerId, characterId, {
            exBoost: { statusId: drawResult.statusId, abilityIdList: drawResult.abilityIdList }
        })
        return reply.status(200).send({
            data_headers: headers,
            data: {
                character_list: [{
                    character_id: characterId, viewer_id: viewerId,
                    entry_count: characterData.entryCount,
                    evolution_level: characterData.evolutionLevel,
                    over_limit_step: characterData.overLimitStep,
                    protection: characterData.protection,
                    exp: characterData.exp,
                    stack: characterData.stack,
                    mana_board_index: characterData.manaBoardIndex,
                    bond_token_list: characterData.bondTokenList.map(bt => ({
                        mana_board_index: bt.manaBoardIndex, status: bt.status
                    })),
                    ex_boost: { status_id: drawResult.statusId, ability_id_list: drawResult.abilityIdList },
                    create_time: clientSerializeDate(characterData.joinTime),
                    update_time: clientSerializeDate(new Date()),
                    join_time: clientSerializeDate(characterData.joinTime),
                }],
                item_list: { [String(costItemId)]: afterCostItemAmount },
                mail_arrived: false,
            },
        })
    } else {
        playerDraws[playerId] = drawResult
        return reply.status(200).send({
            data_headers: headers,
            data: {
                character_id: characterId,
                draw_result: { status_id: drawResult.statusId, ability_id_list: drawResult.abilityIdList },
                item_list: { [String(costItemId)]: afterCostItemAmount },
                mail_arrived: false,
            },
        })
    }
}

const routes = async (fastify: FastifyInstance) => {
    fastify.post("/select", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as ExBoostSelectBody
        const viewerId = body.viewer_id
        const isConfirm = body.is_confirm
        if (isNaN(viewerId)) return reply.status(400).send({
            "error": "Bad Request", "message": "Invalid request body."
        })
        const viewerIdSession = await getSession(viewerId.toString())
        if (!viewerIdSession) return reply.status(400).send({
            "error": "Bad Request", "message": "Invalid viewer id."
        })
        const playerId = resolvePlayerIdSync(viewerIdSession.accountId)!
        if (playerId === null) return reply.status(500).send({
            "error": "Internal Server Error", "message": "No players bound to account."
        })
        const drawResult = playerDraws[playerId]
        if (drawResult === undefined) return reply.status(400).send({
            "error": "Bad Request", "message": "No draw result to select."
        })
        const headers = generateDataHeaders({ viewer_id: viewerId })
        delete playerDraws[playerId]
        if (!isConfirm) {
            return reply.status(200).send({ data_headers: headers, data: { mail_arrived: false } })
        }
        const characterId = drawResult.characterId
        const characterData = getPlayerCharacterSync(playerId, characterId)
        if (characterData === null) return reply.status(400).send({
            "error": "Bad Request", "message": "Player does not own character."
        })
        updatePlayerCharacterSync(playerId, characterId, {
            exBoost: { statusId: drawResult.statusId, abilityIdList: drawResult.abilityIdList }
        })
        return reply.status(200).send({
            data_headers: headers,
            data: {
                character_list: [{
                    character_id: characterId, viewer_id: viewerId,
                    entry_count: characterData.entryCount,
                    evolution_level: characterData.evolutionLevel,
                    over_limit_step: characterData.overLimitStep,
                    protection: characterData.protection,
                    exp: characterData.exp, stack: characterData.stack,
                    mana_board_index: characterData.manaBoardIndex,
                    bond_token_list: characterData.bondTokenList.map(bt => ({
                        mana_board_index: bt.manaBoardIndex, status: bt.status
                    })),
                    ex_boost: { status_id: drawResult.statusId, ability_id_list: drawResult.abilityIdList },
                    create_time: clientSerializeDate(characterData.joinTime),
                    update_time: clientSerializeDate(new Date()),
                    join_time: clientSerializeDate(characterData.joinTime),
                }],
                mail_arrived: false,
            },
        })
    })

    fastify.post("/draw", async (request: FastifyRequest, reply: FastifyReply) => drawExpBoost(request, reply, false))
    fastify.post("/first_draw", async (request: FastifyRequest, reply: FastifyReply) => drawExpBoost(request, reply, true))
}

export default routes
