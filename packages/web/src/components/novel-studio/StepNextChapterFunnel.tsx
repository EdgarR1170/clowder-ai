'use client';

import {
  type ChapterDetailedOutlineOption,
  type ChapterMacroDirection,
  NOVEL_CRAFT_DIMENSION_LABELS,
  type NovelProject,
} from '@cat-cafe/shared';
import { type FC, useEffect, useState } from 'react';
import { PlayIcon, RotateResetIcon, SparklesIcon } from './NovelIcons';
import { novelStudioApi } from './novel-studio-api';

interface StepNextChapterFunnelProps {
  project: NovelProject;
  chapterNo: number;
  onChangeChapterNo: (no: number) => void;
  onUpdated: () => Promise<void>;
  onGoStep5: () => void;
}

export const StepNextChapterFunnel: FC<StepNextChapterFunnelProps> = ({
  project,
  chapterNo,
  onChangeChapterNo,
  onUpdated,
  onGoStep5,
}) => {
  const record = project.chapters[String(chapterNo)];
  const [macroHint, setMacroHint] = useState(record?.macroFeedbackHint ?? '');
  const [selectedMacroId, setSelectedMacroId] = useState(record?.selectedMacroDirectionId ?? '');
  const [beatHint, setBeatHint] = useState(record?.detailedFeedbackHint ?? '');
  const [selectedBeatId, setSelectedBeatId] = useState(record?.selectedDetailedOutlineId ?? '');
  const [extraDraftNote, setExtraDraftNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    const rec = project.chapters[String(chapterNo)];
    setMacroHint(rec?.macroFeedbackHint ?? '');
    setSelectedMacroId(rec?.selectedMacroDirectionId ?? '');
    setBeatHint(rec?.detailedFeedbackHint ?? '');
    setSelectedBeatId(rec?.selectedDetailedOutlineId ?? '');
  }, [project, chapterNo]);

  const runTask = async (fn: () => Promise<string>) => {
    setBusy(true);
    setNotice(null);
    try {
      const msg = await fn();
      await onUpdated();
      setNotice(msg);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const minEditableChapter = Math.max(1, (project.seedChapterCount || 0) + 1);
  const maxExisting = Math.max(
    minEditableChapter,
    project.currentChapterNo,
    ...Object.keys(project.chapters).map((k) => Number(k) || 1),
  );
  const chapterOptions: number[] = [];
  for (let i = minEditableChapter; i <= maxExisting; i++) {
    chapterOptions.push(i);
  }

  const macroDirections = record?.macroDirections ?? [];
  const detailedOutlines = record?.detailedOutlineOptions ?? [];
  const currentDraft = (record?.rawDraft || record?.humanizedDraft || record?.finalText || '').trim();
  const stage = record?.stage ?? 'idle';

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      {/* Chapter Picker Header */}
      <section className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cafe bg-cafe-surface px-5 py-3.5 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-serif text-base font-semibold text-cafe">Step 4 · 多猫生成下一章</span>
          <select
            value={chapterNo}
            onChange={(e) => onChangeChapterNo(Number(e.target.value))}
            className="rounded-md border border-cafe bg-cafe-surface-canvas px-3 py-1 text-xs font-medium text-cafe"
          >
            {chapterOptions.map((no) => (
              <option key={no} value={no}>
                第 {no} 章{project.chapters[String(no)]?.title ? ` · ${project.chapters[String(no)]?.title}` : ''}
              </option>
            ))}
          </select>
          {project.seedChapterCount > 0 && (
            <span className="text-xs text-cafe-muted">（已承接你粘贴的前 {project.seedChapterCount} 章内容）</span>
          )}
        </div>

        {currentDraft && (
          <button
            type="button"
            onClick={onGoStep5}
            className="rounded-md bg-cafe-accent px-4 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover"
          >
            本章初稿已就绪（{currentDraft.length} 字），进入第 5 步：人工建议与调整 →
          </button>
        )}
      </section>

      {notice && (
        <div className="rounded-lg border border-cafe bg-cafe-surface px-3.5 py-2 text-xs text-cafe-secondary">
          {notice}
        </div>
      )}

      {/* Stage 4A: 5 Macro Chapter Outlines */}
      <MacroDirectionsCard
        chapterNo={chapterNo}
        stage={stage}
        macroHint={macroHint}
        onChangeMacroHint={setMacroHint}
        directions={macroDirections}
        selectedMacroId={selectedMacroId}
        onSelectMacroId={(id) => {
          setSelectedMacroId(id);
          setSelectedBeatId('');
        }}
        busy={busy}
        onGenerateMacro={() =>
          runTask(async () => {
            await novelStudioApi.ideateMacroDirections(project.id, chapterNo, {
              feedbackHint: macroHint,
              wakeCats: true,
            });
            return `已唤醒多猫结合前文与参照模块提出第 ${chapterNo} 章的 5 个大纲方向...`;
          })
        }
      />

      {/* Stage 4B: 5 Detailed Beat Outlines */}
      {macroDirections.length > 0 && (
        <DetailedOutlinesCard
          chapterNo={chapterNo}
          stage={stage}
          selectedMacroId={selectedMacroId}
          beatHint={beatHint}
          onChangeBeatHint={setBeatHint}
          detailedOutlines={detailedOutlines}
          selectedBeatId={selectedBeatId}
          onSelectBeatId={setSelectedBeatId}
          busy={busy}
          onGenerateBeats={() =>
            runTask(async () => {
              await novelStudioApi.ideateDetailedOutlines(project.id, chapterNo, {
                selectedDirectionId: selectedMacroId,
                feedbackHint: beatHint,
                wakeCats: true,
              });
              return `已围绕你选定的大纲方向唤醒多猫展开 5 套本章细纲...`;
            })
          }
        />
      )}

      {/* Stage 4C: Execute Chapter Draft */}
      {detailedOutlines.length > 0 && (
        <ExecuteDraftCard
          chapterNo={chapterNo}
          stage={stage}
          selectedBeatId={selectedBeatId}
          extraDraftNote={extraDraftNote}
          onChangeExtraNote={setExtraDraftNote}
          currentDraft={currentDraft}
          busy={busy}
          onExecuteDraft={() =>
            runTask(async () => {
              await novelStudioApi.executeDraftFromOutline(project.id, chapterNo, {
                selectedDetailedOutlineId: selectedBeatId,
                extraNote: extraDraftNote,
                wakeCats: true,
              });
              return `已按所选细纲与各模块参照风格唤醒主笔猫开始撰写第 ${chapterNo} 章正文...`;
            })
          }
          onGoStep5={onGoStep5}
        />
      )}
    </div>
  );
};

const MacroDirectionsCard: FC<{
  chapterNo: number;
  stage: string;
  macroHint: string;
  onChangeMacroHint: (v: string) => void;
  directions: ChapterMacroDirection[];
  selectedMacroId: string;
  onSelectMacroId: (id: string) => void;
  busy: boolean;
  onGenerateMacro: () => Promise<void>;
}> = ({
  chapterNo,
  stage,
  macroHint,
  onChangeMacroHint,
  directions,
  selectedMacroId,
  onSelectMacroId,
  busy,
  onGenerateMacro,
}) => (
  <section className="rounded-xl border border-cafe bg-cafe-surface p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2">
        <SparklesIcon className="h-4 w-4 text-cafe-accent" />
        <h4 className="text-sm font-semibold text-cafe">① 先提出 5 个第 {chapterNo} 章大纲方向（不满意可无限重刷）</h4>
      </div>
      <span className="text-xs text-cafe-muted">点选 1 个你最认可的大纲方向，推进到细纲展开</span>
    </div>

    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input
        type="text"
        value={macroHint}
        onChange={(e) => onChangeMacroHint(e.target.value)}
        placeholder="可选：输入你对本章的大致偏好或重刷要求（留空则直接让多猫根据前三章和设定自由提 5 个方向）"
        className="flex-1 rounded-md border border-cafe bg-cafe-surface-canvas px-3 py-1.5 text-xs text-cafe"
      />
      <button
        type="button"
        disabled={busy || stage === 'ideating_directions'}
        onClick={() => void onGenerateMacro()}
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-cafe-accent px-4 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
      >
        {directions.length > 0 ? <RotateResetIcon className="h-3.5 w-3.5" /> : <SparklesIcon className="h-3.5 w-3.5" />}
        {stage === 'ideating_directions'
          ? '多猫正在构思 5 个大纲...'
          : directions.length > 0
            ? '不满意？重新生成 5 个大纲方向'
            : `提出第 ${chapterNo} 章的 5 个大纲方向`}
      </button>
    </div>

    {directions.length > 0 && (
      <div className="mt-3.5 grid grid-cols-1 gap-2.5 md:grid-cols-2 lg:grid-cols-3">
        {directions.map((dir, idx) => {
          const active = dir.optionId === selectedMacroId;
          return (
            <button
              key={dir.optionId}
              type="button"
              onClick={() => onSelectMacroId(dir.optionId)}
              className={`rounded-xl border p-3.5 text-left transition-all ${
                active
                  ? 'border-cafe-accent bg-cafe-surface-sunken ring-1 ring-cafe-accent'
                  : 'border-cafe-subtle bg-cafe-surface-canvas hover:border-cafe'
              }`}
            >
              <div className="flex items-center justify-between gap-1.5">
                <span className="text-xs font-semibold text-cafe">
                  大纲 {idx + 1} · {dir.title}
                </span>
                {active && (
                  <span className="rounded-full bg-cafe-accent px-2 py-0.5 text-[10px] text-cafe-white">已选中</span>
                )}
              </div>
              <p className="mt-1.5 text-xs leading-relaxed text-cafe-secondary">{dir.summary}</p>
              {dir.conflictHighlight && (
                <p className="mt-1 text-[11px] text-cafe-muted">看点：{dir.conflictHighlight}</p>
              )}
              {dir.endingHook && <p className="mt-1 text-[11px] text-cafe-muted">章末钩子：{dir.endingHook}</p>}
            </button>
          );
        })}
      </div>
    )}
  </section>
);

const DetailedOutlinesCard: FC<{
  chapterNo: number;
  stage: string;
  selectedMacroId: string;
  beatHint: string;
  onChangeBeatHint: (v: string) => void;
  detailedOutlines: ChapterDetailedOutlineOption[];
  selectedBeatId: string;
  onSelectBeatId: (id: string) => void;
  busy: boolean;
  onGenerateBeats: () => Promise<void>;
}> = ({
  stage,
  selectedMacroId,
  beatHint,
  onChangeBeatHint,
  detailedOutlines,
  selectedBeatId,
  onSelectBeatId,
  busy,
  onGenerateBeats,
}) => (
  <section className="rounded-xl border border-cafe bg-cafe-surface p-5 shadow-sm">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h4 className="text-sm font-semibold text-cafe">② 根据所选大纲，提出 5 套本章细纲（不满意可重复重刷）</h4>
      <span className="text-xs text-cafe-muted">
        {selectedMacroId ? '已锁定上方大纲方向，可生成或切换细纲方案' : '请先在上方点击选中 1 个大纲方向'}
      </span>
    </div>

    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input
        type="text"
        value={beatHint}
        onChange={(e) => onChangeBeatHint(e.target.value)}
        placeholder="可选：补充细纲节奏要求（如：前半章铺垫客栈暗流，后半章爆发短兵死斗）"
        className="flex-1 rounded-md border border-cafe bg-cafe-surface-canvas px-3 py-1.5 text-xs text-cafe"
      />
      <button
        type="button"
        disabled={busy || !selectedMacroId || stage === 'ideating_beats'}
        onClick={() => void onGenerateBeats()}
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-cafe-accent px-4 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
      >
        <RotateResetIcon className="h-3.5 w-3.5" />
        {stage === 'ideating_beats'
          ? '多猫正在拆解 5 套细纲...'
          : detailedOutlines.length > 0
            ? '重新生成 5 套细纲'
            : '围绕所选大纲提出 5 套细纲'}
      </button>
    </div>

    {detailedOutlines.length > 0 && (
      <div className="mt-3.5 grid grid-cols-1 gap-3 md:grid-cols-2">
        {detailedOutlines.map((item, idx) => {
          const active = item.optionId === selectedBeatId;
          return (
            <button
              key={item.optionId}
              type="button"
              onClick={() => onSelectBeatId(item.optionId)}
              className={`rounded-xl border p-3.5 text-left transition-all ${
                active
                  ? 'border-cafe-accent bg-cafe-surface-sunken ring-1 ring-cafe-accent'
                  : 'border-cafe-subtle bg-cafe-surface-canvas hover:border-cafe'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-cafe">
                  细纲 {idx + 1} · {item.title}
                </span>
                {item.pacingNote && <span className="text-[11px] text-cafe-muted">{item.pacingNote}</span>}
              </div>
              <ol className="mt-2 space-y-1 text-xs text-cafe-secondary">
                {item.sceneBeats.map((beat) => (
                  <li key={beat.order}>
                    <span className="mr-1.5 rounded bg-cafe-surface px-1.5 py-0.5 text-[10px] text-cafe-muted">
                      {NOVEL_CRAFT_DIMENSION_LABELS[beat.craftDimension]?.zh.slice(0, 4) ?? beat.craftDimension}
                    </span>
                    {beat.sceneSummary}
                  </li>
                ))}
              </ol>
              {item.endingCliffhanger && (
                <p className="mt-2 text-[11px] font-medium text-cafe">断章点：{item.endingCliffhanger}</p>
              )}
            </button>
          );
        })}
      </div>
    )}
  </section>
);

const ExecuteDraftCard: FC<{
  chapterNo: number;
  stage: string;
  selectedBeatId: string;
  extraDraftNote: string;
  onChangeExtraNote: (v: string) => void;
  currentDraft: string;
  busy: boolean;
  onExecuteDraft: () => Promise<void>;
  onGoStep5: () => void;
}> = ({
  chapterNo,
  stage,
  selectedBeatId,
  extraDraftNote,
  onChangeExtraNote,
  currentDraft,
  busy,
  onExecuteDraft,
  onGoStep5,
}) => (
  <section className="rounded-xl border border-cafe bg-cafe-surface p-5 shadow-sm">
    <h4 className="text-sm font-semibold text-cafe">③ 选定细纲后开始实施生成第 {chapterNo} 章正文</h4>
    <div className="mt-3 flex flex-col gap-2 sm:flex-row">
      <input
        type="text"
        value={extraDraftNote}
        onChange={(e) => onChangeExtraNote(e.target.value)}
        placeholder="可选：执笔前最后叮嘱一句细节要求"
        className="flex-1 rounded-md border border-cafe bg-cafe-surface-canvas px-3 py-1.5 text-xs text-cafe"
      />
      <button
        type="button"
        disabled={busy || !selectedBeatId || stage === 'drafting'}
        onClick={() => void onExecuteDraft()}
        className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md bg-cafe-accent px-5 py-2 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
      >
        <PlayIcon className="h-3.5 w-3.5" />
        {stage === 'drafting'
          ? '主笔猫正在撰写本章初稿...'
          : currentDraft
            ? '按所选细纲重新生成一版初稿'
            : `开始实施生成第 ${chapterNo} 章正文`}
      </button>
    </div>

    {currentDraft && (
      <div className="mt-4 rounded-lg border border-cafe-subtle bg-cafe-surface-sunken p-4">
        <div className="mb-2 flex items-center justify-between text-xs">
          <span className="font-semibold text-cafe">
            第 {chapterNo} 章初稿预览（{currentDraft.length} 字）
          </span>
          <button
            type="button"
            onClick={onGoStep5}
            className="rounded-md bg-cafe-accent px-4 py-1.5 font-medium text-cafe-white hover:bg-cafe-accent-hover"
          >
            进入第 5 步：人工建议与调整 →
          </button>
        </div>
        <div className="max-h-72 overflow-y-auto whitespace-pre-wrap font-serif text-sm leading-7 text-cafe-secondary">
          {currentDraft}
        </div>
      </div>
    )}
  </section>
);
