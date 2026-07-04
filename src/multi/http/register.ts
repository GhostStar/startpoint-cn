import { FastifyInstance } from "fastify"
import { registerLobbyRoutes } from "./lobby"
import { registerRoomRoutes } from "./room"
import { registerBattleRoutes } from "./battle"
import { registerSocialRoutes } from "./social"

export async function multiBattleRoutes(fastify: FastifyInstance): Promise<void> {
    registerLobbyRoutes(fastify)
    registerRoomRoutes(fastify)
    registerBattleRoutes(fastify)
    registerSocialRoutes(fastify)
}
