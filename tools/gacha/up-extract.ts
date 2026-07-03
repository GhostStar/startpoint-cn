import { FINAL_SIX_IDS, REVIVAL_FES_5STAR } from "./constants";
import { CharacterTableEntry } from "./types";
import { getCharElement } from "./template";

// ── Extract UP characters per banner ──────────────────────────
export function extractUpChars(
    gachaId: string,
    cdnGacha: Record<string, any>,
    cdnFeature: Record<string, any>,
    cdnChars: Record<string, any>
): Set<string> {
    const chars = new Set<string>();

    // From gacha_feature_content.json
    if (cdnFeature[gachaId]) {
        for (const sections of Object.values(cdnFeature[gachaId])) {
            if (!Array.isArray(sections)) continue;
            for (const row of sections as any[]) {
                if (!Array.isArray(row)) continue;
                for (const cell of row) {
                    const s = String(cell);
                    if (s.length === 6 && /^\d+$/.test(s) && s[0] !== "0" && cdnChars[s]) {
                        chars.add(s);
                    }
                }
            }
        }
    }

    // From cdndata/gacha.json columns [21,22,23,26,27,28]
    const entry = cdnGacha[gachaId];
    if (entry && Array.isArray(entry) && entry.length > 0 && Array.isArray(entry[0])) {
        const row = entry[0] as any[];
        for (const col of [21, 22, 23, 26, 27, 28]) {
            if (col >= row.length) continue;
            const raw = String(row[col] || "");
            if (raw === "" || raw === "(None)") continue;
            const num = parseInt(raw, 10);
            if (!isNaN(num) && num > 0) {
                const s = String(num);
                if ((s.length === 5 || s.length === 6) && /^\d+$/.test(s) && cdnChars[s]) {
                    chars.add(s);
                }
            }
        }
    }

    return chars;
}

// ── Detect 限定属性池 ──────────────────────────────────────────
// Returns true if pool key matches {color}_element_{pickup|character_pickup}_{N}
// and col[20] === "true" (use_pickup flag).
export function isLimitedAttrPool(gachaId: string, row: string[]): boolean {
    const key = String(row[16] || "");
    return /^[a-z]+_element_(pickup|character_pickup)_\d+/.test(key) && row[20] === "true";
}

// ── Get accumulated UP codes for 限定属性池 revival ────────────
// Collects UP chars from same-color previous series (01..N-1).
// For final-6 pools (1705-1710): collects ALL element-matched UPs
// from every banner + fes characters.
export function getAccumulatedUpCodes(
    gachaId: string,
    element: number | null,
    cdnGacha: Record<string, any>,
    cdnFeature: Record<string, any>,
    cdnChars: Record<string, any>,
    charTable: CharacterTableEntry[]
): Set<string> {
    const chars = new Set<string>();
    if (element === null) return chars;

    const currentRow = cdnGacha[gachaId]?.[0] as string[] | undefined;
    if (!currentRow) return chars;
    const currentKey = String(currentRow[16] || "");
    const currentStart = String(currentRow[29] || "2099-01-01");
    const isLastSix = FINAL_SIX_IDS.has(gachaId);

    // Extract series number from current pool key
    const selfMatch = currentKey.match(/^([a-z]+)_element_(pickup|character_pickup)_(\d+)/);
    if (!selfMatch) return chars;
    const color = selfMatch[1];
    const currentSeries = parseInt(selfMatch[3]);

    for (const [otherGid, rows] of Object.entries(cdnGacha)) {
        const otherRow = rows[0] as string[] | undefined;
        if (!otherRow || otherGid === gachaId) continue;

        const otherKey = String(otherRow[16] || "");
        const otherStart = String(otherRow[29] || "2000-01-01");
        if (otherStart >= currentStart) continue;

        let upSet: Set<string>;

        if (isLastSix) {
            // Last 6: collect ALL element-matched UPs from ALL banner types
            upSet = extractUpChars(otherGid, cdnGacha, cdnFeature, cdnChars);
            const filtered = new Set<string>();
            for (const code of upSet) {
                if (getCharElement(code, cdnChars) === element) filtered.add(code);
            }
            upSet = filtered;
        } else {
            // Regular: collect UPs from same-color previous series only
            const otherMatch = otherKey.match(/^([a-z]+)_element_(pickup|character_pickup)_(\d+)/);
            if (!otherMatch || otherMatch[1] !== color) continue;
            const otherSeries = parseInt(otherMatch[3]);
            if (otherSeries >= currentSeries) continue;
            upSet = extractUpChars(otherGid, cdnGacha, cdnFeature, cdnChars);
        }

        for (const code of upSet) chars.add(code);
    }

    // Last 6: also include element-matched fes characters
    if (isLastSix) {
        for (const fid of REVIVAL_FES_5STAR) {
            if (getCharElement(String(fid), cdnChars) === element) chars.add(String(fid));
        }

        // Filter: exclude 联动 characters, keep 常驻/限定 + unknown
        const filtered = new Set<string>();
        for (const code of chars) {
            const entry = charTable.find(c => String(c.code_number) === code);
            // Include if: not in char_table (unknown but legitimate), or source is NOT 联动
            if (!entry || entry.source !== "联动") {
                filtered.add(code);
            }
        }
        return filtered;
    }
    // Note: 联动 characters are NOT included — they are collab-only

    return chars;
}
