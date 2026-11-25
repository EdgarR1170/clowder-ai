'use client';

import { type FC, useCallback, useEffect, useMemo, useState } from 'react';
import { pushThreadRouteWithHistory } from '@/components/ThreadSidebar/thread-navigation';
import { CanonAndReaderPanel } from './CanonAndReaderPanel';
import { ChapterCopilotPanel } from './ChapterCopilotPanel';
import { BookIcon, FeatherIcon, SparklesIcon } from './NovelIcons';
import { type NovelOverviewResponse, type NovelProjectBundleDto, novelStudioApi } from './novel-studio-api';
import { ReferenceLibraryPanel } from './ReferenceLibraryPanel';

type StudioTab = 'copilot' | 'bible' | 'styles';

interface NovelStudioWorkbenchProps {
  onRequestSplitChat?: () => void;
}

export const NovelStudioWorkbench: FC<NovelStudioWorkbenchProps> = ({ onRequestSplitChat }) => {
  const [activeTab, setActiveTab] = useState<StudioTab>('copilot');
  const [overview, setOverview] = useState<NovelOverviewResponse | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [bundle, setBundle] = useState<NovelProjectBundleDto | null>(null);
  const [selectedChapterNo, setSelectedChapterNo] = useState<number>(1);
  const [showNewProject, setShowNewProject] = useState(false);

  const [newTitle, setNewTitle] = useState('');
  const [newGenre, setNewGenre] = useState('奇幻悬疑 / 群像长篇');
  const [newMasterOutline, setNewMasterOutline] = useState('');
  const [newCopilotCatId, setNewCopilotCatId] = useState('kimi');
  const [newMechanics, setNewMechanics] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const data = await novelStudioApi.fetchOverview();
      setOverview(data);
      setError(null);
      const firstProject = data.projects[0];
      if (!selectedProjectId && firstProject) {
        setSelectedProjectId(firstProject.id);
        setSelectedChapterNo(firstProject.currentChapterNo || 1);
      }
      const firstCat = data.cats[0];
      if (firstCat && !data.cats.some((c) => c.id === 'kimi')) {
        setNewCopilotCatId(firstCat.id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [selectedProjectId]);

  const loadBundle = useCallback(async (projectId: string) => {
    if (!projectId) {
      setBundle(null);
      return;
    }
    try {
      const loaded = await novelStudioApi.getProjectBundle(projectId);
      setBundle(loaded);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  useEffect(() => {
    if (selectedProjectId) {
      void loadBundle(selectedProjectId);
    }
  }, [selectedProjectId, loadBundle]);

  const hasInFlightChapter = useMemo(() => {
    if (!bundle) return false;
    return Object.values(bundle.project.chapters).some((ch) =>
      ['ideating', 'drafting', 'summarizing', 'rewriting'].includes(ch.stage),
    );
  }, [bundle]);

  useEffect(() => {
    if (!hasInFlightChapter || !selectedProjectId) return undefined;
    const timer = window.setInterval(() => {
      void loadBundle(selectedProjectId);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [hasInFlightChapter, selectedProjectId, loadBundle]);

  const refreshAll = useCallback(async () => {
    await loadOverview();
    if (selectedProjectId) await loadBundle(selectedProjectId);
  }, [loadOverview, loadBundle, selectedProjectId]);

  const handleCreateProject = async () => {
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      const created = await novelStudioApi.createProject({
        title: newTitle.trim(),
        genre: newGenre.trim(),
        premise: newMasterOutline.trim().slice(0, 400),
        authorMasterOutlineMarkdown: newMasterOutline.trim(),
        copilotCatId: newCopilotCatId,
        enableMechanicsLedger: newMechanics,
        createEditorialThread: true,
      });
      setNewTitle('');
      setNewMasterOutline('');
      setShowNewProject(false);
      await loadOverview();
      setSelectedProjectId(created.project.id);
      setSelectedChapterNo(1);
      setBundle(created);
      setActiveTab('copilot');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const jumpToEditorialThread = (threadId: string) => {
    if (!threadId) return;
    if (typeof window !== 'undefined') {
      pushThreadRouteWithHistory(threadId, window);
    }
    onRequestSplitChat?.();
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-cafe-surface-canvas text-cafe">
      {/* Studio Header & Project Selector */}
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-cafe bg-cafe-surface px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="font-serif text-base font-semibold tracking-tight text-cafe">Clowder · 小说共创工坊</span>
          <select
            value={selectedProjectId}
            onChange={(e) => {
              const pid = e.target.value;
              setSelectedProjectId(pid);
              const matched = overview?.projects.find((p) => p.id === pid);
              if (matched) setSelectedChapterNo(matched.currentChapterNo || 1);
            }}
            className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1 text-xs font-medium text-cafe"
          >
            {(!overview || overview.projects.length === 0) && <option value="">尚未创建小说项目</option>}
            {overview?.projects.map((p) => (
              <option key={p.id} value={p.id}>
                《{p.title}》 · 第 {p.currentChapterNo} 章
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setShowNewProject((v) => !v)}
            className="rounded-md bg-cafe-accent px-2.5 py-1 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover"
          >
            + 新建小说工程
          </button>
        </div>

        {/* 3 Focused Co-Pilot Tabs */}
        <nav className="flex items-center gap-1 rounded-lg bg-cafe-surface-sunken p-1">
          {(
            [
              ['copilot', '1. 逐章共创台', SparklesIcon],
              ['bible', '2. 总结大纲与设定集', FeatherIcon],
              ['styles', '3. 参照小说风格库', BookIcon],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                activeTab === id ? 'bg-cafe-surface text-cafe shadow-sm' : 'text-cafe-muted hover:text-cafe'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{label}</span>
            </button>
          ))}
        </nav>
      </header>

      {/* New Novel Project Drawer with Human Initial Outline Input */}
      {showNewProject && (
        <div className="border-b border-cafe bg-cafe-surface-sunken px-4 py-3">
          <div className="space-y-2.5">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="新小说书名（必填）"
                className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
              />
              <input
                type="text"
                value={newGenre}
                onChange={(e) => setNewGenre(e.target.value)}
                placeholder="题材类型（如：东方仙侠 / 悬疑无限流 / 都市异能）"
                className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
              />
              <select
                value={newCopilotCatId}
                onChange={(e) => setNewCopilotCatId(e.target.value)}
                className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
              >
                {(overview?.cats ?? [{ id: 'kimi', name: '梵花猫' }]).map((c) => (
                  <option key={c.id} value={c.id}>
                    主创共创猫：{c.nickname ? `${c.nickname} (${c.name})` : c.name} (@{c.id})
                  </option>
                ))}
              </select>
            </div>
            <textarea
              rows={4}
              value={newMasterOutline}
              onChange={(e) => setNewMasterOutline(e.target.value)}
              placeholder="输入你的初始大纲 / 故事主线构想（例如：主角身份、开篇处境、核心目标与大致故事走向。后续每一章开写前，猫猫会据此给出 5 个具体推进方向供你选择）..."
              className="w-full rounded-md border border-cafe bg-cafe-surface-canvas p-2.5 text-xs leading-relaxed text-cafe"
            />
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-xs text-cafe-secondary">
                <input type="checkbox" checked={newMechanics} onChange={(e) => setNewMechanics(e.target.checked)} />
                启用可选系统/境界数值账本
              </label>
              <button
                type="button"
                disabled={creating || !newTitle.trim()}
                onClick={() => void handleCreateProject()}
                className="rounded-md bg-cafe-accent px-4 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
              >
                {creating ? '立项中...' : '创建小说并进入第 1 章共创'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Scrollable Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mb-4 rounded-lg border border-semantic-critical bg-semantic-critical-surface px-3.5 py-2 text-xs text-semantic-critical">
            {error}
          </div>
        )}

        {activeTab === 'styles' && overview && (
          <ReferenceLibraryPanel
            books={overview.books}
            activeProject={bundle?.project}
            embeddingConfig={overview.embeddingConfig}
            onRefresh={refreshAll}
          />
        )}

        {activeTab !== 'styles' && !bundle && (
          <div className="rounded-xl border border-dashed border-cafe bg-cafe-surface p-10 text-center">
            <p className="text-sm font-medium text-cafe">开启你的第一部人机共创小说</p>
            <p className="mt-1 text-xs text-cafe-muted">
              由你输入初始大纲构想 → 每章前 AI 提出 5 个推进思路与提问供你选择或补充 →
              一章一章稳步生成并自动反向沉淀总结式大纲与设定，支持随时回溯重写任意章节。
            </p>
            <button
              type="button"
              onClick={() => setShowNewProject(true)}
              className="mt-4 rounded-md bg-cafe-accent px-4 py-2 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover"
            >
              立即输入初始大纲并新建小说
            </button>
          </div>
        )}

        {activeTab === 'copilot' && bundle && overview && (
          <ChapterCopilotPanel
            project={bundle.project}
            books={overview.books}
            cats={overview.cats}
            selectedChapterNo={selectedChapterNo}
            onSelectChapterNo={setSelectedChapterNo}
            onUpdated={refreshAll}
            onJumpToThread={jumpToEditorialThread}
            onOpenSummaryTab={() => setActiveTab('bible')}
          />
        )}

        {activeTab === 'bible' && bundle && (
          <CanonAndReaderPanel
            project={bundle.project}
            canon={bundle.canon}
            mechanics={bundle.mechanics}
            selectedChapterNo={selectedChapterNo}
            onSelectChapterNo={setSelectedChapterNo}
            onJumpToCopilotChapter={(no) => {
              setSelectedChapterNo(no);
              setActiveTab('copilot');
            }}
            onUpdated={refreshAll}
          />
        )}
      </div>
    </div>
  );
};
