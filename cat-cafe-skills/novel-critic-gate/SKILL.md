---
name: novel-critic-gate
description: >
  Use when 作为独立审校猫对已提交的小说章节初稿执行五轴散文质量评分、五轴节奏评估与防穿帮连续性审查。
  Not for 审查自己执笔的章节（铁律禁止自审），也不用于直接替作者把整章重写覆盖。
  Output: 调用 novel_evaluate_chapter 提交的量化评分、穿帮核查结论与可执行修改处方（approved 或 rewrite_required）。
---

# Novel Critic Gate — 异构铁面审校与防穿帮门禁

## 核心铁律

1. **异构独立性**：同一 `catId` 严禁审查自己撰写的初稿（服务端硬拦截）。
2. **有明确立场，拒绝和稀泥**：不写“整体不错，微调亦可”。凡发现死人复活、知情权剧透、战力/面板算术错误，一律标 `blocker` 并打回 `rewrite_required`。

## 审查三步流程

1. 调用 `novel_read_project_context(projectId, chapterNo)` 读取本章章纲、章前硬约束块（`precheckConstraintsMarkdown`）、激活的技法包反模式表以及主笔提交的 `rawDraft` 与 `proposedStateDelta`。
2. 逐项核查三大维度：
   - **连续性与数值硬核查 (`InvariantChecker`)**：角色是否误知未揭晓秘密？伤势与道具是否前后一致？系统数值加减是否精确？
   - **LibriScribe 五轴散文质量 (`0.00 ~ 1.00`)**：
     1. `showDontTell`：是否用动作、光影与生理细节替代抽象情绪直给？
     2. `characterVoice`：遮住人名能否听出角色区分度与潜台词？
     3. `craftSkillFidelity`：是否真正落实了本章挂载的 B/C/D 技法包 `If-Then` 规则且未触犯 `Anti-Patterns`？
     4. `cadenceAndVariety`：长短句节奏是否随紧张度呼吸变化？
     5. `goalAndHook`：章纲核心冲突是否推进？章末钩子是否让人欲罢不能？
   - **LibriScribe 五轴叙事节奏 (`0.00 ~ 1.00`)**：张力动量、有效信息密度、情绪起伏、主支线推进、防审美疲劳（警惕连续注水或连续疲劳轰炸）。
3. 调用 `novel_evaluate_chapter` 提交结构化评分与具体到段落的 `rewriteDirectives`。

## Common Mistakes

| 错误 | 后果 | 修复 |
| :--- | :--- | :--- |
| 人情分（每项都打 0.85+ 放水通过） | 平庸水文与 AI 腔混入定稿，百章后彻底崩盘 | 0.70 为及格线，0.85 以上须有惊艳细节支撑；未达阈值坚决打回 |
| 只打低分不写具体改哪一段怎么改 | 主笔猫返修盲目乱改，越改越散 | `rewriteDirectives` 必须点明段落位置、触犯的反模式及替代表达方向 |

## 和其他 Skill 的区别

- `novel-humanizer-zh`：审校通过后的语言去 AI 味精修；本技能负责把关逻辑连续性、技法执行度与戏剧质量。

## 下一步

若裁决为 `rewrite_required`，交回 `novel-chapter-writer` 定向返修；若 `approved`，进入 `novel-humanizer-zh` 或定稿入账。
