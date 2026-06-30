import os
from util import save_json
import util

def convert_general_shop(obj):
    converted = {}
    for item_id, item in obj.items():

        costs = []
        cost_offset = 12
        for _ in range(4):
            if item[cost_offset] != "(None)":
                costs.append({
                    "id": int(item[cost_offset]),
                    "amount": int(item[cost_offset + 1])
                })
            cost_offset += 2

        rewards = []
        reward_offset = 29
        for _ in range (6):
            if item[reward_offset] != "(None)":
                reward = {
                    "type": int(item[reward_offset])
                }
                if item[reward_offset + 1] != "":
                    reward['id'] = int(item[reward_offset + 1])
                if item[reward_offset + 2] != "":
                    reward['count'] = int(item[reward_offset + 2])
                rewards.append(reward)
            reward_offset += 3
        
        converted_item = {
            "costs": costs,
            "rewards": rewards,
            "availableFrom": item[20],
            "availableUntil": item[21] if item[21] != "(None)" else None,
            "stock": int(item[23]),
        }

        if (item[9]) != "(None)":
            converted_item['userCost'] = {
                "type": int(item[9]),
                "amount": int(item[10])
            }
        
        converted[item_id] = converted_item

    return converted


def convert_boss_coin_shop(obj):
    converted = {}
    map_output = {}
    for item_id, item in obj.items():
        costs = []
        cost_offset = 16
        for _ in range(4):
            if item[cost_offset] != "(None)":
                costs.append({
                    "id": int(item[cost_offset]),
                    "amount": int(item[cost_offset + 1])
                })
            cost_offset += 2

        rewards = []
        reward_offset = 31
        for _ in range (6):
            if item[reward_offset] != "(None)":
                reward = {
                    "type": int(item[reward_offset])
                }
                if item[reward_offset + 1] != "":
                    reward['id'] = int(item[reward_offset + 1])
                if item[reward_offset + 2] != "":
                    reward['count'] = int(item[reward_offset + 2])
                rewards.append(reward)
            reward_offset += 3
        
        category = int(item[0])

        converted_item = {
            "costs": costs,
            "rewards": rewards,
            "availableFrom": item[24],
            "availableUntil": item[25] if item[25] != "(None)" else None,
            "stock": int(item[27]),
        }
        
        if not converted.get(category):
            converted[category] = {}

        map_output[item_id] = category
        converted[category][item_id] = converted_item
        
    save_json(map_output, os.path.join(util.FILE_OUTPUT, "boss_coin_shop_item_category_map.json"))
    return converted


def convert_event_item_shop(obj):
    converted = {}

    map_output = {}
    
    for item_id, item in obj.items():
        item = item[0]  # extract inner array
        costs = []
        cost_offset = 18
        for _ in range(4):
            if item[cost_offset] != "(None)":
                costs.append({
                    "id": int(item[cost_offset]),
                    "amount": int(item[cost_offset + 1])
                })
            cost_offset += 2

        rewards = []
        reward_offset = 32
        for _ in range (6):
            if item[reward_offset] != "(None)":
                reward = {
                    "type": int(item[reward_offset])
                }
                if item[reward_offset + 1] != "":
                    reward['id'] = int(item[reward_offset + 1])
                if item[reward_offset + 2] != "":
                    reward['count'] = int(item[reward_offset + 2])
                rewards.append(reward)
            reward_offset += 3
        
        event_type = int(item[2])
        event_id = int(item[1])

        converted_item = {
            "costs": costs,
            "rewards": rewards,
            "availableFrom": item[26],
            "availableUntil": item[27] if item[27] != "(None)" else None,
            "stock": int(item[29]),
        }
        
        if not converted.get(event_type):
            converted[event_type] = {}

        if not converted[event_type].get(event_id):
            converted[event_type][event_id] = {}

        map_output[item_id] = {
            "eventType": event_type,
            "eventId": event_id
        }

        converted[event_type][event_id][item_id] = converted_item

    save_json(map_output, os.path.join(util.FILE_OUTPUT, "event_item_shop_id_map.json"))
    return converted


def convert_treasure_shop(obj):
    converted = {}
    for item_id, item in obj.items():
        costs = []
        cost_offset = 10
        for _ in range(4):
            if item[cost_offset] != "(None)":
                costs.append({
                    "id": int(item[cost_offset]),
                    "amount": int(item[cost_offset + 1])
                })
            cost_offset += 2

        rewards = []
        reward_offset = 24
        for _ in range (6):
            if item[reward_offset] != "(None)":
                reward = {
                    "type": int(item[reward_offset])
                }
                if item[reward_offset + 1] != "":
                    reward['id'] = int(item[reward_offset + 1])
                if item[reward_offset + 2] != "":
                    reward['count'] = int(item[reward_offset + 2])
                rewards.append(reward)
            reward_offset += 3

        converted_item = {
            "costs": costs,
            "rewards": rewards,
            "availableFrom": item[18],
            "availableUntil": item[19] if item[19] != "(None)" else None,
            "stock": int(item[21]),
        }

        if (item[7]) != "(None)":
            converted_item['userCost'] = {
                "type": int(item[7]),
                "amount": int(item[8])
            }

        converted[item_id] = converted_item

    return converted


def convert_star_grain_shop(obj):
    converted = {}
    for item_id, item in obj.items():
        costs = []
        cost_offset = 10
        for _ in range(4):
            if item[cost_offset] != "(None)":
                costs.append({
                    "id": int(item[cost_offset]),
                    "amount": int(item[cost_offset + 1])
                })
            cost_offset += 2

        rewards = []
        reward_offset = 25
        for _ in range (6):
            if item[reward_offset] != "(None)":
                reward = {
                    "type": int(item[reward_offset])
                }
                if item[reward_offset + 1] != "":
                    reward['id'] = int(item[reward_offset + 1])
                if item[reward_offset + 2] != "":
                    reward['count'] = int(item[reward_offset + 2])
                rewards.append(reward)
            reward_offset += 3

        converted_item = {
            "costs": costs,
            "rewards": rewards,
            "availableFrom": item[18],
            "availableUntil": item[19] if item[19] != "(None)" else None,
            "stock": int(item[21]),
        }

        if (item[7]) != "(None)":
            converted_item['userCost'] = {
                "type": int(item[7]),
                "amount": int(item[8])
            }

        converted[item_id] = converted_item

    return converted


def convert_equipment_enhancement_shop(obj):
    converted = {}
    for item_id, item in obj.items():
        # value is [[cols]], extract the inner array
        item = item[0]
        costs = []
        cost_offset = 14
        for _ in range(4):
            if item[cost_offset] != "(None)" and item[cost_offset] != "":
                costs.append({
                    "id": int(item[cost_offset]),
                    "amount": int(item[cost_offset + 1])
                })
            cost_offset += 2

        rewards = []
        # EquipmentEnhancementKind.Normal (product_kind=0) has reward kinds at [32]-[49]
        if item[4] == "0":
            reward_offset = 32
            for _ in range(6):
                if item[reward_offset] != "(None)" and item[reward_offset] != "":
                    reward = {
                        "type": int(item[reward_offset])
                    }
                    if item[reward_offset + 1] != "":
                        reward['id'] = int(item[reward_offset + 1])
                    if item[reward_offset + 2] != "":
                        reward['count'] = int(item[reward_offset + 2])
                    rewards.append(reward)
                reward_offset += 3

        converted_item = {
            "costs": costs,
            "rewards": rewards,
            "availableFrom": item[22],
            "availableUntil": item[23] if item[23] != "(None)" else None,
            "stock": int(item[25]) if item[25] != "" else -1,
            "shopCategoryId": int(item[0]),
            "groupId": int(item[2]),
            "stage": int(item[3]),
        }

        # EquipmentEnhancement kind fields
        if item[29] != "":
            converted_item["equipmentId"] = int(item[29])
        if item[30] != "":
            converted_item["enhancementMaxLevel"] = int(item[30])
        if item[31] != "":
            converted_item["requireAwakeningLevel"] = int(item[31])
        if item[26] != "" and item[26] != "(None)":
            converted_item["maxFrequency"] = int(item[26])
        if item[27] != "" and item[27] != "(None)":
            converted_item["dailyStock"] = int(item[27])
        if item[28] != "" and item[28] != "(None)":
            converted_item["monthlyStock"] = int(item[28])

        if item[11] != "(None)" and item[11] != "":
            converted_item['userCost'] = {
                "type": int(item[11]),
                "amount": int(item[12])
            }

        converted[item_id] = converted_item

    return converted

