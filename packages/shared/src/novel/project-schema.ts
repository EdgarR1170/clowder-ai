import { z } from 'zod';
import {
  chapterQualityReportSchema,
  chapterStateDeltaSchema,
  continuityBridgeAlertSchema,
  humanizerReportSchema,
  invariantViolationSchema,
} from './canon-and-quality.js';
import { novelCraftDimensionSchema } from './craft-dimensions.js';

export const STUDIO_WIZARD_STEPS = [
  'library',
  'create',
  'references',
  'onboarding',
  'generate',
  'revise',
  'humanize',
  'final',
] as const;

export type StudioWizardStep = (typeof STUDIO_WIZARD_STEPS)[number];
export const studioWizardStepSchema = z.enum(STUDIO_WIZARD_STEPS);

export const settingDissectionCharacterSchema = z.object({
  name: z.string().min(1).max(80),
  role: z.enum(['protagonist', 'deuteragonist', 'antagonist', 'supporting', 'minor']).default('supporting'),
  traitsAndVoice: z.string().max(400).default(''),
  currentStatusAndGoal: z.string().max(400).default(''),
});

export type SettingDissectionCharacter = z.infer<typeof settingDissectionCharacterSchema>;

export const settingDissectionReportSchema = z.object({
  status: z.enum(['analyzing', 'ready']).default('ready'),
  worldAndRulesSummary: z.string().max(4000).default(''),
  coreConflictAndArc: z.string().max(2000).default(''),
  characters: z.array(settingDissectionCharacterSchema).max(30).default([]),
  plantedHooks: z.array(z.string().min(1).max(400)).max(20).default([]),
  authorNativeStyleNotes: z.string().max(2000).default(''),
  nextChapterBridgeAnchor: z.string().max(1000).default(''),
  analyzedByCats: z.array(z.string().min(1).max(80)).max(10).default([]),
  analyzedAt: z.string(),
});

export type SettingDissectionReport = z.infer<typeof settingDissectionReportSchema>;

export const chapterMacroDirectionSchema = z.object({
  optionId: z.string().min(1).max(40),
  title: z.string().min(1).max(120),
  summary: z.string().min(1).max(800),
  conflictHighlight: z.string().max(400).default(''),
  endingHook: z.string().max(400).default(''),
});

export type ChapterMacroDirection = z.infer<typeof chapterMacroDirectionSchema>;

export const detailedSceneBeatItemSchema = z.object({
  order: z.number().int().min(1).max(12),
  sceneSummary: z.string().min(1).max(500),
  craftDimension: novelCraftDimensionSchema.default('plot_arc'),
  detailFocus: z.string().max(300).default(''),
});

export type DetailedSceneBeatItem = z.infer<typeof detailedSceneBeatItemSchema>;

export const chapterDetailedOutlineOptionSchema = z.object({
  optionId: z.string().min(1).max(40),
  parentDirectionId: z.string().max(40).default(''),
  title: z.string().min(1).max(120),
  pacingNote: z.string().max(300).default(''),
  openingConnection: z.string().max(400).default(''),
  sceneBeats: z.array(detailedSceneBeatItemSchema).min(1).max(10),
  endingCliffhanger: z.string().max(400).default(''),
});

export type ChapterDetailedOutlineOption = z.infer<typeof chapterDetailedOutlineOptionSchema>;

export const chapterRevisionRoundSchema = z.object({
  round: z.number().int().min(1),
  userSuggestion: z.string().max(3000),
  previousContent: z.string(),
  revisedContent: z.string().default(''),
  catId: z.string().max(80).default(''),
  createdAt: z.string(),
});

export type ChapterRevisionRound = z.infer<typeof chapterRevisionRoundSchema>;

export const styleReferenceConfigSchema = z.object({
  referenceBookIds: z.array(z.string().min(1).max(80)).max(6).default([]),
  stylePreset: z.string().max(120).default('沉稳具象·强代入感'),
  customStyleGuidelines: z.string().max(2000).default(''),
  targetWords: z.number().int().min(500).max(15000).default(3200),
});

export type StyleReferenceConfig = z.infer<typeof styleReferenceConfigSchema>;

export const DIRECTION_FOCUS_TYPES = [
  'conflict_escalation',
  'suspense_twist',
  'character_bond',
  'world_revelation',
  'pacing_transition',
] as const;

export type DirectionFocusType = (typeof DIRECTION_FOCUS_TYPES)[number];
export const directionFocusTypeSchema = z.enum(DIRECTION_FOCUS_TYPES);

export const DIRECTION_FOCUS_LABELS: Readonly<Record<DirectionFocusType, string>> = {
  conflict_escalation: '正面冲突推进',
  suspense_twist: '悬念反客为主',
  character_bond: '人物博弈拉扯',
  world_revelation: '关键设定揭示',
  pacing_transition: '蓄势伏笔转折',
};

export const chapterDirectionOptionSchema = z.object({
  optionId: z.string().min(1).max(40),
  title: z.string().min(1).max(120),
  focusType: directionFocusTypeSchema.default('conflict_escalation'),
  pitch: z.string().min(1).max(800),
  openingBeat: z.string().max(400).default(''),
  endingHook: z.string().max(400).default(''),
  guidingQuestion: z.string().min(1).max(400),
});

export type ChapterDirectionOption = z.infer<typeof chapterDirectionOptionSchema>;

export const authorDirectionSelectionSchema = z.object({
  selectedOptionIds: z.array(z.string().min(1).max(40)).max(5).default([]),
  customAuthorInput: z.string().max(4000).default(''),
  chapterPromptNotes: z.string().max(2000).default(''),
  decidedAt: z.string(),
});

export type AuthorDirectionSelection = z.infer<typeof authorDirectionSelectionSchema>;

export const distilledChapterSummarySchema = z.object({
  chapterNo: z.number().int().min(1),
  title: z.string().min(1).max(120),
  oneLineSummary: z.string().min(1).max(500),
  keyEvents: z.array(z.string().min(1).max(300)).max(12).default([]),
  characterChanges: z.array(z.string().min(1).max(300)).max(12).default([]),
  newlyIntroducedSettings: z.array(z.string().min(1).max(300)).max(16).default([]),
  openingAnchor: z.string().max(500).default(''),
  endingAnchor: z.string().max(500).default(''),
  wordCount: z.number().int().min(0).default(0),
  summarizedAt: z.string(),
});

export type DistilledChapterSummary = z.infer<typeof distilledChapterSummarySchema>;

export const backtrackModeSchema = z.enum(['in_place_bridge', 'rewind_truncate']);
export type BacktrackMode = z.infer<typeof backtrackModeSchema>;

export const chapterVersionSnapshotSchema = z.object({
  versionId: z.string().min(1).max(60),
  createdAt: z.string(),
  reason: z.string().max(200).default('回溯重生成自动留档'),
  title: z.string().max(120).default(''),
  content: z.string(),
  directionUsed: authorDirectionSelectionSchema.optional(),
  summary: distilledChapterSummarySchema.optional(),
  stateDelta: chapterStateDeltaSchema.optional(),
});

export type ChapterVersionSnapshot = z.infer<typeof chapterVersionSnapshotSchema>;

export const archivedBranchChapterSchema = z.object({
  chapterNo: z.number().int().min(1),
  title: z.string().max(120).default(''),
  finalText: z.string().default(''),
  summary: distilledChapterSummarySchema.optional(),
});

export const archivedBranchRecordSchema = z.object({
  branchId: z.string().min(1).max(60),
  createdAt: z.string(),
  rewindFromChapterNo: z.number().int().min(1),
  reason: z.string().max(240).default('回档重开新支线'),
  chapters: z.array(archivedBranchChapterSchema).default([]),
  previousRollingSynopsis: z.string().default(''),
});

export type ArchivedBranchRecord = z.infer<typeof archivedBranchRecordSchema>;

export const dimensionSkillBindingSchema = z.object({
  dimension: novelCraftDimensionSchema,
  skillSlugs: z.array(z.string().min(1).max(80)).max(6).default([]),
  referenceBookIds: z.array(z.string().min(1).max(80)).max(6).default([]),
  ragWeight: z.number().min(0).max(1).default(0.7),
  ragMode: z.enum(['structural_beats', 'raw_excerpt']).default('structural_beats'),
});

export type DimensionSkillBinding = z.infer<typeof dimensionSkillBindingSchema>;

export const editorialCatRosterBindingSchema = z.object({
  chiefEditorCatId: z.string().min(1).max(80).default('opus'),
  architectCatId: z.string().min(1).max(80).default('opus'),
  writerCatId: z.string().min(1).max(80).default('kimi'),
  specialistCatId: z.string().max(80).default('gemini'),
  criticCatId: z.string().min(1).max(80).default('codex'),
});

export type EditorialCatRosterBinding = z.infer<typeof editorialCatRosterBindingSchema>;

export const novelWorkflowConfigSchema = z.object({
  approvalMode: z.enum(['chapter-gate', 'auto-continuous']).default('chapter-gate'),
  autoBatchSize: z.number().int().min(1).max(50).default(5),
  autoRemainingChapters: z.number().int().min(0).max(50).default(0),
  qualityThreshold: z.number().min(0.4).max(0.95).default(0.72),
  pacingThreshold: z.number().min(0.4).max(0.95).default(0.7),
  maxRewriteRounds: z.number().int().min(1).max(5).default(2),
  enableMechanicsLedger: z.boolean().default(false),
  enableHumanizer: z.boolean().default(true),
});

export type NovelWorkflowConfig = z.infer<typeof novelWorkflowConfigSchema>;

export const sceneBeatSpecSchema = z.object({
  beatIndex: z.number().int().min(1),
  summary: z.string().min(1).max(500),
  primaryDimension: novelCraftDimensionSchema,
  secondaryDimensions: z.array(novelCraftDimensionSchema).max(3).default([]),
  castIds: z.array(z.string().min(1).max(80)).max(12).default([]),
  locationId: z.string().max(80).default(''),
  ragQueryHint: z.string().max(240).default(''),
  targetWords: z.number().int().min(100).max(5000).default(800),
});

export type SceneBeatSpec = z.infer<typeof sceneBeatSpecSchema>;

export const chapterOutlineSchema = z.object({
  chapterNo: z.number().int().min(1),
  volumeNo: z.number().int().min(1).default(1),
  title: z.string().min(1).max(120),
  goal: z.string().min(1).max(500),
  conflict: z.string().min(1).max(500),
  outcome: z.string().min(1).max(500),
  hook: z.string().min(1).max(400),
  povCharacterId: z.string().max(80).default(''),
  targetWords: z.number().int().min(500).max(15000).default(3200),
  beats: z.array(sceneBeatSpecSchema).min(1).max(12),
  foreshadowingToPlant: z.array(z.string().max(240)).max(8).default([]),
  foreshadowingToPayoff: z.array(z.string().max(80)).max(8).default([]),
});

export type ChapterOutline = z.infer<typeof chapterOutlineSchema>;

export const storyArcSchema = z.object({
  arcId: z.string().min(1).max(80),
  volumeNo: z.number().int().min(1).default(1),
  title: z.string().min(1).max(120),
  startChapter: z.number().int().min(1),
  endChapter: z.number().int().min(1),
  coreConflict: z.string().min(1).max(600),
  climaxBeat: z.string().min(1).max(500),
  emotionalNodes: z.array(z.string().min(1).max(240)).max(12).default([]),
  tensionCurve: z.array(z.number().min(0).max(1)).max(20).default([]),
});

export type StoryArc = z.infer<typeof storyArcSchema>;

export const CHAPTER_STAGES = [
  'idle',
  'ideating_directions',
  'selecting_direction',
  'ideating_beats',
  'selecting_beats',
  'revising',
  'humanized_ready',
  'ideating',
  'awaiting_choice',
  'draft_ready',
  'summarizing',
  'completed',
  'planned',
  'paused',
  'prechecking',
  'drafting',
  'reviewing',
  'rewriting',
  'humanizing',
  'awaiting_approval',
  'committed',
] as const;

export type ChapterStage = (typeof CHAPTER_STAGES)[number];
export const chapterStageSchema = z.enum(CHAPTER_STAGES);

export function isChapterCompletedStage(stage: ChapterStage | undefined): boolean {
  return stage === 'completed' || stage === 'committed';
}

export const retrievedBeatPassageSchema = z.object({
  chunkId: z.string(),
  bookId: z.string(),
  bookTitle: z.string(),
  chapterTitle: z.string(),
  dimension: novelCraftDimensionSchema,
  score: z.number(),
  mode: z.enum(['structural_beats', 'raw_excerpt']),
  content: z.string(),
});

export type RetrievedBeatPassage = z.infer<typeof retrievedBeatPassageSchema>;

export const chapterStateRecordSchema = z.object({
  chapterNo: z.number().int().min(1),
  title: z.string().max(120).default(''),
  stage: chapterStageSchema.default('idle'),
  isSeedChapter: z.boolean().default(false),
  rewriteRound: z.number().int().min(0).default(0),
  authorSeedHint: z.string().max(2000).default(''),
  backtrackMode: backtrackModeSchema.optional(),
  macroDirections: z.array(chapterMacroDirectionSchema).max(5).default([]),
  selectedMacroDirectionId: z.string().max(40).default(''),
  macroFeedbackHint: z.string().max(2000).default(''),
  detailedOutlineOptions: z.array(chapterDetailedOutlineOptionSchema).max(5).default([]),
  selectedDetailedOutlineId: z.string().max(40).default(''),
  detailedFeedbackHint: z.string().max(2000).default(''),
  revisionHistory: z.array(chapterRevisionRoundSchema).max(30).default([]),
  humanizerReport: humanizerReportSchema.optional(),
  directionOptions: z.array(chapterDirectionOptionSchema).max(5).default([]),
  selectedDirection: authorDirectionSelectionSchema.optional(),
  distilledSummary: distilledChapterSummarySchema.optional(),
  versionHistory: z.array(chapterVersionSnapshotSchema).max(30).default([]),
  continuityAlert: continuityBridgeAlertSchema.optional(),
  activeSkillSlugs: z.array(z.string()).default([]),
  precheckConstraintsMarkdown: z.string().default(''),
  precheckWarnings: z.array(invariantViolationSchema).default([]),
  ragPassages: z.array(retrievedBeatPassageSchema).default([]),
  specialistNotes: z.string().default(''),
  rawDraft: z.string().default(''),
  humanizedDraft: z.string().default(''),
  finalText: z.string().default(''),
  qualityHistory: z.array(chapterQualityReportSchema).default([]),
  proposedStateDelta: chapterStateDeltaSchema.optional(),
  writerCatId: z.string().optional(),
  criticCatId: z.string().optional(),
  authorNotes: z.string().default(''),
  updatedAt: z.string(),
});

export type ChapterStateRecord = z.infer<typeof chapterStateRecordSchema>;

export const novelProjectSchema = z.object({
  id: z.string().min(1).max(80),
  slug: z
    .string()
    .min(2)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1).max(160),
  genre: z.string().max(80).default('玄幻/奇幻'),
  premise: z.string().max(2000).default(''),
  threadId: z.string().optional(),
  activeWizardStep: studioWizardStepSchema.default('references'),
  rawUserSettingsInput: z.string().default(''),
  rawOpeningChaptersInput: z.string().default(''),
  seedChapterCount: z.number().int().min(0).default(0),
  dissectionReport: settingDissectionReportSchema.optional(),
  authorMasterOutlineMarkdown: z.string().default(''),
  rollingSynopsisMarkdown: z.string().default(''),
  accumulatedWorldbuildingMarkdown: z.string().default(''),
  styleConfig: styleReferenceConfigSchema.default({}),
  copilotCatId: z.string().min(1).max(80).default('kimi'),
  archivedBranches: z.array(archivedBranchRecordSchema).max(30).default([]),
  continuityAlerts: z.array(continuityBridgeAlertSchema).max(50).default([]),
  worldBlueprintMarkdown: z.string().default(''),
  dimensionBindings: z.array(dimensionSkillBindingSchema).default([]),
  catRoster: editorialCatRosterBindingSchema.default({}),
  workflow: novelWorkflowConfigSchema.default({}),
  storyArcs: z.array(storyArcSchema).default([]),
  chapterOutlines: z.array(chapterOutlineSchema).default([]),
  chapters: z.record(chapterStateRecordSchema).default({}),
  currentChapterNo: z.number().int().min(1).default(1),
  revision: z.number().int().min(0).default(0),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type NovelProject = z.infer<typeof novelProjectSchema>;

export const referenceBookSummarySchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().min(1).max(200),
  author: z.string().max(120).default(''),
  fileFormat: z.enum(['txt', 'md', 'epub']),
  encoding: z.string().default('utf-8'),
  totalChars: z.number().int().min(0),
  chapterCount: z.number().int().min(0),
  chunkCount: z.number().int().min(0),
  embeddedChunkCount: z.number().int().min(0).default(0),
  embedStatus: z.enum(['fts_ready', 'embedding', 'vec_ready', 'embed_failed']).default('fts_ready'),
  embedModelId: z.string().default(''),
  dimensionAverages: z.record(novelCraftDimensionSchema, z.number()).default({}),
  rawStyleStats: z
    .object({
      avgSentenceLengthChars: z.number(),
      sentenceLengthStdDev: z.number(),
      dialogueRatio: z.number(),
      avgParagraphChars: z.number(),
      dominantPov: z.enum(['first_person', 'third_limited', 'third_omniscient', 'multi_pov']),
    })
    .optional(),
  createdAt: z.string(),
});

export type ReferenceBookSummary = z.infer<typeof referenceBookSummarySchema>;
