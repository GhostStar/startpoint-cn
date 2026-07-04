export const GACHA_TICKET_ITEM_IDS = {
    characterMulti: 999001,
    characterSingle: 999003,
    equipmentMulti: 999004,
    equipmentSingle: 999005,
} as const;

const TICKET_EXEC_TYPES = {
    characterMulti: 9,
    characterSingle: 10,
    equipmentSingle: 12,
    equipmentMulti: 13,
} as const;

export interface GachaTicketCost {
    itemId: number;
    useTicketCount: number;
    pullCount: number;
}

export function getGachaTicketCost(type: number, numberOfExec: number): GachaTicketCost | null {
    const useTicketCount = Math.max(1, numberOfExec);

    switch (type) {
        case TICKET_EXEC_TYPES.characterMulti:
            return {
                itemId: GACHA_TICKET_ITEM_IDS.characterMulti,
                useTicketCount,
                pullCount: useTicketCount * 10,
            };
        case TICKET_EXEC_TYPES.characterSingle:
            return {
                itemId: GACHA_TICKET_ITEM_IDS.characterSingle,
                useTicketCount,
                pullCount: useTicketCount,
            };
        case TICKET_EXEC_TYPES.equipmentSingle:
            return {
                itemId: GACHA_TICKET_ITEM_IDS.equipmentSingle,
                useTicketCount,
                pullCount: useTicketCount,
            };
        case TICKET_EXEC_TYPES.equipmentMulti:
            return {
                itemId: GACHA_TICKET_ITEM_IDS.equipmentMulti,
                useTicketCount,
                pullCount: useTicketCount * 10,
            };
        default:
            return null;
    }
}
