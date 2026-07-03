import { PoolItem, GachaBanner, CharacterTableEntry, EquipmentTableEntry } from "./types";
import { EQ_IDS, UP_TARGETS, FES_UP_ODDS, REVIVAL_FES_5STAR, FINAL_SIX_IDS } from "./constants";
import { buildPoolTemplate, buildEquipPoolTemplate, detectElement, detectEquipElement, getCharElement, equipTemplateCache } from "./template";
import { extractUpChars, isLimitedAttrPool, getAccumulatedUpCodes } from "./up-extract";

// ── Build a single banner ──────────────────────────────────────
export function buildBanner(
    gachaId: string,
    cdnGacha: Record<string, any>,
    fullPoolTemplate: Record<string, PoolItem[]>,
    cdnFeature: Record<string, any>,
    cdnChars: Record<string, any>,
    charTable: CharacterTableEntry[],
    equipTable: Record<string, EquipmentTableEntry>
): GachaBanner | null {
    const entry = cdnGacha[gachaId];
    if (!entry || !Array.isArray(entry) || entry.length === 0) return null;
    const row = entry[0] as string[];
    if (!Array.isArray(row) || row.length < 31) return null;

    // Parse metadata
    const gachaType = parseInt(row[9] || "0", 10); // 1=character, 2=equipment
    const name = String(row[1] || `Gacha ${gachaId}`);
    const singleCost = parseInt(row[5] || "150", 10);
    const multiCost = parseInt(row[6] || "1500", 10);
    const discountCost = parseInt(row[7] || "50", 10);
    const movieName = String(row[17] || "normal");
    const guaranteeMovie = String(row[18] || "normal_guarantee");
    const startDate = String(row[29] || "2000-01-01 00:00:00");
    const endDate = String(row[30] || "2099-01-01 00:00:00");

    // Detect equipment gacha
    const isEquipment =
        EQ_IDS.has(gachaId) ||
        name.includes("装备") || name.includes("武器") ||
        name.includes("武具") || name.startsWith("装备");

    const equipPoolKey5 = String(row[23] || "");

    if (isEquipment) {
        // Equipment pool
        const equipElement = detectEquipElement(equipPoolKey5);
        let equipPool: Record<string, PoolItem[]>;
        if (equipElement !== null) {
            if (!equipTemplateCache[equipElement]) {
                equipTemplateCache[equipElement] = buildEquipPoolTemplate(equipTable, equipElement);
            }
            equipPool = equipTemplateCache[equipElement];
        } else {
            if (!equipTemplateCache[-1]) {
                equipTemplateCache[-1] = buildEquipPoolTemplate(equipTable);
            }
            equipPool = equipTemplateCache[-1];
        }
        return {
            type: 1,
            paymentType: 0,
            singleCost: singleCost || 75,
            multiCost: multiCost || 750,
            discountCost: 25,
            startDate,
            endDate,
            name,
            pool: {
                "1": [...(equipPool["1"] || [])],
                "2": [...(equipPool["2"] || [])],
                "3": [...(equipPool["3"] || [])],
            },
        };
    }

    // Character banner — select correct template
    const poolKey5 = String(row[16] || "");
    const element = detectElement(poolKey5);
    const isLimitedAttr = isLimitedAttrPool(gachaId, row);
    const isLastSix = isLimitedAttr && FINAL_SIX_IDS.has(gachaId);
    const hasCdnUp = isLimitedAttr && extractUpChars(gachaId, cdnGacha, cdnFeature, cdnChars).size > 0;

    let poolTemplate = fullPoolTemplate;
    let tierNonUpBasis = fullPoolTemplate;
    if (isLimitedAttr) {
        if (hasCdnUp) {
            // New element pickup (has UP chars): use FULL template
        } else {
            // Revival (no CDN UP chars): use element-filtered template (build fresh)
            poolTemplate = buildPoolTemplate(charTable, cdnChars, element!, startDate);
            tierNonUpBasis = poolTemplate;
        }
    }

    const pool: Record<string, PoolItem[]> = {};
    for (const pk of ["1", "2", "3"] as const) {
        pool[pk] = poolTemplate[pk].map(item => ({ ...item }));
    }

    // Extract UP characters from CDN data
    const upCodes = extractUpChars(gachaId, cdnGacha, cdnFeature, cdnChars);

    // Filter UP characters by element for non-限定 attribute pools
    if (element !== null && !isLimitedAttr) {
        const filteredUps = new Set<string>();
        for (const code of upCodes) {
            const charElement = getCharElement(code, cdnChars);
            if (charElement === element) filteredUps.add(code);
        }
        upCodes.clear();
        for (const code of filteredUps) upCodes.add(code);
    }

    // 限定属性池復活: collect accumulated UP chars (always uniform odds)
    const accumulatedUps = new Set<string>();
    if (isLimitedAttr && !hasCdnUp) {
        for (const code of getAccumulatedUpCodes(gachaId, element, cdnGacha, cdnFeature, cdnChars, charTable)) {
            accumulatedUps.add(code);
        }
        // Last 6 also include element-matched fes characters
        if (isLastSix) {
            for (const fid of REVIVAL_FES_5STAR) {
                if (getCharElement(String(fid), cdnChars) === element) accumulatedUps.add(String(fid));
            }
            // Note: 联动 characters are NOT added — collab-only
        }
    }

    // Count UP per tier (CDN UPs only for odds calculation)
    const upByTier: Record<string, Set<string>> = { "1": new Set(), "2": new Set(), "3": new Set() };
    for (const code of upCodes) {
        const first = code[0];
        if (first in upByTier) {
            upByTier[first].add(code);
        }
    }

    // Calculate UP odds per tier
    const isFesRevival = poolKey5.startsWith("revival_fes_");
    const tierOdds: Record<string, number> = {};

    for (const pk of ["1", "2"]) {
        const tierUpCount = upByTier[pk].size;
        if (tierUpCount === 0) continue;

        if (isFesRevival && FES_UP_ODDS[tierUpCount] !== undefined) {
            tierOdds[pk] = FES_UP_ODDS[tierUpCount];
        } else if (isLimitedAttr && !hasCdnUp) {
            continue;
        } else {
            const target = UP_TARGETS[pk]?.[tierUpCount];
            if (target === undefined) continue;
            const tierNonUp = tierNonUpBasis[pk].length;
            const denom = 1 - target * tierUpCount;
            tierOdds[pk] = denom > 0
                ? Math.max(1, Math.round(tierNonUp * target / denom))
                : 50;
        }
    }

    // Apply CDN UP characters to pool (with rate-up odds)
    for (const code of upCodes) {
        const codeStr = String(code);
        const first = codeStr[0];
        let pk: string, rank: number;
        if (first === "1") { pk = "1"; rank = 5; }
        else if (first === "2") { pk = "2"; rank = 4; }
        else if (first === "3") { pk = "3"; rank = 3; }
        else continue;

        const charId = parseInt(codeStr, 10);
        if (isNaN(charId)) continue;

        pool[pk] = pool[pk].filter(item => item.id !== charId);

        const isUp = pk in tierOdds;
        pool[pk].push({
            id: charId,
            rank,
            odds: isUp ? tierOdds[pk] : 1,
            isRateUp: isUp,
            rarity: 100,
        });
    }

    // Apply accumulated UP characters (always uniform odds, no rate-up)
    for (const code of accumulatedUps) {
        if (upCodes.has(code)) continue;
        const codeStr = String(code);
        const first = codeStr[0];
        let pk: string, rank: number;
        if (first === "1") { pk = "1"; rank = 5; }
        else if (first === "2") { pk = "2"; rank = 4; }
        else if (first === "3") { pk = "3"; rank = 3; }
        else continue;

        const charId = parseInt(codeStr, 10);
        if (isNaN(charId)) continue;

        pool[pk] = pool[pk].filter(item => item.id !== charId);

        pool[pk].push({
            id: charId,
            rank,
            odds: 1,
            isRateUp: false,
            rarity: 100,
        });
    }

    // Revival Fes: inject all historical fes ★5 characters
    if (poolKey5.startsWith("revival_fes_")) {
        const revivalOdds = FES_UP_ODDS[19] ?? 21;
        for (const fid of REVIVAL_FES_5STAR) {
            if (!pool["1"].some(item => item.id === fid)) {
                pool["1"].push({
                    id: fid,
                    rank: 5,
                    odds: revivalOdds,
                    isRateUp: true,
                    rarity: 100,
                });
            }
        }
    }

    // Recalculate rarity values: sum per tier ≈ 1000
    for (const pk of ["1", "2", "3"] as const) {
        const items = pool[pk];
        if (items.length === 0) continue;
        const totalWeight = items.reduce((sum, item) => sum + item.odds, 0);
        const base = totalWeight > 0 ? 1000 / totalWeight : 1;
        for (const item of items) {
            item.rarity = Math.round(item.odds * base * 100) / 100;
        }
    }

    // Skip empty banners
    const totalChars = Object.values(pool).reduce((sum, items) => sum + items.length, 0);
    if (totalChars === 0) return null;

    return {
        type: gachaType === 1 ? 0 : 1,
        paymentType: 0,
        singleCost,
        multiCost,
        discountCost,
        movieName,
        guaranteeMovieName: guaranteeMovie,
        startDate,
        endDate,
        name,
        pool: Object.fromEntries(
            Object.entries(pool).filter(([, items]) => items.length > 0)
        ),
    };
}
