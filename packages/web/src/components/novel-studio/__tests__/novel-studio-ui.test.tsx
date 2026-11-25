import { describe, expect, it, vi } from 'vitest';
import { CanonAndReaderPanel } from '../CanonAndReaderPanel';
import { ChapterCopilotPanel } from '../ChapterCopilotPanel';
import { NovelStudioWorkbench } from '../NovelStudioWorkbench';
import { ReferenceLibraryPanel } from '../ReferenceLibraryPanel';

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
    updateMasterOutlineAndStyle: vi.fn(),
    ideateChapterDirections: vi.fn(),
    generateChapterFromChoice: vi.fn(),
    saveManualDraft: vi.fn(),
    finalizeChapter: vi.fn(),
    updateChapterSummary: vi.fn(),
    restoreChapterVersion: vi.fn(),
    pauseProject: vi.fn(),
  },
  fileToBase64: vi.fn(),
}));

describe('NovelStudioWorkbench & ChapterCopilotPanel', () => {
  it('exports valid React functional components for the human-guided chapter co-pilot studio', () => {
    expect(typeof NovelStudioWorkbench).toBe('function');
    expect(typeof ChapterCopilotPanel).toBe('function');
    expect(typeof CanonAndReaderPanel).toBe('function');
    expect(typeof ReferenceLibraryPanel).toBe('function');
  });
});
