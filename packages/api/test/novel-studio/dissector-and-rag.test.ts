import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { createNovelStudioRuntime, decodeNovelTextBuffer } from '../../src/domains/novel-studio/index.js';

describe('Clowder-Novel: Multi-Book Dissector, sqlite-vec RAG & Book-to-Skill Compiler', () => {
  const tempRoot = mkdtempSync(join(tmpdir(), 'clowder-novel-dissector-'));
  const runtime = createNovelStudioRuntime({
    workspaceRoot: tempRoot,
    dataDir: join(tempRoot, 'data', 'novel-studio'),
  });

  after(() => {
    runtime.close();
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it('decodes UTF-8 BOM and GB18030 buffers cleanly without mojibake', () => {
    const utf8Bom = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from('第一章 苍穹之巅', 'utf8')]);
    const res = decodeNovelTextBuffer(utf8Bom);
    assert.equal(res.encoding, 'utf-8-bom');
    assert.equal(res.text, '第一章 苍穹之巅');
  });

  it('ingests Books A/B/C/D, indexes vectors into sqlite-vec, distills dimension-specific Skills, and runs hybrid RAG', async () => {
    const bookAText = `
第一章 命运契约与三日倒计时
真相往往藏在最不起眼的灰烬之下。苏牧盯着桌上那纸染血的契约，忽然意识到一个可怕的反转：三天后的宗门大比并非选拔，而是献祭全城修士的破局赌注！他必须在子时之前找到失踪的守夜人线索，否则底牌尽毁。

第二章 盟友背后的暗棋
秘密一旦揭开半角，更大的阴谋便接踵而至。原本承诺相助的长老竟是幕后黑手的暗桩，每一次抉择都伴随着沉重代价。就在众人以为胜券在握的刹那，钟楼骤然敲响九声丧钟！
`.trim();

    const bookBText = `
第一章 窄巷断刃死斗
刀光骤然破空！陆沉侧身暴退半步，左手铁鞘横架格挡，火星四溅间虎口震裂渗出鲜血。黑衣刺客借势腾空下劈，气浪将青石地面犁出三尺深沟！陆沉不退反进，抓住对方旧力刚尽的瞬息破绽，短刃贴着肋骨反刺而入，一击绝杀！

第二章 越阶围攻与地形破局
三名二阶重甲武士结成合围阵型，拳风封死了所有退路。正面硬撼必死无疑，陆沉借着残垣断壁连续两次变向闪避，蓄力一脚踹塌腐朽横梁，漫天烟尘遮蔽视线的刹那掠至敌方侧后，重创主将咽喉！
`.trim();

    const bookCText = `
第一章 茶馆里的试探与潜台词
“你以为我今天来，是为了替他求情？”沈知意垂下眼帘，指尖漫不经心地摩挲着冰凉的青瓷杯沿，语气平静得听不出一丝波澜。
裴寂沉默片刻，似笑非笑地反问道：“难道不是？当年背叛盟约的人，如今倒学会讲愧疚了。”
她顿了顿，没有接话，只是将一枚裂开半边的旧玉佩推过桌面。执念与伪装在这一刻无声碰撞。
`.trim();

    const bookDText = `
第一章 雾港残阳与铁锈钟声
暮色像湿透的铅灰色棉絮笼罩着废弃港区。空气中弥漫着咸腥海风与腐朽木桩混杂的寒意，斑驳的铁索在潮水中反复撞击栈桥，发出空洞而迟缓的回响。远处灯塔的光柱刺破浓雾，将断壁残垣拉出细长扭曲的阴影。
`.trim();

    const bookA = await runtime.ingestAndIndexBook({
      title: '天机诡局',
      fileName: 'book-a.txt',
      buffer: Buffer.from(bookAText, 'utf8'),
    });
    const bookB = await runtime.ingestAndIndexBook({
      title: '烬刃狂澜',
      fileName: 'book-b.txt',
      buffer: Buffer.from(bookBText, 'utf8'),
    });
    const bookC = await runtime.ingestAndIndexBook({
      title: '孤城群像',
      fileName: 'book-c.txt',
      buffer: Buffer.from(bookCText, 'utf8'),
    });
    const bookD = await runtime.ingestAndIndexBook({
      title: '迷雾海湾',
      fileName: 'book-d.txt',
      buffer: Buffer.from(bookDText, 'utf8'),
    });

    assert.ok(bookA && bookB && bookC && bookD);
    assert.equal(bookA.chapterCount, 2);
    assert.equal(bookB.embedStatus, 'vec_ready');
    assert.ok((bookB.dimensionAverages.battle_action ?? 0) > (bookD.dimensionAverages.battle_action ?? 0));
    assert.ok((bookC.dimensionAverages.character_persona ?? 0) > (bookB.dimensionAverages.character_persona ?? 0));

    // Distill 4 distinct Book-to-Skill craft packages from Books A, B, C, D
    const skillA = runtime.skillCompiler.compileFromBookSamples({
      book: bookA,
      dimension: 'plot_arc',
      sampledChunks: runtime.corpusStore.sampleRepresentativeChunks(bookA.id, 'plot_arc', 4),
      slug: 'craft-a-outline',
    });
    const skillB = runtime.skillCompiler.compileFromBookSamples({
      book: bookB,
      dimension: 'battle_action',
      sampledChunks: runtime.corpusStore.sampleRepresentativeChunks(bookB.id, 'battle_action', 4),
      slug: 'craft-b-battle',
    });
    const skillC = runtime.skillCompiler.compileFromBookSamples({
      book: bookC,
      dimension: 'character_persona',
      sampledChunks: runtime.corpusStore.sampleRepresentativeChunks(bookC.id, 'character_persona', 4),
      slug: 'craft-c-persona',
    });
    const skillD = runtime.skillCompiler.compileFromBookSamples({
      book: bookD,
      dimension: 'scene_atmosphere',
      sampledChunks: runtime.corpusStore.sampleRepresentativeChunks(bookD.id, 'scene_atmosphere', 4),
      slug: 'craft-d-scene',
    });

    assert.equal(runtime.skillCompiler.listSkills().length, 4);
    assert.ok(skillB.skillDirPath && existsSync(join(skillB.skillDirPath, 'SKILL.md')));
    assert.ok(existsSync(join(tempRoot, '.claude', 'skills', 'craft-b-battle', 'SKILL.md')));

    const skillBMd = readFileSync(join(skillB.skillDirPath!, 'SKILL.md'), 'utf8');
    assert.match(skillBMd, /Use when/);
    assert.match(skillBMd, /Not for/);
    assert.match(skillBMd, /If-Then Heuristics/);
    assert.match(skillBMd, /Anti-Patterns/);
    assert.ok(skillA && skillC && skillD);

    // Hybrid sqlite-vec + FTS5 RAG restricted to Book B for battle choreography
    const battlePassages = await runtime.corpusStore.searchPassages({
      query: '窄巷被重甲敌人围攻借地形闪避反杀',
      bookIds: [bookB.id],
      dimension: 'battle_action',
      topK: 2,
      mode: 'structural_beats',
      embedder: runtime.embedRegistry.resolveActiveEmbedder(),
    });

    assert.ok(battlePassages.length >= 1);
    assert.equal(battlePassages[0]!.bookId, bookB.id);
    assert.match(battlePassages[0]!.content, /\[节拍 1/);
  });
});
