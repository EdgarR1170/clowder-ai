import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import Fastify from 'fastify';
import { InvocationQueue } from '../../src/domains/cats/services/agents/invocation/InvocationQueue.js';
import { InvocationRegistry } from '../../src/domains/cats/services/agents/invocation/InvocationRegistry.js';
import { InvocationTracker } from '../../src/domains/cats/services/agents/invocation/InvocationTracker.js';
import { ThreadStore } from '../../src/domains/cats/services/stores/ports/ThreadStore.js';
import { createNovelStudioRuntime } from '../../src/domains/novel-studio/index.js';
import {
  callbackNovelStudioRoutes,
  createClowderThreadCoordinator,
  novelStudioRoutes,
} from '../../src/routes/novel-studio-routes.js';

describe('Clowder-Novel: REST & MCP Callback HTTP Routes End-to-End', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'clowder-novel-http-'));
  const threadStore = new ThreadStore();
  const invocationQueue = new InvocationQueue();
  const invocationTracker = new InvocationTracker();
  const drainedThreads: string[] = [];
  const queueProcessor = {
    async requestDrain(threadId: string) {
      drainedThreads.push(threadId);
    },
  };
  const runtime = createNovelStudioRuntime({
    workspaceRoot: tempRoot,
    dataDir: join(tempRoot, 'data', 'novel-studio'),
    threadCoordinator: createClowderThreadCoordinator({
      threadStore,
      invocationQueue,
      invocationTracker,
      queueProcessor,
      ownerUserId: 'edgar',
    }),
  });
  const registry = new InvocationRegistry();

  after(() => {
    runtime.close();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('serves browser studio flow and authenticated multi-cat MCP callbacks end-to-end', async () => {
    const app = Fastify();
    await app.register(novelStudioRoutes, {
      runtime,
      threadStore,
      invocationQueue,
      invocationTracker,
      queueProcessor,
      defaultOwnerUserId: 'edgar',
    });
    await app.register(callbackNovelStudioRoutes, {
      runtime,
      registry,
    });
    await app.ready();

    // 1. Upload reference book via REST API
    const sampleText =
      '第一章 寒江独钓\n江雪纷飞，老叟握紧结满白霜的青竹竿，在风雪交加的寂静江面上等待水底巨物的第一丝震颤。寒鸦掠过枯苇，远处渡口的灯笼在狂风中忽明忽暗，映出江心一叶孤舟的剪影。\n\n第二章 破冰一剑\n剑气冲霄破开三尺寒冰，他踏浪疾进，铁靴震碎浮冰，迎着漫天风雪一剑斩断横江铁索，水花如万点寒星炸裂开来！';
    const uploadRes = await app.inject({
      method: 'POST',
      url: '/api/novel-studio/books/upload',
      remoteAddress: '127.0.0.1',
      payload: {
        title: '寒江剑典',
        author: '测试作者',
        fileName: 'river-sword.txt',
        contentBase64: Buffer.from(sampleText, 'utf8').toString('base64'),
        autoEmbed: true,
      },
    });
    assert.equal(uploadRes.statusCode, 200);
    const uploadedBook = (uploadRes.json() as { book: { id: string; chapterCount: number } }).book;
    assert.equal(uploadedBook.chapterCount, 2);

    // 2. Distill Book-to-Skill via REST API
    const distillRes = await app.inject({
      method: 'POST',
      url: `/api/novel-studio/books/${uploadedBook.id}/distill-skill`,
      remoteAddress: '127.0.0.1',
      payload: {
        dimension: 'scene_atmosphere',
        slug: 'craft-river-atmosphere',
      },
    });
    assert.equal(distillRes.statusCode, 200);

    // 3. Create project, bind matrix, add Chapter 1 outline
    const projRes = await app.inject({
      method: 'POST',
      url: '/api/novel-studio/projects',
      remoteAddress: '127.0.0.1',
      payload: {
        title: '雪夜听剑录',
        genre: '古典武侠',
        premise: '雪夜孤舟上的江湖迷局',
        createEditorialThread: false,
      },
    });
    assert.equal(projRes.statusCode, 200);
    const projectId = (projRes.json() as { project: { id: string } }).project.id;

    await app.inject({
      method: 'PUT',
      url: `/api/novel-studio/projects/${projectId}/matrix`,
      remoteAddress: '127.0.0.1',
      payload: {
        dimensionBindings: [
          {
            dimension: 'scene_atmosphere',
            skillSlugs: ['craft-river-atmosphere'],
            referenceBookIds: [uploadedBook.id],
            ragWeight: 0.85,
            ragMode: 'structural_beats',
          },
        ],
      },
    });

    await app.inject({
      method: 'PUT',
      url: `/api/novel-studio/projects/${projectId}/outlines`,
      remoteAddress: '127.0.0.1',
      payload: {
        chapterOutlines: [
          {
            chapterNo: 1,
            volumeNo: 1,
            title: '风雪渡口',
            goal: '在渡口客栈接头',
            conflict: '渡船被神秘剑客封锁',
            outcome: '识破伪装',
            hook: '蓑衣下露出一截断剑',
            povCharacterId: '',
            targetWords: 2800,
            beats: [
              {
                beatIndex: 1,
                summary: '渡口寒江暮雪氛围铺垫',
                primaryDimension: 'scene_atmosphere',
                secondaryDimensions: [],
                castIds: [],
                locationId: 'ferry',
                ragQueryHint: '风雪寒江孤舟',
                targetWords: 2800,
              },
            ],
            foreshadowingToPlant: [],
            foreshadowingToPayoff: [],
          },
        ],
      },
    });

    // 4. Issue real InvocationRegistry credentials for Writer ('kimi') and Critic ('codex')
    const writerAuth = await registry.create('edgar', 'kimi', 'thread-test-1');
    const criticAuth = await registry.create('edgar', 'codex', 'thread-test-1');

    // MCP precheck-chapter
    const precheckRes = await app.inject({
      method: 'POST',
      url: '/api/callbacks/novel-studio/precheck-chapter',
      headers: {
        'x-invocation-id': writerAuth.invocationId,
        'x-callback-token': writerAuth.callbackToken,
      },
      payload: { projectId, chapterNo: 1 },
    });
    assert.equal(precheckRes.statusCode, 200);

    // MCP submit-draft by Writer ('kimi')
    const submitRes = await app.inject({
      method: 'POST',
      url: '/api/callbacks/novel-studio/submit-draft',
      headers: {
        'x-invocation-id': writerAuth.invocationId,
        'x-callback-token': writerAuth.callbackToken,
      },
      payload: {
        projectId,
        chapterNo: 1,
        draftKind: 'raw',
        content:
          '暮雪压低了渡口的芦苇，寒江水拍打着斑驳木桩。沈舟推开客栈挂满冰霜的木门，火盆里的炭火噼啪炸开一粒火星，映出角落蓑衣客腰间半截断裂的青霜古剑。'.repeat(
            2,
          ),
      },
    });
    assert.equal(submitRes.statusCode, 200);

    // MCP evaluate-chapter by Critic ('codex')
    const evalRes = await app.inject({
      method: 'POST',
      url: '/api/callbacks/novel-studio/evaluate-chapter',
      headers: {
        'x-invocation-id': criticAuth.invocationId,
        'x-callback-token': criticAuth.callbackToken,
      },
      payload: {
        projectId,
        chapterNo: 1,
        proseScores: {
          showDontTell: 0.88,
          characterVoice: 0.82,
          craftSkillFidelity: 0.9,
          cadenceAndVariety: 0.85,
          goalAndHook: 0.89,
          rewriteDirectives: [],
        },
        pacingScores: {
          tensionMomentum: 0.84,
          infoDensity: 0.82,
          emotionalOscillation: 0.8,
          arcProgression: 0.85,
          readerFatigueGuard: 0.88,
          pacingGuidance: '',
        },
        summaryCritique: '五感锚点扎实，章末断剑钩子干脆，准予定稿！',
      },
    });
    assert.equal(evalRes.statusCode, 200);
    assert.equal((evalRes.json() as { report: { verdict: string } }).report.verdict, 'approved');

    // Approve & export via REST API
    const approveRes = await app.inject({
      method: 'POST',
      url: `/api/novel-studio/projects/${projectId}/chapters/1/approve`,
      remoteAddress: '127.0.0.1',
      payload: { wakeNextChapter: false },
    });
    assert.equal(approveRes.statusCode, 200);

    const exportRes = await app.inject({
      method: 'GET',
      url: `/api/novel-studio/projects/${projectId}/export?format=txt`,
      remoteAddress: '127.0.0.1',
    });
    assert.equal(exportRes.statusCode, 200);
    assert.match((exportRes.json() as { content: string }).content, /风雪渡口/);

    // 5. Verify HTTP Emergency Pause (withdraws real private_input Queue entries + cancels active InvocationTracker slots) + Outline Edit/Delete + Reset
    await app.inject({
      method: 'PUT',
      url: `/api/novel-studio/projects/${projectId}/outlines`,
      remoteAddress: '127.0.0.1',
      payload: {
        chapterOutlines: [
          {
            chapterNo: 2,
            volumeNo: 1,
            title: '雪夜追踪',
            goal: '顺着血迹追查断剑客',
            conflict: '风雪掩盖踪迹',
            outcome: '发现破庙暗门',
            hook: '暗门内传来铁链声',
            povCharacterId: '',
            targetWords: 3000,
            beats: [
              {
                beatIndex: 1,
                summary: '雪林追踪',
                primaryDimension: 'scene_atmosphere',
                secondaryDimensions: [],
                castIds: [],
                locationId: 'woods',
                ragQueryHint: '风雪脚印',
                targetWords: 3000,
              },
            ],
            foreshadowingToPlant: [],
            foreshadowingToPayoff: [],
          },
          {
            chapterNo: 3,
            volumeNo: 1,
            title: '多余草稿章',
            goal: '待删除',
            conflict: '无',
            outcome: '无',
            hook: '无',
            povCharacterId: '',
            targetWords: 2000,
            beats: [
              {
                beatIndex: 1,
                summary: '临时占位',
                primaryDimension: 'plot_arc',
                secondaryDimensions: [],
                castIds: [],
                locationId: '',
                ragQueryHint: '',
                targetWords: 2000,
              },
            ],
            foreshadowingToPlant: [],
            foreshadowingToPayoff: [],
          },
        ],
      },
    });

    // Enable auto-continuous starting from Chapter 2 -> creates real editorial thread & enqueues private_input to @opus
    const autoRes = await app.inject({
      method: 'POST',
      url: `/api/novel-studio/projects/${projectId}/auto-continuous`,
      remoteAddress: '127.0.0.1',
      payload: { enabled: true, maxChapters: 2, startFromChapterNo: 2 },
    });
    assert.equal(autoRes.statusCode, 200);
    const linkedThreadId = (autoRes.json() as { project: { threadId: string } }).project.threadId;
    assert.ok(linkedThreadId);
    assert.equal(invocationQueue.list(linkedThreadId, 'edgar').length, 1);

    // Simulate an active running cat ('kimi') in InvocationTracker on that editorial thread
    const activeController = invocationTracker.start(linkedThreadId, 'kimi', 'edgar');
    assert.equal(activeController.signal.aborted, false);

    // Operator hits POST /pause -> aborts 'kimi', withdraws private_input queue entry, pauses Ch.2!
    const pauseRes = await app.inject({
      method: 'POST',
      url: `/api/novel-studio/projects/${projectId}/pause`,
      remoteAddress: '127.0.0.1',
      payload: {},
    });
    assert.equal(pauseRes.statusCode, 200);
    const pauseJson = pauseRes.json() as {
      pausedChapterNos: number[];
      cancelledCats: string[];
      withdrawnQueueCount: number;
      project: { workflow: { approvalMode: string }; chapters: Record<string, { stage: string }> };
    };
    assert.deepEqual(pauseJson.pausedChapterNos, [2]);
    assert.deepEqual(pauseJson.cancelledCats, ['kimi']);
    assert.equal(pauseJson.withdrawnQueueCount, 1);
    assert.equal(activeController.signal.aborted, true);
    assert.equal(invocationQueue.list(linkedThreadId, 'edgar').length, 0);
    assert.equal(pauseJson.project.workflow.approvalMode, 'chapter-gate');
    assert.equal(pauseJson.project.chapters['2']?.stage, 'paused');

    // Delete Chapter 3 outline & reset-restart Chapter 2 after editing outline
    const delOutlineRes = await app.inject({
      method: 'DELETE',
      url: `/api/novel-studio/projects/${projectId}/outlines/3`,
      remoteAddress: '127.0.0.1',
    });
    assert.equal(delOutlineRes.statusCode, 200);
    assert.equal(
      (delOutlineRes.json() as { project: { chapterOutlines: unknown[] } }).project.chapterOutlines.length,
      2,
    );

    const restartRes = await app.inject({
      method: 'POST',
      url: `/api/novel-studio/projects/${projectId}/chapters/2/start`,
      remoteAddress: '127.0.0.1',
      payload: { wakeCatsInThread: true, resetExistingDraft: true },
    });
    assert.equal(restartRes.statusCode, 200);
    assert.equal(
      (restartRes.json() as { bundle: { project: { chapters: Record<string, { stage: string }> } } }).bundle.project
        .chapters['2']?.stage,
      'drafting',
    );

    await app.close();
  });

  it('serves the human-guided Chapter Co-Pilot REST & MCP callback endpoints end-to-end', async () => {
    const app = Fastify();
    await app.register(novelStudioRoutes, {
      runtime,
      threadStore,
      invocationQueue,
      invocationTracker,
      queueProcessor,
      defaultOwnerUserId: 'edgar',
    });
    await app.register(callbackNovelStudioRoutes, {
      runtime,
      registry,
    });
    await app.ready();

    // 1. Create Co-Pilot project with initial master outline
    const createRes = await app.inject({
      method: 'POST',
      url: '/api/novel-studio/projects',
      remoteAddress: '127.0.0.1',
      payload: {
        title: '雾海灯塔纪',
        genre: '蒸汽奇幻',
        authorMasterOutlineMarkdown: '守塔人陆鸣在雾海第7号灯塔拾获会说话的发条罗盘，逐步揭开海底古都遗迹。',
        copilotCatId: 'kimi',
        createEditorialThread: true,
      },
    });
    assert.equal(createRes.statusCode, 200);
    const projectId = (createRes.json() as { project: { id: string } }).project.id;

    // 2. Request 5 directions via POST /chapters/1/ideate
    const ideateRes = await app.inject({
      method: 'POST',
      url: `/api/novel-studio/projects/${projectId}/chapters/1/ideate`,
      remoteAddress: '127.0.0.1',
      payload: { authorSeedHint: '暴风雨夜罗盘漂上灯塔礁石' },
    });
    assert.equal(ideateRes.statusCode, 200);
    assert.equal((ideateRes.json() as { chapterRecord: { stage: string } }).chapterRecord.stage, 'ideating');

    // 3. Co-Pilot Cat ('kimi') reads context (with zero legacy chapterOutlines!) & submits 5 directions via MCP callback
    const kimiAuth = await registry.create('edgar', 'kimi', 'thread-copilot-http');
    const ctxRes = await app.inject({
      method: 'POST',
      url: '/api/callbacks/novel-studio/read-context',
      headers: {
        'x-invocation-id': kimiAuth.invocationId,
        'x-callback-token': kimiAuth.callbackToken,
      },
      payload: { projectId, chapterNo: 1 },
    });
    assert.equal(ctxRes.statusCode, 200);
    assert.ok((ctxRes.json() as { copilotContextPacket: unknown }).copilotContextPacket);

    const submitDirsRes = await app.inject({
      method: 'POST',
      url: '/api/callbacks/novel-studio/submit-directions',
      headers: {
        'x-invocation-id': kimiAuth.invocationId,
        'x-callback-token': kimiAuth.callbackToken,
      },
      payload: {
        projectId,
        chapterNo: 1,
        options: [1, 2, 3, 4, 5].map((i) => ({
          optionId: `dir-${i}`,
          title: `推进方案 ${i}`,
          focusType: 'suspense_twist',
          pitch: `暴风雨夜的第 ${i} 种戏剧切入方式`,
          openingBeat: '巨浪拍击塔基',
          endingHook: '罗盘指针逆向飞旋',
          guidingQuestion: `关于方案 ${i}，你更倾向哪种悬念节奏？`,
        })),
      },
    });
    assert.equal(submitDirsRes.statusCode, 200);
    assert.equal((submitDirsRes.json() as { stage: string }).stage, 'awaiting_choice');

    // 4. Author selects dir-1 + custom input -> triggers generate -> Cat submits copilot draft -> Author finalizes -> Cat submits deep summary
    const genRes = await app.inject({
      method: 'POST',
      url: `/api/novel-studio/projects/${projectId}/chapters/1/generate`,
      remoteAddress: '127.0.0.1',
      payload: {
        selectedOptionIds: ['dir-1'],
        customAuthorInput: '让罗盘内部传出二十年前失踪老塔长的录音。',
      },
    });
    assert.equal(genRes.statusCode, 200);
    assert.equal((genRes.json() as { chapterRecord: { stage: string } }).chapterRecord.stage, 'drafting');

    const draftRes = await app.inject({
      method: 'POST',
      url: '/api/callbacks/novel-studio/submit-draft',
      headers: {
        'x-invocation-id': kimiAuth.invocationId,
        'x-callback-token': kimiAuth.callbackToken,
      },
      payload: {
        projectId,
        chapterNo: 1,
        title: '第7号灯塔的逆时针罗盘',
        draftKind: 'copilot',
        content:
          '狂暴的咸湿海雾撞在灯塔透镜上。陆鸣撬开搁浅木匣，铜制「发条罗盘」咔哒转动，竟传出失踪二十年的老塔长低哑的警告声！'.repeat(
            2,
          ),
      },
    });
    assert.equal(draftRes.statusCode, 200);
    assert.equal((draftRes.json() as { stage: string }).stage, 'draft_ready');

    const finalizeRes = await app.inject({
      method: 'POST',
      url: `/api/novel-studio/projects/${projectId}/chapters/1/finalize`,
      remoteAddress: '127.0.0.1',
      payload: { title: '逆时针罗盘', wakeCatForDeepSummary: true },
    });
    assert.equal(finalizeRes.statusCode, 200);

    const deepSummaryRes = await app.inject({
      method: 'POST',
      url: '/api/callbacks/novel-studio/submit-summary',
      headers: {
        'x-invocation-id': kimiAuth.invocationId,
        'x-callback-token': kimiAuth.callbackToken,
      },
      payload: {
        projectId,
        chapterNo: 1,
        summary: {
          title: '逆时针罗盘',
          oneLineSummary: '陆鸣在暴风雨夜拾获刻有老塔长警告录音的发条罗盘。',
          keyEvents: ['暴风雨袭击7号灯塔', '拾获搁浅发条罗盘', '触发二十年前警告录音'],
          characterChanges: ['陆鸣获得关键遗物发条罗盘'],
          newlyIntroducedSettings: ['第7号灯塔', '逆时针发条罗盘'],
          openingAnchor: '海雾撞击7号灯塔透镜',
          endingAnchor: '罗盘传出老塔长警告声',
        },
        worldbuildingAdditions: ['雾海航标局规章：第7号灯塔守塔人严禁私自下海打捞漂流物'],
      },
    });
    assert.equal(deepSummaryRes.statusCode, 200);

    const finalBundleRes = await app.inject({
      method: 'GET',
      url: `/api/novel-studio/projects/${projectId}`,
      remoteAddress: '127.0.0.1',
    });
    const finalBundle = finalBundleRes.json() as {
      project: { rollingSynopsisMarkdown: string; accumulatedWorldbuildingMarkdown: string };
    };
    assert.match(finalBundle.project.rollingSynopsisMarkdown, /逆时针罗盘/);
    assert.match(finalBundle.project.accumulatedWorldbuildingMarkdown, /雾海航标局规章/);

    await app.close();
  });
});
