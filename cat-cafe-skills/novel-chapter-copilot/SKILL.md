---
name: novel-chapter-copilot
description: >
  Use when 辅助人类作者逐章共创小说：在下一章生成前提出 5 个差异化剧情方向与启发提问、按作者选定思路与参照小说风格撰写下一章正文、或在章节定稿后反向提炼总结式大纲与设定增量。
  Not for 擅自覆盖作者手写主线大纲，或脱离前文已完成章节提前编造后续几十章细纲。
  Output: 5 组章节推进方向卡片（ChapterDirectionOption）、无缝承接前后文的章节正文初稿、以及忠于定稿正文的总结式章纲与设定快照增量。
---

# Novel Chapter Co-Pilot — 人机共创小说逐章辅助工作流

## 核心理念：作者掌舵，逐章生长

本工作流采用 **自底向上、人机共创** 范式：
- **作者掌控方向**：作者提供初始构想或主线备忘大纲（`authorMasterOutlineMarkdown`），主创共创猫绝不越权覆盖作者手写大纲。
- **参照小说严格限权**：参照小说风格**仅作用于两处**——① 下一章开写前的 **5 个方向启发**（仅借用脱敏戏剧节拍结构）；② 下一章正文的 **句法韵律、视角距离、对话占比与五感密度模拟**，严禁借用原书专有人名、地名、功法或设定。
- **双向连续性铁律**：承上严格读取 `Snapshot #(K - 1)` 设定快照与第 `K - 1` 章末尾原文切片；若处于中间章定点回溯重生成（`in_place_bridge`），还必须遵守 `DOWNSTREAM BRIDGE CONSTRAINTS`，让本章结尾自然收束过渡到第 `K + 1` 章开场。

## 三阶段执行规范

### Step 1 · 章前 5 方向提案与提问（`ideate`）

1. 先调用 `novel_read_project_context(projectId, chapterNo)` 读取 `copilotContextPacket`（含作者主线、前文总结链、第 `K - 1` 章末尾原文切片、快照硬约束、可选的第 `K + 1` 章开头桥接锚点、以及参照书脱敏节拍）。
2. 构思 **恰好 5 个真正拉开叙事切口差异的推进方案**（禁止换汤不换药的同义重复）：
   - `conflict_escalation`：正面冲突升级 / 危机逼近；
   - `suspense_twist`：暗线反转 / 意外信息打破原计划；
   - `character_bond`：人物关系博弈、试探或立场拉扯；
   - `world_revelation`：借具体事件自然揭开一角新设定或伏笔；
   - `pacing_transition`：节奏蓄势、暗埋钩子或空间场景转换。
3. 每个方案必须提供清晰的 `title`、`pitch`、`openingBeat`、`endingHook`，以及 **1 句向作者发问的具体抉择问题（`guidingQuestion`）**，帮助作者快速拍板或激发新灵感。
4. 调用 `novel_submit_chapter_directions(projectId, chapterNo, options)` 提交 5 张方案卡。

### Step 2 · 按作者拍板与参照风格执笔正文（`draft`）

1. 调用 `novel_read_project_context(projectId, chapterNo)` 查看作者勾选的 `selectedOptionCards` 与自由输入的 `customAuthorInput`（以作者手写具体要求为最高优先级）。
2. **无缝承上启下**：
   - 第一段必须自然衔接 `previousChapterTailExcerpt` 的时间、地点、动作与人物情绪；
   - 严守 `continuityConstraintsMarkdown` 中的角色生死、伤势、持有物与未知秘密红线；
   - 若存在 `downstreamBridge`（中间章回溯重写且保留后文），章末落点必须与第 `K + 1` 章开场人物位置及悬念严丝合缝。
3. **文风模拟与去 AI 味**：遵循 `referenceStyle.styleInstructionMarkdown` 的句长节奏与视角质感，用具体动作与五感细节替代空洞情绪形容词，严禁使用“嘴角勾起一抹弧度 / 眼神闪过一丝寒芒 / 这仅仅只是开始”等套话。
4. 调用 `novel_submit_chapter_draft(projectId, chapterNo, draftKind="copilot", title, content, proposedStateDelta)` 提交正文供作者审阅手改。

### Step 3 · 章后反向总结大纲与沉淀设定（`summarize`）

1. 当作者编辑确认并定稿本章后，调用 `novel_read_project_context(projectId, chapterNo)` 精读 `chapterRecord.finalText`。
2. **100% 忠实于最终定稿正文**（尤其是作者手动删改过的段落，严禁脑补未发生的情节）：
   - 提炼 `summary`：精准章节标题、`oneLineSummary`、3~6 条 `keyEvents`、`characterChanges`、`newlyIntroducedSettings`，以及供前后回溯桥接使用的 `openingAnchor` 与 `endingAnchor`；
   - 提炼 `stateDelta` 与 `worldbuildingAdditions`：将本章新出场角色、新地点、角色伤势/位置/持有物变更、新埋或已回收伏笔结构化入账。
3. 调用 `novel_submit_chapter_summary` 完成沉淀。

## Common Mistakes

| 错误 | 后果 | 修复 |
| :--- | :--- | :--- |
| 5 个方向只是换个说法讲同一件事 | 作者失去选择意义 | 严格按 5 种不同戏剧焦点拉开切口，每项给出明确追问 |
| 回溯重写第 K 章时忽略第 K+1 章开头锚点 | 第 K 章结尾人物去了城外，第 K+1 章开头却还在客栈 | 存在 `downstreamBridge` 时，5 方向尾钩与正文收束必须对齐下章开场 |
| 反向总结照抄章前设想而非定稿正文 | 作者手改的剧情没进总结大纲，后续章节出现记忆错乱 | 只以 `finalText` 实际落字内容作为反向总结与设定提取的唯一依据 |
