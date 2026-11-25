import type {
  ChapterOutline,
  DimensionSkillBinding,
  DistilledCraftSkill,
  EditorialCatRosterBinding,
  MechanicsLedger,
  NarrativeGraph,
  NovelCraftDimension,
  NovelProject,
  NovelWorkflowConfig,
  ReferenceBookSummary,
  RetrievedBeatPassage,
  StoryArc,
} from '@cat-cafe/shared';
import { apiFetch } from '@/utils/api-client';

export interface CatSummaryItem {
  id: string;
  name: string;
  nickname?: string;
  roleDescription?: string;
}

/** Quota state the studio shows next to each editorial seat before dispatching. */
export interface NovelMemberQuotaItem {
  catId: string;
  name: string;
  displayName: string;
  available: boolean;
  blockedUntil?: number;
  message?: string;
  observed?: { remainingPercent: number; resetsAt?: string };
}

export interface NovelEmbedderConfigDto {
  provider: 'auto' | 'clowder-local' | 'openai-compatible' | 'local-hash-vec' | 'fts-only';
  apiUrl?: string;
  apiKey?: string;
  model?: string;
  dim?: number;
}

export interface NovelOverviewResponse {
  books: ReferenceBookSummary[];
  skills: DistilledCraftSkill[];
  projects: NovelProject[];
  embeddingConfig: NovelEmbedderConfigDto;
  cats: CatSummaryItem[];
}

export interface NovelProjectBundleDto {
  project: NovelProject;
  canon: NarrativeGraph;
  mechanics: MechanicsLedger;
}

async function jsonRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new Error(payload?.error || `Request failed (${res.status})`);
  }
  return payload;
}

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? '');
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'));
    reader.readAsDataURL(file);
  });
}

export const novelStudioApi = {
  fetchOverview: () => jsonRequest<NovelOverviewResponse>('/api/novel-studio/overview'),

  fetchMemberQuota: () => jsonRequest<{ members: NovelMemberQuotaItem[] }>('/api/novel-studio/members/quota'),

  updateEmbeddingConfig: (config: Partial<NovelEmbedderConfigDto>) =>
    jsonRequest<{ embeddingConfig: NovelEmbedderConfigDto }>('/api/novel-studio/embedding-config', {
      method: 'PUT',
      body: JSON.stringify(config),
    }),

  uploadBook: (input: {
    title: string;
    author?: string;
    fileName: string;
    contentBase64: string;
    autoEmbed?: boolean;
  }) =>
    jsonRequest<{ book: ReferenceBookSummary }>('/api/novel-studio/books/upload', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  embedBook: (bookId: string) =>
    jsonRequest<{ book: ReferenceBookSummary }>(`/api/novel-studio/books/${encodeURIComponent(bookId)}/embed`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  deleteBook: (bookId: string) =>
    jsonRequest<{ deleted: boolean }>(`/api/novel-studio/books/${encodeURIComponent(bookId)}`, {
      method: 'DELETE',
    }),

  listBookChapters: (bookId: string) =>
    jsonRequest<{
      book: ReferenceBookSummary;
      chapters: Array<{ chapterIndex: number; title: string; charCount: number; summaryPreview: string }>;
    }>(`/api/novel-studio/books/${encodeURIComponent(bookId)}/chapters`),

  searchPassages: (input: {
    query: string;
    bookIds?: string[];
    dimension: NovelCraftDimension;
    topK?: number;
    mode?: 'structural_beats' | 'raw_excerpt';
  }) =>
    jsonRequest<{ passages: RetrievedBeatPassage[] }>('/api/novel-studio/search', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  distillSkillFromBook: (
    bookId: string,
    input: {
      dimension: NovelCraftDimension;
      slug?: string;
      title?: string;
      customFocus?: string;
      deepRefineThreadId?: string;
      dissectorCatId?: string;
    },
  ) =>
    jsonRequest<{
      skill: DistilledCraftSkill;
      loaded: { spec: DistilledCraftSkill; skillMarkdown: string; beatTemplatesMarkdown: string } | null;
    }>(`/api/novel-studio/books/${encodeURIComponent(bookId)}/distill-skill`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getSkillDetail: (slug: string) =>
    jsonRequest<{ spec: DistilledCraftSkill; skillMarkdown: string; beatTemplatesMarkdown: string }>(
      `/api/novel-studio/skills/${encodeURIComponent(slug)}`,
    ),

  deleteSkill: (slug: string) =>
    jsonRequest<{ deleted: boolean }>(`/api/novel-studio/skills/${encodeURIComponent(slug)}`, {
      method: 'DELETE',
    }),

  createProject: (input: {
    title: string;
    genre?: string;
    premise?: string;
    enableMechanicsLedger?: boolean;
    catRoster?: Partial<EditorialCatRosterBinding>;
    createEditorialThread?: boolean;
  }) =>
    jsonRequest<NovelProjectBundleDto>('/api/novel-studio/projects', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  getProjectBundle: (projectId: string) =>
    jsonRequest<NovelProjectBundleDto>(`/api/novel-studio/projects/${encodeURIComponent(projectId)}`),

  deleteProject: (projectId: string) =>
    jsonRequest<{ deleted: boolean }>(`/api/novel-studio/projects/${encodeURIComponent(projectId)}`, {
      method: 'DELETE',
    }),

  updateMatrix: (projectId: string, dimensionBindings: DimensionSkillBinding[]) =>
    jsonRequest<{ project: NovelProject }>(`/api/novel-studio/projects/${encodeURIComponent(projectId)}/matrix`, {
      method: 'PUT',
      body: JSON.stringify({ dimensionBindings }),
    }),

  updateWorkflow: (
    projectId: string,
    workflow: Partial<NovelWorkflowConfig>,
    catRoster?: Partial<EditorialCatRosterBinding>,
  ) =>
    jsonRequest<{ project: NovelProject }>(`/api/novel-studio/projects/${encodeURIComponent(projectId)}/workflow`, {
      method: 'PUT',
      body: JSON.stringify({ workflow, catRoster }),
    }),

  saveOutlines: (
    projectId: string,
    input: {
      worldBlueprintMarkdown?: string;
      storyArcs?: StoryArc[];
      chapterOutlines?: ChapterOutline[];
      replaceAllChapterOutlines?: boolean;
    },
  ) =>
    jsonRequest<{ project: NovelProject }>(`/api/novel-studio/projects/${encodeURIComponent(projectId)}/outlines`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

  deleteChapterOutline: (projectId: string, chapterNo: number) =>
    jsonRequest<{ project: NovelProject }>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/outlines/${chapterNo}`,
      {
        method: 'DELETE',
      },
    ),

  pauseProject: (projectId: string) =>
    jsonRequest<{
      project: NovelProject;
      pausedChapterNos: number[];
      cancelledCats: string[];
      withdrawnQueueCount: number;
      bundle: NovelProjectBundleDto;
    }>(`/api/novel-studio/projects/${encodeURIComponent(projectId)}/pause`, {
      method: 'POST',
      body: JSON.stringify({}),
    }),

  triggerAiPlan: (projectId: string, directionPrompt: string, targetChapterCount: number) =>
    jsonRequest<{ queued: boolean; threadId: string; targetCatId: string }>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/ai-plan`,
      {
        method: 'POST',
        body: JSON.stringify({ directionPrompt, targetChapterCount }),
      },
    ),

  saveCanon: (projectId: string, canon: NarrativeGraph) =>
    jsonRequest<{ canon: NarrativeGraph }>(`/api/novel-studio/projects/${encodeURIComponent(projectId)}/canon`, {
      method: 'PUT',
      body: JSON.stringify(canon),
    }),

  saveMechanics: (projectId: string, mechanics: MechanicsLedger) =>
    jsonRequest<{ mechanics: MechanicsLedger }>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/mechanics`,
      {
        method: 'PUT',
        body: JSON.stringify(mechanics),
      },
    ),

  startChapter: (projectId: string, chapterNo: number, wakeCatsInThread = true, resetExistingDraft = false) =>
    jsonRequest<{ bundle: NovelProjectBundleDto }>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/chapters/${chapterNo}/start`,
      {
        method: 'POST',
        body: JSON.stringify({ wakeCatsInThread, resetExistingDraft }),
      },
    ),

  approveChapter: (
    projectId: string,
    chapterNo: number,
    input: { finalTextOverride?: string; authorNotes?: string; wakeNextChapter?: boolean },
  ) =>
    jsonRequest<NovelProjectBundleDto>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/chapters/${chapterNo}/approve`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),

  requestChapterRewrite: (projectId: string, chapterNo: number, feedback: string) =>
    jsonRequest<NovelProjectBundleDto>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/chapters/${chapterNo}/request-rewrite`,
      {
        method: 'POST',
        body: JSON.stringify({ feedback }),
      },
    ),

  rollbackToChapter: (projectId: string, targetChapterNo: number) =>
    jsonRequest<NovelProjectBundleDto>(`/api/novel-studio/projects/${encodeURIComponent(projectId)}/rollback`, {
      method: 'POST',
      body: JSON.stringify({ targetChapterNo }),
    }),

  toggleAutoContinuous: (
    projectId: string,
    enabled: boolean,
    maxChapters?: number,
    startFromChapterNo?: number,
    resetStartChapterDraft = false,
  ) =>
    jsonRequest<{ project: NovelProject }>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/auto-continuous`,
      {
        method: 'POST',
        body: JSON.stringify({ enabled, maxChapters, startFromChapterNo, resetStartChapterDraft }),
      },
    ),

  exportManuscript: (projectId: string, format: 'md' | 'txt') =>
    jsonRequest<{ fileName: string; content: string }>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/export?format=${format}`,
    ),
};
