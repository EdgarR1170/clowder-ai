'use client';

import type { CharacterNode, MechanicsLedger, NarrativeGraph, NovelProject } from '@cat-cafe/shared';
import { type FC, useEffect, useState } from 'react';
import { DownloadIcon, FeatherIcon, ShieldCanonIcon } from './NovelIcons';
import { novelStudioApi } from './novel-studio-api';

interface CanonAndReaderPanelProps {
  project: NovelProject;
  canon: NarrativeGraph;
  mechanics: MechanicsLedger;
  selectedChapterNo: number;
  onSelectChapterNo: (no: number) => void;
  onUpdated: () => Promise<void>;
}

export const CanonAndReaderPanel: FC<CanonAndReaderPanelProps> = ({
  project,
  canon,
  mechanics,
  selectedChapterNo,
  onSelectChapterNo,
  onUpdated,
}) => {
  const [subTab, setSubTab] = useState<'reader' | 'canon'>('reader');
  const [viewMode, setViewMode] = useState<'final' | 'diff'>('diff');
  const [rewriteFeedback, setRewriteFeedback] = useState('');
  const [editableText, setEditableText] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  // Quick add character state
  const [charName, setCharName] = useState('');
  const [charRole, setCharRole] = useState<CharacterNode['role']>('protagonist');
  const [charPower, setCharPower] = useState('');
  const [charVoice, setCharVoice] = useState('');

  const chapterRecord = project.chapters[String(selectedChapterNo)];
  const outline = project.chapterOutlines.find((o) => o.chapterNo === selectedChapterNo);
  const latestReport = chapterRecord?.qualityHistory[chapterRecord.qualityHistory.length - 1];

  useEffect(() => {
    setEditableText(chapterRecord?.finalText || chapterRecord?.humanizedDraft || chapterRecord?.rawDraft || '');
  }, [chapterRecord]);

  const handleApprove = async (wakeNext: boolean) => {
    setBusy(true);
    setNotice(null);
    try {
      await novelStudioApi.approveChapter(project.id, selectedChapterNo, {
        finalTextOverride: editableText,
        wakeNextChapter: wakeNext,
      });
      await onUpdated();
      setNotice(
        `第 ${selectedChapterNo} 章已正式定稿，状态增量已同步至防穿帮图谱与数值账本` +
          (wakeNext ? '，并已启动下一章！' : '！'),
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleRequestRewrite = async () => {
    if (!rewriteFeedback.trim()) return;
    setBusy(true);
    try {
      await novelStudioApi.requestChapterRewrite(project.id, selectedChapterNo, rewriteFeedback.trim());
      setRewriteFeedback('');
      await onUpdated();
      setNotice(`修改批注已投递至编辑部群聊，主笔猫正在返修第 ${selectedChapterNo} 章。`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleAddCharacter = async () => {
    if (!charName.trim()) return;
    setBusy(true);
    try {
      const id = `char-${Date.now().toString(36)}`;
      const nextChar: CharacterNode = {
        id,
        name: charName.trim(),
        aliases: [],
        role: charRole,
        status: 'alive',
        locationId: '起始点',
        injuriesOrDebuffs: [],
        inventory: [],
        powerTier: charPower.trim(),
        voiceTraits: charVoice.trim(),
        motivation: '',
        knownFactIds: [],
        relationships: [],
        lastUpdatedChapter: 0,
      };
      await novelStudioApi.saveCanon(project.id, {
        ...canon,
        characters: [...canon.characters, nextChar],
      });
      setCharName('');
      setCharPower('');
      setCharVoice('');
      await onUpdated();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const handleExport = async (format: 'md' | 'txt') => {
    const exported = await novelStudioApi.exportManuscript(project.id, format);
    const blob = new Blob([exported.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = exported.fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {notice && (
        <div className="rounded-lg border border-cafe bg-cafe-surface px-3.5 py-2 text-xs text-cafe-secondary">
          {notice}
        </div>
      )}

      {/* Sub-Navigation + Whole-Book Export */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-cafe bg-cafe-surface p-1">
          <button
            type="button"
            onClick={() => setSubTab('reader')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium ${
              subTab === 'reader' ? 'bg-cafe-surface-sunken text-cafe' : 'text-cafe-muted'
            }`}
          >
            <FeatherIcon className="h-3.5 w-3.5" />
            审稿与去AI味对比台
          </button>
          <button
            type="button"
            onClick={() => setSubTab('canon')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium ${
              subTab === 'canon' ? 'bg-cafe-surface-sunken text-cafe' : 'text-cafe-muted'
            }`}
          >
            <ShieldCanonIcon className="h-3.5 w-3.5" />
            防穿帮图谱 & 数值账本 ({canon.characters.length} 角色 / {canon.foreshadowings.length} 伏笔)
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleExport('md')}
            className="inline-flex items-center gap-1 rounded-md border border-cafe bg-cafe-surface px-2.5 py-1 text-xs text-cafe hover:bg-cafe-surface-sunken"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            导出整书 .md
          </button>
          <button
            type="button"
            onClick={() => handleExport('txt')}
            className="inline-flex items-center gap-1 rounded-md border border-cafe bg-cafe-surface px-2.5 py-1 text-xs text-cafe hover:bg-cafe-surface-sunken"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            导出整书 .txt
          </button>
        </div>
      </div>

      {subTab === 'reader' ? (
        <div className="space-y-4">
          {/* Chapter Selector & Diff Switch */}
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cafe bg-cafe-surface p-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-cafe-muted">选择章节：</span>
              <select
                value={selectedChapterNo}
                onChange={(e) => onSelectChapterNo(Number(e.target.value))}
                className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1 text-xs text-cafe"
              >
                {project.chapterOutlines.length === 0 && <option value={1}>第 1 章</option>}
                {project.chapterOutlines.map((o) => (
                  <option key={o.chapterNo} value={o.chapterNo}>
                    第 {o.chapterNo} 章 · {o.title} ({project.chapters[String(o.chapterNo)]?.stage ?? 'planned'})
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setViewMode(viewMode === 'diff' ? 'final' : 'diff')}
                className="rounded-md border border-cafe px-2.5 py-1 text-xs text-cafe hover:bg-cafe-surface-sunken"
              >
                {viewMode === 'diff' ? '切换单栏精修编辑' : '切换初稿 vs 去AI味双栏对比'}
              </button>
            </div>
          </div>

          {/* 5-Axis Quality & Invariant Report Card */}
          {latestReport && (
            <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold text-cafe">
                  异构审校猫 (@{latestReport.reviewerCatId}) 五轴质量与防穿帮报告
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    latestReport.verdict === 'approved'
                      ? 'bg-semantic-success-surface text-semantic-success'
                      : 'bg-semantic-warning-surface text-semantic-warning'
                  }`}
                >
                  {latestReport.verdict === 'approved' ? '审校通过' : '要求返修'} · 散文总分{' '}
                  {latestReport.proseScores.overall} · 节奏总分 {latestReport.pacingScores.overall}
                  {latestReport.humanizerReport ? ` · AI腔指数 ${latestReport.humanizerReport.aiFlavorScore}/100` : ''}
                </span>
              </div>
              <p className="mt-1.5 text-xs text-cafe-secondary">{latestReport.summaryCritique}</p>
              {latestReport.invariantViolations.length > 0 && (
                <div className="mt-2 space-y-1 rounded-lg bg-semantic-critical-surface p-2.5 text-xs text-semantic-critical">
                  {latestReport.invariantViolations.map((v, i) => (
                    <div key={`${v.category}-${i}`}>
                      [{v.severity.toUpperCase()}] {v.message}
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Manuscript Side-by-Side Diff or Single Serif Editor */}
          {!chapterRecord || (!chapterRecord.rawDraft && !chapterRecord.finalText) ? (
            <div className="rounded-xl border border-dashed border-cafe bg-cafe-surface p-8 text-center text-xs text-cafe-muted">
              第 {selectedChapterNo} 章{outline ? `《${outline.title}》` : ''}
              尚未生成初稿。请在「逐章看板」点击「启动多猫协作」。
            </div>
          ) : viewMode === 'diff' ? (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-cafe bg-cafe-surface p-4">
                <div className="mb-2 flex items-center justify-between border-b border-cafe-subtle pb-2 text-xs text-cafe-muted">
                  <span>主笔猫初稿 Raw ({chapterRecord.rawDraft.length} 字)</span>
                  {chapterRecord.writerCatId && <span>@{chapterRecord.writerCatId}</span>}
                </div>
                <div className="max-h-96 overflow-y-auto whitespace-pre-wrap font-serif text-sm leading-7 text-cafe-secondary">
                  {chapterRecord.rawDraft || '暂无初稿备份'}
                </div>
              </div>
              <div className="rounded-xl border border-cafe bg-cafe-surface p-4">
                <div className="mb-2 flex items-center justify-between border-b border-cafe-subtle pb-2 text-xs text-cafe-muted">
                  <span>去AI味精修稿 / 可直接手改定稿 ({editableText.length} 字)</span>
                  <span className="text-semantic-success">Humanized</span>
                </div>
                <textarea
                  rows={14}
                  value={editableText}
                  onChange={(e) => setEditableText(e.target.value)}
                  className="w-full rounded-lg border border-cafe-subtle bg-cafe-surface-canvas p-3 font-serif text-sm leading-7 text-cafe"
                />
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-cafe bg-cafe-surface p-5">
              <textarea
                rows={18}
                value={editableText}
                onChange={(e) => setEditableText(e.target.value)}
                className="w-full rounded-lg border border-cafe-subtle bg-cafe-surface-canvas p-4 font-serif text-base leading-8 text-cafe"
              />
            </div>
          )}

          {/* Approval & Rewrite Action Bar */}
          {chapterRecord && (chapterRecord.rawDraft || chapterRecord.finalText) && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-cafe bg-cafe-surface p-3">
              <div className="flex flex-1 items-center gap-2">
                <input
                  type="text"
                  value={rewriteFeedback}
                  onChange={(e) => setRewriteFeedback(e.target.value)}
                  placeholder="输入打回重写意见（如：后半段打戏动作太虚，补充地形借力细节）..."
                  className="min-w-56 flex-1 rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
                />
                <button
                  type="button"
                  disabled={busy || !rewriteFeedback.trim()}
                  onClick={handleRequestRewrite}
                  className="rounded-md border border-cafe px-3 py-1.5 text-xs text-cafe hover:bg-cafe-surface-sunken disabled:opacity-50"
                >
                  批注打回重写
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleApprove(false)}
                  className="rounded-md border border-cafe-accent px-3 py-1.5 text-xs font-medium text-cafe hover:bg-cafe-surface-sunken"
                >
                  拍板定稿入账
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => handleApprove(true)}
                  className="rounded-md bg-cafe-accent px-3.5 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover"
                >
                  定稿并自动开写下一章
                </button>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Canon Graph & Mechanics Ledger View */
        <div className="space-y-4">
          <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
            <h4 className="mb-2.5 text-sm font-semibold text-cafe">
              角色生死、伤势与知情边界（InvariantChecker 真相源）
            </h4>
            <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-5">
              <input
                type="text"
                value={charName}
                onChange={(e) => setCharName(e.target.value)}
                placeholder="角色姓名"
                className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
              />
              <select
                value={charRole}
                onChange={(e) => setCharRole(e.target.value as CharacterNode['role'])}
                className="rounded-md border border-cafe bg-cafe-surface-canvas px-2 py-1.5 text-xs text-cafe"
              >
                <option value="protagonist">主角</option>
                <option value="deuteragonist">重要搭档/女主</option>
                <option value="antagonist">核心反派</option>
                <option value="supporting">关键配角</option>
              </select>
              <input
                type="text"
                value={charPower}
                onChange={(e) => setCharPower(e.target.value)}
                placeholder="当前境界/战力阶位"
                className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
              />
              <input
                type="text"
                value={charVoice}
                onChange={(e) => setCharVoice(e.target.value)}
                placeholder="口癖/说话特征"
                className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
              />
              <button
                type="button"
                disabled={busy || !charName.trim()}
                onClick={handleAddCharacter}
                className="rounded-md bg-cafe-accent px-3 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
              >
                + 建档角色
              </button>
            </div>

            {canon.characters.length === 0 ? (
              <p className="text-xs text-cafe-muted">暂无建档角色（章节定稿时也会自动提取新增角色与状态变更）。</p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {canon.characters.map((ch) => (
                  <div key={ch.id} className="rounded-lg border border-cafe-subtle bg-cafe-surface-sunken p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-cafe">
                        {ch.name} ({ch.role})
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 ${
                          ch.status === 'dead'
                            ? 'bg-semantic-critical-surface text-semantic-critical'
                            : 'bg-semantic-success-surface text-semantic-success'
                        }`}
                      >
                        {ch.status} · 位置: {ch.locationId}
                      </span>
                    </div>
                    {ch.powerTier && <div className="mt-1 text-cafe-secondary">实力：{ch.powerTier}</div>}
                    {ch.injuriesOrDebuffs.length > 0 && (
                      <div className="mt-0.5 text-semantic-warning">伤势/限制：{ch.injuriesOrDebuffs.join('、')}</div>
                    )}
                    {ch.inventory.length > 0 && (
                      <div className="mt-0.5 text-cafe-muted">持有物：{ch.inventory.join('、')}</div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Foreshadowing & Pluggable Mechanics Ledger */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
              <h4 className="mb-2 text-sm font-semibold text-cafe">伏笔追踪账本 ({canon.foreshadowings.length})</h4>
              {canon.foreshadowings.length === 0 ? (
                <p className="text-xs text-cafe-muted">暂无埋设伏笔。</p>
              ) : (
                <div className="space-y-2">
                  {canon.foreshadowings.map((f) => (
                    <div key={f.id} className="rounded-lg bg-cafe-surface-sunken p-2.5 text-xs">
                      <div className="flex justify-between text-cafe-secondary">
                        <span>第 {f.plantedChapter} 章埋线</span>
                        <span>{f.status}</span>
                      </div>
                      <p className="mt-0.5 text-cafe">{f.clue}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between">
                <h4 className="text-sm font-semibold text-cafe">系统/境界数值账本（机制层）</h4>
                <button
                  type="button"
                  onClick={async () => {
                    await novelStudioApi.saveMechanics(project.id, {
                      ...mechanics,
                      enabled: !mechanics.enabled,
                    });
                    await onUpdated();
                  }}
                  className="rounded border border-cafe px-2 py-0.5 text-xs text-cafe"
                >
                  {mechanics.enabled ? '已启用数值校验' : '点击启用数值层'}
                </button>
              </div>
              {!mechanics.enabled ? (
                <p className="text-xs text-cafe-muted">
                  当前为传统叙事模式（仅校验事实连续性）。若写系统文/游戏异界/升级流，可开启数值账本防止属性加减穿帮。
                </p>
              ) : mechanics.entities.length === 0 ? (
                <p className="text-xs text-cafe-muted">已启用数值账本，章节结算面板变动后将自动按章归档快照。</p>
              ) : (
                <div className="space-y-2">
                  {mechanics.entities.map((ent) => (
                    <div key={ent.entityId} className="rounded-lg bg-cafe-surface-sunken p-2.5 text-xs text-cafe">
                      <div className="font-semibold">{ent.entityName}</div>
                      <div className="mt-1 text-cafe-secondary">
                        {Object.entries(ent.stats)
                          .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join('/') : v}`)
                          .join(' · ')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
};
