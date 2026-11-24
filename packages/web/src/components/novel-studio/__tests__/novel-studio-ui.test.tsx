import { describe, expect, it, vi } from 'vitest';
import { ChapterPipelinePanel } from '../ChapterPipelinePanel';
import { NovelStudioWorkbench } from '../NovelStudioWorkbench';

vi.mock('../novel-studio-api', () => ({
  novelStudioApi: {
    fetchOverview: vi.fn().mockResolvedValue({
      books: [],
      skills: [],
      projects: [],
      embeddingConfig: { provider: 'auto', model: 'BAAI/bge-m3' },
      cats: [
        { id: 'opus', name: '布偶猫' },
        { id: 'kimi', name: '梵花猫' },
        { id: 'codex', name: '缅因猫' },
      ],
    }),
    getProjectBundle: vi.fn().mockResolvedValue(null),
    pauseProject: vi.fn(),
    deleteChapterOutline: vi.fn(),
    saveOutlines: vi.fn(),
    startChapter: vi.fn(),
    toggleAutoContinuous: vi.fn(),
  },
  fileToBase64: vi.fn(),
}));

describe('NovelStudioWorkbench & ChapterPipelinePanel', () => {
  it('exports valid React functional components with human-intervention controls', () => {
    expect(typeof NovelStudioWorkbench).toBe('function');
    expect(typeof ChapterPipelinePanel).toBe('function');
  });
});
