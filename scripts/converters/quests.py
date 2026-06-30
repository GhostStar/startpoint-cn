from math import floor
import field_map as f
import quest_builder as qb

def convert_main_ex_quests(obj):
    converted = {}
    for _, chapter_stages in obj.items():
        for _, sub_stages in chapter_stages.items():
            for _, chapter in sub_stages.items():
                chapter = chapter[0]  # extract inner array
                # determine whether the quest is a story or not
                if chapter[84] == "":
                    # is story
                    converted[chapter[0]] = {
                        "name": "", #chapter[1],
                        "clearRewardId": int(chapter[3])
                    }
                else:
                    converted_chapter = {
                        "name": "", #chapter[1],
                        "clearRewardId": int(chapter[3]),
                        "sPlusRewardId": 1,
                        "scoreRewardGroupId": int(chapter[70]),
                        "bRankTime": floor(float(chapter[84]) * 1000),
                        "aRankTime": floor(float(chapter[85]) * 1000),
                        "sRankTime": floor(float(chapter[86]) * 1000),
                        "sPlusRankTime":  floor(float(chapter[87]) * 1000),
                        "rankPointReward": int(chapter[93]),
                        "characterExpReward": int(chapter[94]),
                        "manaReward": int(chapter[95]),
                        "poolExpReward": int(chapter[96])
                    }
                    if chapter[118] != "(None)":
                        converted_chapter["fixedParty"] = int(chapter[118])
                    if chapter[72] != "(None)" and chapter[72] != "":
                        converted_chapter["element"] = int(chapter[72])
                    converted[chapter[0]] = converted_chapter
    return converted


def convert_boss_quests(obj):
    converted = {}
    for _, chapter_stages in obj.items():
        for _, sub_stages in chapter_stages.items():
            for _, chapter in sub_stages.items():
                chapter = chapter[0]  # extract inner array
                # determine whether the quest is a story or not
                if chapter[84] == "" or chapter[84] == "(None)":
                    # is story
                    converted[chapter[0]] = {
                        "name": "", #chapter[1],
                        "clearRewardId": int(chapter[3])
                    }
                else:
                    converted[chapter[0]] = {
                        "name": "", #chapter[2],
                        "clearRewardId": int(chapter[4]),
                        "sPlusRewardId": 1,
                        "scoreRewardGroupId": int(chapter[70]),
                        "bRankTime": floor(float(chapter[84]) * 1000),
                        "aRankTime": floor(float(chapter[85]) * 1000),
                        "sRankTime": floor(float(chapter[86]) * 1000),
                        "sPlusRankTime":  floor(float(chapter[87]) * 1000),
                        "rankPointReward": int(chapter[93]),
                        "characterExpReward": int(chapter[94]),
                        "manaReward": int(chapter[95]),
                        "poolExpReward": int(chapter[96])
                    }
                    if chapter[72] != "(None)" and chapter[72] != "":
                        converted[chapter[0]]["element"] = int(chapter[72])
    return converted


def convert_world_story_event_quest(obj):
    return qb.convert_3level_with_story(obj, f.TYPE_MAP['world_story_event_quest']['layout'])


def convert_world_story_event_boss_battle_quest(obj):
    return qb.convert_3level(obj, f.TYPE_MAP['world_story_event_boss_battle_quest']['layout'], hardcode_s_plus=True)


def convert_advent_quest(obj):
    return qb.convert_3level_with_story(obj, f.TYPE_MAP['advent_event_quest']['layout'])


def convert_daily_exp_mana_event_quest(obj):
    return qb.convert_3level(obj, f.TYPE_MAP['daily_exp_mana_event_quest']['layout'], hardcode_s_plus=False)


def convert_daily_week_event_quest(obj):
    return qb.convert_3level(obj, f.TYPE_MAP['daily_week_event_quest']['layout'], hardcode_s_plus=False)


def convert_challenge_dungeon_event_quest(obj):
    return qb.convert_3level(obj, f.TYPE_MAP['challenge_dungeon_event_quest']['layout'])


def convert_story_event_single_quest(obj):
    return qb.convert_3level_with_story(obj, f.TYPE_MAP['story_event_single_quest']['layout'])


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


def convert_tower_dungeon_event_quest(obj):
    return qb.convert_3level(obj, f.TYPE_MAP['tower_dungeon_event_quest']['layout'], hardcode_clear_reward=False, hardcode_s_plus=False)


def convert_expert_single_event_quest(obj):
    return qb.convert_3level_with_event(obj, f.TYPE_MAP['expert_single_event_quest']['layout'], event_field_name='eventId')


def convert_carnival_event_quest(obj):
    return qb.convert_3level(obj, f.TYPE_MAP['carnival_event_quest']['layout'], hardcode_s_plus=False)


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


def convert_rush_event_quest(obj):
    converted = {}
    for rush_event_id_str, quests in obj.items():
        rush_event_id = int(rush_event_id_str)
        for _, quest in quests.items():
            quest = quest[0]  # extract inner array
            converted[quest[0]] = {
                "name": "",
                "bRankTime": 0,
                "aRankTime": 0,
                "sRankTime": 0,
                "sPlusRankTime": 0,
                "rankPointReward": int(quest[82]),
                "characterExpReward": int(quest[83]),
                "manaReward": int(quest[84]),
                "poolExpReward": int(quest[85]),
                "rushEventId": rush_event_id,
                "rushEventFolderId": int(quest[1]),
                "rushEventRound": int(quest[2])
            }
            if quest[73] != "(None)" and quest[73] != "":
                converted[quest[0]]["element"] = int(quest[73])
    return converted 


def convert_score_attack_event_quest(obj):
    converted = {}
    for event_id, folders in obj.items():
        for folder_id, wrapper in folders.items():
            if isinstance(wrapper, list):
                for quest in wrapper:
                    if not isinstance(quest, list) or len(quest) < 90:
                        continue
                    qid = quest[0]
                    # Boss-only quests (10xx) have no rank times
                    if len(quest) <= 85 or quest[85] == '' or quest[85] == '(None)':
                        converted[qid] = {
                            "name": "",
                            "clearRewardId": 1
                        }
                    else:
                        converted[qid] = {
                            "name": "",
                            "clearRewardId": 1,
                            "sPlusRewardId": 1,
                            "bRankTime": floor(float(quest[85]) * 1000),
                            "aRankTime": floor(float(quest[86]) * 1000),
                            "sRankTime": floor(float(quest[87]) * 1000),
                            "sPlusRankTime": floor(float(quest[88]) * 1000),
                            "rankPointReward": int(float(quest[92])) if len(quest) > 92 and quest[92] != '' else 0,
                            "characterExpReward": int(float(quest[93])) if len(quest) > 93 and quest[93] != '' else 0,
                            "manaReward": int(float(quest[94])) if len(quest) > 94 and quest[94] != '' else 0,
                            "poolExpReward": int(float(quest[95])) if len(quest) > 95 and quest[95] != '' else 0
                        }
                        if len(quest) > 70 and quest[70] != '' and quest[70] != '(None)':
                            converted[qid]["scoreRewardGroupId"] = int(quest[70])
                            converted[qid]["folderId"] = int(quest[70])
                        converted[qid]["eventId"] = int(event_id)
    return converted


def convert_character_quests(obj):
    converted = {}
    for story_id, character_story in obj.items():
        converted[story_id] = {
            "name": "", #character_story[3],
            "clearRewardId": int(character_story[5])
        }
    return converted

