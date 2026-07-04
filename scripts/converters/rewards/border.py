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


