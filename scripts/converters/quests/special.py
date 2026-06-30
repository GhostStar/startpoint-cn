from math import floor
import field_map as f
import quest_builder as qb

def convert_ranking_event_single_quest(obj):
    layout = f.TYPE_MAP['ranking_event_single_quest']['layout']
    converted = {}
    for _, quests in obj.items():
        for _, quest in quests.items():
            row = qb.unwrap(quest)
            converted[row[layout['quest_id']]] = {
                "name": "",
                "bRankTime": 0,
                "aRankTime": 0,
                "sRankTime": 0,
                "sPlusRankTime": 0,
                "rankPointReward": 0,
                "characterExpReward": 0,
                "manaReward": 0,
                "poolExpReward": 0
            }
    return converted 



def convert_solo_time_attack_event_quest(obj):
    return qb.convert_3level(obj, f.TYPE_MAP['solo_time_attack_event_quest']['layout'], hardcode_clear_reward=False, hardcode_s_plus=True)



def convert_raid_event_quest(obj):
    converted = {}
    for _, quests in obj.items():
        for _, quest in quests.items():
            quest = quest[0]  # extract inner array
            clear_reward = quest[6] if len(quest) > 6 and quest[6] != '' and quest[6] != '(None)' else '1'
            converted[quest[0]] = {
                "name": "",
                "clearRewardId": int(clear_reward),
                "sPlusRewardId": 1,
                "bRankTime": floor(float(quest[82]) * 1000) if len(quest) > 82 and quest[82] not in ('', '(None)') else 0,
                "aRankTime": floor(float(quest[83]) * 1000) if len(quest) > 83 and quest[83] not in ('', '(None)') else 0,
                "sRankTime": floor(float(quest[84]) * 1000) if len(quest) > 84 and quest[84] not in ('', '(None)') else 0,
                "sPlusRankTime": floor(float(quest[85]) * 1000) if len(quest) > 85 and quest[85] not in ('', '(None)') else 0,
                "rankPointReward": int(quest[96]) if len(quest) > 96 and quest[96] not in ('', '(None)') else 0,
                "characterExpReward": int(quest[97]) if len(quest) > 97 and quest[97] not in ('', '(None)') else 0,
                "manaReward": int(quest[98]) if len(quest) > 98 and quest[98] not in ('', '(None)') else 0,
                "poolExpReward": 0
            }
            if len(quest) > 69 and quest[69] not in ('', '(None)'):
                converted[quest[0]]["scoreRewardGroupId"] = int(quest[69])
    return converted 



def convert_character_quests(obj):
    converted = {}
    for story_id, character_story in obj.items():
        converted[story_id] = {
            "name": "", #character_story[3],
            "clearRewardId": int(character_story[5])
        }
    return converted


