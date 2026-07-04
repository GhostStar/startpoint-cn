# CLAUDE.md

StarPoint CN — 世界弹射物语(World Flipper)CN(雷霆)版服务端模拟器。
Fastify + TypeScript，CN 服务入口 `src/cn-server.ts`（端口 8001），国际服入口 `src/server.ts`（8000）。

## 当前进行中：后台管理界面重构（feature/admin-ui 分支）

完整方案见 `docs/admin-refactor-plan.md`（必读：功能清单、解耦点、里程碑、PR 策略）。

### 进度（2026-07-04）

- ✅ M0：换行符治理已在 main 完成（`.gitattributes` 全仓 LF，`*.bat` CRLF）
- ✅ M1：`admin/` 脚手架（Vite + React 18 + AntD 5 + react-router + react-query）
  - 构建产物 → `web/dist`（gitignored），cn-server 挂载在 `/admin`（含 SPA fallback，`web/dist` 不存在时自动禁用）
  - Dashboard 已接通 `GET /api/server/currentTime`；其余 4 页为占位
  - 根 package.json：`npm run build:admin` / `dev:admin`
- ✅ M2：账号/存档页 + 玩家详情页（已完成，见下）
- ⬜ M3：种子页、邮件页、服务器时间卡片
- ⬜ M4：切换默认入口 + 删除旧页面（须经作者同意，独立 commit）

### M2 已完成内容

1. `web_api` 新增 JSON 端点：
   - `GET /api/server/accounts` — 账号列表 + 每账号存档数/默认存档
   - `GET /api/player/:id/detail` — 资源/角色/道具/装备/关卡进度/抽选关卡（JSON）
   - `GET /api/lookup/characters|items|equipment|quests` — 名称映射（`src/routes/web_api/lookup.ts`）
   - `POST /api/server/*` 系列按 `Accept: application/json` 分流，JSON 客户端返回 JSON，旧页面保留 redirect
2. 前端 `admin/src/pages/Accounts.tsx` — 账号表格 + 存档管理（切换/新建/克隆/改名/删除）+ 全部玩家列表
3. 前端 `admin/src/pages/PlayerDetail.tsx` — 资源内联编辑 + 角色/道具/装备/关卡/抽选关卡 Tabs + 工具操作（EX Boost/编队/邮箱/挑战重置/存档导出）
4. `admin/src/api/client.ts` 补充 `apiPatch` 方法
5. 校验规则复用 `src/routes/web_api/validation.ts`（通过现有 PATCH /:id/field 端点）

## 硬性约束

- **迁移期间旧后台零改动**：`web/pages/`、`src/routes/web/`、`web/public/` 在 M4 之前不许修改/删除
- 最终要向上游 `DontBeAlarmed/startpoint-cn` 提 PR，commit 保持小而清晰（`feat(admin):` / `refactor(web_api):`）
- 定期 `git rebase origin/main`
- 全仓 LF（`.gitattributes` 已配置）；不要提交 `web/dist`、`admin/node_modules`
- 未跟踪的 `decompile/`、`ffdec_26.2.1/`、`mod-tools/`、`pc-run/`、`弹国服/`、`assets/*.backup.json` 是本地逆向工作区，别动也别提交

## 常用命令

```bash
npm run typecheck        # 服务端 TS 检查
npm run dev:cn           # 构建 + 启动 CN 服务(8001)，/admin 即新后台
npm run dev:admin        # Vite 热更新(5173)，/api 代理到 8001
npm run build:admin      # 构建 SPA 到 web/dist
```

## 已知坑

- 玩家详情数据量大（角色/道具数千行），前端用 AntD Table 虚拟滚动或分页
- `@fastify/multipart` 已在 web_api 注册（存档导入用），新端点勿重复注册
- AntD 全量引入 bundle 573KB，M3 后考虑 manualChunks 拆分
