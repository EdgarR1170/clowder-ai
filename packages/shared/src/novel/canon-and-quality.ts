import { z } from 'zod';

export const characterStatusSchema = z.enum(['alive', 'injured', 'missing', 'sealed', 'dead']);
export type CharacterStatus = z.infer<typeof characterStatusSchema>;

export const characterRelationshipSchema = z.object({
  targetId: z.string().min(1).max(80),
  relation: z.string().min(1).max(120),
  attitude: z.string().max(200).default(''),
});

export const characterNodeSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(80),
  aliases: z.array(z.string().min(1).max(80)).max(12).default([]),
  role: z.enum(['protagonist', 'deuteragonist', 'antagonist', 'supporting', 'minor']).default('supporting'),
  status: characterStatusSchema.default('alive'),
  locationId: z.string().max(80).default('unknown'),
  injuriesOrDebuffs: z.array(z.string().min(1).max(200)).max(20).default([]),
  inventory: z.array(z.string().min(1).max(120)).max(50).default([]),
  powerTier: z.string().max(120).default(''),
  voiceTraits: z.string().max(400).default(''),
  motivation: z.string().max(400).default(''),
  /** Fact IDs known to this character; prevents omniscient perspective leaks! */
  knownFactIds: z.array(z.string().min(1).max(80)).max(200).default([]),
  relationships: z.array(characterRelationshipSchema).max(40).default([]),
  lastUpdatedChapter: z.number().int().min(0).default(0),
});

export type CharacterNode = z.infer<typeof characterNodeSchema>;

export const locationNodeSchema = z.object({
  id: z.string().min(1).max(80),
  name: z.string().min(1).max(120),
  status: z.enum(['intact', 'damaged', 'destroyed', 'sealed']).default('intact'),
  description: z.string().max(500).default(''),
  atmosphereTags: z.array(z.string().min(1).max(60)).max(16).default([]),
  connectedLocationIds: z.array(z.string().min(1).max(80)).max(20).default([]),
  lastUpdatedChapter: z.number().int().min(0).default(0),
});

export type LocationNode = z.infer<typeof locationNodeSchema>;

export const narrativeFactSchema = z.object({
  id: z.string().min(1).max(80),
  statement: z.string().min(1).max(500),
  isSecret: z.boolean().default(false),
  introducedChapter: z.number().int().min(0).default(0),
});

export type NarrativeFact = z.infer<typeof narrativeFactSchema>;

export const foreshadowingItemSchema = z.object({
  id: z.string().min(1).max(80),
  clue: z.string().min(1).max(400),
  plantedChapter: z.number().int().min(1),
  expectedPayoffWindow: z.string().max(120).default(''),
  status: z.enum(['planted', 'progressed', 'resolved', 'dropped']).default('planted'),
  resolvedChapter: z.number().int().min(1).optional(),
  notes: z.string().max(400).default(''),
});

export type ForeshadowingItem = z.infer<typeof foreshadowingItemSchema>;

export const narrativeGraphSchema = z.object({
  characters: z.array(characterNodeSchema).default([]),
  locations: z.array(locationNodeSchema).default([]),
  facts: z.array(narrativeFactSchema).default([]),
  foreshadowings: z.array(foreshadowingItemSchema).default([]),
  revision: z.number().int().min(0).default(0),
  updatedAt: z.string(),
});

export type NarrativeGraph = z.infer<typeof narrativeGraphSchema>;

/**
 * Pluggable Genre Mechanics Ledger (harnessNovel 机制层):
 * Tracks system panels, cultivation realms, currencies, cooldowns, and stat math per chapter.
 */
export const mechanicsResourceFieldSchema = z.object({
  key: z.string().min(1).max(64),
  label: z.string().min(1).max(80),
  kind: z.enum(['number', 'tier', 'text', 'list']).default('number'),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const mechanicsEntityStateSchema = z.object({
  entityId: z.string().min(1).max(80),
  entityName: z.string().min(1).max(80),
  stats: z.record(z.union([z.number(), z.string(), z.array(z.string())])).default({}),
  skillsAndCooldowns: z
    .array(
      z.object({
        name: z.string().min(1).max(100),
        levelOrRank: z.string().max(60).default(''),
        costRule: z.string().max(160).default(''),
        ready: z.boolean().default(true),
      }),
    )
    .default([]),
});

export const mechanicsLedgerSchema = z.object({
  enabled: z.boolean().default(false),
  systemName: z.string().max(120).default('核心力量/系统规则'),
  hardRules: z.array(z.string().min(1).max(300)).max(30).default([]),
  fields: z.array(mechanicsResourceFieldSchema).max(30).default([]),
  entities: z.array(mechanicsEntityStateSchema).default([]),
  /** Keyed by chapter number string ("0", "1", "2"...) for deterministic rollback */
  chapterSnapshots: z.record(z.array(mechanicsEntityStateSchema)).default({}),
  revision: z.number().int().min(0).default(0),
  updatedAt: z.string(),
});

export type MechanicsLedger = z.infer<typeof mechanicsLedgerSchema>;

export const chapterStateDeltaSchema = z.object({
  characterUpdates: z
    .array(
      z.object({
        characterId: z.string().min(1).max(80),
        status: characterStatusSchema.optional(),
        locationId: z.string().max(80).optional(),
        addInjuries: z.array(z.string()).optional(),
        healInjuries: z.array(z.string()).optional(),
        addInventory: z.array(z.string()).optional(),
        removeInventory: z.array(z.string()).optional(),
        powerTier: z.string().optional(),
        learnFactIds: z.array(z.string()).optional(),
      }),
    )
    .default([]),
  newCharacters: z.array(characterNodeSchema).default([]),
  newLocations: z.array(locationNodeSchema).default([]),
  locationUpdates: z
    .array(
      z.object({
        locationId: z.string().min(1).max(80),
        status: z.enum(['intact', 'damaged', 'destroyed', 'sealed']).optional(),
        description: z.string().optional(),
      }),
    )
    .default([]),
  newFacts: z.array(narrativeFactSchema).default([]),
  plantedForeshadowings: z.array(foreshadowingItemSchema).default([]),
  resolvedForeshadowingIds: z.array(z.string()).default([]),
  worldbuildingAdditions: z.array(z.string().min(1).max(400)).max(30).default([]),
  mechanicsStatChanges: z
    .array(
      z.object({
        entityId: z.string().min(1).max(80),
        key: z.string().min(1).max(64),
        previousValue: z.union([z.number(), z.string()]).optional(),
        delta: z.number().optional(),
        nextValue: z.union([z.number(), z.string(), z.array(z.string())]),
        reason: z.string().max(240).default(''),
      }),
    )
    .default([]),
});

export type ChapterStateDelta = z.infer<typeof chapterStateDeltaSchema>;

export const continuityBridgeAlertSchema = z.object({
  fromChapterNo: z.number().int().min(1),
  toChapterNo: z.number().int().min(2),
  severity: z.enum(['warn', 'conflict']),
  summary: z.string().min(1).max(400),
  details: z.array(z.string().min(1).max(400)).max(20).default([]),
  detectedAt: z.string(),
});

export type ContinuityBridgeAlert = z.infer<typeof continuityBridgeAlertSchema>;

export const invariantViolationSchema = z.object({
  severity: z.enum(['blocker', 'warn']),
  category: z.enum([
    'dead_character',
    'location_state',
    'knowledge_leak',
    'mechanics_math',
    'inventory_mismatch',
    'forbidden_cliche',
  ]),
  entityRef: z.string().max(120).default(''),
  message: z.string().min(1).max(500),
  evidenceSpan: z.string().max(300).optional(),
});

export type InvariantViolation = z.infer<typeof invariantViolationSchema>;

/**
 * LibriScribe ContentQualityAgent 5-axis prose evaluation (0.00 - 1.00).
 */
export const prose5AxisScoreSchema = z.object({
  showDontTell: z.number().min(0).max(1),
  characterVoice: z.number().min(0).max(1),
  craftSkillFidelity: z.number().min(0).max(1),
  cadenceAndVariety: z.number().min(0).max(1),
  goalAndHook: z.number().min(0).max(1),
  overall: z.number().min(0).max(1),
  rewriteDirectives: z.array(z.string().min(1).max(400)).max(10).default([]),
});

export type Prose5AxisScore = z.infer<typeof prose5AxisScoreSchema>;

/**
 * LibriScribe PacingAgent 5-axis structural momentum evaluation (0.00 - 1.00).
 */
export const pacing5AxisScoreSchema = z.object({
  tensionMomentum: z.number().min(0).max(1),
  infoDensity: z.number().min(0).max(1),
  emotionalOscillation: z.number().min(0).max(1),
  arcProgression: z.number().min(0).max(1),
  readerFatigueGuard: z.number().min(0).max(1),
  overall: z.number().min(0).max(1),
  pacingGuidance: z.string().max(500).default(''),
});

export type Pacing5AxisScore = z.infer<typeof pacing5AxisScoreSchema>;

export const aiFlavorFlagSchema = z.object({
  ruleId: z.string().min(1).max(64),
  category: z.enum(['cliche_phrase', 'summary_ending', 'parallel_triad', 'abstract_emotion', 'monotone_cadence']),
  matchedText: z.string().min(1).max(200),
  paragraphIndex: z.number().int().min(0),
  suggestion: z.string().max(240),
});

export type AiFlavorFlag = z.infer<typeof aiFlavorFlagSchema>;

export const humanizerReportSchema = z.object({
  aiFlavorScore: z.number().min(0).max(100),
  flags: z.array(aiFlavorFlagSchema).max(100).default([]),
  rawCharCount: z.number().int().min(0),
  humanizedCharCount: z.number().int().min(0).optional(),
});

export type HumanizerReport = z.infer<typeof humanizerReportSchema>;

export const chapterQualityReportSchema = z.object({
  reviewerCatId: z.string().min(1).max(120),
  verdict: z.enum(['approved', 'rewrite_required']),
  invariantViolations: z.array(invariantViolationSchema).default([]),
  proseScores: prose5AxisScoreSchema,
  pacingScores: pacing5AxisScoreSchema,
  humanizerReport: humanizerReportSchema.optional(),
  summaryCritique: z.string().max(1200).default(''),
  evaluatedAt: z.string(),
});

export type ChapterQualityReport = z.infer<typeof chapterQualityReportSchema>;
