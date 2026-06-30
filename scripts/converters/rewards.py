def convert_score_attack_border_reward(obj):
    """Maps (event_id, folder_id) → [{score, reward_item_id, reward_count, coin_item_id, coin_count}] sorted by score ascending."""
    lookup = {}
    for _, entries in obj.items():
        if not isinstance(entries, list) or not entries:
            continue
        row = entries[0]
        event_id = row[1]
        folder_id = row[2]
        try:
            score = int(float(str(row[4])))
        except:
            score = 0
        reward_item_id = int(row[5]) if row[5] else 0
        coin_item_id = int(row[7]) if row[7] and row[7] != '(None)' else 0
        coin_count = int(row[8]) if row[8] and row[8] != '(None)' else 0
        tier = {
            'score': score,
            'rewardItemId': reward_item_id,
            'rewardCount': 1,
            'coinItemId': coin_item_id,
            'coinCount': coin_count
        }
        key = f'{event_id}_{folder_id}'
        if key not in lookup:
            lookup[key] = []
        lookup[key].append(tier)
    # Sort each key's tiers by score ascending (lowest score threshold first)
    for key in lookup:
        lookup[key].sort(key=lambda t: t['score'])
    return lookup


def convert_clear_rewards(obj):
    converted = {}
    # type map
    # 0 = ?, 1 = equipment, 2 = character, 3 = beads, 4 = mana
    for reward_id, data in obj.items():
        reward_type = int(data[1])
        new = {
            "name": "", #data[0],
            "type": reward_type,
        }
        if (data[2]) != "":
            new["id"] = int(data[2])
        if (data[3]) != "":
            new["count"] = int(data[3])
        converted[reward_id] = new
                
    return converted


def convert_score_reward(obj):
    converted = {}
    # type map
    # 0 = item, 1 = rare score group + id
    for group_id, score_group in obj.items():
        converted_group = []
        for position, reward in score_group.items():
            type = int(reward[1])
            if type == 0:
                converted_reward = {
                    "name": "", #reward[0],
                    "position": int(position),
                    "type": type,
                    "reward_type": int(reward[2]),
                    "count": int(reward[4]),
                    "field5": int(reward[5]),
                }
                if reward[3] != "":
                    converted_reward["id"] = int(reward[3])

                converted_group.append(converted_reward)
            elif type == 1:
                converted_group.append({
                    "name": "", #reward[0],
                    "position": int(position),
                    "type": type,
                    "id": int(reward[6]),
                    "rarity": float(reward[7])
                })
        converted[group_id] = converted_group
    return converted


def convert_rare_score_reward(obj):
    converted = {}
    for group_id, rare_group in obj.items():
        converted_group = []
        for _, reward in rare_group.items():
            name = reward[0]
            type = int(reward[1])
            id = int(reward[2]) if reward[2] != "" else None
            amount = int(reward[3]) if reward[3] != "" else None
            rarity = float(reward[4])

            new_obj = {
                "name": "", #name,
                "type": type,
                "rarity": rarity
            }

            if id != None:
                new_obj['id'] = id
            if amount != None:
                new_obj['count'] = amount
            converted_group.append(new_obj)

        converted[group_id] = converted_group
    return converted


def convert_rush_event_quest_folder(obj):
    converted = {}
    for rush_event_id, folders in obj.items():
        converted_folders = {}
        for folder_id, folder in folders.items():
            folder = folder[0]  # extract inner array
            rewards = []
            reward_offset = 7
            for _ in range (10):
                if folder[reward_offset] != "(None)":
                    reward = {
                        "type": int(folder[reward_offset])
                    }
                    if folder[reward_offset + 1] != "":
                        reward['id'] = int(folder[reward_offset + 1])
                    if folder[reward_offset + 2] != "":
                        reward['count'] = int(folder[reward_offset + 2])
                    rewards.append(reward)
                reward_offset += 3

            converted_folders[folder_id] = rewards

        converted[rush_event_id] = converted_folders
    return converted


def convert_rush_event_ranking_reward(obj):
    """CDN format: event_id → rank_group_id → [[from_rank, to_rank, ?, kind, kind_id, number], ...]"""
    converted = {}
    for event_id, groups in obj.items():
        converted_groups = {}
        for group_id, entries in groups.items():
            rewards = []
            for entry in entries:
                rewards.append({
                    "fromRank": int(entry[0]),
                    "toRank": int(entry[1]),
                    "kind": int(entry[3]) if len(entry) > 3 else 1,
                    "kindId": int(entry[4]) if len(entry) > 4 else 0,
                    "number": int(entry[5]) if len(entry) > 5 else 0
                })
            converted_groups[group_id] = rewards
        converted[event_id] = converted_groups
    return converted
# def convert_mana_nodes_save_data(obj):
#     converted = {}

#     for character_id, levels in obj.items():
#         nodes = []
#         for _, level in levels.items():
#             for _, node in level.items():
#                 nodes.append(int(node[0]))
#         converted[character_id] = nodes

#     return {
#         "user_character_mana_node_list": converted
#     }

