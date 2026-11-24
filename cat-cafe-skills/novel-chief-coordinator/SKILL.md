---
name: novel-chief-coordinator
description: >
  Use when 统筹小说立项、规划卷级情节弧（story-arcs）与逐章细纲（chapter-outlines），或作为总编猫协调每一章的多猫接力闭环。
  Not for 替代主笔猫直接默写整章数千字初稿（交给 novel-chapter-writer），或替代独立审校猫自审（交给 novel-critic-gate）。
  Output: 结构化蓝图/章纲产物、章前防穿帮预检工作包（ChapterWorkPacket）、多猫派单指令及定稿状态账本提交。
---

# Novel Chief Coordinator — 总编猫统筹与逐章多猫编排

## 核心职责

总编猫是整部小说的 **Showrunner（剧集统筹）**，负责把 A 书的大纲结构、B 书的战斗分镜、C 书的人设张力、D 书的场景氛围按章精准拼装，并守护跨百章的因果连续性。

## 立项与大纲阶段（Blueprint → Arcs → Outlines）

1. 调用 `novel_read_project_context` 查看当前项目的维度配比矩阵与挂载的 `plot_arc` 技法包。
2. 按 `harnessNovel` 三级递进生成并调用 `novel_save_outline_artifacts` 保存：
   - **世界观与核心机制蓝图**（锁死战力天花板、核心矛盾与黄金三章钩子）；
   - **卷级情节单元 (`storyArcs`)**（明确起止章、高潮拍与情绪曲线）；
   - **逐章细纲 (`chapterOutlines`)**：每一章必须拆解为 `2~5` 个 `SceneBeatSpec`，并为每一拍准确标注 `primaryDimension`（如前半拍 `character_persona`，后半拍 `battle_action`）与 `ragQueryHint`——这直接决定执笔时自动激活哪几本书的技法包与向量检索！

## 逐章多猫协调标准闭环

1. **章前预检 (`novel_precheck_chapter`)**：开写第 N 章前必跑！自动核对出场人物生死/伤势/知情边界与面板数值，自动装载本章所需的 A/B/C/D 技法包及 `sqlite-vec` 脱敏节拍参考。
2. **按戏份分工派单**：
   - 若本章包含高难度大战或复杂群像修罗场，先唤醒特约分镜猫补充 300 字以内的动作/潜台词调度卡，再交棒主笔猫；
   - 常规章节直接携带硬约束唤醒主笔猫（加载 `novel-chapter-writer`）成稿。
3. **强制异构互审**：初稿提交后，唤醒**不同模型家族**的审校猫（加载 `novel-critic-gate`）执行 5 轴散文评分 + 5 轴节奏评分 + 穿帮核查。
4. **返修熔断与定稿入账**：低于阈值时督促主笔猫按处方返修；通过并完成去 AI 味后，在 `chapter-gate` 模式下提请作者拍板，或在 `auto-continuous` 模式下自动调用 `novel_commit_chapter_canon` 推进下一章。

## Common Mistakes

| 错误 | 后果 | 修复 |
| :--- | :--- | :--- |
| 章纲每拍都标同一个维度或全标齐6个维度 | 技法包过载互相打架，上下文稀释 | 每拍只标 1 个主维度 + 最多 1~2 个辅维度 |
| 未跑 `novel_precheck_chapter` 就让主笔开写 | 前文重伤/死亡角色活蹦乱跳，或提前说出未知秘密 | 严守先预检、后派单铁律 |

## 和其他 Skill 的区别

- `thread-orchestration`：通用多 Thread 协作拆解；本技能专管单部小说编辑部内的逐章创作状态机与多猫接力。

## 下一步

章前工作包就绪后，交棒 `novel-chapter-writer` 执笔正文。
