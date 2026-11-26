import type { AiFlavorFlag, HumanizerReport, StyleProfile8Axis } from '@cat-cafe/shared';

interface ClichePatternRule {
  id: string;
  category: AiFlavorFlag['category'];
  regex: RegExp;
  suggestion: string;
  replacement?: (match: string) => string;
}

const ZH_AI_FLAVOR_RULES: readonly ClichePatternRule[] = [
  {
    id: 'ai-cliche-arc-smile',
    category: 'cliche_phrase',
    regex: /嘴角(?:微微)?(?:勾起|扬起|掀起)一抹(?:不易察觉的|意味深长的|冰冷的|嘲讽的)?弧度/g,
    suggestion: '删除套路化的“嘴角勾起一抹弧度”，改写为具体动作、停顿或台词反击',
    replacement: () => '轻轻扯了下嘴角',
  },
  {
    id: 'ai-cliche-eye-flash',
    category: 'cliche_phrase',
    regex: /眼(?:眸|底|中|神)(?:深处)?闪过一(?:丝|抹)(?:不易察觉的|复杂的|冰冷的|骇人的)?(?:光芒|精光|寒芒|异色|神色)/g,
    suggestion: '避免“眼中闪过一丝不易察觉的XX”，既然不易察觉，请通过视线落点或肢体细节呈现',
  },
  {
    id: 'ai-cliche-air-froze',
    category: 'cliche_phrase',
    regex: /空气(?:在这一刻)?仿佛(?:凝固|静止)了(?:一般)?/g,
    suggestion: '删除“空气仿佛凝固”，改写为环境中的细微声响（如灯芯爆裂、衣角摩擦或呼吸声）',
  },
  {
    id: 'ai-cliche-involuntary',
    category: 'abstract_emotion',
    regex: /不由自主地|情不自禁地|下意识地不由得|心中不禁涌起一股/g,
    suggestion: '减少“不由得/情不自禁/心中涌起一股”等AI解释词，直接写生理反应或外显动作',
  },
  {
    id: 'ai-cliche-as-if-telling',
    category: 'cliche_phrase',
    regex: /仿佛在诉说着|似乎在预示着|宛如一幅.*画卷|在这一刻具象化了/g,
    suggestion: '删除散文化总结拔高句（“仿佛在诉说着…”），让景物停留在客观感官本身',
  },
  {
    id: 'ai-summary-ending',
    category: 'summary_ending',
    regex: /(?:他知道|她明白|众人清楚)，这仅仅只是(?:一个)?开始[^。！？]*[。！？]/g,
    suggestion: '删除典型的AI总结升华式章尾（“这仅仅只是开始”），停在具体悬念事件或未答台词上',
  },
  {
    id: 'ai-parallel-triad',
    category: 'parallel_triad',
    regex: /不是[^，。]{2,20}，也不是[^，。]{2,20}，而是[^。！？]{2,30}[。！？]/g,
    suggestion: '警惕高频AI排比句式“不是A，也不是B，而是C”，密集出现会产生浓重机翻/公文感',
  },
];

/**
 * Analyze Chinese novel draft for LLM prose tells ("AI味"), sentence cadence monotony,
 * and StyleProfile forbidden clichés.
 */
export function analyzeChineseAiFlavor(text: string, styleProfile?: StyleProfile8Axis): HumanizerReport {
  const paragraphs = text
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const flags: AiFlavorFlag[] = [];

  paragraphs.forEach((para, pIdx) => {
    for (const rule of ZH_AI_FLAVOR_RULES) {
      const re = new RegExp(rule.regex.source, rule.regex.flags);
      for (const match of para.matchAll(re)) {
        flags.push({
          ruleId: rule.id,
          category: rule.category,
          matchedText: match[0],
          paragraphIndex: pIdx,
          suggestion: rule.suggestion,
        });
      }
    }

    if (styleProfile?.forbiddenCliches?.length) {
      for (const cliche of styleProfile.forbiddenCliches) {
        if (cliche && para.includes(cliche)) {
          flags.push({
            ruleId: 'style-profile-forbidden',
            category: 'cliche_phrase',
            matchedText: cliche,
            paragraphIndex: pIdx,
            suggestion: `命中当前文风规范禁用词「${cliche}」，请替换为符合角色/场景特征的具体表达`,
          });
        }
      }
    }

    // Detect monotone sentence cadence inside long paragraphs
    const sentences = para.split(/[。！？!?]+/).filter((s) => s.trim().length >= 4);
    if (sentences.length >= 5) {
      const lens = sentences.map((s) => s.trim().length);
      const mean = lens.reduce((a, b) => a + b, 0) / lens.length;
      const maxDiff = Math.max(...lens.map((l) => Math.abs(l - mean)));
      if (maxDiff <= 4) {
        flags.push({
          ruleId: 'cadence-monotone',
          category: 'monotone_cadence',
          matchedText: `${para.slice(0, 42)}…`,
          paragraphIndex: pIdx,
          suggestion: '该段连续5句以上字数几乎完全等长，节奏过于机械，请穿插短促断句或长短错落句式',
        });
      }
    }
  });

  const charScale = Math.max(1, text.length / 1000);
  const density = flags.length / charScale;
  const aiFlavorScore = Math.min(100, Math.round(density * 14));

  return {
    aiFlavorScore,
    flags: flags.slice(0, 100),
    rawCharCount: text.length,
  };
}

/**
 * Lightweight deterministic cleanup pass (removes filler qualifiers & mechanical connectors)
 * used before or alongside the LLM Humanizer pass while preserving raw backup.
 */
export function lightPolishAiCliches(text: string): string {
  return text
    .replace(/嘴角(?:微微)?(?:勾起|扬起|掀起)一抹(?:不易察觉的|意味深长的|冰冷的|嘲讽的)?弧度/g, '唇角微动')
    .replace(
      /眼(?:眸|底|中|神)(?:深处)?闪过一(?:丝|抹)(?:不易察觉的|复杂的|冰冷的|骇人的)?(?:光芒|精光|寒芒|异色|神色)/g,
      '目光微凝',
    )
    .replace(/空气(?:在这一刻)?仿佛(?:凝固|静止)了(?:一般)?[，。]?/g, '四周骤然安静下来。')
    .replace(/下意识地不由得/g, '下意识')
    .replace(/不由自主地微微一怔/g, '微怔')
    .replace(/心中不禁涌起一股/g, '心头生出几分')
    .replace(/(?:他知道|她明白|众人清楚)，这仅仅只是(?:一个)?开始[^。！？]*[。！？]/g, '');
}
