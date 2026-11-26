import { describe, expect, it, vi } from 'vitest';
import { NovelStudioWorkbench } from '../NovelStudioWorkbench';
import { ReferenceLibraryPanel } from '../ReferenceLibraryPanel';
import { Step1CreateNovel, Step2SelectModuleReferences } from '../StepCreateAndReferences';
import { StepNextChapterFunnel } from '../StepNextChapterFunnel';
import { StepOnboardingDissection } from '../StepOnboardingDissection';
import { Step5HumanRevision, Step6DeAiPage, Step7FinalProductEditor } from '../StepReviseHumanizeFinal';

vi.mock('../novel-studio-api', () => ({
  novelStudioApi: {
    fetchOverview: vi.fn().mockResolvedValue({
      books: [],
      skills: [],
      projects: [],
      embeddingConfig: { provider: 'auto', model: 'BAAI/bge-m3' },
      cats: [
        { id: 'opus', name: '布偶猫', nickname: '宪宪' },
        { id: 'kimi', name: '梵花猫', nickname: '墨墨' },
        { id: 'codex', name: '缅因猫', nickname: '砚砚' },
      ],
    }),
    getProjectBundle: vi.fn().mockResolvedValue(null),
    bindModuleReferences: vi.fn(),
    submitOnboarding: vi.fn(),
    ideateMacroDirections: vi.fn(),
    ideateDetailedOutlines: vi.fn(),
    executeDraftFromOutline: vi.fn(),
    reviseChapterWithSuggestion: vi.fn(),
    humanizeChapter: vi.fn(),
    finalizeChapterProduct: vi.fn(),
    pauseProject: vi.fn(),
  },
  fileToBase64: vi.fn(),
}));

describe('NovelStudio 0-7 Simple Guided Wizard Components', () => {
  it('exports all 0-7 step React functional components cleanly', () => {
    expect(typeof NovelStudioWorkbench).toBe('function');
    expect(typeof ReferenceLibraryPanel).toBe('function');
    expect(typeof Step1CreateNovel).toBe('function');
    expect(typeof Step2SelectModuleReferences).toBe('function');
    expect(typeof StepOnboardingDissection).toBe('function');
    expect(typeof StepNextChapterFunnel).toBe('function');
    expect(typeof Step5HumanRevision).toBe('function');
    expect(typeof Step6DeAiPage).toBe('function');
    expect(typeof Step7FinalProductEditor).toBe('function');
  });
});
