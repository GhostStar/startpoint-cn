import { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { getPlayerSync, getSession, getPlayerItemSync, updatePlayerItemSync, updatePlayerSync } from "../../data/wdfpData";
import { resolvePlayerIdSync } from "../../data/activeAccount";
import { getQuestFromCategorySync } from "../../lib/assets";
import { generateDataHeaders } from "../../utils";

interface UnlockBody {
    category: number
    quest_id: number
    viewer_id: number
    api_count: number
}

const routes = async (fastify: FastifyInstance) => {
    fastify.post("/unlock", async (request: FastifyRequest, reply: FastifyReply) => {
        const body = request.body as UnlockBody

        const viewerId = body.viewer_id
        const category = body.category
        const questId = body.quest_id

        if (isNaN(viewerId) || isNaN(category) || isNaN(questId)) {
            return reply.status(400).send({
                "error": "Bad Request",
                "message": "Invalid request body."
            })
        }

        const session = await getSession(viewerId.toString())
        if (!session) {
            return reply.status(400).send({
                "error": "Bad Request",
                "message": "Invalid viewer id."
            })
        }

        const playerId = resolvePlayerIdSync(session.accountId)
        if (playerId === null) {
            return reply.status(500).send({
                "error": "Internal Server Error",
                "message": "No player bound to account."
            })
        }

        const player = getPlayerSync(playerId)
        if (player === null) {
            return reply.status(500).send({
                "error": "Internal Server Error",
                "message": "No player data."
            })
        }

        // Look up quest data for unlock cost
        const questData = getQuestFromCategorySync(category, questId)
        if (questData === null) {
            return reply.status(400).send({
                "error": "Bad Request",
                "message": "Quest not found."
            })
        }

        // Consume unlock items — for now, grant unlock for free
        // TODO: Load unlock cost from quest master data and deduct items

        reply.header("content-type", "application/x-msgpack")
        return reply.status(200).send({
            "data_headers": generateDataHeaders({
                viewer_id: viewerId
            }),
            "data": []
        })
    })
}

export default routes
