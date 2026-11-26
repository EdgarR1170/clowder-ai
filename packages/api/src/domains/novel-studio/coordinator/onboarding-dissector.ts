import {
  type ChapterDetailedOutlineOption,
  type ChapterMacroDirection,
  type DistilledChapterSummary,
  type HumanizerReport,
  NOVEL_CRAFT_DIMENSION_LABELS,
  type NovelProject,
  type SettingDissectionCharacter,
  type SettingDissectionReport,
} from '@cat-cafe/shared';
import { buildDeterministicChapterSummary } from './copilot-context-builder.js';

export interface ParsedSeedChapter {
  chapterNo: number;
  title: string;
  content: string;
  summary: DistilledChapterSummary;
}

const CHAPTER_HEADING_LINE_RE =
  /^\s*(?:#{1,4}\s*)?(?:第\s*[0-9一二三四五六七八九十百千万零〇两]+\s*[章节回]|Chapter\s+\d+)[^\n]*$/gim;

function extractTitleFromHeading(headingLine: string, fallbackNo: number): string {
  const cleaned = headingLine.replace(/^\s*#{1,4}\s*/, '').trim();
  const m = cleaned.match(/^(?:第\s*[0-9一二三四五六七八九十百千万零〇两]+\s*[章节回]|Chapter\s+\d+)[\s：:·—-]*(.*)$/i);
  const titlePart = m?.[1]?.trim();
  return titlePart || cleaned || `第 ${fallbackNo} 章`;
}

function splitByHeadingMatches(
  normalized: string,
  matches: RegExpMatchArray[],
): Array<{ title: string; body: string }> {
  const segments: Array<{ title: string; body: string }> = [];
  const firstIdx = matches[0]?.index ?? 0;
  const prelogue = normalized.slice(0, firstIdx).trim();

  for (let i = 0; i < matches.length; i++) {
    const current = matches[i];
    if (!current || current.index === undefined) continue;
    const bodyStart = current.index + current[0].length;
    const bodyEnd = matches[i + 1]?.index ?? normalized.length;
    const rawBody = normalized.slice(bodyStart, bodyEnd).trim();
    const body = i === 0 && prelogue ? `${prelogue}\n\n${rawBody}`.trim() : rawBody;
    if (body) {
      segments.push({
        title: extractTitleFromHeading(current[0].trim(), segments.length + 1),
        body,
      });
    }
  }
  return segments;
}

/**
 * Splits the single "前三章内容" input box into structured seed chapters (Ch 1, Ch 2, Ch 3...).
 * Supports standard Chinese/English chapter headings, `===`/`---` dividers, or single-block opening text.
 */
export function parseOpeningChaptersInput(rawText: string): ParsedSeedChapter[] {
  const normalized = rawText.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const matches = [...normalized.matchAll(CHAPTER_HEADING_LINE_RE)];
  const rawSegments =
    matches.length > 0
      ? splitByHeadingMatches(normalized, matches)
      : normalized
          .split(/\n\s*(?:={3,}|-{3,}|\*{3,})\s*\n/)
          .map((s) => s.trim())
          .filter(Boolean)
          .map((body, idx) => ({ title: `开篇第 ${idx + 1} 章`, body }));

  return rawSegments.map((seg, idx) => {
    const chapterNo = idx + 1;
    return {
      chapterNo,
      title: seg.title.slice(0, 120),
      content: seg.body,
      summary: buildDeterministicChapterSummary({
        chapterNo,
        title: seg.title,
        text: seg.body,
      }),
    };
  });
}

/**
 * Extracts quantitative & qualitative prose voice baseline from the user's own opening chapters
 * so subsequent generation and Step 6 De-AI optimization preserve the author's native voice.
 */
export function extractAuthorNativeStyleNotes(parsedChapters: ParsedSeedChapter[]): string {
  if (parsedChapters.length === 0) {
    return '用户暂未粘贴前三章样章，默认采用沉稳具象的第三人称限知叙事。';
  }
  const combined = parsedChapters.map((c) => c.content).join('\n\n');
  const paragraphs = combined
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  const sentences = combined
    .split(/[。！？!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);

  const avgSentenceLen =
    sentences.length > 0 ? Math.round(sentences.reduce((sum, s) => sum + s.length, 0) / sentences.length) : 22;
  const avgParaLen =
    paragraphs.length > 0 ? Math.round(paragraphs.reduce((sum, p) => sum + p.length, 0) / paragraphs.length) : 90;
  const dialogueParas = paragraphs.filter((p) => /“[^”]+”|"[^"]+"|「[^」]+」/.test(p)).length;
  const dialogueRatio = paragraphs.length > 0 ? Math.round((dialogueParas / paragraphs.length) * 100) : 35;

  const firstPersonCount = (combined.match(/我/g) ?? []).length;
  const thirdPersonCount = (combined.match(/[他她]/g) ?? []).length;
  const povLabel = firstPersonCount > thirdPersonCount * 1.3 ? '第一人称（“我”）主视角' : '第三人称限知视角';

  return [
    `已从作者亲笔前 ${parsedChapters.length} 章提取原生语感标尺：`,
    `- 叙事视角：${povLabel}`,
    `- 句式节奏：平均每句约 ${avgSentenceLen} 字，平均每段约 ${avgParaLen} 字`,
    `- 对话密度：含对话段落约占 ${dialogueRatio}%`,
    '- 行文守则：接写后续章节及去AI味时，优先贴合上述段落呼吸与人物说话腔调。',
  ].join('\n');
}

function inferCharacterRole(line: string): SettingDissectionCharacter['role'] {
  if (/主角|男主/.test(line)) return 'protagonist';
  if (/女主|搭档/.test(line)) return 'deuteragonist';
  if (/反派|宿敌/.test(line)) return 'antagonist';
  return 'supporting';
}

function extractCandidateCharactersFromSettings(rawSettings: string): SettingDissectionCharacter[] {
  const lines = rawSettings
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const chars: SettingDissectionCharacter[] = [];

  for (const line of lines) {
    const m = line.match(
      /^(?:[-*•]\s*)?(?:主角|男主|女主|搭档|反派|配角|角色|人物\d*)[：:\s]*([\u4e00-\u9fff]{2,6})[（(：:—-](.+)$/,
    );
    const name = m?.[1]?.trim() ?? '';
    const desc = m?.[2]?.trim() ?? '';
    if (!name || chars.some((c) => c.name === name)) continue;
    chars.push({
      name,
      role: inferCharacterRole(line),
      traitsAndVoice: desc.slice(0, 180),
      currentStatusAndGoal: '已从设定原文识别，待多猫结合前三章细化动态',
    });
    if (chars.length >= 8) break;
  }
  return chars;
}

export function buildBaselineDissectionReport(params: {
  rawSettings: string;
  parsedChapters: ParsedSeedChapter[];
  isAnalyzing: boolean;
  catIds: string[];
}): SettingDissectionReport {
  const { rawSettings, parsedChapters, isAnalyzing, catIds } = params;
  const lastSeed = parsedChapters[parsedChapters.length - 1];
  const nextAnchor = lastSeed
    ? `承接第 ${lastSeed.chapterNo} 章《${lastSeed.title}》结尾：${lastSeed.summary.endingAnchor}`
    : '将从第 1 章正式开启故事主线。';

  const plantedHooks = parsedChapters
    .map((ch) => `第 ${ch.chapterNo} 章留钩：${ch.summary.endingAnchor.slice(0, 100)}`)
    .filter(Boolean);

  return {
    status: isAnalyzing ? 'analyzing' : 'ready',
    worldAndRulesSummary: rawSettings.trim().slice(0, 1200) || '等待补充世界观设定或由多猫从前三章归纳。',
    coreConflictAndArc: rawSettings.trim().slice(0, 400) || (lastSeed?.summary.oneLineSummary ?? ''),
    characters: extractCandidateCharactersFromSettings(rawSettings),
    plantedHooks,
    authorNativeStyleNotes: extractAuthorNativeStyleNotes(parsedChapters),
    nextChapterBridgeAnchor: nextAnchor,
    analyzedByCats: catIds,
    analyzedAt: new Date().toISOString(),
  };
}

export function formatBoundModulesSummary(project: NovelProject, bookTitleById: ReadonlyMap<string, string>): string {
  const lines: string[] = [];
  for (const bind of project.dimensionBindings) {
    if (bind.referenceBookIds.length === 0 && bind.skillSlugs.length === 0) continue;
    const titles = bind.referenceBookIds.map((id) => `《${bookTitleById.get(id) ?? id}》`).join('、');
    const dimLabel = NOVEL_CRAFT_DIMENSION_LABELS[bind.dimension]?.zh ?? bind.dimension;
    lines.push(`- 【${dimLabel}】参照：${titles || bind.skillSlugs.join(', ')}`);
  }
  return lines.length > 0 ? lines.join('\n') : '- 暂未单独指定分块参照小说，按默认高质量叙事规范执行。';
}

export function buildOnboardingDissectionPrompt(params: {
  project: NovelProject;
  seedCount: number;
  architectCatId: string;
  writerCatId: string;
}): string {
  const { project, seedCount, architectCatId, writerCatId } = params;
  const nextChapterNo = seedCount + 1;
  return [
    `@${architectCatId} **【Step 3 · 多猫拆解分析《${project.title}》设定与前 ${seedCount} 章】**（协同主笔猫 \`@${writerCatId}\`）`,
    `- **项目 ID**：\`${project.id}\` | **已导入前置章节数**：${seedCount} 章 | **即将接写章节**：第 ${nextChapterNo} 章`,
    '',
    '### 1. 作者输入的小说设定原文',
    project.rawUserSettingsInput.trim() || '（作者未单独填写设定框，请重点从前三章正文中提炼）',
    '',
    `### 2. 作者输入的前 ${seedCount} 章摘要`,
    seedCount > 0
      ? `已存入项目章节 1~${seedCount}，请调用 \`novel_read_project_context(projectId="${project.id}")\` 阅读完整原文。`
      : '（作者暂未贴入前三章正文，将直接从第 1 章开写）',
    '',
    '### 执行要求',
    `1. 请加载 \`novel-chapter-copilot\` 技能，调用 \`novel_read_project_context(projectId="${project.id}")\` 精读设定与前 ${seedCount} 章全文；`,
    '2. 深度拆解并梳理：① 世界观与力量/社会硬规则摘要（`worldAndRulesSummary`）；② 核心主线矛盾（`coreConflictAndArc`）；③ 登场人物清单（姓名、定位、性格口吻、当前所处状态与目标）；④ 前三章已埋下的关键伏笔（`plantedHooks`）；⑤ 作者亲笔前三章的原生文风语感特征（`authorNativeStyleNotes`）；⑥ 衔接第 ' +
      `${nextChapterNo} 章的精准落点（\`nextChapterBridgeAnchor\`）；`,
    `3. 调用 \`novel_submit_setting_dissection(projectId="${project.id}", ...)\` 提交拆解分析结果！`,
  ].join('\n');
}

export function buildMacroDirectionsPrompt(params: {
  project: NovelProject;
  chapterNo: number;
  feedbackHint?: string;
  boundModulesSummary: string;
  prevTailExcerpt: string;
}): string {
  const { project, chapterNo, feedbackHint, boundModulesSummary, prevTailExcerpt } = params;
  const architectCat = project.catRoster.architectCatId || project.copilotCatId || 'opus';
  return [
    `@${architectCat} **【Step 4A · 请为《${project.title}》第 ${chapterNo} 章提出 5 个不同方向的本章大纲】**`,
    `- **项目 ID**：\`${project.id}\` | **目标章节**：第 ${chapterNo} 章`,
    feedbackHint?.trim() ? `- **作者本轮重刷/倾向要求（最高优先级）**：${feedbackHint.trim()}` : '',
    `- **各模块参照小说配置**：\n${boundModulesSummary}`,
    prevTailExcerpt ? `- **紧接上一章末尾原文**：\n> ${prevTailExcerpt.slice(-450).replace(/\n+/g, '\n> ')}` : '',
    '',
    '请加载 `novel-chapter-copilot` 技能：',
    `1. 调用 \`novel_read_project_context(projectId="${project.id}", chapterNo=${chapterNo})\` 核对已拆解设定、人物状态与前文脉络；`,
    '2. 构思 **恰好 5 个方向截然不同的本章大纲方案**（拉开冲突切入点、节奏快慢与悬念设计差异），严禁换汤不换药；',
    `3. 调用 \`novel_submit_chapter_directions(projectId="${project.id}", chapterNo=${chapterNo}, macroDirections=[...5项])\` 提交供作者挑选！`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildDetailedOutlinesPrompt(params: {
  project: NovelProject;
  chapterNo: number;
  chosenDirection: ChapterMacroDirection;
  feedbackHint?: string;
  boundModulesSummary: string;
}): string {
  const { project, chapterNo, chosenDirection, feedbackHint, boundModulesSummary } = params;
  const targetCat = project.catRoster.architectCatId || project.copilotCatId || 'opus';
  return [
    `@${targetCat} **【Step 4B · 基于已选大纲方向，为《${project.title}》第 ${chapterNo} 章提出 5 套详细细纲】**`,
    `- **项目 ID**：\`${project.id}\` | **章节**：第 ${chapterNo} 章`,
    `- **作者拍板的本章大纲方向**：【${chosenDirection.title}】${chosenDirection.summary}`,
    chosenDirection.endingHook ? `- **目标章末钩子**：${chosenDirection.endingHook}` : '',
    feedbackHint?.trim() ? `- **作者对细纲的补充偏好**：${feedbackHint.trim()}` : '',
    `- **分块参照模块**：\n${boundModulesSummary}`,
    '',
    '请围绕上述选定大纲，拆解出 **5 套不同分镜编排与细节侧重的「本章细纲方案」**：',
    '- 每套细纲包含 `3~5` 个按序递进的 `sceneBeats`，并为每个场景拍准确标注对应的 `craftDimension`（`plot_arc` / `battle_action` / `character_persona` / `scene_atmosphere` / `world_mechanics` / `prose_style`），以便生成正文时精准调用对应参考书模块；',
    `- 调用 \`novel_submit_detailed_outlines(projectId="${project.id}", chapterNo=${chapterNo}, detailedOutlines=[...5套])\` 提交供作者选择！`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildExecuteDraftFromBeatsPrompt(params: {
  project: NovelProject;
  chapterNo: number;
  chosenDetailed: ChapterDetailedOutlineOption;
  boundModulesSummary: string;
  extraNote?: string;
}): string {
  const { project, chapterNo, chosenDetailed, boundModulesSummary, extraNote } = params;
  const writerCat = project.catRoster.writerCatId || project.copilotCatId || 'kimi';
  const beatLines = chosenDetailed.sceneBeats
    .map(
      (b) =>
        `  ${b.order}. [${NOVEL_CRAFT_DIMENSION_LABELS[b.craftDimension]?.zh ?? b.craftDimension}] ${b.sceneSummary}${b.detailFocus ? `（细节抓手：${b.detailFocus}）` : ''}`,
    )
    .join('\n');

  return [
    `@${writerCat} **【Step 4C · 按作者选定细纲与各分块参照风格撰写《${project.title}》第 ${chapterNo} 章正文】**`,
    `- **项目 ID**：\`${project.id}\` | **章节**：第 ${chapterNo} 章 | **目标字数**：约 ${project.styleConfig.targetWords} 字`,
    `- **选定细纲标题**：《${chosenDetailed.title}》`,
    chosenDetailed.openingConnection ? `- **开场承接**：${chosenDetailed.openingConnection}` : '',
    `- **逐拍执行细纲**：\n${beatLines}`,
    chosenDetailed.endingCliffhanger ? `- **章末断章钩子**：${chosenDetailed.endingCliffhanger}` : '',
    extraNote?.trim() ? `- **作者额外叮嘱**：${extraNote.trim()}` : '',
    `- **已激活的分块参照小说风格**：\n${boundModulesSummary}`,
    project.dissectionReport?.authorNativeStyleNotes
      ? `- **作者前三章原生语感标尺**：\n${project.dissectionReport.authorNativeStyleNotes}`
      : '',
    '',
    `请先调用 \`novel_read_project_context(projectId="${project.id}", chapterNo=${chapterNo})\` 获取上一章结尾切片、已激活的分块技法规则与 RAG 节拍样本，严格按选定细纲写出饱满正文，完成后调用 \`novel_submit_chapter_draft(projectId="${project.id}", chapterNo=${chapterNo}, draftKind="copilot", title="${chosenDetailed.title}", content="...")\` 提交！`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function buildDeAiHumanizePrompt(params: {
  project: NovelProject;
  chapterNo: number;
  flavorReport: HumanizerReport;
  extraToneHint?: string;
}): string {
  const { project, chapterNo, flavorReport, extraToneHint } = params;
  const humanizerCat = project.catRoster.criticCatId || project.catRoster.writerCatId || project.copilotCatId || 'kimi';
  const topFlags = flavorReport.flags
    .slice(0, 8)
    .map((f) => `  - 第 ${f.paragraphIndex + 1} 段命中「${f.matchedText}」→ ${f.suggestion}`)
    .join('\n');

  return [
    `@${humanizerCat} **【Step 6 ·《${project.title}》第 ${chapterNo} 章专项去AI味优化】**`,
    `- **项目 ID**：\`${project.id}\` | **当前 AI 腔指数**：${flavorReport.aiFlavorScore}/100（共检测到 ${flavorReport.flags.length} 处痕迹）`,
    topFlags ? `- **重点待消除的 AI 套话与机械句式**：\n${topFlags}` : '',
    project.dissectionReport?.authorNativeStyleNotes
      ? `- **贴合前三章作者本人语感**：\n${project.dissectionReport.authorNativeStyleNotes}`
      : '',
    extraToneHint?.trim() ? `- **作者本轮去AI味偏好**：${extraToneHint.trim()}` : '',
    '',
    '请加载 `novel-humanizer-zh` 技能：',
    `1. 调用 \`novel_read_project_context(projectId="${project.id}", chapterNo=${chapterNo})\` 读取当前正文 \`rawDraft\`；`,
    '2. **严禁删改任何剧情事实、人物行为因果与伏笔**，专注消除五官套话、排比三连、抽象总结腔与等长机械句，换用有呼吸感、贴合作者前三章语感的自然中文；',
    `3. 完成后调用 \`novel_submit_chapter_draft(projectId="${project.id}", chapterNo=${chapterNo}, draftKind="humanized", content="...")\` 提交优化稿！`,
  ]
    .filter(Boolean)
    .join('\n');
}
