/**
 * Rebuild assets/gacha.json from CDN source data + character_table.json.
 * Replaces scripts/generate_gacha.py with TypeScript toolchain.
 *
 * Usage: npx tsx tools/rebuild_gacha.ts
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

// ── Data sources ──────────────────────────────────────────────
const CHAR_TABLE_PATH = path.join(ROOT, "data/character_table.json");
const EQUIP_TABLE_PATH = path.join(ROOT, "data/equipment_table.json");
const CDN_GACHA_PATH = path.join(ROOT, "assets/cdndata/gacha.json");
const CDN_FC_PATH = path.join(ROOT, "assets/cdndata/gacha_feature_content.json");
const CDN_CHARS_PATH = path.join(ROOT, "assets/cdndata/character.json");
const OUTPUT_PATH = path.join(ROOT, "assets/gacha.json");
const OLD_GACHA_PATH = path.join(ROOT, "assets/gacha_old.json");
const PYTHON_GACHA_PATH = path.join(ROOT, "assets/gacha_python.json");
const GLOBAL_GACHA_PATH = path.join(ROOT, "..", "starpoint", "assets", "gacha.json");

// CN launch date — removed floorDate from pool templates, now per-banner asOfDate only

// ── Types ─────────────────────────────────────────────────────
interface PoolItem {
    id: number;
    rank: number;
    odds: number;
    isRateUp: boolean;
    rarity: number;
}

interface GachaBanner {
    type: number;
    paymentType: number;
    singleCost: number;
    multiCost: number;
    discountCost: number;
    movieName?: string;
    guaranteeMovieName?: string;
    startDate: string;
    endDate: string;
    name: string;
    pool: Record<string, PoolItem[]>;
}

interface CharacterTableEntry {
    name: string;
    code_number: string;
    code_name: string;
    rarity: number;
    source: string;
    available_from?: string;
}

// ── Constants ─────────────────────────────────────────────────
// Equipment gacha IDs (from Python script)
const EQ_IDS = new Set([
    "3", "5000", "5001", "5002", "5003", "5004", "5005", "5006", "5007", "5008",
    "5009", "5010", "5011", "5012", "5013", "5014", "5015", "5016", "5017", "5018",
    "5019", "5020", "5021", "5022", "5023", "5024", "5025", "5026", "5027", "5028",
    "5029", "5030", "5031", "5032", "5033", "5034", "5035", "5036", "5037", "5038",
]);

// Equipment pool built from equipment_table.json + element filtering
interface EquipmentTableEntry {
    name: string;
    rarity: number;
    element: string;
    source: string;
}

const ELEM_NAME_TO_INDEX: Record<string, number> = {
    '火': 0, '水': 1, '雷': 2, '风': 3, '光': 4, '暗': 5, '全': -1,
};

// Equipment element pool key patterns (same keywords as character element banners)
const EQUIP_ELEMENT_PATTERNS: [string[], number][] = [
    [["equipment_red", "equipment_fire"], 0],
    [["equipment_blue", "equipment_water"], 1],
    [["equipment_yellow", "equipment_thunder"], 2],
    [["equipment_green", "equipment_wind"], 3],
    [["equipment_white", "equipment_light"], 4],
    [["equipment_black", "equipment_dark"], 5],
];

// Equipment template cache
const equipTemplateCache: Record<number, Record<string, PoolItem[]>> = {};

function buildEquipPoolTemplate(
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
            rarity: 0, // recalculated below
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

function detectEquipElement(poolKey: string): number | null {
    for (const [keywords, element] of EQUIP_ELEMENT_PATTERNS) {
        for (const kw of keywords) {
            if (poolKey.includes(kw)) return element;
        }
    }
    return null;
}

// UP probability targets (within-tier probability per UP char)
// ★5: single=1.5%→÷5%=0.30, double=1.0%→÷5%=0.20, triple=0.7%→÷5%=0.14
// ★4: single=2.5%→÷25%=0.10, double=2.0%→÷25%=0.08
const UP_TARGETS: Record<string, Record<number, number>> = {
    "1": { 1: 0.30, 2: 0.20, 3: 0.14, 4: 0.10 },
    "2": { 1: 0.10, 2: 0.08 },
};

// Fes gacha actual odds (verified in-game 2026-07-04)
// 3 UP: UP 0.700% / normal 0.025% = 28
// 4 UP: UP 0.500% / normal 0.030% = 17
// 19 UP (revival): UP 0.300% / normal 0.014% = 21
const FES_UP_ODDS: Record<number, number> = {
    3: 28,
    4: 17,
    19: 21,
};

// Revival Fes pool — all historical fes ★5 limited characters
// These are NOT in CDN columns [21-28] because the pool key `revival_fes_1_character_5`
// references an external CDN pool file that's not available locally.
// Derived from the union of UP characters across all 12 non-revival fes banners.
const REVIVAL_FES_5STAR = [
    111147, 111165, 121141, 121153, 121177, 131152, 131170, 141165, 141183, 141201,
    151129, 151147, 151153, 151165, 151182, 161153, 161159, 161177, 161201,
];

// Final 6 限定属性池 (1705-1710): element revival pools at CN EOS
const FINAL_SIX_IDS = new Set(["1705", "1706", "1707", "1708", "1709", "1710"]);

// Characters reported as un-pullable (user's report from 2026-07-01)
// Format: character_id → name
const REPORTED_MISSING: Record<string, string> = {
    "211026": "特蕾涅(圣红剑)",
    "311006": "特蕾涅3★(红剑)",
    "221022": "崔丝塔(春伞)",
    "221011": "杰拉尔(泳骑)",
    "231008": "阿德尼(雷策)",
    "211011": "米尔米娜(武术家)",
    "241006": "蕾贝卡(风兔子)",
    "351015": "可莉娜(万圣光奶)",
};

// ── Element mapping ──────────────────────────────────────────────
// CDN character.json [3] = element: 0=fire, 1=water, 2=thunder, 3=wind, 4=light, 5=dark
// Pool key keyword → element index
const ELEMENT_PATTERNS: [string[], number][] = [
    [["red_element", "red_character", "fire_"], 0],
    [["blue_element", "blue_character", "water_"], 1],
    [["yellow_element", "thunder_element", "thunder_character", "yellow_character"], 2],
    [["green_element", "green_character", "wind_"], 3],
    [["white_element", "white_character", "light_"], 4],
    [["black_element", "black_character", "dark_"], 5],
];

function getCharElement(code: string, cdnChars: Record<string, any>): number | null {
    const data = cdnChars[code];
    if (!data || !Array.isArray(data) || data.length === 0) return null;
    const row = Array.isArray(data[0]) ? data[0] : data;
    return row[3] !== undefined ? parseInt(String(row[3]), 10) : null;
}

function detectElement(poolKey: string): number | null {
    for (const [keywords, element] of ELEMENT_PATTERNS) {
        for (const kw of keywords) {
            if (poolKey.includes(kw)) return element;
        }
    }
    return null;
}

// ── Step 1: Build pool template from character_table.json ──────
function buildPoolTemplate(
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

// ── Step 2: Extract UP characters per banner ──────────────────
function extractUpChars(
    gachaId: string,
    cdnGacha: Record<string, any>,
    cdnFeature: Record<string, any>,
    cdnChars: Record<string, any>
): Set<string> {
    const chars = new Set<string>();

    // 2a. From gacha_feature_content.json
    if (cdnFeature[gachaId]) {
        for (const sections of Object.values(cdnFeature[gachaId])) {
            if (!Array.isArray(sections)) continue;
            for (const row of sections as any[]) {
                if (!Array.isArray(row)) continue;
                for (const cell of row) {
                    const s = String(cell);
                    // 6-digit character code, no leading zero, exists in CDN table
                    if (s.length === 6 && /^\d+$/.test(s) && s[0] !== "0" && cdnChars[s]) {
                        chars.add(s);
                    }
                }
            }
        }
    }

    // 2b. From cdndata/gacha.json columns [21,22,23,26,27,28]
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
                // Accept 5-6 digit IDs that exist in CDN character table
                if ((s.length === 5 || s.length === 6) && /^\d+$/.test(s) && cdnChars[s]) {
                    chars.add(s);
                }
            }
        }
    }

    return chars;
}


// ── Detect 限定属性池 (limited attribute pickup revival) ──────────
// Returns true if pool key matches {color}_element_{pickup|character_pickup}_{N}
// and col20 === "true" (use_pickup flag).
function isLimitedAttrPool(gachaId: string, row: string[]): boolean {
    const key = String(row[16] || "");
    return /^[a-z]+_element_(pickup|character_pickup)_\d+/.test(key) && row[20] === "true";
}

// ── Get accumulated UP codes for 限定属性池 ───────────────────────
// For series N: collects UP chars from same-color series 01..N-1.
// For final-6 (1705-1710): also collects ALL element-matched UPs from every banner.
function getAccumulatedUpCodes(
    gachaId: string,
    element: number | null,
    cdnGacha: Record<string, any>,
    cdnFeature: Record<string, any>,
    cdnChars: Record<string, any>
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
            // 最后6池: collect ALL element-matched UPs from ALL banner types
            upSet = extractUpChars(otherGid, cdnGacha, cdnFeature, cdnChars);
            const filtered = new Set<string>();
            for (const code of upSet) {
                if (getCharElement(code, cdnChars) === element) filtered.add(code);
            }
            upSet = filtered;
        } else {
            // 常规限定属性池: collect UPs from same-color previous series only
            const otherMatch = otherKey.match(/^([a-z]+)_element_(pickup|character_pickup)_(\d+)/);
            if (!otherMatch || otherMatch[1] !== color) continue;
            const otherSeries = parseInt(otherMatch[3]);
            if (otherSeries >= currentSeries) continue;
            upSet = extractUpChars(otherGid, cdnGacha, cdnFeature, cdnChars);
        }

        for (const code of upSet) chars.add(code);
    }

    return chars;
}

// ── Step 3: Build a single banner ──────────────────────────────
function buildBanner(
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

    // Equipment pool key (columns 21-23 for equipment, vs 14-16 for characters)
    const equipPoolKey5 = String(row[23] || "");

    if (isEquipment) {
        // Equipment pool: use equipment_table.json with element filtering
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
            // poolTemplate and tierNonUpBasis stay as fullPoolTemplate
        } else {
            // Revival (no CDN UP chars): use element-filtered template (build fresh per banner)
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

    // 限定属性池: collect accumulated UP chars (revival pools only, no CDN UP)
    const accumulatedUps = new Set<string>();
    if (isLimitedAttr && !hasCdnUp) {
        for (const code of getAccumulatedUpCodes(gachaId, element, cdnGacha, cdnFeature, cdnChars)) {
            accumulatedUps.add(code);
        }
        // 最后6池 also include element-matched fes + collab characters
        if (isLastSix) {
            for (const fid of REVIVAL_FES_5STAR) {
                if (getCharElement(String(fid), cdnChars) === element) accumulatedUps.add(String(fid));
            }
            // Include 联动 characters matching this element
            for (const char of charTable) {
                if (char.source !== "联动") continue;
                const code = String(char.code_number);
                if (!code) continue;
                const charElement = getCharElement(code, cdnChars);
                if (charElement === element) accumulatedUps.add(code);
            }
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
    // 流星祭復刻: use verified in-game odds; 限定属性池復活(no CDN UP): uniform (all odds=1)
    const isFesRevival = poolKey5.startsWith("revival_fes_");
    const tierOdds: Record<string, number> = {};

    for (const pk of ["1", "2"]) {
        const tierUpCount = upByTier[pk].size;
        if (tierUpCount === 0) continue;

        if (isFesRevival && FES_UP_ODDS[tierUpCount] !== undefined) {
            // 流星祭復刻: use verified in-game odds
            tierOdds[pk] = FES_UP_ODDS[tierUpCount];
        } else if (isLimitedAttr && !hasCdnUp) {
            // 限定属性池復活(no CDN UP): all uniform, no accumulated UPs with rate-up
            continue;
        } else {
            // General formula: w = tier_non_up × target / (1 - target × tier_up_count)
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

        // Remove existing entry with same ID from pool (if permanent)
        pool[pk] = pool[pk].filter(item => item.id !== charId);

        // ★3: no rate-up, treat as normal
        const isUp = pk in tierOdds;
        pool[pk].push({
            id: charId,
            rank,
            odds: isUp ? tierOdds[pk] : 1,
            isRateUp: isUp,
            rarity: 100, // placeholder, recalculated below
        });
    }

    // Apply accumulated UP characters (always uniform odds, no rate-up)
    // These include: 限定属性池 revival accumulated UPs + 最后6池 element-matched UPs
    for (const code of accumulatedUps) {
        if (upCodes.has(code)) continue; // skip if already added as CDN UP
        const codeStr = String(code);
        const first = codeStr[0];
        let pk: string, rank: number;
        if (first === "1") { pk = "1"; rank = 5; }
        else if (first === "2") { pk = "2"; rank = 4; }
        else if (first === "3") { pk = "3"; rank = 3; }
        else continue;

        const charId = parseInt(codeStr, 10);
        if (isNaN(charId)) continue;

        // Remove existing entry with same ID from pool
        pool[pk] = pool[pk].filter(item => item.id !== charId);

        pool[pk].push({
            id: charId,
            rank,
            odds: 1,
            isRateUp: false,
            rarity: 100,
        });
    }

    // Revival Fes: inject all historical fes ★5 characters into the pool
    // These banners reference `revival_fes_1_character_5` which is an external CDN pool file
    if (poolKey5.startsWith("revival_fes_")) {
        const revivalOdds = FES_UP_ODDS[19] ?? 21;
        for (const fid of REVIVAL_FES_5STAR) {
            // Only add if not already in pool (avoid duplicates)
            if (!pool["1"].some(item => item.id === fid)) {
                pool["1"].push({
                    id: fid,
                    rank: 5,
                    odds: revivalOdds,
                    isRateUp: true,
                    rarity: 100,    // placeholder, recalculated below
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
        type: gachaType === 1 ? 0 : 1, // Map CN type to global: 1→0(char), 2→1(eq)
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

// ── Step 4: L1 — Validate template completeness ────────────────
function validateL1(
    template: Record<string, PoolItem[]>,
    charTable: CharacterTableEntry[]
): string[] {
    const errors: string[] = [];
    const permanent = charTable.filter(c => c.source === "常驻卡池" && c.code_number);

    for (const c of permanent) {
        const code = String(c.code_number);
        const first = code[0];
        const pk = first === "1" ? "1" : first === "2" ? "2" : first === "3" ? "3" : null;
        if (!pk || !template[pk]) {
            errors.push(`TIER_UNKNOWN: ${c.name}(${c.code_number}) first_digit=${first}`);
            continue;
        }
        if (!template[pk].some(p => p.id === parseInt(code, 10))) {
            errors.push(`MISSING_IN_TEMPLATE: ${c.name}(${c.code_number}) tier=${pk}`);
        }
    }

    return errors;
}

// ── Step 5: L2 — Full validation of each banner ────────────────
function validateL2(
    gachaId: string,
    banner: GachaBanner,
    expectedTemplate: Record<string, PoolItem[]>,
    permanentSet: Set<number>,
    upSet: Set<string>,
    isFesBanner: boolean = false,
    isLimitedAttrRevival: boolean = false
): string[] {
    if (banner.type !== 0) return []; // Equipment banners skip

    const errors: string[] = [];

    for (const pk of ["1", "2", "3"] as const) {
        const permanentIds = expectedTemplate[pk].map(p => p.id);
        const upIdsInTier = new Set<number>();
        for (const code of upSet) {
            if (code[0] === pk) {
                const id = parseInt(code, 10);
                if (!isNaN(id)) upIdsInTier.add(id);
            }
        }

        const expectedIds = new Set([...permanentIds, ...upIdsInTier]);
        const actualItems = banner.pool[pk] || [];
        const actualIds = new Set(actualItems.map(i => i.id));

        // 5a. Count
        if (expectedIds.size !== actualIds.size) {
            const missing = [...expectedIds].filter(id => !actualIds.has(id)).slice(0, 10);
            const extra = [...actualIds].filter(id => !expectedIds.has(id)).slice(0, 10);
            errors.push(
                `SIZE gid=${gachaId} tier=${pk} exp=${expectedIds.size} act=${actualIds.size}` +
                (missing.length ? ` missing=[${missing.join(",")}]` : "") +
                (extra.length ? ` extra=[${extra.join(",")}]` : "")
            );
        }

        // 5b. Members
        for (const id of expectedIds) {
            if (!actualIds.has(id)) {
                errors.push(`MISSING gid=${gachaId} tier=${pk} id=${id}`);
            }
        }
        for (const id of actualIds) {
            if (!expectedIds.has(id)) {
                errors.push(`EXTRA gid=${gachaId} tier=${pk} id=${id}`);
            }
        }

        // 5c. UP marks — 限定属性池復活: always uniform (no rate-up)
        const tierUpCount = upIdsInTier.size;
        const target = UP_TARGETS[pk]?.[tierUpCount];
        const fesOdds = isFesBanner ? FES_UP_ODDS[tierUpCount] : undefined;
        const hasRateUp = !isLimitedAttrRevival && pk !== "3" && (target !== undefined || fesOdds !== undefined);

        for (const item of actualItems) {
            const inUpSet = upIdsInTier.has(item.id);
            const expIsUp = inUpSet && hasRateUp;
            if (item.isRateUp !== expIsUp) {
                errors.push(`UP_MARK gid=${gachaId} tier=${pk} id=${item.id} exp=${expIsUp} act=${item.isRateUp}`);
            }
            // Odds validation
            if (expIsUp && fesOdds !== undefined) {
                // Fes banner: expect exact odds
                if (item.odds !== fesOdds) {
                    errors.push(`ODDS_FES gid=${gachaId} tier=${pk} id=${item.id} odds=${item.odds} exp=${fesOdds}`);
                }
            } else if (!expIsUp) {
                if (item.odds !== 1) {
                    errors.push(`ODDS gid=${gachaId} tier=${pk} id=${item.id} odds=${item.odds} exp=1`);
                }
            }
        }

        // 5d. Rarity sum ≈ 1000
        const sum = actualItems.reduce((s, item) => s + item.rarity, 0);
        if (Math.abs(sum - 1000) > 5 && actualItems.length > 0) {
            errors.push(`RARITY gid=${gachaId} tier=${pk} sum=${sum.toFixed(1)}`);
        }
    }

    return errors;
}

// ── Step 6: L3 — Compare with old gacha.json ───────────────────
function validateL3(
    newGacha: Record<string, GachaBanner>,
    oldGacha: Record<string, GachaBanner> | null
): void {
    if (!oldGacha) {
        console.log("\n=== L3: COMPARISON SKIPPED (no old gacha.json) ===\n");
        return;
    }

    console.log("\n=== L3: COMPARISON WITH OLD gacha.json ===\n");

    // 6a. Check reported-missing characters
    console.log("Reported-missing characters:");
    const allNewIds = new Map<number, Set<string>>();
    for (const [gid, banner] of Object.entries(newGacha)) {
        if (banner.type !== 0) continue;
        for (const items of Object.values(banner.pool)) {
            for (const item of items) {
                if (!allNewIds.has(item.id)) allNewIds.set(item.id, new Set());
                allNewIds.get(item.id)!.add(gid);
            }
        }
    }

    for (const [id, name] of Object.entries(REPORTED_MISSING)) {
        const banners = allNewIds.get(parseInt(id));
        if (banners && banners.size > 0) {
            console.log(`  ${id}(${name}): FIXED ✓ (in ${banners.size} banners)`);
        } else {
            console.log(`  ${id}(${name}): STILL MISSING ✗`);
        }
    }

    // 6b. Check for lost characters (present in old, missing in new)
    let lostCount = 0;
    const lostChars = new Map<number, Set<string>>();
    for (const [gid, oldB] of Object.entries(oldGacha)) {
        if (oldB.type !== 0) continue;
        const newB = newGacha[gid];
        if (!newB) continue;
        for (const pk of ["1", "2", "3"] as const) {
            const oldIds = new Set((oldB.pool[pk] || []).map(i => i.id));
            const newIds = new Set((newB.pool[pk] || []).map(i => i.id));
            for (const id of oldIds) {
                if (!newIds.has(id)) {
                    lostCount++;
                    if (!lostChars.has(id)) lostChars.set(id, new Set());
                    lostChars.get(id)!.add(gid);
                }
            }
        }
    }
    if (lostCount > 0) {
        console.log(`\nLOST characters (${lostCount} occurrences):`);
        for (const [id, bSet] of lostChars) {
            console.log(`  id=${id} from banners [${[...bSet].slice(0, 5).join(",")}${bSet.size > 5 ? "..." : ""}]`);
        }
    } else {
        console.log("\nNo characters lost. ✓");
    }

    // 6c. Banner pool size changes
    const oldKeys = Object.keys(oldGacha);
    const newKeys = Object.keys(newGacha);
    const commonKeys = oldKeys.filter(k => newKeys.includes(k) && newGacha[k].type === 0);

    let changedBanners = 0;
    for (const gid of commonKeys.slice(0, 30)) {
        const old = oldGacha[gid], nw = newGacha[gid];
        const changes: string[] = [];
        for (const pk of ["1", "2", "3"] as const) {
            const oLen = old.pool[pk]?.length || 0;
            const nLen = nw.pool[pk]?.length || 0;
            if (oLen !== nLen) changes.push(`${pk}:${oLen}→${nLen}`);
        }
        if (changes.length > 0) {
            changedBanners++;
            console.log(`  gid=${gid} "${nw.name}" ${changes.join(" ")}`);
        }
    }
    if (commonKeys.length > 30) {
        console.log(`  ... and ${commonKeys.length - 30} more banners`);
    }
    console.log(`\nBanners with pool changes: ${changedBanners}/${commonKeys.length}`);

    // 6d. New banners (in new but not old)
    const newBanners = newKeys.filter(k => !oldKeys.includes(k) && newGacha[k].type === 0);
    if (newBanners.length > 0) {
        console.log(`\nNEW banners (${newBanners.length}):`);
        for (const gid of newBanners.slice(0, 10)) {
            const b = newGacha[gid];
            console.log(`  ${gid}: "${b.name}" ★5=${b.pool["1"]?.length || 0} ★4=${b.pool["2"]?.length || 0} ★3=${b.pool["3"]?.length || 0}`);
        }
    }

    // 6e. Removed banners (in old but not new)
    const removedBanners = oldKeys.filter(k => !newKeys.includes(k) && oldGacha[k].type === 0);
    if (removedBanners.length > 0) {
        console.log(`\nREMOVED banners (${removedBanners.length}):`);
        for (const gid of removedBanners.slice(0, 10)) {
            console.log(`  ${gid}: "${oldGacha[gid].name}"`);
        }
    }
}

// ── Main ───────────────────────────────────────────────────────
function main() {
    console.log("=== Rebuild gacha.json ===\n");
    console.log("Loading data sources...");

    const charTable: CharacterTableEntry[] = JSON.parse(
        fs.readFileSync(CHAR_TABLE_PATH, "utf-8")
    );
    const cdnGacha: Record<string, any> = JSON.parse(
        fs.readFileSync(CDN_GACHA_PATH, "utf-8")
    );
    const cdnFeature: Record<string, any> = JSON.parse(
        fs.readFileSync(CDN_FC_PATH, "utf-8")
    );
    const cdnChars: Record<string, any> = JSON.parse(
        fs.readFileSync(CDN_CHARS_PATH, "utf-8")
    );
    const oldGacha: Record<string, GachaBanner> | null = fs.existsSync(OLD_GACHA_PATH)
        ? JSON.parse(fs.readFileSync(OLD_GACHA_PATH, "utf-8"))
        : null;

    const equipTable: Record<string, EquipmentTableEntry> = JSON.parse(
        fs.readFileSync(EQUIP_TABLE_PATH, "utf-8")
    );

    console.log(`  character_table: ${charTable.length} entries`);
    console.log(`  equipment_table: ${Object.keys(equipTable).length} entries`);
    console.log(`  cdndata/gacha: ${Object.keys(cdnGacha).length} entries`);
    console.log(`  cdndata/gacha_feature_content: ${Object.keys(cdnFeature).length} entries`);
    console.log(`  cdndata/character: ${Object.keys(cdnChars).length} entries`);
    console.log(`  old gacha.json (comparison): ${oldGacha ? Object.keys(oldGacha).length + " banners" : "N/A"}`);

    // ── Build pool template
    const template = buildPoolTemplate(charTable, cdnChars, undefined, undefined);
    console.log(`\nTemplate pool: ★5=${template["1"].length} ★4=${template["2"].length} ★3=${template["3"].length}` +
        ` total=${template["1"].length + template["2"].length + template["3"].length}`);

    // ── L1: Template validation
    console.log("\n--- L1: Template Validation ---");
    const l1Errors = validateL1(template, charTable);
    if (l1Errors.length > 0) {
        console.error("L1 FAILED:");
        l1Errors.forEach(e => console.error(`  ${e}`));
        process.exit(1);
    }
    console.log(`  ✓ All ${charTable.filter(c => c.source === "常驻卡池").length} permanent characters in template`);

    // ── Build all banners
    console.log("\n--- Building Banners ---");
    const output: Record<string, GachaBanner> = {};
    const upCache: Record<string, Set<string>> = {};
    const fesCache: Record<string, boolean> = {};
    const limitedAttrRevivalCache: Record<string, boolean> = {};
    const expectedTemplateCache: Record<string, Record<string, PoolItem[]>> = {};
    let skipped = 0;
    let equipCount = 0;
    let charCount = 0;

    for (const gid of Object.keys(cdnGacha)) {
        const banner = buildBanner(gid, cdnGacha, template, cdnFeature, cdnChars, charTable, equipTable);
        if (!banner) { skipped++; continue; }

        output[gid] = banner;

        // Compute UP cache and expected template (must match buildBanner logic)
        const rawUp = extractUpChars(gid, cdnGacha, cdnFeature, cdnChars);
        const cdnRow = cdnGacha[gid]?.[0] as string[] | undefined;
        const pk5 = cdnRow ? String(cdnRow[16] || "") : "";
        const startDate = cdnRow ? String(cdnRow[29] || "") : "";
        const elem = detectElement(pk5);
        const isLimited = cdnRow ? isLimitedAttrPool(gid, cdnRow) : false;
        const isLastSix = isLimited && FINAL_SIX_IDS.has(gid);

        fesCache[gid] = pk5.startsWith("revival_fes_");
        limitedAttrRevivalCache[gid] = isLimited && !rawUp.size; // 限定属性池復活 (no CDN UP)

        if (isLimited) {
            // 限定属性池
            const hasCdnUp = rawUp.size > 0;
            if (hasCdnUp) {
                // New element pickup: full template + CDN UPs only
                expectedTemplateCache[gid] = template;
                upCache[gid] = rawUp;
            } else {
                // Revival: element-filtered template + accumulated UPs only (build fresh)
                expectedTemplateCache[gid] = elem !== null
                    ? buildPoolTemplate(charTable, cdnChars, elem, startDate)
                    : template;
                const accumulated = getAccumulatedUpCodes(gid, elem, cdnGacha, cdnFeature, cdnChars);
                if (isLastSix) {
                    for (const fid of REVIVAL_FES_5STAR) {
                        if (getCharElement(String(fid), cdnChars) === elem) accumulated.add(String(fid));
                    }
                    // Include 联动 characters matching this element
                    for (const char of charTable) {
                        if (char.source !== "联动") continue;
                        const code = String(char.code_number);
                        if (!code) continue;
                        const charElement = getCharElement(code, cdnChars);
                        if (charElement === elem) accumulated.add(code);
                    }
                }
                upCache[gid] = accumulated;
            }
        } else if (elem !== null) {
            // 常驻属性池 or non-限定 element pool: filter UP by element, full template
            const filteredUps = new Set<string>();
            for (const code of rawUp) {
                const charElement = getCharElement(code, cdnChars);
                if (charElement === elem) filteredUps.add(code);
            }
            upCache[gid] = filteredUps;
            expectedTemplateCache[gid] = template;
        } else {
            upCache[gid] = rawUp;
            expectedTemplateCache[gid] = template;
        }

        // Revival Fes: inject known UP characters for L2 validation
        if (pk5.startsWith("revival_fes_")) {
            for (const fid of REVIVAL_FES_5STAR) {
                upCache[gid].add(String(fid));
            }
        }

        if (banner.type === 1) equipCount++;
        else charCount++;
    }

    console.log(`  Character banners: ${charCount}`);
    console.log(`  Equipment banners: ${equipCount}`);
    console.log(`  Skipped: ${skipped}`);

    // ── Build permanent ID set for validation
    const permanentSet = new Set<number>();
    for (const items of Object.values(template)) {
        for (const item of items) permanentSet.add(item.id);
    }

    // ── L2: Banner validation
    console.log("\n--- L2: Banner Validation ---");
    let l2TotalErrors = 0;
    const l2ErrorBanners: string[] = [];

    for (const gid of Object.keys(output)) {
        if (output[gid].type !== 0) continue;
        const errs = validateL2(gid, output[gid], expectedTemplateCache[gid], permanentSet, upCache[gid], fesCache[gid], limitedAttrRevivalCache[gid]);
        if (errs.length > 0) {
            l2TotalErrors += errs.length;
            l2ErrorBanners.push(gid);
            if (l2ErrorBanners.length <= 5) {
                for (const e of errs) console.error(`  ${e}`);
            }
        }
    }

    if (l2TotalErrors > 0) {
        if (l2ErrorBanners.length > 5) {
            console.error(`  ... and ${l2ErrorBanners.length - 5} more banners with errors`);
        }
        console.error(`\nL2 FAILED: ${l2TotalErrors} errors in ${l2ErrorBanners.length} banners`);
        process.exit(1);
    }
    console.log(`  ✓ All ${charCount} character banners validated (${Object.keys(output).filter(k => output[k].type === 0).length} total)`);

    // ── L3: Compare with old gacha.json
    validateL3(output, oldGacha);

    // ── L4: Missing character report ────────────────────────────
    console.log("\n--- L4: Characters NOT in any gacha pool ---");
    const allCharIds = new Set<number>();
    for (const [gid, banner] of Object.entries(output)) {
        if (banner.type !== 0) continue;
        for (const items of Object.values(banner.pool)) {
            for (const item of items) allCharIds.add(item.id);
        }
    }

    let missingPermCount = 0;
    for (const char of charTable) {
        if (char.source !== "常驻卡池") continue;
        const id = parseInt(String(char.code_number));
        if (!allCharIds.has(id)) {
            missingPermCount++;
            console.log(`  MISSING permanent: ${char.code_number} ${char.name} ★${char.rarity}`);
        }
    }

    // Also list non-gacha characters (赠送/教程/特殊)
    const nonGachaChars = charTable.filter(c => c.source !== "常驻卡池" && c.source !== "限定卡池" && c.source !== "联动");
    console.log(`\n  Permanent chars missing from all pools: ${missingPermCount}`);
    console.log(`  Non-gacha characters (赠送/教程/其他):`);
    for (const char of nonGachaChars) {
        console.log(`    ${char.code_number} ${char.name} ★${char.rarity} source=${char.source}`);
    }

    // ── L5: Three-source comparison (old CN / global / new) ─────
    console.log("\n--- L5: Three-source comparison ---");
    const globalExists = fs.existsSync(GLOBAL_GACHA_PATH);
    if (globalExists) {
        const globalGacha: Record<string, GachaBanner> = JSON.parse(fs.readFileSync(GLOBAL_GACHA_PATH, "utf-8"));
        const globalB1 = globalGacha["1"];
        if (globalB1 && globalB1.pool) {
            const global5 = new Set((globalB1.pool["1"] || []).map(i => i.id));
            const global4 = new Set((globalB1.pool["2"] || []).map(i => i.id));
            const global3 = new Set((globalB1.pool["3"] || []).map(i => i.id));
            const globalAll = new Set([...global5, ...global4, ...global3]);

            const oldExists = fs.existsSync(OLD_GACHA_PATH);
            let oldAll: Set<number> = new Set();
            if (oldExists) {
                const oldGacha = JSON.parse(fs.readFileSync(OLD_GACHA_PATH, "utf-8")) as Record<string, GachaBanner>;
                const oldB1 = oldGacha["1"];
                if (oldB1 && oldB1.pool) {
                    for (const items of Object.values(oldB1.pool)) {
                        for (const item of items) oldAll.add(item.id);
                    }
                }
            }

            const newB1 = output["1"];
            const newAll = new Set<number>();
            if (newB1 && newB1.pool) {
                for (const items of Object.values(newB1.pool)) {
                    for (const item of items) newAll.add(item.id);
                }
            }

            console.log(`  Global banner1 permanent: ★5=${global5.size} ★4=${global4.size} ★3=${global3.size} total=${globalAll.size}`);
            console.log(`  Old CN banner1 permanent: ${oldAll.size}`);
            console.log(`  New CN banner1 permanent: ${newAll.size}`);
        }
    } else {
        console.log("  Global gacha.json not found, skipped.");
    }

    // ── L6: Python version comparison ──────────────────────────
    console.log("\n--- L6: Python version comparison ---");
    if (fs.existsSync(PYTHON_GACHA_PATH)) {
        const pyGacha: Record<string, GachaBanner> = JSON.parse(
            fs.readFileSync(PYTHON_GACHA_PATH, "utf-8")
        );
        const tsKeys = Object.keys(output).filter(k => output[k].type === 0);
        const pyKeys = Object.keys(pyGacha).filter(k => pyGacha[k].type === 0);
        const commonKeys = tsKeys.filter(k => pyKeys.includes(k));
        const tsOnly = tsKeys.filter(k => !pyKeys.includes(k));
        const pyOnly = pyKeys.filter(k => !tsKeys.includes(k));

        console.log(`  TS character banners: ${tsKeys.length}`);
        console.log(`  PY character banners: ${pyKeys.length}`);
        console.log(`  Common: ${commonKeys.length}, TS-only: ${tsOnly.length}, PY-only: ${pyOnly.length}`);

        if (tsOnly.length > 0) {
            console.log(`  TS-only banners (${tsOnly.length}):`);
            for (const gid of tsOnly.slice(0, 10)) {
                console.log(`    ${gid}: "${output[gid].name}"`);
            }
        }
        if (pyOnly.length > 0) {
            console.log(`  PY-only banners (${pyOnly.length}):`);
            for (const gid of pyOnly.slice(0, 10)) {
                console.log(`    ${gid}: "${pyGacha[gid].name}"`);
            }
        }

        // Per-banner pool comparison
        let diffBanners = 0;
        let totalDiffs = 0;
        for (const gid of commonKeys) {
            const ts = output[gid], py = pyGacha[gid];
            const diffs: string[] = [];
            for (const pk of ["1", "2", "3"] as const) {
                const tsIds = new Set((ts.pool[pk] || []).map(i => i.id));
                const pyIds = new Set((py.pool[pk] || []).map(i => i.id));
                const tsOnly2 = [...tsIds].filter(id => !pyIds.has(id));
                const pyOnly2 = [...pyIds].filter(id => !tsIds.has(id));
                if (tsIds.size !== pyIds.size || tsOnly2.length > 0 || pyOnly2.length > 0) {
                    diffs.push(`tier${pk}: ${tsIds.size}vs${pyIds.size}` +
                        (tsOnly2.length ? ` TSextra=${tsOnly2.length}` : "") +
                        (pyOnly2.length ? ` PYextra=${pyOnly2.length}` : ""));
                    totalDiffs++;
                }
            }
            if (diffs.length > 0) {
                diffBanners++;
                if (diffBanners <= 20) {
                    console.log(`  DIFF gid=${gid} "${ts.name}": ${diffs.join(" | ")}`);
                    // Show sample IDs
                    for (const pk of ["1", "2", "3"] as const) {
                        const tsIds = new Set((ts.pool[pk] || []).map(i => i.id));
                        const pyIds = new Set((py.pool[pk] || []).map(i => i.id));
                        const tsOnly2 = [...tsIds].filter(id => !pyIds.has(id));
                        const pyOnly2 = [...pyIds].filter(id => !tsIds.has(id));
                        if (tsOnly2.length > 0) console.log(`    TS extra: [${tsOnly2.join(",")}]`);
                        if (pyOnly2.length > 0) console.log(`    PY extra: [${pyOnly2.join(",")}]`);
                    }
                }
            }
        }
        console.log(`\n  Banners with pool differences: ${diffBanners}/${commonKeys.length} (${totalDiffs} tier-diffs)`);
    } else {
        console.log(`  Python gacha.json not found at ${PYTHON_GACHA_PATH}`);
        console.log(`  Generate it with: git show 96c65aa^:assets/gacha.json > ${PYTHON_GACHA_PATH}`);
    }

    // ── L7: Final-6 pools coverage check ──────────────────────────
    console.log("\n--- L7: Final 6 pools (1705-1710) coverage ---");
    const finalSixAllIds = new Set<number>();
    for (const gid of FINAL_SIX_IDS) {
        const banner = output[gid];
        if (!banner || banner.type !== 0) {
            console.log(`  gid=${gid}: NOT FOUND or not character banner`);
            continue;
        }
        for (const pk of ["1", "2", "3"] as const) {
            for (const item of (banner.pool[pk] || [])) {
                finalSixAllIds.add(item.id);
            }
        }
        const p1 = (banner.pool["1"] || []).length;
        const p2 = (banner.pool["2"] || []).length;
        const p3 = (banner.pool["3"] || []).length;
        console.log(`  gid=${gid} "${banner.name}" ★5=${p1} ★4=${p2} ★3=${p3} total=${p1 + p2 + p3}`);
    }

    // Gather all gacha-obtainable characters
    const gachaSources = ["常驻卡池", "限定卡池", "联动"];
    const allGachaChars = charTable.filter(c => gachaSources.includes(c.source) && c.code_number);
    const allGachaIds = new Set(allGachaChars.map(c => parseInt(String(c.code_number))));

    let missingCount = 0;
    console.log(`\n  可抽取角色合计: ${allGachaIds.size}`);
    console.log(`  6池合并角色: ${finalSixAllIds.size}`);
    console.log(`\n  6池未覆盖角色:`);
    for (const c of allGachaChars) {
        const id = parseInt(String(c.code_number));
        if (!finalSixAllIds.has(id)) {
            missingCount++;
            console.log(`    ${c.code_number} ${c.name} ★${c.rarity} source=${c.source}`);
        }
    }
    if (missingCount === 0) {
        console.log(`    ✓ 全部覆盖，无缺失`);
    } else {
        console.log(`  总计缺失: ${missingCount} 角色`);
    }

    // ── Write output
    fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2));
    const sizeKb = Math.round(fs.statSync(OUTPUT_PATH).size / 1024);
    console.log(`\nWritten: ${OUTPUT_PATH} (${sizeKb} KB)`);
    console.log("Done.");
}

main();
