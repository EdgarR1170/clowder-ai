'use client';

import type { NovelProject } from '@cat-cafe/shared';
import { type FC, useEffect, useState } from 'react';
import { SparklesIcon } from './NovelIcons';
import { novelStudioApi } from './novel-studio-api';

interface StepOnboardingDissectionProps {
  project: NovelProject;
  onUpdated: () => Promise<void>;
  onGoStep4: () => void;
}

export const StepOnboardingDissection: FC<StepOnboardingDissectionProps> = ({ project, onUpdated, onGoStep4 }) => {
  const [settingsText, setSettingsText] = useState(project.rawUserSettingsInput || '');
  const [openingChaptersText, setOpeningChaptersText] = useState(project.rawOpeningChaptersInput || '');
  const [submitting, setSubmitting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setSettingsText(project.rawUserSettingsInput || '');
    setOpeningChaptersText(project.rawOpeningChaptersInput || '');
  }, [project.id, project.rawUserSettingsInput, project.rawOpeningChaptersInput]);

  const handleAnalyze = async () => {
    if (!settingsText.trim() && !openingChaptersText.trim()) return;
    setSubmitting(true);
    setNotice(null);
    try {
      const updated = await novelStudioApi.submitOnboarding(project.id, {
        rawUserSettingsInput: settingsText,
        rawOpeningChaptersInput: openingChaptersText,
        wakeCats: true,
      });
      await onUpdated();
      const seedCount = updated.project.seedChapterCount;
      setNotice(
        `已归档前 ${seedCount} 章开篇内容，并已启动多猫团队拆解人物关系、伏笔与原生文风（后续将从第 ${seedCount + 1} 章开始接写）！`,
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const report = project.dissectionReport;
  const nextChapterNo = (project.seedChapterCount || 0) + 1;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <section className="rounded-xl border border-cafe bg-cafe-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <SparklesIcon className="h-4 w-4 text-cafe-accent" />
              <h3 className="text-base font-semibold text-cafe">Step 3 · 输入设定 + 输入前三章（多猫拆解分析）</h3>
            </div>
            <p className="mt-1 text-xs text-cafe-muted">
              左边粘贴你的小说设定，右边粘贴你写好的前三章正文（支持按“第1章/第2章/第3章”自动切分）。多猫会自动拆解人物、规则、伏笔与你的原生文风。
            </p>
          </div>
          <button
            type="button"
            disabled={submitting || (!settingsText.trim() && !openingChaptersText.trim())}
            onClick={() => void handleAnalyze()}
            className="rounded-md bg-cafe-accent px-4 py-2 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
          >
            {submitting ? '正在提交并唤醒多猫拆解...' : '提交并让多猫拆解分析'}
          </button>
        </div>

        {notice && (
          <div className="mt-3 rounded-lg border border-cafe-subtle bg-cafe-surface-sunken px-3.5 py-2 text-xs text-cafe-secondary">
            {notice}
          </div>
        )}

        {/* Exactly TWO Big Clean Input Boxes */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="flex flex-col">
            <label className="mb-1.5 text-xs font-semibold text-cafe">
              1. 小说设定输入框（世界观 / 人物设定 / 力量体系 / 故事主线）
            </label>
            <textarea
              rows={15}
              value={settingsText}
              onChange={(e) => setSettingsText(e.target.value)}
              placeholder={
                '把你构思的所有设定直接粘贴到这里，例如：\n- 世界背景与核心规则\n- 主角：姓名、性格口吻、金手指/能力、核心目标\n- 关键配角与反派势力\n- 后续大致剧情主线构想'
              }
              className="w-full rounded-lg border border-cafe bg-cafe-surface-canvas p-3 text-xs leading-6 text-cafe"
            />
          </div>

          <div className="flex flex-col">
            <label className="mb-1.5 text-xs font-semibold text-cafe">
              2. 前三章正文输入框（直接粘贴已写好的第 1~3 章全文）
            </label>
            <textarea
              rows={15}
              value={openingChaptersText}
              onChange={(e) => setOpeningChaptersText(e.target.value)}
              placeholder={
                '直接把你写好的前三章一次性粘贴进来，例如：\n\n第一章 雨夜古刹\n（正文……）\n\n第二章 残碑暗纹\n（正文……）\n\n第三章 来客拔刀\n（正文……）'
              }
              className="w-full rounded-lg border border-cafe bg-cafe-surface-canvas p-3 font-serif text-xs leading-6 text-cafe"
            />
          </div>
        </div>
      </section>

      {/* Multi-Cat Dissection Report Card */}
      {report && (
        <section className="rounded-xl border border-cafe bg-cafe-surface p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-cafe">多猫拆解分析结果</span>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                  report.status === 'analyzing'
                    ? 'bg-semantic-warning-surface text-semantic-warning'
                    : 'bg-semantic-success-surface text-semantic-success'
                }`}
              >
                {report.status === 'analyzing'
                  ? '已提取基线，多猫正在群聊深度拆解中...'
                  : `多猫深度拆解完成（已归档前 ${project.seedChapterCount} 章）`}
              </span>
            </div>
            <button
              type="button"
              onClick={onGoStep4}
              className="rounded-md bg-cafe-accent px-5 py-2 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover"
            >
              确认拆解无误，进入第 4 步：生成第 {nextChapterNo} 章 →
            </button>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <div className="rounded-lg bg-cafe-surface-sunken p-3.5 text-xs">
              <div className="font-semibold text-cafe">世界规则与主线矛盾梳理</div>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed text-cafe-secondary">
                {report.worldAndRulesSummary}
              </p>
              {report.nextChapterBridgeAnchor && (
                <p className="mt-2 rounded bg-cafe-surface px-2.5 py-1.5 text-cafe">
                  <strong>衔接第 {nextChapterNo} 章落点：</strong>
                  {report.nextChapterBridgeAnchor}
                </p>
              )}
            </div>

            <div className="rounded-lg bg-cafe-surface-sunken p-3.5 text-xs">
              <div className="font-semibold text-cafe">作者前三章原生文风标尺</div>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed text-cafe-secondary">
                {report.authorNativeStyleNotes}
              </p>
              {report.plantedHooks.length > 0 && (
                <div className="mt-2">
                  <div className="font-semibold text-cafe">已识别待回收伏笔：</div>
                  <ul className="mt-1 list-inside list-disc space-y-0.5 text-cafe-muted">
                    {report.plantedHooks.map((h, i) => (
                      <li key={`hook-${i}`}>{h}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>

          {report.characters.length > 0 && (
            <div className="mt-3">
              <div className="mb-1.5 text-xs font-semibold text-cafe">拆解识别人物卡 ({report.characters.length})</div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {report.characters.map((c) => (
                  <div
                    key={c.name}
                    className="rounded-lg border border-cafe-subtle bg-cafe-surface-canvas p-2.5 text-xs"
                  >
                    <div className="font-semibold text-cafe">
                      {c.name} <span className="font-normal text-cafe-muted">({c.role})</span>
                    </div>
                    {c.traitsAndVoice && <p className="mt-0.5 text-cafe-secondary">{c.traitsAndVoice}</p>}
                    {c.currentStatusAndGoal && <p className="mt-0.5 text-cafe-muted">{c.currentStatusAndGoal}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
};
