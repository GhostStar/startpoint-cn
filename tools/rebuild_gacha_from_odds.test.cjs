const assert = require("assert");

const {
  buildGachaFromOdds,
  diffGacha,
} = require("./rebuild_gacha_from_odds.cjs");

const generated = buildGachaFromOdds({ root: process.cwd() });

assert.strictEqual(Object.keys(generated).length, 584);

assert.strictEqual(generated["1"].type, 0);
assert.deepStrictEqual(
  Object.fromEntries(Object.entries(generated["1"].pool).map(([key, items]) => [key, items.length])),
  { "1": 15, "2": 27, "3": 49 },
);
assert.deepStrictEqual(generated["1"].pool["1"][0], {
  id: 111001,
  rank: 5,
  odds: 1,
  isRateUp: false,
  rarity: 66.67,
});

assert.strictEqual(generated["3"].type, 1);
assert.deepStrictEqual(
  Object.fromEntries(Object.entries(generated["3"].pool).map(([key, items]) => [key, items.length])),
  { "1": 6, "2": 14, "3": 20 },
);
assert.deepStrictEqual(generated["3"].pool["1"][0], {
  id: 5020008,
  rank: 5,
  odds: 1,
  isRateUp: false,
  rarity: 166.67,
});

const pickup = generated["52"].pool["1"].find((item) => item.id === 121015);
assert.deepStrictEqual(pickup, {
  id: 121015,
  rank: 5,
  odds: 129,
  isRateUp: true,
  rarity: 300,
});

const syntheticOld = JSON.parse(JSON.stringify(generated));
syntheticOld["1"].pool["1"].push({
  id: 199999,
  rank: 5,
  odds: 1,
  isRateUp: false,
  rarity: 1,
});
syntheticOld["1"].pool["1"][0].odds = 9;

const diff = diffGacha(syntheticOld, generated);
assert.strictEqual(diff.summary.compared, 584);
assert.ok(diff.banners["1"].pool["1"].count.old > diff.banners["1"].pool["1"].count.new);
assert.strictEqual(diff.banners["1"].pool["1"].count.new, 15);
assert.strictEqual(diff.banners["1"].pool["1"].removed[0], 199999);
assert.strictEqual(diff.banners["1"].pool["1"].changed[0].id, 111001);

console.log("rebuild_gacha_from_odds tests passed");
