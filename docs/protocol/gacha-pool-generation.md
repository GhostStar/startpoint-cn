# 卡池生成逻辑

> 状态: 已采用 `gacha_odds` 重建 `assets/gacha.json`  
> 关键文件: `assets/cdndata/gacha.json`, `assets/gacha.json`, `tools/gacha_odds_export.cjs`, `tools/rebuild_gacha_from_odds.cjs`

本文说明离线服务端的普通卡池数据如何从 CN CDN 还原。这里的“卡池”指 `assets/gacha.json` 中每个 banner 的可抽取角色/装备列表、UP 标记和同星级内权重。

## 目标

旧转换链路会把当前角色/装备表按类型、星级或属性扩进历史池，导致早期池混入后期角色，属性复刻池也只能靠名称或属性规则推断。

新链路改为使用 CDN 自带的 `gacha_odds` 表:

- `assets/cdndata/gacha.json` 决定有哪些卡池，以及每个卡池引用哪些 odds 表。
- `master/gacha_odds/<odds_id>.orderedmap` 决定该池在对应星级下的实际条目和权重。
- 生成器不再做属性过滤、ID 范围推断或“当前全角色表补全”。

## 数据来源

### 卡池主表

`assets/cdndata/gacha.json` 来自 CDN master 数据。生成器逐个读取其中的 gacha row，并使用固定列位:

| 列 | 含义 | 用途 |
| ---: | --- | --- |
| `1` | 展示名 | 写入 `name` |
| `5` | 单抽消耗 | 写入 `singleCost` |
| `6` | 十连消耗 | 写入 `multiCost` |
| `7` | 折扣消耗 | 写入 `discountCost` |
| `11` | 星级概率 odds id | 当前导出保留, 运行时尚未接入 |
| `13` | `prize_kind` | `0` 角色池, `1` 装备池 |
| `14` | 角色 3 星 odds id | 角色池 `pool["3"]` |
| `15` | 角色 4 星 odds id | 角色池 `pool["2"]` |
| `16` | 角色 5 星 odds id | 角色池 `pool["1"]` |
| `17` | 普通动画名 | 角色池 `movieName` |
| `18` | 保底动画名 | 角色池 `guaranteeMovieName` |
| `22` | 装备 3 星 odds id | 装备池 `pool["3"]` |
| `23` | 装备 4 星 odds id | 装备池 `pool["2"]` |
| `24` | 装备 5 星 odds id | 装备池 `pool["1"]` |
| `29` | 开始时间 | 写入 `startDate` |
| `30` | 结束时间 | 写入 `endDate` |

卡池类型严格使用 `row[13]` 的 `prize_kind`，不再通过装备名、ID 范围或池名猜测。

### odds 文件

odds 文件逻辑路径为:

```text
master/gacha_odds/<odds_id>.orderedmap
```

真实 CDN 文件路径按客户端资源 hash 规则定位:

```text
sha1(logicalPath + "K6R9T9Hz22OpeIGEWB0ui6c6PYFQnJGy")
```

生成器默认会在仓库根目录和一级子目录中查找:

```text
WorldFlipper/dummy/download/production/upload
```

当前本地包命中的是 `弹国服/WorldFlipper/dummy/download/production/upload`。

`gacha_odds` 是双层 orderedmap。外层 key 是 odds id，内层每行是 CSV 文本:

| 类型 | 行格式 |
| --- | --- |
| 星级 odds | `rarity,weight` |
| 角色 odds | `characterId,rarity,weight,oddsUp,isLimited,isExchangeable,trialReadingForced` |
| 装备 odds | `equipmentId,rarity,weight,oddsUp,isLimited,isExchangeable` |

`tools/gacha_odds_export.cjs` 会完整导出这些字段；`assets/gacha.json` 当前只写入运行时实际使用的字段。

## 输出格式

`assets/gacha.json` 每个池保持现有运行时结构:

```json
{
  "type": 0,
  "paymentType": 0,
  "singleCost": 150,
  "multiCost": 1500,
  "discountCost": 50,
  "movieName": "normal",
  "guaranteeMovieName": "normal_guarantee",
  "startDate": "2000-01-01 00:00:00",
  "endDate": "2099-01-01 00:00:00",
  "name": "开服纪念扭蛋",
  "pool": {
    "1": [{ "id": 111001, "rank": 5, "odds": 1, "isRateUp": false, "rarity": 66.67 }],
    "2": [],
    "3": []
  }
}
```

池 key 仍沿用旧运行时约定:

| `pool` key | 星级 |
| --- | ---: |
| `"1"` | 5 星 |
| `"2"` | 4 星 |
| `"3"` | 3 星 |

每个条目的 `rarity` 是同一星级池内的抽取权重，计算方式与旧 converter 保持一致:

```text
rarity = round((entry.weight / totalWeightOfSamePool) * 1000, 2)
```

运行时 `src/lib/gacha.ts` 先抽星级，再在对应 `pool[key]` 中按条目的 `rarity` 抽具体角色/装备。因此这里的 `rarity` 不是角色本身星级，而是同星级池内的 0-1000 权重。

## 生成方法

只导出 odds 解析结果:

```bash
node tools/gacha_odds_export.cjs --out out/gacha_odds_export.json
```

预览重建结果并输出差异，不替换 `assets/gacha.json`:

```bash
node tools/rebuild_gacha_from_odds.cjs --no-write \
  --old-out out/gacha_before_odds.dryrun.json \
  --diff-out out/gacha_odds_diff.dryrun.json
```

正式替换 `assets/gacha.json` 并保留旧快照和差异报告:

```bash
node tools/rebuild_gacha_from_odds.cjs \
  --old-out out/gacha_before_odds.json \
  --diff-out out/gacha_odds_diff.json
```

默认输出:

| 文件 | 含义 |
| --- | --- |
| `assets/gacha.json` | 替换后的运行时卡池 |
| `out/gacha_before_odds.json` | 替换前快照 |
| `out/gacha_odds_diff.json` | 旧/新卡池差异报告 |
| `out/gacha_odds_export.json` | odds 原始解析导出 |

`out/` 已被 `.gitignore` 忽略，属于本地分析产物。

## 差异报告

`tools/rebuild_gacha_from_odds.cjs` 会比较旧 `assets/gacha.json` 和新生成结果:

- banner 数量变化: 新增、删除、比较总数。
- meta 变化: 除 `pool` 外的字段差异。
- pool 变化: 每个星级池的数量、added、removed、changed。
- item 变化: 比较 `rank`, `odds`, `isRateUp`, `rarity`。

2026-07-05 本次替换的汇总:

```text
banners old=584 new=584 changed=576 added=0 removed=0
pool changes: banners=576 items added=7647 removed=25919 changed=82362
```

抽样读回:

```text
卡池总数: 584
角色池: 493
装备池: 91
banner 1: 5星 15 / 4星 27 / 3星 49
banner 3: 5星 6 / 4星 14 / 3星 20
banner 52 的 121015: odds=129, isRateUp=true, rarity=300
```

## 严格还原边界

当前链路能严格还原:

- 每个历史池引用的角色/装备 odds id。
- 每个星级池中的成员列表。
- 同星级内每个成员的 weight、UP 标记和归一化权重。
- 角色池/装备池类型。
- 角色池的普通/保底动画字段。

当前链路不处理:

- `row[11]` 指向的星级概率 odds。它已经被导出到 `out/gacha_odds_export.json`，但运行时仍使用 `src/lib/gacha.ts` 中的 `characterGachaRankRates` / `equipmentGachaRankRates` 决定先抽几星。
- `isLimited`, `isExchangeable`, `trialReadingForced`。这些字段在 odds 导出中保留，但 `assets/gacha.json` 和当前抽卡逻辑没有消费它们。
- `payment_type`、特殊券池或付费限制的完整官方行为。生成器只保留现有运行时需要的 `paymentType: 0` 和消耗字段。

因此，“严格还原历史池”在当前实现中指池内容和同星级内权重严格来自官方 CDN odds；若要进一步还原完整官方概率，还需要把星级 odds 和特殊支付规则接入 `src/lib/gacha.ts`。

## 验证

生成器测试:

```bash
node tools/gacha_odds_export.test.cjs
node tools/rebuild_gacha_from_odds.test.cjs
```

`rebuild_gacha_from_odds.test.cjs` 覆盖:

- 从 CDN odds 生成 584 个卡池。
- `banner 1` 的角色池数量和首个 5 星条目。
- `banner 3` 的装备池数量和首个 5 星条目。
- `banner 52` 的 UP 角色 `121015` 权重。
- `diffGacha` 的 removed 和 changed 项。
