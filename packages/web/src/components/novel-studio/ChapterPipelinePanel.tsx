'use client';

import {
  type ChapterOutline,
  NOVEL_CRAFT_DIMENSION_LABELS,
  NOVEL_CRAFT_DIMENSIONS,
  type NovelCraftDimension,
  type NovelProject,
} from '@cat-cafe/shared';
import { type FC, useState } from 'react';
import { ChatBubbleIcon, PipelineIcon, PlayIcon, SparklesIcon } from './NovelIcons';
import { novelStudioApi } from './novel-studio-api';

interface ChapterPipelinePanelProps {
  project: NovelProject;
  onUpdated: () => Promise<void>;
  onSelectChapterForReader: (chapterNo: number) => void;
  onJumpToThread?: (threadId: string) => void;
}

const STAGE_BADGES: Record<string, { label: string; cls: string }> = {
  planned: { label: '待启动', cls: 'bg-cafe-surface-sunken text-cafe-muted' },
  prechecking: { label: '防穿帮预检', cls: 'bg-semantic-info-surface text-semantic-info' },
  drafting: { label: '多猫执笔中', cls: 'bg-semantic-info-surface text-semantic-info' },
  reviewing: { label: '异构五轴审校', cls: 'bg-semantic-warning-surface text-semantic-warning' },
  rewriting: { label: '按处方返修中', cls: 'bg-semantic-warning-surface text-semantic-warning' },
  humanizing: { label: '去AI味精修', cls: 'bg-semantic-info-surface text-semantic-info' },
  awaiting_approval: { label: '待人工拍板', cls: 'bg-semantic-warning-surface text-semantic-warning' },
  committed: { label: '已定稿入账', cls: 'bg-semantic-success-surface text-semantic-success' },
};

export const ChapterPipelinePanel: FC<ChapterPipelinePanelProps> = ({
  project,
  onUpdated,
  onSelectChapterForReader,
  onJumpToThread,
}) => {
  const [blueprint, setBlueprint] = useState(project.worldBlueprintMarkdown);
  const [aiDirection, setAiDirection] = useState('围绕黄金三章原则设计第一卷情节弧，并拆出前 5 章详细分拍章纲');
  const [aiCount, setAiCount] = useState(5);
  const [busy, setBusy] = useState(false);
  const [showAddOutline, setShowAddOutline] = useState(false);

  const nextNo =
    project.chapterOutlines.length > 0 ? Math.max(...project.chapterOutlines.map((o) => o.chapterNo)) + 1 : 1;
  const [newTitle, setNewTitle] = useState('');
  const [newGoal, setNewGoal] = useState('');
  const [newConflict, setNewConflict] = useState('');
  const [newHook, setNewHook] = useState('');
  const [beat1Dim, setBeat1Dim] = useState<NovelCraftDimension>('character_persona');
  const [beat1Summary, setBeat1Summary] = useState('');
  const [beat2Dim, setBeat2Dim] = useState<NovelCraftDimension>('battle_action');
  const [beat2Summary, setBeat2Summary] = useState('');
  const [autoCount, setAutoCount] = useState(project.workflow.autoBatchSize || 5);
  const [notice, setNotice] = useState<string | null>(null);

  const handleSaveBlueprint = async () => {
    setBusy(true);
    try {
      await novelStudioApi.saveOutlines(project.id, { worldBlueprintMarkdown: blueprint });
      await onUpdated();
      setNotice('世界观与故事总蓝图已保存。');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleAiPlan = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const res = await novelStudioApi.triggerAiPlan(project.id, aiDirection, aiCount);
      setNotice(`已唤醒大纲猫 @${res.targetCatId} 在编辑部群聊规划卷纲与前 ${aiCount} 章细纲！`);
      if (res.threadId && onJumpToThread) onJumpToThread(res.threadId);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleAddChapterOutline = async () => {
    if (!newTitle.trim() || !newGoal.trim() || !newConflict.trim() || !newHook.trim()) return;
    setBusy(true);
    try {
      const beats: ChapterOutline['beats'] = [
        {
          beatIndex: 1,
          summary: beat1Summary.trim() || newGoal.trim(),
          primaryDimension: beat1Dim,
          secondaryDimensions: [],
          castIds: [],
          locationId: '',
          ragQueryHint: beat1Summary.trim() || newGoal.trim(),
          targetWords: 1500,
        },
      ];
      if (beat2Summary.trim()) {
        beats.push({
          beatIndex: 2,
          summary: beat2Summary.trim(),
          primaryDimension: beat2Dim,
          secondaryDimensions: [],
          castIds: [],
          locationId: '',
          ragQueryHint: beat2Summary.trim(),
          targetWords: 1700,
        });
      }

      const outline: ChapterOutline = {
        chapterNo: nextNo,
        volumeNo: 1,
        title: newTitle.trim(),
        goal: newGoal.trim(),
        conflict: newConflict.trim(),
        outcome: '冲突升级并引出章末悬念',
        hook: newHook.trim(),
        povCharacterId: '',
        targetWords: 3200,
        beats,
        foreshadowingToPlant: [],
        foreshadowingToPayoff: [],
      };
      await novelStudioApi.saveOutlines(project.id, { chapterOutlines: [outline] });
      setNewTitle('');
      setNewGoal('');
      setNewConflict('');
      setNewHook('');
      setBeat1Summary('');
      setBeat2Summary('');
      setShowAddOutline(false);
      await onUpdated();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleStartChapter = async (chapterNo: number) => {
    setBusy(true);
    setNotice(null);
    try {
      await novelStudioApi.startChapter(project.id, chapterNo, true);
      await onUpdated();
      setNotice(
        `第 ${chapterNo} 章已完成章前防穿帮预检、动态挂载技法包并唤醒总编猫 @${project.catRoster.chiefEditorCatId}！`,
      );
      if (project.threadId && onJumpToThread) onJumpToThread(project.threadId);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleToggleAuto = async () => {
    const nextEnabled = project.workflow.approvalMode !== 'auto-continuous';
    setBusy(true);
    try {
      await novelStudioApi.toggleAutoContinuous(project.id, nextEnabled, autoCount);
      await onUpdated();
      setNotice(
        nextEnabled
          ? `已切换至【全自动连写模式（连写 ${autoCount} 章）】，总编猫将自动逐章推进！`
          : '已切换回【逐章人工拍板模式】。',
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5">
      {notice && (
        <div className="rounded-lg border border-cafe bg-cafe-surface px-3.5 py-2 text-xs text-cafe-secondary">
          {notice}
        </div>
      )}

      {/* Mode Switcher & Coordinator Bar */}
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <PipelineIcon className="h-4 w-4 text-cafe-accent" />
            <h3 className="text-sm font-semibold text-cafe">
              总编协调管线 · 当前进度：第 {project.currentChapterNo} 章
            </h3>
          </div>
          <p className="mt-0.5 text-xs text-cafe-muted">
            推进顺序：story-arcs (情节弧) → chapter-outlines (分拍章纲) → 防穿帮预检 → 多猫执笔 → 异构五轴互审 →
            去AI味定稿
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {project.threadId && onJumpToThread && (
            <button
              type="button"
              onClick={() => onJumpToThread(project.threadId!)}
              className="inline-flex items-center gap-1.5 rounded-md border border-cafe px-2.5 py-1.5 text-xs text-cafe hover:bg-cafe-surface-sunken"
            >
              <ChatBubbleIcon className="h-3.5 w-3.5 text-cafe-accent" />
              打开多猫编辑部群聊
            </button>
          )}
          <div className="flex items-center gap-1.5 rounded-lg border border-cafe bg-cafe-surface-sunken px-2.5 py-1">
            <span className="text-xs text-cafe-secondary">连写章数</span>
            <input
              type="number"
              min={1}
              max={50}
              value={autoCount}
              onChange={(e) => setAutoCount(Math.max(1, Number(e.target.value) || 1))}
              className="w-12 rounded border border-cafe bg-cafe-surface-canvas px-1.5 py-0.5 text-center text-xs text-cafe"
            />
            <button
              type="button"
              disabled={busy}
              onClick={handleToggleAuto}
              className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                project.workflow.approvalMode === 'auto-continuous'
                  ? 'bg-semantic-success text-cafe-white'
                  : 'bg-cafe-surface-canvas text-cafe border border-cafe'
              }`}
            >
              {project.workflow.approvalMode === 'auto-continuous'
                ? `全自动连写中 (余${project.workflow.autoRemainingChapters}章)`
                : '当前：逐章人工拍板'}
            </button>
          </div>
        </div>
      </section>

      {/* AI Architect Planner + Blueprint */}
      <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-cafe-muted">世界观蓝图与大纲猫自动规划</h4>
          <button
            type="button"
            disabled={busy}
            onClick={handleSaveBlueprint}
            className="rounded border border-cafe px-2.5 py-1 text-xs text-cafe hover:bg-cafe-surface-sunken"
          >
            保存蓝图文本
          </button>
        </div>
        <textarea
          rows={4}
          value={blueprint}
          onChange={(e) => setBlueprint(e.target.value)}
          className="w-full rounded-lg border border-cafe bg-cafe-surface-canvas p-2.5 text-xs leading-relaxed text-cafe"
        />
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={aiDirection}
            onChange={(e) => setAiDirection(e.target.value)}
            placeholder="告诉大纲架构猫本卷主线方向、开局矛盾与高潮期待..."
            className="min-w-60 flex-1 rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
          />
          <input
            type="number"
            min={1}
            max={30}
            value={aiCount}
            onChange={(e) => setAiCount(Number(e.target.value) || 5)}
            className="w-16 rounded-md border border-cafe bg-cafe-surface-canvas px-2 py-1.5 text-xs text-cafe"
          />
          <button
            type="button"
            disabled={busy}
            onClick={handleAiPlan}
            className="inline-flex items-center gap-1 rounded-md bg-cafe-accent px-3 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
          >
            <SparklesIcon className="h-3.5 w-3.5" />
            让大纲猫生成卷纲 + 章纲
          </button>
        </div>
      </section>

      {/* Story Arcs Summary */}
      {project.storyArcs.length > 0 && (
        <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-cafe-muted">
            卷级情节弧 story-arcs ({project.storyArcs.length})
          </h4>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {project.storyArcs.map((arc) => (
              <div key={arc.arcId} className="rounded-lg border border-cafe-subtle bg-cafe-surface-sunken p-3 text-xs">
                <div className="font-semibold text-cafe">
                  第 {arc.volumeNo} 卷 · {arc.title}（第 {arc.startChapter}~{arc.endChapter} 章）
                </div>
                <p className="mt-1 text-cafe-secondary">核心冲突：{arc.coreConflict}</p>
                <p className="mt-0.5 text-cafe-muted">高潮拍：{arc.climaxBeat}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Chapter-by-Chapter Outlines & Multi-Cat Production Cards */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-cafe-muted">
            逐章细纲与协调看板 ({project.chapterOutlines.length} 章)
          </h4>
          <button
            type="button"
            onClick={() => setShowAddOutline((v) => !v)}
            className="rounded-md border border-cafe bg-cafe-surface px-2.5 py-1 text-xs font-medium text-cafe hover:bg-cafe-surface-sunken"
          >
            + 手动新增第 {nextNo} 章细纲
          </button>
        </div>

        {showAddOutline && (
          <div className="space-y-2.5 rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder={`第 ${nextNo} 章标题（如：雨夜破庙的第七道刀痕）`}
                className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
              />
              <input
                type="text"
                value={newGoal}
                onChange={(e) => setNewGoal(e.target.value)}
                placeholder="本章叙事目标（如：摸清黑市情报并试探同伴底细）"
                className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
              />
              <input
                type="text"
                value={newConflict}
                onChange={(e) => setNewConflict(e.target.value)}
                placeholder="核心冲突阻力（如：遭遇越阶追兵封锁退路）"
                className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
              />
              <input
                type="text"
                value={newHook}
                onChange={(e) => setNewHook(e.target.value)}
                placeholder="章末断章钩子（如：尸身上翻出死去师兄的贴身命牌）"
                className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div className="flex gap-1.5">
                <select
                  value={beat1Dim}
                  onChange={(e) => setBeat1Dim(e.target.value as NovelCraftDimension)}
                  className="rounded-md border border-cafe bg-cafe-surface-canvas px-2 py-1.5 text-xs text-cafe"
                >
                  {NOVEL_CRAFT_DIMENSIONS.map((d) => (
                    <option key={d} value={d}>
                      场次1技法: {NOVEL_CRAFT_DIMENSION_LABELS[d].zh}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={beat1Summary}
                  onChange={(e) => setBeat1Summary(e.target.value)}
                  placeholder="前半章分拍概要..."
                  className="flex-1 rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
                />
              </div>
              <div className="flex gap-1.5">
                <select
                  value={beat2Dim}
                  onChange={(e) => setBeat2Dim(e.target.value as NovelCraftDimension)}
                  className="rounded-md border border-cafe bg-cafe-surface-canvas px-2 py-1.5 text-xs text-cafe"
                >
                  {NOVEL_CRAFT_DIMENSIONS.map((d) => (
                    <option key={d} value={d}>
                      场次2技法: {NOVEL_CRAFT_DIMENSION_LABELS[d].zh}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={beat2Summary}
                  onChange={(e) => setBeat2Summary(e.target.value)}
                  placeholder="后半章分拍概要（选填）..."
                  className="flex-1 rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
                />
              </div>
            </div>
            <div className="flex justify-end">
              <button
                type="button"
                disabled={busy}
                onClick={handleAddChapterOutline}
                className="rounded-md bg-cafe-accent px-3.5 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover"
              >
                保存第 {nextNo} 章细纲
              </button>
            </div>
          </div>
        )}

        {project.chapterOutlines.length === 0 ? (
          <div className="rounded-xl border border-dashed border-cafe bg-cafe-surface p-6 text-center text-xs text-cafe-muted">
            暂无章纲。可点击上方「让大纲猫生成卷纲 + 章纲」或手动新增第 1 章细纲。
          </div>
        ) : (
          <div className="space-y-2.5">
            {project.chapterOutlines.map((outline) => {
              const state = project.chapters[String(outline.chapterNo)];
              const stageKey = state?.stage ?? 'planned';
              const badge = STAGE_BADGES[stageKey] ?? STAGE_BADGES.planned!;
              const lastQuality = state?.qualityHistory[state.qualityHistory.length - 1];

              return (
                <div
                  key={outline.chapterNo}
                  className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm transition-colors hover:border-cafe-accent"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-cafe">
                          第 {outline.chapterNo} 章 · {outline.title}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${badge.cls}`}>
                          {badge.label}
                        </span>
                        {lastQuality && (
                          <span className="rounded-full bg-cafe-surface-sunken px-2 py-0.5 text-xs text-cafe-secondary">
                            5轴散文 {lastQuality.proseScores.overall} · 节奏 {lastQuality.pacingScores.overall}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs text-cafe-secondary">
                        目标：{outline.goal} ｜ 冲突：{outline.conflict} ｜ 钩子：{outline.hook}
                      </p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {outline.beats.map((b) => (
                          <span
                            key={b.beatIndex}
                            className="rounded bg-cafe-surface-sunken px-2 py-0.5 text-xs text-cafe-muted"
                          >
                            拍{b.beatIndex} [{NOVEL_CRAFT_DIMENSION_LABELS[b.primaryDimension].zh}]{' '}
                            {b.summary.slice(0, 28)}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => handleStartChapter(outline.chapterNo)}
                        className="inline-flex items-center gap-1 rounded-md bg-cafe-accent px-2.5 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
                      >
                        <PlayIcon />
                        启动多猫协作
                      </button>
                      {state && (state.rawDraft || state.finalText) && (
                        <button
                          type="button"
                          onClick={() => onSelectChapterForReader(outline.chapterNo)}
                          className="rounded-md border border-cafe px-2.5 py-1.5 text-xs text-cafe hover:bg-cafe-surface-sunken"
                        >
                          审稿 / 对比去AI味
                        </button>
                      )}
                      {stageKey === 'committed' && (
                        <button
                          type="button"
                          onClick={async () => {
                            await novelStudioApi.rollbackToChapter(project.id, outline.chapterNo);
                            await onUpdated();
                            setNotice(`已将世界真相与数值账本回滚至第 ${outline.chapterNo} 章定稿快照。`);
                          }}
                          className="rounded-md border border-cafe px-2 py-1.5 text-xs text-cafe-muted hover:text-semantic-warning"
                        >
                          回滚至此章
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
