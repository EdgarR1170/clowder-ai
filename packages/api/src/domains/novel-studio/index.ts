import { join, resolve } from 'node:path';
import type { IEmbeddingService } from '../memory/interfaces.js';
import { ChapterOrchestrator, type ThreadCoordinatorPort } from './coordinator/chapter-orchestrator.js';
import { NovelProjectStore } from './coordinator/novel-project-store.js';
import { NovelEmbeddingProviderRegistry } from './corpus/novel-embedding-provider.js';
import { ingestNovelBuffer } from './corpus/novel-ingestor.js';
import { NovelVectorStore } from './corpus/novel-vector-store.js';
import { BookToSkillCompiler } from './skill-compiler/book-to-skill-compiler.js';

export * from './canon/invariant-checker.js';
export * from './coordinator/chapter-orchestrator.js';
export * from './coordinator/copilot-context-builder.js';
export * from './coordinator/novel-project-store.js';
export * from './coordinator/onboarding-dissector.js';
export * from './corpus/novel-embedding-provider.js';
export * from './corpus/novel-ingestor.js';
export * from './corpus/novel-vector-store.js';
export * from './humanizer/humanizer-zh.js';
export * from './skill-compiler/book-to-skill-compiler.js';

export interface NovelStudioRuntime {
  dataDir: string;
  corpusStore: NovelVectorStore;
  embedRegistry: NovelEmbeddingProviderRegistry;
  skillCompiler: BookToSkillCompiler;
  projectStore: NovelProjectStore;
  orchestrator: ChapterOrchestrator;
  ingestAndIndexBook(input: {
    bookId?: string;
    title: string;
    author?: string;
    fileName: string;
    buffer: Buffer;
    autoEmbed?: boolean;
  }): Promise<ReturnType<NovelVectorStore['getBook']>>;
  close(): void;
}

export function createNovelStudioRuntime(options: {
  workspaceRoot: string;
  dataDir?: string;
  getClowderEmbeddingService?: () => IEmbeddingService | undefined;
  threadCoordinator?: ThreadCoordinatorPort;
}): NovelStudioRuntime {
  const workspaceRoot = resolve(options.workspaceRoot);
  const dataDir = resolve(
    options.dataDir ?? process.env.NOVEL_STUDIO_DATA_DIR ?? join(workspaceRoot, 'data', 'novel-studio'),
  );
  const corpusStore = new NovelVectorStore(join(dataDir, 'corpus.sqlite'));
  const embedRegistry = new NovelEmbeddingProviderRegistry(options.getClowderEmbeddingService);
  const skillCompiler = new BookToSkillCompiler(dataDir, workspaceRoot);
  const projectStore = new NovelProjectStore(dataDir);
  const orchestrator = new ChapterOrchestrator(
    projectStore,
    corpusStore,
    embedRegistry,
    skillCompiler,
    options.threadCoordinator,
  );

  return {
    dataDir,
    corpusStore,
    embedRegistry,
    skillCompiler,
    projectStore,
    orchestrator,
    async ingestAndIndexBook(input) {
      const ingested = ingestNovelBuffer(input);
      const saved = corpusStore.saveIngestedBook(ingested);
      if (input.autoEmbed !== false) {
        const embedder = embedRegistry.resolveActiveEmbedder();
        if (embedder) {
          return corpusStore.embedBook(saved.id, embedder);
        }
      }
      return saved;
    },
    close() {
      corpusStore.close();
    },
  };
}
