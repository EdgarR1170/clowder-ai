import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import type { NovelCraftDimension, ReferenceBookSummary } from '@cat-cafe/shared';
import * as cheerio from 'cheerio';
import { XMLParser } from 'fast-xml-parser';

export interface IngestedChapter {
  chapterIndex: number;
  title: string;
  charCount: number;
  summaryPreview: string;
  content: string;
}

export interface IngestedSceneChunk {
  chunkId: string;
  bookId: string;
  chapterIndex: number;
  chapterTitle: string;
  chunkIndexInChapter: number;
  content: string;
  charCount: number;
  dialogueRatio: number;
  dimensionScores: Record<NovelCraftDimension, number>;
}

export interface IngestedNovelResult {
  book: ReferenceBookSummary;
  chapters: IngestedChapter[];
  chunks: IngestedSceneChunk[];
}

const CHAPTER_HEADING_RE =
  /^\s*(?:正文\s*)?(?:第[零一二三四五六七八九十百千万两〇0-9]+[章节回卷集部篇](?:[\s：:·—_、，-].*)?|(?:序章|楔子|引子|序幕|尾声|终章|番外)(?:[\s：:·—_、，-].*)?|Chapter\s+\d+(?:[\s:.-].*)?|#{1,3}\s+.+)$/i;

const DIMENSION_LEXICONS: Readonly<Record<Exclude<NovelCraftDimension, 'prose_style'>, readonly RegExp[]>> = {
  plot_arc: [
    /真相|线索|反转|伏笔|阴谋|代价|抉择|转折|危机|期限|契约|秘密|赌注|破局|悬念|底牌/g,
    /忽然|骤然|竟是|没想到|原来如此|终于明白|倒计时|必须在/g,
  ],
  battle_action: [
    /斩|劈|刺|轰|砸|掠|闪避|格挡|反击|暴退|冲锋|破空|杀意|气浪|刀光|剑影|枪火|拳风|瞬移|压制|破绽/g,
    /后撤|侧身|腾空|重创|鲜血|骨骼|震碎|蓄力|绝杀|围攻|阵型|先手/g,
  ],
  character_persona: [
    /冷笑|沉默|自嘲|目光|瞳孔|指尖|喉结|叹息|倔强|执念|伪装|试探|真心|背叛|信任|愧疚|偏执/g,
    /语气|顿了顿|垂下眼|漫不经心|咬牙|低声道|反问道|似笑非笑/g,
  ],
  scene_atmosphere: [
    /暮色|残阳|月光|霓虹|雾气|风声|雨幕|腐朽|潮湿|寒意|阴影|苍穹|街巷|殿堂|废墟|星海|尘埃|钟声/g,
    /远处|空气中|弥漫|笼罩|斑驳|寂静|喧嚣|回荡|俯瞰|尽头/g,
  ],
  world_mechanics: [
    /【|】|\[|\]|等级|境界|面板|属性|技能|冷却|法则|序列|晋升|突破|灵力|魔力|算力|积分|权限|阵营|天赋|代价/g,
    /一阶|二阶|三阶|筑基|金丹|神格|污染度|同步率|经验值|词条/g,
  ],
};

/**
 * Decode UTF-8 / UTF-16LE / GB18030 Chinese novel text buffers without mojibake.
 */
export function decodeNovelTextBuffer(buf: Buffer): { text: string; encoding: string } {
  if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
    return { text: buf.subarray(3).toString('utf8'), encoding: 'utf-8-bom' };
  }
  if (buf.length >= 2 && buf[0] === 0xff && buf[1] === 0xfe) {
    return { text: new TextDecoder('utf-16le').decode(buf.subarray(2)), encoding: 'utf-16le' };
  }
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff) {
    return { text: new TextDecoder('utf-16be').decode(buf.subarray(2)), encoding: 'utf-16be' };
  }
  try {
    const utf8 = new TextDecoder('utf-8', { fatal: true }).decode(buf);
    return { text: utf8, encoding: 'utf-8' };
  } catch {
    const gb = new TextDecoder('gb18030', { fatal: false }).decode(buf);
    return { text: gb, encoding: 'gb18030' };
  }
}

/**
 * Minimal self-contained ZIP Central Directory reader for EPUB archives (method 0 store & 8 deflate).
 */
function readZipEntries(buf: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let eocdOffset = -1;
  const minOffset = Math.max(0, buf.length - 65_557);
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) throw new Error('Invalid EPUB archive: ZIP EOCD signature not found');

  const totalEntries = buf.readUInt16LE(eocdOffset + 10);
  let cdOffset = buf.readUInt32LE(eocdOffset + 16);

  for (let idx = 0; idx < totalEntries && cdOffset + 46 <= buf.length; idx++) {
    if (buf.readUInt32LE(cdOffset) !== 0x02014b50) break;
    const method = buf.readUInt16LE(cdOffset + 10);
    const compressedSize = buf.readUInt32LE(cdOffset + 20);
    const nameLen = buf.readUInt16LE(cdOffset + 28);
    const extraLen = buf.readUInt16LE(cdOffset + 30);
    const commentLen = buf.readUInt16LE(cdOffset + 32);
    const localHeaderOffset = buf.readUInt32LE(cdOffset + 42);
    const rawName = buf
      .subarray(cdOffset + 46, cdOffset + 46 + nameLen)
      .toString('utf8')
      .replace(/\\/g, '/');
    cdOffset += 46 + nameLen + extraLen + commentLen;

    if (rawName.endsWith('/') || localHeaderOffset + 30 > buf.length) continue;
    if (buf.readUInt32LE(localHeaderOffset) !== 0x04034b50) continue;
    const localNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const localExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + localNameLen + localExtraLen;
    const slice = buf.subarray(dataStart, dataStart + compressedSize);

    if (method === 0) {
      entries.set(rawName, slice);
    } else if (method === 8) {
      entries.set(rawName, inflateRawSync(slice));
    }
  }
  return entries;
}

function extractEpubChapters(buf: Buffer): Array<{ title: string; content: string }> {
  const zip = readZipEntries(buf);
  const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: '@_' });
  const containerBuf = zip.get('META-INF/container.xml');
  if (!containerBuf) throw new Error('Invalid EPUB: missing META-INF/container.xml');

  const containerXml = parser.parse(containerBuf.toString('utf8')) as {
    container?: { rootfiles?: { rootfile?: { '@_full-path'?: string } | Array<{ '@_full-path'?: string }> } };
  };
  const rootfileNode = containerXml.container?.rootfiles?.rootfile;
  const opfPath = Array.isArray(rootfileNode) ? rootfileNode[0]?.['@_full-path'] : rootfileNode?.['@_full-path'];
  if (!opfPath) throw new Error('Invalid EPUB: missing OPF rootfile path');

  const opfBuf = zip.get(opfPath);
  if (!opfBuf) throw new Error(`Invalid EPUB: OPF file not found at ${opfPath}`);
  const opfDir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';

  const opfXml = parser.parse(opfBuf.toString('utf8')) as {
    package?: {
      manifest?: { item?: Array<Record<string, string>> | Record<string, string> };
      spine?: { itemref?: Array<Record<string, string>> | Record<string, string> };
    };
  };
  const rawItems = opfXml.package?.manifest?.item;
  const manifestItems = Array.isArray(rawItems) ? rawItems : rawItems ? [rawItems] : [];
  const hrefById = new Map<string, string>();
  for (const item of manifestItems) {
    if (item['@_id'] && item['@_href']) {
      hrefById.set(item['@_id'], decodeURIComponent(item['@_href']));
    }
  }

  const rawSpine = opfXml.package?.spine?.itemref;
  const spineRefs = Array.isArray(rawSpine) ? rawSpine : rawSpine ? [rawSpine] : [];
  const chapters: Array<{ title: string; content: string }> = [];

  for (const ref of spineRefs) {
    const idref = ref['@_idref'];
    const relHref = idref ? hrefById.get(idref) : undefined;
    if (!relHref) continue;
    const fullPath = `${opfDir}${relHref}`.replace(/^\.\//, '');
    const htmlBuf = zip.get(fullPath) ?? zip.get(relHref);
    if (!htmlBuf) continue;

    const $ = cheerio.load(decodeNovelTextBuffer(htmlBuf).text);
    $('script, style, nav').remove();
    const heading = $('h1, h2, h3, title').first().text().trim();
    const paragraphs: string[] = [];
    $('p, div.paragraph, li').each((_, el) => {
      const line = $(el).text().replace(/\s+/g, ' ').trim();
      if (line) paragraphs.push(line);
    });
    const text = (paragraphs.length > 0 ? paragraphs.join('\n') : $('body').text()).trim();
    if (text.length >= 80) {
      chapters.push({
        title: heading || `第 ${chapters.length + 1} 节`,
        content: text,
      });
    }
  }
  return chapters;
}

function splitPlainTextIntoChapters(rawText: string): Array<{ title: string; content: string }> {
  const normalized = rawText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const chapters: Array<{ title: string; lines: string[] }> = [];
  let currentTitle = '序幕 / 开篇';
  let currentLines: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0 && trimmed.length <= 72 && CHAPTER_HEADING_RE.test(trimmed)) {
      const joined = currentLines.join('\n').trim();
      if (joined.length >= 60) {
        chapters.push({ title: currentTitle, lines: currentLines });
      }
      currentTitle = trimmed.replace(/^#+\s*/, '');
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }
  const tail = currentLines.join('\n').trim();
  if (tail.length > 0) {
    chapters.push({ title: currentTitle, lines: currentLines });
  }

  // Fallback for unchaptered texts: slice into ~3200-char virtual chapters on paragraph breaks
  if (chapters.length <= 1 && normalized.length > 5000) {
    const paras = normalized.split(/\n{2,}|\n/).filter((p) => p.trim().length > 0);
    const virtualChapters: Array<{ title: string; content: string }> = [];
    let bucket: string[] = [];
    let bucketLen = 0;
    for (const para of paras) {
      bucket.push(para.trim());
      bucketLen += para.length;
      if (bucketLen >= 3200) {
        virtualChapters.push({
          title: `分段 ${virtualChapters.length + 1}`,
          content: bucket.join('\n'),
        });
        bucket = [];
        bucketLen = 0;
      }
    }
    if (bucket.length > 0) {
      virtualChapters.push({
        title: `分段 ${virtualChapters.length + 1}`,
        content: bucket.join('\n'),
      });
    }
    return virtualChapters;
  }

  return chapters.map((ch) => ({ title: ch.title, content: ch.lines.join('\n').trim() }));
}

function computeDialogueRatio(text: string): number {
  if (!text.length) return 0;
  const matches = text.match(/“[^”]*”|"[^"]*"|「[^」]*」|『[^』]*』/g);
  if (!matches) return 0;
  const dialogueChars = matches.reduce((sum, item) => sum + item.length, 0);
  return Math.min(1, Number((dialogueChars / text.length).toFixed(3)));
}

function scoreChunkDimensions(text: string, isChapterEdge: boolean): Record<NovelCraftDimension, number> {
  const lenFactor = Math.max(200, text.length) / 500;
  const countHits = (patterns: readonly RegExp[]): number => {
    let total = 0;
    for (const re of patterns) {
      const m = text.match(re);
      if (m) total += m.length;
    }
    return total;
  };

  const dialogueRatio = computeDialogueRatio(text);
  const sentences = text.split(/[。！？!?；;\n]+/).filter((s) => s.trim().length > 0);
  const shortBurstRatio =
    sentences.length > 0 ? sentences.filter((s) => s.trim().length <= 14).length / sentences.length : 0;
  const lengths = sentences.map((s) => s.trim().length);
  const meanLen = lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 20;
  const variance = lengths.length > 1 ? lengths.reduce((acc, l) => acc + (l - meanLen) ** 2, 0) / lengths.length : 0;
  const stdDev = Math.sqrt(variance);

  const clamp01 = (v: number): number => Number(Math.max(0, Math.min(1, v)).toFixed(3));

  const plotRaw = countHits(DIMENSION_LEXICONS.plot_arc) / (lenFactor * 5) + (isChapterEdge ? 0.22 : 0);
  const battleRaw = countHits(DIMENSION_LEXICONS.battle_action) / (lenFactor * 7) + shortBurstRatio * 0.25;
  const personaRaw = countHits(DIMENSION_LEXICONS.character_persona) / (lenFactor * 5) + dialogueRatio * 0.55;
  const sceneRaw = countHits(DIMENSION_LEXICONS.scene_atmosphere) / (lenFactor * 5) + (1 - dialogueRatio) * 0.15;
  const mechRaw = countHits(DIMENSION_LEXICONS.world_mechanics) / (lenFactor * 5);
  const styleRaw = Math.min(1, stdDev / 22) * 0.6 + (sentences.length >= 4 ? 0.25 : 0.1);

  return {
    plot_arc: clamp01(plotRaw),
    battle_action: clamp01(battleRaw),
    character_persona: clamp01(personaRaw),
    scene_atmosphere: clamp01(sceneRaw),
    world_mechanics: clamp01(mechRaw),
    prose_style: clamp01(styleRaw),
  };
}

function chunkChapterIntoScenes(
  bookId: string,
  chapterIndex: number,
  chapterTitle: string,
  content: string,
  targetChars = 950,
  overlapChars = 140,
): IngestedSceneChunk[] {
  const paragraphs = content
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (paragraphs.length === 0) return [];

  const rawSlices: string[] = [];
  let bucket: string[] = [];
  let bucketChars = 0;

  for (const para of paragraphs) {
    if (bucketChars + para.length > targetChars && bucket.length > 0) {
      rawSlices.push(bucket.join('\n'));
      // Carry trailing paragraphs up to overlapChars
      const overlapBucket: string[] = [];
      let carried = 0;
      for (let i = bucket.length - 1; i >= 0; i--) {
        const candidate = bucket[i]!;
        if (carried + candidate.length > overlapChars && overlapBucket.length > 0) break;
        overlapBucket.unshift(candidate);
        carried += candidate.length;
      }
      bucket = overlapBucket;
      bucketChars = carried;
    }
    bucket.push(para);
    bucketChars += para.length;
  }
  if (bucket.length > 0) {
    const tailText = bucket.join('\n');
    if (rawSlices.length === 0 || tailText !== rawSlices[rawSlices.length - 1]) {
      rawSlices.push(tailText);
    }
  }

  return rawSlices.map((sliceText, idx) => {
    const isEdge = idx === 0 || idx === rawSlices.length - 1;
    const digest = createHash('sha1')
      .update(`${bookId}:${chapterIndex}:${idx}:${sliceText.slice(0, 64)}`)
      .digest('hex')
      .slice(0, 12);
    return {
      chunkId: `${bookId}-c${String(chapterIndex).padStart(4, '0')}-s${String(idx).padStart(2, '0')}-${digest}`,
      bookId,
      chapterIndex,
      chapterTitle,
      chunkIndexInChapter: idx,
      content: sliceText,
      charCount: sliceText.length,
      dialogueRatio: computeDialogueRatio(sliceText),
      dimensionScores: scoreChunkDimensions(sliceText, isEdge),
    };
  });
}

function analyzeWholeBookStyle(text: string): NonNullable<ReferenceBookSummary['rawStyleStats']> {
  const sample = text.length > 160_000 ? text.slice(0, 160_000) : text;
  const paragraphs = sample
    .split(/\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  const sentences = sample
    .split(/[。！？!?]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);
  const lengths = sentences.map((s) => s.length);
  const avgSentence = lengths.length > 0 ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 24;
  const variance =
    lengths.length > 1 ? lengths.reduce((acc, len) => acc + (len - avgSentence) ** 2, 0) / lengths.length : 0;
  const avgPara = paragraphs.length > 0 ? paragraphs.reduce((a, p) => a + p.length, 0) / paragraphs.length : 90;

  // Detect dominant POV outside quoted dialogue
  const strippedDialogue = sample.replace(/“[^”]*”|"[^"]*"|「[^」]*」/g, '');
  const firstPersonHits = (strippedDialogue.match(/我/g) ?? []).length;
  const thirdPersonHits = (strippedDialogue.match(/他|她/g) ?? []).length;
  const dominantPov = firstPersonHits > thirdPersonHits * 0.75 ? 'first_person' : 'third_limited';

  return {
    avgSentenceLengthChars: Number(avgSentence.toFixed(1)),
    sentenceLengthStdDev: Number(Math.sqrt(variance).toFixed(1)),
    dialogueRatio: computeDialogueRatio(sample),
    avgParagraphChars: Number(avgPara.toFixed(1)),
    dominantPov,
  };
}

export function ingestNovelBuffer(input: {
  bookId?: string;
  title: string;
  author?: string;
  fileName: string;
  buffer: Buffer;
}): IngestedNovelResult {
  const ext = input.fileName.toLowerCase().endsWith('.epub')
    ? 'epub'
    : input.fileName.toLowerCase().endsWith('.md')
      ? 'md'
      : 'txt';
  const bookId =
    input.bookId ??
    `book-${createHash('sha256').update(input.title).update(input.buffer.subarray(0, 4096)).digest('hex').slice(0, 10)}`;

  let rawChapters: Array<{ title: string; content: string }>;
  let encoding = 'utf-8';
  if (ext === 'epub') {
    rawChapters = extractEpubChapters(input.buffer);
  } else {
    const decoded = decodeNovelTextBuffer(input.buffer);
    encoding = decoded.encoding;
    rawChapters = splitPlainTextIntoChapters(decoded.text);
  }

  if (rawChapters.length === 0) {
    throw new Error(`No readable novel text found in "${input.fileName}"`);
  }

  const chapters: IngestedChapter[] = rawChapters.map((ch, idx) => ({
    chapterIndex: idx + 1,
    title: ch.title,
    charCount: ch.content.length,
    summaryPreview: ch.content.replace(/\s+/g, ' ').slice(0, 160),
    content: ch.content,
  }));

  const chunks: IngestedSceneChunk[] = [];
  for (const ch of chapters) {
    chunks.push(...chunkChapterIntoScenes(bookId, ch.chapterIndex, ch.title, ch.content));
  }

  const dimSums: Record<NovelCraftDimension, number> = {
    plot_arc: 0,
    battle_action: 0,
    character_persona: 0,
    scene_atmosphere: 0,
    world_mechanics: 0,
    prose_style: 0,
  };
  for (const chunk of chunks) {
    for (const key of Object.keys(dimSums) as NovelCraftDimension[]) {
      dimSums[key] += chunk.dimensionScores[key];
    }
  }
  const denom = Math.max(1, chunks.length);
  const dimensionAverages = Object.fromEntries(
    (Object.keys(dimSums) as NovelCraftDimension[]).map((k) => [k, Number((dimSums[k] / denom).toFixed(3))]),
  ) as Record<NovelCraftDimension, number>;

  const joinedText = chapters.map((c) => c.content).join('\n');
  const totalChars = chapters.reduce((acc, c) => acc + c.charCount, 0);

  return {
    book: {
      id: bookId,
      title: input.title,
      author: input.author ?? '',
      fileFormat: ext,
      encoding,
      totalChars,
      chapterCount: chapters.length,
      chunkCount: chunks.length,
      embeddedChunkCount: 0,
      embedStatus: 'fts_ready',
      embedModelId: '',
      dimensionAverages,
      rawStyleStats: analyzeWholeBookStyle(joinedText),
      createdAt: new Date().toISOString(),
    },
    chapters,
    chunks,
  };
}
