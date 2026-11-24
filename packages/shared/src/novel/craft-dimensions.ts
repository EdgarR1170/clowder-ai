import { z } from 'zod';

/**
 * Built-in craft dimensions for multi-book novel dissection & Book-to-Skill distillation.
 * Example workflow:
 *   Book A -> plot_arc (大纲结构与爽点节奏弧)
 *   Book B -> battle_action (战斗场景与招式博弈分镜)
 *   Book C -> character_persona (角色立体塑造与对话潜台词)
 *   Book D -> scene_atmosphere (环境空间调度与五感氛围)
 *   Book E -> world_mechanics (世界观展开与力量/系统规则)
 *   Book F -> prose_style (8维句法节奏与文风底色)
 */
export const NOVEL_CRAFT_DIMENSIONS = [
  'plot_arc',
  'battle_action',
  'character_persona',
  'scene_atmosphere',
  'world_mechanics',
  'prose_style',
] as const;

export type NovelCraftDimension = (typeof NOVEL_CRAFT_DIMENSIONS)[number];

export const novelCraftDimensionSchema = z.enum(NOVEL_CRAFT_DIMENSIONS);

export const NOVEL_CRAFT_DIMENSION_LABELS: Readonly<
  Record<NovelCraftDimension, { zh: string; shortDesc: string; icon: string }>
> = {
  plot_arc: {
    zh: '大纲与节奏弧',
    shortDesc: '黄金三章、情节单元推进、悬念钩子与爽点/情绪曲线',
    icon: 'Compass',
  },
  battle_action: {
    zh: '战斗与动作分镜',
    shortDesc: '空间站位、招式拆解、信息差博弈、压制与逆转节拍',
    icon: 'Swords',
  },
  character_persona: {
    zh: '角色塑造与对话',
    shortDesc: '人物弧光、潜台词张力、口癖辨识度与群像冲突',
    icon: 'Users',
  },
  scene_atmosphere: {
    zh: '场景描写与氛围',
    shortDesc: '五感锚点、光影空间、动静对比与环境叙事交互',
    icon: 'Mountain',
  },
  world_mechanics: {
    zh: '世界观与机制体系',
    shortDesc: '设定渐进揭示、力量阶梯边界、系统面板/代价规则',
    icon: 'Cpu',
  },
  prose_style: {
    zh: '文风与句法韵律',
    shortDesc: '叙事视角、长短句交替、对话占比、修辞克制度与避雷词',
    icon: 'Feather',
  },
};

/**
 * LibriScribe-inspired 8-axis quantitative + qualitative StyleProfile.
 */
export const styleProfile8AxisSchema = z.object({
  pov: z.enum(['first_person', 'third_limited', 'third_omniscient', 'multi_pov']).default('third_limited'),
  avgSentenceLengthChars: z.number().min(4).max(120).default(24),
  sentenceVariance: z.enum(['staccato_burst', 'balanced_wave', 'lyrical_long']).default('balanced_wave'),
  dialogueRatioTarget: z.number().min(0).max(1).default(0.38),
  pacingTempo: z.enum(['rapid_hook', 'steady_escalation', 'slow_burn_immersive']).default('steady_escalation'),
  sensoryDensity: z.number().min(0).max(1).default(0.55),
  emotionalRestraint: z.number().min(0).max(1).default(0.65),
  hookStrategy: z.string().min(1).max(400).default('章末停在认知反转、危机降临或关键抉择前一秒'),
  toneKeywords: z.array(z.string().min(1).max(40)).max(16).default([]),
  forbiddenCliches: z.array(z.string().min(1).max(80)).max(64).default([]),
});

export type StyleProfile8Axis = z.infer<typeof styleProfile8AxisSchema>;

/**
 * book-to-skill core unit 1: Actionable conditional decision rule (If-Then heuristic).
 */
export const craftDecisionRuleSchema = z.object({
  id: z.string().min(1).max(64),
  when: z.string().min(1).max(300),
  action: z.string().min(1).max(500),
  rationale: z.string().min(1).max(400),
});

export type CraftDecisionRule = z.infer<typeof craftDecisionRuleSchema>;

/**
 * book-to-skill core unit 2: Explicit anti-pattern (what breaks immersion and how to fix).
 */
export const craftAntiPatternSchema = z.object({
  id: z.string().min(1).max(64),
  badPattern: z.string().min(1).max(300),
  whyItFails: z.string().min(1).max(400),
  fixRule: z.string().min(1).max(400),
});

export type CraftAntiPattern = z.infer<typeof craftAntiPatternSchema>;

/**
 * De-identified structural beat sequence distilled from reference chapters (prevents plagiarism).
 */
export const craftBeatTemplateSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(120),
  applicableWhen: z.string().min(1).max(300),
  beats: z.array(z.string().min(1).max(400)).min(2).max(12),
  tensionCurve: z.array(z.number().min(0).max(1)).min(2).max(12),
});

export type CraftBeatTemplate = z.infer<typeof craftBeatTemplateSchema>;

/**
 * Complete Book-to-Skill craft package metadata + structured payload.
 * Compiles to a standard Clowder SKILL.md directory for on-demand loading by writing cats.
 */
export const distilledCraftSkillSchema = z.object({
  slug: z
    .string()
    .min(3)
    .max(80)
    .regex(/^[a-z0-9][a-z0-9-]*$/),
  title: z.string().min(1).max(120),
  dimension: novelCraftDimensionSchema,
  sourceBookId: z.string().min(1).max(80),
  sourceBookTitle: z.string().min(1).max(160),
  summary: z.string().min(1).max(800),
  coreFrameworks: z
    .array(
      z.object({
        name: z.string().min(1).max(120),
        mentalModel: z.string().min(1).max(600),
        applicationSteps: z.array(z.string().min(1).max(300)).min(1).max(8),
      }),
    )
    .min(1)
    .max(10),
  decisionRules: z.array(craftDecisionRuleSchema).min(1).max(20),
  antiPatterns: z.array(craftAntiPatternSchema).min(1).max(15),
  beatTemplates: z.array(craftBeatTemplateSchema).max(10).default([]),
  styleProfile: styleProfile8AxisSchema.optional(),
  skillDirPath: z.string().optional(),
  mountedToCats: z.boolean().default(false),
  updatedAt: z.string(),
});

export type DistilledCraftSkill = z.infer<typeof distilledCraftSkillSchema>;
