'use client';

import { type FC, useCallback, useEffect, useState } from 'react';
import { pushThreadRouteWithHistory } from '@/components/ThreadSidebar/thread-navigation';
import { CanonAndReaderPanel } from './CanonAndReaderPanel';
import { ChapterPipelinePanel } from './ChapterPipelinePanel';
import { BookIcon, FeatherIcon, MatrixIcon, PipelineIcon } from './NovelIcons';
import { type NovelOverviewResponse, type NovelProjectBundleDto, novelStudioApi } from './novel-studio-api';
import { ReferenceLibraryPanel } from './ReferenceLibraryPanel';
import { SkillMatrixPanel } from './SkillMatrixPanel';

type StudioTab = 'library' | 'matrix' | 'pipeline' | 'reader';

interface NovelStudioWorkbenchProps {
  onRequestSplitChat?: () => void;
}

export const NovelStudioWorkbench: FC<NovelStudioWorkbenchProps> = ({ onRequestSplitChat }) => {
  const [activeTab, setActiveTab] = useState<StudioTab>('library');
  const [overview, setOverview] = useState<NovelOverviewResponse | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [bundle, setBundle] = useState<NovelProjectBundleDto | null>(null);
  const [readerChapterNo, setReaderChapterNo] = useState<number>(1);
  const [showNewProject, setShowNewProject] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newGenre, setNewGenre] = useState('东方玄幻 / 群像权谋');
  const [newPremise, setNewPremise] = useState('');
  const [newMechanics, setNewMechanics] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const data = await novelStudioApi.fetchOverview();
      setOverview(data);
      setError(null);
      if (!selectedProjectId && data.projects.length > 0) {
        setSelectedProjectId(data.projects[0]!.id);
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
      const b = await novelStudioApi.getProjectBundle(projectId);
      setBundle(b);
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
        premise: newPremise.trim(),
        enableMechanicsLedger: newMechanics,
        createEditorialThread: true,
      });
      setNewTitle('');
      setNewPremise('');
      setShowNewProject(false);
      await loadOverview();
      setSelectedProjectId(created.project.id);
      setBundle(created);
      setActiveTab('matrix');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  const jumpToEditorialThread = (threadId: string) => {
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
          <span className="font-serif text-base font-semibold tracking-tight text-cafe">Clowder · 小说工坊</span>
          <select
            value={selectedProjectId}
            onChange={(e) => setSelectedProjectId(e.target.value)}
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

        {/* 4 Core Studio Tabs */}
        <nav className="flex items-center gap-1 rounded-lg bg-cafe-surface-sunken p-1">
          {(
            [
              ['library', '1. 藏书拆解与向量库', BookIcon],
              ['matrix', '2. 多书技法矩阵', MatrixIcon],
              ['pipeline', '3. 大纲与逐章协调', PipelineIcon],
              ['reader', '4. 审稿与防穿帮账本', FeatherIcon],
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

      {/* New Novel Project Drawer */}
      {showNewProject && (
        <div className="border-b border-cafe bg-cafe-surface-sunken px-4 py-3">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
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
              placeholder="题材类型（如：仙侠 / 赛博悬疑 / 系统无限流）"
              className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
            />
            <input
              type="text"
              value={newPremise}
              onChange={(e) => setNewPremise(e.target.value)}
              placeholder="一句话核心卖点/设定钩子"
              className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
            />
            <div className="flex items-center justify-between gap-2">
              <label className="flex items-center gap-1.5 text-xs text-cafe-secondary">
                <input type="checkbox" checked={newMechanics} onChange={(e) => setNewMechanics(e.target.checked)} />
                启用系统数值账本
              </label>
              <button
                type="button"
                disabled={creating || !newTitle.trim()}
                onClick={handleCreateProject}
                className="rounded-md bg-cafe-accent px-3 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
              >
                {creating ? '立项中...' : '创建并开启编辑部'}
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

        {activeTab === 'library' && overview && (
          <ReferenceLibraryPanel
            books={overview.books}
            skills={overview.skills}
            cats={overview.cats}
            embeddingConfig={overview.embeddingConfig}
            activeProjectThreadId={bundle?.project.threadId}
            onRefresh={refreshAll}
          />
        )}

        {activeTab !== 'library' && !bundle && (
          <div className="rounded-xl border border-dashed border-cafe bg-cafe-surface p-10 text-center">
            <p className="text-sm font-medium text-cafe">请先在左上方新建一部小说工程</p>
            <p className="mt-1 text-xs text-cafe-muted">
              新建项目后会自动创建专属「多猫编辑部」群聊，并可为大纲/战斗/人设/场景分别绑定不同参考书的技法 Skill。
            </p>
            <button
              type="button"
              onClick={() => setShowNewProject(true)}
              className="mt-4 rounded-md bg-cafe-accent px-4 py-2 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover"
            >
              立即立项新小说
            </button>
          </div>
        )}

        {activeTab === 'matrix' && bundle && overview && (
          <SkillMatrixPanel
            project={bundle.project}
            books={overview.books}
            skills={overview.skills}
            cats={overview.cats}
            onUpdated={refreshAll}
          />
        )}

        {activeTab === 'pipeline' && bundle && (
          <ChapterPipelinePanel
            project={bundle.project}
            onUpdated={refreshAll}
            onSelectChapterForReader={(no) => {
              setReaderChapterNo(no);
              setActiveTab('reader');
            }}
            onJumpToThread={jumpToEditorialThread}
          />
        )}

        {activeTab === 'reader' && bundle && (
          <CanonAndReaderPanel
            project={bundle.project}
            canon={bundle.canon}
            mechanics={bundle.mechanics}
            selectedChapterNo={readerChapterNo}
            onSelectChapterNo={setReaderChapterNo}
            onUpdated={refreshAll}
          />
        )}
      </div>
    </div>
  );
};
