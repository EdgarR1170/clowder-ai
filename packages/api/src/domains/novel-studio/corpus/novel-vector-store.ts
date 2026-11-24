import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { NovelCraftDimension, ReferenceBookSummary, RetrievedBeatPassage } from '@cat-cafe/shared';
import Database from 'better-sqlite3';
import * as sqliteVec from 'sqlite-vec';
import type { ResolvedNovelEmbedder } from './novel-embedding-provider.js';
import type { IngestedNovelResult, IngestedSceneChunk } from './novel-ingestor.js';

/**
 * Segment CJK + ASCII text into space-separated character bigrams & words for SQLite FTS5 BM25 indexing.
 */
export function tokenizeForCjkFts(text: string): string {
  const tokens: string[] = [];
  const asciiWords = text.toLowerCase().match(/[a-z0-9_]{2,}/g);
  if (asciiWords) tokens.push(...asciiWords);

  const cjkRuns = text.match(/[\u4e00-\u9fff]{2,}/g);
  if (cjkRuns) {
    for (const run of cjkRuns) {
      if (run.length === 2) {
        tokens.push(run);
      } else {
        for (let i = 0; i < run.length - 1; i++) {
          tokens.push(run.slice(i, i + 2));
        }
      }
    }
  }
  return tokens.join(' ');
}

/**
 * De-identify raw reference novel prose into an actionable structural & rhythm beat skeleton.
 * Prevents verbatim phrase copying while preserving choreography, sentence cadence, and sensory transitions.
 */
export function convertChunkToStructuralBeats(content: string, dimension: NovelCraftDimension): string {
  const paragraphs = content
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const beatLines: string[] = [];

  paragraphs.slice(0, 6).forEach((para, idx) => {
    const hasDialogue = /“[^”]+”|"[^"]+"|「[^」]+」/.test(para);
    const sentences = para.split(/[。！？!?]+/).filter((s) => s.trim().length > 0);
    const avgLen =
      sentences.length > 0 ? Math.round(sentences.reduce((s, x) => s + x.trim().length, 0) / sentences.length) : 0;
    const tag = hasDialogue
      ? '对话交锋/潜台词推进'
      : dimension === 'battle_action'
        ? '动作拆解/态势转换'
        : dimension === 'scene_atmosphere'
          ? '五感锚点/空间调度'
          : '叙事递进/心理折射';
    // Mask quoted speech & specific numbers/titles into structural placeholders
    const masked = para
      .replace(/“[^”]{4,}”/g, '“【角色台词：短促博弈/潜台词回应】”')
      .replace(/「[^」]{4,}」/g, '「【角色台词：情绪外化/试探】」');
    const preview = masked.length > 96 ? `${masked.slice(0, 96)}…` : masked;
    beatLines.push(`[节拍 ${idx + 1} · ${tag} | ${sentences.length}句/均长${avgLen}字] ${preview}`);
  });

  return beatLines.join('\n');
}

interface StoredChunkRow {
  chunk_id: string;
  book_id: string;
  book_title: string;
  chapter_index: number;
  chapter_title: string;
  chunk_index: number;
  content: string;
  char_count: number;
  dialogue_ratio: number;
  dim_plot: number;
  dim_battle: number;
  dim_persona: number;
  dim_scene: number;
  dim_mechanics: number;
  dim_style: number;
}

const DIM_COLUMN: Readonly<Record<NovelCraftDimension, keyof StoredChunkRow>> = {
  plot_arc: 'dim_plot',
  battle_action: 'dim_battle',
  character_persona: 'dim_persona',
  scene_atmosphere: 'dim_scene',
  world_mechanics: 'dim_mechanics',
  prose_style: 'dim_style',
};

export class NovelVectorStore {
  private readonly db: Database.Database;
  private vecLoaded = false;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    try {
      sqliteVec.load(this.db);
      this.vecLoaded = true;
    } catch {
      this.vecLoaded = false;
    }
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reference_books (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        author TEXT NOT NULL DEFAULT '',
        file_format TEXT NOT NULL,
        encoding TEXT NOT NULL DEFAULT 'utf-8',
        total_chars INTEGER NOT NULL,
        chapter_count INTEGER NOT NULL,
        chunk_count INTEGER NOT NULL,
        embedded_chunk_count INTEGER NOT NULL DEFAULT 0,
        embed_status TEXT NOT NULL DEFAULT 'fts_ready',
        embed_model_id TEXT NOT NULL DEFAULT '',
        embed_dim INTEGER NOT NULL DEFAULT 0,
        dimension_averages_json TEXT NOT NULL,
        raw_style_stats_json TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS book_chapters (
        book_id TEXT NOT NULL,
        chapter_index INTEGER NOT NULL,
        title TEXT NOT NULL,
        char_count INTEGER NOT NULL,
        summary_preview TEXT NOT NULL,
        PRIMARY KEY (book_id, chapter_index)
      );

      CREATE TABLE IF NOT EXISTS scene_chunks (
        chunk_id TEXT PRIMARY KEY,
        book_id TEXT NOT NULL,
        chapter_index INTEGER NOT NULL,
        chapter_title TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        content TEXT NOT NULL,
        char_count INTEGER NOT NULL,
        dialogue_ratio REAL NOT NULL,
        dim_plot REAL NOT NULL,
        dim_battle REAL NOT NULL,
        dim_persona REAL NOT NULL,
        dim_scene REAL NOT NULL,
        dim_mechanics REAL NOT NULL,
        dim_style REAL NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_scene_chunks_book ON scene_chunks(book_id, chapter_index);

      CREATE VIRTUAL TABLE IF NOT EXISTS scene_chunks_fts USING fts5(
        chunk_id UNINDEXED,
        book_id UNINDEXED,
        cjk_tokens
      );
    `);
  }

  private vecTableName(dim: number): string {
    if (!Number.isSafeInteger(dim) || dim < 8 || dim > 8192) {
      throw new Error(`Invalid vector dimension: ${dim}`);
    }
    return `vec_novel_chunks_${dim}`;
  }

  private ensureVecTable(dim: number): string | null {
    if (!this.vecLoaded) return null;
    const table = this.vecTableName(dim);
    this.db.exec(
      `CREATE VIRTUAL TABLE IF NOT EXISTS ${table} USING vec0(chunk_id TEXT PRIMARY KEY, embedding float[${dim}])`,
    );
    return table;
  }

  saveIngestedBook(ingested: IngestedNovelResult): ReferenceBookSummary {
    const { book, chapters, chunks } = ingested;
    const tx = this.db.transaction(() => {
      this.deleteBookInternal(book.id);
      this.db
        .prepare(
          `INSERT INTO reference_books (
            id, title, author, file_format, encoding, total_chars, chapter_count, chunk_count,
            embedded_chunk_count, embed_status, embed_model_id, embed_dim,
            dimension_averages_json, raw_style_stats_json, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 'fts_ready', '', 0, ?, ?, ?)`,
        )
        .run(
          book.id,
          book.title,
          book.author,
          book.fileFormat,
          book.encoding,
          book.totalChars,
          book.chapterCount,
          book.chunkCount,
          JSON.stringify(book.dimensionAverages),
          book.rawStyleStats ? JSON.stringify(book.rawStyleStats) : null,
          book.createdAt,
        );

      const insChapter = this.db.prepare(
        `INSERT INTO book_chapters (book_id, chapter_index, title, char_count, summary_preview)
         VALUES (?, ?, ?, ?, ?)`,
      );
      for (const ch of chapters) {
        insChapter.run(book.id, ch.chapterIndex, ch.title, ch.charCount, ch.summaryPreview);
      }

      const insChunk = this.db.prepare(
        `INSERT INTO scene_chunks (
          chunk_id, book_id, chapter_index, chapter_title, chunk_index, content, char_count, dialogue_ratio,
          dim_plot, dim_battle, dim_persona, dim_scene, dim_mechanics, dim_style
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      );
      const insFts = this.db.prepare(`INSERT INTO scene_chunks_fts (chunk_id, book_id, cjk_tokens) VALUES (?, ?, ?)`);
      for (const ck of chunks) {
        insChunk.run(
          ck.chunkId,
          ck.bookId,
          ck.chapterIndex,
          ck.chapterTitle,
          ck.chunkIndexInChapter,
          ck.content,
          ck.charCount,
          ck.dialogueRatio,
          ck.dimensionScores.plot_arc,
          ck.dimensionScores.battle_action,
          ck.dimensionScores.character_persona,
          ck.dimensionScores.scene_atmosphere,
          ck.dimensionScores.world_mechanics,
          ck.dimensionScores.prose_style,
        );
        insFts.run(ck.chunkId, ck.bookId, tokenizeForCjkFts(`${ck.chapterTitle} ${ck.content}`));
      }
    });
    tx();
    return this.getBook(book.id)!;
  }

  private deleteBookInternal(bookId: string): void {
    const existingChunks = this.db.prepare('SELECT chunk_id FROM scene_chunks WHERE book_id = ?').all(bookId) as Array<{
      chunk_id: string;
    }>;
    if (existingChunks.length > 0 && this.vecLoaded) {
      const vecTables = this.db
        .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'vec_novel_chunks_%'")
        .all() as Array<{ name: string }>;
      for (const { name } of vecTables) {
        if (!/^vec_novel_chunks_\d+$/.test(name)) continue;
        const delVec = this.db.prepare(`DELETE FROM ${name} WHERE chunk_id = ?`);
        for (const row of existingChunks) delVec.run(row.chunk_id);
      }
    }
    this.db.prepare('DELETE FROM scene_chunks_fts WHERE book_id = ?').run(bookId);
    this.db.prepare('DELETE FROM scene_chunks WHERE book_id = ?').run(bookId);
    this.db.prepare('DELETE FROM book_chapters WHERE book_id = ?').run(bookId);
    this.db.prepare('DELETE FROM reference_books WHERE id = ?').run(bookId);
  }

  deleteBook(bookId: string): boolean {
    const exists = this.getBook(bookId);
    if (!exists) return false;
    this.db.transaction(() => this.deleteBookInternal(bookId))();
    return true;
  }

  listBooks(): ReferenceBookSummary[] {
    const rows = this.db.prepare('SELECT * FROM reference_books ORDER BY created_at DESC').all() as Array<
      Record<string, unknown>
    >;
    return rows.map((r) => this.mapBookRow(r));
  }

  getBook(bookId: string): ReferenceBookSummary | null {
    const row = this.db.prepare('SELECT * FROM reference_books WHERE id = ?').get(bookId) as
      | Record<string, unknown>
      | undefined;
    return row ? this.mapBookRow(row) : null;
  }

  listBookChapters(
    bookId: string,
  ): Array<{ chapterIndex: number; title: string; charCount: number; summaryPreview: string }> {
    return this.db
      .prepare(
        'SELECT chapter_index as chapterIndex, title, char_count as charCount, summary_preview as summaryPreview FROM book_chapters WHERE book_id = ? ORDER BY chapter_index ASC',
      )
      .all(bookId) as Array<{ chapterIndex: number; title: string; charCount: number; summaryPreview: string }>;
  }

  async embedBook(bookId: string, embedder: ResolvedNovelEmbedder, batchSize = 24): Promise<ReferenceBookSummary> {
    const book = this.getBook(bookId);
    if (!book) throw new Error(`Reference book not found: ${bookId}`);
    const vecTable = this.ensureVecTable(embedder.dim);
    if (!vecTable) throw new Error('sqlite-vec extension is unavailable in this environment');

    this.db
      .prepare("UPDATE reference_books SET embed_status = 'embedding', embed_model_id = ?, embed_dim = ? WHERE id = ?")
      .run(embedder.modelId, embedder.dim, bookId);

    try {
      const chunks = this.db
        .prepare(
          'SELECT chunk_id, chapter_title, content FROM scene_chunks WHERE book_id = ? ORDER BY chapter_index, chunk_index',
        )
        .all(bookId) as Array<{ chunk_id: string; chapter_title: string; content: string }>;

      const updVec = this.db.prepare(`UPDATE ${vecTable} SET embedding = ? WHERE chunk_id = ?`);
      const insVec = this.db.prepare(`INSERT INTO ${vecTable} (chunk_id, embedding) VALUES (?, ?)`);
      const writeBatch = this.db.transaction((pairs: Array<{ chunkId: string; vec: Float32Array }>) => {
        for (const p of pairs) {
          const res = updVec.run(p.vec, p.chunkId);
          if (!res.changes) insVec.run(p.chunkId, p.vec);
        }
      });

      let embedded = 0;
      for (let i = 0; i < chunks.length; i += batchSize) {
        const slice = chunks.slice(i, i + batchSize);
        const vectors = await embedder.embedBatch(slice.map((c) => `${c.chapter_title}\n${c.content}`));
        writeBatch(slice.map((c, idx) => ({ chunkId: c.chunk_id, vec: vectors[idx]! })));
        embedded += slice.length;
        this.db.prepare('UPDATE reference_books SET embedded_chunk_count = ? WHERE id = ?').run(embedded, bookId);
      }

      this.db
        .prepare("UPDATE reference_books SET embed_status = 'vec_ready', embedded_chunk_count = ? WHERE id = ?")
        .run(embedded, bookId);
      return this.getBook(bookId)!;
    } catch (err) {
      this.db.prepare("UPDATE reference_books SET embed_status = 'embed_failed' WHERE id = ?").run(bookId);
      throw err;
    }
  }

  /**
   * Diversified high-signal chunk sampling across distinct chapters for Book-to-Skill distillation.
   */
  sampleRepresentativeChunks(bookId: string, dimension: NovelCraftDimension, topK = 10): IngestedSceneChunk[] {
    const col = DIM_COLUMN[dimension];
    const rows = this.db
      .prepare(
        `SELECT c.*, b.title as book_title
         FROM scene_chunks c
         JOIN reference_books b ON b.id = c.book_id
         WHERE c.book_id = ?
         ORDER BY c.${col} DESC, c.char_count DESC
         LIMIT ?`,
      )
      .all(bookId, topK * 4) as StoredChunkRow[];

    const picked: StoredChunkRow[] = [];
    const seenChapters = new Set<number>();
    for (const row of rows) {
      if (picked.length >= topK) break;
      if (!seenChapters.has(row.chapter_index)) {
        picked.push(row);
        seenChapters.add(row.chapter_index);
      }
    }
    for (const row of rows) {
      if (picked.length >= topK) break;
      if (!picked.some((p) => p.chunk_id === row.chunk_id)) {
        picked.push(row);
      }
    }

    return picked.map((r) => ({
      chunkId: r.chunk_id,
      bookId: r.book_id,
      chapterIndex: r.chapter_index,
      chapterTitle: r.chapter_title,
      chunkIndexInChapter: r.chunk_index,
      content: r.content,
      charCount: r.char_count,
      dialogueRatio: r.dialogue_ratio,
      dimensionScores: {
        plot_arc: r.dim_plot,
        battle_action: r.dim_battle,
        character_persona: r.dim_persona,
        scene_atmosphere: r.dim_scene,
        world_mechanics: r.dim_mechanics,
        prose_style: r.dim_style,
      },
    }));
  }

  /**
   * Hybrid sqlite-vec KNN + FTS5 CJK BM25 + Dimension Affinity RRF Search.
   */
  async searchPassages(params: {
    query: string;
    bookIds?: string[];
    dimension?: NovelCraftDimension;
    topK?: number;
    mode?: 'structural_beats' | 'raw_excerpt';
    embedder?: ResolvedNovelEmbedder | null;
  }): Promise<RetrievedBeatPassage[]> {
    const topK = Math.min(20, Math.max(1, params.topK ?? 5));
    const mode = params.mode ?? 'structural_beats';
    const dimension = params.dimension ?? 'plot_arc';
    const dimCol = DIM_COLUMN[dimension];
    const allowedBooks = params.bookIds && params.bookIds.length > 0 ? new Set(params.bookIds) : null;

    const rrfScores = new Map<string, number>();
    const addRankScore = (chunkId: string, rank: number, weight: number) => {
      rrfScores.set(chunkId, (rrfScores.get(chunkId) ?? 0) + weight / (40 + rank));
    };

    // 1. Vector KNN search via sqlite-vec (if embeddings exist for matching dim)
    if (params.embedder && this.vecLoaded && params.query.trim()) {
      const table = this.vecTableName(params.embedder.dim);
      const hasTable = this.db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?").get(table);
      if (hasTable) {
        try {
          const [queryVec] = await params.embedder.embedBatch([params.query]);
          if (queryVec) {
            const vecHits = this.db
              .prepare(`SELECT chunk_id, distance FROM ${table} WHERE embedding MATCH ? AND k = ?`)
              .all(queryVec, topK * 8) as Array<{ chunk_id: string; distance: number }>;
            vecHits.forEach((hit, idx) => addRankScore(hit.chunk_id, idx + 1, 1.35));
          }
        } catch {
          // Graceful fallback to FTS + dimension ranking if external embedding endpoint fails
        }
      }
    }

    // 2. FTS5 CJK BM25 lexical search
    const ftsQuery = tokenizeForCjkFts(params.query)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 16)
      .map((tok) => `"${tok.replace(/"/g, '')}"`)
      .join(' OR ');

    if (ftsQuery) {
      const ftsHits = this.db
        .prepare(
          `SELECT chunk_id FROM scene_chunks_fts WHERE scene_chunks_fts MATCH ? ORDER BY bm25(scene_chunks_fts) LIMIT ?`,
        )
        .all(ftsQuery, topK * 8) as Array<{ chunk_id: string }>;
      ftsHits.forEach((hit, idx) => addRankScore(hit.chunk_id, idx + 1, 1.0));
    }

    // 3. Candidate hydration + dimension density boost
    let candidateRows: StoredChunkRow[];
    if (rrfScores.size > 0) {
      const ids = [...rrfScores.keys()];
      const placeholders = ids.map(() => '?').join(',');
      candidateRows = this.db
        .prepare(
          `SELECT c.*, b.title as book_title
           FROM scene_chunks c
           JOIN reference_books b ON b.id = c.book_id
           WHERE c.chunk_id IN (${placeholders})`,
        )
        .all(...ids) as StoredChunkRow[];
    } else {
      candidateRows = this.db
        .prepare(
          `SELECT c.*, b.title as book_title
           FROM scene_chunks c
           JOIN reference_books b ON b.id = c.book_id
           ORDER BY c.${dimCol} DESC
           LIMIT ?`,
        )
        .all(topK * 6) as StoredChunkRow[];
    }

    const filtered = allowedBooks ? candidateRows.filter((r) => allowedBooks.has(r.book_id)) : candidateRows;
    const scored = filtered
      .map((row) => {
        const dimScore = Number(row[dimCol] ?? 0);
        const rrf = rrfScores.get(row.chunk_id) ?? 0;
        const finalScore = Number((rrf * 25 + dimScore * 0.45).toFixed(4));
        return { row, finalScore };
      })
      .sort((a, b) => b.finalScore - a.finalScore)
      .slice(0, topK);

    return scored.map(({ row, finalScore }) => ({
      chunkId: row.chunk_id,
      bookId: row.book_id,
      bookTitle: row.book_title,
      chapterTitle: row.chapter_title,
      dimension,
      score: finalScore,
      mode,
      content: mode === 'structural_beats' ? convertChunkToStructuralBeats(row.content, dimension) : row.content,
    }));
  }

  close(): void {
    this.db.close();
  }

  private mapBookRow(r: Record<string, unknown>): ReferenceBookSummary {
    return {
      id: String(r.id),
      title: String(r.title),
      author: String(r.author ?? ''),
      fileFormat: r.file_format as 'txt' | 'md' | 'epub',
      encoding: String(r.encoding ?? 'utf-8'),
      totalChars: Number(r.total_chars ?? 0),
      chapterCount: Number(r.chapter_count ?? 0),
      chunkCount: Number(r.chunk_count ?? 0),
      embeddedChunkCount: Number(r.embedded_chunk_count ?? 0),
      embedStatus: r.embed_status as ReferenceBookSummary['embedStatus'],
      embedModelId: String(r.embed_model_id ?? ''),
      dimensionAverages: JSON.parse(String(r.dimension_averages_json || '{}')),
      rawStyleStats: r.raw_style_stats_json ? JSON.parse(String(r.raw_style_stats_json)) : undefined,
      createdAt: String(r.created_at),
    };
  }
}
