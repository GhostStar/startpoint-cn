export enum GachaType {
    CHARACTER,
    WEAPON
}


export enum GachaMovieType {
    NORMAL,
    GUARANTEE
}


export interface GachaPoolItem {
    id: number,
    rank: number,
    odds: number,
    isRateUp: boolean,
    rarity: number
}


export interface Gacha {
    type: GachaType,
    paymentType: number,
    singleCost: number,
    multiCost: number,
    discountCost: number,
    startDate: string,
    endDate: string,
    pool: Record<string, GachaPoolItem[]>
}


export interface CharacterGacha extends Gacha {
    movieName: string,
    guaranteeMovieName: string
}


export type Gachas = Record<string, Gacha>


export type GachaDrawResult = number[]


export interface RewardPlayerGachaDrawResult {
    draw: GachaDraws,
    characters: Object[],
    equipment: Object[],
    items: Record<number, number>
}


export interface GachaCharacterDraw {
    character_id: number,
    movie_id: string,
    seed: number,
    entry_count: number,
    ex_boost_item?: {
        id: number,
        count: number
    } | []
}


export interface GachaEquipmentDraw {
    equipment_id: number,
    treasure_up_type: number
}


export type GachaDraws = (GachaCharacterDraw | GachaEquipmentDraw)[]


export type GachaMovieSeeds = Record<string, Record<string, number[]>>

// shops
