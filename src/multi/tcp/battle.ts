import * as net from "net"
import { sessionManager, SessionClient } from "../state/SessionManager"
import { relayToBattleRoom } from "./relay"

function findBattleClientBySocket(socket: net.Socket): SessionClient | undefined {
    const map = (sessionManager as any).cidToBattleClient as Map<string, SessionClient> | undefined
    if (!map) return undefined
    for (const client of map.values()) {
        if (client.socket === socket) return client
    }
    return undefined
}

function handleBattleNotify(socket: net.Socket, data: unknown): void {
    if (!Array.isArray(data)) return
    const tag = data[0] as number
    const client = findBattleClientBySocket(socket)

    switch (tag) {
        case 0: { // SceneReady
            if (!client) break
            const allReady = sessionManager.markSceneReady(client.connectionId, client.roomNumber)
            if (allReady) {
                const bSet = (sessionManager as any).battleClients?.get?.(client.roomNumber) as Set<string> | undefined
                if (bSet) {
                    for (const cid of bSet) {
                        const c = sessionManager.getBattleClient(cid)
                        if (c) sessionManager.sendJson(c.socket, [1, [1]])
                    }
                }
            }
            break
        }
        case 1: { // Finalize
            if (client) sessionManager.sendJson(client.socket, [1, [2, client.connectionId]])
            break
        }
        case 2: // Measurement
            break
        case 4: // Heartbeat
            if (client) sessionManager.sendJson(client.socket, [1, [10]])
            break
        default:
            break
    }
}

export function handleBattleMessage(socket: net.Socket, data: unknown): void {
    if (!Array.isArray(data)) return
    const tag = data[0] as number

    switch (tag) {
        case 0: // Notify
            handleBattleNotify(socket, data[1])
            break
        case 1: { // Broadcast
            const bcData = data[1]
            if (Array.isArray(bcData) && bcData.length >= 2) {
                relayToBattleRoom(String(bcData[0]), String(bcData[1]), [1, [2, bcData[1], bcData[2]]])
            }
            break
        }
        case 2: // Send
            break
        default:
            break
    }
}
