import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import {
  analyzeChineseAiFlavor,
  createNovelStudioRuntime,
  type ThreadCoordinatorPort,
} from '../../src/domains/novel-studio/index.js';

describe('Clowder-Novel: InvariantChecker, Humanizer-zh & Multi-Cat Chapter Orchestrator', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'clowder-novel-orchestrator-'));
  const dispatches: Array<{ threadId: string; targetCatId: string; markdown: string }> = [];

  const mockCoordinator: ThreadCoordinatorPort = {
    async ensureEditorialThread({ existingThreadId }) {
      return existingThreadId ?? 'thread-novel-editorial-01';
    },
    async dispatchToCat(msg) {
      dispatches.push(msg);
    },
  };

  const runtime = createNovelStudioRuntime({
    workspaceRoot: tempRoot,
    dataDir: join(tempRoot, 'data', 'novel-studio'),
    threadCoordinator: mockCoordinator,
  });

  after(() => {
    runtime.close();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('detects Chinese AI-prose clichés accurately in Humanizer-zh', () => {
    const aiHeavyText =
      '林寒嘴角勾起一抹不易察觉的弧度，眼底深处闪过一丝冰冷的寒芒。空气在这一刻仿佛凝固了一般。他知道，这仅仅只是一个开始。';
    const report = analyzeChineseAiFlavor(aiHeavyText);
    assert.ok(report.aiFlavorScore >= 30);
    assert.ok(report.flags.length >= 3);
  });

  it('coordinates multi-cat chapter loop, enforces cross-cat review, blocks dead-char plotholes, and supports auto-continuous + rollback', async () => {
    // 1. Ingest reference book & compile battle skill
    const refBook = await runtime.ingestAndIndexBook({
      title: '刀锋战纪',
      fileName: 'battle-ref.txt',
      buffer: Buffer.from('第一章 血战断桥\n刀光破空斩落，他侧身格挡暴退，借桥柱掩护反击刺穿敌将肩胛！', 'utf8'),
    });
    const battleSkill = runtime.skillCompiler.compileFromBookSamples({
      book: refBook!,
      dimension: 'battle_action',
      sampledChunks: runtime.corpusStore.sampleRepresentativeChunks(refBook!.id, 'battle_action', 2),
      slug: 'craft-battle-blade',
    });

    // 2. Create project with Mechanics Ledger enabled
    const created = runtime.projectStore.createProject({
      title: '烬海长歌',
      genre: '玄幻系统',
      premise: '灰烬海幸存者的复仇与破局之旅',
      enableMechanicsLedger: true,
      catRoster: {
        chiefEditorCatId: 'opus',
        architectCatId: 'opus',
        writerCatId: 'kimi',
        specialistCatId: 'gemini',
        criticCatId: 'codex',
      },
    });
    const projectId = created.project.id;

    // Seed initial canon (including a DEAD mentor + a secret fact) & mechanics stats
    runtime.projectStore.saveBundle(
      created.project,
      {
        characters: [
          {
            id: 'lin-han',
            name: '林寒',
            aliases: [],
            role: 'protagonist',
            status: 'alive',
            locationId: 'black-reef',
            injuriesOrDebuffs: ['左肩箭伤未愈'],
            inventory: ['残缺青铜令'],
            powerTier: '一阶燃血境',
            voiceTraits: '言简意赅，冷峻寡言',
            motivation: '查清灰烬海沉船真相',
            knownFactIds: [],
            relationships: [],
            lastUpdatedChapter: 0,
          },
          {
            id: 'old-master',
            name: '莫长老',
            aliases: [],
            role: 'supporting',
            status: 'dead',
            locationId: 'tomb',
            injuriesOrDebuffs: [],
            inventory: [],
            powerTier: '',
            voiceTraits: '',
            motivation: '',
            knownFactIds: [],
            relationships: [],
            lastUpdatedChapter: 0,
          },
        ],
        locations: [],
        facts: [{ id: 'secret-king', statement: '城主早已被深海邪灵寄生', isSecret: true, introducedChapter: 0 }],
        foreshadowings: [
          {
            id: 'clue-token',
            clue: '青铜令背面刻着半枚海神纹',
            plantedChapter: 1,
            expectedPayoffWindow: '1-5章',
            status: 'planted',
            notes: '',
          },
        ],
        revision: 1,
        updatedAt: new Date().toISOString(),
      },
      {
        enabled: true,
        systemName: '燃血面板',
        hardRules: ['灵力值最低为0，不可透支为负数'],
        fields: [{ key: 'stamina', label: '灵力值', kind: 'number', min: 0, max: 100 }],
        entities: [{ entityId: 'lin-han', entityName: '林寒', stats: { stamina: 80 }, skillsAndCooldowns: [] }],
        chapterSnapshots: {
          '0': [{ entityId: 'lin-han', entityName: '林寒', stats: { stamina: 80 }, skillsAndCooldowns: [] }],
        },
        revision: 1,
        updatedAt: new Date().toISOString(),
      },
    );
    runtime.projectStore.saveCanonSnapshot(projectId, 0, runtime.projectStore.loadBundle(projectId)!.canon);

    // Bind battle_action -> craft-battle-blade
    runtime.orchestrator.updateDimensionMatrix(projectId, [
      {
        dimension: 'battle_action',
        skillSlugs: [battleSkill.slug],
        referenceBookIds: [refBook!.id],
        ragWeight: 0.9,
        ragMode: 'structural_beats',
      },
    ]);

    // 3. Save outlines for Chapter 1 and Chapter 2
    runtime.orchestrator.saveOutlineArtifacts(projectId, {
      chapterOutlines: [
        {
          chapterNo: 1,
          volumeNo: 1,
          title: '黑礁暗袭',
          goal: '击退追杀者并保住青铜令',
          conflict: '带伤在湿滑礁石群迎战两名猎犬武士',
          outcome: '借海浪反杀但灵力耗损',
          hook: '猎犬尸体怀里掉出城主府密令',
          povCharacterId: 'lin-han',
          targetWords: 3000,
          beats: [
            {
              beatIndex: 1,
              summary: '礁石潜伏与短兵死斗',
              primaryDimension: 'battle_action',
              secondaryDimensions: [],
              castIds: ['lin-han'],
              locationId: 'black-reef',
              ragQueryHint: '借掩护格挡反击',
              targetWords: 3000,
            },
          ],
          foreshadowingToPlant: [],
          foreshadowingToPayoff: [],
        },
        {
          chapterNo: 2,
          volumeNo: 1,
          title: '雾夜潜入',
          goal: '潜入外城黑市核验密令',
          conflict: '黑市掌柜暗中报警',
          outcome: '全身而退',
          hook: '门外响起三声暗号',
          povCharacterId: 'lin-han',
          targetWords: 3000,
          beats: [
            {
              beatIndex: 1,
              summary: '黑市交锋',
              primaryDimension: 'battle_action',
              secondaryDimensions: [],
              castIds: ['lin-han'],
              locationId: 'black-market',
              ragQueryHint: '突围',
              targetWords: 3000,
            },
          ],
          foreshadowingToPlant: [],
          foreshadowingToPayoff: [],
        },
      ],
    });

    // 4. Start Chapter 1 -> verifies active skill mounting + secret boundary injection + Chief Editor dispatch
    const packet = await runtime.orchestrator.prepareAndStartChapter(projectId, 1, { wakeCatsInThread: true });
    assert.ok(packet.activeSkills.some((s) => s.slug === 'craft-battle-blade'));
    assert.ok(packet.ragPassages.length >= 1);
    assert.match(packet.precheckConstraintsMarkdown, /左肩箭伤未愈/);
    assert.match(packet.precheckConstraintsMarkdown, /城主早已被深海邪灵寄生/);
    assert.ok(dispatches.some((d) => d.targetCatId === 'opus'));

    // 5. Writer Cat ('kimi') submits Draft v1 containing a DEAD CHARACTER resurrection plothole + bad math!
    const badDraft =
      '海风呼啸，林寒按住左肩旧伤，反手格开铁刃。就在危急关头，莫长老走出礁石冷笑道：“孽障休得猖狂！”挥剑震退强敌。这一战波澜起伏，众人震撼莫名。'.repeat(
        2,
      );
    await runtime.orchestrator.submitChapterDraft({
      projectId,
      chapterNo: 1,
      authorCatId: 'kimi',
      draftKind: 'raw',
      content: badDraft,
      proposedStateDelta: {
        characterUpdates: [],
        newCharacters: [],
        locationUpdates: [],
        newFacts: [],
        plantedForeshadowings: [],
        resolvedForeshadowingIds: [],
        mechanicsStatChanges: [
          { entityId: 'lin-han', key: 'stamina', delta: -30, nextValue: 70, reason: '激战消耗' }, // 80 - 30 != 70!
        ],
      },
      wakeNextCat: true,
    });

    // 6. Self-review by 'kimi' MUST be rejected!
    await assert.rejects(
      () =>
        runtime.orchestrator.evaluateChapter({
          projectId,
          chapterNo: 1,
          reviewerCatId: 'kimi',
          proseScores: {
            showDontTell: 0.8,
            characterVoice: 0.8,
            craftSkillFidelity: 0.8,
            cadenceAndVariety: 0.8,
            goalAndHook: 0.8,
            rewriteDirectives: [],
          },
          pacingScores: {
            tensionMomentum: 0.8,
            infoDensity: 0.8,
            emotionalOscillation: 0.8,
            arcProgression: 0.8,
            readerFatigueGuard: 0.8,
            pacingGuidance: '',
          },
          summaryCritique: '自审测试',
        }),
      /Cross-review violation/,
    );

    // 7. Independent Critic Cat ('codex') evaluates -> InvariantChecker catches BOTH dead-character & math errors -> forces rewrite!
    const eval1 = await runtime.orchestrator.evaluateChapter({
      projectId,
      chapterNo: 1,
      reviewerCatId: 'codex',
      proseScores: {
        showDontTell: 0.65,
        characterVoice: 0.7,
        craftSkillFidelity: 0.6,
        cadenceAndVariety: 0.7,
        goalAndHook: 0.75,
        rewriteDirectives: ['删除已故莫长老的活人出场，修正灵力扣减数值'],
      },
      pacingScores: {
        tensionMomentum: 0.75,
        infoDensity: 0.75,
        emotionalOscillation: 0.75,
        arcProgression: 0.75,
        readerFatigueGuard: 0.75,
        pacingGuidance: '',
      },
      summaryCritique: '存在严重死人复活穿帮与面板数值算错，打回返修！',
      wakeNextCat: true,
    });

    assert.equal(eval1.report.verdict, 'rewrite_required');
    assert.equal(eval1.nextStage, 'rewriting');
    assert.ok(eval1.report.invariantViolations.some((v) => v.category === 'dead_character'));
    assert.ok(eval1.report.invariantViolations.some((v) => v.category === 'mechanics_math'));

    // 8. Switch to auto-continuous mode, submit clean Draft v2 with valid math (80 - 30 = 50), Critic ('codex') approves -> auto-commits Chapter 1 AND auto-starts Chapter 2!
    runtime.orchestrator.updateWorkflowConfig(projectId, {
      approvalMode: 'auto-continuous',
      autoBatchSize: 2,
      autoRemainingChapters: 2,
    });

    const cleanDraft =
      '咸涩海浪拍碎在黑礁上。林寒左肩箭伤隐隐作痛，短刀斜切格开第一名武士的重劈，借礁石湿滑青苔旋身掠至其侧后，反手一刀封喉。另一人惊骇后撤，怀中却滑落半块刻着城主府暗纹的玄铁密令！'.repeat(
        2,
      );
    await runtime.orchestrator.submitChapterDraft({
      projectId,
      chapterNo: 1,
      authorCatId: 'kimi',
      draftKind: 'raw',
      content: cleanDraft,
      proposedStateDelta: {
        characterUpdates: [
          {
            characterId: 'lin-han',
            addInventory: ['城主府玄铁密令'],
          },
        ],
        newCharacters: [],
        locationUpdates: [],
        newFacts: [],
        plantedForeshadowings: [],
        resolvedForeshadowingIds: [],
        mechanicsStatChanges: [
          { entityId: 'lin-han', key: 'stamina', delta: -30, nextValue: 50, reason: '黑礁死斗消耗灵力' },
        ],
      },
    });

    const eval2 = await runtime.orchestrator.evaluateChapter({
      projectId,
      chapterNo: 1,
      reviewerCatId: 'codex',
      proseScores: {
        showDontTell: 0.86,
        characterVoice: 0.84,
        craftSkillFidelity: 0.88,
        cadenceAndVariety: 0.85,
        goalAndHook: 0.9,
        rewriteDirectives: [],
      },
      pacingScores: {
        tensionMomentum: 0.85,
        infoDensity: 0.82,
        emotionalOscillation: 0.8,
        arcProgression: 0.86,
        readerFatigueGuard: 0.85,
        pacingGuidance: '节奏干脆利落',
      },
      summaryCritique: '分镜清晰，伤势与数值严丝合缝，钩子有力，准予定稿！',
      wakeNextCat: true,
    });

    assert.equal(eval2.report.verdict, 'approved');
    assert.equal(eval2.nextStage, 'committed');

    const afterCommit = runtime.projectStore.loadBundle(projectId)!;
    assert.equal(afterCommit.mechanics.entities[0]!.stats.stamina, 50);
    assert.ok(afterCommit.canon.characters[0]!.inventory.includes('城主府玄铁密令'));
    // Auto-continuous mode automatically initialized Chapter 2!
    assert.equal(afterCommit.project.chapters['2']?.stage, 'drafting');

    // 9. Export whole-book manuscript & test Rollback to Chapter 0
    const exported = runtime.projectStore.exportManuscript(projectId, 'md');
    assert.match(exported.content, /黑礁暗袭/);

    const rolledBack = runtime.orchestrator.rollbackToChapter(projectId, 0);
    assert.equal(rolledBack.mechanics.entities[0]!.stats.stamina, 80);
    assert.ok(!rolledBack.canon.characters[0]!.inventory.includes('城主府玄铁密令'));
  });
});
