import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { createNovelStudioRuntime, type ThreadCoordinatorPort } from '../../src/domains/novel-studio/index.js';

describe('Clowder-Novel 0-7 Simple Guided Wizard Flow End-to-End', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'clowder-novel-simple-flow-'));
  const dispatches: Array<{ threadId: string; targetCatId: string; markdown: string }> = [];

  const mockCoordinator: ThreadCoordinatorPort = {
    async ensureEditorialThread({ existingThreadId }) {
      return existingThreadId ?? 'thread-simple-flow-01';
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

  it('executes Steps 0 -> 7: module references, settings + first-3-chapters dissection, repeatable 5x5 outlines, revisions, De-AI page, and final product export', async () => {
    // Step 0: Import two reference novels (Book A for plot_arc, Book B for battle_action & prose_style)
    const bookPlot = await runtime.ingestAndIndexBook({
      title: '迷雾诡局录',
      author: '作者甲',
      fileName: 'plot-book.txt',
      buffer: Buffer.from(
        '第一章 悬案初现\n雨夜古钟无风自鸣，巡检司密探掀开棺盖，里面竟躺着本该在百里外的钦差腰牌！线索环环相扣，步步设局。',
        'utf8',
      ),
    });
    const bookBattle = await runtime.ingestAndIndexBook({
      title: '霜刃破军传',
      author: '作者乙',
      fileName: 'battle-book.txt',
      buffer: Buffer.from(
        '第一章 窄巷断刀\n横刀擦着青砖迸出火星，他矮身错步避开重劈，肘击敌胸顺势夺刃反刺，三息之内决出死生。',
        'utf8',
      ),
    });
    assert.ok(bookPlot && bookBattle);

    // Step 1: Create Novel
    const created = runtime.projectStore.createProject({
      title: '夜巡长安令',
      genre: '古风悬疑',
      catRoster: {
        chiefEditorCatId: 'opus',
        architectCatId: 'opus',
        writerCatId: 'kimi',
        criticCatId: 'codex',
      },
    });
    const projectId = created.project.id;

    // Step 2: Select Reference Novels per Module (auto-compiles & mounts Book-to-Skill packages!)
    const afterBind = runtime.orchestrator.bindModuleReferences(projectId, [
      { dimension: 'plot_arc', referenceBookIds: [bookPlot.id] },
      { dimension: 'battle_action', referenceBookIds: [bookBattle.id] },
      { dimension: 'prose_style', referenceBookIds: [bookBattle.id] },
    ]);
    const plotBind = afterBind.dimensionBindings.find((b) => b.dimension === 'plot_arc');
    const battleBind = afterBind.dimensionBindings.find((b) => b.dimension === 'battle_action');
    assert.equal(plotBind?.skillSlugs.length, 1);
    assert.equal(battleBind?.skillSlugs.length, 1);

    // Step 3: User submits ONE Settings input + ONE First-3-Chapters input -> Multi-Cat Dissection
    const rawSettings = [
      '世界观：大周永夜三年，长安宵禁后由不良人执掌铜鱼灯巡查诡案。',
      '主角：顾慎（不良帅旧部，性格冷硬少言，佩断雪刀，追查旧年火焚案）',
      '配角：苏晚（太医署验尸女官，擅长辨毒与微痕勘验）',
    ].join('\n');

    const rawFirstThreeChapters = [
      '第一章 铜鱼夜灯\n暮鼓敲罢第一百零八声，朱雀大街尽数落锁。顾慎提着铜鱼灯踏过积水，在西市石桥下发现一具手指染着青黛异香的无名尸首。',
      '第二章 太医女官\n苏晚用银针挑开死者衣领，借灯火看清锁骨处的莲花烙印。“这不是寻常剧毒，是宫中早已禁绝的浮生散。”她抬头望向顾慎。',
      '第三章 坊门暗箭\n两人携证物行至崇仁坊木门前，暗处冷箭破空钉入梁柱，箭尾绑着半张写有“平康坊旧宅子时见”的血字油纸！',
    ].join('\n\n');

    const afterOnboard = await runtime.orchestrator.submitOnboardingInputs(projectId, {
      rawUserSettingsInput: rawSettings,
      rawOpeningChaptersInput: rawFirstThreeChapters,
      wakeCats: true,
    });
    assert.equal(afterOnboard.project.seedChapterCount, 3);
    // Next chapter automatically advances to Chapter 4!
    assert.equal(afterOnboard.project.currentChapterNo, 4);
    assert.equal(afterOnboard.project.chapters['1']?.isSeedChapter, true);
    assert.equal(afterOnboard.project.chapters['3']?.title, '坊门暗箭');
    assert.equal(afterOnboard.project.dissectionReport?.status, 'analyzing');
    assert.ok(dispatches.some((d) => d.targetCatId === 'opus' && d.markdown.includes('Step 3')));

    // Multi-cat team submits rich SettingDissectionReport
    const afterDissection = runtime.orchestrator.saveSettingDissection(projectId, {
      report: {
        worldAndRulesSummary: '长安宵禁铜鱼灯制度与宫廷禁药浮生散暗线交织。',
        coreConflictAndArc: '顾慎与苏晚顺着血字油纸追查平康坊旧宅幕后真凶。',
        characters: [
          {
            name: '顾慎',
            role: 'protagonist',
            traitsAndVoice: '冷硬果决，刀快话少',
            currentStatusAndGoal: '持血字油纸准备夜探平康坊旧宅',
          },
          {
            name: '苏晚',
            role: 'deuteragonist',
            traitsAndVoice: '冷静细致，善验奇毒',
            currentStatusAndGoal: '协助追查浮生散流出来源',
          },
        ],
        plantedHooks: ['死者锁骨莲花烙印', '浮生散宫廷禁药', '平康坊旧宅子时之约'],
        authorNativeStyleNotes: '第三人称限知，冷峻短句为主，重环境声光细节。',
        nextChapterBridgeAnchor: '第3章末两人拿到血字油纸，即将赶赴平康坊旧宅子时之约。',
        analyzedByCats: ['opus', 'kimi'],
      },
    });
    assert.equal(afterDissection.project.dissectionReport?.status, 'ready');
    assert.equal(afterDissection.canon.characters.length, 2);

    // Step 4A: Propose 5 Macro Directions for Chapter 4 (and verify repeatability!)
    await runtime.orchestrator.ideateChapterMacroDirections(projectId, 4, { wakeCats: true });
    runtime.orchestrator.saveChapterMacroDirections(
      projectId,
      4,
      [1, 2, 3, 4, 5].map((n) => ({
        optionId: `m1-${n}`,
        title: `第一批大纲方向 ${n}`,
        summary: `初版平康坊剧情走向 ${n}`,
        conflictHighlight: '试探交锋',
        endingHook: '暗门开启',
      })),
    );
    // User isn't satisfied -> re-rolls with feedbackHint!
    const rerolledMacro = await runtime.orchestrator.ideateChapterMacroDirections(projectId, 4, {
      feedbackHint: '希望旧宅是个引君入瓮的空城计陷阱',
      wakeCats: true,
    });
    assert.equal(rerolledMacro.project.chapters['4']?.stage, 'ideating_directions');

    const savedMacros = runtime.orchestrator.saveChapterMacroDirections(
      projectId,
      4,
      [1, 2, 3, 4, 5].map((n) => ({
        optionId: `m2-${n}`,
        title: `空城计大纲方案 ${n}`,
        summary: `顾慎与苏晚潜入平康坊废宅，识破火油伏击圈 ${n}`,
        conflictHighlight: '窄廊破伏击',
        endingHook: '地道深处摆着三年前旧案卷宗',
      })),
    );
    assert.equal(savedMacros.stage, 'selecting_direction');
    assert.equal(savedMacros.macroDirections.length, 5);

    // Step 4B: User selects 'm2-2' -> Propose 5 Detailed Beat Outlines
    const beatIdeate = await runtime.orchestrator.ideateChapterDetailedOutlines(projectId, 4, {
      selectedDirectionId: 'm2-2',
      feedbackHint: '前两拍写苏晚闻出火油味，第三拍顾慎窄巷夺刀反杀',
      wakeCats: true,
    });
    assert.equal(beatIdeate.project.chapters['4']?.stage, 'ideating_beats');

    const savedBeats = runtime.orchestrator.saveChapterDetailedOutlines(
      projectId,
      4,
      [1, 2, 3, 4, 5].map((n) => ({
        optionId: `beat-opt-${n}`,
        parentDirectionId: 'm2-2',
        title: `旧宅火油局·细纲版 ${n}`,
        pacingNote: '先抑后扬，短兵快打',
        openingConnection: '承接坊门暗箭油纸，子时翻墙入旧宅',
        sceneBeats: [
          {
            order: 1,
            sceneSummary: '潜入荒院，苏晚嗅出梁上桐油异味',
            craftDimension: 'plot_arc',
            detailFocus: '嗅觉伏笔',
          },
          {
            order: 2,
            sceneSummary: '伏兵放箭点火，顾慎窄廊错步夺刀破局',
            craftDimension: 'battle_action',
            detailFocus: '短兵地形借力',
          },
        ],
        endingCliffhanger: '掀开枯井铁盖露出暗格密卷',
      })),
    );
    assert.equal(savedBeats.stage, 'selecting_beats');
    assert.equal(savedBeats.detailedOutlineOptions.length, 5);

    // Step 4C: User selects 'beat-opt-1' -> Execute Chapter 4 Draft!
    const execBundle = await runtime.orchestrator.executeChapterFromDetailedOutline(projectId, 4, {
      selectedDetailedOutlineId: 'beat-opt-1',
      wakeCats: true,
    });
    assert.equal(execBundle.project.chapters['4']?.stage, 'drafting');
    // Mounts plot_arc + battle_action + prose_style skills automatically!
    assert.equal(execBundle.project.chapters['4']?.activeSkillSlugs.length, 3);

    // Writer cat submits initial draft (intentionally containing a couple of AI clichés to test Step 6!)
    const initialDraft =
      '子时更声刚落，平康坊旧宅荒草没膝。苏晚指尖沾了点窗棂水迹，轻声道：“是桐油。”顾慎嘴角勾起一抹不易察觉的弧度，眼中闪过一丝寒芒，横刀瞬间出鞘斩落三支火箭，反手夺过伏兵铁尺撞开暗门！空气在这一刻仿佛凝固了一般。他知道，这仅仅只是一个开始。';
    await runtime.orchestrator.submitChapterDraft({
      projectId,
      chapterNo: 4,
      authorCatId: 'kimi',
      title: '旧宅火油',
      draftKind: 'copilot',
      content: initialDraft,
    });

    // Step 5: Repeatable Human Suggestions & Adjustments (2 rounds + verify history!)
    await runtime.orchestrator.applyHumanRevisionSuggestion(projectId, 4, {
      suggestion: '补充暗门后发现半枚焦黑官印的细节',
      wakeCats: true,
    });
    const revisedDraft =
      '子时更声刚落，平康坊旧宅荒草没膝。苏晚嗅出窗棂桐油味示警。顾慎嘴角勾起一抹不易察觉的弧度，眼中闪过一丝寒芒，错步欺身夺刃震退两名死士，劈开暗门木锁，只见石台上赫然摆着半枚焦黑的太常寺官印！空气在这一刻仿佛凝固了一般。';
    await runtime.orchestrator.submitChapterDraft({
      projectId,
      chapterNo: 4,
      authorCatId: 'kimi',
      title: '旧宅火油',
      draftKind: 'copilot',
      content: revisedDraft,
    });
    const afterRev = runtime.projectStore.loadBundle(projectId);
    assert.equal(afterRev?.project.chapters['4']?.revisionHistory.length, 1);
    assert.match(afterRev?.project.chapters['4']?.revisionHistory[0]?.revisedContent ?? '', /太常寺官印/);

    // Step 6: De-AI Optimization Page (diagnoses AI clichés & polishes!)
    const afterHumanizeTrigger = await runtime.orchestrator.runDeAiOptimization(projectId, 4, {
      extraToneHint: '去掉五官套话，保持冷峻短句',
      wakeCats: true,
    });
    const reportBefore = afterHumanizeTrigger.project.chapters['4']?.humanizerReport;
    assert.ok(reportBefore && reportBefore.flags.length >= 2);

    const cleanHumanizedText =
      '子时更声刚落，平康坊旧宅荒草没膝。苏晚指尖捻过窗棂油迹，低声示警：“是火油。”顾慎一言不发，断雪刀斜撩劈碎三支火矢，矮身错步撞入廊下，反夺死士铁尺砸开暗门铜锁——石台积灰之上，静静躺着半枚烧焦的太常寺官印。';
    await runtime.orchestrator.submitChapterDraft({
      projectId,
      chapterNo: 4,
      authorCatId: 'codex',
      draftKind: 'humanized',
      content: cleanHumanizedText,
    });
    const afterHumanized = runtime.projectStore.loadBundle(projectId);
    assert.equal(afterHumanized?.project.chapters['4']?.stage, 'humanized_ready');
    // Pre-humanized text preserved in rawDraft for side-by-side comparison!
    assert.match(afterHumanized?.project.chapters['4']?.rawDraft ?? '', /不易察觉的弧度/);
    assert.equal(afterHumanized?.project.chapters['4']?.humanizedDraft, cleanHumanizedText);

    // Step 7: User edits final product, finalizes Chapter 4, advances to Chapter 5, and exports whole book (Ch 1..4)!
    const userPolishedFinal = `${cleanHumanizedText}\n苏晚举起铜鱼灯照向官印缺口，轻声道：“是三年前失踪的那一枚。”`;
    const finalized = await runtime.orchestrator.finalizeChapterProduct(projectId, 4, {
      title: '火油暗印',
      finalText: userPolishedFinal,
      advanceToNextChapter: true,
    });
    assert.equal(finalized.project.chapters['4']?.stage, 'completed');
    assert.equal(finalized.project.currentChapterNo, 5);
    assert.equal(finalized.project.activeWizardStep, 'generate');

    const exported = runtime.projectStore.exportManuscript(projectId, 'md');
    assert.match(exported.content, /第1章 铜鱼夜灯/);
    assert.match(exported.content, /第2章 太医女官/);
    assert.match(exported.content, /第3章 坊门暗箭/);
    assert.match(exported.content, /第4章 火油暗印/);
    assert.match(exported.content, /三年前失踪的那一枚/);
  });
});
