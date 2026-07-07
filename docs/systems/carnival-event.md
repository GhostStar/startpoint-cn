# 土偶嘉年华(Carnival Event)

> 状态: 核心服务端流程已实现  
> 关键端点: `/carnival_event/index`, `/carnival_event/get_party`, `/single_battle_quest/start`, `/single_battle_quest/finish`, `/load`

本文整理土偶嘉年华当前服务端实现、客户端协议证据、官方 master 数据来源、运行时流程和验证命令。

## 当前覆盖

| 流程 | 状态 | 实现点 |
| --- | --- | --- |
| 初始化记录 | 已实现 | `/load` 输出 `carnival_event_record_list` |
| 活动入口 | 已实现 | `/carnival_event/index` 按活动开放期返回官方 `5303` |
| 关卡开始 | 已实现 | `/single_battle_quest/start` 按关卡/活动开放期返回官方 `4050` |
| 关卡结算 | 已实现 | 保存 best score / previous party, 计算本次分数 |
| 总分奖励 | 已实现 | 官方总分奖励资产、领取去重、奖励合并进结算响应 |
| EVENT 配队 | 已实现 | 土偶使用独立 `PartyCategory.EVENT` 配队 |

暂未覆盖: 土偶排名 UI、交换所、活动任务、排行奖励、客户端 UI 细节。

## 客户端协议证据

反编译客户端确认以下行为:

- `CarnivalEventIndexRealRemote` 将 result code `5303` 映射为 OutOfPeriod。
- `QuestStartRealRemote` 将 result code `4050` 映射为 OutOfPeriodError。
- `InitializeRealRemote` 接受 `data.carnival_event_record_list`。
- `carnival_event_record_list` 以 event id 为 key，每个值包含 `records`。
- 初始化 record 只需要 `folder_id` 和可选 `best_score`；`previous_score`、`previous_character_ids`、`previous_unison_character_ids` 由客户端初始化为空。

## 官方 Master 数据

转换脚本: `tools/rebuild_carnival_event_assets.cjs`  
默认源目录: `D:\WF\wf-assets\upload`

| 资产 | 官方源 | 输出 |
| --- | --- | --- |
| 活动期间 | `92/917c6aeceee7cf73b275883653bcb89a43f3df` | `assets/carnival_event_periods.json` |
| 关卡期间/分数参数 | `8e/d3874807da6b5881be725cf6198d7a50ead0e0` | `assets/carnival_event_quest_periods.json` |
| 总分奖励 | `18/a0d46e2924421136823dafc32f316795cfb024` | `assets/carnival_event_total_score_reward.json` |

生成数量:

- 活动期间: 11
- 关卡期间: 99
- 总分奖励: 832

重新生成:

```powershell
node tools/rebuild_carnival_event_assets.cjs --source D:\WF\wf-assets\upload --out assets
```

## 列号注意

土偶关卡表实际列号以官方源行为为准:

| 字段 | 列 |
| --- | --- |
| `quest_id` | `cols[0]` |
| `folder_id` | `cols[1]` |
| `start_time` | `cols[7]` |
| `end_time` | `cols[8]` |
| `difficulty_score` | `cols[95]` |
| `battle_time_limit` | `cols[100]` |

`battle_time_limit` 已经是毫秒。例如 quest `1001` 的 `cols[100]` 为 `108000`，不要再乘以 1000。`cols[104]` 对 quest `1001` 为 `200000`，不是本流程使用的 difficulty score。

总分奖励表每行从 `cols[4 + slot * 3]` 开始读取 6 个 reward slot，输出统一为:

```json
{
  "id": 1,
  "event_id": 1,
  "score": 9745000,
  "rewards": [
    { "kind": 1, "id": 5030034, "number": 1 }
  ]
}
```

其中 `kind: 2` 是石头奖励，grant 时映射为 beads；奖励 id 可以为 `null`。

## 服务端流程

### `/load`

`src/routes/cn/load.ts` 调用:

```typescript
getClientSerializedData(playerId, { viewerId: accountId, serializeCarnivalEventData: true })
```

序列化输出:

```json
{
  "carnival_event_record_list": {
    "250601": {
      "records": [
        { "folder_id": 1, "best_score": 120 },
        { "folder_id": 2 }
      ]
    }
  }
}
```

不会输出 previous score / previous party 字段。

### `/carnival_event/index`

检查顺序:

1. 校验 viewer/session/player。
2. 读取 `assets/carnival_event_periods.json`。
3. 使用 `getServerDate().getTime()` 和 `isCarnivalEventIndexInPeriod()` 判定活动期间。
4. 若过期，返回 HTTP 200 + msgpack:

```json
{
  "data_headers": { "result_code": 5303 },
  "data": {}
}
```

过期时不会创建 EVENT 配队。

### `/single_battle_quest/start`

检查顺序:

1. 校验 viewer/session/player。
2. 校验 quest 存在。
3. 对 `QuestCategory.CARNIVAL_EVENT` 读取 `assets/carnival_event_quest_periods.json` 和活动期间资产。
4. 使用 `getServerDate().getTime()` 和 `isCarnivalQuestStartInPeriod()` 判定。
5. 若过期，返回 HTTP 200 + msgpack:

```json
{
  "data_headers": { "result_code": 4050 },
  "data": {}
}
```

过期时不会扣门票、不会扣体力、不会插入 active quest。

通过期间检查后，active quest 会保存 `eventId: carnivalQuestPeriod?.event_id`，用于战斗恢复和事件追踪；当前土偶结算仍通过 quest id 从分数 lookup 取得 event/folder。

### `/single_battle_quest/finish`

`handleCarnivalEventFinish()` 负责:

- 按 `difficulty_score + max(0, time_limit_ms - elapsed_time_ms)` 计算分数。
- 更新当前 folder 的 best score 和 previous party。
- 若同一角色被用于其他 folder，重置冲突 folder 的 best/previous。
- 汇总 event total score，发放新跨过阈值的总分奖励。
- 记录已领取的总分奖励，避免重复发放。
- 将奖励合并进通用结算响应。

## 数据表

| 表 | 用途 |
| --- | --- |
| `players_carnival_event_records` | 每个 player/event/folder 的 best score 和 previous party |
| `players_carnival_event_total_score_rewards` | 已领取的 event total score reward id |
| `players_active_quests` | 开始战斗后持久化 active quest，含 `event_id` |

## 测试

```powershell
node tools/carnival_event_remaining_flow.test.cjs
node tools/carnival_event_core_flow.test.cjs
npm run typecheck
npm run build
```

`tools/carnival_event_remaining_flow.test.cjs` 在缺少 `D:\WF\wf-assets\upload` 时会跳过源数据转换断言，但仍执行纯 helper、load 序列化和 route wiring 测试。
