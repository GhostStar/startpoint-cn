// Tracks party member co-clears (pairwise) for multi-character awake missions
// When 3+ specific characters must be in the same party, this tracks their co-appearances

import { getDb } from "../../../data/db"
import type { FinishContext } from "./types"

export function trackPartyCoClears(ctx: FinishContext): void {
    const ids: number[] = []
    for (const c of ctx.party.characters) {
        if (c?.id) ids.push(c.id)
    }
    for (const c of ctx.party.unison_characters) {
        if (c?.id) ids.push(c.id)
    }

    // Unique set
    const unique = [...new Set(ids)]
    if (unique.length < 2) return

    const db = getDb()
    const insert = db.prepare(`
    INSERT INTO players_party_member_co_clears (player_id, char_id_a, char_id_b, co_clear_count)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(player_id, char_id_a, char_id_b) DO UPDATE SET
        co_clear_count = co_clear_count + 1
    `)

    const tx = db.transaction(() => {
        for (let i = 0; i < unique.length - 1; i++) {
            for (let j = i + 1; j < unique.length; j++) {
                insert.run(ctx.playerId, unique[i], unique[j])
            }
        }
    })
    tx()
}
