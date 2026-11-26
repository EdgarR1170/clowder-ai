---
name: novel-chapter-copilot
description: >
  Use when 辅助人类作者按极简八步流程创作小说：拆解用户输入的设定与前三章、先提 5 个本章大纲方向再提 5 套本章细纲、按分块参照小说风格生成正文、或响应人工修改建议。
  Not for 自审打分整章质量或擅自删改作者前三章原文。
  Output: 设定与前三章多猫拆解报告（SettingDissectionReport）、5 组本章大纲方向、5 套分步细纲及章节正文稿。
---

# Novel Chapter Co-Pilot — 极简八步多猫小说创作指南

## 核心流程（与工作坊 0 → 7 步一一对应）

1. **Step 3 · 拆解设定与前三章 (`novel_submit_setting_dissection`)**
   - 调用 `novel_read_project_context(projectId)` 阅读作者输入的 `rawUserSettingsInput`（设定原文）与前 `1~3` 章种子章节全文；
   - 梳理核心世界规则、人物表（含口吻性格与当前处境）、前三章埋设伏笔、作者原生叙事语感特征（`authorNativeStyleNotes`）以及衔接下一章的落点，调用 `novel_submit_setting_dissection` 提交。
2. **Step 4A · 提出 5 个本章大纲方向 (`novel_submit_chapter_directions`)**
   - 结合前文与大纲参照模块，构思 **5 个真正拉开切口差异的本章大纲方向**（若作者附带重刷倾向要求，以作者要求为最高优先级），调用 `novel_submit_chapter_directions(projectId, chapterNo, macroDirections=[...5项])`。
3. **Step 4B · 提出 5 套本章细纲 (`novel_submit_detailed_outlines`)**
   - 围绕作者选定的 1 个大纲方向，展开 **5 套不同分镜节奏与细节切入的细纲方案**，为每套细纲的每个 `sceneBeat` 准确标注 `craftDimension`（`plot_arc` / `battle_action` / `character_persona` / `scene_atmosphere` / `world_mechanics` / `prose_style`），调用 `novel_submit_detailed_outlines`。
4. **Step 4C & Step 5 · 按细纲与分块参照执笔及人工建议精修 (`novel_submit_chapter_draft`)**
   - 第一段无缝衔接上一章结尾；按每个场景拍挂载的对应参考小说模块技法与作者前三章原生语感成稿；
   - 当作者在 Step 5 提出修改建议时，严格定向精修并调用 `novel_submit_chapter_draft(draftKind="copilot", ...)`，绝不丢失上下文连续性。
5. **Step 6 · 去AI味优化 (`novel-humanizer-zh` + `draftKind="humanized"`)**
   - 配合 `novel-humanizer-zh` 技能消除套话、机械排比与总结腔，贴合作者前三章语感提交 `draftKind="humanized"`。

## Common Mistakes

| 错误 | 后果 | 修复 |
| :--- | :--- | :--- |
| 5 个大纲或 5 个细纲高度雷同 | 作者多次重刷仍选不出差异方案 | 5 个方案必须在冲突烈度、叙事切口、节奏编排上明显区分 |
| 接写第 4 章时忽略作者前三章的人物口吻 | 前三章与第四章像两本书拼凑 | 必读 `dissectionReport.authorNativeStyleNotes` 与第 3 章结尾切片 |
