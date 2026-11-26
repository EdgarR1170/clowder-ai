'use client';

import type { NovelProject } from '@cat-cafe/shared';
import { type FC, useEffect, useState } from 'react';
import { DownloadIcon, EditIcon, FeatherIcon, RotateResetIcon, SparklesIcon } from './NovelIcons';
import { novelStudioApi } from './novel-studio-api';

interface Step5HumanRevisionProps {
  project: NovelProject;
  chapterNo: number;
  onUpdated: () => Promise<void>;
  onGoStep6: () => void;
}

export const Step5HumanRevision: FC<Step5HumanRevisionProps> = ({ project, chapterNo, onUpdated, onGoStep6 }) => {
  const record = project.chapters[String(chapterNo)];
  const baseText = record?.rawDraft || record?.finalText || record?.humanizedDraft || '';
  const [editableDraft, setEditableDraft] = useState(baseText);
  const [suggestion, setSuggestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const rec = project.chapters[String(chapterNo)];
    setEditableDraft(rec?.rawDraft || rec?.finalText || rec?.humanizedDraft || '');
  }, [project, chapterNo]);

  const handleRevise = async () => {
    if (!suggestion.trim()) return;
    setBusy(true);
    setNotice(null);
    try {
      await novelStudioApi.reviseChapterWithSuggestion(project.id, chapterNo, {
        suggestion: suggestion.trim(),
        currentTextOverride: editableDraft,
        wakeCats: true,
      });
      setSuggestion('');
      await onUpdated();
      setNotice(
        `已提交修改建议，猫猫正在对第 ${chapterNo} 章执行第 ${(record?.revisionHistory.length ?? 0) + 1} 轮调整...`,
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleProceedStep6 = async () => {
    setBusy(true);
    try {
      if (editableDraft.trim() && editableDraft !== record?.rawDraft) {
        await novelStudioApi.saveManualDraft(project.id, chapterNo, {
          title: record?.title,
          content: editableDraft,
        });
        await onUpdated();
      }
      onGoStep6();
    } finally {
      setBusy(false);
    }
  };

  const rounds = record?.revisionHistory ?? [];

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {notice && (
        <div className="rounded-lg border border-cafe bg-cafe-surface px-3.5 py-2 text-xs text-cafe-secondary">
          {notice}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Left: Current Draft & Revision History Switcher */}
        <section className="rounded-xl border border-cafe bg-cafe-surface p-5 shadow-sm lg:col-span-8">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <EditIcon className="h-4 w-4 text-cafe-accent" />
              <h3 className="text-sm font-semibold text-cafe">
                Step 5 · 第 {chapterNo} 章《{record?.title || '未命名'}》人工建议与调整
              </h3>
              <span className="text-xs text-cafe-muted">({editableDraft.length} 字)</span>
            </div>
            {record?.stage === 'revising' && (
              <span className="rounded-full bg-semantic-warning-surface px-2.5 py-0.5 text-xs text-semantic-warning">
                猫猫正在按你的建议修改中...
              </span>
            )}
          </div>

          <textarea
            rows={18}
            value={editableDraft}
            onChange={(e) => setEditableDraft(e.target.value)}
            placeholder="请先在第 4 步生成本章初稿..."
            className="mt-3 w-full rounded-lg border border-cafe bg-cafe-surface-canvas p-3.5 font-serif text-sm leading-7 text-cafe"
          />
        </section>

        {/* Right: Repeatable Suggestion Input & Version Rollback */}
        <aside className="space-y-4 lg:col-span-4">
          <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
            <h4 className="text-xs font-semibold text-cafe">提出修改建议（可不限次数重复调整）</h4>
            <p className="mt-1 text-[11px] text-cafe-muted">
              哪里节奏不对、动作不够细、台词不符合人设，直接告诉猫猫修改，直到剧情满意为止。
            </p>
            <textarea
              rows={6}
              value={suggestion}
              onChange={(e) => setSuggestion(e.target.value)}
              placeholder="例如：\n1. 中间段两人交手太快结束，增加一处借环境反击的博弈；\n2. 把结尾台词改得更留悬念。"
              className="mt-2.5 w-full rounded-lg border border-cafe bg-cafe-surface-canvas p-2.5 text-xs leading-relaxed text-cafe"
            />
            <button
              type="button"
              disabled={busy || !suggestion.trim() || !editableDraft.trim() || record?.stage === 'revising'}
              onClick={() => void handleRevise()}
              className="mt-2.5 w-full rounded-md bg-cafe-accent px-4 py-2 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
            >
              {record?.stage === 'revising' ? '猫猫正在修改...' : '发送建议让多猫调整本章'}
            </button>
          </section>

          {rounds.length > 0 && (
            <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
              <h4 className="text-xs font-semibold text-cafe">历史调整轮次（可随时撤回）</h4>
              <div className="mt-2 max-h-56 space-y-2 overflow-y-auto">
                {rounds.map((r) => (
                  <div key={r.round} className="rounded-lg bg-cafe-surface-sunken p-2.5 text-xs">
                    <div className="flex items-center justify-between font-medium text-cafe">
                      <span>第 {r.round} 轮建议</span>
                      <button
                        type="button"
                        onClick={async () => {
                          await novelStudioApi.restoreRevisionRound(project.id, chapterNo, r.round, 'previous');
                          await onUpdated();
                        }}
                        className="text-[11px] text-cafe-accent hover:underline"
                      >
                        撤回此轮前版本
                      </button>
                    </div>
                    <p className="mt-1 text-cafe-muted">{r.userSuggestion}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          <button
            type="button"
            disabled={busy || !editableDraft.trim()}
            onClick={() => void handleProceedStep6()}
            className="w-full rounded-xl bg-cafe-accent px-4 py-3 text-xs font-semibold text-cafe-white shadow-sm hover:bg-cafe-accent-hover disabled:opacity-50"
          >
            剧情调整满意，进入第 6 步：去AI味优化页面 →
          </button>
        </aside>
      </div>
    </div>
  );
};

interface Step6DeAiPageProps {
  project: NovelProject;
  chapterNo: number;
  onUpdated: () => Promise<void>;
  onGoStep7: () => void;
}

export const Step6DeAiPage: FC<Step6DeAiPageProps> = ({ project, chapterNo, onUpdated, onGoStep7 }) => {
  const record = project.chapters[String(chapterNo)];
  const [toneHint, setToneHint] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const rawBefore = record?.rawDraft || '';
  const humanizedAfter = record?.humanizedDraft || record?.finalText || rawBefore;
  const report = record?.humanizerReport;

  const handleRunHumanize = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await novelStudioApi.humanizeChapter(project.id, chapterNo, {
        extraToneHint: toneHint.trim() || undefined,
        wakeCats: true,
      });
      await onUpdated();
      setNotice('已运行 AI 套话扫描并唤醒精修猫贴合你的前三章原生语感执行去AI味优化！');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Top Diagnostic & Action Card */}
      <section className="rounded-xl border border-cafe bg-cafe-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <SparklesIcon className="h-4 w-4 text-cafe-accent" />
              <h3 className="text-base font-semibold text-cafe">Step 6 · 去AI味专项优化页面（第 {chapterNo} 章）</h3>
              {report && (
                <span className="rounded-full bg-cafe-surface-sunken px-2.5 py-0.5 text-xs font-medium text-cafe">
                  AI 腔诊断指数：{report.aiFlavorScore}/100（扫描到 {report.flags.length} 处套话/机械句）
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-cafe-muted">
              保持 Step 5 确认的剧情事实零改动，专门清理五官套话、排比三连、总结升华腔，向你前三章的原生真人语感靠拢。
            </p>
          </div>
          <button
            type="button"
            disabled={!humanizedAfter.trim()}
            onClick={onGoStep7}
            className="rounded-md bg-cafe-accent px-4 py-2 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
          >
            进入第 7 步：用户编辑最终成品 →
          </button>
        </div>

        {notice && (
          <div className="mt-3 rounded-lg bg-cafe-surface-sunken px-3 py-2 text-xs text-cafe-secondary">{notice}</div>
        )}

        <div className="mt-3.5 flex flex-col gap-2 sm:flex-row">
          <input
            type="text"
            value={toneHint}
            onChange={(e) => setToneHint(e.target.value)}
            placeholder="可选：补充去AI味要求（如：句子再短促干脆一些，少用四字成语堆砌）"
            className="flex-1 rounded-md border border-cafe bg-cafe-surface-canvas px-3 py-1.5 text-xs text-cafe"
          />
          <button
            type="button"
            disabled={busy || !rawBefore.trim() || record?.stage === 'humanizing'}
            onClick={() => void handleRunHumanize()}
            className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md border border-cafe-accent bg-cafe-surface px-4 py-1.5 text-xs font-medium text-cafe hover:bg-cafe-surface-sunken disabled:opacity-50"
          >
            <RotateResetIcon className="h-3.5 w-3.5" />
            {record?.stage === 'humanizing' ? '正在深度去AI味精修...' : '一键执行多猫去AI味优化（可重刷）'}
          </button>
        </div>

        {report && report.flags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {report.flags.slice(0, 8).map((flag, idx) => (
              <span
                key={`${flag.ruleId}-${idx}`}
                className="rounded-md bg-semantic-warning-surface px-2 py-1 text-[11px] text-semantic-warning"
              >
                第{flag.paragraphIndex + 1}段：「{flag.matchedText}」
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Side-by-Side Comparison */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
          <div className="mb-2 border-b border-cafe-subtle pb-2 text-xs font-semibold text-cafe-muted">
            优化前原稿（Step 5 剧情定版 · {rawBefore.length} 字）
          </div>
          <div className="max-h-[460px] overflow-y-auto whitespace-pre-wrap font-serif text-sm leading-7 text-cafe-secondary">
            {rawBefore || '暂无原稿'}
          </div>
        </section>

        <section className="rounded-xl border border-cafe-accent/50 bg-cafe-surface p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between border-b border-cafe-subtle pb-2 text-xs">
            <span className="font-semibold text-cafe">去AI味优化后稿（{humanizedAfter.length} 字）</span>
            <span className="text-semantic-success">已同步至第 7 步终稿台</span>
          </div>
          <div className="max-h-[460px] overflow-y-auto whitespace-pre-wrap font-serif text-sm leading-7 text-cafe">
            {humanizedAfter || '点击上方按钮执行去AI味优化'}
          </div>
        </section>
      </div>
    </div>
  );
};

interface Step7FinalProductEditorProps {
  project: NovelProject;
  chapterNo: number;
  onUpdated: () => Promise<void>;
  onStartNextChapter: (nextChapterNo: number) => void;
}

export const Step7FinalProductEditor: FC<Step7FinalProductEditorProps> = ({
  project,
  chapterNo,
  onUpdated,
  onStartNextChapter,
}) => {
  const record = project.chapters[String(chapterNo)];
  const [title, setTitle] = useState(record?.title || '');
  const [finalText, setFinalText] = useState(record?.finalText || record?.humanizedDraft || record?.rawDraft || '');
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const rec = project.chapters[String(chapterNo)];
    setTitle(rec?.title || '');
    setFinalText(rec?.finalText || rec?.humanizedDraft || rec?.rawDraft || '');
  }, [project, chapterNo]);

  const handleFinalize = async (advanceNext: boolean) => {
    if (!finalText.trim()) return;
    setSaving(true);
    setNotice(null);
    try {
      await novelStudioApi.finalizeChapterProduct(project.id, chapterNo, {
        title: title.trim() || undefined,
        finalText,
        advanceToNextChapter: advanceNext,
      });
      await onUpdated();
      if (advanceNext) {
        onStartNextChapter(chapterNo + 1);
      } else {
        setNotice(`第 ${chapterNo} 章最终成品已正式保存定稿！`);
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleExportWholeBook = async (format: 'md' | 'txt') => {
    const exported = await novelStudioApi.exportManuscript(project.id, format);
    const blob = new Blob([exported.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exported.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const wordCount = finalText.replace(/\s+/g, '').length;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <section className="rounded-xl border border-cafe bg-cafe-surface p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FeatherIcon className="h-4 w-4 text-cafe-accent" />
            <h3 className="text-base font-semibold text-cafe">Step 7 · 编辑第 {chapterNo} 章最终成品</h3>
            <span className="text-xs text-cafe-muted">（净字数 {wordCount} 字）</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void handleExportWholeBook('md')}
              className="inline-flex items-center gap-1 rounded-md border border-cafe px-2.5 py-1 text-xs text-cafe hover:bg-cafe-surface-sunken"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              导出整书 .md
            </button>
            <button
              type="button"
              onClick={() => void handleExportWholeBook('txt')}
              className="inline-flex items-center gap-1 rounded-md border border-cafe px-2.5 py-1 text-xs text-cafe hover:bg-cafe-surface-sunken"
            >
              <DownloadIcon className="h-3.5 w-3.5" />
              导出整书 .txt
            </button>
          </div>
        </div>

        {notice && (
          <div className="mt-3 rounded-lg bg-semantic-success-surface px-3.5 py-2 text-xs text-semantic-success">
            {notice}
          </div>
        )}

        <div className="mt-4 space-y-3">
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={`第 ${chapterNo} 章最终章节名`}
            className="w-full rounded-md border border-cafe bg-cafe-surface-canvas px-3.5 py-2 font-serif text-base font-semibold text-cafe"
          />
          <textarea
            rows={20}
            value={finalText}
            onChange={(e) => setFinalText(e.target.value)}
            placeholder="在这里做最后的字句润色与排版确认..."
            className="w-full rounded-xl border border-cafe bg-cafe-surface-canvas p-4 font-serif text-base leading-8 text-cafe"
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2.5">
          <button
            type="button"
            disabled={saving || !finalText.trim()}
            onClick={() => void handleFinalize(false)}
            className="rounded-md border border-cafe px-4 py-2 text-xs font-medium text-cafe hover:bg-cafe-surface-sunken disabled:opacity-50"
          >
            仅保存本章最终成品
          </button>
          <button
            type="button"
            disabled={saving || !finalText.trim()}
            onClick={() => void handleFinalize(true)}
            className="rounded-md bg-cafe-accent px-5 py-2 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
          >
            确认定稿第 {chapterNo} 章，并继续生成第 {chapterNo + 1} 章 →
          </button>
        </div>
      </section>
    </div>
  );
};
