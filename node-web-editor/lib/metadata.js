import { promises as fs } from "node:fs";
import fssync from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import {
  TABLE_ALIASES,
  tablePath,
  loadTable,
  parseCsv,
} from "./wf-core.js";
import { findInArchiveDir } from "./zip-source.js";

const ABILITY_SCHEMA_REL = "2b/6ca08e92d925665614cd48a37167f3618dd6e6";

const ELEMENTS = {
  "0": "火",
  "1": "水",
  "2": "雷",
  "3": "风",
  "4": "光",
  "5": "暗",
};

const CHARACTER_COLUMNS = {
  0: "code_name",
  2: "rarity",
  3: "element",
  4: "race",
  7: "gender",
  8: "action_skill",
  17: "character_id",
  18: "leader_ability_title",
  19: "ability_1",
  20: "ability_2",
  21: "ability_3",
  22: "ability_4",
  23: "ability_5",
  24: "ability_6",
  25: "mana_board_kind",
  26: "role",
  27: "base_character_id",
  36: "max_ability_powers",
};

const CHARACTER_COLUMN_HINTS = {
  0: { zh: "内部代号；关联 character/{code_name} 资源路径", type: "文本" },
  1: { zh: "未确认；常为 1", type: "文本/数值" },
  2: { zh: "稀有度 1-5", type: "数值" },
  3: { zh: "元素：0火 1水 2雷 3风 4光 5暗", type: "枚举" },
  4: { zh: "种族；逗号分隔多值", type: "文本" },
  5: { zh: "未确认", type: "文本/数值" },
  6: { zh: "未确认", type: "文本/数值" },
  7: { zh: "性别：Male / Female / 空", type: "枚举" },
  8: { zh: "主动技标识；常同 code_name", type: "文本" },
  17: { zh: "键别名；与角色 ID 相关", type: "文本/数值" },
  18: { zh: "队长技称号", type: "文本" },
  19: { zh: "词条槽 1 ability ID", type: "引用" },
  20: { zh: "词条槽 2 ability ID", type: "引用" },
  21: { zh: "词条槽 3 ability ID", type: "引用" },
  22: { zh: "词条槽 4 ability ID", type: "引用" },
  23: { zh: "词条槽 5 ability ID", type: "引用" },
  24: { zh: "词条槽 6 ability ID", type: "引用" },
  25: { zh: "魔晶板类型", type: "文本/数值" },
  26: { zh: "定位：Attacker / Balance / Healer / Jammer / Supporter / Tank", type: "枚举" },
  27: { zh: "变体角色原型 ID；(None)=非变体", type: "引用" },
  28: { zh: "未确认", type: "文本/数值" },
  29: { zh: "未确认", type: "文本/数值" },
  30: { zh: "未确认", type: "文本/数值" },
  31: { zh: "未确认", type: "文本/数值" },
  32: { zh: "未确认", type: "文本/数值" },
  33: { zh: "未确认", type: "文本/数值" },
  34: { zh: "未确认", type: "文本/数值" },
  35: { zh: "未确认", type: "文本/数值" },
  36: { zh: "六槽技能等级串；如 6,6,6,6,6,6", type: "文本" },
};

const CHARACTER_TEXT_COLUMNS = {
  0: "name",
  1: "name_en",
  2: "description",
  3: "title",
  4: "skill_name",
  5: "skill_desc",
  6: "skill_plus_name",
  7: "skill_plus_desc",
  10: "leader_title",
  11: "cv",
};

const CHARACTER_TEXT_COLUMN_HINTS = {
  0: { zh: "名字（中文）", type: "文本" },
  1: { zh: "名字（英文）", type: "文本" },
  2: { zh: "角色描述", type: "文本" },
  3: { zh: "称号", type: "文本" },
  4: { zh: "技能名", type: "文本" },
  5: { zh: "技能描述", type: "文本" },
  6: { zh: "技能名＋", type: "文本" },
  7: { zh: "技能描述＋", type: "文本" },
  8: { zh: "保留；常为 (None)", type: "文本" },
  9: { zh: "保留；常为 (None)", type: "文本" },
  10: { zh: "队长技称号", type: "文本" },
  11: { zh: "声优 CV", type: "文本" },
};

const EQUIPMENT_COLUMNS = {
  0: "string_id",
  1: "name",
  2: "kind",
  7: "description",
  8: "rarity",
  10: "ability_soul_id",
};

const EQUIPMENT_ENHANCEMENT_COLUMNS = {
  0: "equipment_id",
  2: "enhancement_name",
  7: "max_level",
};

const ACTION_SKILL_COLUMNS = {
  0: "name",
  1: "description",
  2: "action_path",
  4: "min_skill_weight",
  5: "max_skill_weight",
  7: "program_path",
};

const ACTION_SKILL_COLUMN_HINTS = {
  0: { zh: "技能名", type: "文本" },
  1: { zh: "技能描述", type: "文本" },
  2: { zh: "动作分类路径", type: "路径" },
  4: { zh: "技能槽消耗下限/权重", type: "数值" },
  5: { zh: "技能槽消耗上限/权重", type: "数值" },
  7: { zh: "战斗动作程序路径", type: "路径" },
};

const CHARACTER_STATUS_COLUMNS = {
  0: "hp",
  1: "atk",
};

const CHARACTER_STATUS_COLUMN_HINTS = {
  0: { zh: "基础 HP；内层键为等级断点", type: "整数" },
  1: { zh: "基础 ATK；内层键为等级断点", type: "整数" },
};

const CHARACTER_AWAKE_STATUS_COLUMNS = {
  0: "atk_plus_value",
  1: "hp_plus_value",
};

const CHARACTER_AWAKE_STATUS_COLUMN_HINTS = {
  0: { zh: "觉醒大节点 ATK 加成；注意与 character_status 列序相反", type: "整数" },
  1: { zh: "觉醒大节点 HP 加成；注意与 character_status 列序相反", type: "整数" },
};

const WEAPON_ABILITY_COLUMN_HINTS = {
  0: { zh: "装备能力槽位", type: "数值" },
  1: { zh: "学习等级", type: "数值" },
  2: { zh: "最大能力等级", type: "数值" },
  3: { zh: "能力等级 1 数值", type: "数值" },
  4: { zh: "能力等级 2 数值", type: "数值" },
  5: { zh: "触发器", type: "枚举" },
};

const EQUIPMENT_COLUMN_HINTS = {
  0: { zh: "文本标识", type: "文本" },
  1: { zh: "装备名", type: "文本" },
  2: { zh: "装备类型/种类", type: "枚举" },
  7: { zh: "装备描述", type: "文本" },
  8: { zh: "稀有度", type: "数值" },
  10: { zh: "能力魂 ID", type: "引用" },
};

const EQUIPMENT_ENHANCEMENT_COLUMN_HINTS = {
  0: { zh: "装备 ID", type: "引用" },
  2: { zh: "强化名", type: "文本" },
  7: { zh: "最大等级", type: "数值" },
};

let fieldManualCache = null;

function cleanManualCell(value) {
  return String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

async function loadFieldManual(ctx) {
  if (fieldManualCache) return fieldManualCache;
  const manualPath = path.join(ctx.modRoot || path.resolve(process.cwd(), ".."), "CN-Mod字段手册.md");
  const ability = {};
  try {
    const text = await fs.readFile(manualPath, "utf8");
    for (const line of text.split(/\r?\n/)) {
      const match = line.match(/^\|\s*(\d+)\s*\|\s*`([^`]+)`\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/);
      if (!match) continue;
      const index = Number(match[1]);
      ability[index] = {
        name: cleanManualCell(match[2]),
        zh: cleanManualCell(match[3]),
        type: cleanManualCell(match[4]),
      };
    }
  } catch {
    // The editor still works without the optional field manual.
  }
  fieldManualCache = { ability };
  return fieldManualCache;
}

function sparseColumns(map, minWidth = 0) {
  const max = Math.max(minWidth - 1, ...Object.keys(map).map(Number));
  return Array.from({ length: max + 1 }, (_, index) => ({
    index,
    name: map[index] || `c${index}`,
  }));
}

function firstCsvRow(text) {
  return parseCsv(text || "")[0] || [];
}

async function readRel(ctx, rel) {
  const target = path.join(ctx.store, rel);
  if (fssync.existsSync(target)) return { data: await fs.readFile(target), sourcePath: target };
  if (ctx.sourceStore) {
    const source = path.join(ctx.sourceStore, rel);
    if (fssync.existsSync(source)) return { data: await fs.readFile(source), sourcePath: source };
  }
  if (ctx.sourceArchiveDir) {
    const archived = await findInArchiveDir(ctx.sourceArchiveDir, `production/upload/${rel}`);
    if (archived) return archived;
  }
  return null;
}

class AMF3Reader {
  constructor(data) {
    this.data = data;
    this.pos = 0;
    this.stringRefs = [];
    this.objectRefs = [];
    this.traitRefs = [];
  }

  readByte() {
    return this.data[this.pos++];
  }

  readU29() {
    let value = 0;
    for (let i = 0; i < 4; i += 1) {
      const b = this.readByte();
      if (i < 3) {
        value = (value << 7) | (b & 0x7f);
        if ((b & 0x80) === 0) return value;
      } else {
        return (value << 8) | b;
      }
    }
    return value;
  }

  readStringBody() {
    const header = this.readU29();
    if ((header & 1) === 0) return this.stringRefs[header >> 1];
    const length = header >> 1;
    if (length === 0) return "";
    const value = this.data.subarray(this.pos, this.pos + length).toString("utf8");
    this.pos += length;
    this.stringRefs.push(value);
    return value;
  }

  readValue() {
    const marker = this.readByte();
    if (marker === 0x00 || marker === 0x01) return null;
    if (marker === 0x02) return false;
    if (marker === 0x03) return true;
    if (marker === 0x04) {
      const value = this.readU29();
      return (value & 0x10000000) ? value - 0x20000000 : value;
    }
    if (marker === 0x05) {
      const value = this.data.readDoubleBE(this.pos);
      this.pos += 8;
      return value;
    }
    if (marker === 0x06) return this.readStringBody();
    if (marker === 0x09) return this.readArray();
    if (marker === 0x0a) return this.readObject();
    throw new Error(`unsupported AMF3 marker 0x${marker.toString(16)} at ${this.pos - 1}`);
  }

  readArray() {
    const header = this.readU29();
    if ((header & 1) === 0) return this.objectRefs[header >> 1];
    const denseCount = header >> 1;
    const assoc = {};
    for (;;) {
      const key = this.readStringBody();
      if (key === "") break;
      assoc[key] = this.readValue();
    }
    const dense = [];
    const container = Object.keys(assoc).length ? { $assoc: assoc, $dense: dense } : dense;
    this.objectRefs.push(container);
    for (let i = 0; i < denseCount; i += 1) dense.push(this.readValue());
    return container;
  }

  readObject() {
    const header = this.readU29();
    if ((header & 1) === 0) return this.objectRefs[header >> 1];
    let className;
    let sealedNames;
    let externalizable;
    let dynamic;
    if ((header & 2) === 0) {
      [className, sealedNames, externalizable, dynamic] = this.traitRefs[header >> 2];
    } else {
      externalizable = Boolean(header & 4);
      dynamic = Boolean(header & 8);
      const sealedCount = header >> 4;
      className = this.readStringBody();
      sealedNames = [];
      for (let i = 0; i < sealedCount; i += 1) sealedNames.push(this.readStringBody());
      this.traitRefs.push([className, sealedNames, externalizable, dynamic]);
    }
    if (externalizable) throw new Error("externalizable AMF3 objects are not supported");
    const obj = {};
    if (className) obj.$class = className;
    this.objectRefs.push(obj);
    for (const name of sealedNames) obj[name] = this.readValue();
    if (dynamic) {
      for (;;) {
        const key = this.readStringBody();
        if (key === "") break;
        obj[key] = this.readValue();
      }
    }
    return obj;
  }
}

async function loadAbilityColumns(ctx) {
  const source = await readRel(ctx, ABILITY_SCHEMA_REL);
  if (!source) return [];
  const raw = zlib.inflateRawSync(source.data);
  const schema = new AMF3Reader(raw).readValue();
  const valueSchema = schema?.valueSchema || [];
  return valueSchema
    .map(item => ({ index: Number(item.index), name: item.columnName || `c${item.index}` }))
    .filter(item => Number.isFinite(item.index))
    .sort((a, b) => a.index - b.index);
}

function applyHints(columns, hints = {}) {
  return columns.map(col => {
    const hint = hints[col.index];
    if (!hint) return col;
    return {
      ...col,
      name: col.name || hint.name || `c${col.index}`,
      zh: hint.zh || "",
      type: hint.type || "",
    };
  });
}

function aliasOf(logicalPath) {
  return Object.entries(TABLE_ALIASES).find(([, logical]) => logical === logicalPath)?.[0] || logicalPath;
}

async function maybeLoadTable(ctx, alias) {
  try {
    return await loadTable({ ...ctx, logicalPath: TABLE_ALIASES[alias] });
  } catch {
    return null;
  }
}

async function readLookupFile(ctx, rel) {
  const file = path.join(ctx.dataRoot || "", rel);
  try {
    return JSON.parse(await fs.readFile(file, "utf8"));
  } catch {
    return {};
  }
}

async function buildLookups(ctx) {
  const [characterText, character, equipment, itemLookup, equipmentLookup] = await Promise.all([
    maybeLoadTable(ctx, "character_text"),
    maybeLoadTable(ctx, "character"),
    maybeLoadTable(ctx, "equipment"),
    readLookupFile(ctx, "assets/item_lookup.json"),
    readLookupFile(ctx, "assets/equipment_lookup.json"),
  ]);

  const characters = {};
  const codeToCharacter = {};
  if (characterText) {
    for (let i = 0; i < characterText.keys.length; i += 1) {
      const key = characterText.keys[i];
      const row = firstCsvRow(characterText.rows[i].toString("utf8"));
      characters[key] = { id: key, name: row[0] || "", nameEn: row[1] || "", skillName: row[4] || "" };
    }
  }
  if (character) {
    for (let i = 0; i < character.keys.length; i += 1) {
      const key = character.keys[i];
      const row = firstCsvRow(character.rows[i].toString("utf8"));
      const id = row[17] || key;
      const base = characters[id] || { id, name: "" };
      characters[id] = {
        ...base,
        id,
        key,
        codeName: row[0] || "",
        rarity: row[2] || "",
        element: ELEMENTS[row[3]] || row[3] || "",
      };
      if (row[0]) codeToCharacter[row[0]] = id;
    }
  }

  const equipmentMap = {};
  for (const [id, info] of Object.entries(equipmentLookup || {})) {
    equipmentMap[id] = typeof info === "string"
      ? { id, name: info }
      : { id, ...info };
  }
  if (equipment) {
    for (let i = 0; i < equipment.keys.length; i += 1) {
      const key = equipment.keys[i];
      const row = firstCsvRow(equipment.rows[i].toString("utf8"));
      equipmentMap[key] = {
        id: key,
        stringId: row[0] || "",
        name: row[1] || "",
        kind: row[2] || "",
        rarity: row[8] || "",
        soulId: row[10] || key,
      };
    }
  }

  const abilities = {};
  if (character) {
    for (let i = 0; i < character.keys.length; i += 1) {
      const row = firstCsvRow(character.rows[i].toString("utf8"));
      const id = row[17] || character.keys[i];
      const c = characters[id] || { id, name: "" };
      for (let col = 19; col <= 24; col += 1) {
        const abilityId = row[col];
        if (!abilityId) continue;
        abilities[abilityId] = {
          id: abilityId,
          ownerId: id,
          ownerName: c.name || c.codeName || id,
          slot: col - 18,
        };
      }
    }
  }

  return { characters, codeToCharacter, equipment: equipmentMap, items: itemLookup || {}, abilities };
}

async function columnsFor(ctx, alias) {
  const manual = await loadFieldManual(ctx);
  if (["ability", "leader_ability", "ability_soul"].includes(alias)) {
    const cols = await loadAbilityColumns(ctx);
    return applyHints(cols, manual.ability);
  }
  if (alias === "weapon_ability") {
    const cols = await loadAbilityColumns(ctx);
    const overrides = {
      0: "slot",
      1: "learn_level",
      2: "max_power_level",
      3: "power1",
      4: "power2",
      5: "trigger",
    };
    return applyHints(cols.map(col => overrides[col.index] ? { ...col, name: overrides[col.index] } : col), {
      ...manual.ability,
      ...WEAPON_ABILITY_COLUMN_HINTS,
    });
  }
  if (alias === "character") return applyHints(sparseColumns(CHARACTER_COLUMNS, 37), CHARACTER_COLUMN_HINTS);
  if (alias === "character_text") return applyHints(sparseColumns(CHARACTER_TEXT_COLUMNS, 12), CHARACTER_TEXT_COLUMN_HINTS);
  if (alias === "equipment") return applyHints(sparseColumns(EQUIPMENT_COLUMNS, 11), EQUIPMENT_COLUMN_HINTS);
  if (alias === "equipment_enhancement") return applyHints(sparseColumns(EQUIPMENT_ENHANCEMENT_COLUMNS, 8), EQUIPMENT_ENHANCEMENT_COLUMN_HINTS);
  if (alias === "action_skill") return applyHints(sparseColumns(ACTION_SKILL_COLUMNS, 8), ACTION_SKILL_COLUMN_HINTS);
  if (alias === "character_status") return applyHints(sparseColumns(CHARACTER_STATUS_COLUMNS, 2), CHARACTER_STATUS_COLUMN_HINTS);
  if (alias === "character_awake_status") return applyHints(sparseColumns(CHARACTER_AWAKE_STATUS_COLUMNS, 2), CHARACTER_AWAKE_STATUS_COLUMN_HINTS);
  return [];
}

function nameOfCharacter(lookups, id) {
  const c = lookups.characters[String(id)];
  if (!c) return "";
  const bits = [c.name || c.codeName || c.id];
  if (c.rarity) bits.push(`${c.rarity}★`);
  if (c.element) bits.push(c.element);
  return bits.join(" ");
}

function labelForKey(alias, key, lookups) {
  if (alias === "character" || alias === "character_text") return nameOfCharacter(lookups, key);
  if (alias === "leader_ability") return `${nameOfCharacter(lookups, key) || key} 队长技`;
  if (alias === "ability") {
    const a = lookups.abilities[key];
    return a ? `${a.ownerName} A${a.slot}` : "";
  }
  if (alias === "ability_soul" || alias === "weapon_ability" || alias === "equipment" || alias === "equipment_enhancement") {
    const e = lookups.equipment[key];
    if (!e) return "";
    const kind = e.kind === "1" ? "魂珠" : "装备";
    return `${e.name || e.stringId || key} ${kind}${e.rarity ? ` ${e.rarity}★` : ""}`;
  }
  if (alias === "action_skill") {
    const cid = lookups.codeToCharacter[key];
    return cid ? `${nameOfCharacter(lookups, cid)} 主动技` : "";
  }
  return "";
}

function refForCell(alias, col, value, lookups) {
  const v = String(value || "");
  if (!v) return "";
  if (alias === "character" && col >= 19 && col <= 24) {
    const a = lookups.abilities[v];
    return a ? `${a.ownerName} A${a.slot}` : "";
  }
  if (alias === "character" && (col === 17 || col === 27)) return nameOfCharacter(lookups, v);
  if (alias === "character" && col === 8) {
    const cid = lookups.codeToCharacter[v];
    return cid ? `${nameOfCharacter(lookups, cid)} 主动技` : "";
  }
  if (alias === "equipment" && col === 10) {
    const e = lookups.equipment[v];
    return e ? `${e.name || e.stringId || v} 魂珠` : "";
  }
  const colName = String(col.name || "");
  if (/(character|character_id|owner)/i.test(colName)) return nameOfCharacter(lookups, v);
  if (/(equipment|soul)/i.test(colName)) {
    const e = lookups.equipment[v];
    return e ? (e.name || e.stringId || v) : "";
  }
  if (/(item|reward|material|coin)/i.test(colName)) {
    const item = lookups.items[v];
    if (item) return typeof item === "string" ? item : (item.name || "");
    const e = lookups.equipment[v];
    if (e) return e.name || e.stringId || "";
  }
  return "";
}

export async function buildTableMetadata(ctx, logicalPath) {
  const alias = aliasOf(logicalPath);
  const [columns, lookups] = await Promise.all([columnsFor(ctx, alias), buildLookups(ctx)]);
  const columnsByIndex = new Map(columns.map(col => [col.index, col]));
  return { alias, columns, columnsByIndex, lookups };
}

export function decorateSummary(summary, metadata) {
  return {
    ...summary,
    alias: metadata.alias,
    columns: metadata.columns,
    keys: summary.keys.map(item => ({
      ...item,
      label: labelForKey(metadata.alias, item.key, metadata.lookups),
    })),
  };
}

export function decorateRow(row, metadata) {
  if (row.rawRows && row.nestedRows) {
    const annotatedRows = [];
    const rowLabels = [];
    const rowMap = [];
    for (const nested of row.nestedRows) {
      for (let rowIndex = 0; rowIndex < nested.rows.length; rowIndex += 1) {
        const cells = nested.rows[rowIndex];
        rowLabels.push(nested.rows.length > 1 ? `${nested.key} #${rowIndex + 1}` : nested.key);
        rowMap.push({ nestedKey: nested.key, line: rowIndex + 1 });
        annotatedRows.push(cells.map((value, index) => {
          const column = metadata.columnsByIndex.get(index) || { index, name: `c${index}` };
          return {
            row: annotatedRows.length + 1,
            index,
            name: column.name,
            zh: column.zh || "",
            type: column.type || "",
            value,
            ref: refForCell(metadata.alias, column, value, metadata.lookups) || refForCell(metadata.alias, index, value, metadata.lookups),
          };
        }));
      }
    }
    return {
      ...row,
      label: labelForKey(metadata.alias, row.key, metadata.lookups),
      columns: metadata.columns,
      rowLabels,
      rowMap,
      annotatedRows,
      rows: row.nestedRows.flatMap(nested => nested.rows),
    };
  }
  if (row.rawRows) return { ...row, label: labelForKey(metadata.alias, row.key, metadata.lookups), columns: metadata.columns };
  const annotatedRows = (row.rows || []).map((cells, rowIndex) => cells.map((value, index) => {
    const column = metadata.columnsByIndex.get(index) || { index, name: `c${index}` };
    return {
      row: rowIndex + 1,
      index,
      name: column.name,
      zh: column.zh || "",
      type: column.type || "",
      value,
      ref: refForCell(metadata.alias, column, value, metadata.lookups) || refForCell(metadata.alias, index, value, metadata.lookups),
    };
  }));
  return {
    ...row,
    label: labelForKey(metadata.alias, row.key, metadata.lookups),
    columns: metadata.columns,
    annotatedRows,
  };
}
