'use client';

import { type FC, type ReactNode, useEffect, useState } from 'react';
import { BookIcon, ChatBubbleIcon, SplitViewIcon } from '@/components/novel-studio/NovelIcons';
import { NovelStudioWorkbench } from '@/components/novel-studio/NovelStudioWorkbench';
import { PdlAppHost } from '@/pdl/PdlAppHost';

type WorkspaceLayoutMode = 'split' | 'studio' | 'chat';

const STORAGE_KEY = 'clowder-novel:layout-mode';

export const AppShell: FC<{ children: ReactNode }> = () => {
  const [mode, setMode] = useState<WorkspaceLayoutMode>('split');

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY) as WorkspaceLayoutMode | null;
      if (saved === 'split' || saved === 'studio' || saved === 'chat') {
        setMode(saved);
      }
    } catch {
      // Ignore storage failures
    }
  }, []);

  const changeMode = (next: WorkspaceLayoutMode) => {
    setMode(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Ignore storage failures
    }
  };

  return (
    <div className="novel-app-shell flex flex-col overflow-hidden bg-cafe-surface-canvas">
      {/* Slim Top Mode Switcher Bar */}
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-cafe bg-cafe-surface px-3">
        <div className="flex items-center gap-2 text-xs">
          <span className="font-serif font-semibold text-cafe">Clowder-Novel</span>
          <span className="hidden text-cafe-muted sm:inline">
            多书分维拆解 (Book-to-Skill + RAG) · 多猫逐章统筹创作平台
          </span>
        </div>

        <div className="inline-flex items-center gap-1 rounded-md bg-cafe-surface-sunken p-0.5">
          <button
            type="button"
            onClick={() => changeMode('studio')}
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
              mode === 'studio' ? 'bg-cafe-surface text-cafe shadow-sm' : 'text-cafe-muted hover:text-cafe'
            }`}
          >
            <BookIcon className="h-3 w-3" />
            小说工坊
          </button>
          <button
            type="button"
            onClick={() => changeMode('split')}
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
              mode === 'split' ? 'bg-cafe-surface text-cafe shadow-sm' : 'text-cafe-muted hover:text-cafe'
            }`}
          >
            <SplitViewIcon className="h-3 w-3" />
            同屏共创 (工坊 + 多猫编辑部)
          </button>
          <button
            type="button"
            onClick={() => changeMode('chat')}
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${
              mode === 'chat' ? 'bg-cafe-surface text-cafe shadow-sm' : 'text-cafe-muted hover:text-cafe'
            }`}
          >
            <ChatBubbleIcon className="h-3 w-3" />
            猫咖群聊
          </button>
        </div>
      </div>

      {/* Dual-Surface Container (keeps PdlAppHost mounted so WebSocket & cat streaming never drop) */}
      <div className="novel-split-body">
        {mode !== 'chat' && (
          <div className={mode === 'split' ? 'novel-split-studio' : 'novel-pane-full'}>
            <NovelStudioWorkbench onRequestSplitChat={() => changeMode('split')} />
          </div>
        )}
        <div
          className={
            mode === 'studio' ? 'novel-pane-hidden' : mode === 'split' ? 'novel-split-chat' : 'novel-pane-full'
          }
        >
          <PdlAppHost />
        </div>
      </div>
    </div>
  );
};
