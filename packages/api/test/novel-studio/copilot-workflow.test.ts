import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { createNovelStudioRuntime, type ThreadCoordinatorPort } from '../../src/domains/novel-studio/index.js';

describe('Clowder-Novel Co-Pilot: Bottom-Up 5-Direction Ideation, Reverse Summary & Backtrack Continuity', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'clowder-novel-copilot-'));
  const dispatches: Array<{ threadId: string; targetCatId: string; markdown: string }> = [];

  const mockCoordinator: ThreadCoordinatorPort = {
    async ensureEditorialThread({ existingThreadId }) {
      return existingThreadId ?? 'thread-copilot-room-01';
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

  it('progresses chapter-by-chapter via 5 directions, reverse-distills summaries & canon, and handles both in_place_bridge and rewind_truncate backtracking', async () => {
    // 1. Ingest Reference Novel (used strictly for pre-chapter beat inspiration & single-chapter prose rhythm)
    const refBook = await runtime.ingestAndIndexBook({
      title: '夜雨孤刀录',
      author: '测试名家',
      fileName: 'rain-blade.txt',
      buffer: Buffer.from(
        '第一章 鬼市听雨\n檐角冷雨如线坠入青石水洼。黑衣刀客按住斗笠，借油灯昏黄光影扫过茶摊掌柜微颤的指节。“铜钱三枚，买一条出城暗道。”掌柜低头拂去桌面水渍，一言不发地将半截竹签推向桌沿。',
        'utf8',
      ),
    });
    assert.ok(refBook);

    // 2. Human creates project with initial master outline & reference style config
    const humanMasterOutline =
      '主角沈澜携半枚残玉入京追查旧案，先在城南鬼市寻访旧部茶博士，再设法潜入太常寺旧库调阅秘档。';
    const created = runtime.projectStore.createProject({
      title: '残玉京华录',
      genre: '古风悬疑武侠',
      premise: humanMasterOutline,
      authorMasterOutlineMarkdown: humanMasterOutline,
      copilotCatId: 'kimi',
      styleConfig: {
        referenceBookIds: [refBook.id],
        stylePreset: '冷峻克制·高张力快节奏',
        customStyleGuidelines: '多用冷雨、灯影与细微肢体动作衬托人物机锋',
        targetWords: 3000,
      },
    });
    const projectId = created.project.id;

    // 3. Chapter 1 Step 1: Request 5 pre-chapter directions
    const ch1Ideate = await runtime.orchestrator.requestChapterDirections(projectId, 1, {
      authorSeedHint: '雨夜初入城南鬼市试探茶博士',
      wakeCat: true,
    });
    assert.equal(ch1Ideate.chapterRecord.stage, 'ideating');
    assert.equal(ch1Ideate.contextPacket.authorMasterOutlineMarkdown, humanMasterOutline);
    assert.ok(ch1Ideate.contextPacket.referenceStyle.ideationStructuralBeats.length >= 1);
    assert.ok(dispatches.some((d) => d.targetCatId === 'kimi' && d.markdown.includes('第 1 章')));

    // Co-Pilot Cat submits 5 distinct directions + guiding questions
    const ch1AfterDirs = runtime.orchestrator.saveChapterDirections(projectId, 1, [
      {
        optionId: 'opt-1',
        title: '正面亮玉逼问',
        focusType: 'conflict_escalation',
        pitch: '直接亮出半枚残玉试探茶博士反应，引来暗哨围堵。',
        openingBeat: '雨夜掀帘入茶寮',
        endingHook: '屋脊传来弩机上弦声',
        guidingQuestion: '你希望第一场冲突就惊动太常寺耳目吗？',
      },
      {
        optionId: 'opt-2',
        title: '铜钱暗号潜流试探',
        focusType: 'suspense_twist',
        pitch: '借旧年三枚错纹铜钱暗中接头，发现茶摊早已被人盯梢。',
        openingBeat: '斗笠滴水压住桌角铜钱',
        endingHook: '茶盏底浮现血字暗记',
        guidingQuestion: '盯梢者你倾向是官府暗探还是江湖第三方？',
      },
      {
        optionId: 'opt-3',
        title: '旧仆昔日恩怨拉扯',
        focusType: 'character_bond',
        pitch: '茶博士认出沈澜刀穗却故意装疯卖傻，试探其十年心性。',
        openingBeat: '破碗浊茶映出旧伤',
        endingHook: '茶博士塞来半页烧焦账册',
        guidingQuestion: '茶博士对沈澜的态度是愧疚居多还是戒备居多？',
      },
      {
        optionId: 'opt-4',
        title: '揭开鬼市宵禁铁律',
        focusType: 'world_revelation',
        pitch: '借鬼市子时换灯规矩展现京城地下势力格局与太常寺禁令。',
        openingBeat: '更夫敲响竹梆熄灭红灯',
        endingHook: '巡夜玄衣卫踏水而来',
        guidingQuestion: '鬼市背后的庇护者是否需要在首章埋下名字？',
      },
      {
        optionId: 'opt-5',
        title: '隔街观虎蓄势待发',
        focusType: 'pacing_transition',
        pitch: '沈澜先在阁楼观察两组探子在茶寮交手，坐收渔利摸清地形。',
        openingBeat: '凭栏听雨俯瞰长街',
        endingHook: '败逃探子怀中滑落通关鱼符',
        guidingQuestion: '是否希望首章节奏偏沉稳观察、把正面交手留到第二章？',
      },
    ]);
    assert.equal(ch1AfterDirs.stage, 'awaiting_choice');
    assert.equal(ch1AfterDirs.directionOptions.length, 5);

    // 4. Chapter 1 Step 2: Human selects Option 2 + Option 4 and adds custom answer
    const ch1Gen = await runtime.orchestrator.generateChapterFromChoice(projectId, 1, {
      selectedOptionIds: ['opt-2', 'opt-4'],
      customAuthorInput: '盯梢者定为太常寺外围玄衣暗探；最后让茶博士借换茶递出「玄鸦令」线索。',
      wakeCat: true,
    });
    assert.equal(ch1Gen.chapterRecord.stage, 'drafting');
    assert.equal(ch1Gen.contextPacket.selectedOptionCards.length, 2);
    assert.ok(ch1Gen.contextPacket.referenceStyle.proseCadenceSamples.length >= 1);

    // Co-Pilot Cat submits Chapter 1 draft
    const ch1DraftText =
      '冷雨敲打着城南鬼市的油纸伞。沈澜按紧腰间孤刀，将三枚错纹铜钱推过潮湿木桌。茶博士眼皮微跳，趁子时换灯之际压低嗓音，将一枚刻着暗纹的「玄鸦令」塞入茶托底部，低声提醒门外已有两名玄衣暗探合围。';
    const sub1 = await runtime.orchestrator.submitChapterDraft({
      projectId,
      chapterNo: 1,
      authorCatId: 'kimi',
      title: '鬼市铜钱',
      draftKind: 'copilot',
      content: ch1DraftText,
      proposedStateDelta: {
        newCharacters: [
          {
            id: 'shen-lan',
            name: '沈澜',
            aliases: [],
            role: 'protagonist',
            status: 'alive',
            locationId: 'ghost-market',
            injuriesOrDebuffs: [],
            inventory: ['半枚残玉', '玄鸦令'],
            powerTier: '一流刀客',
            voiceTraits: '冷峻简短',
            motivation: '查清灭门旧案',
            knownFactIds: [],
            relationships: [],
            lastUpdatedChapter: 1,
          },
          {
            id: 'tea-elder',
            name: '茶博士',
            aliases: [],
            role: 'supporting',
            status: 'alive',
            locationId: 'ghost-market',
            injuriesOrDebuffs: [],
            inventory: [],
            powerTier: '暗桩',
            voiceTraits: '谨慎低沉',
            motivation: '暗中护佑旧主之子',
            knownFactIds: [],
            relationships: [],
            lastUpdatedChapter: 1,
          },
        ],
        newLocations: [
          {
            id: 'ghost-market',
            name: '城南鬼市',
            status: 'intact',
            description: '子时换灯交易的京城地下黑市',
            atmosphereTags: ['冷雨', '昏灯'],
            connectedLocationIds: [],
            lastUpdatedChapter: 1,
          },
        ],
        characterUpdates: [],
        locationUpdates: [],
        newFacts: [],
        plantedForeshadowings: [
          {
            id: 'clue-raven-token',
            clue: '玄鸦令可开启城西枯井暗道',
            plantedChapter: 1,
            expectedPayoffWindow: '2-4章',
            status: 'planted',
            notes: '',
          },
        ],
        resolvedForeshadowingIds: [],
        worldbuildingAdditions: ['城南鬼市规矩：子时熄红灯换绿灯，玄衣暗探不得明面拿人'],
        mechanicsStatChanges: [],
      },
    });
    assert.equal(sub1.record.stage, 'draft_ready');

    // Human edits final sentence and finalizes Chapter 1 -> reverse-distills summary & canon snapshot #1!
    const ch1EditedText = `${ch1DraftText}\n沈澜收起玄鸦令，借檐下暗影翻入后巷枯井方向。`;
    const afterCh1 = await runtime.orchestrator.finalizeAndSummarizeChapter({
      projectId,
      chapterNo: 1,
      title: '鬼市铜钱',
      finalTextOverride: ch1EditedText,
      wakeCatForDeepSummary: false,
    });
    assert.equal(afterCh1.project.chapters['1']?.stage, 'completed');
    assert.equal(afterCh1.project.currentChapterNo, 2);
    assert.equal(afterCh1.project.authorMasterOutlineMarkdown, humanMasterOutline);
    assert.match(afterCh1.project.rollingSynopsisMarkdown, /第 1 章 · 鬼市铜钱/);
    assert.match(afterCh1.project.accumulatedWorldbuildingMarkdown, /玄鸦令/);
    assert.equal(afterCh1.canon.characters.length, 2);

    // 5. Progress Chapter 2 (direct author custom input shortcut) and Chapter 3
    await runtime.orchestrator.generateChapterFromChoice(projectId, 2, {
      customAuthorInput: '沈澜与茶博士在后巷甩开玄衣暗探，商定明日潜入太常寺旧库。',
      wakeCat: false,
    });
    const ch2DraftV1 =
      '紧接鬼市后巷夜雨，沈澜反手刀鞘击晕追来的玄衣暗探。茶博士赶来接应，两人穿过暗渠抵达安全屋，约好次日三更在太常寺侧门汇合。'.repeat(
        2,
      );
    await runtime.orchestrator.submitChapterDraft({
      projectId,
      chapterNo: 2,
      authorCatId: 'kimi',
      title: '暗渠脱身',
      draftKind: 'copilot',
      content: ch2DraftV1,
    });
    await runtime.orchestrator.finalizeAndSummarizeChapter({
      projectId,
      chapterNo: 2,
      title: '暗渠脱身',
    });

    // Build Chapter 3 where 茶博士 speaks actively at the start & 沈澜 enters 太常寺旧库 acquiring 秘档残卷
    await runtime.orchestrator.generateChapterFromChoice(projectId, 3, {
      customAuthorInput: '茶博士在太常寺侧门接应沈澜潜入旧库，寻获秘档残卷。',
      wakeCat: false,
    });
    const ch3Text =
      '三更梆响，太常寺侧门槐树下，茶博士开口道：“巡夜卫刚换岗，快随我进旧库！”沈澜点头疾入，在尘封铁匣中取出「秘档残卷」。'.repeat(
        2,
      );
    await runtime.orchestrator.submitChapterDraft({
      projectId,
      chapterNo: 3,
      authorCatId: 'kimi',
      title: '旧库秘档',
      draftKind: 'copilot',
      content: ch3Text,
      proposedStateDelta: {
        characterUpdates: [{ characterId: 'shen-lan', addInventory: ['秘档残卷'], locationId: 'imperial-archive' }],
        newCharacters: [],
        newLocations: [
          {
            id: 'imperial-archive',
            name: '太常寺旧库',
            status: 'intact',
            description: '存放旧年卷宗的密库',
            atmosphereTags: ['尘封'],
            connectedLocationIds: [],
            lastUpdatedChapter: 3,
          },
        ],
        locationUpdates: [],
        newFacts: [],
        plantedForeshadowings: [],
        resolvedForeshadowingIds: [],
        worldbuildingAdditions: ['太常寺旧库由三重铜锁封存历年密卷'],
        mechanicsStatChanges: [],
      },
    });
    await runtime.orchestrator.finalizeAndSummarizeChapter({
      projectId,
      chapterNo: 3,
      title: '旧库秘档',
    });

    // 6. Backtrack Mode A ('in_place_bridge'): Regenerate completed Chapter 2 while keeping Chapter 3!
    const ch2Backtrack = await runtime.orchestrator.requestChapterDirections(projectId, 2, {
      authorSeedHint: '把第二章改得更惨烈：茶博士断后战死',
      backtrackMode: 'in_place_bridge',
      wakeCat: false,
    });

    // Must ONLY see Snapshot #1 canon (no Chapter 3 '秘档残卷' or '太常寺旧库' leaked into Ch.2 start!)
    assert.ok(!ch2Backtrack.contextPacket.canonAtChapterStart.locations.some((l) => l.id === 'imperial-archive'));
    assert.ok(
      !ch2Backtrack.contextPacket.canonAtChapterStart.characters
        .find((c) => c.id === 'shen-lan')
        ?.inventory.includes('秘档残卷'),
    );
    // Must inject BOTH Chapter 1 ending excerpt AND Chapter 3 opening bridge constraint!
    assert.match(ch2Backtrack.contextPacket.previousChapterTailExcerpt, /枯井方向/);
    assert.ok(ch2Backtrack.contextPacket.downstreamBridge);
    assert.equal(ch2Backtrack.contextPacket.downstreamBridge.nextChapterNo, 3);
    assert.match(ch2Backtrack.contextPacket.downstreamBridge.nextOpeningExcerpt, /茶博士开口道/);
    // Old Chapter 2 v1 preserved in versionHistory!
    assert.equal(ch2Backtrack.chapterRecord.versionHistory.length, 1);
    const v1VersionId = ch2Backtrack.chapterRecord.versionHistory[0]?.versionId ?? '';
    assert.ok(v1VersionId);

    // Suppose new Chapter 2 kills 茶博士 -> finalizing Chapter 2 replays snapshots & flags a hard conflict with Chapter 3!
    const ch2DraftV2 =
      '后巷暴雨倾盆，十余名玄衣卫铁网合围。茶博士为掩护沈澜突围，胸口连中三刀倒在血泊中气绝身亡，沈澜含恨跃入暗渠独自遁走。'.repeat(
        2,
      );
    await runtime.orchestrator.submitChapterDraft({
      projectId,
      chapterNo: 2,
      authorCatId: 'kimi',
      title: '血染后巷',
      draftKind: 'copilot',
      content: ch2DraftV2,
      proposedStateDelta: {
        characterUpdates: [{ characterId: 'tea-elder', status: 'dead' }],
        newCharacters: [],
        newLocations: [],
        locationUpdates: [],
        newFacts: [],
        plantedForeshadowings: [],
        resolvedForeshadowingIds: [],
        worldbuildingAdditions: [],
        mechanicsStatChanges: [],
      },
    });
    const afterCh2Conflict = await runtime.orchestrator.finalizeAndSummarizeChapter({
      projectId,
      chapterNo: 2,
      title: '血染后巷',
    });
    assert.ok(
      afterCh2Conflict.project.continuityAlerts.some(
        (a) => a.fromChapterNo === 2 && a.toChapterNo === 3 && a.severity === 'conflict',
      ),
    );
    assert.equal(afterCh2Conflict.project.chapters['3']?.continuityAlert?.severity, 'conflict');

    // Restore Chapter 2 back to v1 -> conflict alert is automatically resolved and 茶博士 is alive again!
    const restoredBundle = runtime.orchestrator.restoreChapterVersion(projectId, 2, v1VersionId);
    assert.equal(restoredBundle.canon.characters.find((c) => c.id === 'tea-elder')?.status, 'alive');
    assert.ok(!restoredBundle.project.continuityAlerts.some((a) => a.severity === 'conflict'));

    // 7. Backtrack Mode B ('rewind_truncate'): Rewind from Chapter 2 to start a brand-new storyline branch!
    const rewound = await runtime.orchestrator.requestChapterDirections(projectId, 2, {
      authorSeedHint: '换一条全新支线：不去太常寺，直接乘漕船南下金陵',
      backtrackMode: 'rewind_truncate',
      wakeCat: false,
    });
    assert.equal(rewound.project.archivedBranches.length, 1);
    assert.deepEqual(
      rewound.project.archivedBranches[0]?.chapters.map((c) => c.chapterNo),
      [2, 3],
    );
    assert.equal(rewound.project.chapters['3'], undefined);
    assert.equal(rewound.contextPacket.downstreamBridge, undefined);
    const afterRewindBundle = runtime.projectStore.loadBundle(projectId);
    assert.ok(afterRewindBundle);
    assert.ok(!afterRewindBundle.canon.locations.some((l) => l.id === 'imperial-archive'));
    assert.ok(!afterRewindBundle.project.rollingSynopsisMarkdown.includes('旧库秘档'));
  });
});
