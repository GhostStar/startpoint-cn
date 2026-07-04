import { PoolItem } from "./types";
import { CharacterTableEntry, EquipmentTableEntry } from "./types";
import { ELEM_NAME_TO_INDEX, EQUIP_ELEMENT_PATTERNS, ELEMENT_PATTERNS } from "./constants";

// ── Equipment template cache ──────────────────────────────────
export const equipTemplateCache: Record<number, Record<string, PoolItem[]>> = {};

// ── Character element lookup ──────────────────────────────────
export function getCharElement(code: string, cdnChars: Record<string, any>): number | null {
    const data = cdnChars[code];
    if (!data || !Array.isArray(data) || data.length === 0) return null;
    const row = Array.isArray(data[0]) ? data[0] : data;
    return row[3] !== undefined ? parseInt(String(row[3]), 10) : null;
}

// ── Element detection from pool key ───────────────────────────
export function detectElement(poolKey: string): number | null {
    for (const [keywords, element] of ELEMENT_PATTERNS) {
        for (const kw of keywords) {
            if (poolKey.includes(kw)) return element;
        }
    }
    return null;
}

// ── Equipment element detection ───────────────────────────────
export function detectEquipElement(poolKey: string): number | null {
    for (const [keywords, element] of EQUIP_ELEMENT_PATTERNS) {
        for (const kw of keywords) {
            if (poolKey.includes(kw)) return element;
        }
    }
    return null;
}

// ── Build character pool template ─────────────────────────────
export function buildPoolTemplate(
    charTable: CharacterTableEntry[],
    cdnChars: Record<string, any>,
    element?: number,
    asOfDate?: string
): Record<string, PoolItem[]> {
    const template: Record<string, PoolItem[]> = { "1": [], "2": [], "3": [] };

    for (const item of charTable) {
        if (item.source !== "常驻卡池") continue;
        const code = String(item.code_number || "");
        if (!code) continue;

        // Time filter: only include characters available at banner time
        if (asOfDate && item.available_from && item.available_from > asOfDate.substring(0, 10)) continue;

        // Element filter (for element pickup banners)
        if (element !== undefined) {
            const charElement = getCharElement(code, cdnChars);
            if (charElement !== element) continue;
        }

        // Use actual rarity field (not code[0] heuristic)
        const rarity = item.rarity;
        let pk: string, rank: number;
        if (rarity === 5) { pk = "1"; rank = 5; }
        else if (rarity === 4) { pk = "2"; rank = 4; }
        else if (rarity === 3) { pk = "3"; rank = 3; }
        else continue;

        template[pk].push({
            id: parseInt(code, 10),
            rank,
            odds: 1,
            isRateUp: false,
            rarity: 0, // recalculated per banner
        });
    }

    return template;
}

// ── Build equipment pool template ─────────────────────────────
export function buildEquipPoolTemplate(
    equipTable: Record<string, EquipmentTableEntry>,
    element?: number
): Record<string, PoolItem[]> {
    const template: Record<string, PoolItem[]> = { "1": [], "2": [], "3": [] };

    for (const [idStr, item] of Object.entries(equipTable)) {
        if (item.source !== "常驻") continue;

        // Element filter
        if (element !== undefined) {
            const eidx = ELEM_NAME_TO_INDEX[item.element] ?? -1;
            if (eidx !== element) continue;
        }

        const rarity = item.rarity;
        let pk: string;
        if (rarity === 5) pk = "1";
        else if (rarity === 4) pk = "2";
        else if (rarity === 3) pk = "3";
        else continue;

        template[pk].push({
            id: parseInt(idStr, 10),
            rank: rarity,
            odds: 1,
            isRateUp: false,
            rarity: 0,
        });
    }

    // Calculate rarities: sum per tier ≈ 1000
    for (const pk of ["1", "2", "3"] as const) {
        const items = template[pk];
        if (items.length === 0) continue;
        const base = 1000 / items.length;
        for (const item of items) {
            item.rarity = Math.round(base * 100) / 100;
        }
    }

    return template;
}
