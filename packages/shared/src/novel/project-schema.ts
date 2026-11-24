import { z } from 'zod';
import { chapterQualityReportSchema, chapterStateDeltaSchema, invariantViolationSchema } from './canon-and-quality.js';
import { novelCraftDimensionSchema } from './craft-dimensions.js';

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
  'planned',
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
  stage: chapterStageSchema.default('planned'),
  rewriteRound: z.number().int().min(0).default(0),
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
