// Multi battle TCP session server
// Phase 1: Room creation only (no NPCs, no auto-start)
// Protocol: JSON messages delimited by null byte (\0)
// Post-handshake messages use typepacker format with useEnumIndex=true:
//   [index, param1, param2, ...]
//
// Enum indices:
//   MeetingServer2Client: Message=1, Messages=2, Error=0
//   MeetingServerMessage: Welcome=0, Mates=1, StateChanged=2, Start=5, AckHeartbeat=10
//   MeetingNotifyMessage: Enter=0, Bye=1, ChangeParty=2, Ready=3, Heartbeat=4,
//                          Suspend=5, StartBattle=6, ChangeAutoplayMode=7, ChangeAutoStart=8,
//                          Log=9, EnterComs=10
//   Client2Server: Notify=0, Broadcast=1, Send=2
//   ReadyState: Preparation=0, Ready=1
//   HandshakeResult: Accept=0, Denied=1, Reconnect=2, Exception=3, Complete=4

import * as net from "net";
import { MultiRoom } from "../lib/types";
import { disbandRoom } from "./multiRoom";
import { getSession, getAccountPlayers, getPlayerSync } from "./wdfpData";

interface SessionClient {
    socket: net.Socket;
    viewerId: number;
    roomNumber: string;
    isReady: boolean;
    buffer: string;
    mates: any[];
    enterData: any;
}

const clients = new Map<string, SessionClient>();
const roomClients = new Map<string, Set<string>>();

let server: net.Server | null = null;
const SESSION_PORT = parseInt(process.env.SESSION_PORT || "8003");
const SESSION_HOST = process.env.SESSION_HOST || "0.0.0.0";

// NPC recruit timing (env-configurable, defaults)
const NPC_JOIN_DELAY_MS = parseInt(process.env.NPC_JOIN_DELAY_MS || "2000");
const NPC_READY_DELAY_MS = parseInt(process.env.NPC_READY_DELAY_MS || "500");
const HOST_READY_DELAY_MS = parseInt(process.env.NPC_HOST_READY_DELAY_MS || "500");

function getAddress(client: SessionClient): string {
    return `${client.viewerId}@${client.roomNumber}`;
}

function addClient(client: SessionClient) {
    const addr = getAddress(client);
    clients.set(addr, client);

    let set = roomClients.get(client.roomNumber);
    if (!set) {
        set = new Set();
        roomClients.set(client.roomNumber, set);
    }
    set.add(addr);
}

function removeClient(client: SessionClient) {
    const addr = getAddress(client);
    clients.delete(addr);

    const set = roomClients.get(client.roomNumber);
    if (set) {
        set.delete(addr);
        if (set.size === 0) {
            roomClients.delete(client.roomNumber);
            disbandRoom(client.roomNumber);
            console.log(`[SESSION] room ${client.roomNumber} disbanded (all clients disconnected)`);
        }
    }
}

function sendJson(socket: net.Socket, obj: any) {
    const json = JSON.stringify(obj);
    socket.write(json + "\0");
    const tag = Array.isArray(obj) && Array.isArray(obj[1]) && Array.isArray(obj[1][1]) ? ` [1][${obj[1][0]}][N=${obj[1][1].length}]` : '';
    console.log(`[SESSION] sent to ${(socket as any).remoteAddress}:${(socket as any).remotePort}${tag}:`, json.substring(0, 200));
}

function handleMessage(client: SessionClient, data: string) {
    try {
        const msg = JSON.parse(data);
        console.log(`[SESSION] recv from viewer=${client.viewerId}: ${data.substring(0, 150)}`);

        if (Array.isArray(msg)) {
            handleClient2Server(client, msg);
            return;
        }

        console.log(`[SESSION] unknown message:`, data.substring(0, 100));
    } catch (e) {
        console.log(`[SESSION] parse error:`, (e as Error).message, data.substring(0, 100));
    }
}

function handleClient2Server(client: SessionClient, msg: any[]) {
    const tag = msg[0];
    switch (tag) {
        case 0: // Notify
            if (msg.length > 1 && Array.isArray(msg[1])) {
                const notifyTag = msg[1][0]
                console.log(`[SESSION] Notify tag=${notifyTag} from viewer=${client.viewerId}`)
                handleNotify(client, msg[1]);
            }
            break;
        case 1: // Broadcast
            console.log(`[SESSION] Broadcast from viewer=${client.viewerId}`);
            break;
        case 2: // Send
            console.log(`[SESSION] Send from viewer=${client.viewerId}`);
            break;
        default:
            console.log(`[SESSION] unhandled Client2Server: ${tag}`);
    }
}

function handleNotify(client: SessionClient, msg: any[]) {
    const tag = msg[0];
    switch (tag) {
        case 0: // Enter
            client.enterData = msg[1];
            console.log(`[SESSION] client ${client.viewerId} entered room ${client.roomNumber}`);
            break;

        case 4: // Heartbeat
            sendJson(client.socket, [1, [10, String(client.viewerId)]]);
            break;

        case 2: // ChangeParty
            console.log(`[SESSION] client ${client.viewerId} changed party`);
            break;

        case 3: // Ready
            console.log(`[SESSION] client ${client.viewerId} ready state=`, msg[1])
            const mate = client.mates.find(m => m.viewerId === client.viewerId)
            if (mate) {
                mate.state = msg[1] ?? [1]
                sendJson(client.socket, [1, [2, mate.connectionId, mate.state]])
                console.log(`[SESSION] client ${client.viewerId} ready via cid=${mate.connectionId}`)
            }
            break;

        case 1: // Bye
            console.log(`[SESSION] client ${client.viewerId} leaving room ${client.roomNumber}`);
            disconnectClient(client);
            break;

        case 6: // StartBattle (CN index 6)
            console.log(`[SESSION] client ${client.viewerId} StartBattle, mates=${client.mates.length}`)
            // Send Start(members) to all mates
            sendJson(client.socket, [1, [5, client.mates]])
            break;

        case 5: // Suspend (CN index 5)
            console.log(`[SESSION] client ${client.viewerId} suspended`);
            break;

        case 9: // Log
            console.log(`[SESSION] client ${client.viewerId} log:`, typeof msg[1] === 'string' ? (msg[1] as string).substring(0, 100) : msg[1]);
            break;

        case 10: // EnterComs (NPC recruitment)
            const coms = msg[1] as any[]
            console.log(`[SESSION] client ${client.viewerId} EnterComs: ${coms.length} NPCs`)
            handleEnterComs(client, coms)
            break;

        case 7: // ChangeAutoplayMode
        case 8: // ChangeAutoStart
            console.log(`[SESSION] client ${client.viewerId}: notify=${tag}`);
            break;

        default:
            console.log(`[SESSION] unhandled Notify: ${tag}`, JSON.stringify(msg).substring(0, 100));
    }
}

function disconnectClient(client: SessionClient) {
    removeClient(client);
    try { client.socket.destroy(); } catch (e) {}
}

function handleEnterComs(client: SessionClient, coms: any[]) {
    // Build NPC mate objects from client's EnterComs data
    const npcMates: any[] = []
    for (const com of coms) {
        const comId = com.comId ?? com.com_id ?? 1
        // Normalize party data: HTTP summon uses snake_case, TCP session needs camelCase for equipments
        const party = com.party ?? { characters: [[1],[1],[1]], unison_characters: [[1],[1],[1]], equipments: [[1],[1],[1]], abilitySoulIds: [[1],[1],[1]] }
        if (party.equipments) {
            party.equipments = party.equipments.map((eq: any) => {
                if (Array.isArray(eq) && eq[0] === 0 && eq[1]) {
                    return [0, {
                        equipmentId: eq[1].equipmentId ?? eq[1].equipment_id ?? 0,
                        level: eq[1].level ?? 1,
                        enhancementLevel: eq[1].enhancementLevel ?? eq[1].enhancement_level ?? 0
                    }]
                }
                return eq
            })
        }
        const mate = {
            viewerId: -comId,  // negative IDs for NPCs
            comId: comId,
            name: com.name ?? `NPC${comId}`,
            rank: com.rank ?? 80,
            degreeId: com.degreeId ?? com.degree_id ?? 1,
            playerRoleKind: 99,  // NPC marker
            party: com.party ?? {
                characters: [[1], [1], [1]],
                unison_characters: [[1], [1], [1]],
                equipments: [[1], [1], [1]],
                abilitySoulIds: [[1], [1], [1]]
            },
            connectionId: `${client.roomNumber}-npc-${comId}`,  // unique per NPC
            autoplayMode: false,
            autoskillMode: 1,
            autoSpeedLevel: 1,
            autoStart: false,
            skillAbilityBehaviorMode: 1,
            dashBehaviorMode: 1,
            allowHealFromOtherPlayers: true,
            state: [0],
            entryTime: Date.now(),
            isNewbie: false,
            isHost: false
        }
        npcMates.push(mate)
    }

    // Get current mates (host is client.mates[0])
    const host = client.mates[0]
    if (!host) {
        console.log(`[SESSION] EnterComs error: no host mate found`)
        return
    }

    // Update mates: [host, npc1, npc2, ...]
    client.mates = [host, ...npcMates]
    console.log(`[SESSION] EnterComs: room=${client.roomNumber} total mates=${client.mates.length}`)

    // 1. Send Mates update after configured join delay (NPCs join, state=[0] Preparation)
    setTimeout(() => {
        sendJson(client.socket, [1, [1, client.mates]])
        console.log(`[SESSION] EnterComs: NPCs joined room=${client.roomNumber} mates=${client.mates.length}`)
    }, NPC_JOIN_DELAY_MS)

    // 2. NPCs transition to Ready state
    setTimeout(() => {
        for (const npc of npcMates) {
            npc.state = [1]
            sendJson(client.socket, [1, [2, npc.connectionId, [1]]])
            console.log(`[SESSION] NPC ready: cid=${npc.connectionId} name=${npc.name}`)
        }
    }, NPC_JOIN_DELAY_MS + NPC_READY_DELAY_MS)

    // 3. Host auto-ready after NPCs
    setTimeout(() => {
        host.state = [1]
        client.isReady = true
        sendJson(client.socket, [1, [2, host.connectionId, [1]]])
        console.log(`[SESSION] EnterComs: host auto-ready viewer=${client.viewerId} cid=${host.connectionId}`)
    }, NPC_JOIN_DELAY_MS + NPC_READY_DELAY_MS + HOST_READY_DELAY_MS)
}

export function startSessionServer(): Promise<void> {
    return new Promise((resolve) => {
        server = net.createServer((socket) => {
            const remoteAddr = `${socket.remoteAddress}:${socket.remotePort}`;
            console.log(`[SESSION] new connection from ${remoteAddr}`);

            let buffer = "";
            let handledHandshake = false;
            let sessionClient: SessionClient | null = null;

            socket.on("data", (chunk: Buffer) => {
                buffer += chunk.toString("utf-8");

                while (buffer.includes("\0")) {
                    const idx = buffer.indexOf("\0");
                    const data = buffer.substring(0, idx);
                    buffer = buffer.substring(idx + 1);

                    if (data.trim().length === 0) continue;

                    if (!handledHandshake) {
                        handleHandshake(socket, data, remoteAddr).then((client) => {
                            sessionClient = client;
                            handledHandshake = true;
                        }).catch((err) => {
                            console.log(`[SESSION] handshake failed from ${remoteAddr}:`, err);
                            socket.destroy();
                        });
                    } else if (sessionClient) {
                        handleMessage(sessionClient, data);
                    }
                }
            });

            socket.on("close", () => {
                console.log(`[SESSION] disconnect from ${remoteAddr}`);
                if (sessionClient) removeClient(sessionClient);
            });

            socket.on("error", (err) => {
                console.log(`[SESSION] socket error from ${remoteAddr}:`, err.message);
                if (sessionClient) removeClient(sessionClient);
            });
        });

        server.listen(SESSION_PORT, SESSION_HOST, () => {
            console.log(`[SESSION] TCP session server listening on ${SESSION_HOST}:${SESSION_PORT}`);
            resolve();
        });
    });
}

export function stopSessionServer(): Promise<void> {
    return new Promise((resolve) => {
        if (server) {
            clients.clear();
            roomClients.clear();
            server.close(() => resolve());
        } else {
            resolve();
        }
    });
}

function makeDefaultChar(id: number): any[] {
    return [0, {
        id, evolution_level: 0, exp: 0, over_limit_step: 0,
        mana_node_ids: [1], ex_boost: [1], illustration_settings: [1]
    }];
}
function makeDefaultEquip(eid: number): any[] {
    return [0, { equipmentId: eid, level: 1, enhancementLevel: 0 }];
}
function makeDefaultParty(chars: number[], unisons: number[], equips: number[]): any {
    return {
        characters: chars.map(makeDefaultChar),
        unison_characters: unisons.map(makeDefaultChar),
        equipments: equips.map(makeDefaultEquip),
        abilitySoulIds: [[1], [1], [1]]
    };
}

async function handleHandshake(socket: net.Socket, data: string, remoteAddr: string): Promise<SessionClient> {
    console.log(`[SESSION] handshake from ${remoteAddr}:`, data);

    let handshake: any;
    try { handshake = JSON.parse(data); } catch {
        throw new Error("Invalid handshake JSON");
    }

    const viewerId = handshake.viewerId;
    const roomNumber = handshake.roomNumber;
    if (!viewerId || !roomNumber) throw new Error("Missing viewerId or roomNumber");

    // Look up player data from DB
    let playerName = `Player${viewerId}`;
    let playerRank = 1;
    let playerDegreeId = 1;
    let playerRoleKind = 1;
    let playerIsNewbie = false;
    let mainCharId = 131012;

    try {
        const session = await getSession(String(viewerId));
        if (session) {
            const playerIds = await getAccountPlayers(session.accountId);
            if (playerIds && playerIds.length > 0 && !isNaN(playerIds[0])) {
                const player = getPlayerSync(playerIds[0]);
                if (player) {
                    playerName = player.name || playerName;
                    playerRank = player.rankPoint || playerRank;
                    playerDegreeId = player.degreeId || playerDegreeId;
                    playerRoleKind = player.role || playerRoleKind;
                    playerIsNewbie = !!player.tutorialStep;
                    mainCharId = player.leaderCharacterId || mainCharId;
                }
            }
        }
    } catch (e) {
        console.log(`[SESSION] failed to read player data for viewer=${viewerId}:`, (e as Error).message);
    }

    const client: SessionClient = {
        socket,
        viewerId: Number(viewerId),
        roomNumber: String(roomNumber),
        isReady: false,
        buffer: "",
        mates: [],
        enterData: null
    };

    addClient(client);
    console.log(`[SESSION] client added: viewer=${viewerId} room=${roomNumber} (room total=${roomClients.get(roomNumber)?.size ?? 0})`);

    // Send Accept
    console.log(`[SESSION] handshake OK viewer=${viewerId} room=${roomNumber} name=${playerName}`)
    sendJson(socket, [0, roomNumber, ""]);

    const hostConnectionId = `${roomNumber}-host`;

    // Build yourself from real DB data
    const yourself = {
        viewerId: Number(viewerId),
        name: playerName,
        playerRoleKind,
        rank: playerRank,
        degreeId: playerDegreeId,
        party: makeDefaultParty(
            [mainCharId, 141007, 151001],
            [141005, 121002, 131004],
            [200005, 1010001, 2020001]
        ),
        connectionId: hostConnectionId,
        autoplayMode: false,
        autoskillMode: 1,
        autoSpeedLevel: 1,
        autoStart: false,
        skillAbilityBehaviorMode: 1,
        dashBehaviorMode: 1,
        allowHealFromOtherPlayers: true,
        state: [0],
        entryTime: Date.now(),
        isNewbie: playerIsNewbie,
        isHost: true,
        currentPartyId: 1
    };

    // Welcome(self, [self]) — room with host only (avoids C15202)
    setTimeout(() => sendJson(socket, [1, [0, yourself, [yourself]]]), 100);
    setTimeout(() => sendJson(socket, [1, [1, [yourself]]]), 200);

    client.mates = [yourself]; // for future StartBattle

    return client;
}

export { SESSION_PORT, SESSION_HOST };
