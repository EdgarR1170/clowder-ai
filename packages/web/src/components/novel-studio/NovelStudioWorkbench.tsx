'use client';

import type { StudioWizardStep } from '@cat-cafe/shared';
import { type FC, useCallback, useEffect, useMemo, useState } from 'react';
import { pushThreadRouteWithHistory } from '@/components/ThreadSidebar/thread-navigation';
import { ChatBubbleIcon, PauseStopIcon } from './NovelIcons';
import { type NovelOverviewResponse, type NovelProjectBundleDto, novelStudioApi } from './novel-studio-api';
import { ReferenceLibraryPanel } from './ReferenceLibraryPanel';
import { Step1CreateNovel, Step2SelectModuleReferences } from './StepCreateAndReferences';
import { StepNextChapterFunnel } from './StepNextChapterFunnel';
import { StepOnboardingDissection } from './StepOnboardingDissection';
import { Step5HumanRevision, Step6DeAiPage, Step7FinalProductEditor } from './StepReviseHumanizeFinal';

const WIZARD_STEP_META: ReadonlyArray<{ step: StudioWizardStep; num: number; label: string }> = [
  { step: 'library', num: 0, label: '风格库导入' },
  { step: 'create', num: 1, label: '创建小说' },
  { step: 'references', num: 2, label: '选择参照小说' },
  { step: 'onboarding', num: 3, label: '设定与前三章' },
  { step: 'generate', num: 4, label: '生成下一章' },
  { step: 'revise', num: 5, label: '人工建议调整' },
  { step: 'humanize', num: 6, label: '去AI味优化' },
  { step: 'final', num: 7, label: '编辑最终成品' },
];

interface NovelStudioWorkbenchProps {
  onRequestSplitChat?: () => void;
}

export const NovelStudioWorkbench: FC<NovelStudioWorkbenchProps> = ({ onRequestSplitChat }) => {
  const [activeStep, setActiveStep] = useState<StudioWizardStep>('create');
  const [overview, setOverview] = useState<NovelOverviewResponse | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [bundle, setBundle] = useState<NovelProjectBundleDto | null>(null);
  const [workingChapterNo, setWorkingChapterNo] = useState<number>(1);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    try {
      const data = await novelStudioApi.fetchOverview();
      setOverview(data);
      setError(null);
      const firstProject = data.projects[0];
      if (!selectedProjectId && firstProject) {
        setSelectedProjectId(firstProject.id);
        setWorkingChapterNo(firstProject.currentChapterNo || 1);
        setActiveStep(firstProject.activeWizardStep || 'references');
      } else if (!firstProject && data.books.length === 0) {
        setActiveStep('library');
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

  const refreshAll = useCallback(async () => {
    await loadOverview();
    if (selectedProjectId) await loadBundle(selectedProjectId);
  }, [loadOverview, loadBundle, selectedProjectId]);

  const isCatsWorking = useMemo(() => {
    if (!bundle) return false;
    if (bundle.project.dissectionReport?.status === 'analyzing') return true;
    return Object.values(bundle.project.chapters).some((ch) =>
      ['ideating_directions', 'ideating_beats', 'drafting', 'revising', 'humanizing'].includes(ch.stage),
    );
  }, [bundle]);

  useEffect(() => {
    if (!isCatsWorking || !selectedProjectId) return undefined;
    const timer = window.setInterval(() => {
      void loadBundle(selectedProjectId);
    }, 2500);
    return () => window.clearInterval(timer);
  }, [isCatsWorking, selectedProjectId, loadBundle]);

  const navigateStep = (nextStep: StudioWizardStep) => {
    setActiveStep(nextStep);
    if (bundle?.project.id && nextStep !== 'library' && nextStep !== 'create') {
      void novelStudioApi.setWizardStep(bundle.project.id, nextStep);
    }
  };

  const jumpToEditorialThread = (threadId: string) => {
    if (!threadId) return;
    if (typeof window !== 'undefined') {
      pushThreadRouteWithHistory(threadId, window);
    }
    onRequestSplitChat?.();
  };

  const needsProject = !['library', 'create'].includes(activeStep);

  return (
    <div className="flex h-full min-h-0 flex-col bg-cafe-surface-canvas text-cafe">
      {/* Top Bar + Clean 0..7 Linear Stepper */}
      <header className="border-b border-cafe bg-cafe-surface px-4 py-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <span className="font-serif text-base font-semibold tracking-tight text-cafe">Clowder · 小说工坊</span>
            {overview && overview.projects.length > 0 && (
              <select
                value={selectedProjectId}
                onChange={(e) => {
                  const pid = e.target.value;
                  setSelectedProjectId(pid);
                  const found = overview.projects.find((p) => p.id === pid);
                  if (found) {
                    setWorkingChapterNo(found.currentChapterNo || 1);
                    setActiveStep(found.activeWizardStep || 'references');
                  }
                }}
                className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1 text-xs font-medium text-cafe"
              >
                {overview.projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    《{p.title}》 · 第 {p.currentChapterNo} 章
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="flex items-center gap-2">
            {isCatsWorking && bundle && (
              <button
                type="button"
                onClick={async () => {
                  await novelStudioApi.pauseProject(bundle.project.id);
                  await refreshAll();
                }}
                className="inline-flex items-center gap-1 rounded-md bg-semantic-critical px-2.5 py-1 text-xs font-medium text-cafe-white"
              >
                <PauseStopIcon className="h-3.5 w-3.5" />
                紧急暂停猫猫
              </button>
            )}
            {bundle?.project.threadId && (
              <button
                type="button"
                onClick={() => jumpToEditorialThread(bundle.project.threadId ?? '')}
                className="inline-flex items-center gap-1 rounded-md border border-cafe px-2.5 py-1 text-xs text-cafe hover:bg-cafe-surface-sunken"
              >
                <ChatBubbleIcon className="h-3.5 w-3.5" />
                查看多猫群聊实况
              </button>
            )}
          </div>
        </div>

        {/* 0 → 7 Step Bar */}
        <nav className="mt-2.5 flex items-center gap-1 overflow-x-auto pb-0.5">
          {WIZARD_STEP_META.map((item) => {
            const active = activeStep === item.step;
            return (
              <button
                key={item.step}
                type="button"
                onClick={() => navigateStep(item.step)}
                className={`shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? 'bg-cafe-accent text-cafe-white shadow-sm'
                    : 'bg-cafe-surface-sunken text-cafe-secondary hover:text-cafe'
                }`}
              >
                {item.num}. {item.label}
              </button>
            );
          })}
        </nav>
      </header>

      {/* Main Step Viewport */}
      <div className="flex-1 overflow-y-auto p-4">
        {error && (
          <div className="mx-auto mb-4 max-w-5xl rounded-lg border border-semantic-critical bg-semantic-critical-surface px-3.5 py-2 text-xs text-semantic-critical">
            {error}
          </div>
        )}

        {activeStep === 'library' && overview && (
          <ReferenceLibraryPanel
            books={overview.books}
            hasActiveProject={Boolean(bundle)}
            onRefresh={refreshAll}
            onGoNextStep={() => navigateStep(bundle ? 'references' : 'create')}
          />
        )}

        {activeStep === 'create' && overview && (
          <Step1CreateNovel
            projects={overview.projects}
            cats={overview.cats}
            selectedProjectId={selectedProjectId}
            onSelectExistingProject={(pid) => {
              setSelectedProjectId(pid);
              navigateStep('references');
            }}
            onCreatedProject={async (created) => {
              await loadOverview();
              setSelectedProjectId(created.project.id);
              setBundle(created);
              setWorkingChapterNo(1);
              setActiveStep('references');
            }}
          />
        )}

        {needsProject && !bundle && (
          <div className="mx-auto max-w-xl rounded-xl border border-dashed border-cafe bg-cafe-surface p-8 text-center">
            <p className="text-sm font-medium text-cafe">请先在第 1 步创建或选择一部小说</p>
            <button
              type="button"
              onClick={() => setActiveStep('create')}
              className="mt-3 rounded-md bg-cafe-accent px-4 py-1.5 text-xs font-medium text-cafe-white"
            >
              前往 1. 创建小说
            </button>
          </div>
        )}

        {activeStep === 'references' && bundle && overview && (
          <Step2SelectModuleReferences
            project={bundle.project}
            books={overview.books}
            onJumpToLibrary={() => setActiveStep('library')}
            onSavedAndNext={async () => {
              await refreshAll();
              navigateStep('onboarding');
            }}
          />
        )}

        {activeStep === 'onboarding' && bundle && (
          <StepOnboardingDissection
            project={bundle.project}
            onUpdated={refreshAll}
            onGoStep4={() => {
              const nextNo = Math.max(1, (bundle.project.seedChapterCount || 0) + 1);
              setWorkingChapterNo(nextNo);
              navigateStep('generate');
            }}
          />
        )}

        {activeStep === 'generate' && bundle && (
          <StepNextChapterFunnel
            project={bundle.project}
            chapterNo={workingChapterNo}
            onChangeChapterNo={setWorkingChapterNo}
            onUpdated={refreshAll}
            onGoStep5={() => navigateStep('revise')}
          />
        )}

        {activeStep === 'revise' && bundle && (
          <Step5HumanRevision
            project={bundle.project}
            chapterNo={workingChapterNo}
            onUpdated={refreshAll}
            onGoStep6={() => navigateStep('humanize')}
          />
        )}

        {activeStep === 'humanize' && bundle && (
          <Step6DeAiPage
            project={bundle.project}
            chapterNo={workingChapterNo}
            onUpdated={refreshAll}
            onGoStep7={() => navigateStep('final')}
          />
        )}

        {activeStep === 'final' && bundle && (
          <Step7FinalProductEditor
            project={bundle.project}
            chapterNo={workingChapterNo}
            onUpdated={refreshAll}
            onStartNextChapter={(nextNo) => {
              setWorkingChapterNo(nextNo);
              setActiveStep('generate');
            }}
          />
        )}
      </div>
    </div>
  );
};
