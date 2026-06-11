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
//                          StartBattle=5, Suspend=6, ChangeAutoplayMode=7, ChangeAutoStart=8
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
    console.log(`[SESSION] sent to ${(socket as any).remoteAddress}:${(socket as any).remotePort}:`, json.substring(0, 150));
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
            sendJson(client.socket, [1, [2, String(client.viewerId), msg[1] ?? [0]]]);
            break;

        case 1: // Bye
            console.log(`[SESSION] client ${client.viewerId} leaving room ${client.roomNumber}`);
            disconnectClient(client);
            break;

        case 6: // Suspend
            console.log(`[SESSION] client ${client.viewerId} suspended`);
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

    // Send Accept
    sendJson(socket, [0, roomNumber, ""]);

    // Build yourself from real DB data (using DB player name/rank/degreeId if available)
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
        connectionId: String(roomNumber),
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
