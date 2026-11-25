'use client';

import {
  type BacktrackMode,
  type ChapterDirectionOption,
  type ChapterStage,
  type ChapterStateRecord,
  DIRECTION_FOCUS_LABELS,
  isChapterCompletedStage,
  type NovelProject,
  type ReferenceBookSummary,
} from '@cat-cafe/shared';
import { type FC, useEffect, useMemo, useState } from 'react';
import {
  ChatBubbleIcon,
  EditIcon,
  FeatherIcon,
  PauseStopIcon,
  PlayIcon,
  RotateResetIcon,
  SparklesIcon,
} from './NovelIcons';
import { type CatSummaryItem, novelStudioApi } from './novel-studio-api';

interface ChapterCopilotPanelProps {
  project: NovelProject;
  books: ReferenceBookSummary[];
  cats: CatSummaryItem[];
  selectedChapterNo: number;
  onSelectChapterNo: (no: number) => void;
  onUpdated: () => Promise<void>;
  onJumpToThread?: (threadId: string) => void;
  onOpenSummaryTab?: () => void;
}

const STAGE_BADGE_MAP: Readonly<Record<ChapterStage, { label: string; tone: string }>> = {
  idle: { label: '待构思', tone: 'bg-cafe-surface-sunken text-cafe-muted' },
  ideating: { label: '构思5方向中...', tone: 'bg-semantic-warning-surface text-semantic-warning' },
  awaiting_choice: { label: '待你选方向', tone: 'bg-cafe-accent/15 text-cafe-accent' },
  drafting: { label: '猫猫执笔中...', tone: 'bg-semantic-warning-surface text-semantic-warning' },
  draft_ready: { label: '初稿待审定', tone: 'bg-semantic-success-surface text-semantic-success' },
  summarizing: { label: '提炼总结中...', tone: 'bg-semantic-warning-surface text-semantic-warning' },
  completed: { label: '已定稿沉淀', tone: 'bg-semantic-success-surface text-semantic-success' },
  planned: { label: '待开始', tone: 'bg-cafe-surface-sunken text-cafe-muted' },
  paused: { label: '已暂停', tone: 'bg-semantic-critical-surface text-semantic-critical' },
  prechecking: { label: '预检中', tone: 'bg-semantic-warning-surface text-semantic-warning' },
  reviewing: { label: '审校中', tone: 'bg-semantic-warning-surface text-semantic-warning' },
  rewriting: { label: '微调中...', tone: 'bg-semantic-warning-surface text-semantic-warning' },
  humanizing: { label: '润色中', tone: 'bg-semantic-warning-surface text-semantic-warning' },
  awaiting_approval: { label: '待拍板', tone: 'bg-cafe-accent/15 text-cafe-accent' },
  committed: { label: '已定稿沉淀', tone: 'bg-semantic-success-surface text-semantic-success' },
};

function getChapterEffectiveText(rec: ChapterStateRecord | undefined): string {
  if (!rec) return '';
  return rec.finalText || rec.humanizedDraft || rec.rawDraft || '';
}

function computeTimelineNumbers(project: NovelProject): number[] {
  const existing = Object.keys(project.chapters)
    .map((k) => Number(k))
    .filter((n) => Number.isInteger(n) && n >= 1);
  const maxExisting = existing.length > 0 ? Math.max(...existing) : 0;
  const frontier = Math.max(1, maxExisting, project.currentChapterNo);
  const nums: number[] = [];
  for (let i = 1; i <= frontier; i++) {
    nums.push(i);
  }
  return nums;
}

export const ChapterCopilotPanel: FC<ChapterCopilotPanelProps> = ({
  project,
  books,
  cats,
  selectedChapterNo,
  onSelectChapterNo,
  onUpdated,
  onJumpToThread,
  onOpenSummaryTab,
}) => {
  const [masterOutline, setMasterOutline] = useState(project.authorMasterOutlineMarkdown || project.premise || '');
  const [outlineCollapsed, setOutlineCollapsed] = useState(false);
  const [seedHint, setSeedHint] = useState('');
  const [selectedOptionIds, setSelectedOptionIds] = useState<string[]>([]);
  const [customAuthorInput, setCustomAuthorInput] = useState('');
  const [chapterPromptNotes, setChapterPromptNotes] = useState('');
  const [backtrackMode, setBacktrackMode] = useState<BacktrackMode>('in_place_bridge');
  const [showBacktrackBox, setShowBacktrackBox] = useState(false);

  const [draftTitle, setDraftTitle] = useState('');
  const [draftText, setDraftText] = useState('');
  const [polishFeedback, setPolishFeedback] = useState('');
  const [selectedVersionId, setSelectedVersionId] = useState('');
  const [deepCatSummary, setDeepCatSummary] = useState(Boolean(project.threadId));

  const [editingSummary, setEditingSummary] = useState(false);
  const [summaryOneLine, setSummaryOneLine] = useState('');
  const [summaryEventsText, setSummaryEventsText] = useState('');

  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const currentRecord = project.chapters[String(selectedChapterNo)];
  const prevRecord = project.chapters[String(selectedChapterNo - 1)];
  const nextRecord = project.chapters[String(selectedChapterNo + 1)];
  const prevText = getChapterEffectiveText(prevRecord);
  const nextText = getChapterEffectiveText(nextRecord);
  const isCompleted = isChapterCompletedStage(currentRecord?.stage);

  const hasActiveRun = useMemo(
    () =>
      Object.values(project.chapters).some((ch) =>
        ['ideating', 'drafting', 'summarizing', 'rewriting'].includes(ch.stage),
      ),
    [project.chapters],
  );

  const timelineNumbers = useMemo(() => computeTimelineNumbers(project), [project]);

  useEffect(() => {
    setMasterOutline(project.authorMasterOutlineMarkdown || project.premise || '');
  }, [project.authorMasterOutlineMarkdown, project.premise]);

  useEffect(() => {
    const rec = project.chapters[String(selectedChapterNo)];
    setSeedHint(rec?.authorSeedHint ?? '');
    setSelectedOptionIds(rec?.selectedDirection?.selectedOptionIds ?? []);
    setCustomAuthorInput(rec?.selectedDirection?.customAuthorInput ?? '');
    setChapterPromptNotes(rec?.selectedDirection?.chapterPromptNotes ?? '');
    setDraftTitle(rec?.title || rec?.distilledSummary?.title || '');
    setDraftText(getChapterEffectiveText(rec));
    setSelectedVersionId(rec?.versionHistory[rec.versionHistory.length - 1]?.versionId ?? '');
    setShowBacktrackBox(false);
    setEditingSummary(false);
    if (rec?.distilledSummary) {
      setSummaryOneLine(rec.distilledSummary.oneLineSummary);
      setSummaryEventsText(rec.distilledSummary.keyEvents.join('\n'));
    }
  }, [project, selectedChapterNo]);

  const runAction = async (fn: () => Promise<string | undefined>) => {
    setBusy(true);
    setNotice(null);
    try {
      const msg = await fn();
      await onUpdated();
      if (msg) setNotice(msg);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const toggleOptionId = (optionId: string) => {
    setSelectedOptionIds((prev) =>
      prev.includes(optionId) ? prev.filter((x) => x !== optionId) : [...prev, optionId],
    );
  };

  const primaryRefBookId = project.styleConfig.referenceBookIds[0] ?? '';

  return (
    <div className="space-y-4">
      {/* Top Bar: Co-Pilot Cat + Reference Style Quick Bind + Emergency Pause */}
      <CopilotTopBar
        project={project}
        books={books}
        cats={cats}
        primaryRefBookId={primaryRefBookId}
        hasActiveRun={hasActiveRun}
        busy={busy}
        onJumpToThread={onJumpToThread}
        onChangeConfig={(patch, label) =>
          runAction(async () => {
            await novelStudioApi.updateMasterOutlineAndStyle(project.id, patch);
            return label;
          })
        }
        onEmergencyPause={() =>
          runAction(async () => {
            const res = await novelStudioApi.pauseProject(project.id);
            return `已紧急暂停生成（撤回排队任务 ${res.withdrawnQueueCount} 条），你可自由调整方向或修改正文。`;
          })
        }
      />

      {notice && (
        <div className="rounded-lg border border-cafe bg-cafe-surface px-3.5 py-2 text-xs text-cafe-secondary">
          {notice}
        </div>
      )}

      {/* Two-Column Co-Pilot Workspace */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left Sidebar: Human Master Outline + Chapter Progression & Backtrack Tree */}
        <aside className="space-y-4 lg:col-span-4">
          <section className="rounded-xl border border-cafe bg-cafe-surface p-3.5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-semibold text-cafe">我的初始大纲 / 主线备忘（仅你掌控）</span>
              <button
                type="button"
                onClick={() => setOutlineCollapsed((v) => !v)}
                className="text-xs text-cafe-muted hover:text-cafe"
              >
                {outlineCollapsed ? '展开编辑' : '收起'}
              </button>
            </div>
            {!outlineCollapsed && (
              <div className="mt-2.5 space-y-2">
                <textarea
                  rows={6}
                  value={masterOutline}
                  onChange={(e) => setMasterOutline(e.target.value)}
                  placeholder="在这里输入你的故事主线构想、人物核心动机或近期大方向。AI 只读取它来辅助生章，绝不篡改你的大纲。"
                  className="w-full rounded-lg border border-cafe bg-cafe-surface-canvas p-2.5 text-xs leading-relaxed text-cafe"
                />
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-cafe-muted">总结式大纲将随每章定稿自动沉淀</span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      runAction(async () => {
                        await novelStudioApi.updateMasterOutlineAndStyle(project.id, {
                          authorMasterOutlineMarkdown: masterOutline,
                        });
                        return '已保存你的主线大纲构想。';
                      })
                    }
                    className="rounded-md bg-cafe-accent px-2.5 py-1 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
                  >
                    保存大纲
                  </button>
                </div>
              </div>
            )}
          </section>

          <section className="rounded-xl border border-cafe bg-cafe-surface p-3.5 shadow-sm">
            <div className="mb-2.5 flex items-center justify-between">
              <span className="text-xs font-semibold text-cafe">逐章推进与回溯列表</span>
              <button
                type="button"
                onClick={() => {
                  const nextNo = (timelineNumbers[timelineNumbers.length - 1] ?? 0) + 1;
                  onSelectChapterNo(nextNo);
                }}
                className="rounded-md border border-cafe px-2 py-0.5 text-xs text-cafe hover:bg-cafe-surface-sunken"
              >
                + 开启第 {(timelineNumbers[timelineNumbers.length - 1] ?? 0) + 1} 章
              </button>
            </div>

            <div className="max-h-[480px] space-y-1.5 overflow-y-auto pr-0.5">
              {timelineNumbers.map((no) => {
                const rec = project.chapters[String(no)];
                const stage = rec?.stage ?? 'idle';
                const badge = STAGE_BADGE_MAP[stage];
                const chTitle = rec?.title || rec?.distilledSummary?.title || '未命名章节';
                const wordCount = getChapterEffectiveText(rec).replace(/\s+/g, '').length;
                const active = no === selectedChapterNo;

                return (
                  <button
                    key={no}
                    type="button"
                    onClick={() => onSelectChapterNo(no)}
                    className={`w-full rounded-lg border p-2.5 text-left transition-colors ${
                      active
                        ? 'border-cafe-accent bg-cafe-surface-sunken'
                        : 'border-cafe-subtle bg-cafe-surface-canvas hover:bg-cafe-surface-sunken'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5">
                      <span className="truncate text-xs font-semibold text-cafe">
                        第 {no} 章 · {chTitle}
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${badge.tone}`}>
                        {badge.label}
                      </span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-cafe-muted">
                      <span>{wordCount > 0 ? `${wordCount} 字` : '尚未落笔'}</span>
                      <div className="flex items-center gap-1.5">
                        {rec && rec.versionHistory.length > 0 && <span>含 {rec.versionHistory.length} 份旧稿</span>}
                        {rec?.continuityAlert && (
                          <span className="rounded bg-semantic-warning-surface px-1.5 text-semantic-warning">
                            需核对衔接
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        </aside>

        {/* Right Main Column: 4-Step Single-Chapter Co-Pilot Flow */}
        <main className="space-y-4 lg:col-span-8">
          {/* Header + Backtrack Mode Selector for Completed Chapters */}
          <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="font-serif text-base font-semibold text-cafe">
                  第 {selectedChapterNo} 章{draftTitle ? ` · 《${draftTitle}》` : ' · 逐章共创工作台'}
                </h3>
                <p className="mt-0.5 text-xs text-cafe-muted">
                  先看前章衔接与 5 个方向提问 → 勾选或自己输入本章思路 → 生成/手改正文 → 确认定稿自动反推总结大纲与设定
                </p>
              </div>
              {isCompleted && (
                <button
                  type="button"
                  onClick={() => setShowBacktrackBox((v) => !v)}
                  className="inline-flex items-center gap-1.5 rounded-md border border-cafe-accent px-3 py-1.5 text-xs font-medium text-cafe hover:bg-cafe-surface-sunken"
                >
                  <RotateResetIcon className="h-3.5 w-3.5" />
                  {showBacktrackBox ? '收起回溯面板' : '回溯重生成此章'}
                </button>
              )}
            </div>

            {showBacktrackBox && (
              <BacktrackModeCard
                chapterNo={selectedChapterNo}
                hasDownstreamChapter={Boolean(nextText)}
                backtrackMode={backtrackMode}
                onSelectMode={setBacktrackMode}
              />
            )}

            {/* Continuity Anchor Banner (Upstream K-1 tail + Downstream K+1 opening bridge) */}
            <ContinuityAnchorBanner
              chapterNo={selectedChapterNo}
              prevText={prevText}
              prevEndingAnchor={prevRecord?.distilledSummary?.endingAnchor}
              nextText={nextText}
              nextTitle={nextRecord?.title || nextRecord?.distilledSummary?.title}
              continuityAlert={currentRecord?.continuityAlert}
              onSelectNextChapter={() => onSelectChapterNo(selectedChapterNo + 1)}
            />
          </section>

          {/* Step 1 & 2: 5-Direction Ideation & Author Choice / Custom Input */}
          <DirectionChoiceSection
            chapterNo={selectedChapterNo}
            stage={currentRecord?.stage ?? 'idle'}
            seedHint={seedHint}
            onChangeSeedHint={setSeedHint}
            options={currentRecord?.directionOptions ?? []}
            selectedOptionIds={selectedOptionIds}
            onToggleOption={toggleOptionId}
            customAuthorInput={customAuthorInput}
            onChangeCustomInput={setCustomAuthorInput}
            chapterPromptNotes={chapterPromptNotes}
            onChangePromptNotes={setChapterPromptNotes}
            busy={busy}
            onIdeateDirections={() =>
              runAction(async () => {
                await novelStudioApi.ideateChapterDirections(project.id, selectedChapterNo, {
                  authorSeedHint: seedHint,
                  backtrackMode: isCompleted ? backtrackMode : undefined,
                  wakeCat: true,
                });
                return `已唤醒 @${project.copilotCatId} 结合前文与参照风格构思第 ${selectedChapterNo} 章的 5 个推进方向与提问...`;
              })
            }
            onGenerateDraft={() =>
              runAction(async () => {
                await novelStudioApi.generateChapterFromChoice(project.id, selectedChapterNo, {
                  selectedOptionIds,
                  customAuthorInput,
                  chapterPromptNotes,
                  backtrackMode: isCompleted ? backtrackMode : undefined,
                  wakeCat: true,
                });
                return `已按你的拍板思路唤醒 @${project.copilotCatId} 撰写第 ${selectedChapterNo} 章正文...`;
              })
            }
          />

          {/* Step 3: Manuscript Editor, Version Switcher & Finalize Button */}
          <ManuscriptEditorCard
            chapterNo={selectedChapterNo}
            record={currentRecord}
            draftTitle={draftTitle}
            onChangeTitle={setDraftTitle}
            draftText={draftText}
            onChangeText={setDraftText}
            polishFeedback={polishFeedback}
            onChangePolishFeedback={setPolishFeedback}
            selectedVersionId={selectedVersionId}
            onChangeVersionId={setSelectedVersionId}
            deepCatSummary={deepCatSummary}
            onChangeDeepCatSummary={setDeepCatSummary}
            hasThread={Boolean(project.threadId)}
            busy={busy}
            onSaveManual={() =>
              runAction(async () => {
                await novelStudioApi.saveManualDraft(project.id, selectedChapterNo, {
                  title: draftTitle,
                  content: draftText,
                });
                return `第 ${selectedChapterNo} 章手改草稿已保存。`;
              })
            }
            onRequestPolish={() =>
              runAction(async () => {
                await novelStudioApi.saveManualDraft(project.id, selectedChapterNo, {
                  title: draftTitle,
                  content: draftText,
                });
                await novelStudioApi.requestChapterRewrite(project.id, selectedChapterNo, polishFeedback);
                setPolishFeedback('');
                return `已将修改要求发给 @${project.copilotCatId} 定向精修本章正文。`;
              })
            }
            onRestoreVersion={() =>
              runAction(async () => {
                if (!selectedVersionId) return undefined;
                await novelStudioApi.restoreChapterVersion(project.id, selectedChapterNo, selectedVersionId);
                return `已恢复第 ${selectedChapterNo} 章至历史版本 ${selectedVersionId}，并同步更新了设定快照！`;
              })
            }
            onFinalize={() =>
              runAction(async () => {
                await novelStudioApi.finalizeChapter(project.id, selectedChapterNo, {
                  title: draftTitle,
                  finalTextOverride: draftText,
                  wakeCatForDeepSummary: deepCatSummary && Boolean(project.threadId),
                });
                return (
                  `第 ${selectedChapterNo} 章已正式定稿！总结式大纲与设定快照 #${selectedChapterNo} 已反向沉淀` +
                  (deepCatSummary && project.threadId
                    ? `（@${project.copilotCatId} 正在后台进一步深化设定提取）。`
                    : '。')
                );
              })
            }
          />

          {/* Step 4: Reverse-Distilled Summary & Canon Receipt */}
          {currentRecord?.distilledSummary && (
            <SummaryReceiptCard
              chapterNo={selectedChapterNo}
              summary={currentRecord.distilledSummary}
              editing={editingSummary}
              onToggleEdit={() => setEditingSummary((v) => !v)}
              summaryOneLine={summaryOneLine}
              onChangeOneLine={setSummaryOneLine}
              summaryEventsText={summaryEventsText}
              onChangeEventsText={setSummaryEventsText}
              busy={busy}
              onSaveSummary={() =>
                runAction(async () => {
                  const base = currentRecord.distilledSummary;
                  if (!base) return undefined;
                  await novelStudioApi.updateChapterSummary(project.id, selectedChapterNo, {
                    summary: {
                      title: draftTitle || base.title,
                      oneLineSummary: summaryOneLine.trim() || base.oneLineSummary,
                      keyEvents: summaryEventsText
                        .split(/\r?\n/)
                        .map((s) => s.trim())
                        .filter(Boolean),
                      characterChanges: base.characterChanges,
                      newlyIntroducedSettings: base.newlyIntroducedSettings,
                      openingAnchor: base.openingAnchor,
                      endingAnchor: base.endingAnchor,
                    },
                  });
                  setEditingSummary(false);
                  return `第 ${selectedChapterNo} 章总结式大纲已更新并同步至全书滚动梗概。`;
                })
              }
              onAdvanceNext={() => onSelectChapterNo(selectedChapterNo + 1)}
              onOpenSummaryTab={onOpenSummaryTab}
            />
          )}
        </main>
      </div>
    </div>
  );
};

interface CopilotTopBarProps {
  project: NovelProject;
  books: ReferenceBookSummary[];
  cats: CatSummaryItem[];
  primaryRefBookId: string;
  hasActiveRun: boolean;
  busy: boolean;
  onJumpToThread?: (threadId: string) => void;
  onChangeConfig: (
    patch: Parameters<typeof novelStudioApi.updateMasterOutlineAndStyle>[1],
    label: string,
  ) => Promise<void>;
  onEmergencyPause: () => Promise<void>;
}

const CopilotTopBar: FC<CopilotTopBarProps> = ({
  project,
  books,
  cats,
  primaryRefBookId,
  hasActiveRun,
  busy,
  onJumpToThread,
  onChangeConfig,
  onEmergencyPause,
}) => (
  <section className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-cafe bg-cafe-surface px-4 py-3 shadow-sm">
    <div className="flex flex-wrap items-center gap-3 text-xs">
      <label className="flex items-center gap-1.5">
        <span className="text-cafe-muted">主创共创猫：</span>
        <select
          value={project.copilotCatId}
          onChange={(e) => void onChangeConfig({ copilotCatId: e.target.value }, `主创猫已切换为 @${e.target.value}`)}
          className="rounded-md border border-cafe bg-cafe-surface-canvas px-2 py-1 text-xs font-medium text-cafe"
        >
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nickname ? `${c.nickname} (${c.name})` : c.name} · @{c.id}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5">
        <span className="text-cafe-muted">参照小说风格：</span>
        <select
          value={primaryRefBookId}
          onChange={(e) => {
            const val = e.target.value;
            void onChangeConfig(
              {
                styleConfig: {
                  ...project.styleConfig,
                  referenceBookIds: val ? [val] : [],
                },
              },
              val ? '已更新本章参照小说风格源（仅作用于章前5方向启发与单章文风）' : '已切换为自由原生态文风',
            );
          }}
          className="rounded-md border border-cafe bg-cafe-surface-canvas px-2 py-1 text-xs text-cafe"
        >
          <option value="">不绑定特定参考书（仅用文风预设）</option>
          {books.map((b) => (
            <option key={b.id} value={b.id}>
              《{b.title}》{b.rawStyleStats ? ` · 均句${b.rawStyleStats.avgSentenceLengthChars}字` : ''}
            </option>
          ))}
        </select>
      </label>

      <label className="flex items-center gap-1.5">
        <span className="text-cafe-muted">目标字数：</span>
        <select
          value={project.styleConfig.targetWords}
          onChange={(e) =>
            void onChangeConfig(
              { styleConfig: { ...project.styleConfig, targetWords: Number(e.target.value) } },
              `单章目标字数已设为 ${e.target.value} 字`,
            )
          }
          className="rounded-md border border-cafe bg-cafe-surface-canvas px-2 py-1 text-xs text-cafe"
        >
          {[2000, 3000, 3200, 4000, 5000].map((w) => (
            <option key={w} value={w}>
              {w} 字/章
            </option>
          ))}
        </select>
      </label>
    </div>

    <div className="flex items-center gap-2">
      {hasActiveRun && (
        <button
          type="button"
          disabled={busy}
          onClick={() => void onEmergencyPause()}
          className="inline-flex items-center gap-1.5 rounded-md bg-semantic-critical px-3 py-1 text-xs font-medium text-cafe-white hover:opacity-90 disabled:opacity-50"
        >
          <PauseStopIcon className="h-3.5 w-3.5" />
          紧急暂停生成
        </button>
      )}
      {project.threadId && onJumpToThread && (
        <button
          type="button"
          onClick={() => onJumpToThread(project.threadId ?? '')}
          className="inline-flex items-center gap-1.5 rounded-md border border-cafe px-2.5 py-1 text-xs text-cafe hover:bg-cafe-surface-sunken"
        >
          <ChatBubbleIcon className="h-3.5 w-3.5" />
          共创群聊实时过程
        </button>
      )}
    </div>
  </section>
);

const BacktrackModeCard: FC<{
  chapterNo: number;
  hasDownstreamChapter: boolean;
  backtrackMode: BacktrackMode;
  onSelectMode: (mode: BacktrackMode) => void;
}> = ({ chapterNo, hasDownstreamChapter, backtrackMode, onSelectMode }) => (
  <div className="mt-3 rounded-lg border border-cafe-accent/40 bg-cafe-surface-sunken p-3 text-xs">
    <div className="font-semibold text-cafe">选择第 {chapterNo} 章回溯重生成策略（旧稿会自动存入本章历史版本）：</div>
    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => onSelectMode('in_place_bridge')}
        className={`rounded-lg border p-2.5 text-left ${
          backtrackMode === 'in_place_bridge'
            ? 'border-cafe-accent bg-cafe-surface text-cafe'
            : 'border-cafe-subtle bg-cafe-surface-canvas text-cafe-secondary'
        }`}
      >
        <div className="font-semibold">保留后续章节 · 双端自动衔接（推荐）</div>
        <p className="mt-0.5 text-[11px] text-cafe-muted">
          {hasDownstreamChapter
            ? `同时喂入第 ${chapterNo - 1} 章结尾与第 ${chapterNo + 1} 章开头作为收束目标，重总结后自动体检衔接冲突。`
            : '保留当前时间轴并在本章原位重新构思生成。'}
        </p>
      </button>
      <button
        type="button"
        onClick={() => onSelectMode('rewind_truncate')}
        className={`rounded-lg border p-2.5 text-left ${
          backtrackMode === 'rewind_truncate'
            ? 'border-cafe-accent bg-cafe-surface text-cafe'
            : 'border-cafe-subtle bg-cafe-surface-canvas text-cafe-secondary'
        }`}
      >
        <div className="font-semibold">从此章回档 · 重开新剧情支线</div>
        <p className="mt-0.5 text-[11px] text-cafe-muted">
          将第 {chapterNo} 章及之后的旧章节完整备份至「支线归档」，设定集精确回退至第 {chapterNo - 1} 章末快照重新出发。
        </p>
      </button>
    </div>
  </div>
);

const ContinuityAnchorBanner: FC<{
  chapterNo: number;
  prevText: string;
  prevEndingAnchor?: string;
  nextText: string;
  nextTitle?: string;
  continuityAlert?: ChapterStateRecord['continuityAlert'];
  onSelectNextChapter: () => void;
}> = ({ chapterNo, prevText, prevEndingAnchor, nextText, nextTitle, continuityAlert, onSelectNextChapter }) => {
  if (chapterNo === 1 && !nextText && !continuityAlert) return null;

  return (
    <div className="mt-3 space-y-2">
      {continuityAlert && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-semantic-warning bg-semantic-warning-surface px-3 py-2 text-xs text-semantic-warning">
          <div>
            <span className="font-semibold">{continuityAlert.summary}</span>
            {continuityAlert.details[0] && <span className="ml-1.5 opacity-90">{continuityAlert.details[0]}</span>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {chapterNo > 1 && (
          <div className="rounded-lg border border-cafe-subtle bg-cafe-surface-sunken p-2.5 text-xs">
            <div className="font-medium text-cafe-secondary">承上锚点 · 第 {chapterNo - 1} 章末尾衔接</div>
            <p className="mt-1 line-clamp-3 font-serif text-cafe-muted">
              {prevEndingAnchor || (prevText ? `……${prevText.slice(-220)}` : '上一章尚未完成定稿')}
            </p>
          </div>
        )}
        {nextText && (
          <div className="rounded-lg border border-cafe-accent/40 bg-cafe-surface-sunken p-2.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-medium text-cafe">
                启下锚点 · 需过渡衔接至第 {chapterNo + 1} 章{nextTitle ? `《${nextTitle}》` : ''}
              </span>
              <button
                type="button"
                onClick={onSelectNextChapter}
                className="text-[11px] text-cafe-accent hover:underline"
              >
                查看下章 →
              </button>
            </div>
            <p className="mt-1 line-clamp-3 font-serif text-cafe-muted">{nextText.slice(0, 220)}……</p>
          </div>
        )}
      </div>
    </div>
  );
};

interface DirectionChoiceSectionProps {
  chapterNo: number;
  stage: ChapterStage;
  seedHint: string;
  onChangeSeedHint: (v: string) => void;
  options: ChapterDirectionOption[];
  selectedOptionIds: string[];
  onToggleOption: (id: string) => void;
  customAuthorInput: string;
  onChangeCustomInput: (v: string) => void;
  chapterPromptNotes: string;
  onChangePromptNotes: (v: string) => void;
  busy: boolean;
  onIdeateDirections: () => Promise<void>;
  onGenerateDraft: () => Promise<void>;
}

const DirectionChoiceSection: FC<DirectionChoiceSectionProps> = ({
  chapterNo,
  stage,
  seedHint,
  onChangeSeedHint,
  options,
  selectedOptionIds,
  onToggleOption,
  customAuthorInput,
  onChangeCustomInput,
  chapterPromptNotes,
  onChangePromptNotes,
  busy,
  onIdeateDirections,
  onGenerateDraft,
}) => {
  const canGenerate = selectedOptionIds.length > 0 || customAuthorInput.trim().length > 0;

  return (
    <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <SparklesIcon className="h-4 w-4 text-cafe-accent" />
          <h4 className="text-sm font-semibold text-cafe">Step 1 & 2 · 章前 5 个推进方向提问与你的拍板</h4>
        </div>
        <span className="text-xs text-cafe-muted">可单选/多选融合 AI 方向，或直接在下方手写你的想法</span>
      </div>

      {/* Seed Hint + Ideate Trigger */}
      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input
          type="text"
          value={seedHint}
          onChange={(e) => onChangeSeedHint(e.target.value)}
          placeholder="可选：告诉猫猫本章你隐约想写什么（留空则直接根据前文与主线生成 5 个方向提问）"
          className="flex-1 rounded-md border border-cafe bg-cafe-surface-canvas px-3 py-1.5 text-xs text-cafe"
        />
        <button
          type="button"
          disabled={busy || stage === 'ideating'}
          onClick={() => void onIdeateDirections()}
          className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-cafe-accent px-3.5 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
        >
          <SparklesIcon className="h-3.5 w-3.5" />
          {stage === 'ideating'
            ? '正在构思 5 个方向...'
            : options.length > 0
              ? '换一批（重新生成 5 个方向）'
              : `生成第 ${chapterNo} 章的 5 个方向提问`}
        </button>
      </div>

      {/* 5 Option Cards */}
      {options.length > 0 && (
        <div className="mt-3 grid grid-cols-1 gap-2.5 md:grid-cols-2">
          {options.map((opt, idx) => {
            const checked = selectedOptionIds.includes(opt.optionId);
            return (
              <button
                key={opt.optionId}
                type="button"
                onClick={() => onToggleOption(opt.optionId)}
                className={`rounded-xl border p-3 text-left transition-all ${
                  checked
                    ? 'border-cafe-accent bg-cafe-surface-sunken ring-1 ring-cafe-accent'
                    : 'border-cafe-subtle bg-cafe-surface-canvas hover:border-cafe'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-cafe">
                    方向 {idx + 1} · {opt.title}
                  </span>
                  <span className="rounded-full bg-cafe-surface px-2 py-0.5 text-[11px] text-cafe-secondary">
                    {DIRECTION_FOCUS_LABELS[opt.focusType] ?? opt.focusType}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-cafe-secondary">{opt.pitch}</p>
                {opt.endingHook && <p className="mt-1 text-[11px] text-cafe-muted">预计章末钩子：{opt.endingHook}</p>}
                <div className="mt-2 rounded-md bg-cafe-surface px-2.5 py-1.5 text-[11px] font-medium text-cafe">
                  提问：{opt.guidingQuestion}
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Author Custom Direction / Question Answer + Generate Button */}
      <div className="mt-3 space-y-2 rounded-lg border border-cafe-subtle bg-cafe-surface-sunken p-3">
        <label className="block text-xs font-medium text-cafe">
          我的本章具体走向 / 对上方提问的回答（也可不选卡片直接按你写的生成）：
        </label>
        <textarea
          rows={3}
          value={customAuthorInput}
          onChange={(e) => onChangeCustomInput(e.target.value)}
          placeholder="例如：采用方向 2 的潜入切口，但不要立刻暴露身份；回答提问：暗哨是旧相识，最后留在茶盏底刻字收尾。"
          className="w-full rounded-md border border-cafe bg-cafe-surface-canvas p-2.5 text-xs leading-relaxed text-cafe"
        />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="text"
            value={chapterPromptNotes}
            onChange={(e) => onChangePromptNotes(e.target.value)}
            placeholder="附加本章文风/视角细节提醒（选填，如：多写雨夜环境声、节奏偏冷峻克制）"
            className="flex-1 rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
          />
          <button
            type="button"
            disabled={busy || !canGenerate || stage === 'drafting'}
            onClick={() => void onGenerateDraft()}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-cafe-accent px-4 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
          >
            <PlayIcon className="h-3.5 w-3.5" />
            {stage === 'drafting' ? '猫猫正在撰写本章正文...' : `按此思路生成第 ${chapterNo} 章正文`}
          </button>
        </div>
      </div>
    </section>
  );
};

interface ManuscriptEditorCardProps {
  chapterNo: number;
  record: ChapterStateRecord | undefined;
  draftTitle: string;
  onChangeTitle: (v: string) => void;
  draftText: string;
  onChangeText: (v: string) => void;
  polishFeedback: string;
  onChangePolishFeedback: (v: string) => void;
  selectedVersionId: string;
  onChangeVersionId: (v: string) => void;
  deepCatSummary: boolean;
  onChangeDeepCatSummary: (v: boolean) => void;
  hasThread: boolean;
  busy: boolean;
  onSaveManual: () => Promise<void>;
  onRequestPolish: () => Promise<void>;
  onRestoreVersion: () => Promise<void>;
  onFinalize: () => Promise<void>;
}

const ManuscriptEditorCard: FC<ManuscriptEditorCardProps> = ({
  chapterNo,
  record,
  draftTitle,
  onChangeTitle,
  draftText,
  onChangeText,
  polishFeedback,
  onChangePolishFeedback,
  selectedVersionId,
  onChangeVersionId,
  deepCatSummary,
  onChangeDeepCatSummary,
  hasThread,
  busy,
  onSaveManual,
  onRequestPolish,
  onRestoreVersion,
  onFinalize,
}) => {
  const charCount = draftText.replace(/\s+/g, '').length;
  const versions = record?.versionHistory ?? [];
  const warnings = record?.precheckWarnings ?? [];

  return (
    <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <FeatherIcon className="h-4 w-4 text-cafe-accent" />
          <h4 className="text-sm font-semibold text-cafe">Step 3 · 第 {chapterNo} 章正文编辑与定稿</h4>
          <span className="text-xs text-cafe-muted">({charCount} 字)</span>
        </div>

        {versions.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs">
            <select
              value={selectedVersionId}
              onChange={(e) => onChangeVersionId(e.target.value)}
              className="rounded-md border border-cafe bg-cafe-surface-canvas px-2 py-1 text-xs text-cafe"
            >
              {versions.map((v) => (
                <option key={v.versionId} value={v.versionId}>
                  {v.versionId} · {v.title || '无标题'} ({v.content.length}字)
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={busy || !selectedVersionId}
              onClick={() => void onRestoreVersion()}
              className="rounded-md border border-cafe px-2.5 py-1 text-xs text-cafe hover:bg-cafe-surface-sunken disabled:opacity-50"
            >
              切回此历史稿
            </button>
          </div>
        )}
      </div>

      {warnings.length > 0 && (
        <div className="mt-2.5 space-y-1 rounded-lg bg-semantic-critical-surface p-2.5 text-xs text-semantic-critical">
          {warnings.map((w, idx) => (
            <div key={`${w.category}-${idx}`}>
              [{w.severity.toUpperCase()}] {w.message}
            </div>
          ))}
        </div>
      )}

      <div className="mt-3 space-y-2.5">
        <input
          type="text"
          value={draftTitle}
          onChange={(e) => onChangeTitle(e.target.value)}
          placeholder={`第 ${chapterNo} 章标题（留空则定稿时自动提取）`}
          className="w-full rounded-md border border-cafe bg-cafe-surface-canvas px-3 py-1.5 font-serif text-sm font-semibold text-cafe"
        />
        <textarea
          rows={15}
          value={draftText}
          onChange={(e) => onChangeText(e.target.value)}
          placeholder="等待猫猫按所选方向生成正文，或者你也可以直接在这里动笔写作，写完点「确认定稿」让系统为你自动提炼总结大纲与设定..."
          className="w-full rounded-lg border border-cafe bg-cafe-surface-canvas p-3.5 font-serif text-sm leading-7 text-cafe"
        />
      </div>

      {/* Polish & Finalize Action Bar */}
      <div className="mt-3 space-y-2.5 border-t border-cafe-subtle pt-3">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={polishFeedback}
            onChange={(e) => onChangePolishFeedback(e.target.value)}
            placeholder="对当前草稿有局部不满意？输入修改指令（如：把结尾改成两人在风雪渡口拔刀对峙）..."
            className="flex-1 rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
          />
          <button
            type="button"
            disabled={busy || !polishFeedback.trim() || !draftText.trim()}
            onClick={() => void onRequestPolish()}
            className="rounded-md border border-cafe px-3 py-1.5 text-xs text-cafe hover:bg-cafe-surface-sunken disabled:opacity-50"
          >
            让猫按指令局部精修
          </button>
          <button
            type="button"
            disabled={busy || !draftText.trim()}
            onClick={() => void onSaveManual()}
            className="rounded-md border border-cafe px-3 py-1.5 text-xs text-cafe hover:bg-cafe-surface-sunken disabled:opacity-50"
          >
            保存手改草稿
          </button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2">
          {hasThread ? (
            <label className="flex items-center gap-1.5 text-xs text-cafe-secondary">
              <input
                type="checkbox"
                checked={deepCatSummary}
                onChange={(e) => onChangeDeepCatSummary(e.target.checked)}
              />
              定稿时同步唤醒主创猫深度提取人物/伏笔结构化账本
            </label>
          ) : (
            <span className="text-xs text-cafe-muted">定稿后将立即按当前正文反向生成本章总结式大纲与设定快照</span>
          )}
          <button
            type="button"
            disabled={busy || !draftText.trim()}
            onClick={() => void onFinalize()}
            className="rounded-md bg-cafe-accent px-4 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
          >
            确认定稿本章 → 生成总结大纲与设定快照
          </button>
        </div>
      </div>
    </section>
  );
};

const SummaryReceiptCard: FC<{
  chapterNo: number;
  summary: NonNullable<ChapterStateRecord['distilledSummary']>;
  editing: boolean;
  onToggleEdit: () => void;
  summaryOneLine: string;
  onChangeOneLine: (v: string) => void;
  summaryEventsText: string;
  onChangeEventsText: (v: string) => void;
  busy: boolean;
  onSaveSummary: () => Promise<void>;
  onAdvanceNext: () => void;
  onOpenSummaryTab?: () => void;
}> = ({
  chapterNo,
  summary,
  editing,
  onToggleEdit,
  summaryOneLine,
  onChangeOneLine,
  summaryEventsText,
  onChangeEventsText,
  busy,
  onSaveSummary,
  onAdvanceNext,
  onOpenSummaryTab,
}) => (
  <section className="rounded-xl border border-semantic-success/40 bg-cafe-surface p-4 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs font-semibold text-semantic-success">
        Step 4 · 第 {chapterNo} 章反向沉淀总结式大纲（已同步快照 #{chapterNo}）
      </span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onToggleEdit}
          className="inline-flex items-center gap-1 rounded border border-cafe px-2 py-0.5 text-xs text-cafe hover:bg-cafe-surface-sunken"
        >
          <EditIcon className="h-3 w-3" />
          {editing ? '取消编辑' : '微调总结'}
        </button>
        {onOpenSummaryTab && (
          <button
            type="button"
            onClick={onOpenSummaryTab}
            className="rounded border border-cafe px-2 py-0.5 text-xs text-cafe-secondary hover:bg-cafe-surface-sunken"
          >
            查看全书总结大纲与设定集
          </button>
        )}
        <button
          type="button"
          onClick={onAdvanceNext}
          className="rounded-md bg-cafe-accent px-3 py-1 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover"
        >
          继续推进第 {chapterNo + 1} 章 →
        </button>
      </div>
    </div>

    {editing ? (
      <div className="mt-2.5 space-y-2">
        <input
          type="text"
          value={summaryOneLine}
          onChange={(e) => onChangeOneLine(e.target.value)}
          className="w-full rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
          placeholder="一句话本章总结"
        />
        <textarea
          rows={4}
          value={summaryEventsText}
          onChange={(e) => onChangeEventsText(e.target.value)}
          className="w-full rounded-md border border-cafe bg-cafe-surface-canvas p-2.5 text-xs text-cafe"
          placeholder="每行一条本章关键事件"
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void onSaveSummary()}
          className="rounded-md bg-cafe-accent px-3 py-1 text-xs font-medium text-cafe-white"
        >
          保存总结修改
        </button>
      </div>
    ) : (
      <div className="mt-2 space-y-1.5 text-xs text-cafe-secondary">
        <p>
          <strong className="text-cafe">一句话总结：</strong>
          {summary.oneLineSummary}
        </p>
        {summary.keyEvents.length > 0 && (
          <p>
            <strong className="text-cafe">关键事件：</strong>
            {summary.keyEvents.join(' → ')}
          </p>
        )}
        {summary.newlyIntroducedSettings.length > 0 && (
          <p>
            <strong className="text-cafe">新沉淀设定词条：</strong>
            {summary.newlyIntroducedSettings.join('、')}
          </p>
        )}
      </div>
    )}
  </section>
);
