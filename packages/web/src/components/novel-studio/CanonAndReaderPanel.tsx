'use client';

import {
  type CharacterNode,
  isChapterCompletedStage,
  type MechanicsLedger,
  type NarrativeGraph,
  type NovelProject,
} from '@cat-cafe/shared';
import { type FC, useEffect, useState } from 'react';
import { DownloadIcon, FeatherIcon, ShieldCanonIcon } from './NovelIcons';
import { novelStudioApi } from './novel-studio-api';

interface CanonAndReaderPanelProps {
  project: NovelProject;
  canon: NarrativeGraph;
  mechanics: MechanicsLedger;
  selectedChapterNo: number;
  onSelectChapterNo: (no: number) => void;
  onJumpToCopilotChapter?: (no: number) => void;
  onUpdated: () => Promise<void>;
}

export const CanonAndReaderPanel: FC<CanonAndReaderPanelProps> = ({
  project,
  canon,
  mechanics,
  onSelectChapterNo,
  onJumpToCopilotChapter,
  onUpdated,
}) => {
  const [subTab, setSubTab] = useState<'summaries' | 'canon'>('summaries');
  const [masterOutline, setMasterOutline] = useState(project.authorMasterOutlineMarkdown || '');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const [charName, setCharName] = useState('');
  const [charRole, setCharRole] = useState<CharacterNode['role']>('protagonist');
  const [charPower, setCharPower] = useState('');
  const [charVoice, setCharVoice] = useState('');

  useEffect(() => {
    setMasterOutline(project.authorMasterOutlineMarkdown || '');
  }, [project.authorMasterOutlineMarkdown]);

  const completedChapters = Object.values(project.chapters)
    .filter((ch) => isChapterCompletedStage(ch.stage) || Boolean(ch.distilledSummary))
    .sort((a, b) => a.chapterNo - b.chapterNo);

  const handleSaveMasterOutline = async () => {
    setBusy(true);
    setNotice(null);
    try {
      await novelStudioApi.updateMasterOutlineAndStyle(project.id, {
        authorMasterOutlineMarkdown: masterOutline,
      });
      await onUpdated();
      setNotice('已保存作者手写主线大纲。');
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
      const nextChar: CharacterNode = {
        id: `char-${Date.now().toString(36)}`,
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
            onClick={() => setSubTab('summaries')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium ${
              subTab === 'summaries' ? 'bg-cafe-surface-sunken text-cafe' : 'text-cafe-muted'
            }`}
          >
            <FeatherIcon className="h-3.5 w-3.5" />
            总结式大纲对照 ({completedChapters.length} 章已沉淀)
          </button>
          <button
            type="button"
            onClick={() => setSubTab('canon')}
            className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium ${
              subTab === 'canon' ? 'bg-cafe-surface-sunken text-cafe' : 'text-cafe-muted'
            }`}
          >
            <ShieldCanonIcon className="h-3.5 w-3.5" />
            活体设定集与防穿帮账本 ({canon.characters.length} 角色 / {canon.foreshadowings.length} 伏笔)
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleExport('md')}
            className="inline-flex items-center gap-1 rounded-md border border-cafe bg-cafe-surface px-2.5 py-1 text-xs text-cafe hover:bg-cafe-surface-sunken"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            导出整书 .md
          </button>
          <button
            type="button"
            onClick={() => void handleExport('txt')}
            className="inline-flex items-center gap-1 rounded-md border border-cafe bg-cafe-surface px-2.5 py-1 text-xs text-cafe hover:bg-cafe-surface-sunken"
          >
            <DownloadIcon className="h-3.5 w-3.5" />
            导出整书 .txt
          </button>
        </div>
      </div>

      {subTab === 'summaries' ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left: Author Master Outline */}
          <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm lg:col-span-5">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-cafe">作者手写初始 / 主线大纲</h4>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSaveMasterOutline()}
                className="rounded-md bg-cafe-accent px-2.5 py-1 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
              >
                保存主线大纲
              </button>
            </div>
            <p className="mt-1 text-xs text-cafe-muted">
              这里记录你的全局想法与大方向，主创猫只读取不覆盖；右侧则是根据每一章定稿内容自底向上提炼出的真实总结大纲。
            </p>
            <textarea
              rows={16}
              value={masterOutline}
              onChange={(e) => setMasterOutline(e.target.value)}
              placeholder="输入你的主线大纲、阶段目标或人物命运走向..."
              className="mt-3 w-full rounded-lg border border-cafe bg-cafe-surface-canvas p-3 text-xs leading-6 text-cafe"
            />
          </section>

          {/* Right: Bottom-Up Distilled Chapter Summaries & Archived Branches */}
          <section className="space-y-3 rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm lg:col-span-7">
            <h4 className="text-sm font-semibold text-cafe">随章自动生成的总结式大纲时间线</h4>
            {completedChapters.length === 0 ? (
              <div className="rounded-lg border border-dashed border-cafe p-8 text-center text-xs text-cafe-muted">
                尚未有已定稿章节。在「逐章共创台」每写完确认一章，都会自动反向提炼出总结式分章大纲。
              </div>
            ) : (
              <div className="space-y-2.5">
                {completedChapters.map((ch) => {
                  const sum = ch.distilledSummary;
                  return (
                    <div
                      key={ch.chapterNo}
                      className="rounded-lg border border-cafe-subtle bg-cafe-surface-sunken p-3 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-cafe">
                          第 {ch.chapterNo} 章 · {sum?.title || ch.title || '无标题'}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            onSelectChapterNo(ch.chapterNo);
                            onJumpToCopilotChapter?.(ch.chapterNo);
                          }}
                          className="text-cafe-accent hover:underline"
                        >
                          跳至此章共创台 →
                        </button>
                      </div>
                      {sum && (
                        <div className="mt-1.5 space-y-1 text-cafe-secondary">
                          <p>{sum.oneLineSummary}</p>
                          {sum.keyEvents.length > 0 && (
                            <p className="text-cafe-muted">事件：{sum.keyEvents.join(' → ')}</p>
                          )}
                          {sum.newlyIntroducedSettings.length > 0 && (
                            <p className="text-cafe-muted">新增设定：{sum.newlyIntroducedSettings.join('、')}</p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {project.archivedBranches.length > 0 && (
              <div className="mt-4 border-t border-cafe-subtle pt-3">
                <h5 className="text-xs font-semibold text-cafe-secondary">
                  历史回档支线归档 ({project.archivedBranches.length} 条旧时间线备份)
                </h5>
                <div className="mt-2 space-y-2">
                  {project.archivedBranches.map((br) => (
                    <div
                      key={br.branchId}
                      className="rounded-lg border border-cafe-subtle bg-cafe-surface-canvas p-2.5 text-xs text-cafe-muted"
                    >
                      <div className="font-medium text-cafe-secondary">
                        {br.branchId} · {br.reason}（含第 {br.chapters.map((c) => c.chapterNo).join('、')} 章旧稿）
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        </div>
      ) : (
        <CanonDetailsView
          project={project}
          canon={canon}
          mechanics={mechanics}
          charName={charName}
          onChangeCharName={setCharName}
          charRole={charRole}
          onChangeCharRole={setCharRole}
          charPower={charPower}
          onChangeCharPower={setCharPower}
          charVoice={charVoice}
          onChangeCharVoice={setCharVoice}
          busy={busy}
          onAddCharacter={() => void handleAddCharacter()}
          onToggleMechanics={async () => {
            await novelStudioApi.saveMechanics(project.id, {
              ...mechanics,
              enabled: !mechanics.enabled,
            });
            await onUpdated();
          }}
        />
      )}
    </div>
  );
};

interface CanonDetailsViewProps {
  project: NovelProject;
  canon: NarrativeGraph;
  mechanics: MechanicsLedger;
  charName: string;
  onChangeCharName: (v: string) => void;
  charRole: CharacterNode['role'];
  onChangeCharRole: (v: CharacterNode['role']) => void;
  charPower: string;
  onChangeCharPower: (v: string) => void;
  charVoice: string;
  onChangeCharVoice: (v: string) => void;
  busy: boolean;
  onAddCharacter: () => void;
  onToggleMechanics: () => Promise<void>;
}

const CanonDetailsView: FC<CanonDetailsViewProps> = ({
  project,
  canon,
  mechanics,
  charName,
  onChangeCharName,
  charRole,
  onChangeCharRole,
  charPower,
  onChangeCharPower,
  charVoice,
  onChangeCharVoice,
  busy,
  onAddCharacter,
  onToggleMechanics,
}) => (
  <div className="space-y-4">
    {project.accumulatedWorldbuildingMarkdown && (
      <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
        <h4 className="mb-2 text-sm font-semibold text-cafe">随章自动沉淀的世界观与专有设定笔记</h4>
        <pre className="whitespace-pre-wrap font-sans text-xs leading-6 text-cafe-secondary">
          {project.accumulatedWorldbuildingMarkdown}
        </pre>
      </section>
    )}

    <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
      <h4 className="mb-2.5 text-sm font-semibold text-cafe">角色状态、持有物与知情边界（按章快照防穿帮）</h4>
      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-5">
        <input
          type="text"
          value={charName}
          onChange={(e) => onChangeCharName(e.target.value)}
          placeholder="角色姓名"
          className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
        />
        <select
          value={charRole}
          onChange={(e) => onChangeCharRole(e.target.value as CharacterNode['role'])}
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
          onChange={(e) => onChangeCharPower(e.target.value)}
          placeholder="当前境界/身份阶位"
          className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
        />
        <input
          type="text"
          value={charVoice}
          onChange={(e) => onChangeCharVoice(e.target.value)}
          placeholder="说话语气特征"
          className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
        />
        <button
          type="button"
          disabled={busy || !charName.trim()}
          onClick={onAddCharacter}
          className="rounded-md bg-cafe-accent px-3 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
        >
          + 手动补充角色
        </button>
      </div>

      {canon.characters.length === 0 ? (
        <p className="text-xs text-cafe-muted">暂无角色卡片（既可手动添加初始主角，也会随每章定稿自动提取补充）。</p>
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
              {ch.powerTier && <div className="mt-1 text-cafe-secondary">境界/身份：{ch.powerTier}</div>}
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
          <h4 className="text-sm font-semibold text-cafe">可选系统/境界数值账本</h4>
          <button
            type="button"
            onClick={() => void onToggleMechanics()}
            className="rounded border border-cafe px-2 py-0.5 text-xs text-cafe"
          >
            {mechanics.enabled ? '已启用数值校验' : '点击启用数值层'}
          </button>
        </div>
        {!mechanics.enabled ? (
          <p className="text-xs text-cafe-muted">
            当前为常规叙事模式。若写系统流/数据流小说，可开启数值账本按章快照追踪属性加减。
          </p>
        ) : mechanics.entities.length === 0 ? (
          <p className="text-xs text-cafe-muted">已启用数值账本，章节结算面板变动后将自动归档快照。</p>
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
);
