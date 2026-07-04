require("ts-node/register");

const assert = require("assert");

const {
  selectWeightedIndexByRoll,
} = require("../src/lib/gacha.ts");

assert.strictEqual(selectWeightedIndexByRoll([0, 1000], 1), 1);
assert.strictEqual(selectWeightedIndexByRoll([50, 950], 50), 0);
assert.strictEqual(selectWeightedIndexByRoll([50, 950], 51), 1);
assert.strictEqual(selectWeightedIndexByRoll([75, 925], 75), 0);
assert.strictEqual(selectWeightedIndexByRoll([75, 925], 76), 1);
assert.strictEqual(selectWeightedIndexByRoll([1000, 0], 1000), 0);
assert.strictEqual(selectWeightedIndexByRoll([0, 0], 1), null);

console.log("gacha_draw_weights tests passed");
