require("ts-node/register");

const assert = require("assert");

const { QuestCategory } = require("../src/lib/types/quest.ts");
const {
  convertCarnivalRewardsToPlayerRewards,
  handleCarnivalEventFinish,
} = require("../src/lib/quest/finish/carnival-handler.ts");
const carnivalEventDomain = require("../src/data/domains/carnivalEvent.ts");

{
  for (const exportName of [
    "sumPlayerCarnivalEventBestScoreSync",
    "resetPlayerCarnivalEventRecordsSync",
    "getReceivedCarnivalEventTotalScoreRewardIdsSync",
    "insertReceivedCarnivalEventTotalScoreRewardSync",
  ]) {
    assert.strictEqual(typeof carnivalEventDomain[exportName], "function", `${exportName} should be exported`);
  }
}

function makeParty(mainIds, unisonIds) {
  return {
    characters: mainIds.map((id) => ({ id })),
    unison_characters: unisonIds.map((id) => ({ id })),
    leader: { id: mainIds[0] },
  };
}

function makeHarness(initialRecords = [], receivedRewardIds = []) {
  const records = initialRecords.map((record) => ({ ...record }));
  const insertedRewardIds = [];
  const resetFolderIds = [];
  const givenRewards = [];

  return {
    records,
    insertedRewardIds,
    resetFolderIds,
    givenRewards,
    params(extra = {}) {
      return {
        questCategory: QuestCategory.CARNIVAL_EVENT,
        questAccomplished: true,
        questId: 1001,
        clearTime: 12.4,
        party: makeParty([101, 102, 103], [201, 202, null]),
        playerId: 77,
        carnivalLookup: {
          1001: { difficulty_score: 25.4, time_limit_ms: 100, folder_id: 10, event_id: 9 },
        },
        getRecordsFn: (playerId, eventId) => {
          assert.strictEqual(playerId, 77);
          assert.strictEqual(eventId, 9);
          return records.map((record) => ({ ...record }));
        },
        resetRecordsFn: (_playerId, _eventId, folderIds) => {
          resetFolderIds.push(...folderIds);
          for (const folderId of folderIds) {
            const record = records.find((item) => item.folderId === folderId);
            assert(record, `missing folder ${folderId}`);
            record.bestScore = 0;
            record.previousScore = 0;
            record.previousCharacterIds = null;
            record.previousUnisonCharacterIds = null;
          }
        },
        upsertFn: (_playerId, eventId, folderId, score, chars, unisons) => {
          assert.strictEqual(eventId, 9);
          let record = records.find((item) => item.folderId === folderId);
          if (!record) {
            record = { eventId, folderId, bestScore: null, previousScore: null };
            records.push(record);
          }
          record.previousScore = score;
          record.bestScore = Math.max(record.bestScore ?? 0, score);
          record.previousCharacterIds = chars;
          record.previousUnisonCharacterIds = unisons;
          return { ...record };
        },
        totalScoreRewards: [
          { id: 100, event_id: 9, score: 100, rewards: [{ kind: 3, id: null, number: 1000 }] },
          { id: 101, event_id: 9, score: 300, rewards: [{ kind: 7, id: 501, number: 1 }] },
          { id: 102, event_id: 9, score: 350, rewards: [{ kind: 0, id: 11, number: 2 }] },
          { id: 103, event_id: 9, score: 9999, rewards: [{ kind: 3, id: null, number: 1 }] },
        ],
        getReceivedRewardIdsFn: (_playerId, eventId) => {
          assert.strictEqual(eventId, 9);
          return receivedRewardIds;
        },
        insertReceivedRewardFn: (_playerId, eventId, rewardId) => {
          assert.strictEqual(eventId, 9);
          insertedRewardIds.push(rewardId);
          receivedRewardIds.push(rewardId);
        },
        giveRewardsFn: (_playerId, rewards) => {
          givenRewards.push(...rewards);
          return { user_info: { free_mana: 0, free_vmoney: 0, exp_pool: 0 }, character_list: [], joined_character_id_list: [], equipment_list: [], items: {} };
        },
        ...extra,
      };
    },
  };
}

{
  const harness = makeHarness();
  const result = handleCarnivalEventFinish(harness.params());

  assert.strictEqual(result.clientData.score.difficulty_bonus, 25);
  assert.strictEqual(result.clientData.score.time_bonus, 88);
  assert.strictEqual(harness.records.find((record) => record.folderId === 10).previousScore, 113);
  assert.strictEqual(harness.records.find((record) => record.folderId === 10).bestScore, 113);
}

{
  const harness = makeHarness([
    { eventId: 9, folderId: 10, bestScore: 150, previousScore: 150, previousCharacterIds: [101], previousUnisonCharacterIds: [201] },
  ]);
  handleCarnivalEventFinish(harness.params({ clearTime: 80 }));

  const record = harness.records.find((item) => item.folderId === 10);
  assert.strictEqual(record.previousScore, 45);
  assert.strictEqual(record.bestScore, 150);
}

{
  const harness = makeHarness([
    { eventId: 9, folderId: 10, bestScore: 100, previousScore: 100, previousCharacterIds: [101], previousUnisonCharacterIds: [201] },
  ]);
  handleCarnivalEventFinish(harness.params({ clearTime: 1 }));

  const record = harness.records.find((item) => item.folderId === 10);
  assert.strictEqual(record.previousScore, 124);
  assert.strictEqual(record.bestScore, 124);
}

{
  const harness = makeHarness([
    { eventId: 9, folderId: 10, bestScore: 40, previousScore: 40, previousCharacterIds: [101], previousUnisonCharacterIds: [201] },
    { eventId: 9, folderId: 11, bestScore: 200, previousScore: 200, previousCharacterIds: [999, 102], previousUnisonCharacterIds: [888] },
    { eventId: 9, folderId: 12, bestScore: 300, previousScore: 300, previousCharacterIds: [777], previousUnisonCharacterIds: [666] },
  ]);

  const result = handleCarnivalEventFinish(harness.params());

  assert.strictEqual(result.clientData.previous_total_best_score, 540);
  assert.deepStrictEqual(harness.resetFolderIds, [11]);
  assert.strictEqual(harness.records.find((item) => item.folderId === 11).bestScore, 0);
  assert.strictEqual(harness.records.find((item) => item.folderId === 12).bestScore, 300);
}

{
  const harness = makeHarness([
    { eventId: 9, folderId: 10, bestScore: 40, previousScore: 40, previousCharacterIds: [101, 102], previousUnisonCharacterIds: [201] },
  ]);

  handleCarnivalEventFinish(harness.params());

  assert.strictEqual(harness.records.length, 1);
  assert.strictEqual(harness.records[0].bestScore, 113);
}

{
  const harness = makeHarness([
    { eventId: 9, folderId: 10, bestScore: 40, previousScore: 40, previousCharacterIds: [101], previousUnisonCharacterIds: [201] },
    { eventId: 9, folderId: 12, bestScore: 250, previousScore: 250, previousCharacterIds: [777], previousUnisonCharacterIds: [666] },
  ], [101]);

  const result = handleCarnivalEventFinish(harness.params());

  assert.deepStrictEqual(result.clientData.reward_ids, [102]);
  assert.deepStrictEqual(harness.insertedRewardIds, [102]);
  assert.deepStrictEqual(result.clientData.new_degree_ids, []);
  assert.deepStrictEqual(harness.givenRewards, [{ type: 0, id: 11, count: 2 }]);
}

{
  const harness = makeHarness([
    { eventId: 9, folderId: 10, bestScore: 40, previousScore: 40, previousCharacterIds: [101], previousUnisonCharacterIds: [201] },
    { eventId: 9, folderId: 12, bestScore: 250, previousScore: 250, previousCharacterIds: [777], previousUnisonCharacterIds: [666] },
  ]);

  const result = handleCarnivalEventFinish(harness.params());

  assert.deepStrictEqual(result.clientData.new_degree_ids, [501]);
  assert.deepStrictEqual(result.clientData.reward_ids, [101, 102]);
}

assert.deepStrictEqual(
  convertCarnivalRewardsToPlayerRewards([
    { kind: 0, id: 11, number: 2 },
    { kind: 1, id: 22, number: 1 },
    { kind: 3, id: null, number: 300 },
    { kind: 4, id: null, number: 400 },
    { kind: 6, id: 33, number: 1 },
    { kind: 7, id: 44, number: 1 },
  ]),
  [
    { type: 0, id: 11, count: 2 },
    { type: 1, id: 22, count: 1 },
    { type: 4, count: 300 },
    { type: 5, count: 400 },
    { type: 2, id: 33 },
  ],
);

console.log("carnival_event_core_flow tests passed");
