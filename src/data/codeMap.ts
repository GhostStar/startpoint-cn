/**
 * 代号对照表 — k_id ↔ business code 映射
 * 用于服务端序列化时将数据库 k_id 转为客户端期望的 business code
 */
import mapping from "./code_map.json";

const kIdToCode = new Map<number, number>();
const codeToKId = new Map<number, number>();

for (const [k, v] of Object.entries(mapping.kIdToCode)) {
    kIdToCode.set(Number(k), Number(v));
}
for (const [k, v] of Object.entries(mapping.codeToKId)) {
    codeToKId.set(Number(k), Number(v));
}

console.log(`[codeMap] Loaded ${kIdToCode.size} k_id↔code mappings`);

/**
 * 将 k_id 转为 business code
 */
export function kIdToBusinessCode(kId: number): number {
    return kIdToCode.get(kId) ?? kId;
}

/**
 * 将 business code 转回 k_id
 */
export function businessCodeToKId(code: number): number {
    return codeToKId.get(code) ?? code;
}

export { kIdToCode, codeToKId };
