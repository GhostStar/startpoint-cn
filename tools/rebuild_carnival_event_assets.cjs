#!/usr/bin/env node

const path = require("path");
const {
  readCarnivalEventPeriods,
  readCarnivalQuestPeriods,
  readCarnivalTotalScoreRewards,
  writeJson,
} = require("./carnival_event_assets.cjs");

function readArg(name, fallback) {
  const index = process.argv.indexOf(name);
  if (index === -1) return fallback;
  return process.argv[index + 1] || fallback;
}

const repoRoot = path.resolve(__dirname, "..");
const sourceUpload = readArg("--source", process.env.WF_ASSET_UPLOAD || "D:\\WF\\wf-assets\\upload");
const outDir = path.resolve(repoRoot, readArg("--out", "assets"));

const eventPeriods = readCarnivalEventPeriods(sourceUpload);
const questPeriods = readCarnivalQuestPeriods(sourceUpload);
const totalScoreRewards = readCarnivalTotalScoreRewards(sourceUpload);

writeJson(path.join(outDir, "carnival_event_periods.json"), eventPeriods);
writeJson(path.join(outDir, "carnival_event_quest_periods.json"), questPeriods);
writeJson(path.join(outDir, "carnival_event_total_score_reward.json"), totalScoreRewards);

console.log(`carnival event periods: ${Object.keys(eventPeriods).length}`);
console.log(`carnival quest periods: ${Object.keys(questPeriods).length}`);
console.log(`carnival total score rewards: ${Object.keys(totalScoreRewards).length}`);
