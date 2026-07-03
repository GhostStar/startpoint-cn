// Handles the insertion of mana into characters.

import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getAccountPlayers } from "../../data/domains/account"
import { getPlayerCharacterManaNodesSync, getPlayerCharacterSync, getPlayerCharactersManaNodesSync, getPlayerCharactersSync, hasPlayerUnlockedCharacterManaNodeSync, insertPlayerCharacterBondTokenSync, insertPlayerCharacterManaNodesSync, updatePlayerCharacterBondTokenSync, updatePlayerCharacterSync, getPlayerCharactersManaNodeAwakeLevelsSync, updatePlayerCharacterManaNodeAwakeLevelSync } from "../../data/domains/character"
import { getPlayerItemSync, givePlayerItemSync, updatePlayerItemSync } from "../../data/domains/item"
import { getPlayerSync, updatePlayerSync } from "../../data/domains/player"
import { getSession } from "../../data/domains/session"
import { generateDataHeaders } from "../../utils";
import { getCharacterDataSync, getCharacterManaBoardCountSync, getCharacterManaNodeSync, getCharacterManaNodesSync, getManaNodeAwakeCost } from "../../lib/assets";
import { characterExpCaps, givePlayerCharacterSync } from "../../lib/character";
import { clientSerializeDate } from "../../data/utils";
import { resolvePlayerIdSync } from "../../data/activeAccount";
import { validateSessionAndPlayer, validateCharacterOwnership, computeManaDeduction, computeItemDeductions, buildCharacterListEntry, sendCharacterResponse } from "../../lib/character-helpers";

interface OverLimitBody {
    viewer_id: number
    character_id: number
    api_count: number
    use_stack: boolean
    item_id: number,
    over_limit_count: number
}

interface LearnManaNodeBody {
    viewer_id: number,
    character_id: number,
    api_count: number,
    mana_node_multiplied_id_list: number[]
}

interface AwakeManaNodeBody {
    viewer_id: number,
    character_id: number,
    api_count: number,
    mana_node_multiplied_id_list: number[],
    awake_level: number
}

interface SetIllustrationSettingsBody {
    character_id: number,
    api_count: number,
    illustration_settings: number[],
    viewer_id: number
}

interface ReceiveBondTokenBody {
    character_id: number,
    mana_board_index: number,
    api_count: number,
    viewer_id: number
}

export const characterMaxOverLimits: Record<number, number> = {
    [1]: 12, // 1* max over limit count
    [2]: 10, // 2* max over limit count
    [3]: 8,  // 3* max over limit count 
    [4]: 6,  // 4* max over limit count
    [5]: 4,  // 5* max over limit count 
}

const openManaBoardRequiredUncaps: Record<number, number> = {
    [1]: 10,
    [2]: 8,
    [3]: 6,
    [4]: 4,
    [5]: 2
}

// Minimum exp to open 2nd mana board: 5★ Lv80, 4★ Lv70, 3★ Lv60
const openManaBoardRequiredExp: Record<number, number> = {
    [3]: characterExpCaps[3][0],
    [4]: characterExpCaps[4][0],
    [5]: characterExpCaps[5][0]
}

const routes = async (fastify: FastifyInstance) => {
    fastify.post("/set_illustration_settings", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as SetIllustrationSettingsBody

        const viewerId = body.viewer_id
        const characterId = body.character_id
        const illustration_settings = body.illustration_settings
        if (isNaN(viewerId) || isNaN(characterId) || !illustration_settings) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Invalid request body."
        })

        const viewerIdSession = await getSession(viewerId.toString())
        if (!viewerIdSession) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Invalid viewer id."
        })

        // get player id
        const playerId = resolvePlayerIdSync(viewerIdSession.accountId)!
        if (playerId === undefined) return reply.status(500).send({
            "error": "Internal Server Error",
            "message": "No players bound to account."
        })

        // update character
        updatePlayerCharacterSync(playerId, characterId, {
            illustrationSettings: illustration_settings.slice(0, 6)
        })

        reply.header("content-type", "application/x-msgpack")
        return reply.status(200).send({
            "data_headers": generateDataHeaders({
                viewer_id: viewerId
            }),
            "data": {}
        }) 
    })

    fastify.post("/receive_bond_token", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as ReceiveBondTokenBody

        const viewerId = body.viewer_id
        const characterId = body.character_id
        const manaBoardIndex = body.mana_board_index
        console.log(`[MANA] receive_bond_token: viewer=${viewerId} char=${characterId} boardIdx=${manaBoardIndex}`)
        if (isNaN(viewerId) || isNaN(characterId) || isNaN(manaBoardIndex)) return reply.status(400).send({
            "error": "Bad Request", "message": "Invalid request body."
        })

        const sess = await validateSessionAndPlayer(viewerId, reply)
        if (!sess) return
        const { playerId, player } = sess

        const characterData = validateCharacterOwnership(playerId, characterId, reply)
        if (!characterData) return

        const bondToken = characterData.bondTokenList[manaBoardIndex - 1]
        if (!bondToken || bondToken.status === 0) return reply.status(400).send({
            "error": "Bad Request", "message": "Cannot receive bond token."
        })

        // Already claimed — return current state
        if (bondToken.status === 2) {
            return sendCharacterResponse(reply, viewerId, {
                user_info: { bond_token: player.bondToken },
                character_list: [buildCharacterListEntry(characterId, characterData, {
                    bond_token_list: characterData.bondTokenList.map(e => ({ mana_board_index: e.manaBoardIndex, status: e.status })),
                })],
                user_character_mana_node_list: {},
                item_list: {},
                evolution: [],
                mail_arrived: false,
            })
        }

        // Claim the bond token
        const newBondTokens = player.bondToken + 1
        updatePlayerSync({ id: playerId, bondToken: newBondTokens })
        updatePlayerCharacterBondTokenSync(playerId, characterId, { manaBoardIndex, status: 2 })

        const bondTokenList: Object[] = []
        for (const entry of characterData.bondTokenList) {
            bondTokenList.push({ "mana_board_index": entry.manaBoardIndex, "status": entry.manaBoardIndex === manaBoardIndex ? 2 : entry.status })
        }

        return sendCharacterResponse(reply, viewerId, {
            user_info: { bond_token: newBondTokens },
            character_list: [buildCharacterListEntry(characterId, characterData, { bond_token_list: bondTokenList })],
            user_character_mana_node_list: {},
            item_list: {},
            evolution: [],
            mail_arrived: false,
        })
    })

    fastify.post("/open_mana_board", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as ReceiveBondTokenBody
        
        const viewerId = body.viewer_id
        const characterId = body.character_id
        const manaBoardIndex = body.mana_board_index
        console.log(`[MANA] open_mana_board: viewer=${viewerId} char=${characterId} boardIdx=${manaBoardIndex}`)
        if (isNaN(viewerId) || isNaN(characterId) || isNaN(manaBoardIndex)) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Invalid request body."
        })

        const viewerIdSession = await getSession(viewerId.toString())
        if (!viewerIdSession) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Invalid viewer id."
        })

        const playerId = resolvePlayerIdSync(viewerIdSession.accountId)!

        if (playerId === null) return reply.status(500).send({
            "error": "Internal Server Error",
            "message": "No players bound to account."
        })

        // get character data
        const characterData = getPlayerCharacterSync(playerId, characterId)
        if (characterData === null) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Character not owned."
        })

        // get character asset data
        const characterAssetData = getCharacterDataSync(characterId)
        if (characterAssetData === null) return reply.status(500).send({
            "error": "Internal Server Error",
            "message": "No character asset data found."
        })

        // make sure that the mana board index is valid, auto-create missing bond tokens
        if (!characterData.bondTokenList[manaBoardIndex - 1]) {
            const boardCount = getCharacterManaBoardCountSync(characterId)
            console.log(`[MANA] open_mana_board: auto-creating bond tokens, bondListLen=${characterData.bondTokenList.length} boardCount=${boardCount}`)
            for (let i = characterData.bondTokenList.length + 1; i <= boardCount; i++) {
                insertPlayerCharacterBondTokenSync(playerId, characterId, {
                    manaBoardIndex: i,
                    status: 0
                })
                characterData.bondTokenList.push({
                    manaBoardIndex: i,
                    status: 0
                })
            }
        }

        // ensure that the mana board can be opened
        const requiredLevelExp = openManaBoardRequiredExp[characterAssetData.rarity]
        if (requiredLevelExp !== undefined && requiredLevelExp > characterData.exp) {
            console.log(`[MANA] open_mana_board FAIL: exp too low, need=${requiredLevelExp} have=${characterData.exp} rarity=${characterAssetData.rarity}`)
            return reply.status(400).send({
                "error": "Bad Request",
                "message": `Character level is too low to unlock mana board.`
            })
        }
        if (openManaBoardRequiredUncaps[characterAssetData.rarity] > characterData.overLimitStep) {
            console.log(`[MANA] open_mana_board FAIL: uncap too low, need=${openManaBoardRequiredUncaps[characterAssetData.rarity]} have=${characterData.overLimitStep} rarity=${characterAssetData.rarity}`)
            return reply.status(400).send({
                "error": "Bad Request",
                "message": `Character is not uncapped enough to unlock mana board.`
            })
        }
        if (1 > characterData.bondTokenList[manaBoardIndex - 2]?.status) {
            console.log(`[MANA] open_mana_board FAIL: prev node not unlocked, prevIdx=${manaBoardIndex - 2} prevStatus=${characterData.bondTokenList[manaBoardIndex - 2]?.status} bondList=${JSON.stringify(characterData.bondTokenList)}`)
            return reply.status(400).send({
                "error": "Bad Request",
                "message": `Must unlock all previous mana board nodes.`
            })
        }

        updatePlayerCharacterSync(playerId, characterId, {
            manaBoardIndex: manaBoardIndex
        })

        reply.header("content-type", "application/x-msgpack")
        return reply.status(200).send({
            "data_headers": generateDataHeaders({
                viewer_id: viewerId
            }),
            "data": {
                "character_list": [
                    {
                        "viewer_id": viewerId,
                        "character_id": characterId,
                        "mana_board_index": manaBoardIndex,
                        "create_time": clientSerializeDate(characterData.joinTime),
                        "update_time": clientSerializeDate(characterData.updateTime),
                        "join_time": clientSerializeDate(characterData.joinTime)
                    }
                ],
                "mail_arrived": false
            }
        }) 
    })

    fastify.post("/learn_mana_node", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as LearnManaNodeBody

        const viewerId = body.viewer_id
        const characterId = body.character_id
        const toUnlockNodeIds = body.mana_node_multiplied_id_list
        console.log(`[MANA] learn_mana_node: viewer=${viewerId} char=${characterId} nodes=${JSON.stringify(toUnlockNodeIds)}`)
        if (!viewerId || isNaN(viewerId) || !characterId || isNaN(characterId) || !toUnlockNodeIds) return reply.status(400).send({
            "error": "Bad Request", "message": "Invalid request body."
        })

        const sess = await validateSessionAndPlayer(viewerId, reply)
        if (!sess) return
        const { playerId, player } = sess

        const characterData = validateCharacterOwnership(playerId, characterId, reply)
        if (!characterData) return

        // compute the combined cost of each node
        let manaCost = 0
        const itemsCosts: Record<string, number> = {}
        const userCharacterManaNodeListItem: Object[] = []

        const currentManaNodeIndex = characterData.manaBoardIndex;
        const characterManaNodes = getCharacterManaNodesSync(characterId, currentManaNodeIndex)
        if (characterManaNodes === null) return reply.status(400).send({
            "error": "Bad Request", "message": `Character does not have mana nodes of index '${currentManaNodeIndex}'.`
        })

        const unlockedManaNodes = getPlayerCharacterManaNodesSync(playerId, characterId);
        const unlockedManaNodesRecord: Record<string, boolean> = {}
        let indexUnlockedNodesCount = 0
        for (const manaNodeId of unlockedManaNodes) {
            unlockedManaNodesRecord[manaNodeId] = true
            indexUnlockedNodesCount += characterManaNodes[manaNodeId] === undefined ? 0 : 1
        }

        for (const manaNodeId of toUnlockNodeIds) {
            if (unlockedManaNodesRecord[manaNodeId]) return reply.status(400).send({
                "error": "Bad Request", "message": `Mana node '${manaNodeId}' already unlocked.`
            })

            const nodeData = characterManaNodes[manaNodeId];
            if (nodeData === undefined) return reply.status(400).send({
                "error": "Bad Request", "message": `Mana node '${manaNodeId}' does not exist.`
            })

            if (nodeData !== null) {
                manaCost += nodeData.manaCost
                for (const [itemId, itemCost] of Object.entries(nodeData.items)) {
                    itemsCosts[itemId] = (itemsCosts[itemId] ?? 0) + itemCost
                }
                userCharacterManaNodeListItem.push({ "multiplied_id": manaNodeId, "awake_level": 0 })
            }
        }

        // Deduct mana
        const manaResult = computeManaDeduction(player, manaCost)
        if (!manaResult) return reply.status(400).send({ "error": "Bad Request", "message": "Not enough mana." })
        const { newFreeMana, newPaidMana } = manaResult

        // Deduct items
        const itemResult = computeItemDeductions(playerId, itemsCosts, reply)
        if (!itemResult) return
        const newItemAmounts = itemResult

        // Apply deductions
        updatePlayerSync({ id: playerId, freeMana: newFreeMana, paidMana: newPaidMana })
        for (const [itemId, newAmount] of Object.entries(newItemAmounts)) {
            updatePlayerItemSync(playerId, itemId, newAmount)
        }

        let characterEvolutionLevel = characterData.evolutionLevel
        let evolutionData: Object = []
        const bondTokenList: Object[] = []
        const isBoardComplete = (indexUnlockedNodesCount + toUnlockNodeIds.length) === Object.keys(characterManaNodes).length

        if (characterData.bondTokenList[currentManaNodeIndex - 1]?.status === 0 && isBoardComplete) {
            updatePlayerCharacterBondTokenSync(playerId, characterId, { manaBoardIndex: currentManaNodeIndex, status: 1 });
            for (const entry of characterData.bondTokenList) {
                bondTokenList.push({ "mana_board_index": entry.manaBoardIndex, "status": entry.manaBoardIndex === currentManaNodeIndex ? 1 : entry.status })
            }
            if (characterEvolutionLevel === 0) {
                characterEvolutionLevel = 1
                updatePlayerCharacterSync(playerId, characterId, { evolutionLevel: characterEvolutionLevel })
                evolutionData = { "character_id": characterId, "level": 1, "img_level": 1 }
            }
        }

        console.log(`[MANA] learn_mana_node done: boardComplete=${isBoardComplete} bondGiven=${!!bondTokenList.length} evoLevel=${characterEvolutionLevel}`)

        insertPlayerCharacterManaNodesSync(playerId, characterId, toUnlockNodeIds)

        return sendCharacterResponse(reply, viewerId, {
            user_info: { free_mana: newFreeMana, paid_mana: newPaidMana },
            character_list: [buildCharacterListEntry(characterId, characterData, {
                evolution_level: characterEvolutionLevel,
                evolution_img_level: characterEvolutionLevel,
                bond_token_list: bondTokenList,
            })],
            user_character_mana_node_list: { [String(characterId)]: userCharacterManaNodeListItem as { multiplied_id: number; awake_level: number }[] },
            item_list: newItemAmounts,
            evolution: evolutionData,
            mail_arrived: false,
        })
    })

    fastify.post("/awake_mana_node", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as AwakeManaNodeBody

        const viewerId = body.viewer_id
        const characterId = body.character_id
        const toAwakenNodeIds = body.mana_node_multiplied_id_list
        const targetAwakeLevel = body.awake_level
        console.log(`[MANA] awake_mana_node: viewer=${viewerId} char=${characterId} nodes=${JSON.stringify(toAwakenNodeIds)} level=${targetAwakeLevel}`)
        if (!viewerId || isNaN(viewerId) || !characterId || isNaN(characterId) || !toAwakenNodeIds || !targetAwakeLevel) return reply.status(400).send({
            "error": "Bad Request", "message": "Invalid request body."
        })

        const sess = await validateSessionAndPlayer(viewerId, reply)
        if (!sess) return
        const { playerId, player } = sess

        const characterData = validateCharacterOwnership(playerId, characterId, reply)
        if (!characterData) return

        // Compute costs for each awakening node
        let manaCost = 0
        const itemsCosts: Record<string, number> = {}
        const userCharacterManaNodeListItem: Object[] = []

        const awakeLevels = getPlayerCharactersManaNodeAwakeLevelsSync(playerId)
        const charAwakeLevels = awakeLevels[String(characterId)] ?? {}

        // Cache character rarity outside the loop
        const charAssetData = getCharacterDataSync(characterId)
        if (charAssetData === null) return reply.status(400).send({
            "error": "Bad Request", "message": `Character asset data not found for ID ${characterId}.`
        })
        const rarity = charAssetData.rarity

        for (const manaNodeId of toAwakenNodeIds) {
            if (!hasPlayerUnlockedCharacterManaNodeSync(playerId, characterId, manaNodeId)) return reply.status(400).send({
                "error": "Bad Request", "message": `Mana node '${manaNodeId}' is not unlocked.`
            })

            const currentAwakeLevel = charAwakeLevels[manaNodeId] ?? 0
            if (currentAwakeLevel >= targetAwakeLevel) {
                userCharacterManaNodeListItem.push({ "multiplied_id": manaNodeId, "awake_level": currentAwakeLevel })
                continue
            }

            const cost = getManaNodeAwakeCost(characterId, manaNodeId, rarity)
            if (cost === null) return reply.status(400).send({
                "error": "Bad Request", "message": `No awake cost found for node '${manaNodeId}' (rarity=${rarity}).`
            })

            manaCost += cost.manaAmount
            for (const [itemId, itemCost] of Object.entries(cost.items)) {
                itemsCosts[itemId] = (itemsCosts[itemId] ?? 0) + itemCost
            }
            userCharacterManaNodeListItem.push({ "multiplied_id": manaNodeId, "awake_level": targetAwakeLevel })
        }

        // All nodes already at target — return current state
        if (manaCost === 0) {
            console.log(`[MANA] awake_mana_node: all nodes at level ${targetAwakeLevel}, returning current state`)
            return sendCharacterResponse(reply, viewerId, {
                user_info: { free_mana: player.freeMana, paid_mana: player.paidMana },
                character_list: [buildCharacterListEntry(characterId, characterData, {
                    mana_board_awake: { "1": targetAwakeLevel },
                    bond_token_list: (characterData.bondTokenList || []).map((e: any) => ({ mana_board_index: e.manaBoardIndex, status: e.status })),
                })],
                user_character_mana_node_list: { [String(characterId)]: userCharacterManaNodeListItem as { multiplied_id: number; awake_level: number }[] },
                item_list: {},
                evolution: [],
                mail_arrived: false,
            })
        }

        // Deduct mana
        const manaResult = computeManaDeduction(player, manaCost)
        if (!manaResult) return reply.status(400).send({ "error": "Bad Request", "message": "Not enough mana." })
        const { newFreeMana, newPaidMana } = manaResult

        // Deduct items
        const itemResult = computeItemDeductions(playerId, itemsCosts, reply)
        if (!itemResult) return
        const newItemAmounts = itemResult

        // Apply deductions
        updatePlayerSync({ id: playerId, freeMana: newFreeMana, paidMana: newPaidMana })
        for (const [itemId, newAmount] of Object.entries(newItemAmounts)) {
            updatePlayerItemSync(playerId, itemId, newAmount)
        }

        // Update awake_level for each newly-awakened node
        for (const item of userCharacterManaNodeListItem) {
            const nodeId = (item as any).multiplied_id
            const lvl = (item as any).awake_level
            if (lvl === targetAwakeLevel) {
                updatePlayerCharacterManaNodeAwakeLevelSync(playerId, characterId, nodeId, targetAwakeLevel)
            }
        }

        // Bond token + evolution check for board 1
        let characterEvolutionLevel = characterData.evolutionLevel
        let evolutionData: Object = []
        const bondTokenList: Object[] = []

        const board1Nodes = getCharacterManaNodesSync(characterId, 1)
        if (board1Nodes) {
            const totalBoardNodes = Object.keys(board1Nodes).length
            const learnedNodes = getPlayerCharacterManaNodesSync(playerId, characterId)
            const board1NodeIds = Object.keys(board1Nodes).map(Number)
            const board1Learned = learnedNodes.filter(id => board1NodeIds.includes(id))
            const isBoardComplete = board1Learned.length === totalBoardNodes

            if (characterData.bondTokenList?.[0]?.status === 0 && isBoardComplete) {
                updatePlayerCharacterBondTokenSync(playerId, characterId, { manaBoardIndex: 1, status: 1 })
                for (const entry of characterData.bondTokenList) {
                    bondTokenList.push({ "mana_board_index": entry.manaBoardIndex, "status": entry.manaBoardIndex === 1 ? 1 : entry.status })
                }
                if (characterEvolutionLevel === 0) {
                    characterEvolutionLevel = 1
                    updatePlayerCharacterSync(playerId, characterId, { evolutionLevel: characterEvolutionLevel })
                    evolutionData = { "character_id": characterId, "level": 1, "img_level": 1 }
                }
            }
        }

        console.log(`[MANA] awake_mana_node done: manaCost=${manaCost} nodes=${toAwakenNodeIds.length} boardComplete=${!!bondTokenList.length}`)
        return sendCharacterResponse(reply, viewerId, {
            user_info: { free_mana: newFreeMana, paid_mana: newPaidMana },
            character_list: [buildCharacterListEntry(characterId, characterData, {
                mana_board_awake: { "1": targetAwakeLevel },
                evolution_level: characterEvolutionLevel,
                evolution_img_level: characterEvolutionLevel,
                bond_token_list: bondTokenList,
            })],
            user_character_mana_node_list: { [String(characterId)]: userCharacterManaNodeListItem as { multiplied_id: number; awake_level: number }[] },
            item_list: newItemAmounts,
            evolution: evolutionData,
            mail_arrived: false,
        })
    })

    fastify.post("/over_limit", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as OverLimitBody

        const viewerId = body.viewer_id
        if (!viewerId || isNaN(viewerId)) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Invalid request body."
        })

        const viewerIdSession = await getSession(viewerId.toString())
        if (!viewerIdSession) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Invalid viewer id."
        })

        // get player
        const playerId = resolvePlayerIdSync(viewerIdSession.accountId)!
        const player = playerId !== null ? getPlayerSync(playerId) : null

        if (player === null) return reply.status(500).send({
            "error": "Internal Server Error",
            "message": "No players bound to account."
        })

        // get character data
        const characterId = body.character_id
        const playerCharacterData = getPlayerCharacterSync(playerId, characterId)
        if (playerCharacterData === null) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Character not owned."
        })

        // get character asset data
        const characterAssetData = getCharacterDataSync(characterId)
        if (characterAssetData === null) return reply.status(500).send({
            "error": "Internal Server Error",
            "message": "No character asset data found."
        })

        // calculate new over limit
        const overLimitCount = body.over_limit_count
        const newOverLimit = playerCharacterData.overLimitStep + overLimitCount
        const characterRarity = characterAssetData.rarity
        if (newOverLimit > characterMaxOverLimits[characterRarity]) return reply.status(400).send({
            "error": "Bad Request",
            "message": "Character cannot be uncapped further."
        })

        let stack = playerCharacterData.stack
        const item_list: Record<number, number> = {}

        if (body.use_stack) {
            // stack uncapping
            
            // ensure that the character has enough stack
            stack = stack - overLimitCount
            if (0 > stack) return reply.status(400).send({
                "error": "Bad Request",
                "message": "Character does not have enough duplicates to uncap."
            })

            // update the character
            updatePlayerCharacterSync(playerId, characterId, {
                overLimitStep: newOverLimit,
                stack: stack
            })
        } else {
            // item uncapping
            const itemId = body.item_id

            // ensure that the item trying to be used is valid
            // 5* characters can only be uncapped by item 10003 (awaking_crystal_5)
            // 4* characters and below can only be uncapped by items 10002 (awaking_crystal_4) and 10001 (awaking_crystal_3)
            if ( (characterRarity === 5 && itemId !== 10003) 
                || ( 4 >= characterRarity && (itemId !== 10002 && itemId !== 10001)) 
            ) return reply.status(400).send({
                "error": "Bad Request",
                "message": "Attempted to use invalid item."
            })

            const itemData = getPlayerItemSync(playerId, itemId)
            if (itemData === null) return reply.status(400).send({
                "error": "Bad Request",
                "message": "Attempted to use unowned item."
            })

            // make sure that the player has enough of the item
            const newAmount = itemData - overLimitCount
            if (0 > newAmount) return reply.status(400).send({
                "error": "Bad Request",
                "message": "Not enough of item to uncap."
            })

            // update the item count
            updatePlayerItemSync(playerId, itemId, newAmount)
            item_list[itemId] = newAmount // add to items table

            // update the character
            updatePlayerCharacterSync(playerId, characterId, {
                overLimitStep: newOverLimit
            })
        }

        reply.header("content-type", "application/x-msgpack")
        return reply.status(200).send({
            "data_headers": generateDataHeaders({
                viewer_id: viewerId
            }),
            "data": {
                "character_list": [
                    {
                        "over_limit_step": newOverLimit,
                        "character_id": characterId,
                        "stack": stack,
                        "create_time": clientSerializeDate(playerCharacterData.joinTime),
                        "update_time": clientSerializeDate(new Date()),
                        "join_time": clientSerializeDate(playerCharacterData.joinTime)
                    }
                ],
                "item_list": item_list,
                "mail_arrived": false
            }
        })
    })

    fastify.post("/bulk_over_limit", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as { viewer_id: number; api_count?: number }

        const viewerId = body.viewer_id
        if (!viewerId || isNaN(viewerId)) return reply.status(400).send({
            error: "Bad Request", message: "Invalid request body.",
        })

        const viewerIdSession = await getSession(viewerId.toString())
        if (!viewerIdSession) return reply.status(400).send({
            error: "Bad Request", message: "Invalid viewer id.",
        })

        const playerId = resolvePlayerIdSync(viewerIdSession.accountId)!
        const player = playerId !== null ? getPlayerSync(playerId) : null
        if (player === null) return reply.status(500).send({
            error: "Internal Server Error", message: "No players bound to account.",
        })

        const characters = getPlayerCharactersSync(playerId)
        console.log(`[bulk_over_limit] player=${playerId} totalChars=${Object.keys(characters).length}`)

        const characterList: any[] = []

        for (const [charId, charData] of Object.entries(characters)) {
            if (charData.stack <= 0) continue

            const assetData = getCharacterDataSync(Number(charId))
            if (!assetData) continue

            const maxOver = characterMaxOverLimits[assetData.rarity]
            if (maxOver === undefined) continue

            const rest = maxOver - charData.overLimitStep
            if (rest <= 0) continue

            const count = Math.min(charData.stack, rest)
            const newOverLimit = charData.overLimitStep + count
            const newStack = charData.stack - count

            updatePlayerCharacterSync(playerId, Number(charId), {
                overLimitStep: newOverLimit,
                stack: newStack,
            })

            characterList.push({
                character_id: Number(charId),
                over_limit_step: newOverLimit,
                stack: newStack,
                create_time: clientSerializeDate(charData.joinTime),
                update_time: clientSerializeDate(new Date()),
                join_time: clientSerializeDate(charData.joinTime),
            })
        }

        console.log(`[bulk_over_limit] done: ${characterList.length} characters modified`)

        reply.header("content-type", "application/x-msgpack")
        return reply.status(200).send({
            data_headers: generateDataHeaders({ viewer_id: viewerId }),
            data: {
                character_list: characterList,
                mail_arrived: false,
            },
        })
    })

    fastify.post("/add_character_from_town", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as { character_id: number, viewer_id: number, api_count: number }
        const viewerId = body.viewer_id
        const characterId = body.character_id
        if (!viewerId || isNaN(viewerId) || !characterId || isNaN(characterId)) return reply.status(400).send({
            "error": "Bad Request", "message": "Invalid request body."
        })

        const viewerIdSession = await getSession(viewerId.toString())
        if (!viewerIdSession) return reply.status(400).send({
            "error": "Bad Request", "message": "Invalid viewer id."
        })

        const playerId = resolvePlayerIdSync(viewerIdSession.accountId)!
        if (playerId === null) return reply.status(500).send({
            "error": "Internal Server Error", "message": "No player bound to account."
        })

        givePlayerCharacterSync(playerId, characterId)

        // Return character_list so the framework updates local player data
        const charData = getPlayerCharacterSync(playerId, characterId)
        const characterList = charData ? [{
            "character_id": characterId,
            "entry_count": charData.entryCount,
            "evolution_level": charData.evolutionLevel,
            "bond_token_list": charData.bondTokenList?.map(bt => ({
                "mana_board_index": bt.manaBoardIndex,
                "status": bt.status
            })) ?? [],
            "create_time": clientSerializeDate(charData.joinTime),
            "update_time": clientSerializeDate(charData.updateTime),
            "join_time": clientSerializeDate(charData.joinTime)
        }] : []

        reply.header("content-type", "application/x-msgpack")
        return reply.status(200).send({
            "data_headers": generateDataHeaders({ viewer_id: viewerId }),
            "data": {
                "character_list": characterList,
                "mail_arrived": false
            }
        })
    })
}

export default routes;