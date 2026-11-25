'use client';

import {
  NOVEL_CRAFT_DIMENSION_LABELS,
  NOVEL_CRAFT_DIMENSIONS,
  type NovelCraftDimension,
  type NovelProject,
  type ReferenceBookSummary,
  type RetrievedBeatPassage,
} from '@cat-cafe/shared';
import { type FC, useEffect, useState } from 'react';
import { BookIcon } from './NovelIcons';
import { fileToBase64, type NovelEmbedderConfigDto, novelStudioApi } from './novel-studio-api';

interface ReferenceLibraryPanelProps {
  books: ReferenceBookSummary[];
  activeProject?: NovelProject;
  embeddingConfig: NovelEmbedderConfigDto;
  onRefresh: () => Promise<void>;
}

const STYLE_PRESETS = [
  '沉稳具象·强代入感',
  '冷峻克制·高张力快节奏',
  '诡谲悬疑·细节伏笔流',
  '轻快机锋·强人物对话感',
  '古典雅致·画面意境流',
] as const;

export const ReferenceLibraryPanel: FC<ReferenceLibraryPanelProps> = ({
  books,
  activeProject,
  embeddingConfig,
  onRefresh,
}) => {
  const [uploading, setUploading] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [authorInput, setAuthorInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [stylePreset, setStylePreset] = useState(activeProject?.styleConfig.stylePreset ?? STYLE_PRESETS[0]);
  const [customGuidelines, setCustomGuidelines] = useState(activeProject?.styleConfig.customStyleGuidelines ?? '');

  const [ragQuery, setRagQuery] = useState('');
  const [ragDim, setRagDim] = useState<NovelCraftDimension>('plot_arc');
  const [ragResults, setRagResults] = useState<RetrievedBeatPassage[]>([]);
  const [searching, setSearching] = useState(false);

  const [showEmbedSettings, setShowEmbedSettings] = useState(false);
  const [embedProvider, setEmbedProvider] = useState(embeddingConfig.provider);
  const [embedUrl, setEmbedUrl] = useState(embeddingConfig.apiUrl ?? '');
  const [embedModel, setEmbedModel] = useState(embeddingConfig.model ?? 'BAAI/bge-m3');
  const [embedKey, setEmbedKey] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!activeProject) return;
    setStylePreset(activeProject.styleConfig.stylePreset || STYLE_PRESETS[0]);
    setCustomGuidelines(activeProject.styleConfig.customStyleGuidelines || '');
  }, [activeProject]);

  const handleUpload = async () => {
    if (!selectedFile) return;
    setUploading(true);
    setNotice(null);
    try {
      const base64 = await fileToBase64(selectedFile);
      const inferredTitle = titleInput.trim() || selectedFile.name.replace(/\.(txt|md|epub)$/i, '');
      await novelStudioApi.uploadBook({
        title: inferredTitle,
        author: authorInput.trim(),
        fileName: selectedFile.name,
        contentBase64: base64,
        autoEmbed: true,
      });
      setTitleInput('');
      setAuthorInput('');
      setSelectedFile(null);
      await onRefresh();
      setNotice(`参照小说《${inferredTitle}》已提取句法文风画像与脱敏节拍向量索引。`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleToggleBindBook = async (bookId: string) => {
    if (!activeProject) return;
    const current = activeProject.styleConfig.referenceBookIds;
    const nextIds = current.includes(bookId) ? current.filter((id) => id !== bookId) : [...current, bookId].slice(-3);
    try {
      await novelStudioApi.updateMasterOutlineAndStyle(activeProject.id, {
        styleConfig: {
          ...activeProject.styleConfig,
          referenceBookIds: nextIds,
        },
      });
      await onRefresh();
      setNotice('已更新当前小说的参照风格书单（仅用于下一章 5 方向启发与单章行文节奏模拟）。');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  };

  const handleSaveStyleGuidelines = async () => {
    if (!activeProject) return;
    try {
      await novelStudioApi.updateMasterOutlineAndStyle(activeProject.id, {
        styleConfig: {
          ...activeProject.styleConfig,
          stylePreset,
          customStyleGuidelines: customGuidelines,
        },
      });
      await onRefresh();
      setNotice('已保存单章生成文风配置。');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  };

  const handleRagSearch = async () => {
    if (!ragQuery.trim()) return;
    setSearching(true);
    try {
      const res = await novelStudioApi.searchPassages({
        query: ragQuery.trim(),
        bookIds: activeProject?.styleConfig.referenceBookIds.length
          ? activeProject.styleConfig.referenceBookIds
          : undefined,
        dimension: ragDim,
        mode: 'structural_beats',
        topK: 3,
      });
      setRagResults(res.passages);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setSearching(false);
    }
  };

  const handleSaveEmbedConfig = async () => {
    try {
      await novelStudioApi.updateEmbeddingConfig({
        provider: embedProvider,
        apiUrl: embedUrl.trim() || undefined,
        model: embedModel.trim() || undefined,
        ...(embedKey.trim() ? { apiKey: embedKey.trim() } : {}),
      });
      setShowEmbedSettings(false);
      await onRefresh();
      setNotice('向量索引配置已更新。');
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="space-y-5">
      {notice && (
        <div className="rounded-lg border border-cafe bg-cafe-surface px-3.5 py-2.5 text-xs text-cafe-secondary">
          {notice}
        </div>
      )}

      {/* Active Project Style Guidelines */}
      {activeProject && (
        <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-cafe">《{activeProject.title}》单章行文风格设定</h3>
              <p className="text-xs text-cafe-muted">
                严格边界：参照风格只作用于「下一章前的 5
                方向结构启发」与「下一章正文句法节奏模拟」，绝不干预全书大纲走向。
              </p>
            </div>
            <button
              type="button"
              onClick={() => void handleSaveStyleGuidelines()}
              className="rounded-md bg-cafe-accent px-3 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover"
            >
              保存文风配置
            </button>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-cafe-muted">基础文风预设</label>
              <select
                value={stylePreset}
                onChange={(e) => setStylePreset(e.target.value)}
                className="w-full rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
              >
                {STYLE_PRESETS.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs text-cafe-muted">自定义文风与叙事习惯说明（选填）</label>
              <input
                type="text"
                value={customGuidelines}
                onChange={(e) => setCustomGuidelines(e.target.value)}
                placeholder="例如：第三人称限知视角，少用心理独白铺陈，多通过细微肢体动作和短促对话体现压迫感"
                className="w-full rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
              />
            </div>
          </div>
        </section>
      )}

      {/* Upload Reference Book */}
      <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookIcon className="h-4 w-4 text-cafe-accent" />
            <h3 className="text-sm font-semibold text-cafe">上传参照小说（提取句法节奏与脱敏冲突节拍）</h3>
          </div>
          <button
            type="button"
            onClick={() => setShowEmbedSettings((v) => !v)}
            className="rounded-md border border-cafe px-2.5 py-1 text-xs text-cafe-secondary hover:bg-cafe-surface-sunken"
          >
            向量通道: {embeddingConfig.provider}
          </button>
        </div>

        {showEmbedSettings && (
          <div className="mb-4 grid grid-cols-1 gap-2.5 rounded-lg border border-cafe-subtle bg-cafe-surface-sunken p-3 sm:grid-cols-2">
            <select
              value={embedProvider}
              onChange={(e) => setEmbedProvider(e.target.value as NovelEmbedderConfigDto['provider'])}
              className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
            >
              <option value="auto">自动优选 (API / Sidecar / CJK哈希向量)</option>
              <option value="openai-compatible">OpenAI 兼容接口 (Ollama / SiliconFlow / BGE)</option>
              <option value="clowder-local">Clowder 本地向量 (768d)</option>
              <option value="local-hash-vec">纯本地离线 CJK N-gram 向量 (384d)</option>
              <option value="fts-only">仅 FTS5 BM25 索引</option>
            </select>
            <input
              type="text"
              value={embedModel}
              onChange={(e) => setEmbedModel(e.target.value)}
              placeholder="模型名称（如 BAAI/bge-m3）"
              className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
            />
            <input
              type="text"
              value={embedUrl}
              onChange={(e) => setEmbedUrl(e.target.value)}
              placeholder="API Base URL（留空用本地）"
              className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
            />
            <div className="flex gap-2">
              <input
                type="password"
                value={embedKey}
                onChange={(e) => setEmbedKey(e.target.value)}
                placeholder={embeddingConfig.apiKey ?? 'API Key（无则留空）'}
                className="w-full rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
              />
              <button
                type="button"
                onClick={() => void handleSaveEmbedConfig()}
                className="shrink-0 rounded-md bg-cafe-accent px-3 py-1.5 text-xs font-medium text-cafe-white"
              >
                保存
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
          <input
            type="file"
            accept=".txt,.md,.epub"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              setSelectedFile(f);
              if (f && !titleInput) {
                setTitleInput(f.name.replace(/\.(txt|md|epub)$/i, ''));
              }
            }}
            className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe file:mr-2 file:rounded file:border-0 file:bg-cafe-surface-sunken file:px-2 file:py-1 file:text-xs file:text-cafe"
          />
          <input
            type="text"
            value={titleInput}
            onChange={(e) => setTitleInput(e.target.value)}
            placeholder="参照小说书名"
            className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
          />
          <input
            type="text"
            value={authorInput}
            onChange={(e) => setAuthorInput(e.target.value)}
            placeholder="作者（选填）"
            className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
          />
          <button
            type="button"
            disabled={!selectedFile || uploading}
            onClick={() => void handleUpload()}
            className="rounded-md bg-cafe-accent px-3 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
          >
            {uploading ? '提取文风中...' : '导入并提取文风'}
          </button>
        </div>
      </section>

      {/* Reference Book Cards */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-cafe-muted">
          已导入参照小说 ({books.length})
        </h3>
        {books.length === 0 ? (
          <div className="rounded-xl border border-dashed border-cafe bg-cafe-surface p-6 text-center text-xs text-cafe-muted">
            尚未导入参照小说。上传你喜欢文风的 .txt / .epub / .md 小说，即可一键设为当前作品的下一章行文参照。
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {books.map((book) => {
              const isBound = Boolean(activeProject?.styleConfig.referenceBookIds.includes(book.id));
              return (
                <div key={book.id} className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-cafe">《{book.title}》</span>
                        {book.author && <span className="text-xs text-cafe-muted">{book.author}</span>}
                        <span className="rounded-full bg-cafe-surface-sunken px-2 py-0.5 text-xs text-cafe-secondary">
                          {book.chapterCount} 章 · {(book.totalChars / 10000).toFixed(1)} 万字
                        </span>
                      </div>
                      {book.rawStyleStats && (
                        <p className="mt-1 text-xs text-cafe-muted">
                          平均句长 {book.rawStyleStats.avgSentenceLengthChars} 字 · 对话占比{' '}
                          {Math.round(book.rawStyleStats.dialogueRatio * 100)}% · 叙事视角{' '}
                          {book.rawStyleStats.dominantPov}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      {activeProject && (
                        <button
                          type="button"
                          onClick={() => void handleToggleBindBook(book.id)}
                          className={`rounded-md px-3 py-1 text-xs font-medium ${
                            isBound
                              ? 'bg-semantic-success-surface text-semantic-success'
                              : 'bg-cafe-accent text-cafe-white hover:bg-cafe-accent-hover'
                          }`}
                        >
                          {isBound ? '已设为当前小说参照风格' : '设为当前小说参照风格'}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={async () => {
                          await novelStudioApi.deleteBook(book.id);
                          await onRefresh();
                        }}
                        className="rounded-md border border-cafe px-2 py-1 text-xs text-cafe-muted hover:text-semantic-critical"
                      >
                        移除
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* De-identified Beat Preview Search */}
      <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
        <h3 className="mb-2 text-sm font-semibold text-cafe">脱敏冲突节拍与文风韵律试检索</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input
            type="text"
            value={ragQuery}
            onChange={(e) => setRagQuery(e.target.value)}
            placeholder="输入想参考的场景氛围或冲突情境（如：雨夜客栈试探）"
            className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe sm:col-span-2"
          />
          <select
            value={ragDim}
            onChange={(e) => setRagDim(e.target.value as NovelCraftDimension)}
            className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
          >
            {NOVEL_CRAFT_DIMENSIONS.map((d) => (
              <option key={d} value={d}>
                {NOVEL_CRAFT_DIMENSION_LABELS[d].zh}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={searching || !ragQuery.trim()}
            onClick={() => void handleRagSearch()}
            className="rounded-md bg-cafe-accent px-3 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
          >
            {searching ? '检索中...' : '预览脱敏节拍骨架'}
          </button>
        </div>

        {ragResults.length > 0 && (
          <div className="mt-3 space-y-2">
            {ragResults.map((hit) => (
              <div
                key={hit.chunkId}
                className="rounded-lg border border-cafe-subtle bg-cafe-surface-sunken p-3 text-xs"
              >
                <div className="mb-1 flex items-center justify-between text-cafe-muted">
                  <span>
                    《{hit.bookTitle}》 · {hit.chapterTitle}
                  </span>
                  <span>匹配度 {hit.score}</span>
                </div>
                <pre className="whitespace-pre-wrap font-sans leading-relaxed text-cafe">{hit.content}</pre>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
