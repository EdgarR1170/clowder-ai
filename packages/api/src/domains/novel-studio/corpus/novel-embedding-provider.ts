import type { IEmbeddingService } from '../../memory/interfaces.js';

export interface NovelEmbedderConfig {
  provider: 'auto' | 'clowder-local' | 'openai-compatible' | 'local-hash-vec' | 'fts-only';
  apiUrl?: string;
  apiKey?: string;
  model?: string;
  dim?: number;
}

export interface ResolvedNovelEmbedder {
  providerId: 'clowder-local' | 'openai-compatible' | 'local-hash-vec';
  modelId: string;
  dim: number;
  embedBatch(texts: string[], signal?: AbortSignal): Promise<Float32Array[]>;
}

const LOCAL_HASH_DIM = 384;

/**
 * Deterministic L2-normalized CJK character + bigram + craft-keyword feature hashing vector (384d).
 * Allows sqlite-vec vec0 KNN similarity search to work offline out-of-the-box even before
 * an external Ollama / OpenAI / Python sidecar embedding server is started!
 */
export function computeLocalCjkHashEmbedding(text: string, dim = LOCAL_HASH_DIM): Float32Array {
  const vec = new Float32Array(dim);
  const cleaned = text.replace(/\s+/g, '');
  if (!cleaned.length) return vec;

  const fnv1a = (str: string): number => {
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    return h >>> 0;
  };

  // Character bigrams + trigrams capture Chinese phrase semantics & stylistic rhythm cleanly
  const limit = Math.min(cleaned.length, 2400);
  for (let i = 0; i < limit - 1; i++) {
    const bg = cleaned.slice(i, i + 2);
    const h = fnv1a(bg);
    const slot = h % dim;
    const sign = (h & 0x10000) !== 0 ? 1 : -1;
    vec[slot] = (vec[slot] ?? 0) + sign * 1.0;

    if (i < limit - 2) {
      const tg = cleaned.slice(i, i + 3);
      const h3 = fnv1a(tg);
      const slot3 = h3 % dim;
      const sign3 = (h3 & 0x10000) !== 0 ? 1 : -1;
      vec[slot3] = (vec[slot3] ?? 0) + sign3 * 1.35;
    }
  }

  let normSq = 0;
  for (let i = 0; i < dim; i++) {
    normSq += (vec[i] ?? 0) * (vec[i] ?? 0);
  }
  const norm = Math.sqrt(normSq);
  if (norm > 1e-8) {
    for (let i = 0; i < dim; i++) {
      vec[i] = (vec[i] ?? 0) / norm;
    }
  }
  return vec;
}

export class NovelEmbeddingProviderRegistry {
  private config: NovelEmbedderConfig;

  constructor(
    private readonly getClowderEmbeddingService?: () => IEmbeddingService | undefined,
    initialConfig?: Partial<NovelEmbedderConfig>,
  ) {
    const envUrl = process.env.NOVEL_EMBED_API_URL?.trim();
    const envProvider = process.env.NOVEL_EMBED_PROVIDER?.trim() as NovelEmbedderConfig['provider'] | undefined;
    this.config = {
      provider: initialConfig?.provider ?? envProvider ?? (envUrl ? 'openai-compatible' : 'auto'),
      apiUrl: initialConfig?.apiUrl ?? envUrl,
      apiKey: initialConfig?.apiKey ?? process.env.NOVEL_EMBED_API_KEY?.trim(),
      model: initialConfig?.model ?? process.env.NOVEL_EMBED_MODEL?.trim() ?? 'BAAI/bge-m3',
      dim: initialConfig?.dim ?? (process.env.NOVEL_EMBED_DIM ? Number(process.env.NOVEL_EMBED_DIM) : undefined),
    };
  }

  getConfig(): NovelEmbedderConfig {
    return {
      ...this.config,
      apiKey: this.config.apiKey ? '***configured***' : undefined,
    };
  }

  updateConfig(patch: Partial<NovelEmbedderConfig>): void {
    this.config = {
      ...this.config,
      ...patch,
      apiKey: patch.apiKey === '***configured***' ? this.config.apiKey : (patch.apiKey ?? this.config.apiKey),
    };
  }

  resolveActiveEmbedder(): ResolvedNovelEmbedder | null {
    if (this.config.provider === 'fts-only') return null;

    if (
      (this.config.provider === 'openai-compatible' || this.config.provider === 'auto') &&
      this.config.apiUrl?.trim()
    ) {
      const endpoint = this.config.apiUrl.trim().replace(/\/+$/, '');
      const fullUrl = endpoint.endsWith('/embeddings') ? endpoint : `${endpoint}/embeddings`;
      const model = this.config.model || 'text-embedding-3-small';
      const configuredDim = this.config.dim ?? 1024;
      const apiKey = this.config.apiKey;

      return {
        providerId: 'openai-compatible',
        modelId: `api:${model}`,
        dim: configuredDim,
        embedBatch: async (texts: string[], signal?: AbortSignal) => {
          const headers: Record<string, string> = { 'Content-Type': 'application/json' };
          if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
          const res = await fetch(fullUrl, {
            method: 'POST',
            headers,
            body: JSON.stringify({ model, input: texts }),
            signal,
          });
          if (!res.ok) {
            const detail = await res.text().catch(() => '');
            throw new Error(`Embedding API HTTP ${res.status}: ${detail.slice(0, 240)}`);
          }
          const payload = (await res.json()) as { data?: Array<{ embedding: number[] }> };
          if (!Array.isArray(payload.data) || payload.data.length !== texts.length) {
            throw new Error('Embedding API returned unexpected vector count');
          }
          return payload.data.map((row) => Float32Array.from(row.embedding));
        },
      };
    }

    if (this.config.provider === 'clowder-local' || this.config.provider === 'auto') {
      const localSvc = this.getClowderEmbeddingService?.();
      if (localSvc?.isReady()) {
        const info = localSvc.getModelInfo();
        return {
          providerId: 'clowder-local',
          modelId: `clowder:${info.modelId}`,
          dim: info.dim,
          embedBatch: (texts: string[], signal?: AbortSignal) => localSvc.embed(texts, signal),
        };
      }
      if (this.config.provider === 'clowder-local') {
        throw new Error('Clowder local embedding sidecar is not running; switch to auto or configure OpenAI API');
      }
    }

    return {
      providerId: 'local-hash-vec',
      modelId: `local-cjk-hash-${LOCAL_HASH_DIM}d`,
      dim: LOCAL_HASH_DIM,
      embedBatch: async (texts: string[]) => texts.map((t) => computeLocalCjkHashEmbedding(t, LOCAL_HASH_DIM)),
    };
  }
}
