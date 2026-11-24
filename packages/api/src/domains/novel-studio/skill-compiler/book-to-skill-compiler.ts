import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import {
  type CraftAntiPattern,
  type CraftBeatTemplate,
  type CraftDecisionRule,
  type DistilledCraftSkill,
  distilledCraftSkillSchema,
  NOVEL_CRAFT_DIMENSION_LABELS,
  type NovelCraftDimension,
  type ReferenceBookSummary,
  type StyleProfile8Axis,
} from '@cat-cafe/shared';
import type { IngestedSceneChunk } from '../corpus/novel-ingestor.js';
import { convertChunkToStructuralBeats } from '../corpus/novel-vector-store.js';

const DIMENSION_DEFAULT_FRAMEWORKS: Readonly<
  Record<
    NovelCraftDimension,
    {
      frameworkName: string;
      mentalModel: string;
      steps: string[];
      rules: CraftDecisionRule[];
      antiPatterns: CraftAntiPattern[];
    }
  >
> = {
  plot_arc: {
    frameworkName: '三幕递进与悬念双钩模型 (Dual-Hook Escalation)',
    mentalModel: '每章必须解决一个小悬念或兑现一个小期待，同时抛出一个更高风险的新问题，形成不可中断的阅读推力。',
    steps: [
      '开场前300字内锚定当前迫切目标或承接上章钩子',
      '中段设置至少一次信息不对称反转或阻力升级',
      '结尾在情绪峰值或认知颠覆前一拍果断截断',
    ],
    rules: [
      {
        id: 'plot-r1',
        when: '连续两章处于信息铺垫或日常过渡期',
        action: '第三章必须在开篇500字内引入突发冲突、外部倒计时或关键利益交换',
        rationale: '防止长篇连载中段节奏塌陷导致读者流失',
      },
      {
        id: 'plot-r2',
        when: '主角即将获得阶段性重大收益或破局',
        action: '先展示其付出的具体代价或暴露的新隐患，再兑现爽点',
        rationale: '无代价的顺风局会迅速消解戏剧张力与世界真实感',
      },
    ],
    antiPatterns: [
      {
        id: 'plot-ap1',
        badPattern: '章末总结陈词式收尾（“一切才刚刚开始”“他暗暗下定决心”）',
        whyItFails: '人工泄压，彻底切断读者翻下一页的迫切感',
        fixRule: '删掉心理总结句，直接停在异常声响、关键来客或惊人发现的画面上',
      },
      {
        id: 'plot-ap2',
        badPattern: '通过路人甲乙丙大段对话硬灌世界背景或剧情前情',
        whyItFails: '工具人感极重，节奏拖沓且缺乏视角代入',
        fixRule: '将背景信息拆入主角正在处理的危机线索或利益争夺动作中',
      },
    ],
  },
  battle_action: {
    frameworkName: '态势—试探—变招—胜负手四拍分镜法',
    mentalModel: '优秀战斗不是招式名词对轰，而是空间距离、信息差、资源消耗与心理博弈的动态交互。',
    steps: [
      '起手锁空间：交代地形高低、障碍物、距离与双方先手态势',
      '交锋写反馈：每次碰撞必须写出物理/环境反馈与代价（虎口震裂、地面犁沟、气息紊乱）',
      '破局靠博弈：通过预判误导、环境借力或底牌时机完成逆转，而非单纯喊口号爆种',
    ],
    rules: [
      {
        id: 'battle-r1',
        when: '进入高烈度贴身搏杀或生死瞬息交锋',
        action: '单句平均字数压缩至8~16字，减少修饰性形容词，密集使用具体动作动词与方位词',
        rationale: '短促断句能在阅读呼吸感上直接模拟高速对抗的窒息感',
      },
      {
        id: 'battle-r2',
        when: '双方存在明显境界/面板战力差距',
        action: '禁止正面硬拼平分秋色，必须通过地形限制、规则漏洞、先手偷袭或付出伤势代价换取生机',
        rationale: '维护全书战力体系公信力，防止战力通胀崩盘',
      },
    ],
    antiPatterns: [
      {
        id: 'battle-ap1',
        badPattern: '回合制报菜名（“甲使出一招XX，乙使出一招YY，轰隆一声平分秋色”）',
        whyItFails: '毫无画面分镜感与空间位置感，像干瘪的战斗日志',
        fixRule: '写出起手征兆、闪避轨迹、受击部位与环境破坏细节',
      },
      {
        id: 'battle-ap2',
        badPattern: '激战正酣时双方停下来发表数百字长篇大论',
        whyItFails: '严重破坏时间流速真实感与生死压迫感',
        fixRule: '战斗中台词限制在10字以内的短喝、误导或换气间隙的冷语',
      },
    ],
  },
  character_persona: {
    frameworkName: '冰山潜台词与行为锚点塑造法',
    mentalModel: '角色性格不由旁白贴标签决定，而由“压力下的非理性偏执、口癖留白、微动作反应”共同锚定。',
    steps: [
      '为每个核心角色锁定独特的句式长短、称呼习惯与回避话题方式',
      '高张力对话采用“答非所问”或“动作代答”，让潜台词承载真实情绪',
      '每次关键事件后展示不同角色截然不同的利益算计或情感落点',
    ],
    rules: [
      {
        id: 'persona-r1',
        when: '角色处于极度愤怒、悲伤或震惊状态',
        action: '禁止直接使用“他愤怒到了极点/悲痛欲绝”，改写为反常的平静动作或失控的生理细节',
        rationale: '克制与具象细节产生的情感冲击力远高于抽象情绪词',
      },
      {
        id: 'persona-r2',
        when: '三人以上同场群像对手戏',
        action: '遮住人名后仅凭台词用词与切入角度仍须能区分发言者身份，且每人都有各自的小算盘',
        rationale: '消除全员同质化“AI腔传声筒”现象',
      },
    ],
    antiPatterns: [
      {
        id: 'persona-ap1',
        badPattern: '全书所有角色说话都像逻辑严密的心理咨询师或公文发言人',
        whyItFails: '丧失活人感与烟火气，人物沦为剧情符号',
        fixRule: '按角色出身与性格加入省略、倒装、口头禅、偏见或刻薄留白',
      },
      {
        id: 'persona-ap2',
        badPattern: '反派或配角在主角面前无端降智嘲讽送人头',
        whyItFails: '拉低主角胜利含金量，显得剧情刻意儿戏',
        fixRule: '赋予对手自洽的利益逻辑、信息盲区与谨慎试探行为',
      },
    ],
  },
  scene_atmosphere: {
    frameworkName: '五感递进与视点交互景深法',
    mentalModel: '环境不是静止的风景明信片，而是透过POV角色当下的心境、生理体感与行动阻碍折射出的立体空间。',
    steps: [
      '建立远中近三级景深，但每次只抓取2~3个最具辨识度的视觉/听觉/嗅觉锚点',
      '让角色与环境发生物理交互（踩碎枯叶、拨开油污门帘、寒气刺入旧伤）',
      '用光影冷暖与声音疏密映射当前场次的叙事悬念度',
    ],
    rules: [
      {
        id: 'scene-r1',
        when: '首次进入新地图、秘境或关键建筑空间',
        action: '跟随角色移动脚步渐次展开空间细节，单段纯景物描写不超过150字即穿插人物动作或感知',
        rationale: '避免静态说明书式大段写景打断叙事流',
      },
      {
        id: 'scene-r2',
        when: '暴风雨前夕或危机潜伏场次',
        action: '放大环境中的反常寂静或单一重复细碎声响（水滴、钟摆、铁锈摩擦）',
        rationale: '以静衬动可低成本拉满心理悬疑张力',
      },
    ],
    antiPatterns: [
      {
        id: 'scene-ap1',
        badPattern: '堆砌华丽空洞的四字成语与“宛如人间仙境/如同一幅画卷”',
        whyItFails: '读者大脑无法生成具体画面，产生浓重AI套话感',
        fixRule: '改写为具体材质、颜色、气味、温度与光影投射位置',
      },
    ],
  },
  world_mechanics: {
    frameworkName: '冰山揭示与硬约束代价法则',
    mentalModel: '力量体系与系统规则的魅力在于“清晰可预期的边界 + 极限情境下的创造性组合利用”。',
    steps: [
      '每次只揭示当前冲突必须用到的那10%规则细节',
      '明确每项能力/面板收益背后的资源消耗、冷却窗口或副作用',
      '在关键战役中兑现前文铺垫过的规则特性，制造智商上的爽感',
    ],
    rules: [
      {
        id: 'mech-r1',
        when: '系统面板、境界提升或新道具结算出现',
        action: '严格核对前后数值加减与冷却状态，面板展示保持简洁克制，不为水字数反复刷全量属性表',
        rationale: '保持数值账本零穿帮，同时避免满屏表格破坏阅读连贯性',
      },
    ],
    antiPatterns: [
      {
        id: 'mech-ap1',
        badPattern: '遇到绝境临时口胡新设定或机械降神解锁无代价新挂',
        whyItFails: '彻底摧毁读者对危机感的信任',
        fixRule: '所有破局能力必须至少提前1~3章埋下规则伏笔或付出明确代价',
      },
    ],
  },
  prose_style: {
    frameworkName: '呼吸感句法与零AI腔叙事规范',
    mentalModel: '通过长短句错落控制阅读配速，用具体动词和名词替代抽象副词与套话修饰。',
    steps: [
      '慢铺垫用复合长句营造沉浸感，快冲突切短句制造顿挫爆发力',
      '每千字自检并剔除“不由得、一抹弧度、仿佛在诉说”等高频AI连接词',
      '保持统一叙事限制视角（POV），严禁同一段内视角随意跳切',
    ],
    rules: [
      {
        id: 'style-r1',
        when: '段落超过4行且句式结构趋同',
        action: '主动拆段或插入一句6字以内的独立短句改变节奏重音',
        rationale: '适配移动端与网页端长篇阅读视觉呼吸感',
      },
    ],
    antiPatterns: [
      {
        id: 'style-ap1',
        badPattern: '密集使用“不是A，也不是B，而是C”以及段尾哲理升华句',
        whyItFails: '最具辨识度的LLM生成痕迹，瞬间出戏',
        fixRule: '直接陈述核心事实或停留在人物当下动作反应上',
      },
    ],
  },
};

export function renderCraftSkillMarkdown(skill: DistilledCraftSkill): {
  skillMd: string;
  beatTemplatesMd: string;
} {
  const dimMeta = NOVEL_CRAFT_DIMENSION_LABELS[skill.dimension];
  const frameworksSection = skill.coreFrameworks
    .map(
      (fw, idx) =>
        `### ${idx + 1}. ${fw.name}\n\n- **核心心智模型**：${fw.mentalModel}\n${fw.applicationSteps.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`,
    )
    .join('\n\n');

  const rulesRows = skill.decisionRules
    .map(
      (r) =>
        `| \`${r.id}\` | ${r.when.replace(/\|/g, '｜')} | ${r.action.replace(/\|/g, '｜')} | ${r.rationale.replace(/\|/g, '｜')} |`,
    )
    .join('\n');

  const antiPatternRows = skill.antiPatterns
    .map(
      (ap) =>
        `| \`${ap.id}\` | ${ap.badPattern.replace(/\|/g, '｜')} | ${ap.whyItFails.replace(/\|/g, '｜')} | ${ap.fixRule.replace(/\|/g, '｜')} |`,
    )
    .join('\n');

  const styleBlock = skill.styleProfile
    ? [
        '## StyleProfile 八维量化标尺',
        '',
        `- **叙事视角 (POV)**：\`${skill.styleProfile.pov}\``,
        `- **目标平均句长**：约 \`${skill.styleProfile.avgSentenceLengthChars}\` 字（波动形态：\`${skill.styleProfile.sentenceVariance}\`）`,
        `- **目标对话占比**：\`${Math.round(skill.styleProfile.dialogueRatioTarget * 100)}%\``,
        `- **推进配速**：\`${skill.styleProfile.pacingTempo}\``,
        `- **五感细节密度**：\`${skill.styleProfile.sensoryDensity}\` | **情绪克制度**：\`${skill.styleProfile.emotionalRestraint}\``,
        `- **章末钩子范式**：${skill.styleProfile.hookStrategy}`,
        skill.styleProfile.toneKeywords.length > 0
          ? `- **基调关键词**：${skill.styleProfile.toneKeywords.join('、')}`
          : '',
        skill.styleProfile.forbiddenCliches.length > 0
          ? `- **禁用套话清单**：${skill.styleProfile.forbiddenCliches.map((w) => `「${w}」`).join(' ')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  const skillMd = `---
name: ${skill.slug}
description: >
  Use when 撰写或审校小说【${dimMeta.zh}】维度（萃取自《${skill.sourceBookTitle}》：${dimMeta.shortDesc}）。
  Not for 直接照抄《${skill.sourceBookTitle}》原书人名地名剧情，或不涉及【${dimMeta.zh}】的无关场次。
  Output: 严格遵循本技法框架、If-Then决策规则与反模式红线的原创小说节拍或正文段落。
---

# ${skill.title}（《${skill.sourceBookTitle}》· ${dimMeta.zh}技法包）

> **技法定位**：${skill.summary}
> **防抄袭铁律**：只迁移框架、节奏配速、分镜调度与决策规则，严禁复用原书专有名词、人物设定与具体台词！按需参阅 \`refs/beat-templates.md\` 获取脱敏节拍骨架。

## 核心技法框架 (Mental Models)

${frameworksSection}

## 决策规则表 (If-Then Heuristics)

| 规则ID | 触发情境 (When) | 执行动作 (Then) | 底层逻辑 (Rationale) |
| :--- | :--- | :--- | :--- |
${rulesRows}

## 反模式红线 (Anti-Patterns)

| 编号 | 典型败笔 (Bad Pattern) | 崩坏原因 (Why It Fails) | 修正铁律 (Fix Rule) |
| :--- | :--- | :--- | :--- |
${antiPatternRows}

${styleBlock}
`.trim();

  const beatTemplatesMd =
    skill.beatTemplates.length > 0
      ? `# 《${skill.sourceBookTitle}》· ${dimMeta.zh}脱敏节拍模板库\n\n` +
        skill.beatTemplates
          .map(
            (tpl) =>
              `## ${tpl.name}\n- **适用场景**：${tpl.applicableWhen}\n- **张力曲线**：\`[${tpl.tensionCurve.join(' -> ')}]\`\n\n${tpl.beats.map((b, i) => `${i + 1}. ${b}`).join('\n')}`,
          )
          .join('\n\n---\n\n')
      : `# 《${skill.sourceBookTitle}》· ${dimMeta.zh}脱敏节拍模板库\n\n暂无额外节拍样本。`;

  return { skillMd: `${skillMd}\n`, beatTemplatesMd: `${beatTemplatesMd}\n` };
}

export class BookToSkillCompiler {
  private readonly skillsDir: string;

  constructor(
    dataDir: string,
    private readonly workspaceRoot: string,
  ) {
    this.skillsDir = join(dataDir, 'craft-skills');
    mkdirSync(this.skillsDir, { recursive: true });
  }

  /**
   * Build an immediately usable, data-grounded Book-to-Skill craft package from an ingested book's
   * statistical profile + top representative dimension chunks (can also be refined by any Cat!).
   */
  compileFromBookSamples(params: {
    book: ReferenceBookSummary;
    dimension: NovelCraftDimension;
    sampledChunks: IngestedSceneChunk[];
    slug?: string;
    title?: string;
    customFocus?: string;
  }): DistilledCraftSkill {
    const dimMeta = NOVEL_CRAFT_DIMENSION_LABELS[params.dimension];
    const preset = DIMENSION_DEFAULT_FRAMEWORKS[params.dimension];
    const safeBookSlug = params.book.id.replace(/[^a-z0-9-]/gi, '-').toLowerCase();
    const slug = (params.slug ?? `craft-${safeBookSlug}-${params.dimension.replace(/_/g, '-')}`)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 72);

    const rawStats = params.book.rawStyleStats;
    const avgChunkDialogue =
      params.sampledChunks.length > 0
        ? Number(
            (params.sampledChunks.reduce((acc, c) => acc + c.dialogueRatio, 0) / params.sampledChunks.length).toFixed(
              2,
            ),
          )
        : (rawStats?.dialogueRatio ?? 0.36);

    const avgSentence = rawStats?.avgSentenceLengthChars ?? 23;
    const sentenceVariance: StyleProfile8Axis['sentenceVariance'] =
      params.dimension === 'battle_action' || avgSentence < 19
        ? 'staccato_burst'
        : avgSentence > 30
          ? 'lyrical_long'
          : 'balanced_wave';

    const beatTemplates: CraftBeatTemplate[] = params.sampledChunks.slice(0, 5).map((chunk, idx) => {
      const skeleton = convertChunkToStructuralBeats(chunk.content, params.dimension).split('\n').filter(Boolean);
      return {
        id: `tpl-${idx + 1}`,
        name: `样本节拍 #${idx + 1}（源自 ${chunk.chapterTitle}）`,
        applicableWhen: `当本章场次需要高密度【${dimMeta.zh}】表现（目标对话占比 ~${Math.round(chunk.dialogueRatio * 100)}%）`,
        beats: skeleton.length >= 2 ? skeleton : [skeleton[0] ?? '起势切入', '冲突递进与收束钩子'],
        tensionCurve: [0.35, 0.58, 0.78, 0.92, 0.7].slice(0, Math.max(2, skeleton.length)),
      };
    });

    const styleProfile: StyleProfile8Axis = {
      pov: rawStats?.dominantPov ?? 'third_limited',
      avgSentenceLengthChars: avgSentence,
      sentenceVariance,
      dialogueRatioTarget: avgChunkDialogue,
      pacingTempo:
        params.dimension === 'battle_action'
          ? 'rapid_hook'
          : params.dimension === 'scene_atmosphere'
            ? 'slow_burn_immersive'
            : 'steady_escalation',
      sensoryDensity: params.dimension === 'scene_atmosphere' ? 0.78 : 0.56,
      emotionalRestraint: 0.68,
      hookStrategy: '在信息差揭晓半角或行动即将碰撞的瞬息截断，严禁总结性尾句',
      toneKeywords: [dimMeta.zh, params.customFocus?.trim() || '强代入感', '去AI腔'].filter(Boolean),
      forbiddenCliches: [
        '嘴角勾起一抹弧度',
        '眼中闪过一丝不易察觉的',
        '空气仿佛凝固了',
        '仿佛在诉说着',
        '这仅仅只是开始',
      ],
    };

    const spec: DistilledCraftSkill = distilledCraftSkillSchema.parse({
      slug,
      title: params.title?.trim() || `《${params.book.title}》${dimMeta.zh}专精技法`,
      dimension: params.dimension,
      sourceBookId: params.book.id,
      sourceBookTitle: params.book.title,
      summary:
        params.customFocus?.trim() ||
        `从《${params.book.title}》（共${params.book.chapterCount}章/${Math.round(params.book.totalChars / 10000)}万字）定向抽离的【${dimMeta.zh}】框架、决策规则与脱敏节拍规范。`,
      coreFrameworks: [
        {
          name: preset.frameworkName,
          mentalModel: preset.mentalModel,
          applicationSteps: preset.steps,
        },
      ],
      decisionRules: preset.rules,
      antiPatterns: preset.antiPatterns,
      beatTemplates,
      styleProfile,
      mountedToCats: true,
      updatedAt: new Date().toISOString(),
    });

    return this.saveSkillSpec(spec, true);
  }

  saveSkillSpec(input: DistilledCraftSkill, mountToWorkspaceProviders = input.mountedToCats): DistilledCraftSkill {
    const parsed = distilledCraftSkillSchema.parse({
      ...input,
      updatedAt: new Date().toISOString(),
    });
    const dir = join(this.skillsDir, parsed.slug);
    const refsDir = join(dir, 'refs');
    mkdirSync(refsDir, { recursive: true });

    const { skillMd, beatTemplatesMd } = renderCraftSkillMarkdown(parsed);
    const finalSpec: DistilledCraftSkill = {
      ...parsed,
      skillDirPath: dir,
      mountedToCats: mountToWorkspaceProviders,
    };

    writeFileSync(join(dir, 'SKILL.md'), skillMd, 'utf8');
    writeFileSync(join(refsDir, 'beat-templates.md'), beatTemplatesMd, 'utf8');
    writeFileSync(join(refsDir, 'style-card.json'), JSON.stringify(finalSpec.styleProfile ?? {}, null, 2), 'utf8');
    writeFileSync(join(dir, 'skill-spec.json'), JSON.stringify(finalSpec, null, 2), 'utf8');

    if (mountToWorkspaceProviders) {
      this.mountSkillToProviders(finalSpec.slug, dir);
    } else {
      this.unmountSkillFromProviders(finalSpec.slug);
    }
    return finalSpec;
  }

  /**
   * Mount distilled craft skill into .claude/skills, .codex/skills, .gemini/skills, .kimi-code/skills
   * using Windows-compatible directory junctions (or copy fallback) without polluting tracked manifest.yaml!
   */
  mountSkillToProviders(slug: string, sourceDir: string): void {
    const providerDirs = ['.claude/skills', '.codex/skills', '.gemini/skills', '.kimi-code/skills'];
    for (const rel of providerDirs) {
      const targetParent = resolve(this.workspaceRoot, rel);
      // Do not touch if provider/skills itself is a directory symlink
      try {
        if (existsSync(targetParent) && lstatSync(targetParent).isSymbolicLink()) continue;
      } catch {
        continue;
      }
      mkdirSync(targetParent, { recursive: true });
      const targetLink = join(targetParent, slug);
      try {
        if (existsSync(targetLink)) rmSync(targetLink, { recursive: true, force: true });
        symlinkSync(sourceDir, targetLink, process.platform === 'win32' ? 'junction' : 'dir');
      } catch {
        // Copy fallback if Windows symlink/junction policy is restricted
        mkdirSync(join(targetLink, 'refs'), { recursive: true });
        writeFileSync(join(targetLink, 'SKILL.md'), readFileSync(join(sourceDir, 'SKILL.md')));
        writeFileSync(
          join(targetLink, 'refs', 'beat-templates.md'),
          readFileSync(join(sourceDir, 'refs', 'beat-templates.md')),
        );
      }
    }
  }

  unmountSkillFromProviders(slug: string): void {
    const providerDirs = ['.claude/skills', '.codex/skills', '.gemini/skills', '.kimi-code/skills'];
    for (const rel of providerDirs) {
      const targetParent = resolve(this.workspaceRoot, rel);
      try {
        if (existsSync(targetParent) && lstatSync(targetParent).isSymbolicLink()) continue;
        const targetLink = join(targetParent, slug);
        if (existsSync(targetLink)) rmSync(targetLink, { recursive: true, force: true });
      } catch {
        // Ignore cleanup errors
      }
    }
  }

  listSkills(): DistilledCraftSkill[] {
    if (!existsSync(this.skillsDir)) return [];
    const out: DistilledCraftSkill[] = [];
    for (const entry of readdirSync(this.skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const specPath = join(this.skillsDir, entry.name, 'skill-spec.json');
      if (!existsSync(specPath)) continue;
      try {
        const parsed = distilledCraftSkillSchema.parse(JSON.parse(readFileSync(specPath, 'utf8')));
        out.push(parsed);
      } catch {
        // Skip malformed skill folder
      }
    }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getSkill(slug: string): { spec: DistilledCraftSkill; skillMarkdown: string; beatTemplatesMarkdown: string } | null {
    const dir = join(this.skillsDir, slug);
    const specPath = join(dir, 'skill-spec.json');
    if (!existsSync(specPath)) return null;
    const spec = distilledCraftSkillSchema.parse(JSON.parse(readFileSync(specPath, 'utf8')));
    const skillMarkdown = existsSync(join(dir, 'SKILL.md')) ? readFileSync(join(dir, 'SKILL.md'), 'utf8') : '';
    const beatTemplatesMarkdown = existsSync(join(dir, 'refs', 'beat-templates.md'))
      ? readFileSync(join(dir, 'refs', 'beat-templates.md'), 'utf8')
      : '';
    return { spec, skillMarkdown, beatTemplatesMarkdown };
  }

  deleteSkill(slug: string): boolean {
    const dir = join(this.skillsDir, slug);
    if (!existsSync(dir)) return false;
    this.unmountSkillFromProviders(slug);
    rmSync(dir, { recursive: true, force: true });
    return true;
  }
}
