import * as path from "path";

// ── Project root ─────────────────────────────────────────────
// tools/gacha/constants.ts → ROOT = starpoint-cn/
export const ROOT = path.resolve(__dirname, "..", "..");

// ── Data source paths ────────────────────────────────────────
export const CHAR_TABLE_PATH = path.join(ROOT, "data/character_table.json");
export const EQUIP_TABLE_PATH = path.join(ROOT, "data/equipment_table.json");
export const CDN_GACHA_PATH = path.join(ROOT, "assets/cdndata/gacha.json");
export const CDN_FC_PATH = path.join(ROOT, "assets/cdndata/gacha_feature_content.json");
export const CDN_CHARS_PATH = path.join(ROOT, "assets/cdndata/character.json");
export const OUTPUT_PATH = path.join(ROOT, "assets/gacha.json");
export const OLD_GACHA_PATH = path.join(ROOT, "assets/gacha_old.json");
export const PYTHON_GACHA_PATH = path.join(ROOT, "assets/gacha_python.json");
export const GLOBAL_GACHA_PATH = path.join(ROOT, "..", "starpoint", "assets", "gacha.json");

// ── Equipment gacha IDs ──────────────────────────────────────
export const EQ_IDS = new Set([
    "3", "5000", "5001", "5002", "5003", "5004", "5005", "5006", "5007", "5008",
    "5009", "5010", "5011", "5012", "5013", "5014", "5015", "5016", "5017", "5018",
    "5019", "5020", "5021", "5022", "5023", "5024", "5025", "5026", "5027", "5028",
    "5029", "5030", "5031", "5032", "5033", "5034", "5035", "5036", "5037", "5038",
]);

// ── Element name → index ─────────────────────────────────────
export const ELEM_NAME_TO_INDEX: Record<string, number> = {
    '火': 0, '水': 1, '雷': 2, '风': 3, '光': 4, '暗': 5, '全': -1,
};

// ── Equipment element pool key patterns ──────────────────────
export const EQUIP_ELEMENT_PATTERNS: [string[], number][] = [
    [["equipment_red", "equipment_fire"], 0],
    [["equipment_blue", "equipment_water"], 1],
    [["equipment_yellow", "equipment_thunder"], 2],
    [["equipment_green", "equipment_wind"], 3],
    [["equipment_white", "equipment_light"], 4],
    [["equipment_black", "equipment_dark"], 5],
];

// ── UP probability targets ───────────────────────────────────
// ★5: single=1.5%→÷5%=0.30, double=1.0%→÷5%=0.20, triple=0.7%→÷5%=0.14
// ★4: single=2.5%→÷25%=0.10, double=2.0%→÷25%=0.08
export const UP_TARGETS: Record<string, Record<number, number>> = {
    "1": { 1: 0.30, 2: 0.20, 3: 0.14, 4: 0.10 },
    "2": { 1: 0.10, 2: 0.08 },
};

// ── Fes gacha verified in-game odds ──────────────────────────
// 3 UP: UP 0.700% / normal 0.025% = 28
// 4 UP: UP 0.500% / normal 0.030% = 17
// 19 UP (revival): UP 0.300% / normal 0.014% = 21
export const FES_UP_ODDS: Record<number, number> = {
    3: 28,
    4: 17,
    19: 21,
};

// ── Revival Fes pool — historical fes ★5 limiteds ────────────
export const REVIVAL_FES_5STAR = [
    111147, 111165, 121141, 121153, 121177, 131152, 131170, 141165, 141183, 141201,
    151129, 151147, 151153, 151165, 151182, 161153, 161159, 161177, 161201,
];

// ── Characters reported as un-pullable ───────────────────────
export const REPORTED_MISSING: Record<string, string> = {
    "211026": "特蕾涅(圣红剑)",
    "311006": "特蕾涅3★(红剑)",
    "221022": "崔丝塔(春伞)",
    "221011": "杰拉尔(泳骑)",
    "231008": "阿德尼(雷策)",
    "211011": "米尔米娜(武术家)",
    "241006": "蕾贝卡(风兔子)",
    "351015": "可莉娜(万圣光奶)",
};

// ── Final 6 限定属性池 (1705-1710) ───────────────────────────
export const FINAL_SIX_IDS = new Set(["1705", "1706", "1707", "1708", "1709", "1710"]);

// ── Element mapping for character pool keys ──────────────────
// CDN character.json [3] = element: 0=fire, 1=water, 2=thunder, 3=wind, 4=light, 5=dark
export const ELEMENT_PATTERNS: [string[], number][] = [
    [["red_element", "red_character", "fire_"], 0],
    [["blue_element", "blue_character", "water_"], 1],
    [["yellow_element", "thunder_element", "thunder_character", "yellow_character"], 2],
    [["green_element", "green_character", "wind_"], 3],
    [["white_element", "white_character", "light_"], 4],
    [["black_element", "black_character", "dark_"], 5],
];
