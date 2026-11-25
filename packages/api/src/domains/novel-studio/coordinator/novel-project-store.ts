import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  type MechanicsLedger,
  mechanicsLedgerSchema,
  type NarrativeGraph,
  NOVEL_CRAFT_DIMENSIONS,
  type NovelProject,
  narrativeGraphSchema,
  novelProjectSchema,
} from '@cat-cafe/shared';
import { nanoid } from 'nanoid';

export interface FullNovelProjectBundle {
  project: NovelProject;
  canon: NarrativeGraph;
  mechanics: MechanicsLedger;
  canonSnapshotsPath: string;
}

export class NovelProjectStore {
  private readonly projectsRoot: string;

  constructor(dataDir: string) {
    this.projectsRoot = join(dataDir, 'projects');
    mkdirSync(this.projectsRoot, { recursive: true });
  }

  private projectDir(projectId: string): string {
    if (!/^[a-z0-9][a-z0-9_-]*$/i.test(projectId)) {
      throw new Error(`Invalid novel project id: ${projectId}`);
    }
    return join(this.projectsRoot, projectId);
  }

  createProject(input: {
    title: string;
    slug?: string;
    genre?: string;
    premise?: string;
    authorMasterOutlineMarkdown?: string;
    copilotCatId?: string;
    styleConfig?: Partial<NovelProject['styleConfig']>;
    threadId?: string;
    enableMechanicsLedger?: boolean;
    catRoster?: Partial<NovelProject['catRoster']>;
  }): FullNovelProjectBundle {
    const now = new Date().toISOString();
    const rawSlug = (input.slug?.trim() || input.title.trim())
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    const safeSuffix = (n: number) =>
      nanoid(n)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, 'x');
    const slug = rawSlug.length >= 2 ? rawSlug.slice(0, 48) : `novel-${safeSuffix(6)}`;
    const id = `np-${slug}-${safeSuffix(5)}`;
    const copilotCatId = input.copilotCatId?.trim() || input.catRoster?.writerCatId || 'kimi';
    const initialOutline = input.authorMasterOutlineMarkdown?.trim() || input.premise?.trim() || '';

    const project = novelProjectSchema.parse({
      id,
      slug,
      title: input.title.trim(),
      genre: input.genre?.trim() || '奇幻/长篇连载',
      premise: input.premise?.trim() || '',
      threadId: input.threadId,
      authorMasterOutlineMarkdown: initialOutline,
      rollingSynopsisMarkdown: '',
      accumulatedWorldbuildingMarkdown: '',
      styleConfig: {
        referenceBookIds: input.styleConfig?.referenceBookIds ?? [],
        stylePreset: input.styleConfig?.stylePreset ?? '沉稳具象·强代入感',
        customStyleGuidelines: input.styleConfig?.customStyleGuidelines ?? '',
        targetWords: input.styleConfig?.targetWords ?? 3200,
      },
      copilotCatId,
      archivedBranches: [],
      continuityAlerts: [],
      worldBlueprintMarkdown: `# 《${input.title.trim()}》世界观与故事总蓝图\n\n## 核心卖点与一句话梗概\n${input.premise?.trim() || '待作者输入主线构想并随章沉淀'}\n`,
      dimensionBindings: NOVEL_CRAFT_DIMENSIONS.map((dimension) => ({
        dimension,
        skillSlugs: [],
        referenceBookIds: [],
        ragWeight: 0.7,
        ragMode: 'structural_beats' as const,
      })),
      catRoster: {
        chiefEditorCatId: input.catRoster?.chiefEditorCatId || 'opus',
        architectCatId: input.catRoster?.architectCatId || 'opus',
        writerCatId: input.catRoster?.writerCatId || copilotCatId,
        specialistCatId: input.catRoster?.specialistCatId || 'gemini',
        criticCatId: input.catRoster?.criticCatId || 'codex',
      },
      workflow: {
        approvalMode: 'chapter-gate',
        autoBatchSize: 5,
        autoRemainingChapters: 0,
        qualityThreshold: 0.72,
        pacingThreshold: 0.7,
        maxRewriteRounds: 2,
        enableMechanicsLedger: Boolean(input.enableMechanicsLedger),
        enableHumanizer: true,
      },
      storyArcs: [],
      chapterOutlines: [],
      chapters: {},
      currentChapterNo: 1,
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });

    const canon = narrativeGraphSchema.parse({
      characters: [],
      locations: [],
      facts: [],
      foreshadowings: [],
      revision: 1,
      updatedAt: now,
    });

    const mechanics = mechanicsLedgerSchema.parse({
      enabled: Boolean(input.enableMechanicsLedger),
      systemName: '核心力量/系统账本',
      hardRules: [],
      fields: [
        { key: 'realm', label: '当前境界/序列', kind: 'tier' },
        { key: 'energy', label: '体力/灵力百分比', kind: 'number', min: 0, max: 100 },
      ],
      entities: [],
      chapterSnapshots: {},
      revision: 1,
      updatedAt: now,
    });

    this.saveBundle(project, canon, mechanics);
    this.saveCanonSnapshot(id, 0, canon);
    return this.loadBundle(id)!;
  }

  saveBundle(project: NovelProject, canon?: NarrativeGraph, mechanics?: MechanicsLedger): void {
    const dir = this.projectDir(project.id);
    mkdirSync(join(dir, 'chapters', 'raw'), { recursive: true });
    mkdirSync(join(dir, 'chapters', 'final'), { recursive: true });
    mkdirSync(join(dir, 'chapters', 'history'), { recursive: true });
    mkdirSync(join(dir, 'snapshots'), { recursive: true });

    const updatedProject: NovelProject = {
      ...project,
      revision: project.revision + 1,
      updatedAt: new Date().toISOString(),
    };

    writeFileSync(join(dir, 'novel-project.json'), JSON.stringify(updatedProject, null, 2), 'utf8');
    writeFileSync(join(dir, 'world-blueprint.md'), updatedProject.worldBlueprintMarkdown, 'utf8');
    writeFileSync(join(dir, 'author-master-outline.md'), updatedProject.authorMasterOutlineMarkdown, 'utf8');
    writeFileSync(join(dir, 'rolling-synopsis.md'), updatedProject.rollingSynopsisMarkdown, 'utf8');
    writeFileSync(join(dir, 'worldbuilding-notes.md'), updatedProject.accumulatedWorldbuildingMarkdown, 'utf8');

    for (const [chKey, chState] of Object.entries(updatedProject.chapters)) {
      const pad = String(chState.chapterNo).padStart(4, '0');
      if (chState.rawDraft) {
        writeFileSync(join(dir, 'chapters', 'raw', `ch-${pad}.md`), chState.rawDraft, 'utf8');
      }
      if (chState.finalText) {
        writeFileSync(join(dir, 'chapters', 'final', `ch-${pad}.md`), chState.finalText, 'utf8');
      }
      if ((chState.versionHistory?.length ?? 0) > 0) {
        writeFileSync(
          join(dir, 'chapters', 'history', `ch-${pad}-versions.json`),
          JSON.stringify(chState.versionHistory, null, 2),
          'utf8',
        );
      }
      void chKey;
    }

    if (canon) {
      writeFileSync(join(dir, 'narrative-graph.json'), JSON.stringify(canon, null, 2), 'utf8');
    }
    if (mechanics) {
      writeFileSync(join(dir, 'mechanics-ledger.json'), JSON.stringify(mechanics, null, 2), 'utf8');
    }
  }

  saveCanonSnapshot(projectId: string, chapterNo: number, canon: NarrativeGraph): void {
    const snapDir = join(this.projectDir(projectId), 'snapshots');
    mkdirSync(snapDir, { recursive: true });
    writeFileSync(
      join(snapDir, `canon-ch-${String(chapterNo).padStart(4, '0')}.json`),
      JSON.stringify(canon, null, 2),
      'utf8',
    );
  }

  loadCanonSnapshot(projectId: string, chapterNo: number): NarrativeGraph | null {
    const snapPath = join(
      this.projectDir(projectId),
      'snapshots',
      `canon-ch-${String(chapterNo).padStart(4, '0')}.json`,
    );
    if (!existsSync(snapPath)) return null;
    return narrativeGraphSchema.parse(JSON.parse(readFileSync(snapPath, 'utf8')));
  }

  loadBundle(projectId: string): FullNovelProjectBundle | null {
    const dir = this.projectDir(projectId);
    const projPath = join(dir, 'novel-project.json');
    if (!existsSync(projPath)) return null;

    const project = novelProjectSchema.parse(JSON.parse(readFileSync(projPath, 'utf8')));
    const canonPath = join(dir, 'narrative-graph.json');
    const mechPath = join(dir, 'mechanics-ledger.json');

    const canon = existsSync(canonPath)
      ? narrativeGraphSchema.parse(JSON.parse(readFileSync(canonPath, 'utf8')))
      : narrativeGraphSchema.parse({ updatedAt: project.updatedAt });
    const mechanics = existsSync(mechPath)
      ? mechanicsLedgerSchema.parse(JSON.parse(readFileSync(mechPath, 'utf8')))
      : mechanicsLedgerSchema.parse({ enabled: project.workflow.enableMechanicsLedger, updatedAt: project.updatedAt });

    return {
      project,
      canon,
      mechanics,
      canonSnapshotsPath: join(dir, 'snapshots'),
    };
  }

  listProjects(): NovelProject[] {
    if (!existsSync(this.projectsRoot)) return [];
    const list: NovelProject[] = [];
    for (const entry of readdirSync(this.projectsRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const projPath = join(this.projectsRoot, entry.name, 'novel-project.json');
      if (!existsSync(projPath)) continue;
      try {
        list.push(novelProjectSchema.parse(JSON.parse(readFileSync(projPath, 'utf8'))));
      } catch {
        // Ignore broken folders
      }
    }
    return list.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  deleteProject(projectId: string): boolean {
    const dir = this.projectDir(projectId);
    if (!existsSync(dir)) return false;
    rmSync(dir, { recursive: true, force: true });
    return true;
  }

  deleteCanonSnapshotsAfter(projectId: string, maxKeepChapterNo: number): void {
    const snapDir = join(this.projectDir(projectId), 'snapshots');
    if (!existsSync(snapDir)) return;
    for (const name of readdirSync(snapDir)) {
      const m = name.match(/^canon-ch-(\d+)\.json$/);
      if (!m) continue;
      const no = Number(m[1]);
      if (no > maxKeepChapterNo) {
        rmSync(join(snapDir, name), { force: true });
      }
    }
  }

  exportManuscript(projectId: string, format: 'md' | 'txt' = 'md'): { fileName: string; content: string } {
    const bundle = this.loadBundle(projectId);
    if (!bundle) throw new Error(`Novel project not found: ${projectId}`);
    const { project } = bundle;

    const outlinesByNo = new Map(project.chapterOutlines.map((o) => [o.chapterNo, o]));
    const committedChapters = Object.values(project.chapters)
      .filter((ch) => (ch.finalText || ch.humanizedDraft || ch.rawDraft).trim().length > 0)
      .sort((a, b) => a.chapterNo - b.chapterNo);

    const blocks: string[] = [];
    if (format === 'md') {
      blocks.push(`# 《${project.title}》\n\n> 题材：${project.genre}\n> 简介：${project.premise}\n`);
    } else {
      blocks.push(`《${project.title}》\n题材：${project.genre}\n简介：${project.premise}\n${'='.repeat(36)}\n`);
    }

    for (const ch of committedChapters) {
      const outline = outlinesByNo.get(ch.chapterNo);
      const chTitle = (ch.title || ch.distilledSummary?.title || outline?.title || '').trim();
      const heading = `第${ch.chapterNo}章 ${chTitle}`.trim();
      const body = (ch.finalText || ch.humanizedDraft || ch.rawDraft).trim();
      blocks.push(format === 'md' ? `## ${heading}\n\n${body}\n` : `${heading}\n\n${body}\n\n`);
    }

    return {
      fileName: `${project.slug}.${format}`,
      content: blocks.join('\n'),
    };
  }
}
