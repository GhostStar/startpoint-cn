# 角色觉醒任务覆盖文档

> 状态: 基本完成   最后更新: 2026-06-28

## 概览

- **144 条任务**（36 个角色 × 4 个槽位）
- **Category 9**，请求格式 `{"character_id": N, "category": 9}`
- `get_mission_progress` 中按 `lastDigit` 分发计算

### 槽位含义

| lastDigit | 含义 | 计算方式 |
|-----------|------|---------|
| 1 | 阅读个人剧情 / 队伍中编有X通关 | 故事计数 或 `clears.clear_count`（fallback） |
| 2 | 累计阅读故事（Alk）/ 累计玛纳（拉芙）/ 队长或队伍通关 | Alk=`totalStories`，拉芙=`totalManaObtained`，其他=`clears.clear_count` |
| 3 | 强化弹射（Alk）/ 信赖证 / 共斗/限时 | Alk=`totalPowerflips`，信赖证=`bondTokenList.every(status>=2)`，其他=`clears.clear_count` |
| 4 | 完成全部觉醒任务 | 检查 slot 1+2+3 是否全部 ≥1 |

### 统计

| 正确度 | 数量 |
|:---:|------|
| ✅ | 83 条（58%） |
| ⚠️ | 54 条（37%） |
| ❌ | 7 条（5%）

### ❌ 剩余不可计算

| 任务 | 角色 | 需要的数据 |
|------|------|-----------|
| `限时通关` | 拉姆斯(231001)、艾莉亚(251003) | 完成时间追踪 |
| `单次战斗连击` | 索妮雅(121001) | 连击追踪 |
| 共斗（联机） | 贝瑞塔(151006)、巴拉克(131005) | 多人战斗追踪 |
| 特定练习关卡 | 巴拉克(131005): 结实假人·水 | 练习关卡 quest_id 映射 |

### 后续完善路径

| 顺序 | 功能 | 工作量 | 影响 |
|------|------|--------|------|
| 1 | 时间追踪 + 联机 | 大 | 解锁 5 个 ❌→✅ |

---

## 已实现特性

### 强化弹射计数器（2026-06-26）✅

- Alk type_3 使用 `player.totalPowerflips`
- 来源：`/finish` 的 `statistics.zones[].use_power_flip_count`
- 累计到 `players.total_powerflips`
- SELECT 需包含 `total_stamina_used, total_powerflips, total_dashes`

### 弹射/冲刺数据源（2026-06-26）

- `use_power_flip_count`：弹射总次数
- `use_power_flip_lv1/2/3_count`：各级弹射
- `use_dash_count`：冲刺次数
- `ball_flip_count`：弹珠翻转
- 累计到 `players.total_powerflips` / `players.total_dashes`

### 信赖证进度（2026-06-28）✅

- 4 个任务（丛云/爱丽丝/芬/赛吉尔）的 type_3
- `getPlayerCharacterSync().bondTokenList.every(bt => bt.status >= 2)`
- status: 0=未解锁, 1=可领取, 2=已领取

### 终身玛纳追踪（2026-06-28）✅

- 拉芙(2630022) type_2 使用 `player.totalManaObtained`
- DB 列 `total_mana_obtained`，所有玛纳发放点累加：
  - 关卡结算：`singleBattleQuest.ts` + `multi/http/battle.ts`
  - 掉落奖励：`lib/quest.ts`（`givePlayerRewardsSync` + `givePlayerScoreRewardsSync`）
  - 邮件领取：`mail.ts`
  - 活跃任务：`activeMission.ts`
  - 觉醒任务自奖励：`mission.ts`
  - 物品出售：`item-sell.ts`

### 特定关卡通关（2026-06-28）✅

5 个任务通过 `ctx.questProgress[category]` 检测 quest 完成状态：

| mission_id | 角色 | 关卡 | quest_id | category |
|------------|------|------|----------|:---:|
| 1110013 | 瓦格纳 | 伊尔格拉乌 超级 | 1028004 | 2 |
| 1410032 | 丛云 | 八岐大蛇(最高) | 1020003 | 2 |
| 2110013 | 阿赛尔 | 伊尔格拉乌 超级 | 1028004 | 2 |
| 2510032 | 艾莉亚 | 临境域 深渊之兽 | 1020 等多周期 | 13 |
| 2630023 | 贝瑞塔 | 女王拉芙 超级+ | 100100004/100401004 | 19 |

映射常量 `QUEST_CLEAR_MISSIONS` 在 `mission.ts` 中定义，
`computeProgress` 在 lastDigit 分支之前优先检测。

### 队长 vs 队员追踪（2026-06-26）

- **队长**（characters[0]）：单独追踪，"以X为队长"任务
- **队员**（characters[1+], unison）：批量追踪，"队伍中编有X"任务

### 自动奖励

- `get_mission_progress` 中检测阶段完成 → 自动标记 `received=true`
- `getAwakeMissionRewards()` 使用 `base=9`（1 个道具/阶段）


(End of file - total 85 lines)
