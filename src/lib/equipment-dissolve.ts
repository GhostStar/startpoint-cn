import { getEquipmentDissolveSync } from "./assets";

export interface DissolveRewards {
    craftPoints: number;
    starGrains: number;
    /** Item ID → count map for ability souls granted */
    abilitySouls: Record<number, number>;
}

// wrightpiece reward per stack for dissolving each rank of weapon
const dissolvingCraftPoints: number[] = [1, 2, 3, 4, 5];

// star grain reward per stack for dissolving each rank of weapon
const dissolvingStarGrains: number[] = [0, 0, 1, 5, 15];

/**
 * Calculate dissolve rewards for one equipment type × count stacks.
 *
 * CDN checks applied:
 * - generate_ability_soul: only grant ability souls if `true`
 * - obtain_source: only grant star grains if `0`
 *
 * @param equipmentId  The equipment ID being dissolved.
 * @param count        How many stacks to dissolve.
 * @returns Rewards struct (always non-null, zero values for missing rewards).
 */
export function calculateDissolveRewards(
    equipmentId: number,
    count: number
): DissolveRewards {
    const rarity = Math.floor(equipmentId / 1000000) - 1;
    const craftPoints = (dissolvingCraftPoints[rarity] ?? 0) * count;

    const cdn = getEquipmentDissolveSync(equipmentId);

    // Star grains: only if obtain_source == 0
    const starGrains =
        cdn && cdn.obtain_source === 0
            ? (dissolvingStarGrains[rarity] ?? 0) * count
            : 0;

    // Ability souls: only if generate_ability_soul == true
    const abilitySouls: Record<number, number> = {};
    if (cdn && cdn.generate_ability_soul) {
        const soulId = cdn.ability_soul_id;
        abilitySouls[soulId] = count;
    }

    return { craftPoints, starGrains, abilitySouls };
}
