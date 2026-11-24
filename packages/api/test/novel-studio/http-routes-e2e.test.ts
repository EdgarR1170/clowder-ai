import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import Fastify from 'fastify';
import { InvocationRegistry } from '../../src/domains/cats/services/agents/invocation/InvocationRegistry.js';
import { createNovelStudioRuntime } from '../../src/domains/novel-studio/index.js';
import { callbackNovelStudioRoutes, novelStudioRoutes } from '../../src/routes/novel-studio-routes.js';

describe('Clowder-Novel: REST & MCP Callback HTTP Routes End-to-End', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'clowder-novel-http-'));
  const runtime = createNovelStudioRuntime({
    workspaceRoot: tempRoot,
    dataDir: join(tempRoot, 'data', 'novel-studio'),
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

    await app.close();
  });
});
