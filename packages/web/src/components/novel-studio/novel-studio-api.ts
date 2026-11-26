import type {
  BacktrackMode,
  ChapterDirectionOption,
  ChapterOutline,
  ChapterStateDelta,
  ChapterStateRecord,
  DimensionSkillBinding,
  DistilledChapterSummary,
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
  StudioWizardStep,
  StyleReferenceConfig,
} from '@cat-cafe/shared';
import { apiFetch } from '@/utils/api-client';

export interface CatSummaryItem {
  id: string;
  name: string;
  nickname?: string;
  roleDescription?: string;
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

  deleteBook: (bookId: string) =>
    jsonRequest<{ deleted: boolean }>(`/api/novel-studio/books/${encodeURIComponent(bookId)}`, {
      method: 'DELETE',
    }),

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

  createProject: (input: {
    title: string;
    genre?: string;
    premise?: string;
    authorMasterOutlineMarkdown?: string;
    copilotCatId?: string;
    styleConfig?: Partial<StyleReferenceConfig>;
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

  // ── 0 → 7 Guided Wizard Endpoints ────────────────────────────────────────
  setWizardStep: (projectId: string, step: StudioWizardStep) =>
    jsonRequest<{ project: NovelProject; bundle: NovelProjectBundleDto }>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/wizard-step`,
      {
        method: 'PUT',
        body: JSON.stringify({ step }),
      },
    ),

  bindModuleReferences: (
    projectId: string,
    selections: Array<{ dimension: NovelCraftDimension; referenceBookIds: string[] }>,
  ) =>
    jsonRequest<{ project: NovelProject; bundle: NovelProjectBundleDto }>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/module-references`,
      {
        method: 'PUT',
        body: JSON.stringify({ selections }),
      },
    ),

  submitOnboarding: (
    projectId: string,
    input: {
      rawUserSettingsInput: string;
      rawOpeningChaptersInput: string;
      wakeCats?: boolean;
    },
  ) =>
    jsonRequest<NovelProjectBundleDto>(`/api/novel-studio/projects/${encodeURIComponent(projectId)}/onboarding`, {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  ideateMacroDirections: (
    projectId: string,
    chapterNo: number,
    input: { feedbackHint?: string; wakeCats?: boolean } = {},
  ) =>
    jsonRequest<NovelProjectBundleDto>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/chapters/${chapterNo}/macro-directions`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),

  ideateDetailedOutlines: (
    projectId: string,
    chapterNo: number,
    input: { selectedDirectionId: string; feedbackHint?: string; wakeCats?: boolean },
  ) =>
    jsonRequest<NovelProjectBundleDto>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/chapters/${chapterNo}/detailed-outlines`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),

  executeDraftFromOutline: (
    projectId: string,
    chapterNo: number,
    input: { selectedDetailedOutlineId: string; extraNote?: string; wakeCats?: boolean },
  ) =>
    jsonRequest<NovelProjectBundleDto>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/chapters/${chapterNo}/execute-draft`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),

  reviseChapterWithSuggestion: (
    projectId: string,
    chapterNo: number,
    input: { suggestion: string; currentTextOverride?: string; wakeCats?: boolean },
  ) =>
    jsonRequest<NovelProjectBundleDto>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/chapters/${chapterNo}/revise`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),

  restoreRevisionRound: (
    projectId: string,
    chapterNo: number,
    round: number,
    which: 'previous' | 'revised' = 'previous',
  ) =>
    jsonRequest<NovelProjectBundleDto>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/chapters/${chapterNo}/restore-revision`,
      {
        method: 'POST',
        body: JSON.stringify({ round, which }),
      },
    ),

  humanizeChapter: (
    projectId: string,
    chapterNo: number,
    input: { sourceTextOverride?: string; extraToneHint?: string; wakeCats?: boolean } = {},
  ) =>
    jsonRequest<NovelProjectBundleDto>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/chapters/${chapterNo}/humanize`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),

  finalizeChapterProduct: (
    projectId: string,
    chapterNo: number,
    input: { title?: string; finalText: string; advanceToNextChapter?: boolean },
  ) =>
    jsonRequest<NovelProjectBundleDto>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/chapters/${chapterNo}/finalize-product`,
      {
        method: 'POST',
        body: JSON.stringify(input),
      },
    ),

  saveManualDraft: (
    projectId: string,
    chapterNo: number,
    input: { title?: string; content: string; authorNotes?: string },
  ) =>
    jsonRequest<NovelProjectBundleDto>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/chapters/${chapterNo}/draft`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      },
    ),

  exportManuscript: (projectId: string, format: 'md' | 'txt') =>
    jsonRequest<{ fileName: string; content: string }>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/export?format=${format}`,
    ),

  // Legacy compatibility exports
  updateMasterOutlineAndStyle: (
    projectId: string,
    input: {
      title?: string;
      genre?: string;
      premise?: string;
      authorMasterOutlineMarkdown?: string;
      styleConfig?: Partial<StyleReferenceConfig>;
      copilotCatId?: string;
    },
  ) =>
    jsonRequest<{ project: NovelProject; bundle: NovelProjectBundleDto }>(
      `/api/novel-studio/projects/${encodeURIComponent(projectId)}/master-outline`,
      {
        method: 'PUT',
        body: JSON.stringify(input),
      },
    ),

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
    },
  ) =>
    jsonRequest<{ project: NovelProject }>(`/api/novel-studio/projects/${encodeURIComponent(projectId)}/outlines`, {
      method: 'PUT',
      body: JSON.stringify(input),
    }),

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

  _keepTypes: undefined as unknown as
    | BacktrackMode
    | ChapterDirectionOption
    | ChapterStateDelta
    | ChapterStateRecord
    | DistilledChapterSummary
    | undefined,
};
