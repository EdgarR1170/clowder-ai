import {
  type ArchivedBranchRecord,
  type BacktrackMode,
  type ChapterDirectionOption,
  type ChapterOutline,
  type ChapterQualityReport,
  type ChapterStateDelta,
  type ChapterStateRecord,
  type ChapterVersionSnapshot,
  type ContinuityBridgeAlert,
  chapterDirectionOptionSchema,
  chapterOutlineSchema,
  chapterStateDeltaSchema,
  type DimensionSkillBinding,
  type DistilledChapterSummary,
  distilledChapterSummarySchema,
  isChapterCompletedStage,
  type MechanicsLedger,
  type NarrativeGraph,
  type NovelCraftDimension,
  type NovelProject,
  type NovelWorkflowConfig,
  type Pacing5AxisScore,
  type Prose5AxisScore,
  type RetrievedBeatPassage,
  type StoryArc,
  type StyleReferenceConfig,
  storyArcSchema,
} from '@cat-cafe/shared';
import { nanoid } from 'nanoid';
import {
  applyCommittedChapterDelta,
  buildPreChapterConstraints,
  verifyDraftContinuity,
} from '../canon/invariant-checker.js';
import type { NovelEmbeddingProviderRegistry } from '../corpus/novel-embedding-provider.js';
import type { NovelVectorStore } from '../corpus/novel-vector-store.js';
import { analyzeChineseAiFlavor, lightPolishAiCliches } from '../humanizer/humanizer-zh.js';
import type { BookToSkillCompiler } from '../skill-compiler/book-to-skill-compiler.js';
import {
  buildCopilotContextPacket,
  buildDeterministicChapterSummary,
  type ChapterCopilotContextPacket,
  detectDownstreamContinuityAlert,
  mergeWorldbuildingMarkdown,
  rebuildRollingSynopsisMarkdown,
} from './copilot-context-builder.js';
import type { FullNovelProjectBundle, NovelProjectStore } from './novel-project-store.js';

export interface ThreadCoordinatorPort {
  ensureEditorialThread(params: {
    existingThreadId?: string;
    title: string;
    catIds: string[];
  }): Promise<string | undefined>;
  dispatchToCat(params: { threadId: string; targetCatId: string; markdown: string }): Promise<void>;
  abortEditorialThread?(threadId: string): Promise<{
    cancelledCats: string[];
    withdrawnQueueCount: number;
  }>;
}

export interface ChapterWorkPacket {
  projectId: string;
  projectTitle: string;
  chapterNo: number;
  outline: ChapterOutline;
  stage: ChapterStateRecord['stage'];
  rewriteRound: number;
  activeSkills: Array<{
    slug: string;
    title: string;
    dimension: NovelCraftDimension;
    skillMarkdown: string;
  }>;
  ragPassages: RetrievedBeatPassage[];
  precheckConstraintsMarkdown: string;
  specialistNotes: string;
  lastCritique?: string;
}

export class ChapterOrchestrator {
  constructor(
    private readonly store: NovelProjectStore,
    private readonly corpus: NovelVectorStore,
    private readonly embedRegistry: NovelEmbeddingProviderRegistry,
    private readonly skillCompiler: BookToSkillCompiler,
    private readonly threadCoordinator?: ThreadCoordinatorPort,
  ) {}

  updateDimensionMatrix(projectId: string, bindings: DimensionSkillBinding[]): NovelProject {
    const bundle = this.mustLoad(projectId);
    bundle.project.dimensionBindings = bindings;
    this.store.saveBundle(bundle.project);
    return this.mustLoad(projectId).project;
  }

  updateWorkflowConfig(
    projectId: string,
    patch: Partial<NovelWorkflowConfig>,
    catRosterPatch?: Partial<NovelProject['catRoster']>,
  ): NovelProject {
    const bundle = this.mustLoad(projectId);
    bundle.project.workflow = {
      ...bundle.project.workflow,
      ...patch,
    };
    if (patch.enableMechanicsLedger !== undefined) {
      bundle.mechanics.enabled = patch.enableMechanicsLedger;
    }
    if (catRosterPatch) {
      bundle.project.catRoster = {
        ...bundle.project.catRoster,
        ...catRosterPatch,
      };
    }
    this.store.saveBundle(bundle.project, undefined, bundle.mechanics);
    return this.mustLoad(projectId).project;
  }

  saveOutlineArtifacts(
    projectId: string,
    input: {
      worldBlueprintMarkdown?: string;
      storyArcs?: StoryArc[];
      chapterOutlines?: ChapterOutline[];
      replaceAllChapterOutlines?: boolean;
    },
  ): NovelProject {
    const bundle = this.mustLoad(projectId);
    if (input.worldBlueprintMarkdown !== undefined) {
      bundle.project.worldBlueprintMarkdown = input.worldBlueprintMarkdown;
    }
    if (input.storyArcs !== undefined) {
      bundle.project.storyArcs = input.storyArcs.map((a) => storyArcSchema.parse(a));
    }
    if (input.chapterOutlines !== undefined) {
      if (input.replaceAllChapterOutlines) {
        bundle.project.chapterOutlines = input.chapterOutlines
          .map((raw) => chapterOutlineSchema.parse(raw))
          .sort((a, b) => a.chapterNo - b.chapterNo);
      } else {
        const merged = new Map(bundle.project.chapterOutlines.map((o) => [o.chapterNo, o]));
        for (const raw of input.chapterOutlines) {
          const parsed = chapterOutlineSchema.parse(raw);
          merged.set(parsed.chapterNo, parsed);
        }
        bundle.project.chapterOutlines = [...merged.values()].sort((a, b) => a.chapterNo - b.chapterNo);
      }
    }
    this.store.saveBundle(bundle.project);
    return this.mustLoad(projectId).project;
  }

  deleteChapterOutline(projectId: string, chapterNo: number): NovelProject {
    const bundle = this.mustLoad(projectId);
    const { project } = bundle;
    const existingRecord = project.chapters[String(chapterNo)];
    if (existingRecord?.stage === 'committed') {
      throw new Error(`第 ${chapterNo} 章已定稿入账，不可直接删除章纲；如需重来请先回滚至第 ${chapterNo - 1} 章。`);
    }
    const beforeLen = project.chapterOutlines.length;
    project.chapterOutlines = project.chapterOutlines.filter((o) => o.chapterNo !== chapterNo);
    if (project.chapterOutlines.length === beforeLen) {
      throw new Error(`Chapter ${chapterNo} outline not found`);
    }
    delete project.chapters[String(chapterNo)];
    if (project.currentChapterNo === chapterNo) {
      const nextUncommitted = project.chapterOutlines.find(
        (o) => project.chapters[String(o.chapterNo)]?.stage !== 'committed',
      );
      if (nextUncommitted) {
        project.currentChapterNo = nextUncommitted.chapterNo;
      }
    }
    this.store.saveBundle(project);
    return this.mustLoad(projectId).project;
  }

  /**
   * Emergency Stop / Human Intervention Pause:
   * 1. Switches approvalMode to 'chapter-gate' and zeroes autoRemainingChapters so auto-run cannot advance.
   * 2. Marks any in-flight chapter ('prechecking' | 'drafting' | 'reviewing' | 'rewriting' | 'humanizing') as 'paused',
   *    preserving any partial drafts/notes already saved.
   * 3. Withdraws all pending queue items in the editorial thread (including private_input dispatches)
   *    and cancels all active cat invocations via InvocationTracker.
   */
  async pauseEditorialRun(projectId: string): Promise<{
    project: NovelProject;
    pausedChapterNos: number[];
    cancelledCats: string[];
    withdrawnQueueCount: number;
  }> {
    const bundle = this.mustLoad(projectId);
    const { project } = bundle;
    project.workflow.approvalMode = 'chapter-gate';
    project.workflow.autoRemainingChapters = 0;

    const activeStages = new Set<ChapterStateRecord['stage']>([
      'ideating',
      'summarizing',
      'prechecking',
      'drafting',
      'reviewing',
      'rewriting',
      'humanizing',
    ]);
    const pausedChapterNos: number[] = [];
    const now = new Date().toISOString();

    for (const rec of Object.values(project.chapters)) {
      if (rec && activeStages.has(rec.stage)) {
        rec.stage = 'paused';
        rec.updatedAt = now;
        pausedChapterNos.push(rec.chapterNo);
      }
    }

    this.store.saveBundle(project);

    let cancelledCats: string[] = [];
    let withdrawnQueueCount = 0;
    if (project.threadId && this.threadCoordinator?.abortEditorialThread) {
      const aborted = await this.threadCoordinator.abortEditorialThread(project.threadId);
      cancelledCats = aborted.cancelledCats;
      withdrawnQueueCount = aborted.withdrawnQueueCount;
    }

    return {
      project: this.mustLoad(projectId).project,
      pausedChapterNos: pausedChapterNos.sort((a, b) => a - b),
      cancelledCats,
      withdrawnQueueCount,
    };
  }

  /**
   * Step 1 of Chapter Loop (Precheck + Dynamic Skill & RAG Assembly):
   * Invoked by Chief Editor Cat or Web UI to kick off (or reset & re-run) Chapter N.
   */
  async prepareAndStartChapter(
    projectId: string,
    chapterNo: number,
    options: { wakeCatsInThread?: boolean; resetExistingDraft?: boolean } = {},
  ): Promise<ChapterWorkPacket> {
    const bundle = this.mustLoad(projectId);
    const { project, canon, mechanics } = bundle;
    const outline = project.chapterOutlines.find((o) => o.chapterNo === chapterNo);
    if (!outline) {
      throw new Error(
        `Chapter ${chapterNo} outline not found in project "${project.title}". Generate chapter-outlines first.`,
      );
    }

    const existingRecord = project.chapters[String(chapterNo)];
    if (existingRecord?.stage === 'committed' && options.resetExistingDraft) {
      throw new Error(`第 ${chapterNo} 章已定稿入账；如需按新纲重写已入账章节，请先回滚至第 ${chapterNo - 1} 章。`);
    }

    // 1. Run InvariantChecker pre-scene check
    const precheck = buildPreChapterConstraints({ outline, graph: canon, mechanics });
    const hardBlockers = precheck.violations.filter((v) => v.severity === 'blocker');
    if (hardBlockers.length > 0) {
      throw new Error(
        `Chapter ${chapterNo} blocked by hard continuity invariants:\n` +
          hardBlockers.map((b) => `- ${b.message}`).join('\n'),
      );
    }

    // 2. Dynamically resolve needed craft dimensions from chapter beats (+ always plot_arc & prose_style)
    const neededDims = new Set<NovelCraftDimension>(['plot_arc', 'prose_style']);
    for (const beat of outline.beats) {
      neededDims.add(beat.primaryDimension);
      for (const sec of beat.secondaryDimensions) neededDims.add(sec);
    }
    if (project.workflow.enableMechanicsLedger) neededDims.add('world_mechanics');

    const activeSkillSlugs = new Set<string>();
    const ragPassages: RetrievedBeatPassage[] = [];
    const embedder = this.embedRegistry.resolveActiveEmbedder();

    for (const dim of neededDims) {
      const binding = project.dimensionBindings.find((b) => b.dimension === dim);
      if (!binding) continue;
      for (const slug of binding.skillSlugs) activeSkillSlugs.add(slug);

      if (binding.referenceBookIds.length > 0 && binding.ragWeight > 0) {
        const beatQueries = outline.beats
          .filter((b) => b.primaryDimension === dim || b.secondaryDimensions.includes(dim))
          .map((b) => b.ragQueryHint || b.summary)
          .join('；');
        const query = beatQueries || `${outline.title} ${outline.conflict}`;
        const hits = await this.corpus.searchPassages({
          query,
          bookIds: binding.referenceBookIds,
          dimension: dim,
          topK: 2,
          mode: binding.ragMode,
          embedder,
        });
        ragPassages.push(...hits);
      }
    }

    const activeSkills: ChapterWorkPacket['activeSkills'] = [];
    for (const slug of activeSkillSlugs) {
      const loaded = this.skillCompiler.getSkill(slug);
      if (loaded) {
        activeSkills.push({
          slug: loaded.spec.slug,
          title: loaded.spec.title,
          dimension: loaded.spec.dimension,
          skillMarkdown: loaded.skillMarkdown,
        });
      }
    }

    const resetDraft = Boolean(options.resetExistingDraft);
    const now = new Date().toISOString();
    const nextRecord: ChapterStateRecord = {
      chapterNo,
      title: existingRecord?.title || outline.title,
      stage: 'drafting',
      rewriteRound: resetDraft ? 0 : (existingRecord?.rewriteRound ?? 0),
      authorSeedHint: existingRecord?.authorSeedHint ?? '',
      backtrackMode: existingRecord?.backtrackMode,
      directionOptions: existingRecord?.directionOptions ?? [],
      selectedDirection: existingRecord?.selectedDirection,
      distilledSummary: resetDraft ? undefined : existingRecord?.distilledSummary,
      versionHistory: existingRecord?.versionHistory ?? [],
      continuityAlert: resetDraft ? undefined : existingRecord?.continuityAlert,
      activeSkillSlugs: [...activeSkillSlugs],
      precheckConstraintsMarkdown: precheck.constraintsMarkdown,
      precheckWarnings: precheck.violations,
      ragPassages,
      specialistNotes: resetDraft ? '' : (existingRecord?.specialistNotes ?? ''),
      rawDraft: resetDraft ? '' : (existingRecord?.rawDraft ?? ''),
      humanizedDraft: resetDraft ? '' : (existingRecord?.humanizedDraft ?? ''),
      finalText: resetDraft ? '' : (existingRecord?.finalText ?? ''),
      qualityHistory: resetDraft ? [] : (existingRecord?.qualityHistory ?? []),
      proposedStateDelta: resetDraft ? undefined : existingRecord?.proposedStateDelta,
      writerCatId: project.catRoster.writerCatId,
      criticCatId: project.catRoster.criticCatId,
      authorNotes: resetDraft ? '' : (existingRecord?.authorNotes ?? ''),
      updatedAt: now,
    };

    project.chapters[String(chapterNo)] = nextRecord;
    project.currentChapterNo = chapterNo;

    // Ensure editorial thread if coordinator is bound & wakeup requested
    if (options.wakeCatsInThread && this.threadCoordinator) {
      const rosterIds = [
        ...new Set(
          [
            project.catRoster.chiefEditorCatId,
            project.catRoster.writerCatId,
            project.catRoster.specialistCatId,
            project.catRoster.criticCatId,
          ].filter(Boolean),
        ),
      ];
      const threadId = await this.threadCoordinator.ensureEditorialThread({
        existingThreadId: project.threadId,
        title: `📖《${project.title}》多猫编辑部`,
        catIds: rosterIds,
      });
      if (threadId) {
        project.threadId = threadId;
        this.store.saveBundle(project);
        const hasHeavySpecialistBeat = outline.beats.some(
          (b) => b.primaryDimension === 'battle_action' || b.primaryDimension === 'scene_atmosphere',
        );
        const coordinatorPrompt = this.buildChiefEditorDispatchMessage(
          project,
          outline,
          [...activeSkillSlugs],
          ragPassages.length,
          hasHeavySpecialistBeat,
        );
        await this.threadCoordinator.dispatchToCat({
          threadId,
          targetCatId: project.catRoster.chiefEditorCatId,
          markdown: coordinatorPrompt,
        });
      } else {
        this.store.saveBundle(project);
      }
    } else {
      this.store.saveBundle(project);
    }

    return this.buildWorkPacket(project, outline, nextRecord, activeSkills);
  }

  getChapterWorkPacket(projectId: string, chapterNo: number): ChapterWorkPacket {
    const { project } = this.mustLoad(projectId);
    const outline = project.chapterOutlines.find((o) => o.chapterNo === chapterNo);
    if (!outline) throw new Error(`Chapter ${chapterNo} outline not found`);
    const record = project.chapters[String(chapterNo)];
    if (!record) throw new Error(`Chapter ${chapterNo} has not been started yet; call precheck first`);
    const activeSkills = record.activeSkillSlugs
      .map((slug) => this.skillCompiler.getSkill(slug))
      .filter((x): x is NonNullable<typeof x> => x !== null)
      .map((loaded) => ({
        slug: loaded.spec.slug,
        title: loaded.spec.title,
        dimension: loaded.spec.dimension,
        skillMarkdown: loaded.skillMarkdown,
      }));
    return this.buildWorkPacket(project, outline, record, activeSkills);
  }

  recordSpecialistNotes(projectId: string, chapterNo: number, notes: string): ChapterStateRecord {
    const { project } = this.mustLoad(projectId);
    const record = this.mustChapterRecord(project, chapterNo);
    record.specialistNotes = notes.trim();
    record.updatedAt = new Date().toISOString();
    this.store.saveBundle(project);
    return record;
  }

  /**
   * Step 2 of Chapter Loop: Writer / Co-Pilot Cat submits draft (or humanized revision).
   */
  async submitChapterDraft(params: {
    projectId: string;
    chapterNo: number;
    authorCatId: string;
    title?: string;
    draftKind: 'raw' | 'humanized' | 'copilot';
    content: string;
    proposedStateDelta?: ChapterStateDelta;
    wakeNextCat?: boolean;
  }): Promise<{ record: ChapterStateRecord; aiFlavorScore: number; flagCount: number }> {
    const bundle = this.mustLoad(params.projectId);
    const { project } = bundle;
    const hasLegacyOutline = project.chapterOutlines.some((o) => o.chapterNo === params.chapterNo);
    const isCopilotDraft = params.draftKind === 'copilot' || !hasLegacyOutline;

    if (isCopilotDraft) {
      return this.submitCopilotDraftInternal(bundle, params);
    }

    const record = this.mustChapterRecord(project, params.chapterNo);
    const wasPaused = record.stage === 'paused';
    const styleSkill = record.activeSkillSlugs
      .map((s) => this.skillCompiler.getSkill(s)?.spec.styleProfile)
      .find((sp) => sp !== undefined);

    const parsedDelta = params.proposedStateDelta
      ? chapterStateDeltaSchema.parse(params.proposedStateDelta)
      : record.proposedStateDelta;

    if (params.title?.trim()) {
      record.title = params.title.trim();
    }

    if (params.draftKind === 'raw') {
      record.rawDraft = params.content.trim();
      record.writerCatId = params.authorCatId;
      record.proposedStateDelta = parsedDelta;
      record.stage = wasPaused ? 'paused' : 'reviewing';
    } else {
      const cleaned = lightPolishAiCliches(params.content.trim());
      record.humanizedDraft = cleaned;
      record.finalText = cleaned;
      if (parsedDelta) record.proposedStateDelta = parsedDelta;
      record.stage = wasPaused
        ? 'paused'
        : project.workflow.approvalMode === 'auto-continuous'
          ? 'committed'
          : 'awaiting_approval';
    }

    const report = analyzeChineseAiFlavor(
      params.draftKind === 'humanized' ? record.humanizedDraft : record.rawDraft,
      styleSkill,
    );
    record.updatedAt = new Date().toISOString();

    if (!wasPaused && params.draftKind === 'humanized' && project.workflow.approvalMode === 'auto-continuous') {
      await this.commitChapterInternal(bundle, params.chapterNo, params.wakeNextCat ?? true);
      const updated = this.mustLoad(params.projectId).project.chapters[String(params.chapterNo)];
      if (!updated) throw new Error(`Chapter ${params.chapterNo} missing after commit`);
      return {
        record: updated,
        aiFlavorScore: report.aiFlavorScore,
        flagCount: report.flags.length,
      };
    }

    this.store.saveBundle(project);

    if (!wasPaused && params.wakeNextCat && params.draftKind === 'raw' && project.threadId && this.threadCoordinator) {
      await this.threadCoordinator.dispatchToCat({
        threadId: project.threadId,
        targetCatId: project.catRoster.criticCatId,
        markdown:
          `@${project.catRoster.criticCatId} 第 ${params.chapterNo} 章初稿已由 @${params.authorCatId} 提交（字数 ${record.rawDraft.length}，AI腔指数 ${report.aiFlavorScore}/100）。\n` +
          `请加载 \`novel-critic-gate\` 技能，调用 \`novel_evaluate_chapter\` 执行跨模型独立五轴质量审校、节奏评估与防穿帮核查！`,
      });
    }

    return { record, aiFlavorScore: report.aiFlavorScore, flagCount: report.flags.length };
  }

  /**
   * Step 3 of Chapter Loop: Cross-Cat Reviewer submits 5-axis prose + 5-axis pacing + invariant verdict.
   * Enforces Clowder AI Iron Law: Same catId CANNOT review its own chapter draft!
   */
  async evaluateChapter(params: {
    projectId: string;
    chapterNo: number;
    reviewerCatId: string;
    proseScores: Omit<Prose5AxisScore, 'overall'> & { overall?: number };
    pacingScores: Omit<Pacing5AxisScore, 'overall'> & { overall?: number };
    extraViolations?: ChapterQualityReport['invariantViolations'];
    summaryCritique: string;
    wakeNextCat?: boolean;
  }): Promise<{ report: ChapterQualityReport; nextStage: ChapterStateRecord['stage'] }> {
    const bundle = this.mustLoad(params.projectId);
    const { project, canon, mechanics } = bundle;
    const record = this.mustChapterRecord(project, params.chapterNo);
    const outline = project.chapterOutlines.find((o) => o.chapterNo === params.chapterNo);
    if (!outline) throw new Error(`Chapter ${params.chapterNo} outline missing`);
    if (!record.rawDraft.trim()) throw new Error(`Chapter ${params.chapterNo} has no draft to evaluate`);

    if (record.writerCatId && record.writerCatId === params.reviewerCatId) {
      throw new Error(
        `Cross-review violation: reviewer "${params.reviewerCatId}" cannot review their own draft (writerCatId="${record.writerCatId}"). Use a distinct critic cat!`,
      );
    }

    const proseOverall =
      params.proseScores.overall ??
      Number(
        (
          (params.proseScores.showDontTell +
            params.proseScores.characterVoice +
            params.proseScores.craftSkillFidelity +
            params.proseScores.cadenceAndVariety +
            params.proseScores.goalAndHook) /
          5
        ).toFixed(3),
      );

    const pacingOverall =
      params.pacingScores.overall ??
      Number(
        (
          (params.pacingScores.tensionMomentum +
            params.pacingScores.infoDensity +
            params.pacingScores.emotionalOscillation +
            params.pacingScores.arcProgression +
            params.pacingScores.readerFatigueGuard) /
          5
        ).toFixed(3),
      );

    const styleProfile = record.activeSkillSlugs
      .map((s) => this.skillCompiler.getSkill(s)?.spec.styleProfile)
      .find((sp) => sp !== undefined);

    const deterministicViolations = verifyDraftContinuity({
      outline,
      draftText: record.rawDraft,
      graph: canon,
      mechanics,
      proposedDelta: record.proposedStateDelta,
      styleProfile,
    });

    const allViolations = [...deterministicViolations, ...(params.extraViolations ?? [])];
    const hasBlocker = allViolations.some((v) => v.severity === 'blocker');
    const humanizerReport = analyzeChineseAiFlavor(record.rawDraft, styleProfile);

    const passesQuality =
      !hasBlocker &&
      proseOverall >= project.workflow.qualityThreshold &&
      pacingOverall >= project.workflow.pacingThreshold;

    const canRewrite = record.rewriteRound < project.workflow.maxRewriteRounds;
    const verdict: ChapterQualityReport['verdict'] =
      passesQuality || (!hasBlocker && !canRewrite) ? 'approved' : 'rewrite_required';

    const report: ChapterQualityReport = {
      reviewerCatId: params.reviewerCatId,
      verdict,
      invariantViolations: allViolations,
      proseScores: { ...params.proseScores, overall: proseOverall },
      pacingScores: { ...params.pacingScores, overall: pacingOverall },
      humanizerReport,
      summaryCritique: params.summaryCritique,
      evaluatedAt: new Date().toISOString(),
    };

    record.criticCatId = params.reviewerCatId;
    record.qualityHistory.push(report);

    if (verdict === 'rewrite_required') {
      record.rewriteRound += 1;
      record.stage = 'rewriting';
      record.updatedAt = new Date().toISOString();
      this.store.saveBundle(project);

      if (params.wakeNextCat && project.threadId && this.threadCoordinator && record.writerCatId) {
        await this.threadCoordinator.dispatchToCat({
          threadId: project.threadId,
          targetCatId: record.writerCatId,
          markdown:
            `@${record.writerCatId} 第 ${params.chapterNo} 章审校未通过（散文均分 ${proseOverall} / 节奏均分 ${pacingOverall}，第 ${record.rewriteRound}/${project.workflow.maxRewriteRounds} 轮返修）：\n` +
            `- **审校总评**：${params.summaryCritique}\n` +
            (allViolations.length > 0
              ? `- **穿帮/设定问题**：${allViolations.map((v) => `[${v.severity}] ${v.message}`).join('；')}\n`
              : '') +
            (params.proseScores.rewriteDirectives.length > 0
              ? `- **定向重写处方**：${params.proseScores.rewriteDirectives.join('；')}\n`
              : '') +
            `请针对上述问题精修后重新调用 \`novel_submit_chapter_draft(draftKind="raw")\` 提交。`,
        });
      }
      return { report, nextStage: record.stage };
    }

    // Approved! Proceed to Humanizer or Commit/Approval
    if (project.workflow.enableHumanizer) {
      // Perform deterministic baseline cleanup immediately; Writer Cat can optionally submit deeper humanized pass
      const autoPolished = lightPolishAiCliches(record.rawDraft);
      record.humanizedDraft = autoPolished;
      record.finalText = autoPolished;
      if (humanizerReport.aiFlavorScore >= 25 && params.wakeNextCat && project.threadId && this.threadCoordinator) {
        record.stage = 'humanizing';
        record.updatedAt = new Date().toISOString();
        this.store.saveBundle(project);
        const humanizerCat = record.writerCatId || project.catRoster.writerCatId;
        await this.threadCoordinator.dispatchToCat({
          threadId: project.threadId,
          targetCatId: humanizerCat,
          markdown:
            `@${humanizerCat} 第 ${params.chapterNo} 章已通过审校（5轴得分 ${proseOverall}），但检测到 AI 腔指数偏高（${humanizerReport.aiFlavorScore}/100，命中 ${humanizerReport.flags.length} 处）。\n` +
            `请加载 \`novel-humanizer-zh\` 技能消除套话与机械排比后调用 \`novel_submit_chapter_draft(draftKind="humanized")\` 定稿！`,
        });
        return { report, nextStage: record.stage };
      }
    } else {
      record.finalText = record.rawDraft;
    }

    if (project.workflow.approvalMode === 'auto-continuous') {
      await this.commitChapterInternal(bundle, params.chapterNo, params.wakeNextCat ?? true);
      return {
        report,
        nextStage: 'committed',
      };
    }

    record.stage = 'awaiting_approval';
    record.updatedAt = new Date().toISOString();
    this.store.saveBundle(project);
    return { report, nextStage: record.stage };
  }

  /**
   * Step 4: Finalize chapter (either via Human approval in chapter-gate mode or MCP commit),
   * updating NarrativeGraph + MechanicsLedger + saving rollback snapshot + advancing next chapter!
   */
  async commitChapter(params: {
    projectId: string;
    chapterNo: number;
    stateDeltaOverride?: ChapterStateDelta;
    finalTextOverride?: string;
    authorNotes?: string;
    wakeNextChapter?: boolean;
  }): Promise<FullNovelProjectBundle> {
    const bundle = this.mustLoad(params.projectId);
    const record = this.mustChapterRecord(bundle.project, params.chapterNo);
    if (params.stateDeltaOverride) {
      record.proposedStateDelta = chapterStateDeltaSchema.parse(params.stateDeltaOverride);
    }
    if (params.finalTextOverride?.trim()) {
      record.finalText = params.finalTextOverride.trim();
    } else if (!record.finalText.trim()) {
      record.finalText = (record.humanizedDraft || record.rawDraft).trim();
    }
    if (params.authorNotes !== undefined) {
      record.authorNotes = params.authorNotes;
    }
    if (!record.finalText) {
      throw new Error(`Cannot commit Chapter ${params.chapterNo}: manuscript text is empty`);
    }

    await this.commitChapterInternal(bundle, params.chapterNo, params.wakeNextChapter ?? true);
    return this.mustLoad(params.projectId);
  }

  /**
   * Breakpoint rollback: restore NarrativeGraph & MechanicsLedger to exact snapshot after Chapter targetChapterNo.
   */
  rollbackToChapter(projectId: string, targetChapterNo: number): FullNovelProjectBundle {
    const bundle = this.mustLoad(projectId);
    const { project, mechanics } = bundle;
    if (targetChapterNo < 0) throw new Error('targetChapterNo must be >= 0');

    const snapCanon = this.store.loadCanonSnapshot(projectId, targetChapterNo);
    const restoredCanon =
      snapCanon ??
      ({
        characters: [],
        locations: [],
        facts: [],
        foreshadowings: [],
        revision: bundle.canon.revision + 1,
        updatedAt: new Date().toISOString(),
      } satisfies typeof bundle.canon);

    const snapEntities = mechanics.chapterSnapshots[String(targetChapterNo)];
    if (snapEntities) {
      mechanics.entities = structuredClone(snapEntities);
    }
    for (const key of Object.keys(mechanics.chapterSnapshots)) {
      if (Number(key) > targetChapterNo) delete mechanics.chapterSnapshots[key];
    }
    for (const key of Object.keys(project.chapters)) {
      const no = Number(key);
      if (no > targetChapterNo) {
        const rec = project.chapters[key];
        if (rec) {
          rec.stage = 'planned';
          rec.updatedAt = new Date().toISOString();
        }
      }
    }
    project.currentChapterNo = targetChapterNo + 1;
    project.workflow.autoRemainingChapters = 0;

    this.store.saveBundle(project, restoredCanon, mechanics);
    return this.mustLoad(projectId);
  }

  async toggleAutoContinuous(
    projectId: string,
    enabled: boolean,
    maxChapters?: number,
    startFromChapterNo?: number,
    resetStartChapterDraft = false,
  ): Promise<NovelProject> {
    const bundle = this.mustLoad(projectId);
    const { project } = bundle;
    project.workflow.approvalMode = enabled ? 'auto-continuous' : 'chapter-gate';
    if (maxChapters !== undefined) {
      project.workflow.autoBatchSize = maxChapters;
    }
    project.workflow.autoRemainingChapters = enabled ? project.workflow.autoBatchSize : 0;
    this.store.saveBundle(project);

    if (enabled) {
      const nextOutline =
        startFromChapterNo !== undefined
          ? project.chapterOutlines.find((o) => o.chapterNo === startFromChapterNo)
          : project.chapterOutlines.find((o) => {
              const st = project.chapters[String(o.chapterNo)]?.stage;
              return st !== 'committed';
            });
      if (startFromChapterNo !== undefined && !nextOutline) {
        throw new Error(`Chapter ${startFromChapterNo} outline not found`);
      }
      if (nextOutline) {
        const existingStage = project.chapters[String(nextOutline.chapterNo)]?.stage;
        if (existingStage === 'committed') {
          throw new Error(`第 ${nextOutline.chapterNo} 章已定稿入账；请从后续未定稿章节开始连写，或先回滚快照。`);
        }
        await this.prepareAndStartChapter(projectId, nextOutline.chapterNo, {
          wakeCatsInThread: true,
          resetExistingDraft: resetStartChapterDraft,
        });
      }
    }
    return this.mustLoad(projectId).project;
  }

  private async commitChapterInternal(
    bundle: FullNovelProjectBundle,
    chapterNo: number,
    allowAutoAdvance: boolean,
  ): Promise<void> {
    const { project, canon, mechanics } = bundle;
    const record = this.mustChapterRecord(project, chapterNo);
    const { nextGraph, nextMechanics } = applyCommittedChapterDelta({
      chapterNo,
      graph: canon,
      mechanics,
      delta: record.proposedStateDelta,
    });

    record.stage = 'committed';
    record.updatedAt = new Date().toISOString();

    const nextUncommittedOutline = project.chapterOutlines.find(
      (o) => o.chapterNo > chapterNo && project.chapters[String(o.chapterNo)]?.stage !== 'committed',
    );
    project.currentChapterNo = nextUncommittedOutline ? nextUncommittedOutline.chapterNo : chapterNo + 1;

    if (project.workflow.approvalMode === 'auto-continuous' && project.workflow.autoRemainingChapters > 0) {
      project.workflow.autoRemainingChapters = Math.max(0, project.workflow.autoRemainingChapters - 1);
    }

    this.store.saveBundle(project, nextGraph, nextMechanics);
    this.store.saveCanonSnapshot(project.id, chapterNo, nextGraph);

    // Auto-advance to the next uncommitted chapter outline in auto-continuous mode if remaining budget > 0!
    if (
      allowAutoAdvance &&
      project.workflow.approvalMode === 'auto-continuous' &&
      project.workflow.autoRemainingChapters > 0 &&
      nextUncommittedOutline
    ) {
      await this.prepareAndStartChapter(project.id, nextUncommittedOutline.chapterNo, { wakeCatsInThread: true });
    }
  }

  private buildWorkPacket(
    project: NovelProject,
    outline: ChapterOutline,
    record: ChapterStateRecord,
    activeSkills: ChapterWorkPacket['activeSkills'],
  ): ChapterWorkPacket {
    const lastReport = record.qualityHistory[record.qualityHistory.length - 1];
    return {
      projectId: project.id,
      projectTitle: project.title,
      chapterNo: outline.chapterNo,
      outline,
      stage: record.stage,
      rewriteRound: record.rewriteRound,
      activeSkills,
      ragPassages: record.ragPassages,
      precheckConstraintsMarkdown: record.precheckConstraintsMarkdown,
      specialistNotes: record.specialistNotes,
      lastCritique: lastReport?.summaryCritique,
    };
  }

  // =========================================================================
  // Human-in-the-Loop Chapter Co-Pilot Methods (Bottom-Up 5-Direction Flow)
  // =========================================================================

  updateMasterOutlineAndStyle(
    projectId: string,
    input: {
      title?: string;
      genre?: string;
      premise?: string;
      authorMasterOutlineMarkdown?: string;
      styleConfig?: Partial<StyleReferenceConfig>;
      copilotCatId?: string;
      enableMechanicsLedger?: boolean;
    },
  ): NovelProject {
    const bundle = this.mustLoad(projectId);
    const { project, mechanics } = bundle;

    if (input.title?.trim()) project.title = input.title.trim();
    if (input.genre?.trim()) project.genre = input.genre.trim();
    if (input.premise !== undefined) project.premise = input.premise;
    if (input.authorMasterOutlineMarkdown !== undefined) {
      project.authorMasterOutlineMarkdown = input.authorMasterOutlineMarkdown;
    }
    if (input.styleConfig) {
      project.styleConfig = {
        ...project.styleConfig,
        ...input.styleConfig,
      };
    }
    if (input.copilotCatId?.trim()) {
      project.copilotCatId = input.copilotCatId.trim();
      project.catRoster.writerCatId = project.copilotCatId;
    }
    if (input.enableMechanicsLedger !== undefined) {
      project.workflow.enableMechanicsLedger = input.enableMechanicsLedger;
      mechanics.enabled = input.enableMechanicsLedger;
    }

    this.store.saveBundle(project, undefined, mechanics);
    return this.mustLoad(projectId).project;
  }

  async getCopilotContextPacket(
    projectId: string,
    chapterNo: number,
    mode: 'ideate' | 'draft' | 'summarize' = 'ideate',
  ): Promise<ChapterCopilotContextPacket> {
    const bundle = this.mustLoad(projectId);
    const canonAtStart = this.loadCanonAtChapterStart(bundle, chapterNo);
    const mechanicsAtStart = this.loadMechanicsAtChapterStart(bundle, chapterNo);
    return buildCopilotContextPacket({
      project: bundle.project,
      canonAtStart,
      mechanicsAtStart,
      chapterNo,
      mode,
      corpus: this.corpus,
      embedder: this.embedRegistry.resolveActiveEmbedder(),
    });
  }

  async requestChapterDirections(
    projectId: string,
    chapterNo: number,
    options: {
      authorSeedHint?: string;
      backtrackMode?: BacktrackMode;
      wakeCat?: boolean;
    } = {},
  ): Promise<{
    project: NovelProject;
    chapterRecord: ChapterStateRecord;
    contextPacket: ChapterCopilotContextPacket;
  }> {
    if (chapterNo < 1) throw new Error('chapterNo must be >= 1');
    const bundle = this.mustLoad(projectId);
    this.applyBacktrackPreparation(bundle, chapterNo, options.backtrackMode);

    const record = this.ensureChapterRecord(bundle.project, chapterNo);
    if (options.authorSeedHint !== undefined) {
      record.authorSeedHint = options.authorSeedHint.trim();
    }
    record.stage = 'ideating';
    record.updatedAt = new Date().toISOString();
    bundle.project.currentChapterNo = chapterNo;

    const contextPacket = await buildCopilotContextPacket({
      project: bundle.project,
      canonAtStart: this.loadCanonAtChapterStart(bundle, chapterNo),
      mechanicsAtStart: this.loadMechanicsAtChapterStart(bundle, chapterNo),
      chapterNo,
      mode: 'ideate',
      corpus: this.corpus,
      embedder: this.embedRegistry.resolveActiveEmbedder(),
    });
    record.precheckConstraintsMarkdown = contextPacket.continuityConstraintsMarkdown;
    record.ragPassages = contextPacket.referenceStyle.ideationStructuralBeats;

    if (options.wakeCat !== false && this.threadCoordinator) {
      await this.dispatchCopilotPrompt(
        bundle.project,
        this.buildCopilotIdeationDispatchMessage(bundle.project, chapterNo, contextPacket),
      );
    }
    this.store.saveBundle(bundle.project, bundle.canon, bundle.mechanics);

    const refreshed = this.mustLoad(projectId).project;
    const updatedRec = this.ensureChapterRecord(refreshed, chapterNo);
    return { project: refreshed, chapterRecord: updatedRec, contextPacket };
  }

  saveChapterDirections(
    projectId: string,
    chapterNo: number,
    directionOptions: ChapterDirectionOption[],
  ): ChapterStateRecord {
    const bundle = this.mustLoad(projectId);
    const parsed = directionOptions.map((opt) => chapterDirectionOptionSchema.parse(opt));
    if (parsed.length === 0 || parsed.length > 5) {
      throw new Error('directionOptions must contain 1 to 5 options');
    }
    const record = this.ensureChapterRecord(bundle.project, chapterNo);
    record.directionOptions = parsed;
    record.stage = 'awaiting_choice';
    record.updatedAt = new Date().toISOString();
    this.store.saveBundle(bundle.project);
    return this.ensureChapterRecord(this.mustLoad(projectId).project, chapterNo);
  }

  async generateChapterFromChoice(
    projectId: string,
    chapterNo: number,
    input: {
      selectedOptionIds?: string[];
      customAuthorInput?: string;
      chapterPromptNotes?: string;
      backtrackMode?: BacktrackMode;
      wakeCat?: boolean;
    },
  ): Promise<{
    project: NovelProject;
    chapterRecord: ChapterStateRecord;
    contextPacket: ChapterCopilotContextPacket;
  }> {
    const selectedOptionIds = input.selectedOptionIds ?? [];
    const customAuthorInput = input.customAuthorInput?.trim() ?? '';
    const chapterPromptNotes = input.chapterPromptNotes?.trim() ?? '';

    if (selectedOptionIds.length === 0 && !customAuthorInput) {
      throw new Error('请至少勾选 1 个推进方向，或输入你自己的本章剧情想法。');
    }

    const bundle = this.mustLoad(projectId);
    const existing = bundle.project.chapters[String(chapterNo)];
    if (existing && isChapterCompletedStage(existing.stage)) {
      this.applyBacktrackPreparation(bundle, chapterNo, input.backtrackMode);
    }

    const record = this.ensureChapterRecord(bundle.project, chapterNo);
    record.selectedDirection = {
      selectedOptionIds,
      customAuthorInput,
      chapterPromptNotes,
      decidedAt: new Date().toISOString(),
    };
    record.stage = 'drafting';
    record.writerCatId = bundle.project.copilotCatId;
    record.updatedAt = new Date().toISOString();
    bundle.project.currentChapterNo = chapterNo;

    const contextPacket = await buildCopilotContextPacket({
      project: bundle.project,
      canonAtStart: this.loadCanonAtChapterStart(bundle, chapterNo),
      mechanicsAtStart: this.loadMechanicsAtChapterStart(bundle, chapterNo),
      chapterNo,
      mode: 'draft',
      corpus: this.corpus,
      embedder: this.embedRegistry.resolveActiveEmbedder(),
    });
    record.precheckConstraintsMarkdown = contextPacket.continuityConstraintsMarkdown;
    record.ragPassages = contextPacket.referenceStyle.proseCadenceSamples;

    if (input.wakeCat !== false && this.threadCoordinator) {
      await this.dispatchCopilotPrompt(
        bundle.project,
        this.buildCopilotDraftDispatchMessage(bundle.project, chapterNo, contextPacket),
      );
    }
    this.store.saveBundle(bundle.project, bundle.canon, bundle.mechanics);

    const refreshed = this.mustLoad(projectId).project;
    return {
      project: refreshed,
      chapterRecord: this.ensureChapterRecord(refreshed, chapterNo),
      contextPacket,
    };
  }

  saveManualChapterDraft(
    projectId: string,
    chapterNo: number,
    input: { title?: string; content: string; authorNotes?: string },
  ): FullNovelProjectBundle {
    const bundle = this.mustLoad(projectId);
    const record = this.ensureChapterRecord(bundle.project, chapterNo);
    const text = input.content;

    if (input.title !== undefined) {
      record.title = input.title.trim();
    }
    if (!record.rawDraft) {
      record.rawDraft = text;
    }
    record.humanizedDraft = text;
    record.finalText = text;
    if (input.authorNotes !== undefined) {
      record.authorNotes = input.authorNotes;
    }
    if (!isChapterCompletedStage(record.stage) && text.trim().length > 0) {
      record.stage = 'draft_ready';
    }
    record.updatedAt = new Date().toISOString();

    this.store.saveBundle(bundle.project);
    return this.mustLoad(projectId);
  }

  async finalizeAndSummarizeChapter(params: {
    projectId: string;
    chapterNo: number;
    title?: string;
    finalTextOverride?: string;
    stateDeltaOverride?: ChapterStateDelta;
    authorNotes?: string;
    wakeCatForDeepSummary?: boolean;
  }): Promise<FullNovelProjectBundle> {
    const bundle = this.mustLoad(params.projectId);
    const { project } = bundle;
    const record = this.ensureChapterRecord(project, params.chapterNo);

    if (params.title?.trim()) {
      record.title = params.title.trim();
    }
    if (params.stateDeltaOverride) {
      record.proposedStateDelta = chapterStateDeltaSchema.parse(params.stateDeltaOverride);
    }
    if (params.authorNotes !== undefined) {
      record.authorNotes = params.authorNotes;
    }
    const resolvedText = (
      params.finalTextOverride?.trim() ||
      record.finalText.trim() ||
      record.humanizedDraft.trim() ||
      record.rawDraft.trim()
    ).trim();

    if (!resolvedText) {
      throw new Error(`第 ${params.chapterNo} 章正文为空，无法确认定稿。`);
    }
    record.finalText = resolvedText;
    if (!record.humanizedDraft.trim()) {
      record.humanizedDraft = resolvedText;
    }

    const canonBefore = this.loadCanonAtChapterStart(bundle, params.chapterNo);
    const baselineSummary = buildDeterministicChapterSummary({
      chapterNo: params.chapterNo,
      title: record.title || undefined,
      text: resolvedText,
      canonBefore,
    });
    record.title = baselineSummary.title;
    record.distilledSummary = baselineSummary;
    record.stage = 'completed';
    record.updatedAt = new Date().toISOString();

    this.replaySnapshotsAndSynopsesFrom(bundle, params.chapterNo);

    const maxCompleted = this.findMaxCompletedChapterNo(project);
    if (params.chapterNo >= maxCompleted) {
      project.currentChapterNo = params.chapterNo + 1;
    }

    if (params.wakeCatForDeepSummary && this.threadCoordinator) {
      await this.dispatchCopilotPrompt(
        project,
        this.buildCopilotSummarizeDispatchMessage(project, params.chapterNo, resolvedText),
      );
    }

    this.store.saveBundle(project, bundle.canon, bundle.mechanics);
    return this.mustLoad(params.projectId);
  }

  submitChapterSummary(params: {
    projectId: string;
    chapterNo: number;
    summary: Omit<DistilledChapterSummary, 'chapterNo' | 'wordCount' | 'summarizedAt'> &
      Partial<Pick<DistilledChapterSummary, 'wordCount' | 'summarizedAt'>>;
    stateDelta?: ChapterStateDelta;
    worldbuildingAdditions?: string[];
    rollingSynopsisMarkdown?: string;
  }): FullNovelProjectBundle {
    const bundle = this.mustLoad(params.projectId);
    const { project } = bundle;
    const record = this.ensureChapterRecord(project, params.chapterNo);
    const text = (record.finalText || record.humanizedDraft || record.rawDraft).trim();

    const parsedSummary = distilledChapterSummarySchema.parse({
      ...params.summary,
      chapterNo: params.chapterNo,
      wordCount: params.summary.wordCount ?? text.replace(/\s+/g, '').length,
      summarizedAt: params.summary.summarizedAt ?? new Date().toISOString(),
    });

    record.title = parsedSummary.title;
    record.distilledSummary = parsedSummary;
    if (params.stateDelta) {
      record.proposedStateDelta = chapterStateDeltaSchema.parse(params.stateDelta);
    }
    if (params.worldbuildingAdditions?.length) {
      const baseDelta = record.proposedStateDelta ?? chapterStateDeltaSchema.parse({});
      baseDelta.worldbuildingAdditions = [
        ...new Set([...baseDelta.worldbuildingAdditions, ...params.worldbuildingAdditions]),
      ];
      record.proposedStateDelta = baseDelta;
    }
    record.stage = 'completed';
    record.updatedAt = new Date().toISOString();

    this.replaySnapshotsAndSynopsesFrom(bundle, params.chapterNo, params.rollingSynopsisMarkdown);
    this.store.saveBundle(project, bundle.canon, bundle.mechanics);
    return this.mustLoad(params.projectId);
  }

  restoreChapterVersion(projectId: string, chapterNo: number, versionId: string): FullNovelProjectBundle {
    const bundle = this.mustLoad(projectId);
    const record = this.mustChapterRecord(bundle.project, chapterNo);
    const targetIdx = record.versionHistory.findIndex((v) => v.versionId === versionId);
    if (targetIdx < 0) {
      throw new Error(`Version ${versionId} not found in Chapter ${chapterNo}`);
    }
    const targetVersion = record.versionHistory[targetIdx];
    if (!targetVersion) {
      throw new Error(`Version ${versionId} invalid`);
    }

    this.archiveRecordIntoHistory(record, `切换回历史版本 ${versionId} 前自动留存`);
    record.title = targetVersion.title;
    record.rawDraft = targetVersion.content;
    record.humanizedDraft = targetVersion.content;
    record.finalText = targetVersion.content;
    record.selectedDirection = targetVersion.directionUsed;
    record.distilledSummary =
      targetVersion.summary ??
      buildDeterministicChapterSummary({
        chapterNo,
        title: targetVersion.title || undefined,
        text: targetVersion.content,
        canonBefore: this.loadCanonAtChapterStart(bundle, chapterNo),
      });
    record.proposedStateDelta = targetVersion.stateDelta;
    record.stage = 'completed';
    record.updatedAt = new Date().toISOString();

    this.replaySnapshotsAndSynopsesFrom(bundle, chapterNo);
    this.store.saveBundle(bundle.project, bundle.canon, bundle.mechanics);
    return this.mustLoad(projectId);
  }

  private submitCopilotDraftInternal(
    bundle: FullNovelProjectBundle,
    params: {
      projectId: string;
      chapterNo: number;
      authorCatId: string;
      title?: string;
      content: string;
      proposedStateDelta?: ChapterStateDelta;
    },
  ): { record: ChapterStateRecord; aiFlavorScore: number; flagCount: number } {
    const { project } = bundle;
    const record = this.ensureChapterRecord(project, params.chapterNo);
    const wasPaused = record.stage === 'paused';
    const rawTrimmed = params.content.trim();
    const cleaned = project.workflow.enableHumanizer ? lightPolishAiCliches(rawTrimmed) : rawTrimmed;
    const parsedDelta = params.proposedStateDelta
      ? chapterStateDeltaSchema.parse(params.proposedStateDelta)
      : record.proposedStateDelta;

    const canonBefore = this.loadCanonAtChapterStart(bundle, params.chapterNo);
    const mechanicsBefore = this.loadMechanicsAtChapterStart(bundle, params.chapterNo);
    const violations = verifyDraftContinuity({
      draftText: cleaned,
      graph: canonBefore,
      mechanics: mechanicsBefore,
      proposedDelta: parsedDelta,
    });
    const flavor = analyzeChineseAiFlavor(cleaned);

    if (params.title?.trim()) {
      record.title = params.title.trim();
    }
    record.rawDraft = rawTrimmed;
    record.humanizedDraft = cleaned;
    record.finalText = cleaned;
    record.writerCatId = params.authorCatId;
    record.proposedStateDelta = parsedDelta;
    record.precheckWarnings = violations;
    record.stage = wasPaused ? 'paused' : 'draft_ready';
    record.updatedAt = new Date().toISOString();

    this.store.saveBundle(project);
    return {
      record,
      aiFlavorScore: flavor.aiFlavorScore,
      flagCount: flavor.flags.length,
    };
  }

  private ensureChapterRecord(project: NovelProject, chapterNo: number): ChapterStateRecord {
    const existing = project.chapters[String(chapterNo)];
    if (existing) return existing;
    const created: ChapterStateRecord = {
      chapterNo,
      title: '',
      stage: 'idle',
      rewriteRound: 0,
      authorSeedHint: '',
      directionOptions: [],
      versionHistory: [],
      activeSkillSlugs: [],
      precheckConstraintsMarkdown: '',
      precheckWarnings: [],
      ragPassages: [],
      specialistNotes: '',
      rawDraft: '',
      humanizedDraft: '',
      finalText: '',
      qualityHistory: [],
      authorNotes: '',
      updatedAt: new Date().toISOString(),
    };
    project.chapters[String(chapterNo)] = created;
    return created;
  }

  private archiveRecordIntoHistory(record: ChapterStateRecord, reason: string): void {
    const content = (record.finalText || record.humanizedDraft || record.rawDraft).trim();
    if (!content) return;
    const latest = record.versionHistory[record.versionHistory.length - 1];
    if (latest && latest.content === content && latest.title === record.title) return;

    const snap: ChapterVersionSnapshot = {
      versionId: `v${record.versionHistory.length + 1}-${nanoid(4).toLowerCase()}`,
      createdAt: new Date().toISOString(),
      reason,
      title: record.title || record.distilledSummary?.title || '',
      content,
      directionUsed: record.selectedDirection,
      summary: record.distilledSummary,
      stateDelta: record.proposedStateDelta,
    };
    record.versionHistory = [...record.versionHistory.slice(-29), snap];
  }

  private applyBacktrackPreparation(
    bundle: FullNovelProjectBundle,
    chapterNo: number,
    explicitMode?: BacktrackMode,
  ): void {
    const { project, mechanics } = bundle;
    const current = project.chapters[String(chapterNo)];
    const hasLaterContent = Object.values(project.chapters).some(
      (ch) => ch.chapterNo > chapterNo && (ch.finalText || ch.humanizedDraft || ch.rawDraft).trim().length > 0,
    );
    const mode: BacktrackMode = explicitMode ?? 'in_place_bridge';

    if (mode === 'rewind_truncate' && (hasLaterContent || (current && isChapterCompletedStage(current.stage)))) {
      const archivedChapters = Object.values(project.chapters)
        .filter((ch) => ch.chapterNo >= chapterNo && (ch.finalText || ch.humanizedDraft || ch.rawDraft).trim())
        .sort((a, b) => a.chapterNo - b.chapterNo)
        .map((ch) => ({
          chapterNo: ch.chapterNo,
          title: ch.title || ch.distilledSummary?.title || '',
          finalText: (ch.finalText || ch.humanizedDraft || ch.rawDraft).trim(),
          summary: ch.distilledSummary,
        }));

      if (archivedChapters.length > 0) {
        const branch: ArchivedBranchRecord = {
          branchId: `branch-${nanoid(6).toLowerCase()}`,
          createdAt: new Date().toISOString(),
          rewindFromChapterNo: chapterNo,
          reason: `从第 ${chapterNo} 章回档重开新支线`,
          chapters: archivedChapters,
          previousRollingSynopsis: project.rollingSynopsisMarkdown,
        };
        project.archivedBranches = [...project.archivedBranches.slice(-29), branch];
      }

      if (current) {
        this.archiveRecordIntoHistory(current, `从第 ${chapterNo} 章回档重开前留存`);
        current.backtrackMode = 'rewind_truncate';
        current.finalText = '';
        current.humanizedDraft = '';
        current.rawDraft = '';
        current.distilledSummary = undefined;
        current.continuityAlert = undefined;
      }

      for (const key of Object.keys(project.chapters)) {
        if (Number(key) > chapterNo) delete project.chapters[key];
      }
      for (const key of Object.keys(mechanics.chapterSnapshots)) {
        if (Number(key) >= chapterNo) delete mechanics.chapterSnapshots[key];
      }
      this.store.deleteCanonSnapshotsAfter(project.id, chapterNo - 1);

      bundle.canon = this.loadCanonAtChapterStart(bundle, chapterNo);
      bundle.mechanics = this.loadMechanicsAtChapterStart(bundle, chapterNo);
      project.continuityAlerts = project.continuityAlerts.filter((a) => a.toChapterNo < chapterNo);
      project.rollingSynopsisMarkdown = rebuildRollingSynopsisMarkdown(project);
      return;
    }

    if (current) {
      this.archiveRecordIntoHistory(current, '回溯重新生成本章前自动留档');
      current.backtrackMode = hasLaterContent ? 'in_place_bridge' : undefined;
    }
  }

  private loadCanonAtChapterStart(bundle: FullNovelProjectBundle, chapterNo: number): NarrativeGraph {
    for (let target = chapterNo - 1; target >= 0; target--) {
      const snap = this.store.loadCanonSnapshot(bundle.project.id, target);
      if (snap) return snap;
    }
    return {
      characters: [],
      locations: [],
      facts: [],
      foreshadowings: [],
      revision: 1,
      updatedAt: new Date().toISOString(),
    };
  }

  private loadMechanicsAtChapterStart(bundle: FullNovelProjectBundle, chapterNo: number): MechanicsLedger {
    const cloned = structuredClone(bundle.mechanics);
    for (let target = chapterNo - 1; target >= 0; target--) {
      const snap = bundle.mechanics.chapterSnapshots[String(target)];
      if (snap) {
        cloned.entities = structuredClone(snap);
        return cloned;
      }
    }
    if (chapterNo === 1) return cloned;
    cloned.entities = [];
    return cloned;
  }

  private findMaxCompletedChapterNo(project: NovelProject): number {
    let maxNo = 0;
    for (const ch of Object.values(project.chapters)) {
      if (isChapterCompletedStage(ch.stage) && ch.chapterNo > maxNo) {
        maxNo = ch.chapterNo;
      }
    }
    return maxNo;
  }

  private replaySnapshotsAndSynopsesFrom(
    bundle: FullNovelProjectBundle,
    fromChapterNo: number,
    rollingSynopsisOverride?: string,
  ): void {
    const { project } = bundle;
    let runningGraph = this.loadCanonAtChapterStart(bundle, fromChapterNo);
    let runningMechanics = this.loadMechanicsAtChapterStart(bundle, fromChapterNo);

    const sortedCompleted = Object.values(project.chapters)
      .filter((ch) => ch.chapterNo >= fromChapterNo && isChapterCompletedStage(ch.stage))
      .sort((a, b) => a.chapterNo - b.chapterNo);

    for (const ch of sortedCompleted) {
      const applied = applyCommittedChapterDelta({
        chapterNo: ch.chapterNo,
        graph: runningGraph,
        mechanics: runningMechanics,
        delta: ch.proposedStateDelta,
      });
      runningGraph = applied.nextGraph;
      runningMechanics = applied.nextMechanics;
      this.store.saveCanonSnapshot(project.id, ch.chapterNo, runningGraph);

      const wbAdditions = [
        ...(ch.distilledSummary?.newlyIntroducedSettings ?? []),
        ...(ch.proposedStateDelta?.worldbuildingAdditions ?? []),
      ];
      project.accumulatedWorldbuildingMarkdown = mergeWorldbuildingMarkdown(
        project.accumulatedWorldbuildingMarkdown,
        ch.chapterNo,
        wbAdditions,
      );
    }

    bundle.canon = runningGraph;
    bundle.mechanics = runningMechanics;
    project.rollingSynopsisMarkdown = rollingSynopsisOverride?.trim() || rebuildRollingSynopsisMarkdown(project);

    const alerts: ContinuityBridgeAlert[] = [];
    const allChapters = Object.values(project.chapters).sort((a, b) => a.chapterNo - b.chapterNo);
    for (const ch of allChapters) {
      ch.continuityAlert = undefined;
    }
    for (const ch of allChapters) {
      if (!isChapterCompletedStage(ch.stage)) continue;
      const nextCh = project.chapters[String(ch.chapterNo + 1)];
      const snapAfterCh = this.store.loadCanonSnapshot(project.id, ch.chapterNo) ?? runningGraph;
      const alert = detectDownstreamContinuityAlert({
        chapterK: ch,
        chapterKPlus1: nextCh,
        canonAfterK: snapAfterCh,
        wasInPlaceRewrite: ch.chapterNo === fromChapterNo && ch.backtrackMode === 'in_place_bridge',
      });
      if (alert) {
        alerts.push(alert);
        if (nextCh) nextCh.continuityAlert = alert;
      }
    }
    project.continuityAlerts = alerts;
  }

  private async dispatchCopilotPrompt(project: NovelProject, markdown: string): Promise<void> {
    if (!this.threadCoordinator) return;
    const targetCatId = project.copilotCatId || project.catRoster.writerCatId || 'kimi';
    const threadId = await this.threadCoordinator.ensureEditorialThread({
      existingThreadId: project.threadId,
      title: `📖《${project.title}》小说共创室`,
      catIds: [targetCatId],
    });
    if (!threadId) return;
    project.threadId = threadId;
    await this.threadCoordinator.dispatchToCat({
      threadId,
      targetCatId,
      markdown,
    });
  }

  private buildCopilotIdeationDispatchMessage(
    project: NovelProject,
    chapterNo: number,
    packet: ChapterCopilotContextPacket,
  ): string {
    const catId = project.copilotCatId || 'kimi';
    const lines = [
      `@${catId} **【逐章共创 Step 1 · 请为《${project.title}》第 ${chapterNo} 章提出 5 个差异化推进方向与启发提问】**`,
      `- **项目 ID**：\`${project.id}\` | **章节号**：\`${chapterNo}\``,
      `- **作者主线大纲**：\n${packet.authorMasterOutlineMarkdown || '（作者尚未填写固定总纲，请结合前文自然延展）'}`,
      packet.authorSeedHint ? `- **作者本章初步念头**：${packet.authorSeedHint}` : '',
      packet.previousChapterEndingAnchor ? `- **紧接上章落点**：${packet.previousChapterEndingAnchor}` : '',
      packet.downstreamBridge ? `\n${packet.downstreamBridge.bridgeInstructionMarkdown}\n` : '',
      packet.referenceStyle.ideationStructuralBeats.length > 0
        ? `- **参照小说脱敏冲突节拍参考（仅借结构张力，严禁搬运原书名词）**：已检索 ${packet.referenceStyle.ideationStructuralBeats.length} 组节拍`
        : '',
      '',
      `请加载 \`novel-chapter-copilot\` 技能：`,
      `1. 先调用 \`novel_read_project_context(projectId="${project.id}", chapterNo=${chapterNo})\` 完整阅读上文总结链、上章结尾原文切片与快照硬约束；`,
      `2. 构思 **恰好 5 个截然不同的本章剧情推进方向**（覆盖正面冲突、悬念反转、人物关系博弈、关键设定揭示、蓄势伏笔等不同切口），每个方向都附带 1 句向作者发问的抉择问题（\`guidingQuestion\`）；`,
      `3. 调用 \`novel_submit_chapter_directions(projectId="${project.id}", chapterNo=${chapterNo}, options=[...5项])\` 提交供作者拍板！`,
    ];
    return lines.filter(Boolean).join('\n');
  }

  private buildCopilotDraftDispatchMessage(
    project: NovelProject,
    chapterNo: number,
    packet: ChapterCopilotContextPacket,
  ): string {
    const catId = project.copilotCatId || 'kimi';
    const chosenTitles = packet.selectedOptionCards.map((c) => `【${c.title}】${c.pitch}`).join('\n  - ');
    const customInput = packet.selectedDirection?.customAuthorInput || '';
    const extraNotes = packet.selectedDirection?.chapterPromptNotes || '';
    const lines = [
      `@${catId} **【逐章共创 Step 2 · 请按作者选定思路撰写《${project.title}》第 ${chapterNo} 章正文】**`,
      `- **项目 ID**：\`${project.id}\` | **章节号**：\`${chapterNo}\` | **目标字数**：约 ${packet.referenceStyle.targetWords} 字`,
      chosenTitles ? `- **作者勾选的推进方向**：\n  - ${chosenTitles}` : '',
      customInput ? `- **作者手写本章走向/回答**：${customInput}` : '',
      extraNotes ? `- **本章附加细节要求**：${extraNotes}` : '',
      packet.downstreamBridge ? `\n${packet.downstreamBridge.bridgeInstructionMarkdown}\n` : '',
      `\n${packet.referenceStyle.styleInstructionMarkdown}`,
      '',
      `请加载 \`novel-chapter-copilot\` 技能：`,
      `1. 调用 \`novel_read_project_context(projectId="${project.id}", chapterNo=${chapterNo})\` 核对第 ${chapterNo - 1} 章末尾原文切片与 \`Snapshot #${chapterNo - 1}\` 连续性硬约束（确保第一段无缝衔接上章结尾，若存在下章桥接约束则章末自然收束至第 ${chapterNo + 1} 章开场）；`,
      `2. 严格模拟选定参照小说的句法节奏与五感质感（严禁出现 AI 五官套话与总结腔），完成正文后调用 \`novel_submit_chapter_draft(projectId="${project.id}", chapterNo=${chapterNo}, draftKind="copilot", title="...", content="...")\` 提交！`,
    ];
    return lines.filter(Boolean).join('\n');
  }

  private buildCopilotSummarizeDispatchMessage(project: NovelProject, chapterNo: number, finalText: string): string {
    const catId = project.copilotCatId || 'kimi';
    return [
      `@${catId} **【逐章共创 Step 3 · 反向总结《${project.title}》第 ${chapterNo} 章大纲与活体设定增量】**`,
      `- **项目 ID**：\`${project.id}\` | **章节号**：\`${chapterNo}\` | **定稿字数**：${finalText.length} 字`,
      '',
      `作者已确认定稿第 ${chapterNo} 章正文。请加载 \`novel-chapter-copilot\` 技能：`,
      `1. 调用 \`novel_read_project_context(projectId="${project.id}", chapterNo=${chapterNo})\` 精读本章最终定稿正文 \`finalText\`；`,
      `2. **100% 忠于定稿正文实际发生的内容**（含作者手改细节，严禁脑补），提炼总结式章纲（一句话梗概、关键事件链、人物变化、新登场设定词条、开篇与章末衔接锚点）及结构化 \`stateDelta\`（新角色/新地点/状态伤势/持有物/新埋或已回收伏笔）；`,
      `3. 调用 \`novel_submit_chapter_summary\` 正式沉淀入库！`,
    ].join('\n');
  }

  private buildChiefEditorDispatchMessage(
    project: NovelProject,
    outline: ChapterOutline,
    skillSlugs: string[],
    ragCount: number,
    needsSpecialist: boolean,
  ): string {
    return [
      `@${project.catRoster.chiefEditorCatId} **【总编派单 · 第 ${outline.chapterNo} 章《${outline.title}》启动】**`,
      `- **项目 ID**：\`${project.id}\` | **推进模式**：\`${project.workflow.approvalMode === 'auto-continuous' ? `全自动连写（剩余 ${project.workflow.autoRemainingChapters} 章）` : '逐章人工拍板'}\``,
      `- **本章目标**：${outline.goal}`,
      `- **核心冲突**：${outline.conflict}`,
      `- **章末钩子**：${outline.hook}`,
      `- **动态挂载技法包**：${skillSlugs.length > 0 ? skillSlugs.map((s) => `\`${s}\``).join('、') : '默认基础规范'}（已实时召回 ${ragCount} 段参考节拍骨架）`,
      '',
      `请按 \`novel-chief-coordinator\` 技能统筹推进：`,
      needsSpecialist && project.catRoster.specialistCatId
        ? `1. 本章含重头动作/氛围场次，可先 \`@${project.catRoster.specialistCatId}\` 输出精简分镜建议并写入专精笔记，随后交棒主笔 \`@${project.catRoster.writerCatId}\` 成稿；`
        : `1. 请核阅 \`novel_read_project_context\` 与章前硬约束后，直接 \`@${project.catRoster.writerCatId}\` 按挂载的技法包完成本章正文并调用 \`novel_submit_chapter_draft\`；`,
      `2. 初稿提交后将由异构审校猫 \`@${project.catRoster.criticCatId}\` 执行独立五轴评审与防穿帮门禁。`,
    ].join('\n');
  }

  private mustLoad(projectId: string): FullNovelProjectBundle {
    const bundle = this.store.loadBundle(projectId);
    if (!bundle) throw new Error(`Novel project not found: ${projectId}`);
    return bundle;
  }

  private mustChapterRecord(project: NovelProject, chapterNo: number): ChapterStateRecord {
    const rec = project.chapters[String(chapterNo)];
    if (!rec) {
      throw new Error(`Chapter ${chapterNo} state not initialized; run precheck/start chapter first`);
    }
    return rec;
  }
}
