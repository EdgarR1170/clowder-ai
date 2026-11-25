import {
  type AuthorDirectionSelection,
  type ChapterDirectionOption,
  type ChapterStateRecord,
  type ContinuityBridgeAlert,
  type DistilledChapterSummary,
  isChapterCompletedStage,
  type MechanicsLedger,
  type NarrativeGraph,
  type NovelProject,
  type RetrievedBeatPassage,
} from '@cat-cafe/shared';
import { buildSnapshotContinuityConstraints } from '../canon/invariant-checker.js';
import type { ResolvedNovelEmbedder } from '../corpus/novel-embedding-provider.js';
import type { NovelVectorStore } from '../corpus/novel-vector-store.js';

export interface ReferenceStyleDigest {
  stylePreset: string;
  customStyleGuidelines: string;
  targetWords: number;
  books: Array<{
    id: string;
    title: string;
    dominantPov?: string;
    avgSentenceLengthChars?: number;
    dialogueRatio?: number;
    avgParagraphChars?: number;
  }>;
  ideationStructuralBeats: RetrievedBeatPassage[];
  proseCadenceSamples: RetrievedBeatPassage[];
  styleInstructionMarkdown: string;
}

export interface DownstreamBridgeConstraint {
  nextChapterNo: number;
  nextTitle: string;
  nextOneLineSummary: string;
  nextOpeningAnchor: string;
  nextOpeningExcerpt: string;
  bridgeInstructionMarkdown: string;
}

export interface ChapterCopilotContextPacket {
  projectId: string;
  projectTitle: string;
  genre: string;
  chapterNo: number;
  mode: 'ideate' | 'draft' | 'summarize';
  authorMasterOutlineMarkdown: string;
  authorSeedHint: string;
  selectedDirection?: AuthorDirectionSelection;
  selectedOptionCards: ChapterDirectionOption[];
  upstreamRollingSynopsis: string;
  recentChapterSummaries: DistilledChapterSummary[];
  previousChapterTailExcerpt: string;
  previousChapterEndingAnchor: string;
  canonAtChapterStart: NarrativeGraph;
  continuityConstraintsMarkdown: string;
  accumulatedWorldbuildingMarkdown: string;
  downstreamBridge?: DownstreamBridgeConstraint;
  referenceStyle: ReferenceStyleDigest;
}

function getEffectiveChapterText(rec: ChapterStateRecord | undefined): string {
  if (!rec) return '';
  return (rec.finalText || rec.humanizedDraft || rec.rawDraft).trim();
}

function collectUpstreamHistory(project: NovelProject, chapterNo: number) {
  const priorRecords = Object.values(project.chapters)
    .filter((ch) => ch.chapterNo < chapterNo && getEffectiveChapterText(ch).length > 0)
    .sort((a, b) => a.chapterNo - b.chapterNo);

  const olderLines: string[] = [];
  const recentChapterSummaries: DistilledChapterSummary[] = [];

  for (const rec of priorRecords) {
    const summary =
      rec.distilledSummary ??
      buildDeterministicChapterSummary({
        chapterNo: rec.chapterNo,
        title: rec.title,
        text: getEffectiveChapterText(rec),
      });
    if (rec.chapterNo < chapterNo - 2) {
      olderLines.push(`- 第 ${summary.chapterNo} 章《${summary.title}》：${summary.oneLineSummary}`);
    } else {
      recentChapterSummaries.push(summary);
    }
  }

  const prevRecord = project.chapters[String(chapterNo - 1)];
  const prevText = getEffectiveChapterText(prevRecord);
  const previousChapterTailExcerpt = prevText.length > 800 ? prevText.slice(-800) : prevText;
  const previousChapterEndingAnchor =
    prevRecord?.distilledSummary?.endingAnchor || (prevText ? prevText.slice(-180) : '');

  return {
    upstreamRollingSynopsis: olderLines.join('\n'),
    recentChapterSummaries,
    previousChapterTailExcerpt,
    previousChapterEndingAnchor,
  };
}

function buildDownstreamBridge(project: NovelProject, chapterNo: number): DownstreamBridgeConstraint | undefined {
  const currentRec = project.chapters[String(chapterNo)];
  if (currentRec?.backtrackMode === 'rewind_truncate') return undefined;

  const nextRec = project.chapters[String(chapterNo + 1)];
  const nextText = getEffectiveChapterText(nextRec);
  if (!nextRec || !nextText) return undefined;

  const nextTitle = nextRec.title || nextRec.distilledSummary?.title || `第 ${chapterNo + 1} 章`;
  const nextOpeningExcerpt = nextText.slice(0, 600);
  const nextOpeningAnchor = nextRec.distilledSummary?.openingAnchor || nextText.slice(0, 180);
  const nextOneLineSummary = nextRec.distilledSummary?.oneLineSummary || nextOpeningAnchor;

  const bridgeInstructionMarkdown = [
    `## 启下衔接硬约束（定点重写桥接至第 ${chapterNo + 1} 章《${nextTitle}》）`,
    `- **下章核心梗概**：${nextOneLineSummary}`,
    `- **下章开场锚点**：${nextOpeningAnchor}`,
    `- **下章正文开头原文切片**：\n> ${nextOpeningExcerpt.replace(/\n+/g, '\n> ')}`,
    '- **收束要求**：本章的推进方向与章末落点必须自然过渡到第 ' +
      `${chapterNo + 1} 章的开场人物位置、时间点与悬念状态，严禁写出导致下章开头无法成立的矛盾结局！`,
  ].join('\n');

  return {
    nextChapterNo: chapterNo + 1,
    nextTitle,
    nextOneLineSummary,
    nextOpeningAnchor,
    nextOpeningExcerpt,
    bridgeInstructionMarkdown,
  };
}

async function resolveScopedReferenceStyle(params: {
  project: NovelProject;
  mode: 'ideate' | 'draft' | 'summarize';
  querySeed: string;
  corpus: NovelVectorStore;
  embedder: ResolvedNovelEmbedder | null;
}): Promise<ReferenceStyleDigest> {
  const { project, mode, querySeed, corpus, embedder } = params;
  const cfg = project.styleConfig;
  const books: ReferenceStyleDigest['books'] = [];

  for (const bookId of cfg.referenceBookIds) {
    const book = corpus.getBook(bookId);
    if (!book) continue;
    books.push({
      id: book.id,
      title: book.title,
      dominantPov: book.rawStyleStats?.dominantPov,
      avgSentenceLengthChars: book.rawStyleStats?.avgSentenceLengthChars,
      dialogueRatio: book.rawStyleStats?.dialogueRatio,
      avgParagraphChars: book.rawStyleStats?.avgParagraphChars,
    });
  }

  let ideationStructuralBeats: RetrievedBeatPassage[] = [];
  let proseCadenceSamples: RetrievedBeatPassage[] = [];
  const bookIds = books.map((b) => b.id);

  if (mode === 'ideate' && bookIds.length > 0) {
    ideationStructuralBeats = await corpus.searchPassages({
      query: querySeed.slice(0, 300) || project.title,
      bookIds,
      dimension: 'plot_arc',
      topK: 3,
      mode: 'structural_beats',
      embedder,
    });
  } else if (mode === 'draft' && bookIds.length > 0) {
    proseCadenceSamples = await corpus.searchPassages({
      query: querySeed.slice(0, 300) || project.title,
      bookIds,
      dimension: 'prose_style',
      topK: 2,
      mode: 'structural_beats',
      embedder,
    });
  }

  const styleLines = [
    `## 参照文风与篇幅要求（仅限单章行文与节拍启发，严禁篡改作者主线）`,
    `- **文风基调预设**：${cfg.stylePreset || '沉稳具象·强代入感'}`,
    `- **单章目标字数**：约 ${cfg.targetWords} 字`,
  ];
  if (cfg.customStyleGuidelines.trim()) {
    styleLines.push(`- **作者自定义文风要求**：${cfg.customStyleGuidelines.trim()}`);
  }
  for (const b of books) {
    const ratio = b.dialogueRatio !== undefined ? `${Math.round(b.dialogueRatio * 100)}%` : '适中';
    styleLines.push(
      `- **参照书《${b.title}》量化韵律**：叙事视角=${b.dominantPov ?? 'third_limited'} | 均句长=${b.avgSentenceLengthChars ?? 22}字 | 对话占比=${ratio}（严禁借用该书专有人名/地名/设定）`,
    );
  }

  return {
    stylePreset: cfg.stylePreset,
    customStyleGuidelines: cfg.customStyleGuidelines,
    targetWords: cfg.targetWords,
    books,
    ideationStructuralBeats,
    proseCadenceSamples,
    styleInstructionMarkdown: styleLines.join('\n'),
  };
}

export async function buildCopilotContextPacket(params: {
  project: NovelProject;
  canonAtStart: NarrativeGraph;
  mechanicsAtStart: MechanicsLedger;
  chapterNo: number;
  mode: 'ideate' | 'draft' | 'summarize';
  corpus: NovelVectorStore;
  embedder: ResolvedNovelEmbedder | null;
}): Promise<ChapterCopilotContextPacket> {
  const { project, canonAtStart, mechanicsAtStart, chapterNo, mode, corpus, embedder } = params;
  const record = project.chapters[String(chapterNo)];
  const upstream = collectUpstreamHistory(project, chapterNo);
  const downstreamBridge = mode === 'summarize' ? undefined : buildDownstreamBridge(project, chapterNo);

  const selectedDirection = record?.selectedDirection;
  const selectedIds = new Set(selectedDirection?.selectedOptionIds ?? []);
  const selectedOptionCards = (record?.directionOptions ?? []).filter((opt) => selectedIds.has(opt.optionId));

  const querySeed = [
    record?.authorSeedHint,
    selectedDirection?.customAuthorInput,
    selectedOptionCards.map((c) => c.pitch).join(' '),
    upstream.previousChapterEndingAnchor,
    project.premise,
  ]
    .filter(Boolean)
    .join(' ');

  const referenceStyle = await resolveScopedReferenceStyle({
    project,
    mode,
    querySeed,
    corpus,
    embedder,
  });

  const continuityConstraintsMarkdown = buildSnapshotContinuityConstraints({
    chapterNo,
    graph: canonAtStart,
    mechanics: mechanicsAtStart,
  });

  return {
    projectId: project.id,
    projectTitle: project.title,
    genre: project.genre,
    chapterNo,
    mode,
    authorMasterOutlineMarkdown: project.authorMasterOutlineMarkdown || project.premise,
    authorSeedHint: record?.authorSeedHint ?? '',
    selectedDirection,
    selectedOptionCards,
    upstreamRollingSynopsis: upstream.upstreamRollingSynopsis,
    recentChapterSummaries: upstream.recentChapterSummaries,
    previousChapterTailExcerpt: upstream.previousChapterTailExcerpt,
    previousChapterEndingAnchor: upstream.previousChapterEndingAnchor,
    canonAtChapterStart: canonAtStart,
    continuityConstraintsMarkdown,
    accumulatedWorldbuildingMarkdown: project.accumulatedWorldbuildingMarkdown,
    downstreamBridge,
    referenceStyle,
  };
}

function inferHeadingAndBody(rawText: string, chapterNo: number, explicitTitle?: string) {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const firstLine = lines[0] ?? '';
  const headingMatch = firstLine.match(/^#*\s*第\s*[0-9一二三四五六七八九十百千万]+\s*章[\s：:·-]*(.+)$/);
  const inferredTitle = explicitTitle?.trim() || headingMatch?.[1]?.trim() || `第 ${chapterNo} 章`;
  const paragraphs = headingMatch ? lines.slice(1) : lines;
  return { title: inferredTitle.slice(0, 120), paragraphs: paragraphs.length > 0 ? paragraphs : lines };
}

function extractProperTerms(text: string, canonBefore?: NarrativeGraph): string[] {
  const existingNames = new Set<string>([
    ...(canonBefore?.characters.map((c) => c.name) ?? []),
    ...(canonBefore?.locations.map((l) => l.name) ?? []),
  ]);
  const found: string[] = [];
  const matches = text.match(/「([^」]{2,18})」|《([^》]{2,18})》/g) ?? [];
  for (const raw of matches) {
    const clean = raw.slice(1, -1).trim();
    if (clean.length >= 2 && !existingNames.has(clean) && !found.includes(clean)) {
      found.push(`新现词条/器物：${clean}`);
    }
    if (found.length >= 6) break;
  }
  return found;
}

/**
 * Deterministic baseline reverse-summarizer so finalizing any chapter immediately yields
 * a faithful summary outline & anchors, even before/without an async LLM cat callback.
 */
export function buildDeterministicChapterSummary(params: {
  chapterNo: number;
  title?: string;
  text: string;
  canonBefore?: NarrativeGraph;
}): DistilledChapterSummary {
  const trimmed = params.text.trim();
  const { title, paragraphs } = inferHeadingAndBody(trimmed, params.chapterNo, params.title);
  const firstPara = paragraphs[0] ?? trimmed.slice(0, 180);
  const midPara = paragraphs[Math.floor(paragraphs.length / 2)] ?? firstPara;
  const lastPara = paragraphs[paragraphs.length - 1] ?? firstPara;

  const openingAnchor = firstPara.slice(0, 180);
  const endingAnchor = lastPara.slice(-180);
  const keyEvents = [...new Set([firstPara.slice(0, 110), midPara.slice(0, 110), lastPara.slice(0, 110)])].filter(
    Boolean,
  );
  const oneLineSummary = `${firstPara.slice(0, 80)}……${lastPara.slice(-90)}`.slice(0, 260);

  const characterChanges: string[] = [];
  for (const ch of params.canonBefore?.characters ?? []) {
    if (trimmed.includes(ch.name)) {
      characterChanges.push(`${ch.name}在本章登场推进剧情`);
    }
  }

  return {
    chapterNo: params.chapterNo,
    title,
    oneLineSummary: oneLineSummary || `第 ${params.chapterNo} 章剧情推进`,
    keyEvents,
    characterChanges: characterChanges.slice(0, 8),
    newlyIntroducedSettings: extractProperTerms(trimmed, params.canonBefore),
    openingAnchor,
    endingAnchor,
    wordCount: trimmed.replace(/\s+/g, '').length,
    summarizedAt: new Date().toISOString(),
  };
}

export function rebuildRollingSynopsisMarkdown(project: NovelProject): string {
  const completed = Object.values(project.chapters)
    .filter((ch) => isChapterCompletedStage(ch.stage) || Boolean(ch.distilledSummary))
    .sort((a, b) => a.chapterNo - b.chapterNo);

  if (completed.length === 0) return '';

  const lines: string[] = [`# 《${project.title}》随章反向总结总纲`, ''];
  for (const ch of completed) {
    const sum = ch.distilledSummary;
    if (!sum) continue;
    lines.push(`## 第 ${ch.chapterNo} 章 · ${sum.title}（${sum.wordCount} 字）`);
    lines.push(`- **本章核心总结**：${sum.oneLineSummary}`);
    if (sum.keyEvents.length > 0) {
      lines.push(`- **关键事件链**：${sum.keyEvents.join(' → ')}`);
    }
    if (sum.characterChanges.length > 0) {
      lines.push(`- **人物关系与状态变化**：${sum.characterChanges.join('；')}`);
    }
    if (sum.endingAnchor) {
      lines.push(`- **章末悬念/落点锚定**：${sum.endingAnchor}`);
    }
    lines.push('');
  }
  return lines.join('\n').trim();
}

export function mergeWorldbuildingMarkdown(existingMarkdown: string, chapterNo: number, additions: string[]): string {
  const cleanItems = [...new Set(additions.map((s) => s.trim()).filter(Boolean))];
  if (cleanItems.length === 0) return existingMarkdown;

  const base = existingMarkdown.trim();
  const existingLines = new Set(
    base
      .split(/\r?\n/)
      .map((l) => l.replace(/^-\s*(\[第\d+章\]\s*)?/, '').trim())
      .filter(Boolean),
  );

  const fresh = cleanItems.filter((item) => !existingLines.has(item));
  if (fresh.length === 0) return base;

  const header = base || '# 随章沉淀世界观与专有设定集';
  const block = fresh.map((item) => `- [第${chapterNo}章] ${item}`).join('\n');
  return `${header}\n${block}`.trim();
}

/**
 * Checks bidirectional continuity between Chapter K (after regeneration/finalization)
 * and existing Chapter K + 1 so mid-book rewrites surface any bridge conflict immediately.
 */
export function detectDownstreamContinuityAlert(params: {
  chapterK: ChapterStateRecord;
  chapterKPlus1: ChapterStateRecord | undefined;
  canonAfterK: NarrativeGraph;
  wasInPlaceRewrite?: boolean;
}): ContinuityBridgeAlert | undefined {
  const { chapterK, chapterKPlus1, canonAfterK, wasInPlaceRewrite } = params;
  if (!chapterKPlus1) return undefined;
  const nextText = getEffectiveChapterText(chapterKPlus1);
  if (!nextText) return undefined;

  const details: string[] = [];
  let hasHardConflict = false;

  for (const dead of canonAfterK.characters.filter((c) => c.status === 'dead' || c.status === 'sealed')) {
    const names = [dead.name, ...dead.aliases].filter((n) => n.length >= 2);
    for (const nm of names) {
      const activeRe = new RegExp(
        `${nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^。！？\\n]{0,12}(?:说道|开口|笑道|喝道|走出|挥剑|抬手|点头)`,
      );
      if (activeRe.test(nextText) && !/回忆|生前|遗言|墓|幻影/.test(nextText.slice(0, 300))) {
        hasHardConflict = true;
        details.push(
          `角色「${dead.name}」在第 ${chapterK.chapterNo} 章后处于 [${dead.status}] 状态，但在第 ${chapterKPlus1.chapterNo} 章正文中仍有活人言行。`,
        );
        break;
      }
    }
  }

  for (const loc of canonAfterK.locations.filter((l) => l.status === 'destroyed')) {
    if (nextText.slice(0, 500).includes(loc.name) && !/废墟|残垣|坍塌|毁/.test(nextText.slice(0, 600))) {
      details.push(
        `地点「${loc.name}」在第 ${chapterK.chapterNo} 章后已损毁，请核对第 ${chapterKPlus1.chapterNo} 章开头环境描写是否衔接。`,
      );
    }
  }

  if (!hasHardConflict && details.length === 0 && !wasInPlaceRewrite) {
    return undefined;
  }

  if (details.length === 0 && wasInPlaceRewrite) {
    const endAnchor = chapterK.distilledSummary?.endingAnchor ?? '';
    const openAnchor = chapterKPlus1.distilledSummary?.openingAnchor ?? nextText.slice(0, 120);
    details.push(`第 ${chapterK.chapterNo} 章已定点重生成（新章末：${endAnchor.slice(0, 80)}）。`);
    details.push(`请快速核对与第 ${chapterKPlus1.chapterNo} 章开场（${openAnchor.slice(0, 80)}）的动作及情绪过渡。`);
  }

  return {
    fromChapterNo: chapterK.chapterNo,
    toChapterNo: chapterKPlus1.chapterNo,
    severity: hasHardConflict ? 'conflict' : 'warn',
    summary: hasHardConflict
      ? `第 ${chapterK.chapterNo}→${chapterKPlus1.chapterNo} 章检测到硬性人物/设定穿帮冲突！`
      : `第 ${chapterK.chapterNo} 章已重生成，建议复核与第 ${chapterKPlus1.chapterNo} 章开头的过渡衔接`,
    details,
    detectedAt: new Date().toISOString(),
  };
}
