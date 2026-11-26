'use client';

import { NOVEL_CRAFT_DIMENSION_LABELS, NOVEL_CRAFT_DIMENSIONS, type ReferenceBookSummary } from '@cat-cafe/shared';
import { type FC, useState } from 'react';
import { BookIcon, TrashIcon } from './NovelIcons';
import { fileToBase64, novelStudioApi } from './novel-studio-api';

interface ReferenceLibraryPanelProps {
  books: ReferenceBookSummary[];
  hasActiveProject: boolean;
  onRefresh: () => Promise<void>;
  onGoNextStep: () => void;
}

export const ReferenceLibraryPanel: FC<ReferenceLibraryPanelProps> = ({
  books,
  hasActiveProject,
  onRefresh,
  onGoNextStep,
}) => {
  const [uploading, setUploading] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [authorInput, setAuthorInput] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
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
      setNotice(`《${inferredTitle}》已导入并完成 6 大风格模块解析，可在第 2 步按分块选用。`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : String(err));
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      {notice && (
        <div className="rounded-lg border border-cafe bg-cafe-surface px-3.5 py-2 text-xs text-cafe-secondary">
          {notice}
        </div>
      )}

      {/* Upload Card */}
      <section className="rounded-xl border border-cafe bg-cafe-surface p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <BookIcon className="h-4 w-4 text-cafe-accent" />
          <h3 className="text-sm font-semibold text-cafe">Step 0 · 导入参照小说风格库</h3>
        </div>
        <p className="mt-1 text-xs text-cafe-muted">
          导入你喜欢的小说（.txt / .epub /
          .md），系统会自动拆解出「大纲节奏、战斗动作、人物对话、场景氛围、世界观机制、文风句法」6
          个模块供后续分别选用。
        </p>

        <div className="mt-3.5 grid grid-cols-1 gap-2.5 sm:grid-cols-4">
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
            placeholder="书名（自动识别或手填）"
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
            className="rounded-md bg-cafe-accent px-3.5 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover disabled:opacity-50"
          >
            {uploading ? '导入解析中...' : '导入参考小说'}
          </button>
        </div>
      </section>

      {/* Imported Books List */}
      <section className="space-y-2.5">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-cafe-secondary">已入库参考小说 ({books.length} 本)</span>
          <button
            type="button"
            onClick={onGoNextStep}
            className="rounded-md bg-cafe-accent px-4 py-1.5 text-xs font-medium text-cafe-white hover:bg-cafe-accent-hover"
          >
            {hasActiveProject ? '前往第 2 步：分块选择参照小说 →' : '下一步：1. 创建小说 →'}
          </button>
        </div>

        {books.length === 0 ? (
          <div className="rounded-xl border border-dashed border-cafe bg-cafe-surface p-8 text-center text-xs text-cafe-muted">
            目前还没有导入参照小说（也可以先跳过，直接点击右上方「下一步：1. 创建小说」）。
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3">
            {books.map((book) => (
              <div key={book.id} className="rounded-xl border border-cafe bg-cafe-surface p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-sm font-semibold text-cafe">《{book.title}》</span>
                    {book.author && <span className="ml-2 text-xs text-cafe-muted">{book.author}</span>}
                    <span className="ml-2 rounded-full bg-cafe-surface-sunken px-2 py-0.5 text-xs text-cafe-secondary">
                      {book.chapterCount} 章 · {(book.totalChars / 10000).toFixed(1)} 万字
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      await novelStudioApi.deleteBook(book.id);
                      await onRefresh();
                    }}
                    className="inline-flex items-center gap-1 rounded border border-cafe px-2 py-1 text-xs text-cafe-muted hover:text-semantic-critical"
                  >
                    <TrashIcon className="h-3 w-3" />
                    移除
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-6">
                  {NOVEL_CRAFT_DIMENSIONS.map((dim) => {
                    const pct = Math.round((book.dimensionAverages[dim] ?? 0) * 100);
                    return (
                      <div key={dim} className="rounded-md bg-cafe-surface-sunken px-2.5 py-1.5 text-xs">
                        <div className="flex justify-between text-cafe-secondary">
                          <span>{NOVEL_CRAFT_DIMENSION_LABELS[dim].zh.slice(0, 4)}</span>
                          <span>{pct}%</span>
                        </div>
                        <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-cafe-surface-canvas">
                          <div
                            className="h-full rounded-full bg-cafe-accent"
                            style={{ width: `${Math.min(100, Math.max(8, pct))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};
