import type {
  ChapterOutline,
  ChapterStateDelta,
  InvariantViolation,
  MechanicsLedger,
  NarrativeGraph,
  StyleProfile8Axis,
} from '@cat-cafe/shared';

export interface PreChapterCheckResult {
  constraintsMarkdown: string;
  violations: InvariantViolation[];
}

/**
 * LibriScribe InvariantChecker + harnessNovel Mechanics Layer:
 * Runs BEFORE drafting a chapter to surface hard continuity constraints & block impossible plot setups.
 */
export function buildPreChapterConstraints(params: {
  outline: ChapterOutline;
  graph: NarrativeGraph;
  mechanics: MechanicsLedger;
}): PreChapterCheckResult {
  const { outline, graph, mechanics } = params;
  const violations: InvariantViolation[] = [];
  const lines: string[] = [
    `## 第 ${outline.chapterNo} 章《${outline.title}》硬约束清单 (NARRATIVE & MECHANICS INVARIANTS)`,
    '',
  ];

  // Collect all cast IDs referenced in POV or scene beats
  const castIdSet = new Set<string>();
  if (outline.povCharacterId) castIdSet.add(outline.povCharacterId);
  for (const beat of outline.beats) {
    for (const cid of beat.castIds) castIdSet.add(cid);
  }

  const charById = new Map(graph.characters.map((c) => [c.id, c]));
  const charByName = new Map(graph.characters.map((c) => [c.name, c]));
  const locById = new Map(graph.locations.map((l) => [l.id, l]));
  const secretFacts = graph.facts.filter((f) => f.isSecret);

  if (castIdSet.size > 0) {
    lines.push('### 1. 本章出场角色状态与知情权边界');
    for (const ref of castIdSet) {
      const ch = charById.get(ref) ?? charByName.get(ref);
      if (!ch) {
        lines.push(`- **${ref}**（新登场或未建档角色：首次出场请锚定外貌/语气特征，并在定稿增量中建档）`);
        continue;
      }
      if (ch.status === 'dead' || ch.status === 'sealed') {
        violations.push({
          severity: 'blocker',
          category: 'dead_character',
          entityRef: ch.id,
          message: `角色「${ch.name}」当前状态为 [${ch.status}]（更新于第${ch.lastUpdatedChapter}章），严禁作为常规活人直接出场行动或对话（回忆/遗物除外）！`,
        });
      }
      const unknownSecrets = secretFacts
        .filter((sf) => !ch.knownFactIds.includes(sf.id))
        .map((sf) => `「${sf.statement}」`);
      lines.push(
        `- **${ch.name}** (\`${ch.id}\`)：状态=\`${ch.status}\` | 当前位置=\`${ch.locationId}\` | 实力=\`${ch.powerTier || '未标'}\`` +
          (ch.injuriesOrDebuffs.length > 0 ? ` | **当前伤势/限制**：${ch.injuriesOrDebuffs.join('、')}` : '') +
          (ch.inventory.length > 0 ? ` | 持有物：${ch.inventory.join('、')}` : '') +
          (ch.voiceTraits ? ` | 语言特征：${ch.voiceTraits}` : ''),
      );
      if (unknownSecrets.length > 0) {
        lines.push(
          `  - ⚠️ **防上帝视角剧透红线**：「${ch.name}」目前**不知道**以下秘密：${unknownSecrets.slice(0, 5).join('；')}——台词与心理独白严禁提前知晓！`,
        );
      }
    }
    lines.push('');
  }

  // Check beat locations
  const locRefs = [...new Set(outline.beats.map((b) => b.locationId).filter(Boolean))];
  if (locRefs.length > 0) {
    lines.push('### 2. 场景地点物理状态');
    for (const lref of locRefs) {
      const loc = locById.get(lref) ?? graph.locations.find((l) => l.name === lref);
      if (!loc) continue;
      if (loc.status === 'destroyed' || loc.status === 'sealed') {
        violations.push({
          severity: 'warn',
          category: 'location_state',
          entityRef: loc.id,
          message: `地点「${loc.name}」在第${loc.lastUpdatedChapter}章已处于 [${loc.status}] 状态，请确认本章描写为废墟/封印态而非完好建筑！`,
        });
      }
      lines.push(
        `- **${loc.name}** (\`${loc.id}\`)：状态=\`${loc.status}\` ${loc.description ? `— ${loc.description}` : ''}`,
      );
    }
    lines.push('');
  }

  // Check active foreshadowings
  const activeClues = graph.foreshadowings.filter((f) => f.status === 'planted' || f.status === 'progressed');
  if (activeClues.length > 0 || outline.foreshadowingToPayoff.length > 0) {
    lines.push('### 3. 伏笔呼应提醒');
    if (outline.foreshadowingToPayoff.length > 0) {
      lines.push(`- **本章必须回收/推进的伏笔ID**：${outline.foreshadowingToPayoff.join(', ')}`);
    }
    for (const clue of activeClues.slice(0, 6)) {
      lines.push(
        `- [第${clue.plantedChapter}章埋线 · \`${clue.id}\`] ${clue.clue}（预期回收：${clue.expectedPayoffWindow || '待定'}）`,
      );
    }
    lines.push('');
  }

  // Mechanics ledger snapshot
  if (mechanics.enabled) {
    lines.push(`### 4. 机制与数值账本硬约束（${mechanics.systemName}）`);
    for (const rule of mechanics.hardRules) {
      lines.push(`- [铁律] ${rule}`);
    }
    for (const ent of mechanics.entities) {
      const statPairs = Object.entries(ent.stats)
        .map(([k, v]) => `${k}=${Array.isArray(v) ? v.join('/') : v}`)
        .join(', ');
      lines.push(`- **${ent.entityName}** 当前面板：${statPairs || '暂无数值'}`);
      const cooling = ent.skillsAndCooldowns.filter((s) => !s.ready);
      if (cooling.length > 0) {
        lines.push(`  - ⛔ 冷却不可用技能：${cooling.map((s) => s.name).join('、')}`);
      }
    }
    lines.push('');
  }

  return {
    constraintsMarkdown: lines.join('\n').trim(),
    violations,
  };
}

/**
 * Post-draft deterministic continuity & numerical math verification.
 */
export function verifyDraftContinuity(params: {
  outline: ChapterOutline;
  draftText: string;
  graph: NarrativeGraph;
  mechanics: MechanicsLedger;
  proposedDelta?: ChapterStateDelta;
  styleProfile?: StyleProfile8Axis;
}): InvariantViolation[] {
  const { draftText, graph, mechanics, proposedDelta, styleProfile } = params;
  const violations: InvariantViolation[] = [];

  // 1. Dead character speaking/acting check (ignores explicit flashback markers like 回忆/生前/遗像/墓碑)
  const deadChars = graph.characters.filter((c) => c.status === 'dead');
  const paragraphs = draftText
    .split(/\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const dead of deadChars) {
    const names = [dead.name, ...dead.aliases].filter((n) => n.length >= 2);
    for (const para of paragraphs) {
      if (/回忆|生前|遗言|墓|牌位|当初|曾说|幻影|尸体/.test(para)) continue;
      for (const nm of names) {
        const activeSpeechRe = new RegExp(
          `${nm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^。！？\\n]{0,12}(?:说道|开口道|冷笑道|喝道|走出|挥剑|抬手)`,
        );
        if (activeSpeechRe.test(para)) {
          violations.push({
            severity: 'blocker',
            category: 'dead_character',
            entityRef: dead.id,
            message: `穿帮拦截：已死亡角色「${dead.name}」（亡于第${dead.lastUpdatedChapter}章）在非回忆段落中出现活人言行！`,
            evidenceSpan: para.slice(0, 140),
          });
          break;
        }
      }
    }
  }

  // 2. Mechanics Ledger numerical math & bounds validation
  if (mechanics.enabled && proposedDelta?.mechanicsStatChanges?.length) {
    const fieldRules = new Map(mechanics.fields.map((f) => [f.key, f]));
    const entityMap = new Map(mechanics.entities.map((e) => [e.entityId, e]));

    for (const change of proposedDelta.mechanicsStatChanges) {
      const entity = entityMap.get(change.entityId);
      const currentVal = entity?.stats[change.key];
      const fieldSpec = fieldRules.get(change.key);

      if (typeof currentVal === 'number' && typeof change.delta === 'number' && typeof change.nextValue === 'number') {
        const expected = Number((currentVal + change.delta).toFixed(4));
        if (Math.abs(expected - change.nextValue) > 1e-3) {
          violations.push({
            severity: 'blocker',
            category: 'mechanics_math',
            entityRef: `${change.entityId}.${change.key}`,
            message: `数值账本算术错误：${change.entityId} 的「${change.key}」原值 ${currentVal} + 变动 ${change.delta} 应为 ${expected}，但提交值为 ${change.nextValue}！`,
          });
        }
      }
      if (fieldSpec && typeof change.nextValue === 'number') {
        if (fieldSpec.min !== undefined && change.nextValue < fieldSpec.min) {
          violations.push({
            severity: 'blocker',
            category: 'mechanics_math',
            entityRef: `${change.entityId}.${change.key}`,
            message: `数值越界：「${fieldSpec.label}」提交值 ${change.nextValue} 低于系统下限 ${fieldSpec.min}！`,
          });
        }
        if (fieldSpec.max !== undefined && change.nextValue > fieldSpec.max) {
          violations.push({
            severity: 'warn',
            category: 'mechanics_math',
            entityRef: `${change.entityId}.${change.key}`,
            message: `数值越界预警：「${fieldSpec.label}」提交值 ${change.nextValue} 超过当前上限 ${fieldSpec.max}（若非突破境界请修正）。`,
          });
        }
      }
    }
  }

  // 3. Inventory removal check (cannot lose/use an item never held)
  if (proposedDelta?.characterUpdates?.length) {
    const charMap = new Map(graph.characters.map((c) => [c.id, c]));
    for (const upd of proposedDelta.characterUpdates) {
      const ch = charMap.get(upd.characterId);
      if (!ch || !upd.removeInventory?.length) continue;
      for (const item of upd.removeInventory) {
        if (!ch.inventory.includes(item)) {
          violations.push({
            severity: 'warn',
            category: 'inventory_mismatch',
            entityRef: ch.id,
            message: `道具账本不一致：角色「${ch.name}」尝试消耗/移除未登记持有的物品「${item}」。`,
          });
        }
      }
    }
  }

  // 4. StyleProfile hard forbidden clichés
  if (styleProfile?.forbiddenCliches?.length) {
    for (const phrase of styleProfile.forbiddenCliches) {
      if (phrase && draftText.includes(phrase)) {
        violations.push({
          severity: 'warn',
          category: 'forbidden_cliche',
          entityRef: 'style_profile',
          message: `命中项目禁用套话：「${phrase}」`,
        });
      }
    }
  }

  return violations;
}

/**
 * Apply committed chapter state delta atomically to NarrativeGraph & MechanicsLedger,
 * recording a chapter snapshot for instant breakpoint rollback.
 */
export function applyCommittedChapterDelta(params: {
  chapterNo: number;
  graph: NarrativeGraph;
  mechanics: MechanicsLedger;
  delta?: ChapterStateDelta;
}): { nextGraph: NarrativeGraph; nextMechanics: MechanicsLedger } {
  const nextGraph: NarrativeGraph = structuredClone(params.graph);
  const nextMechanics: MechanicsLedger = structuredClone(params.mechanics);
  const now = new Date().toISOString();

  if (params.delta) {
    for (const newCh of params.delta.newCharacters) {
      if (!nextGraph.characters.some((c) => c.id === newCh.id)) {
        nextGraph.characters.push({ ...newCh, lastUpdatedChapter: params.chapterNo });
      }
    }

    for (const upd of params.delta.characterUpdates) {
      const target = nextGraph.characters.find((c) => c.id === upd.characterId);
      if (!target) continue;
      if (upd.status) target.status = upd.status;
      if (upd.locationId) target.locationId = upd.locationId;
      if (upd.powerTier !== undefined) target.powerTier = upd.powerTier;
      if (upd.addInjuries?.length) {
        target.injuriesOrDebuffs = [...new Set([...target.injuriesOrDebuffs, ...upd.addInjuries])];
      }
      if (upd.healInjuries?.length) {
        const healed = new Set(upd.healInjuries);
        target.injuriesOrDebuffs = target.injuriesOrDebuffs.filter((i) => !healed.has(i));
      }
      if (upd.addInventory?.length) {
        target.inventory = [...new Set([...target.inventory, ...upd.addInventory])];
      }
      if (upd.removeInventory?.length) {
        const removed = new Set(upd.removeInventory);
        target.inventory = target.inventory.filter((i) => !removed.has(i));
      }
      if (upd.learnFactIds?.length) {
        target.knownFactIds = [...new Set([...target.knownFactIds, ...upd.learnFactIds])];
      }
      target.lastUpdatedChapter = params.chapterNo;
    }

    for (const locUpd of params.delta.locationUpdates) {
      const loc = nextGraph.locations.find((l) => l.id === locUpd.locationId);
      if (!loc) continue;
      if (locUpd.status) loc.status = locUpd.status;
      if (locUpd.description !== undefined) loc.description = locUpd.description;
      loc.lastUpdatedChapter = params.chapterNo;
    }

    for (const fact of params.delta.newFacts) {
      if (!nextGraph.facts.some((f) => f.id === fact.id)) {
        nextGraph.facts.push({ ...fact, introducedChapter: params.chapterNo });
      }
    }

    for (const clue of params.delta.plantedForeshadowings) {
      if (!nextGraph.foreshadowings.some((f) => f.id === clue.id)) {
        nextGraph.foreshadowings.push({ ...clue, plantedChapter: params.chapterNo });
      }
    }

    for (const resolvedId of params.delta.resolvedForeshadowingIds) {
      const target = nextGraph.foreshadowings.find((f) => f.id === resolvedId);
      if (target) {
        target.status = 'resolved';
        target.resolvedChapter = params.chapterNo;
      }
    }

    for (const statChange of params.delta.mechanicsStatChanges) {
      let ent = nextMechanics.entities.find((e) => e.entityId === statChange.entityId);
      if (!ent) {
        ent = { entityId: statChange.entityId, entityName: statChange.entityId, stats: {}, skillsAndCooldowns: [] };
        nextMechanics.entities.push(ent);
      }
      ent.stats[statChange.key] = statChange.nextValue;
    }
  }

  nextMechanics.chapterSnapshots[String(params.chapterNo)] = structuredClone(nextMechanics.entities);
  nextGraph.revision += 1;
  nextGraph.updatedAt = now;
  nextMechanics.revision += 1;
  nextMechanics.updatedAt = now;

  return { nextGraph, nextMechanics };
}
