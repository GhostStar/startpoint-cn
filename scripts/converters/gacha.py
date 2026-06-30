box_total_counts = {}

def convert_box_rewards(obj):
    converted = {}
    for gacha_id, boxes in obj.items():
        converted_gacha = {}
        box_total_counts[str(gacha_id)] = {}
        for box_id, box in boxes.items():
            converted_box = {}
            box_total_counts[str(gacha_id)][str(box_id)] = 0
            for _, reward in box.items():
                reward = reward[0]  # extract inner array
                converted_reward = {
                    "type": int(reward[2]),
                    "count": int(reward[4]),
                    "available": int(reward[5]),
                    "tier": int(reward[6])
                }
                box_total_counts[str(gacha_id)][str(box_id)] += converted_reward["available"]
                if reward[3] != "":
                    converted_reward["id"] = int(reward[3])
                
                converted_box[reward[0]] = converted_reward
            converted_gacha[box_id] = converted_box
        converted[gacha_id] = converted_gacha
    return converted


def convert_box_gacha(obj):
    converted = {}
    for gacha_id, gacha in obj.items():
        gacha = gacha[0]  # extract inner array
        converted[gacha_id] = {
            "itemId": int(gacha[2]),
            "count": int(gacha[3]),
            "availableCounts": box_total_counts.get(str(gacha_id), {})
        }
    return converted


def convert_gacha_rarities(path):
    converted = []
    with open(path, "r") as file:
        obj = json.load(file)
        total_odds = 0
        for rarity_entry in list(obj.values())[0].values():
            odds = int(rarity_entry[2])
            converted.append({
                "id": int(rarity_entry[0]),
                "rank": int(rarity_entry[1]),
                "odds": odds,
                "isRateUp": True if rarity_entry[3] == 'true' else False
            })
            total_odds += odds

        # calculate rarities
        for converted_rarity in converted:
            converted_rarity["rarity"] = round((converted_rarity["odds"] / total_odds) * 1000, 2)

    return converted


def convert_gacha(obj):
    converted = {}
    for gacha_id, gacha_data in obj.items():
        payment_type = int(gacha_data[4])

        # 0 = character; 1 = weapon
        gacha_type = int(gacha_data[13])
        if payment_type == 0:
            single_cost = int(gacha_data[5])
            multi_cost = int(gacha_data[6])
            discount_single_cost = int(gacha_data[7])

            if gacha_type == 0:
                converted_gacha = {
                    "type": gacha_type,
                    "paymentType": payment_type,
                    "singleCost": single_cost,
                    "multiCost": multi_cost,
                    "discountCost": discount_single_cost,
                    "movieName": gacha_data[17],
                    "guaranteeMovieName": gacha_data[18],
                    #"onceFreeMulti": True if gacha_data[20] == "true" else False,
                    #"dailyFreeMulti": True if gacha_data[21] == "true" else False,
                    "startDate": gacha_data[29],
                    "endDate": gacha_data[30]
                }
                # get rarity files
                converted_gacha["pool"] = {
                    "3": convert_gacha_rarities(os.path.join(util.FILE_INPUT, "gacha_odds", f"{gacha_data[14]}.json")),
                    "2": convert_gacha_rarities(os.path.join(util.FILE_INPUT, "gacha_odds", f"{gacha_data[15]}.json")),
                    "1": convert_gacha_rarities(os.path.join(util.FILE_INPUT, "gacha_odds", f"{gacha_data[16]}.json")),
                }
                converted[gacha_id] = converted_gacha 

            elif gacha_type == 1:
                converted_gacha = {
                    "type": gacha_type,
                    "paymentType": payment_type,
                    "singleCost": single_cost,
                    "multiCost": multi_cost,
                    "discountCost": discount_single_cost,
                    "startDate": gacha_data[29],
                    "endDate": gacha_data[30]
                }
                # get rarity files
                converted_gacha["pool"] = {
                    "3": convert_gacha_rarities(os.path.join(util.FILE_INPUT, "gacha_odds", f"{gacha_data[22]}.json")),
                    "2": convert_gacha_rarities(os.path.join(util.FILE_INPUT, "gacha_odds", f"{gacha_data[23]}.json")),
                    "1": convert_gacha_rarities(os.path.join(util.FILE_INPUT, "gacha_odds", f"{gacha_data[24]}.json")),
                }
                converted[gacha_id] = converted_gacha
                pass
    
    return converted


def convert_gacha_campaigns(obj):
    campaign_map = {}
    for campaign_id, data in obj.items():
        campaign_id = int(campaign_id)
        for gacha_id in data[5].split(","):
            campaign_map[gacha_id] = campaign_id
    return campaign_map

