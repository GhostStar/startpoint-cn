require("ts-node/register");

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const sourceUpload = process.env.WF_ASSET_UPLOAD || "D:\\WF\\wf-assets\\upload";
const sourceMasterFiles = [
  "92/917c6aeceee7cf73b275883653bcb89a43f3df",
  "8e/d3874807da6b5881be725cf6198d7a50ead0e0",
  "18/a0d46e2924421136823dafc32f316795cfb024",
];

function sourceFilePath(relativePath) {
  return path.join(sourceUpload, ...relativePath.split("/"));
}

function sourceFileExists(relativePath) {
  return fs.existsSync(sourceFilePath(relativePath));
}

function assertSourceExists(relativePath) {
  const filePath = sourceFilePath(relativePath);
  assert(fs.existsSync(filePath), `missing source master file: ${filePath}`);
  return filePath;
}

const hasSourceMasterFiles = sourceMasterFiles.every(sourceFileExists);

const assetTools = require("./carnival_event_assets.cjs");

{
  assert.strictEqual(typeof assetTools.readCarnivalEventPeriods, "function");
  assert.strictEqual(typeof assetTools.readCarnivalQuestPeriods, "function");
  assert.strictEqual(typeof assetTools.readCarnivalTotalScoreRewards, "function");
}

if (hasSourceMasterFiles) {
  {
    for (const relativePath of sourceMasterFiles) {
      assertSourceExists(relativePath);
    }
  }

  {
    const periods = assetTools.readCarnivalEventPeriods(sourceUpload);
    assert(periods["1"]);
    assert.strictEqual(periods["1"].event_id, 1);
    assert.strictEqual(periods["1"].start_time, "2023-01-22 14:00:00");
    assert.strictEqual(periods["1"].playable_end_time, "2023-01-29 20:59:59");
    assert.strictEqual(periods["1"].exchangeable_end_time, "2023-02-06 04:59:59");
  }

  {
    const quests = assetTools.readCarnivalQuestPeriods(sourceUpload);
    assert(quests["1001"]);
    assert.strictEqual(quests["1001"].quest_id, 1001);
    assert.strictEqual(quests["1001"].event_id, 1);
    assert.strictEqual(quests["1001"].folder_id, 1);
    assert.strictEqual(quests["1001"].start_time, "2023-01-22 14:00:00");
    assert.strictEqual(quests["1001"].end_time, "2023-01-29 20:59:59");
    assert.strictEqual(quests["1001"].difficulty_score, 20);
    assert.strictEqual(quests["1001"].time_limit_ms, 108000);
  }

  {
    const rewards = assetTools.readCarnivalTotalScoreRewards(sourceUpload);
    assert(rewards["1"]);
    assert.strictEqual(rewards["1"].id, 1);
    assert.strictEqual(rewards["1"].event_id, 1);
    assert.strictEqual(rewards["1"].score, 9745000);
    assert.deepStrictEqual(rewards["1"].rewards.slice(0, 4), [
      { kind: 1, id: 5030034, number: 1 },
      { kind: 0, id: 999001, number: 1 },
      { kind: 0, id: 90030, number: 300 },
      { kind: 6, id: 61030, number: 1 },
    ]);

    const stoneReward = rewards["7"];
    assert(stoneReward.rewards.some((reward) => reward.kind === 2 && reward.id === null && reward.number === 200));
  }
}

const carnivalRuntime = require("../src/lib/carnival-event.ts");

{
  assert.strictEqual(carnivalRuntime.CARNIVAL_EVENT_OUT_OF_PERIOD_CODE, 5303);
  assert.strictEqual(carnivalRuntime.CARNIVAL_QUEST_OUT_OF_PERIOD_CODE, 4050);
  assert.strictEqual(carnivalRuntime.parseJstMasterTime("2025-01-14 20:59:59"), Date.UTC(2025, 0, 14, 11, 59, 59));
  assert.strictEqual(carnivalRuntime.parseJstMasterTime(null), null);
  assert.strictEqual(carnivalRuntime.parseJstMasterTime(undefined), null);
  assert.strictEqual(carnivalRuntime.parseJstMasterTime(""), null);
  assert.strictEqual(carnivalRuntime.parseJstMasterTime("   "), null);
  assert.strictEqual(carnivalRuntime.parseJstMasterTime("(None)"), null);
  assert.strictEqual(carnivalRuntime.parseJstMasterTime("not a time"), null);
  assert.strictEqual(carnivalRuntime.parseJstMasterTime("2025-02-30 00:00:00"), null);
}

{
  const lookup = {
    "250601": {
      event_id: 250601,
      start_time: "2024-12-31 14:00:00",
      playable_end_time: "2025-01-14 20:59:59",
      exchangeable_end_time: "2025-01-22 04:59:59",
    },
  };
  assert.strictEqual(carnivalRuntime.getCarnivalEventPeriod(250601, lookup).event_id, 250601);
  assert.strictEqual(carnivalRuntime.getCarnivalEventPeriod(999999, lookup), null);
}

{
  const event = {
    event_id: 250601,
    start_time: "2024-12-31 14:00:00",
    playable_end_time: "2025-01-14 20:59:59",
    exchangeable_end_time: "2025-01-22 04:59:59",
  };
  assert.strictEqual(carnivalRuntime.isCarnivalEventIndexInPeriod(event, Date.UTC(2024, 11, 31, 4, 59, 59)), false);
  assert.strictEqual(carnivalRuntime.isCarnivalEventIndexInPeriod(event, Date.UTC(2024, 11, 31, 5, 0, 0)), true);
  assert.strictEqual(carnivalRuntime.isCarnivalEventIndexInPeriod(event, Date.UTC(2025, 0, 20, 0, 0, 0)), true);
  assert.strictEqual(carnivalRuntime.isCarnivalEventIndexInPeriod(event, Date.UTC(2025, 0, 21, 19, 59, 59)), false);
  assert.strictEqual(carnivalRuntime.isCarnivalEventIndexInPeriod({
    ...event,
    exchangeable_end_time: null,
    playable_end_time: null,
  }, Date.UTC(2030, 0, 1, 0, 0, 0)), true);
  assert.strictEqual(carnivalRuntime.isCarnivalEventIndexInPeriod({
    ...event,
    exchangeable_end_time: "not a time",
    playable_end_time: null,
  }, Date.UTC(2025, 0, 20, 0, 0, 0)), false);
  assert.strictEqual(carnivalRuntime.isCarnivalEventIndexInPeriod({
    ...event,
    exchangeable_end_time: null,
    playable_end_time: "not a time",
  }, Date.UTC(2025, 0, 10, 0, 0, 0)), false);
}

{
  const event = {
    event_id: 250601,
    start_time: "2024-12-31 14:00:00",
    playable_end_time: "2025-01-14 20:59:59",
    exchangeable_end_time: "2025-01-22 04:59:59",
  };
  const quest = {
    quest_id: 250601001,
    event_id: 250601,
    folder_id: 1,
    start_time: "2024-12-31 14:00:00",
    end_time: "2025-01-14 20:59:59",
    difficulty_score: 20,
    time_limit_ms: 108000,
  };
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod(quest, event, Date.UTC(2024, 11, 31, 4, 59, 59)), false);
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod(quest, event, Date.UTC(2025, 0, 1, 0, 0, 0)), true);
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod(quest, event, Date.UTC(2025, 0, 20, 0, 0, 0)), false);
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod(quest, event, Date.UTC(2025, 0, 14, 11, 59, 58)), true);
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod(quest, event, Date.UTC(2025, 0, 14, 11, 59, 59)), false);
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod({ ...quest, event_id: 250602 }, event, Date.UTC(2025, 0, 1, 0, 0, 0)), false);
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod(quest, {
    ...event,
    start_time: "not a time",
  }, Date.UTC(2025, 0, 1, 0, 0, 0)), false);
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod(quest, {
    ...event,
    start_time: "2025-01-02 14:00:00",
  }, Date.UTC(2025, 0, 1, 0, 0, 0)), false);
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod(quest, {
    ...event,
    start_time: "2025-01-02 14:00:00",
  }, Date.UTC(2025, 0, 3, 0, 0, 0)), true);
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod(null, event, Date.UTC(2025, 0, 1, 0, 0, 0)), false);
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod(quest, null, Date.UTC(2025, 0, 1, 0, 0, 0)), false);
}

{
  const lookup = {
    "250601001": {
      quest_id: 250601001,
      event_id: 250601,
      folder_id: 1,
      start_time: "2024-12-31 14:00:00",
      end_time: "2025-01-14 20:59:59",
      difficulty_score: 20,
      time_limit_ms: 108000,
    },
  };
  assert.strictEqual(carnivalRuntime.getCarnivalQuestPeriod(250601001, lookup).event_id, 250601);
  assert.strictEqual(carnivalRuntime.getCarnivalQuestPeriod(999999, lookup), null);
}

{
  const event = {
    event_id: 250601,
    start_time: "2024-12-31 14:00:00",
    playable_end_time: "2025-01-14 20:59:59",
    exchangeable_end_time: "2025-01-22 04:59:59",
  };
  const quest = {
    quest_id: 250601002,
    event_id: 250601,
    folder_id: 1,
    start_time: "2024-12-31 14:00:00",
    end_time: null,
    difficulty_score: 20,
    time_limit_ms: 108000,
  };
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod(quest, event, Date.UTC(2025, 0, 1, 0, 0, 0)), true);
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod({
    ...quest,
    end_time: "not a time",
  }, event, Date.UTC(2025, 0, 1, 0, 0, 0)), false);
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod({
    ...quest,
    end_time: "2025-01-22 04:59:59",
  }, event, Date.UTC(2025, 0, 14, 11, 59, 58)), true);
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod({
    ...quest,
    end_time: "2025-01-22 04:59:59",
  }, event, Date.UTC(2025, 0, 14, 11, 59, 59)), false);
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod(quest, {
    ...event,
    playable_end_time: "not a time",
  }, Date.UTC(2025, 0, 1, 0, 0, 0)), false);
}

{
  const eventWithoutPlayableCap = {
    event_id: 250601,
    start_time: "2024-12-31 14:00:00",
    playable_end_time: null,
  };
  const unboundedQuest = {
    quest_id: 250601003,
    event_id: 250601,
    folder_id: 1,
    start_time: "2024-12-31 14:00:00",
    end_time: null,
    difficulty_score: 20,
    time_limit_ms: 108000,
  };
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod(unboundedQuest, eventWithoutPlayableCap, Date.UTC(2035, 0, 1, 0, 0, 0)), true);

  const blankEndEvent = {
    event_id: 250602,
    start_time: "2024-12-31 14:00:00",
    playable_end_time: "",
    exchangeable_end_time: "",
  };
  assert.strictEqual(carnivalRuntime.isCarnivalEventIndexInPeriod(blankEndEvent, Date.UTC(2035, 0, 1, 0, 0, 0)), true);
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod({
    ...unboundedQuest,
    event_id: 250602,
    end_time: "",
  }, blankEndEvent, Date.UTC(2035, 0, 1, 0, 0, 0)), true);

  const noneEndEvent = {
    event_id: 250603,
    start_time: "2024-12-31 14:00:00",
    playable_end_time: "(None)",
    exchangeable_end_time: "(None)",
  };
  assert.strictEqual(carnivalRuntime.isCarnivalEventIndexInPeriod(noneEndEvent, Date.UTC(2035, 0, 1, 0, 0, 0)), true);
  assert.strictEqual(carnivalRuntime.isCarnivalQuestStartInPeriod({
    ...unboundedQuest,
    event_id: 250603,
    end_time: "(None)",
  }, noneEndEvent, Date.UTC(2035, 0, 1, 0, 0, 0)), true);
}

const serializePlayer = require("../src/data/utils/serialize-player.ts");
const carnivalDomain = require("../src/data/domains/carnivalEvent.ts");

function createMinimalMergedPlayerData(carnivalEventRecordList) {
  const now = new Date();

  return {
    player: {
      id: -250601,
      stamina: 10,
      staminaHealTime: now,
      boostPoint: 10,
      bossBoostPoint: 3,
      transitionState: 0,
      role: 1,
      name: "test",
      lastLoginTime: now,
      comment: "",
      vmoney: 0,
      freeVmoney: 0,
      rankPoint: 0,
      starCrumb: 0,
      bondToken: 0,
      expPool: 0,
      expPooledTime: now,
      leaderCharacterId: 1,
      partySlot: 1,
      degreeId: 1,
      birth: 19900101,
      freeMana: 0,
      paidMana: 0,
      enableAuto3x: false,
      totalStaminaUsed: 0,
      totalPowerflips: 0,
      totalDashes: 0,
      totalManaObtained: 0,
      maxComboAchieved: 0,
      totalLoginDays: 0,
      tutorialStep: null,
      tutorialSkipFlag: null,
      tutorialGachaCharacterId: null,
      timeOffset: null,
    },
    dailyChallengePointList: [],
    triggeredTutorial: [],
    clearedRegularMissionList: {},
    characterList: {},
    characterManaNodeList: {},
    partyGroupList: {},
    itemList: {},
    equipmentList: {},
    questProgress: {},
    gachaInfoList: [],
    gachaCampaignList: [],
    drawnQuestList: [],
    periodicRewardPointList: [],
    allActiveMissionList: {},
    boxGachaList: {},
    purchasedTimesList: {},
    startDashExchangeCampaignList: [],
    multiSpecialExchangeCampaignList: [],
    userOption: {},
    carnivalEventRecordList,
  };
}

{
  assert.strictEqual(typeof serializePlayer.serializeCarnivalEventRecordList, "function");
  assert.strictEqual(typeof carnivalDomain.getAllPlayerCarnivalEventRecordsSync, "function");

  const carnivalRecords = [
    { eventId: 250601, folderId: 1, bestScore: 120, previousScore: 100, previousCharacterIds: [1], previousUnisonCharacterIds: [2] },
    { eventId: 250601, folderId: 2, bestScore: null, previousScore: null, previousCharacterIds: null, previousUnisonCharacterIds: null },
    { eventId: 250602, folderId: 1, bestScore: 220, previousScore: 200, previousCharacterIds: [3], previousUnisonCharacterIds: [4] },
  ];

  const expectedCarnivalRecordList = {
    "250601": {
      records: [
        { folder_id: 1, best_score: 120 },
        { folder_id: 2 },
      ],
    },
    "250602": {
      records: [
        { folder_id: 1, best_score: 220 },
      ],
    },
  };

  const serialized = serializePlayer.serializeCarnivalEventRecordList(carnivalRecords);

  assert.deepStrictEqual(serialized, expectedCarnivalRecordList);

  assert.strictEqual("previous_score" in serialized["250601"].records[0], false);
  assert.strictEqual("previous_character_ids" in serialized["250601"].records[0], false);
  assert.strictEqual("previous_unison_character_ids" in serialized["250601"].records[0], false);

  const defaultSerializedPlayerData = serializePlayer.serializePlayerData(
    createMinimalMergedPlayerData(carnivalRecords)
  );
  assert.strictEqual("carnival_event_record_list" in defaultSerializedPlayerData, false);

  const falseSerializedPlayerData = serializePlayer.serializePlayerData(
    createMinimalMergedPlayerData(carnivalRecords),
    { serializeCarnivalEventData: false }
  );
  assert.strictEqual("carnival_event_record_list" in falseSerializedPlayerData, false);

  const trueSerializedPlayerData = serializePlayer.serializePlayerData(
    createMinimalMergedPlayerData(carnivalRecords),
    { serializeCarnivalEventData: true }
  );
  assert.deepStrictEqual(trueSerializedPlayerData.carnival_event_record_list, expectedCarnivalRecordList);
}

{
  const carnivalEventRouteSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "routes", "api", "carnivalEvent.ts"),
    "utf-8"
  );

  assert(carnivalEventRouteSource.includes("CARNIVAL_EVENT_OUT_OF_PERIOD_CODE"));
  assert(carnivalEventRouteSource.includes("isCarnivalEventIndexInPeriod"));
  assert(carnivalEventRouteSource.includes("carnivalEventPeriods"));
  assert(carnivalEventRouteSource.includes("result_code: CARNIVAL_EVENT_OUT_OF_PERIOD_CODE"));

  const indexPeriodCheck = carnivalEventRouteSource.indexOf("if (!isCarnivalEventIndexInPeriod");
  const indexPartyGroupBuild = carnivalEventRouteSource.indexOf("buildCarnivalPartyGroupList(playerId)");
  assert(indexPeriodCheck !== -1, "carnival index route must call the period helper in the handler");
  assert(indexPartyGroupBuild !== -1, "carnival index route must build party groups");
  assert(indexPeriodCheck < indexPartyGroupBuild, "carnival period check must happen before carnival party groups are built");
}

{
  const singleBattleQuestRouteSource = fs.readFileSync(
    path.join(__dirname, "..", "src", "routes", "api", "singleBattleQuest.ts"),
    "utf-8"
  );

  assert(singleBattleQuestRouteSource.includes("CARNIVAL_QUEST_OUT_OF_PERIOD_CODE"));
  assert(singleBattleQuestRouteSource.includes("isCarnivalQuestStartInPeriod"));
  assert(singleBattleQuestRouteSource.includes("carnivalEventQuestPeriods"));
  assert(singleBattleQuestRouteSource.includes("eventId: carnivalQuestPeriod?.event_id"));
  assert(singleBattleQuestRouteSource.includes("result_code: CARNIVAL_QUEST_OUT_OF_PERIOD_CODE"));
  assert(singleBattleQuestRouteSource.includes("getServerDate().getTime()"));

  const questPeriodCheck = singleBattleQuestRouteSource.indexOf("if (!isCarnivalQuestStartInPeriod");
  const questCostLookup = singleBattleQuestRouteSource.indexOf("const questKey = `${category}_${questId}`", questPeriodCheck);
  const questItemDeduction = singleBattleQuestRouteSource.indexOf("updatePlayerItemSync(", questPeriodCheck);
  const questPlayerUpdate = singleBattleQuestRouteSource.indexOf("updatePlayerSync({", questPeriodCheck);
  assert(questPeriodCheck !== -1, "single battle start route must call the carnival period helper in the handler");
  assert(questCostLookup !== -1, "single battle start route must look up entry cost after the period check");
  assert(questItemDeduction !== -1, "single battle start route must deduct entry items after the period check");
  assert(questPlayerUpdate !== -1, "single battle start route must update player state after the period check");
  assert(questPeriodCheck < questCostLookup, "carnival quest period check must happen before entry cost lookup");
  assert(questPeriodCheck < questItemDeduction, "carnival quest period check must happen before item deduction");
  assert(questPeriodCheck < questPlayerUpdate, "carnival quest period check must happen before stamina/player updates");
}

console.log("carnival_event_remaining_flow tests passed");
