import {
  chapterOutlineSchema,
  chapterStateDeltaSchema,
  distilledCraftSkillSchema,
  invariantViolationSchema,
  novelCraftDimensionSchema,
  pacing5AxisScoreSchema,
  prose5AxisScoreSchema,
  storyArcSchema,
} from '@cat-cafe/shared';
import { z } from 'zod';
import { defineMcpCanonicalFactory } from '../tool-governance-migration.js';
import { callbackPost } from './callback-tools.js';

const defineTool = defineMcpCanonicalFactory('novel-studio-tools.ts', undefined, {
  resourceFamily: 'novel-studio',
  authority: 'callback-thread',
});

const novelAdmissionReason = {
  disposition: 'accepted-boundary' as const,
  kind: 'resource-entry' as const,
  admissionRef: 'file:packages/shared/src/novel/project-schema.ts' as const,
};

export const novelDissectReferenceInputSchema = {
  action: z
    .enum(['list_books', 'sample_dimension', 'save_distilled_skill'])
    .describe(
      'list_books lists ingested reference novels; sample_dimension fetches top chapters/passages for one craft dimension; save_distilled_skill persists a Book-to-Skill package.',
    ),
  bookId: z.string().min(1).max(80).optional().describe('Target reference book ID (required for sample_dimension).'),
  dimension: novelCraftDimensionSchema
    .optional()
    .describe(
      'Craft dimension to sample or distill (plot_arc, battle_action, character_persona, scene_atmosphere, world_mechanics, prose_style).',
    ),
  topK: z.number().int().min(1).max(16).default(8).describe('Number of representative scene chunks to sample.'),
  skillSpec: distilledCraftSkillSchema
    .optional()
    .describe('Complete structured Book-to-Skill spec when action="save_distilled_skill".'),
};

export function handleNovelDissectReference(input: z.infer<z.ZodObject<typeof novelDissectReferenceInputSchema>>) {
  return callbackPost('/api/callbacks/novel-studio/dissect-reference', input);
}

export const novelSearchReferenceBeatsInputSchema = {
  query: z
    .string()
    .min(2)
    .max(500)
    .describe('Scene situation, emotional conflict, or choreography query to search in reference novels.'),
  dimension: novelCraftDimensionSchema.default('plot_arc').describe('Target craft dimension to prioritize.'),
  bookIds: z
    .array(z.string().min(1).max(80))
    .max(8)
    .optional()
    .describe('Optional reference book IDs to restrict RAG search (e.g., only Book B for battle scenes).'),
  mode: z
    .enum(['structural_beats', 'raw_excerpt'])
    .default('structural_beats')
    .describe(
      'structural_beats returns de-identified beat & cadence skeletons to prevent plagiarism; raw_excerpt returns original text.',
    ),
  topK: z.number().int().min(1).max(12).default(4).describe('Maximum passages to return.'),
};

export function handleNovelSearchReferenceBeats(
  input: z.infer<z.ZodObject<typeof novelSearchReferenceBeatsInputSchema>>,
) {
  return callbackPost('/api/callbacks/novel-studio/search-beats', input);
}

export const novelReadProjectContextInputSchema = {
  projectId: z
    .string()
    .min(1)
    .max(80)
    .optional()
    .describe('Novel project ID; omit to list available projects or resolve current thread project.'),
  chapterNo: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe(
      'Optional chapter number to fetch its full ChapterWorkPacket (active skills, RAG beats, constraints, draft).',
    ),
};

export function handleNovelReadProjectContext(input: z.infer<z.ZodObject<typeof novelReadProjectContextInputSchema>>) {
  return callbackPost('/api/callbacks/novel-studio/read-context', input);
}

export const novelSaveOutlineArtifactsInputSchema = {
  projectId: z.string().min(1).max(80).describe('Target novel project ID.'),
  worldBlueprintMarkdown: z
    .string()
    .max(50_000)
    .optional()
    .describe('Updated worldview & overarching blueprint markdown.'),
  storyArcs: z.array(storyArcSchema).max(30).optional().describe('Volume story-arcs list (harnessNovel stage arcs).'),
  chapterOutlines: z
    .array(chapterOutlineSchema)
    .max(50)
    .optional()
    .describe('Granular chapter-outlines with per-beat craft dimensions, goals, conflicts, and hooks.'),
};

export function handleNovelSaveOutlineArtifacts(
  input: z.infer<z.ZodObject<typeof novelSaveOutlineArtifactsInputSchema>>,
) {
  return callbackPost('/api/callbacks/novel-studio/save-outlines', input);
}

export const novelPrecheckChapterInputSchema = {
  projectId: z.string().min(1).max(80).describe('Target novel project ID.'),
  chapterNo: z
    .number()
    .int()
    .min(1)
    .describe('Chapter number to run InvariantChecker precheck & assemble active craft skills + RAG beats.'),
  specialistNotes: z
    .string()
    .max(8000)
    .optional()
    .describe('Optional choreography / dialogue subtext notes contributed by a specialist cat before main drafting.'),
};

export function handleNovelPrecheckChapter(input: z.infer<z.ZodObject<typeof novelPrecheckChapterInputSchema>>) {
  return callbackPost('/api/callbacks/novel-studio/precheck-chapter', input);
}

export const novelSubmitChapterDraftInputSchema = {
  projectId: z.string().min(1).max(80).describe('Target novel project ID.'),
  chapterNo: z.number().int().min(1).describe('Chapter number.'),
  draftKind: z
    .enum(['raw', 'humanized'])
    .default('raw')
    .describe(
      'raw for initial/rewritten manuscript awaiting cross-cat review; humanized for post-review de-AI-ified prose.',
    ),
  content: z.string().min(100).max(60_000).describe('Full chapter manuscript text in Chinese.'),
  proposedStateDelta: chapterStateDeltaSchema
    .optional()
    .describe('Structured world/character/inventory/foreshadowing/mechanics changes introduced in this chapter.'),
};

export function handleNovelSubmitChapterDraft(input: z.infer<z.ZodObject<typeof novelSubmitChapterDraftInputSchema>>) {
  return callbackPost('/api/callbacks/novel-studio/submit-draft', input);
}

export const novelEvaluateChapterInputSchema = {
  projectId: z.string().min(1).max(80).describe('Target novel project ID.'),
  chapterNo: z.number().int().min(1).describe('Chapter number under review.'),
  proseScores: prose5AxisScoreSchema
    .omit({ overall: true })
    .extend({ overall: z.number().min(0).max(1).optional() })
    .describe(
      'LibriScribe 5-axis prose quality scores (showDontTell, characterVoice, craftSkillFidelity, cadenceAndVariety, goalAndHook) + rewriteDirectives.',
    ),
  pacingScores: pacing5AxisScoreSchema
    .omit({ overall: true })
    .extend({ overall: z.number().min(0).max(1).optional() })
    .describe(
      'LibriScribe 5-axis arc pacing scores (tensionMomentum, infoDensity, emotionalOscillation, arcProgression, readerFatigueGuard) + pacingGuidance.',
    ),
  extraViolations: z
    .array(invariantViolationSchema)
    .max(20)
    .optional()
    .describe('Additional semantic continuity, OOC, or knowledge-leak violations spotted by the reviewer cat.'),
  summaryCritique: z
    .string()
    .min(10)
    .max(1200)
    .describe('Concise, actionable editorial verdict explaining approval or exact rewrite targets.'),
};

export function handleNovelEvaluateChapter(input: z.infer<z.ZodObject<typeof novelEvaluateChapterInputSchema>>) {
  return callbackPost('/api/callbacks/novel-studio/evaluate-chapter', input);
}

export const novelCommitChapterCanonInputSchema = {
  projectId: z.string().min(1).max(80).describe('Target novel project ID.'),
  chapterNo: z
    .number()
    .int()
    .min(1)
    .describe('Chapter number to finalize and commit to NarrativeGraph & MechanicsLedger.'),
  stateDeltaOverride: chapterStateDeltaSchema
    .optional()
    .describe('Optional final verified character/world/mechanics state delta to commit.'),
};

export function handleNovelCommitChapterCanon(input: z.infer<z.ZodObject<typeof novelCommitChapterCanonInputSchema>>) {
  return callbackPost('/api/callbacks/novel-studio/commit-chapter', input);
}

export const novelStudioTools = [
  defineTool({
    name: 'novel_dissect_reference',
    description:
      'Inspect ingested reference novels by craft dimension or compile a distilled Book-to-Skill craft package. ' +
      'Use when dissecting Reference Book A/B/C/D into frameworks, If-Then decision rules, anti-patterns, and StyleProfile. ' +
      'Not for searching live scene beats during chapter writing (use novel_search_reference_beats) or writing plot summaries. ' +
      'Output: book metadata, diversified high-density dimension passages, or a saved & mounted SKILL.md craft package.',
    inputSchema: novelDissectReferenceInputSchema,
    handler: handleNovelDissectReference,
    governance: {
      implementationExport: 'handleNovelDissectReference',
      action: 'update',
      risk: { level: 'write', openWorld: false },
      runtimeProfiles: ['full'],
      standaloneReason: novelAdmissionReason,
    },
  }),
  defineTool({
    name: 'novel_search_reference_beats',
    description:
      'Run hybrid sqlite-vec + FTS5 RAG search across reference novels filtered by craft dimension (plot, battle, persona, scene, mechanics). ' +
      'Use when outlining or drafting a specific scene to retrieve de-identified beat skeletons and sentence cadence patterns. ' +
      'Not for copying verbatim prose or managing project outlines. ' +
      'Output: ranked RetrievedBeatPassage items with structural beat skeletons or excerpts.',
    inputSchema: novelSearchReferenceBeatsInputSchema,
    handler: handleNovelSearchReferenceBeats,
    governance: {
      implementationExport: 'handleNovelSearchReferenceBeats',
      action: 'derive',
      risk: { level: 'read', openWorld: false },
      runtimeProfiles: ['full', 'readonly'],
      standaloneReason: novelAdmissionReason,
    },
  }),
  defineTool({
    name: 'novel_read_project_context',
    description:
      'Read a novel project blueprint, dimension skill matrix, NarrativeGraph canon, MechanicsLedger, or a specific chapter work packet. ' +
      'Use before planning, coordinating, drafting, or reviewing a novel chapter. ' +
      'Not for mutating outlines or submitting chapter text. ' +
      'Output: structured project state and chapter work packet with mounted Book-to-Skill packages.',
    inputSchema: novelReadProjectContextInputSchema,
    handler: handleNovelReadProjectContext,
    governance: {
      implementationExport: 'handleNovelReadProjectContext',
      action: 'derive',
      risk: { level: 'read', openWorld: false },
      runtimeProfiles: ['full', 'readonly'],
      standaloneReason: novelAdmissionReason,
    },
  }),
  defineTool({
    name: 'novel_save_outline_artifacts',
    description:
      'Save or update a novel project worldview blueprint, volume story-arcs, or granular chapter-outlines. ' +
      'Use when the Architect or Chief Editor cat creates or revises multi-tier story structure. ' +
      'Not for submitting chapter prose drafts (use novel_submit_chapter_draft). ' +
      'Output: updated NovelProject revision with persisted outline artifacts.',
    inputSchema: novelSaveOutlineArtifactsInputSchema,
    handler: handleNovelSaveOutlineArtifacts,
    governance: {
      implementationExport: 'handleNovelSaveOutlineArtifacts',
      action: 'update',
      risk: { level: 'write', openWorld: false },
      runtimeProfiles: ['full'],
      standaloneReason: novelAdmissionReason,
    },
  }),
  defineTool({
    name: 'novel_precheck_chapter',
    description:
      'Run pre-chapter InvariantChecker validation, resolve active A/B/C/D craft skills and RAG passages, or attach specialist choreography notes. ' +
      'Use when Chief Editor starts a chapter or a Battle/Scene Specialist contributes beat notes before drafting. ' +
      'Not for post-draft quality scoring (use novel_evaluate_chapter). ' +
      'Output: ChapterWorkPacket with hard NARRATIVE & MECHANICS CONSTRAINTS and mounted craft skills.',
    inputSchema: novelPrecheckChapterInputSchema,
    handler: handleNovelPrecheckChapter,
    governance: {
      implementationExport: 'handleNovelPrecheckChapter',
      action: 'update',
      risk: { level: 'write', openWorld: false },
      runtimeProfiles: ['full'],
      standaloneReason: novelAdmissionReason,
    },
  }),
  defineTool({
    name: 'novel_submit_chapter_draft',
    description:
      'Submit a raw chapter draft (for cross-cat review) or a post-review humanized manuscript (de-AI-ified prose) along with proposed world state deltas. ' +
      'Use when the Lead Writer or Humanizer cat finishes writing or polishing a chapter. ' +
      'Not for outline updates or self-approving quality reviews. ' +
      'Output: updated ChapterStateRecord, Chinese AI-flavor diagnostic score, and automatic critic handoff.',
    inputSchema: novelSubmitChapterDraftInputSchema,
    handler: handleNovelSubmitChapterDraft,
    governance: {
      implementationExport: 'handleNovelSubmitChapterDraft',
      action: 'update',
      risk: { level: 'write', openWorld: false },
      runtimeProfiles: ['full'],
      standaloneReason: novelAdmissionReason,
    },
  }),
  defineTool({
    name: 'novel_evaluate_chapter',
    description:
      'Submit an independent cross-cat editorial evaluation with 5-axis prose scores, 5-axis pacing scores, and continuity checks. ' +
      'Use when the Critic Cat reviews a submitted chapter draft. ' +
      'Not for the chapter author cat (GOTCHA: server rejects self-review where reviewerCatId === writerCatId!). ' +
      'Output: ChapterQualityReport verdict (approved or rewrite_required) and automatic rewrite/humanizer routing.',
    inputSchema: novelEvaluateChapterInputSchema,
    handler: handleNovelEvaluateChapter,
    governance: {
      implementationExport: 'handleNovelEvaluateChapter',
      action: 'update',
      risk: { level: 'write', openWorld: false },
      runtimeProfiles: ['full'],
      standaloneReason: novelAdmissionReason,
    },
  }),
  defineTool({
    name: 'novel_commit_chapter_canon',
    description:
      'Atomically commit a finalized chapter state delta into NarrativeGraph & MechanicsLedger, save a rollback snapshot, and advance the chapter pointer. ' +
      'Use when Chief Editor finalizes an approved chapter in autonomous or gated workflows. ' +
      'Not for unreviewed raw drafts. ' +
      'Output: updated project canon revision and next-chapter readiness status.',
    inputSchema: novelCommitChapterCanonInputSchema,
    handler: handleNovelCommitChapterCanon,
    governance: {
      implementationExport: 'handleNovelCommitChapterCanon',
      action: 'update',
      risk: { level: 'write', openWorld: false },
      runtimeProfiles: ['full'],
      standaloneReason: novelAdmissionReason,
    },
  }),
];
