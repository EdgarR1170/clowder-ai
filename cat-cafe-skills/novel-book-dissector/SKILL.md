---
name: novel-book-dissector
description: >
  Use when 将参考小说（A大纲、B战斗、C人设、D场景、E机制、F文风）按单一指定维度拆解转化为可迁移的 Book-to-Skill 技法包。
  Not for 生成读书笔记或剧情梗概摘要，也不用于日常章节正文写作（正文执笔用 novel-chapter-writer）。
  Output: 通过 novel_dissect_reference 落盘并挂载的标准技法 Skill（含核心心智框架、If-Then 决策规则、反模式红线、脱敏节拍骨架与 8 维 StyleProfile）。
---

# Novel Book Dissector — 多书分维拆解与技法蒸馏

## 为什么这是一个 Skill

普通模型收到“学习《参考书B》的战斗描写”时，极易犯两个致命错误：要么写成空洞的语文阅读理解（“动作描写很生动、节奏紧凑”），要么顺手把原书招式名与桥段洗稿照搬。本技能强制采用 `book-to-skill` 范式：**只抽离导演分镜法、条件触发规则（When-Then）与失败禁区（Anti-Patterns）**。

## 核心拆书四步法

1. **锁定单一目标维度**：确认本次只从该参考书中抽哪一维（`plot_arc` / `battle_action` / `character_persona` / `scene_atmosphere` / `world_mechanics` / `prose_style`），绝不一锅炖。
2. **拉取高密代表切片**：调用 `novel_dissect_reference(action="sample_dimension", bookId=..., dimension=..., topK=8)` 获取跨章节去重抽样的原文高能段落与全书统计画像。
3. **脱敏提炼四件套**：
   - **Core Frameworks（核心框架）**：提炼出该书处理此类场次的底层心智模型与 3~5 步执行序列。
   - **Decision Rules（If-Then 决策规则）**：写成硬条件句，例如「当双方战力差距超过一阶 → 禁止正面硬撼，必须先写两次环境试探与一次信息误导」。
   - **Anti-Patterns（反模式红线）**：明确指出违反该文风的典型败笔、崩坏原因与修复动作。
   - **Beat Templates & StyleProfile**：将代表段落抽离人名地名，保留节拍递进、句长配速与对话占比。
4. **编译挂载**：调用 `novel_dissect_reference(action="save_distilled_skill", skillSpec=...)` 保存并挂载到猫群技能目录。

## Common Mistakes

| 错误 | 后果 | 修复 |
| :--- | :--- | :--- |
| 把 `When-Then` 写成“当写战斗时→要写得精彩” | 废话规则，对执笔猫零约束力 | 必须包含可观测的叙事情境与具体的句法/动作分配指令 |
| 在 `beatTemplates` 里保留原书主角姓名或专属功法名 | 后续写作污染新书世界观甚至涉嫌抄袭 | 统一脱敏替换为【视角方】【压制方】【环境支点】等结构槽位 |

## 和其他 Skill 的区别

- `novel-chapter-writer`：**消费**已生成的技法包写新书正文；本技能负责**生产**技法包。
- `writing-skills`：通用元技能规范；本技能专用于长篇小说参考书的分维萃取。

## 下一步

技法包生成后，进入 `novel-chief-coordinator` 在项目的「多书维度配比矩阵」中绑定对应维度。
