import { describe, expect, it, vi } from 'vitest';
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
  },
  fileToBase64: vi.fn(),
}));

describe('NovelStudioWorkbench', () => {
  it('exports a valid React functional component', () => {
    expect(typeof NovelStudioWorkbench).toBe('function');
  });
});
