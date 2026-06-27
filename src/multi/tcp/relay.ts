import { sessionManager } from "../state/SessionManager"

export function relayToBattleRoom(roomNumber: string, sourceCid: string, data: unknown): void {
    const bSet = (sessionManager as any).battleClients?.get?.(roomNumber) as Set<string> | undefined
    if (!bSet) return
    for (const cid of bSet) {
        if (cid === sourceCid) continue
        const client = (sessionManager as any).cidToBattleClient?.get?.(cid)
        if (client) sessionManager.sendJson(client.socket, data)
    }
}
