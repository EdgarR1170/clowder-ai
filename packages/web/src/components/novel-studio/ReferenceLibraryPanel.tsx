'use client';

import {
  type DistilledCraftSkill,
  NOVEL_CRAFT_DIMENSION_LABELS,
  NOVEL_CRAFT_DIMENSIONS,
  type NovelCraftDimension,
  type ReferenceBookSummary,
  type RetrievedBeatPassage,
} from '@cat-cafe/shared';
import { type FC, useState } from 'react';
import { BookIcon, SparklesIcon } from './NovelIcons';
import { type CatSummaryItem, fileToBase64, type NovelEmbedderConfigDto, novelStudioApi } from './novel-studio-api';

interface ReferenceLibraryPanelProps {
  books: ReferenceBookSummary[];
  skills: DistilledCraftSkill[];
  cats: CatSummaryItem[];
  embeddingConfig: NovelEmbedderConfigDto;
  activeProjectThreadId?: string;
  onRefresh: () => Promise<void>;
}

export const ReferenceLibraryPanel: FC<ReferenceLibraryPanelProps> = ({
  books,
  cats,
  embeddingConfig,
  activeProjectThreadId,
  onRefresh,
}) => {
  const [uploading, setUploading] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [authorInput, setAuthorInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [distillBookId, setDistillBookId] = useState<string>('');
  const [distillDim, setDistillDim] = useState<NovelCraftDimension>('battle_action');
  const [distillFocus, setDistillFocus] = useState('');
  const [distillCatId, setDistillCatId] = useState<string>('');
  const [distilling, setDistilling] = useState(false);

  const [ragQuery, setRagQuery] = useState('');
  const [ragDim, setRagDim] = useState<NovelCraftDimension>('battle_action');
  const [ragMode, setRagMode] = useState<'structural_beats' | 'raw_excerpt'>('structural_beats');
  const [ragResults, setRagResults] = useState<RetrievedBeatPassage[]>([]);
  const [searching, setSearching] = useState(false);

  const [showEmbedSettings, setShowEmbedSettings] = useState(false);
  const [embedProvider, setEmbedProvider] = useState(embeddingConfig.provider);
  const [embedUrl, setEmbedUrl] = useState(embeddingConfig.apiUrl ?? '');
  const [embedModel, setEmbedModel] = useState(embeddingConfig.model ?? 'BAAI/bge-m3');
  const [embedKey, setEmbedKey] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

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
      setNotice(`《${inferredTitle}》已完成分章、6维密度扫描与 sqlite-vec 向量索引。`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  const handleDistill = async (bookId: string) => {
    setDistilling(true);
    setNotice(null);
    try {
      const res = await novelStudioApi.distillSkillFromBook(bookId, {
        dimension: distillDim,
        customFocus: distillFocus.trim() || undefined,
        deepRefineThreadId: distillCatId && activeProjectThreadId ? activeProjectThreadId : undefined,
        dissectorCatId: distillCatId || undefined,
      });
      await onRefresh();
      setDistillBookId('');
      setDistillFocus('');
      setNotice(
        `已生成并挂载技法包「${res.skill.slug}」` +
          (distillCatId && activeProjectThreadId ? `，并已唤醒 @${distillCatId} 在编辑部群聊执行深度精炼。` : '。'),
      );
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setDistilling(false);
    }
  };

  const handleRagSearch = async () => {
    if (!ragQuery.trim()) return;
    setSearching(true);
    try {
      const res = await novelStudioApi.searchPassages({
        query: ragQuery.trim(),
        dimension: ragDim,
        mode: ragMode,
        topK: 4,
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
      setNotice('向量索引引擎配置已更新。');
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

      {/* Upload & Embedding Engine Header */}
      <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <BookIcon className="h-4 w-4 text-cafe-accent" />
            <h3 className="text-sm font-semibold text-cafe">导入参考小说（拆书源 A / B / C / D）</h3>
          </div>
          <button
            type="button"
            onClick={() => setShowEmbedSettings((v) => !v)}
            className="rounded-md border border-cafe px-2.5 py-1 text-xs text-cafe-secondary hover:bg-cafe-surface-sunken"
          >
            向量源: {embeddingConfig.provider}
          </button>
        </div>

        {showEmbedSettings && (
          <div className="mb-4 grid grid-cols-1 gap-2.5 rounded-lg border border-cafe-subtle bg-cafe-surface-sunken p-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-cafe-muted">Embedding 通道</label>
              <select
                value={embedProvider}
                onChange={(e) => setEmbedProvider(e.target.value as NovelEmbedderConfigDto['provider'])}
                className="w-full rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
              >
                <option value="auto">自动优选 (API / 本地Sidecar / CJK哈希向量)</option>
                <option value="openai-compatible">OpenAI 兼容接口 (Ollama / SiliconFlow / BGE)</option>
                <option value="clowder-local">Clowder 内置 Python Sidecar (768d)</option>
                <option value="local-hash-vec">纯本地离线 CJK N-gram 向量 (384d)</option>
                <option value="fts-only">仅 FTS5 BM25 词法索引</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-cafe-muted">模型名称</label>
              <input
                type="text"
                value={embedModel}
                onChange={(e) => setEmbedModel(e.target.value)}
                placeholder="BAAI/bge-m3 或 nomic-embed-text"
                className="w-full rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-cafe-muted">API Base URL (如 http://127.0.0.1:11434/v1)</label>
              <input
                type="text"
                value={embedUrl}
                onChange={(e) => setEmbedUrl(e.target.value)}
                placeholder="留空则使用本地向量通道"
                className="w-full rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-cafe-muted">API Key (可选)</label>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={embedKey}
                  onChange={(e) => setEmbedKey(e.target.value)}
                  placeholder={embeddingConfig.apiKey ?? '无密钥可留空'}
                  className="w-full rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
                />
                <button
                  type="button"
                  onClick={handleSaveEmbedConfig}
                  className="shrink-0 rounded-md bg-cafe-accent px-3 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover"
                >
                  保存
                </button>
              </div>
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
            placeholder="参考书名（如：大主宰 / 诡秘之主）"
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
            onClick={handleUpload}
            className="rounded-md bg-cafe-accent px-3 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
          >
            {uploading ? '分章与向量索引中...' : '拆书入库 + 建向量'}
          </button>
        </div>
        <p className="mt-2 text-xs text-cafe-muted">
          支持 UTF-8 / GB18030 中文长篇 .txt、.epub 与 .md，自动完成章回切分、6 维技法密度扫描与 sqlite-vec 混合索引。
        </p>
      </section>

      {/* Ingested Reference Books List */}
      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-cafe-muted">
          已入库参考小说 ({books.length})
        </h3>
        {books.length === 0 ? (
          <div className="rounded-xl border border-dashed border-cafe bg-cafe-surface p-6 text-center text-xs text-cafe-muted">
            尚未导入参考小说。先上传 A/B/C/D 参考书，即可一键抽离各维度 Book-to-Skill 技法包。
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {books.map((book) => (
              <div key={book.id} className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-cafe">《{book.title}》</span>
                      {book.author && <span className="text-xs text-cafe-muted">{book.author}</span>}
                      <span className="rounded-full bg-cafe-surface-sunken px-2 py-0.5 text-xs text-cafe-secondary">
                        {book.chapterCount} 章 · {(book.totalChars / 10000).toFixed(1)} 万字 · {book.chunkCount} 场景块
                      </span>
                      <span className="rounded-full bg-semantic-success-surface px-2 py-0.5 text-xs text-semantic-success">
                        {book.embedStatus === 'vec_ready' ? `向量就绪 (${book.embeddedChunkCount})` : book.embedStatus}
                      </span>
                    </div>
                    {book.rawStyleStats && (
                      <p className="mt-1 text-xs text-cafe-muted">
                        平均句长 {book.rawStyleStats.avgSentenceLengthChars} 字 · 对话占比{' '}
                        {Math.round(book.rawStyleStats.dialogueRatio * 100)}% · 主视角 {book.rawStyleStats.dominantPov}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setDistillBookId(distillBookId === book.id ? '' : book.id)}
                      className="inline-flex items-center gap-1 rounded-md bg-cafe-accent px-2.5 py-1 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover"
                    >
                      <SparklesIcon className="h-3.5 w-3.5" />
                      抽离维度技法 Skill
                    </button>
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

                {/* 6-Dimension Density Bars */}
                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
                  {NOVEL_CRAFT_DIMENSIONS.map((dim) => {
                    const score = book.dimensionAverages[dim] ?? 0;
                    return (
                      <div key={dim} className="rounded-md bg-cafe-surface-sunken px-2.5 py-1.5">
                        <div className="flex justify-between text-xs text-cafe-secondary">
                          <span>{NOVEL_CRAFT_DIMENSION_LABELS[dim].zh.slice(0, 4)}</span>
                          <span>{Math.round(score * 100)}%</span>
                        </div>
                        <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-cafe-surface-canvas">
                          <div
                            className="h-full rounded-full bg-cafe-accent"
                            style={{ width: `${Math.min(100, Math.max(6, Math.round(score * 100)))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Inline Book-to-Skill Distillation Drawer */}
                {distillBookId === book.id && (
                  <div className="mt-3 rounded-lg border border-cafe-subtle bg-cafe-surface-sunken p-3">
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-xs font-medium text-cafe">选择要从本书抽离的单一维度</label>
                        <select
                          value={distillDim}
                          onChange={(e) => setDistillDim(e.target.value as NovelCraftDimension)}
                          className="w-full rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
                        >
                          {NOVEL_CRAFT_DIMENSIONS.map((d) => (
                            <option key={d} value={d}>
                              {NOVEL_CRAFT_DIMENSION_LABELS[d].zh} — {NOVEL_CRAFT_DIMENSION_LABELS[d].shortDesc}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-cafe">定向萃取侧重点（选填）</label>
                        <input
                          type="text"
                          value={distillFocus}
                          onChange={(e) => setDistillFocus(e.target.value)}
                          placeholder="例如：重点学习多人混战中的空间换位与悬念断章"
                          className="w-full rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs font-medium text-cafe">同步唤醒拆书猫深化（可选）</label>
                        <div className="flex gap-2">
                          <select
                            value={distillCatId}
                            onChange={(e) => setDistillCatId(e.target.value)}
                            className="w-full rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
                          >
                            <option value="">仅立即编译统计+规则技法包</option>
                            {cats.map((c) => (
                              <option key={c.id} value={c.id}>
                                交由 {c.name} (@{c.id}) 深度精读升华
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            disabled={distilling}
                            onClick={() => handleDistill(book.id)}
                            className="shrink-0 rounded-md bg-cafe-accent px-3 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
                          >
                            {distilling ? '生成中...' : '生成 Skill'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Hybrid Vector + FTS5 RAG Sandbox */}
      <section className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
        <h3 className="mb-2.5 text-sm font-semibold text-cafe">混合向量 RAG 场景节拍试搜（sqlite-vec + FTS5）</h3>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-5">
          <input
            type="text"
            value={ragQuery}
            onChange={(e) => setRagQuery(e.target.value)}
            placeholder="输入场景情境，如：雨夜窄巷以弱胜强突围 / 师徒决裂潜台词试探"
            className=" rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe sm:col-span-2"
          />
          <select
            value={ragDim}
            onChange={(e) => setRagDim(e.target.value as NovelCraftDimension)}
            className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
          >
            {NOVEL_CRAFT_DIMENSIONS.map((d) => (
              <option key={d} value={d}>
                优先维度：{NOVEL_CRAFT_DIMENSION_LABELS[d].zh}
              </option>
            ))}
          </select>
          <select
            value={ragMode}
            onChange={(e) => setRagMode(e.target.value as 'structural_beats' | 'raw_excerpt')}
            className="rounded-md border border-cafe bg-cafe-surface-canvas px-2.5 py-1.5 text-xs text-cafe"
          >
            <option value="structural_beats">脱敏节拍骨架 (防洗稿推荐)</option>
            <option value="raw_excerpt">原文对照切片</option>
          </select>
          <button
            type="button"
            disabled={searching || !ragQuery.trim()}
            onClick={handleRagSearch}
            className="rounded-md bg-cafe-accent px-3 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
          >
            {searching ? '检索中...' : '向量混合召回'}
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
