// ── Types ─────────────────────────────────────────────────────
export interface PoolItem {
    id: number;
    rank: number;
    odds: number;
    isRateUp: boolean;
    rarity: number;
}

export interface GachaBanner {
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

export interface CharacterTableEntry {
    name: string;
    code_number: string | number;
    code_name: string;
    rarity: number;
    source: string;
    available_from?: string;
}

export interface EquipmentTableEntry {
    name: string;
    rarity: number;
    element: string;
    source: string;
}
