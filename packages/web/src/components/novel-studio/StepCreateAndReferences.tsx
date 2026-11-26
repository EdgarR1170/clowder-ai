'use client';

import {
  NOVEL_CRAFT_DIMENSION_LABELS,
  NOVEL_CRAFT_DIMENSIONS,
  type NovelCraftDimension,
  type NovelProject,
  type ReferenceBookSummary,
} from '@cat-cafe/shared';
import { type FC, useEffect, useState } from 'react';
import { MatrixIcon, SparklesIcon } from './NovelIcons';
import { type CatSummaryItem, type NovelProjectBundleDto, novelStudioApi } from './novel-studio-api';

interface Step1CreateNovelProps {
  projects: NovelProject[];
  cats: CatSummaryItem[];
  selectedProjectId: string;
  onSelectExistingProject: (projectId: string) => void;
  onCreatedProject: (bundle: NovelProjectBundleDto) => Promise<void>;
}

export const Step1CreateNovel: FC<Step1CreateNovelProps> = ({
  projects,
  cats,
  selectedProjectId,
  onSelectExistingProject,
  onCreatedProject,
}) => {
  const [title, setTitle] = useState('');
  const [genre, setGenre] = useState('东方奇幻 / 悬疑群像');
  const [architectCatId, setArchitectCatId] = useState('opus');
  const [writerCatId, setWriterCatId] = useState('kimi');
  const [humanizerCatId, setHumanizerCatId] = useState('codex');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cats.length === 0) return;
    const ids = new Set(cats.map((c) => c.id));
    const fallback = cats[0]?.id ?? 'kimi';
    if (!ids.has(architectCatId)) setArchitectCatId(fallback);
    if (!ids.has(writerCatId)) setWriterCatId(cats[1]?.id ?? fallback);
    if (!ids.has(humanizerCatId)) setHumanizerCatId(cats[2]?.id ?? fallback);
  }, [cats, architectCatId, writerCatId, humanizerCatId]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const created = await novelStudioApi.createProject({
        title: title.trim(),
        genre: genre.trim(),
        copilotCatId: writerCatId,
        catRoster: {
          chiefEditorCatId: architectCatId,
          architectCatId,
          writerCatId,
          criticCatId: humanizerCatId,
        },
        createEditorialThread: true,
      });
      setTitle('');
      await onCreatedProject(created);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="rounded-xl border border-cafe bg-cafe-surface p-6 shadow-sm">
        <div className="flex items-center gap-2">
          <SparklesIcon className="h-4 w-4 text-cafe-accent" />
          <h3 className="text-base font-semibold text-cafe">Step 1 · 创建新小说</h3>
        </div>
        <p className="mt-1 text-xs text-cafe-muted">
          输入书名并确认参与协作的多猫编队，创建后直接进入第 2 步为各个模块挑选参照小说。
        </p>

        {error && (
          <div className="mt-3 rounded-lg bg-semantic-critical-surface px-3 py-2 text-xs text-semantic-critical">
            {error}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-cafe">小说名称（必填）</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：烬海巡夜录"
              className="w-full rounded-md border border-cafe bg-cafe-surface-canvas px-3 py-2 text-xs text-cafe"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-cafe">题材分类</label>
            <input
              type="text"
              value={genre}
              onChange={(e) => setGenre(e.target.value)}
              placeholder="例如：仙侠 / 诡秘悬疑 / 都市异能"
              className="w-full rounded-md border border-cafe bg-cafe-surface-canvas px-3 py-2 text-xs text-cafe"
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 rounded-lg border border-cafe-subtle bg-cafe-surface-sunken p-3.5 sm:grid-cols-3">
          <CatRoleSelect
            label="拆解设定 & 5大纲/5细纲猫"
            value={architectCatId}
            cats={cats}
            onChange={setArchitectCatId}
          />
          <CatRoleSelect label="章节正文主笔猫" value={writerCatId} cats={cats} onChange={setWriterCatId} />
          <CatRoleSelect label="去AI味精修猫" value={humanizerCatId} cats={cats} onChange={setHumanizerCatId} />
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            disabled={creating || !title.trim()}
            onClick={() => void handleCreate()}
            className="rounded-md bg-cafe-accent px-5 py-2 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
          >
            {creating ? '创建中...' : '创建小说并进入第 2 步：选择参照小说 →'}
          </button>
        </div>
      </section>

      {projects.length > 0 && (
        <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
          <h4 className="text-xs font-semibold text-cafe-secondary">或者继续已有小说项目：</h4>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {projects.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectExistingProject(p.id)}
                className={`rounded-lg border px-3 py-1.5 text-xs ${
                  p.id === selectedProjectId
                    ? 'border-cafe-accent bg-cafe-surface-sunken font-semibold text-cafe'
                    : 'border-cafe-subtle bg-cafe-surface-canvas text-cafe-secondary hover:text-cafe'
                }`}
              >
                《{p.title}》 · 当前第 {p.currentChapterNo} 章
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

const CatRoleSelect: FC<{
  label: string;
  value: string;
  cats: CatSummaryItem[];
  onChange: (id: string) => void;
}> = ({ label, value, cats, onChange }) => (
  <div>
    <label className="mb-1 block text-[11px] font-medium text-cafe-secondary">{label}</label>
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
    >
      {cats.map((c) => (
        <option key={c.id} value={c.id}>
          {c.nickname ? `${c.nickname} (${c.name})` : c.name} · @{c.id}
        </option>
      ))}
    </select>
  </div>
);

interface Step2SelectModuleReferencesProps {
  project: NovelProject;
  books: ReferenceBookSummary[];
  onSavedAndNext: () => Promise<void>;
  onJumpToLibrary: () => void;
}

export const Step2SelectModuleReferences: FC<Step2SelectModuleReferencesProps> = ({
  project,
  books,
  onSavedAndNext,
  onJumpToLibrary,
}) => {
  const [selectedByDim, setSelectedByDim] = useState<Record<NovelCraftDimension, string[]>>(() =>
    buildInitialDimMap(project),
  );
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    setSelectedByDim(buildInitialDimMap(project));
  }, [project]);

  const toggleBookForDim = (dim: NovelCraftDimension, bookId: string) => {
    setSelectedByDim((prev) => {
      const current = prev[dim] ?? [];
      const next = current.includes(bookId) ? current.filter((x) => x !== bookId) : [...current, bookId];
      return { ...prev, [dim]: next };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    setNotice(null);
    try {
      const selections = NOVEL_CRAFT_DIMENSIONS.map((dimension) => ({
        dimension,
        referenceBookIds: selectedByDim[dimension] ?? [],
      }));
      await novelStudioApi.bindModuleReferences(project.id, selections);
      await onSavedAndNext();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <section className="rounded-xl border border-cafe bg-cafe-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <MatrixIcon className="h-4 w-4 text-cafe-accent" />
              <h3 className="text-base font-semibold text-cafe">
                Step 2 · 为《{project.title}》各个模块分别选择参照小说
              </h3>
            </div>
            <p className="mt-1 text-xs text-cafe-muted">
              可以为大纲选 A 书、战斗选 B 书、人物对话选 C 书、文风选 D
              书（点击书名即可勾选或取消，后台会自动提取挂载对应模块的写法规则；不选则使用默认风格）。
            </p>
          </div>
          <button
            type="button"
            onClick={onJumpToLibrary}
            className="rounded-md border border-cafe px-3 py-1.5 text-xs text-cafe hover:bg-cafe-surface-sunken"
          >
            + 去第 0 步导入更多参考书
          </button>
        </div>

        {notice && (
          <div className="mt-3 rounded-lg bg-semantic-critical-surface px-3 py-2 text-xs text-semantic-critical">
            {notice}
          </div>
        )}

        {books.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-cafe p-8 text-center text-xs text-cafe-muted">
            当前风格库还没有导入参考小说。你可以点右上方去第 0 步上传小说，或者直接点击下方按钮跳过参照进入第 3 步。
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            {NOVEL_CRAFT_DIMENSIONS.map((dim) => {
              const info = NOVEL_CRAFT_DIMENSION_LABELS[dim];
              const chosenIds = selectedByDim[dim] ?? [];
              return (
                <div key={dim} className="rounded-xl border border-cafe-subtle bg-cafe-surface-sunken p-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-cafe">{info.zh}</span>
                    <span className="text-[11px] text-cafe-muted">
                      {chosenIds.length > 0 ? `已选 ${chosenIds.length} 本` : '未指定'}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-cafe-muted">{info.shortDesc}</p>

                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {books.map((bk) => {
                      const active = chosenIds.includes(bk.id);
                      return (
                        <button
                          key={bk.id}
                          type="button"
                          onClick={() => toggleBookForDim(dim, bk.id)}
                          className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                            active
                              ? 'border-cafe-accent bg-cafe-accent text-cafe-white'
                              : 'border-cafe bg-cafe-surface-canvas text-cafe-secondary hover:text-cafe'
                          }`}
                        >
                          《{bk.title}》
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSave()}
            className="rounded-md bg-cafe-accent px-5 py-2 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
          >
            {saving ? '自动提取挂载模块中...' : '保存参照配置并进入第 3 步：输入设定与前三章 →'}
          </button>
        </div>
      </section>
    </div>
  );
};

function buildInitialDimMap(project: NovelProject): Record<NovelCraftDimension, string[]> {
  const result = {
    plot_arc: [] as string[],
    battle_action: [] as string[],
    character_persona: [] as string[],
    scene_atmosphere: [] as string[],
    world_mechanics: [] as string[],
    prose_style: [] as string[],
  };
  for (const bind of project.dimensionBindings) {
    result[bind.dimension] = [...bind.referenceBookIds];
  }
  return result;
}
