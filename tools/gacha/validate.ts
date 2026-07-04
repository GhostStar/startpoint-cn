import { PoolItem, GachaBanner, CharacterTableEntry } from "./types";
import { UP_TARGETS, FES_UP_ODDS, REPORTED_MISSING, FINAL_SIX_IDS } from "./constants";

// ── L1: Validate template completeness ─────────────────────────
export function validateL1(
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

// ── L2: Full validation of each banner ─────────────────────────
export function validateL2(
    gachaId: string,
    banner: GachaBanner,
    expectedTemplate: Record<string, PoolItem[]>,
    permanentSet: Set<number>,
    upSet: Set<string>,
    isFesBanner: boolean = false,
    isLimitedAttrRevival: boolean = false
): string[] {
    if (banner.type !== 0) return [];

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

        // Count
        if (expectedIds.size !== actualIds.size) {
            const missing = [...expectedIds].filter(id => !actualIds.has(id)).slice(0, 10);
            const extra = [...actualIds].filter(id => !expectedIds.has(id)).slice(0, 10);
            errors.push(
                `SIZE gid=${gachaId} tier=${pk} exp=${expectedIds.size} act=${actualIds.size}` +
                (missing.length ? ` missing=[${missing.join(",")}]` : "") +
                (extra.length ? ` extra=[${extra.join(",")}]` : "")
            );
        }

        // Members
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

        // UP marks — 限定属性池復活: always uniform (no rate-up)
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
                if (item.odds !== fesOdds) {
                    errors.push(`ODDS_FES gid=${gachaId} tier=${pk} id=${item.id} odds=${item.odds} exp=${fesOdds}`);
                }
            } else if (!expIsUp) {
                if (item.odds !== 1) {
                    errors.push(`ODDS gid=${gachaId} tier=${pk} id=${item.id} odds=${item.odds} exp=1`);
                }
            }
        }

        // Rarity sum ≈ 1000
        const sum = actualItems.reduce((s, item) => s + item.rarity, 0);
        if (Math.abs(sum - 1000) > 5 && actualItems.length > 0) {
            errors.push(`RARITY gid=${gachaId} tier=${pk} sum=${sum.toFixed(1)}`);
        }
    }

    return errors;
}

// ── Python version comparison ──────────────────────────────────
export function validatePython(
    newGacha: Record<string, GachaBanner>,
    pyGacha: Record<string, GachaBanner>
): void {
    console.log("\n--- L6: Python version comparison ---");
    const tsKeys = Object.keys(newGacha).filter(k => newGacha[k].type === 0);
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
            console.log(`    ${gid}: "${newGacha[gid].name}"`);
        }
    }
    if (pyOnly.length > 0) {
        console.log(`  PY-only banners (${pyOnly.length}):`);
        for (const gid of pyOnly.slice(0, 10)) {
            console.log(`    ${gid}: "${pyGacha[gid].name}"`);
        }
    }

    let diffBanners = 0, totalDiffs = 0;
    for (const gid of commonKeys) {
        const ts = newGacha[gid], py = pyGacha[gid];
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
}

// ── L7: Final-6 coverage check ─────────────────────────────────
// Verifies that the union of 1705-1710 pools covers all
// gacha-obtainable characters (常驻 + 限定, excluding 联动).
export function validateCoverage(
    output: Record<string, GachaBanner>,
    charTable: CharacterTableEntry[]
): void {
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

    // Gacha-obtainable: 常驻 + 限定 (no 联动 — collab-only)
    const gachaSources = ["常驻卡池", "限定卡池"];
    const allGachaChars = charTable.filter(c => gachaSources.includes(c.source) && c.code_number);
    const allGachaIds = new Set(allGachaChars.map(c => parseInt(String(c.code_number))));

    let missingCount = 0;
    console.log(`\n  可抽取角色(常驻+限定): ${allGachaIds.size}`);
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
}
