def convert_characters(obj):
    converted = {}
    for characterId, data in obj.items():
        converted[characterId] = {
            "name": "", #data[0],
            "rarity": int(data[2]),
            "element": int(data[3]),
            "skill_count": data[36].split(",").count("6")
        }
    return converted


def convert_mana_nodes(obj):
    converted = {}
    for characterId, data in obj.items():
        levels = {}
        for level, nodes in data.items():
            mana_nodes = {}
            for _, node in nodes.items():
                item_list = {}
                item_costs = node[3].split(",")
                
                for n, item_id in enumerate(node[2].split(",")):
                    item_list[item_id.strip()] = int(item_costs[n].strip())

                mana_nodes[node[0]] = {
                    "items": item_list,
                    "manaCost": int(node[4]),
                    "field1": node[1],
                    "field5": node[5],
                    "field6": node[6]
                }
            levels[level] = mana_nodes
        converted[characterId] = levels
    return converted


def convert_ex_boost(obj):
    converted = {}
    for item_id, ex_boost_item in obj.items():
        name = ex_boost_item[1]
        new =  {
            "tier": 3 if name.endswith("r5") else 2 if name.endswith("r4") else 1,
            "count": int(ex_boost_item[0])
        }
        if len(ex_boost_item[2]) == 1:
            new['element'] = int(ex_boost_item[2])
        converted[item_id] = new
    return converted


def convert_ex_status(obj):
    converted = {
        1: [], # 3*
        2: [], # 4*
        3: []  # 5*
    }
    for status_id, status in obj.items():
        tier = int(status[3]) - 2

        converted[tier].append(int(status_id))
    return converted


def convert_ex_ability(obj):
    converted = {
        1: [], # 3*
        2: [], # 4*
        3: []  # 5*
    }
    for ability_id, status in obj.items():
        tier = int(status[2]) - 2

        converted[tier].append(int(ability_id))
    return converted

box_total_counts = {}

