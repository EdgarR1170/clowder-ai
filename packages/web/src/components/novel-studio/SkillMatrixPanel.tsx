'use client';

import {
  type DimensionSkillBinding,
  type DistilledCraftSkill,
  NOVEL_CRAFT_DIMENSION_LABELS,
  NOVEL_CRAFT_DIMENSIONS,
  type NovelProject,
  type ReferenceBookSummary,
} from '@cat-cafe/shared';
import { type FC, useEffect, useState } from 'react';
import { MatrixIcon, SparklesIcon } from './NovelIcons';
import { type CatSummaryItem, type NovelMemberQuotaItem, novelStudioApi } from './novel-studio-api';

interface SkillMatrixPanelProps {
  project: NovelProject;
  books: ReferenceBookSummary[];
  skills: DistilledCraftSkill[];
  cats: CatSummaryItem[];
  onUpdated: () => Promise<void>;
}

export const SkillMatrixPanel: FC<SkillMatrixPanelProps> = ({ project, books, skills, cats, onUpdated }) => {
  const [bindings, setBindings] = useState<DimensionSkillBinding[]>(project.dimensionBindings);
  const [roster, setRoster] = useState(project.catRoster);
  const [saving, setSaving] = useState(false);
  const [inspectSlug, setInspectSlug] = useState<string>('');
  const [inspectMarkdown, setInspectMarkdown] = useState<string>('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [quotaByCat, setQuotaByCat] = useState<Record<string, NovelMemberQuotaItem>>({});

  useEffect(() => {
    let cancelled = false;
    novelStudioApi
      .fetchMemberQuota()
      .then((res) => {
        if (cancelled) return;
        setQuotaByCat(Object.fromEntries(res.members.map((member) => [member.catId, member])));
      })
      .catch(() => {
        /* quota is advisory; a failed probe must not block the roster editor */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    setBindings(project.dimensionBindings);
    setRoster(project.catRoster);
  }, [project]);

  const updateDimensionRow = (dimIndex: number, patch: Partial<DimensionSkillBinding>) => {
    setBindings((prev) => prev.map((row, idx) => (idx === dimIndex ? { ...row, ...patch } : row)));
  };

  const toggleSkillInRow = (dimIndex: number, slug: string) => {
    setBindings((prev) =>
      prev.map((row, idx) => {
        if (idx !== dimIndex) return row;
        const exists = row.skillSlugs.includes(slug);
        const skillObj = skills.find((s) => s.slug === slug);
        const nextSkills = exists ? row.skillSlugs.filter((s) => s !== slug) : [...row.skillSlugs, slug];
        const nextBooks =
          !exists && skillObj && !row.referenceBookIds.includes(skillObj.sourceBookId)
            ? [...row.referenceBookIds, skillObj.sourceBookId]
            : row.referenceBookIds;
        return { ...row, skillSlugs: nextSkills, referenceBookIds: nextBooks };
      }),
    );
  };

  const toggleBookRagInRow = (dimIndex: number, bookId: string) => {
    setBindings((prev) =>
      prev.map((row, idx) => {
        if (idx !== dimIndex) return row;
        const exists = row.referenceBookIds.includes(bookId);
        return {
          ...row,
          referenceBookIds: exists
            ? row.referenceBookIds.filter((b) => b !== bookId)
            : [...row.referenceBookIds, bookId],
        };
      }),
    );
  };

  const handleSaveAll = async () => {
    setSaving(true);
    setStatusMsg(null);
    try {
      await novelStudioApi.updateMatrix(project.id, bindings);
      await novelStudioApi.updateWorkflow(project.id, {}, roster);
      await onUpdated();
      setStatusMsg('多书维度技法配比矩阵与编辑部猫群分工已保存生效！');
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const openSkillPreview = async (slug: string) => {
    if (inspectSlug === slug) {
      setInspectSlug('');
      return;
    }
    setInspectSlug(slug);
    const detail = await novelStudioApi.getSkillDetail(slug);
    setInspectMarkdown(detail.skillMarkdown);
  };

  return (
    <div className="space-y-5">
      {statusMsg && (
        <div className="rounded-lg border border-cafe bg-cafe-surface px-3.5 py-2 text-xs text-cafe-secondary">
          {statusMsg}
        </div>
      )}

      {/* Editorial Cat Roster Assignment */}
      <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-cafe">多猫编辑部席位分工（异构模型协同与互审）</h3>
            <p className="text-xs text-cafe-muted">
              总编猫按章动态挂载下方技法矩阵并发起防穿帮预检；审校猫必须与主笔猫为不同个体（服务端硬门禁拦截自审）。
            </p>
          </div>
          <button
            type="button"
            disabled={saving}
            onClick={handleSaveAll}
            className="rounded-md bg-cafe-accent px-3.5 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存配比与席位'}
          </button>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {(
            [
              ['chiefEditorCatId', '总编统筹猫 (Coordinator)'],
              ['architectCatId', '大纲架构猫 (Outliner)'],
              ['writerCatId', '首席主笔猫 (Writer)'],
              ['specialistCatId', '分镜顾问猫 (Battle/Scene)'],
              ['criticCatId', '异构审校猫 (Critic Gate)'],
            ] as const
          ).map(([field, label]) => (
            <div key={field}>
              <label className="mb-1 block text-xs font-medium text-cafe-secondary">{label}</label>
              <select
                value={roster[field]}
                onChange={(e) => setRoster((prev) => ({ ...prev, [field]: e.target.value }))}
                className="w-full rounded-md border border-cafe bg-cafe-surface-canvas px-2 py-1.5 text-xs text-cafe"
              >
                {cats.length === 0 && <option value={roster[field]}>{roster[field]}</option>}
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} (@{c.id})
                  </option>
                ))}
              </select>
              {quotaByCat[roster[field]] && !quotaByCat[roster[field]].available && (
                <p className="mt-1 text-[11px] leading-tight" style={{ color: 'var(--semantic-critical)' }}>
                  冷却中 · 预计{' '}
                  {quotaByCat[roster[field]].blockedUntil
                    ? new Date(quotaByCat[roster[field]].blockedUntil as number).toLocaleString('zh-CN', {
                        hour12: false,
                      })
                    : '稍后'}{' '}
                  恢复
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Multi-Book Craft Dimension Matrix (A -> Outline, B -> Battle, C -> Persona, D -> Scene) */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <MatrixIcon className="h-4 w-4 text-cafe-accent" />
          <h3 className="text-sm font-semibold text-cafe">
            多书分维技法配比矩阵（A书抽大纲 · B书抽战斗 · C书抽人设 · D书抽场景）
          </h3>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {NOVEL_CRAFT_DIMENSIONS.map((dim) => {
            const dimIndex = bindings.findIndex((b) => b.dimension === dim);
            const row: DimensionSkillBinding =
              dimIndex >= 0
                ? bindings[dimIndex]!
                : { dimension: dim, skillSlugs: [], referenceBookIds: [], ragWeight: 0.7, ragMode: 'structural_beats' };
            const meta = NOVEL_CRAFT_DIMENSION_LABELS[dim];
            const matchingSkills = skills.filter((s) => s.dimension === dim);
            const otherSkills = skills.filter((s) => s.dimension !== dim);

            return (
              <div key={dim} className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-semibold text-cafe">【{meta.zh}】</span>
                    <span className="ml-2 text-xs text-cafe-muted">{meta.shortDesc}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={row.ragMode}
                      onChange={(e) =>
                        dimIndex >= 0 &&
                        updateDimensionRow(dimIndex, {
                          ragMode: e.target.value as 'structural_beats' | 'raw_excerpt',
                        })
                      }
                      className="rounded border border-cafe bg-cafe-surface-canvas px-2 py-1 text-xs text-cafe"
                    >
                      <option value="structural_beats">RAG 召回：脱敏节拍骨架</option>
                      <option value="raw_excerpt">RAG 召回：原文对照</option>
                    </select>
                  </div>
                </div>

                {/* Bound Book-to-Skill Chips */}
                <div className="mt-3">
                  <div className="mb-1.5 text-xs text-cafe-muted">挂载的 Book-to-Skill 技法包（点击勾选/预览）：</div>
                  <div className="flex flex-wrap gap-2">
                    {[...matchingSkills, ...otherSkills].length === 0 ? (
                      <span className="text-xs text-cafe-muted">
                        暂无技法包，请先在「藏书拆解」面板对参考书执行维度蒸馏。
                      </span>
                    ) : (
                      [...matchingSkills, ...otherSkills].map((sk) => {
                        const active = row.skillSlugs.includes(sk.slug);
                        return (
                          <div
                            key={sk.slug}
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                              active
                                ? 'border-cafe-accent bg-cafe-surface-sunken font-medium text-cafe'
                                : 'border-cafe bg-cafe-surface-canvas text-cafe-muted'
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => dimIndex >= 0 && toggleSkillInRow(dimIndex, sk.slug)}
                              className="flex items-center gap-1"
                            >
                              <SparklesIcon className="h-3 w-3 text-cafe-accent" />
                              <span>{sk.title}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => openSkillPreview(sk.slug)}
                              className="ml-1 underline opacity-75 hover:opacity-100"
                            >
                              查看规则
                            </button>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* Reference Books for Real-time Vector RAG */}
                {books.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <span className="text-xs text-cafe-muted">实时向量 RAG 限定书源：</span>
                    {books.map((bk) => {
                      const checked = row.referenceBookIds.includes(bk.id);
                      return (
                        <button
                          key={bk.id}
                          type="button"
                          onClick={() => dimIndex >= 0 && toggleBookRagInRow(dimIndex, bk.id)}
                          className={`rounded-md border px-2 py-0.5 text-xs ${
                            checked
                              ? 'border-cafe-accent bg-semantic-info-surface text-semantic-info'
                              : 'border-cafe bg-cafe-surface-canvas text-cafe-muted'
                          }`}
                        >
                          《{bk.title}》
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Skill SKILL.md Live Drawer */}
      {inspectSlug && (
        <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-cafe">SKILL.md 技法规范预览 · {inspectSlug}</h4>
            <button
              type="button"
              onClick={() => setInspectSlug('')}
              className="text-xs text-cafe-muted hover:text-cafe"
            >
              收起
            </button>
          </div>
          <pre className="max-h-80 overflow-y-auto whitespace-pre-wrap rounded-lg bg-cafe-surface-sunken p-3 font-mono text-xs leading-relaxed text-cafe">
            {inspectMarkdown || '加载中...'}
          </pre>
        </section>
      )}
    </div>
  );
};
