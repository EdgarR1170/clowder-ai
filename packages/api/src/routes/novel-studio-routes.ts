import { randomUUID } from 'node:crypto';
import {
  catRegistry,
  chapterOutlineSchema,
  chapterStateDeltaSchema,
  dimensionSkillBindingSchema,
  distilledCraftSkillSchema,
  editorialCatRosterBindingSchema,
  invariantViolationSchema,
  mechanicsLedgerSchema,
  narrativeGraphSchema,
  novelCraftDimensionSchema,
  novelWorkflowConfigSchema,
  pacing5AxisScoreSchema,
  prose5AxisScoreSchema,
  storyArcSchema,
} from '@cat-cafe/shared';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { InvocationQueue } from '../domains/cats/services/agents/invocation/InvocationQueue.js';
import type { InvocationTracker } from '../domains/cats/services/agents/invocation/InvocationTracker.js';
import type { QueueProcessor } from '../domains/cats/services/agents/invocation/QueueProcessor.js';
import type { AnyMessageStore } from '../domains/cats/services/stores/factories/MessageStoreFactory.js';
import type { IThreadStore } from '../domains/cats/services/stores/ports/ThreadStore.js';
import {
  collectRegisteredRosterCandidates,
  resolveEditorialCatRoster,
} from '../domains/novel-studio/coordinator/editorial-roster.js';
import { resolveEditorialThreadWorkspace } from '../domains/novel-studio/coordinator/editorial-thread-workspace.js';
import type { NovelStudioRuntime, ThreadCoordinatorPort } from '../domains/novel-studio/index.js';
import { isDirectLoopbackRequest } from '../utils/loopback-request.js';
import { resolveUserId } from '../utils/request-identity.js';
import {
  type AgentKeyAuthRegistry,
  type CallbackAuthRegistry,
  registerCallbackAuthHook,
  requireCallbackPrincipal,
} from './callback-auth-prehandler.js';

export interface NovelStudioRoutesOptions {
  runtime: NovelStudioRuntime;
  threadStore?: IThreadStore;
  messageStore?: AnyMessageStore;
  invocationQueue?: InvocationQueue;
  invocationTracker?: Pick<InvocationTracker, 'cancelAll'>;
  queueProcessor?: Pick<QueueProcessor, 'requestDrain'> & Partial<Pick<QueueProcessor, 'unregisterEntryCompleteHook'>>;
  defaultOwnerUserId?: string;
}

export interface CallbackNovelStudioRoutesOptions {
  runtime: NovelStudioRuntime;
  registry: CallbackAuthRegistry;
  agentKeyRegistry?: AgentKeyAuthRegistry;
}

export function createClowderThreadCoordinator(deps: {
  threadStore: IThreadStore;
  messageStore?: AnyMessageStore;
  invocationQueue: InvocationQueue;
  invocationTracker?: Pick<InvocationTracker, 'cancelAll'>;
  queueProcessor: Pick<QueueProcessor, 'requestDrain'> & Partial<Pick<QueueProcessor, 'unregisterEntryCompleteHook'>>;
  ownerUserId: string;
}): ThreadCoordinatorPort {
  return {
    async ensureEditorialThread({ existingThreadId, title, catIds }) {
      if (existingThreadId) {
        const found = await deps.threadStore.get(existingThreadId);
        if (found) {
          if (catIds.length > 0) {
            try {
              await deps.threadStore.addParticipants(found.id, catIds as never[]);
            } catch {
              /* ignore participant sync error */
            }
          }
          return found.id;
        }
      }
      const created = await deps.threadStore.create(deps.ownerUserId, title);
      if (catIds.length > 0) {
        try {
          await deps.threadStore.addParticipants(created.id, catIds as never[]);
        } catch {
          /* ignore participant sync error */
        }
      }
      return created.id;
    },
    async dispatchToCat({ threadId, targetCatId, markdown }) {
      const enqueue = await deps.invocationQueue.enqueueDurable({
        from: { kind: 'system', service: 'novel-chief-orchestrator' },
        threadId,
        userId: deps.ownerUserId,
        kind: 'private_input',
        ownerAuthProvenance: 'strict',
        content: markdown,
        targetCats: [targetCatId as never],
        intent: 'execute',
        autoExecute: true,
        priority: 'normal',
        idempotencyKey: `novel-dispatch:${threadId}:${targetCatId}:${randomUUID()}`,
      });
      if (enqueue.outcome === 'enqueued') {
        await deps.queueProcessor.requestDrain(threadId);
      }
    },
    async abortEditorialThread(threadId) {
      let withdrawnQueueCount = 0;
      const candidates = deps.invocationQueue.list(threadId, deps.ownerUserId);
      for (const candidate of candidates) {
        if (candidate.status === 'processing') continue;
        const claimed = await deps.invocationQueue.claimQueuedEntryForWithdrawal(
          threadId,
          deps.ownerUserId,
          candidate.id,
        );
        if (!claimed) continue;
        try {
          const removed = await deps.invocationQueue.commitClaimedWithdrawal(threadId, claimed.id);
          if (removed) {
            withdrawnQueueCount += 1;
            deps.queueProcessor.unregisterEntryCompleteHook?.(claimed.id);
          } else {
            await deps.invocationQueue.restoreClaimedEntries(threadId, [claimed.id]);
          }
        } catch {
          await deps.invocationQueue.restoreClaimedEntries(threadId, [claimed.id]);
        }
      }
      const cancelled = deps.invocationTracker
        ? deps.invocationTracker.cancelAll(threadId, deps.ownerUserId, 'novel_operator_pause')
        : { catIds: [] };
      return {
        cancelledCats: cancelled.catIds,
        withdrawnQueueCount,
      };
    },
  };
}

function resolveOperatorId(request: FastifyRequest, fallbackUserId = 'owner'): string | null {
  const uid = resolveUserId(request);
  if (uid) return uid;
  if (isDirectLoopbackRequest(request)) return fallbackUserId;
  return null;
}

function sendError(reply: FastifyReply, err: unknown): { error: string } {
  const message = err instanceof Error ? err.message : String(err);
  const isNotFound = /not found/i.test(message);
  reply.status(isNotFound ? 404 : 400);
  return { error: message };
}

const DEFAULT_EDITORIAL_CATS = [
  {
    id: 'opus',
    name: '布偶猫',
    nickname: '宪宪',
    roleDescription: '总编统筹与大纲架构师，擅长全局节奏把控与多猫调度',
  },
  {
    id: 'kimi',
    name: '梵花猫',
    nickname: '墨墨',
    roleDescription: '首席长篇主笔与去AI味润色师，擅长细腻中文正文执笔',
  },
  {
    id: 'gemini',
    name: '暹罗猫',
    nickname: '烁烁',
    roleDescription: '战斗分镜与场景氛围导演，擅长高燃动作调度与五感景深',
  },
  {
    id: 'codex',
    name: '缅因猫',
    nickname: '砚砚',
    roleDescription: '铁面审校官与连续性守护者，五轴评分与防穿帮核查',
  },
  {
    id: 'glm52',
    name: '狸花猫',
    nickname: '小狸花',
    roleDescription: '世界观与数值机制考据官，负责面板算术与设定严密性',
  },
] as const;

export const novelStudioRoutes: FastifyPluginAsync<NovelStudioRoutesOptions> = async (app, opts) => {
  const { runtime } = opts;
  const fallbackUser = opts.defaultOwnerUserId ?? 'owner';

  app.addHook('preHandler', async (request, reply) => {
    const uid = resolveOperatorId(request, fallbackUser);
    if (!uid) {
      return reply.status(401).send({ error: 'Authentication required' });
    }
  });

  app.get('/api/novel-studio/overview', async () => {
    const registeredCats = Object.entries(catRegistry.getAllConfigs()).map(([id, c]) => ({
      id,
      name: c.name,
      nickname: c.nickname,
      roleDescription: c.roleDescription,
      color: c.color,
    }));
    const cats = registeredCats.length > 0 ? registeredCats : [...DEFAULT_EDITORIAL_CATS];
    return {
      books: runtime.corpusStore.listBooks(),
      skills: runtime.skillCompiler.listSkills(),
      projects: runtime.projectStore.listProjects(),
      embeddingConfig: runtime.embedRegistry.getConfig(),
      cats,
    };
  });

  app.put('/api/novel-studio/embedding-config', async (request, reply) => {
    try {
      const schema = z.object({
        provider: z.enum(['auto', 'clowder-local', 'openai-compatible', 'local-hash-vec', 'fts-only']).optional(),
        apiUrl: z.string().max(400).optional(),
        apiKey: z.string().max(400).optional(),
        model: z.string().max(160).optional(),
        dim: z.number().int().min(16).max(8192).optional(),
      });
      runtime.embedRegistry.updateConfig(schema.parse(request.body ?? {}));
      return { embeddingConfig: runtime.embedRegistry.getConfig() };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/novel-studio/books', async () => ({
    books: runtime.corpusStore.listBooks(),
  }));

  app.post('/api/novel-studio/books/upload', { bodyLimit: 48 * 1024 * 1024 }, async (request, reply) => {
    try {
      const body = z
        .object({
          title: z.string().min(1).max(200),
          author: z.string().max(120).optional(),
          fileName: z.string().min(1).max(240),
          contentBase64: z.string().min(4),
          autoEmbed: z.boolean().default(true),
        })
        .parse(request.body);
      const buffer = Buffer.from(body.contentBase64, 'base64');
      const book = await runtime.ingestAndIndexBook({
        title: body.title,
        author: body.author,
        fileName: body.fileName,
        buffer,
        autoEmbed: body.autoEmbed,
      });
      return { book };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/novel-studio/books/:bookId/chapters', async (request, reply) => {
    try {
      const { bookId } = z.object({ bookId: z.string().min(1) }).parse(request.params);
      const book = runtime.corpusStore.getBook(bookId);
      if (!book) {
        reply.status(404);
        return { error: `Book not found: ${bookId}` };
      }
      return { book, chapters: runtime.corpusStore.listBookChapters(bookId) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/novel-studio/books/:bookId/embed', async (request, reply) => {
    try {
      const { bookId } = z.object({ bookId: z.string().min(1) }).parse(request.params);
      const embedder = runtime.embedRegistry.resolveActiveEmbedder();
      if (!embedder) {
        throw new Error('Embedding provider is set to fts-only; switch to auto or openai-compatible first.');
      }
      const book = await runtime.corpusStore.embedBook(bookId, embedder);
      return { book };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/api/novel-studio/books/:bookId', async (request, reply) => {
    try {
      const { bookId } = z.object({ bookId: z.string().min(1) }).parse(request.params);
      const deleted = runtime.corpusStore.deleteBook(bookId);
      return { deleted };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/novel-studio/search', async (request, reply) => {
    try {
      const body = z
        .object({
          query: z.string().min(1).max(500),
          bookIds: z.array(z.string()).optional(),
          dimension: novelCraftDimensionSchema.default('plot_arc'),
          topK: z.number().int().min(1).max(20).default(5),
          mode: z.enum(['structural_beats', 'raw_excerpt']).default('structural_beats'),
        })
        .parse(request.body);
      const passages = await runtime.corpusStore.searchPassages({
        ...body,
        embedder: runtime.embedRegistry.resolveActiveEmbedder(),
      });
      return { passages };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/novel-studio/skills', async () => ({
    skills: runtime.skillCompiler.listSkills(),
  }));

  app.get('/api/novel-studio/skills/:slug', async (request, reply) => {
    const { slug } = z.object({ slug: z.string().min(1) }).parse(request.params);
    const loaded = runtime.skillCompiler.getSkill(slug);
    if (!loaded) {
      reply.status(404);
      return { error: `Skill not found: ${slug}` };
    }
    return loaded;
  });

  app.post('/api/novel-studio/books/:bookId/distill-skill', async (request, reply) => {
    try {
      const { bookId } = z.object({ bookId: z.string().min(1) }).parse(request.params);
      const body = z
        .object({
          dimension: novelCraftDimensionSchema,
          slug: z.string().optional(),
          title: z.string().optional(),
          customFocus: z.string().max(400).optional(),
          deepRefineThreadId: z.string().optional(),
          dissectorCatId: z.string().optional(),
        })
        .parse(request.body);

      const book = runtime.corpusStore.getBook(bookId);
      if (!book) throw new Error(`Reference book not found: ${bookId}`);
      const sampledChunks = runtime.corpusStore.sampleRepresentativeChunks(bookId, body.dimension, 8);
      const skill = runtime.skillCompiler.compileFromBookSamples({
        book,
        dimension: body.dimension,
        sampledChunks,
        slug: body.slug,
        title: body.title,
        customFocus: body.customFocus,
      });

      if (body.deepRefineThreadId && body.dissectorCatId && opts.invocationQueue && opts.queueProcessor) {
        const userId = resolveOperatorId(request, fallbackUser) ?? fallbackUser;
        const prompt =
          `@${body.dissectorCatId} 请加载 \`novel-book-dissector\` 技能，针对参考书《${book.title}》（\`${book.id}\`）的【${body.dimension}】维度执行深度技法蒸馏：\n` +
          `1. 调用 \`novel_dissect_reference(action="sample_dimension", bookId="${book.id}", dimension="${body.dimension}", topK=8)\` 精读高密样本；\n` +
          `2. 在基线技法包 \`${skill.slug}\` 之上深化核心心智模型、If-Then 决策规则与反模式，并调用 \`novel_dissect_reference(action="save_distilled_skill", ...)\` 更新落盘！`;
        const enq = await opts.invocationQueue.enqueueDurable({
          from: { kind: 'system', service: 'novel-skill-distiller' },
          threadId: body.deepRefineThreadId,
          userId,
          kind: 'private_input',
          ownerAuthProvenance: 'strict',
          content: prompt,
          targetCats: [body.dissectorCatId as never],
          intent: 'execute',
          autoExecute: true,
          priority: 'normal',
          idempotencyKey: `novel-distill:${skill.slug}:${randomUUID()}`,
        });
        if (enq.outcome === 'enqueued') {
          await opts.queueProcessor.requestDrain(body.deepRefineThreadId);
        }
      }

      return { skill, loaded: runtime.skillCompiler.getSkill(skill.slug) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.put('/api/novel-studio/skills/:slug', async (request, reply) => {
    try {
      const { slug } = z.object({ slug: z.string().min(1) }).parse(request.params);
      const body = distilledCraftSkillSchema.parse({ ...(request.body as Record<string, unknown>), slug });
      const saved = runtime.skillCompiler.saveSkillSpec(body, body.mountedToCats);
      return { skill: saved, loaded: runtime.skillCompiler.getSkill(saved.slug) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/api/novel-studio/skills/:slug', async (request, reply) => {
    try {
      const { slug } = z.object({ slug: z.string().min(1) }).parse(request.params);
      return { deleted: runtime.skillCompiler.deleteSkill(slug) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/novel-studio/projects', async () => ({
    projects: runtime.projectStore.listProjects(),
  }));

  app.post('/api/novel-studio/projects', async (request, reply) => {
    try {
      const body = z
        .object({
          title: z.string().min(1).max(160),
          slug: z.string().optional(),
          genre: z.string().max(80).optional(),
          premise: z.string().max(2000).optional(),
          enableMechanicsLedger: z.boolean().optional(),
          catRoster: editorialCatRosterBindingSchema.partial().optional(),
          createEditorialThread: z.boolean().default(true),
        })
        .parse(request.body);

      const catRoster = resolveEditorialCatRoster({
        requested: body.catRoster,
        candidates: collectRegisteredRosterCandidates(),
      });

      let threadId: string | undefined;
      if (body.createEditorialThread && opts.threadStore) {
        const userId = resolveOperatorId(request, fallbackUser) ?? fallbackUser;
        // Kimi/Codex/Claude members need a real cwd; a 'default' thread can never wake them.
        const workspace = await resolveEditorialThreadWorkspace(body.title);
        const createdThread = await opts.threadStore.create(
          userId,
          `📖《${body.title.trim()}》多猫编辑部`,
          workspace ?? undefined,
        );
        const cats = [
          catRoster.chiefEditorCatId,
          catRoster.writerCatId,
          catRoster.specialistCatId,
          catRoster.criticCatId,
        ];
        try {
          await opts.threadStore.addParticipants(createdThread.id, [...new Set(cats)] as never[]);
        } catch {
          /* ignore participant sync error */
        }
        threadId = createdThread.id;
      }

      const bundle = runtime.projectStore.createProject({
        ...body,
        catRoster,
        threadId,
      });
      return bundle;
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/novel-studio/projects/:projectId', async (request, reply) => {
    const { projectId } = z.object({ projectId: z.string().min(1) }).parse(request.params);
    const bundle = runtime.projectStore.loadBundle(projectId);
    if (!bundle) {
      reply.status(404);
      return { error: `Project not found: ${projectId}` };
    }
    return bundle;
  });

  app.delete('/api/novel-studio/projects/:projectId', async (request, reply) => {
    try {
      const { projectId } = z.object({ projectId: z.string().min(1) }).parse(request.params);
      return { deleted: runtime.projectStore.deleteProject(projectId) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.put('/api/novel-studio/projects/:projectId/matrix', async (request, reply) => {
    try {
      const { projectId } = z.object({ projectId: z.string().min(1) }).parse(request.params);
      const { dimensionBindings } = z
        .object({ dimensionBindings: z.array(dimensionSkillBindingSchema) })
        .parse(request.body);
      const project = runtime.orchestrator.updateDimensionMatrix(projectId, dimensionBindings);
      return { project };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.put('/api/novel-studio/projects/:projectId/workflow', async (request, reply) => {
    try {
      const { projectId } = z.object({ projectId: z.string().min(1) }).parse(request.params);
      const body = z
        .object({
          workflow: novelWorkflowConfigSchema.partial().optional(),
          catRoster: editorialCatRosterBindingSchema.partial().optional(),
        })
        .parse(request.body);
      const project = runtime.orchestrator.updateWorkflowConfig(projectId, body.workflow ?? {}, body.catRoster);
      return { project };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.put('/api/novel-studio/projects/:projectId/outlines', { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
    try {
      const { projectId } = z.object({ projectId: z.string().min(1) }).parse(request.params);
      const body = z
        .object({
          worldBlueprintMarkdown: z.string().optional(),
          storyArcs: z.array(storyArcSchema).optional(),
          chapterOutlines: z.array(chapterOutlineSchema).optional(),
          replaceAllChapterOutlines: z.boolean().optional(),
        })
        .parse(request.body);
      const project = runtime.orchestrator.saveOutlineArtifacts(projectId, body);
      return { project };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.delete('/api/novel-studio/projects/:projectId/outlines/:chapterNo', async (request, reply) => {
    try {
      const { projectId, chapterNo } = z
        .object({ projectId: z.string().min(1), chapterNo: z.coerce.number().int().min(1) })
        .parse(request.params);
      const project = runtime.orchestrator.deleteChapterOutline(projectId, chapterNo);
      return { project };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/novel-studio/projects/:projectId/pause', async (request, reply) => {
    try {
      const { projectId } = z.object({ projectId: z.string().min(1) }).parse(request.params);
      const paused = await runtime.orchestrator.pauseEditorialRun(projectId);
      return { ...paused, bundle: runtime.projectStore.loadBundle(projectId) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/novel-studio/projects/:projectId/ai-plan', async (request, reply) => {
    try {
      const { projectId } = z.object({ projectId: z.string().min(1) }).parse(request.params);
      const body = z
        .object({
          directionPrompt: z
            .string()
            .max(2000)
            .default('请规划第一卷情节弧（story-arcs）与前 5 章详细章纲（chapter-outlines）'),
          targetChapterCount: z.number().int().min(1).max(30).default(5),
        })
        .parse(request.body ?? {});

      const bundle = runtime.projectStore.loadBundle(projectId);
      if (!bundle) throw new Error(`Project not found: ${projectId}`);
      if (!bundle.project.threadId || !opts.invocationQueue || !opts.queueProcessor) {
        throw new Error('Project has no linked editorial thread or queue processor');
      }
      const userId = resolveOperatorId(request, fallbackUser) ?? fallbackUser;
      const architectCat = bundle.project.catRoster.architectCatId;
      const plotSkills = bundle.project.dimensionBindings.find((b) => b.dimension === 'plot_arc')?.skillSlugs ?? [];

      const prompt =
        `@${architectCat} **【总编立项 · 生成《${bundle.project.title}》卷纲与前 ${body.targetChapterCount} 章细纲】**\n` +
        `- 项目 ID：\`${projectId}\`\n` +
        `- 核心创意：${bundle.project.premise || '见世界观蓝图'}\n` +
        `- 创作方向要求：${body.directionPrompt}\n` +
        `- 绑定大纲技法包：${plotSkills.length > 0 ? plotSkills.map((s) => `\`${s}\``).join('、') : '默认结构规范'}\n\n` +
        `请加载 \`novel-chief-coordinator\` 技能，先调用 \`novel_read_project_context(projectId="${projectId}")\`，再设计世界观蓝图、第一卷 \`storyArcs\` 以及第 1~${body.targetChapterCount} 章 \`chapterOutlines\`（注意为每一章的 \`beats\` 准确标注 \`primaryDimension\`，以便后续自动挂载战斗/人设/场景技法包），最后调用 \`novel_save_outline_artifacts\` 保存！`;

      const enq = await opts.invocationQueue.enqueueDurable({
        from: { kind: 'system', service: 'novel-architect-planner' },
        threadId: bundle.project.threadId,
        userId,
        kind: 'private_input',
        ownerAuthProvenance: 'strict',
        content: prompt,
        targetCats: [architectCat as never],
        intent: 'execute',
        autoExecute: true,
        priority: 'normal',
        idempotencyKey: `novel-plan:${projectId}:${randomUUID()}`,
      });
      if (enq.outcome === 'enqueued') {
        await opts.queueProcessor.requestDrain(bundle.project.threadId);
      }
      return { queued: enq.outcome === 'enqueued', threadId: bundle.project.threadId, targetCatId: architectCat };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.put('/api/novel-studio/projects/:projectId/canon', async (request, reply) => {
    try {
      const { projectId } = z.object({ projectId: z.string().min(1) }).parse(request.params);
      const bundle = runtime.projectStore.loadBundle(projectId);
      if (!bundle) throw new Error(`Project not found: ${projectId}`);
      const nextCanon = narrativeGraphSchema.parse({
        ...(request.body as Record<string, unknown>),
        revision: bundle.canon.revision + 1,
        updatedAt: new Date().toISOString(),
      });
      runtime.projectStore.saveBundle(bundle.project, nextCanon, undefined);
      return { canon: nextCanon };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.put('/api/novel-studio/projects/:projectId/mechanics', async (request, reply) => {
    try {
      const { projectId } = z.object({ projectId: z.string().min(1) }).parse(request.params);
      const bundle = runtime.projectStore.loadBundle(projectId);
      if (!bundle) throw new Error(`Project not found: ${projectId}`);
      const nextMechanics = mechanicsLedgerSchema.parse({
        ...(request.body as Record<string, unknown>),
        revision: bundle.mechanics.revision + 1,
        updatedAt: new Date().toISOString(),
      });
      bundle.project.workflow.enableMechanicsLedger = nextMechanics.enabled;
      runtime.projectStore.saveBundle(bundle.project, undefined, nextMechanics);
      return { mechanics: nextMechanics };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/novel-studio/projects/:projectId/chapters/:chapterNo/start', async (request, reply) => {
    try {
      const { projectId, chapterNo } = z
        .object({ projectId: z.string().min(1), chapterNo: z.coerce.number().int().min(1) })
        .parse(request.params);
      const body = z
        .object({
          wakeCatsInThread: z.boolean().default(true),
          resetExistingDraft: z.boolean().default(false),
        })
        .parse(request.body ?? {});
      const packet = await runtime.orchestrator.prepareAndStartChapter(projectId, chapterNo, {
        wakeCatsInThread: body.wakeCatsInThread,
        resetExistingDraft: body.resetExistingDraft,
      });
      return { packet, bundle: runtime.projectStore.loadBundle(projectId) };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/novel-studio/projects/:projectId/chapters/:chapterNo/approve', async (request, reply) => {
    try {
      const { projectId, chapterNo } = z
        .object({ projectId: z.string().min(1), chapterNo: z.coerce.number().int().min(1) })
        .parse(request.params);
      const body = z
        .object({
          finalTextOverride: z.string().optional(),
          authorNotes: z.string().optional(),
          wakeNextChapter: z.boolean().default(false),
        })
        .parse(request.body ?? {});
      const bundle = await runtime.orchestrator.commitChapter({
        projectId,
        chapterNo,
        finalTextOverride: body.finalTextOverride,
        authorNotes: body.authorNotes,
        wakeNextChapter: body.wakeNextChapter,
      });
      return bundle;
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/novel-studio/projects/:projectId/chapters/:chapterNo/request-rewrite', async (request, reply) => {
    try {
      const { projectId, chapterNo } = z
        .object({ projectId: z.string().min(1), chapterNo: z.coerce.number().int().min(1) })
        .parse(request.params);
      const body = z.object({ feedback: z.string().min(2).max(2000) }).parse(request.body);
      const bundle = runtime.projectStore.loadBundle(projectId);
      if (!bundle) throw new Error(`Project not found: ${projectId}`);
      const rec = bundle.project.chapters[String(chapterNo)];
      if (!rec) throw new Error(`Chapter ${chapterNo} has not been started`);
      rec.stage = 'rewriting';
      rec.authorNotes = body.feedback;
      rec.updatedAt = new Date().toISOString();
      runtime.projectStore.saveBundle(bundle.project);

      if (bundle.project.threadId && opts.invocationQueue && opts.queueProcessor) {
        const userId = resolveOperatorId(request, fallbackUser) ?? fallbackUser;
        const writerCat = rec.writerCatId || bundle.project.catRoster.writerCatId;
        await opts.invocationQueue.enqueueDurable({
          from: { kind: 'system', service: 'novel-author-feedback' },
          threadId: bundle.project.threadId,
          userId,
          kind: 'private_input',
          ownerAuthProvenance: 'strict',
          content: `@${writerCat} 作者对第 ${chapterNo} 章提出修改批注：\n> ${body.feedback}\n\n请加载 \`novel-chapter-writer\` 定向精修后重新调用 \`novel_submit_chapter_draft(draftKind="raw")\` 提交审阅。`,
          targetCats: [writerCat as never],
          intent: 'execute',
          autoExecute: true,
          priority: 'normal',
          idempotencyKey: `novel-rewrite:${projectId}:${chapterNo}:${randomUUID()}`,
        });
        await opts.queueProcessor.requestDrain(bundle.project.threadId);
      }

      return runtime.projectStore.loadBundle(projectId);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/novel-studio/projects/:projectId/rollback', async (request, reply) => {
    try {
      const { projectId } = z.object({ projectId: z.string().min(1) }).parse(request.params);
      const { targetChapterNo } = z.object({ targetChapterNo: z.number().int().min(0) }).parse(request.body);
      return runtime.orchestrator.rollbackToChapter(projectId, targetChapterNo);
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/novel-studio/projects/:projectId/auto-continuous', async (request, reply) => {
    try {
      const { projectId } = z.object({ projectId: z.string().min(1) }).parse(request.params);
      const body = z
        .object({
          enabled: z.boolean(),
          maxChapters: z.number().int().min(1).max(50).optional(),
          startFromChapterNo: z.number().int().min(1).optional(),
          resetStartChapterDraft: z.boolean().default(false),
        })
        .parse(request.body);
      const project = await runtime.orchestrator.toggleAutoContinuous(
        projectId,
        body.enabled,
        body.maxChapters,
        body.startFromChapterNo,
        body.resetStartChapterDraft,
      );
      return { project };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.get('/api/novel-studio/projects/:projectId/export', async (request, reply) => {
    try {
      const { projectId } = z.object({ projectId: z.string().min(1) }).parse(request.params);
      const { format } = z.object({ format: z.enum(['md', 'txt']).default('md') }).parse(request.query ?? {});
      return runtime.projectStore.exportManuscript(projectId, format);
    } catch (err) {
      return sendError(reply, err);
    }
  });
};

/**
 * Authenticated MCP Callback Routes for Cats invoking novel_* tools.
 */
export const callbackNovelStudioRoutes: FastifyPluginAsync<CallbackNovelStudioRoutesOptions> = async (app, opts) => {
  registerCallbackAuthHook(app, opts.registry, { agentKeyRegistry: opts.agentKeyRegistry });
  const { runtime } = opts;

  app.post('/api/callbacks/novel-studio/dissect-reference', { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
    const principal = requireCallbackPrincipal(request, reply);
    if (!principal) return;
    try {
      const body = z
        .object({
          action: z.enum(['list_books', 'sample_dimension', 'save_distilled_skill']),
          bookId: z.string().optional(),
          dimension: novelCraftDimensionSchema.optional(),
          topK: z.number().int().min(1).max(16).default(8),
          skillSpec: distilledCraftSkillSchema.optional(),
        })
        .parse(request.body);

      if (body.action === 'list_books') {
        return { books: runtime.corpusStore.listBooks(), skills: runtime.skillCompiler.listSkills() };
      }
      if (body.action === 'sample_dimension') {
        if (!body.bookId || !body.dimension) {
          throw new Error('bookId and dimension are required when action="sample_dimension"');
        }
        const book = runtime.corpusStore.getBook(body.bookId);
        if (!book) throw new Error(`Reference book not found: ${body.bookId}`);
        const samples = runtime.corpusStore.sampleRepresentativeChunks(body.bookId, body.dimension, body.topK);
        return { book, dimension: body.dimension, samples };
      }
      if (!body.skillSpec) {
        throw new Error('skillSpec is required when action="save_distilled_skill"');
      }
      const saved = runtime.skillCompiler.saveSkillSpec(body.skillSpec, true);
      return { savedSkill: saved };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/callbacks/novel-studio/search-beats', async (request, reply) => {
    const principal = requireCallbackPrincipal(request, reply);
    if (!principal) return;
    try {
      const body = z
        .object({
          query: z.string().min(2).max(500),
          dimension: novelCraftDimensionSchema.default('plot_arc'),
          bookIds: z.array(z.string()).optional(),
          mode: z.enum(['structural_beats', 'raw_excerpt']).default('structural_beats'),
          topK: z.number().int().min(1).max(12).default(4),
        })
        .parse(request.body);
      const passages = await runtime.corpusStore.searchPassages({
        ...body,
        embedder: runtime.embedRegistry.resolveActiveEmbedder(),
      });
      return { passages };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/callbacks/novel-studio/read-context', async (request, reply) => {
    const principal = requireCallbackPrincipal(request, reply);
    if (!principal) return;
    try {
      const body = z
        .object({
          projectId: z.string().optional(),
          chapterNo: z.number().int().min(1).optional(),
        })
        .parse(request.body ?? {});

      const allProjects = runtime.projectStore.listProjects();
      const targetId =
        body.projectId ??
        allProjects.find((p) => principal.kind === 'invocation' && p.threadId === principal.threadId)?.id ??
        allProjects[0]?.id;

      if (!targetId) {
        return { projects: [] };
      }
      const bundle = runtime.projectStore.loadBundle(targetId);
      if (!bundle) throw new Error(`Novel project not found: ${targetId}`);

      if (body.chapterNo !== undefined) {
        const hasState = Boolean(bundle.project.chapters[String(body.chapterNo)]);
        const packet = hasState
          ? runtime.orchestrator.getChapterWorkPacket(targetId, body.chapterNo)
          : await runtime.orchestrator.prepareAndStartChapter(targetId, body.chapterNo, { wakeCatsInThread: false });
        return {
          projectSummary: {
            id: bundle.project.id,
            title: bundle.project.title,
            genre: bundle.project.genre,
            workflow: bundle.project.workflow,
            catRoster: bundle.project.catRoster,
          },
          chapterWorkPacket: packet,
          chapterRecord: bundle.project.chapters[String(body.chapterNo)],
        };
      }

      return {
        project: bundle.project,
        canon: bundle.canon,
        mechanics: bundle.mechanics,
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/callbacks/novel-studio/save-outlines', { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
    const principal = requireCallbackPrincipal(request, reply);
    if (!principal) return;
    try {
      const body = z
        .object({
          projectId: z.string().min(1),
          worldBlueprintMarkdown: z.string().optional(),
          storyArcs: z.array(storyArcSchema).optional(),
          chapterOutlines: z.array(chapterOutlineSchema).optional(),
        })
        .parse(request.body);
      const project = runtime.orchestrator.saveOutlineArtifacts(body.projectId, body);
      return {
        projectId: project.id,
        revision: project.revision,
        storyArcCount: project.storyArcs.length,
        chapterOutlineCount: project.chapterOutlines.length,
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/callbacks/novel-studio/precheck-chapter', async (request, reply) => {
    const principal = requireCallbackPrincipal(request, reply);
    if (!principal) return;
    try {
      const body = z
        .object({
          projectId: z.string().min(1),
          chapterNo: z.number().int().min(1),
          specialistNotes: z.string().max(8000).optional(),
        })
        .parse(request.body);
      const packet = await runtime.orchestrator.prepareAndStartChapter(body.projectId, body.chapterNo, {
        wakeCatsInThread: false,
      });
      if (body.specialistNotes?.trim()) {
        runtime.orchestrator.recordSpecialistNotes(body.projectId, body.chapterNo, body.specialistNotes);
        packet.specialistNotes = body.specialistNotes.trim();
      }
      return { packet };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/callbacks/novel-studio/submit-draft', { bodyLimit: 8 * 1024 * 1024 }, async (request, reply) => {
    const principal = requireCallbackPrincipal(request, reply);
    if (!principal) return;
    try {
      const body = z
        .object({
          projectId: z.string().min(1),
          chapterNo: z.number().int().min(1),
          draftKind: z.enum(['raw', 'humanized']).default('raw'),
          content: z.string().min(100),
          proposedStateDelta: chapterStateDeltaSchema.optional(),
        })
        .parse(request.body);
      const result = await runtime.orchestrator.submitChapterDraft({
        projectId: body.projectId,
        chapterNo: body.chapterNo,
        authorCatId: principal.catId,
        draftKind: body.draftKind,
        content: body.content,
        proposedStateDelta: body.proposedStateDelta,
        wakeNextCat: true,
      });
      return {
        chapterNo: body.chapterNo,
        stage: result.record.stage,
        charCount: body.content.length,
        aiFlavorScore: result.aiFlavorScore,
        aiFlagCount: result.flagCount,
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/callbacks/novel-studio/evaluate-chapter', async (request, reply) => {
    const principal = requireCallbackPrincipal(request, reply);
    if (!principal) return;
    try {
      const body = z
        .object({
          projectId: z.string().min(1),
          chapterNo: z.number().int().min(1),
          proseScores: prose5AxisScoreSchema.omit({ overall: true }).extend({ overall: z.number().optional() }),
          pacingScores: pacing5AxisScoreSchema.omit({ overall: true }).extend({ overall: z.number().optional() }),
          extraViolations: z.array(invariantViolationSchema).optional(),
          summaryCritique: z.string().min(10).max(1200),
        })
        .parse(request.body);
      const outcome = await runtime.orchestrator.evaluateChapter({
        projectId: body.projectId,
        chapterNo: body.chapterNo,
        reviewerCatId: principal.catId,
        proseScores: body.proseScores,
        pacingScores: body.pacingScores,
        extraViolations: body.extraViolations,
        summaryCritique: body.summaryCritique,
        wakeNextCat: true,
      });
      return outcome;
    } catch (err) {
      return sendError(reply, err);
    }
  });

  app.post('/api/callbacks/novel-studio/commit-chapter', async (request, reply) => {
    const principal = requireCallbackPrincipal(request, reply);
    if (!principal) return;
    try {
      const body = z
        .object({
          projectId: z.string().min(1),
          chapterNo: z.number().int().min(1),
          stateDeltaOverride: chapterStateDeltaSchema.optional(),
        })
        .parse(request.body);
      const bundle = await runtime.orchestrator.commitChapter({
        projectId: body.projectId,
        chapterNo: body.chapterNo,
        stateDeltaOverride: body.stateDeltaOverride,
        wakeNextChapter: true,
      });
      return {
        projectId: bundle.project.id,
        committedChapterNo: body.chapterNo,
        nextChapterNo: bundle.project.currentChapterNo,
        canonRevision: bundle.canon.revision,
      };
    } catch (err) {
      return sendError(reply, err);
    }
  });
};
