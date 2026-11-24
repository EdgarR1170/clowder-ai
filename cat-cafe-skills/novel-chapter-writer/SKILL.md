---
name: novel-chapter-writer
description: >
  Use when 作为主笔猫根据章纲节拍、章前防穿帮硬约束、动态挂载的 A/B/C/D 多书技法 Skill 以及 RAG 节拍骨架撰写或返修章节正文。
  Not for 修改全局大纲方向（找 novel-chief-coordinator）或自审放行（交给 novel-critic-gate）。
  Output: 调用 novel_submit_chapter_draft(draftKind="raw") 提交的高沉浸感章节初稿及本章状态增量（proposedStateDelta）。
---

# Novel Chapter Writer — 多维技法融合与章节执笔

## 为什么这是一个 Skill

当同一章同时挂载了《B书·战斗快切技法》与《C书·人物潜台词技法》乃至《D书·五感氛围技法》时，缺乏调度纪律的模型会把文风写得精神分裂，或者只顾堆辞藻忘了推进章纲目标。本技能定义**按拍切换技法权重、统一底色视角、同步提取状态增量**的执笔准则。

## 执笔五步法

1. **吃透本章工作包**：调用 `novel_read_project_context(projectId, chapterNo)` 读取：
   - 本章 `outline`（目标、核心冲突、结果、章末钩子及每一拍的 `primaryDimension`）；
   - `precheckConstraintsMarkdown`（严守角色生死、伤势、位置、**未知秘密红线**及系统面板当前值）；
   - 本章激活的 `activeSkills`（细读每项技法包的 `If-Then` 规则与 `Anti-Patterns`）及 `ragPassages` 脱敏节拍骨架。
2. **需要更多桥段灵感时主动检索**：若某场戏卡壳，调用 `novel_search_reference_beats(query=..., dimension=..., mode="structural_beats")` 从对应参考书向量库召回节拍配速参考（严禁照搬原句）。
3. **分拍运镜，统一底色**：
   - 全章叙事视角（POV）与人称基调以项目的 `prose_style` 规范为唯一准绳；
   - 进入 `scene_atmosphere` 节拍时放缓句长、铺设 2~3 个五感锚点；进入 `character_persona` 对手戏时收紧旁白、用微动作与潜台词交锋；进入 `battle_action` 节拍时立切短促动词句并写清空间态势与物理反馈。
4. **章末钩子硬收束**：最后一段必须落在 `outline.hook` 设计的悬念、危机或认知反转瞬息，严禁写总结感叹句。
5. **同步盘点状态增量 (`proposedStateDelta`)**：成稿后调用 `novel_submit_chapter_draft(draftKind="raw", content=..., proposedStateDelta=...)`，如实填报本章新增伤势、消耗/获得道具、得知的秘密 ID、新埋/回收伏笔及面板数值增减。

## Common Mistakes

| 错误 | 后果 | 修复 |
| :--- | :--- | :--- |
| 正文里写主角掉了半管血/断剑，却漏填 `proposedStateDelta` | 下一章预检账本失真，断剑又完好无损出现 | 凡影响后续章节的物理/认知/数值变化，随稿必报 `proposedStateDelta` |
| 把 RAG 检索出的结构节拍里的占位词或原书招式抄进正文 | 世界观穿帮或洗稿痕迹 | 只借分镜顺序与句式呼吸，血肉必须完全生根于本书设定 |

## 和其他 Skill 的区别

- `novel-humanizer-zh`：审校过关后的去 AI 味语言抛光；本技能负责完成戏剧冲突、技法落地与初稿创作。

## 下一步

提交 `raw` 初稿后，交棒异构审校猫执行 `novel-critic-gate`。
