// @vitest-environment node

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { runInContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { CLIENT_OPTIONS, carrierOptionsForClient, initialState } from '@/components/hub-cat-editor.model';
import { templateForm } from '@/components/settings/members/member-editor-state';
import { runtimeDefaults } from '@/components/settings/members/member-runtime-draft';
import { memberRuntimeTools } from '@/components/settings/members/member-runtime-tools';
import { chatModels } from '../chat-models';
import { scriptSources } from '../runtime';
import { builtinThemes, defaultThemePdl } from './builtin-theme';
import { fixtureData, fixtureInput, fixtureSidebar, fixtureUi } from './chat-fixture';
import { environmentSummaryFixture, settingsInput, systemSummaryFixture } from './owner-fixtures';

const { JSDOM } = createRequire(import.meta.url)('jsdom');

async function bootV2() {
  const dom = new JSDOM('<!doctype html><div id="app"></div>', {
    url: 'https://pdl.test/',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
  });
  const w = dom.window;
  const errors = vi.spyOn(w.console, 'error').mockImplementation(() => {});
  await new Promise<void>((resolve) => w.document.addEventListener('DOMContentLoaded', resolve, { once: true }));
  w.document.timeline = { currentTime: 0 };
  w.matchMedia = () => ({ matches: false, addEventListener() {} });
  w.CSS = { escape: (s: string) => s, supports: () => true };
  w.HTMLElement.prototype.getAnimations = () => [];
  w.HTMLElement.prototype.showPopover = () => {};
  w.HTMLElement.prototype.hidePopover = () => {};
  w.HTMLElement.prototype.scrollIntoView = () => {};
  w.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  w.IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  w.document.getAnimations = () => [];
  w.document.fonts = { ready: Promise.resolve() };
  w.document.documentElement.style.setProperty('--hold-toast', defaultThemePdl().tokens.base['--hold-toast']);

  for (const source of scriptSources) {
    runInContext(readFileSync(path.join(process.cwd(), 'public', source), 'utf8'), dom.getInternalVMContext(), {
      filename: source,
    });
  }

  const data = fixtureData();
  const ui = fixtureUi();
  Object.assign(data.cats[0], {
    id: 'codex',
    name: '缅因猫',
    displayName: '缅因猫',
    nickname: '砚砚',
    clientId: 'openai',
    carrier: 'app_server',
    configurationSource: 'native_tool',
    accountRef: '',
    configurationRevision: 'rev-1',
    form: {
      ...initialState(),
      catId: 'codex',
      name: '缅因猫',
      displayName: '缅因猫',
      nickname: '砚砚',
      roleDescription: '审校官',
      mentionPatterns: '@砚砚',
      clientId: 'openai',
      carrier: 'app_server',
      configurationSource: 'native_tool',
    },
  });

  const dshDesktopCmd = 'D:\\software\\dsHarness\\resources\\runtime\\cli\\bin\\dsh.cmd';
  const discoveredRuntimes = [
    {
      id: 'codex',
      label: 'Codex',
      clientId: 'openai' as const,
      installed: true,
      models: ['gpt-5.4'],
      readiness: { status: 'configured' as const, checkedAt: 1 },
    },
    {
      id: 'dsh',
      label: 'DSH Desktop',
      clientId: 'acp' as const,
      installed: true,
      dshDesktop: true,
      dshSetupSupported: true,
      acp: { command: dshDesktopCmd, startupArgs: ['--profile', 'acp'], transport: 'stdio' as const },
      models: [],
      readiness: { status: 'unknown' as const, checkedAt: 1 },
    },
  ];
  const templates = [
    {
      id: 'dsh',
      name: '小鲸鱼',
      nickname: '鲸鲸',
      avatar: '/avatars/family/dsh.png',
      color: { primary: '#3B7EA1', secondary: '#DCEBF2' },
      roleDescription: '共创与推理伙伴，负责分析问题、编码实现和交叉验证',
      personality: '细心务实，先理清问题，再用可验证的结果交付',
      teamStrengths: '问题分析、编码、交叉验证',
    },
  ];
  const tools = memberRuntimeTools(discoveredRuntimes, []).map((runtime) => ({
    ...runtime,
    acpMaxDefault: 20,
    dshSetupSupported: runtime.id === 'dsh' ? true : runtime.dshSetupSupported,
    form: runtimeDefaults(runtime),
  }));

  const metadata = {
    accounts: [],
    l0: null,
    templates,
    blank: initialState(),
    codex: { sandboxMode: 'workspace-write', approvalPolicy: 'on-request', authMode: 'api_key' },
    strategies: [],
    libraries: [],
    runtimes: tools,
    clients: CLIENT_OPTIONS.map((client) => ({
      id: client.value,
      acpMaxDefault: 20,
      label: client.label,
      carriers: carrierOptionsForClient(client.value).map((row) => [row.value, row.label]),
      accounts: [],
    })),
  };

  const nativePartners = [
    {
      id: 'dsh',
      creationRequestKey: 'req-dsh',
      selected: true,
      selectable: true,
      runtime: {
        ...discoveredRuntimes[1],
        acpMaxDefault: 20,
      },
      form: {
        ...templateForm(templates[0], [], initialState()),
        ...runtimeDefaults(discoveredRuntimes[1]),
        catId: 'dsh',
        mentionPatterns: '@鲸鲸, @dsh',
      },
    },
  ];

  const staticReads: Record<string, () => Promise<unknown> | unknown> = {
    '/api/config/env-summary?surface=system': () => systemSummaryFixture(),
    '/api/config/env-summary': () => environmentSummaryFixture(),
    '/api/config/console-themes': () => ({ themes: { active: 'pkg:v2', customs: [] } }),
    '/api/console-themes/packages': async () => ({ packages: await builtinThemes.list() }),
    '/api/config/chat-background': () => ({ threads: {} }),
    '/api/config/chat-background/images': () => ({ images: [] }),
    '/api/plugin-manager/plugins': () => ({ plugins: [] }),
    '/api/plugin-manager/pdl': () => ({ fragments: {} }),
    '/api/dossier': () => ({ meta: { dossierCoverage: 0, totalCats: 0, totalModels: 0 }, modelGroups: [] }),
    '/api/capabilities': () => ({ skills: [], mcps: [] }),
    '/api/skills': () => ({ skills: [] }),
    '/api/mcp/servers': () => ({ servers: [] }),
    '/api/mount-rules': () => ({ rules: [] }),
    '/api/mcp/config': () => ({ mcpServers: {} }),
    '/api/dossier/observations': () => ({ observations: [] }),
    '/api/concierge/work/decisions': () => ({
      status: 'available',
      items: [],
      page: { offset: 0, limit: 20, hasMore: false },
    }),
    '/api/concierge/confirmations': () => ({ confirmations: [] }),
    '/api/concierge/thread': () => ({ threadId: null }),
    '/api/concierge/work/mentions/last-handling': () => ({ receipt: null }),
  };

  const get = vi.fn(async (name: string) => {
    if (name.startsWith('/api/console-themes/packages/')) {
      return builtinThemes.read(name.slice('/api/console-themes/packages/'.length));
    }
    const reader = staticReads[name];
    if (!reader) throw new Error(`Unexpected read: ${name}`);
    return reader();
  });

  const post = vi.fn(async () => ({ projectRoot: '/workspace/global', result: { issues: [] } }));
  const createdNative: unknown[] = [];
  const actionHandlers: Record<string, (args: Record<string, string>) => unknown> = {
    pushClientRead: () => ({ isSupported: true, permission: 'granted', isSubscribed: false, worker: 'registered' }),
    membersRead: () => structuredClone(metadata),
    memberCanonRead: () => ({ bound: false, versions: [] }),
    memberVoicesRead: () => [],
    settingsHooksRead: () => ({ status: 'configured', targets: [] }),
    memberRuntimeModels: () => ({
      status: 'live',
      models: [{ value: 'deepseek-chat', label: 'DeepSeek V3' }],
      defaultModel: 'deepseek-chat',
      defaultModelLabel: 'DeepSeek V3',
      defaultModelSource: 'tool_config',
      defaultModelStatus: 'reported',
    }),
    memberTemplate: (args) => {
      const current = JSON.parse(args.value);
      if (args.id === 'blank') return { ...initialState(), avatar: current.avatar };
      const tplCard = templates.find((t) => t.id === args.id) ?? templates[0];
      return { ...templateForm(tplCard, [], current), avatar: tplCard.avatar };
    },
    nativeDetect: () => structuredClone(nativePartners),
    nativePrepare: (args) => {
      const p = JSON.parse(args.value);
      return { ...p.form, acpStartupArgs: '--profile prepared-acp' };
    },
    nativeCreate: (args) => {
      const p = JSON.parse(args.value);
      createdNative.push(p);
      return { id: p.form.catId || 'dsh' };
    },
  };
  const action = vi.fn(async (name: string, args: Record<string, string>) => actionHandlers[name]?.(args));

  let input = fixtureInput(data) as Record<string, unknown>;
  const port = {
    needed: vi.fn(),
    threadId: data.threadId,
    exportReady: Promise.resolve(),
    state: ui,
    get data() {
      return input;
    },
    set data(value: Record<string, unknown>) {
      const project = value.project as Record<string, object>;
      input = {
        ...value,
        project: {
          ...project,
          ...('settings' in project ? { settings: { ...settingsInput(), ...project.settings } } : {}),
        },
      };
    },
    sidebarData: fixtureSidebar(data),
    models: vi.fn(() => {
      throw new Error('Settings VMs must read held data');
    }),
    get,
    post,
    action: async (name: string, args: Record<string, string>, element?: HTMLElement) => {
      const res = await action(name, args, element);
      w.clowderChat.update(port);
      return res;
    },
    file: (s: string) => s,
    richRender: async () => '',
    navResize: { width: () => 240, min: 160, max: () => 400 },
    attach() {},
    live: () => '',
  };

  await w.clowderChat.start(port, chatModels);
  await w.__settled();
  return { dom, w, action, errors, createdNative, dshDesktopCmd };
}

describe('v2 theme member savebar, one-click partner setup, and DeepSeek DSH integration', () => {
  it('renders a visible #savebar submit button on memberNew and on dirty member edit in v2 theme', async () => {
    const { dom, w, errors } = await bootV2();
    try {
      expect(w.document.documentElement.getAttribute('data-shell')).toBe('v2');

      w.eval("go('memberNew')");
      await w.__settled();

      const savebarNew = w.document.getElementById('savebar') as HTMLElement | null;
      expect(savebarNew).not.toBeNull();
      expect(savebarNew?.hasAttribute('hidden')).toBe(false);
      expect(savebarNew?.hidden).toBe(false);

      const addSubmit = savebarNew?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      expect(addSubmit).not.toBeNull();
      expect(addSubmit?.textContent).toContain('添加');
      expect(addSubmit?.disabled).toBe(false);

      w.eval("go('member-codex')");
      await w.__settled();

      const savebarExistingClean = w.document.getElementById('savebar') as HTMLElement | null;
      expect(savebarExistingClean).not.toBeNull();
      expect(savebarExistingClean?.hasAttribute('hidden')).toBe(true);

      const nameInput = w.document.getElementById('f-name') as HTMLInputElement;
      nameInput.value = '砚砚改名';
      nameInput.dispatchEvent(new w.Event('input', { bubbles: true }));
      await w.__settled();

      const savebarExistingDirty = w.document.getElementById('savebar') as HTMLElement | null;
      expect(savebarExistingDirty?.hasAttribute('hidden')).toBe(false);
      const saveSubmit = savebarExistingDirty?.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      expect(saveSubmit).not.toBeNull();
      expect(saveSubmit?.textContent).toContain('保存');
      expect(errors).not.toHaveBeenCalled();
    } finally {
      dom.window.close();
    }
  });

  it('exposes one-click partner setup from v2 member list and creates DeepSeek 小鲸鱼 (鲸鲸)', async () => {
    const { dom, w, createdNative, errors } = await bootV2();
    try {
      w.eval("go('members')");
      await w.__settled();

      const memberPage = w.document.querySelector('[data-testid="member-list-page"]') as HTMLElement | null;
      expect(memberPage).not.toBeNull();
      const quickButton = Array.from(memberPage?.querySelectorAll('button') ?? []).find((b) =>
        b.textContent?.includes('一键检测并添加猫猫'),
      );
      expect(quickButton).toBeDefined();

      quickButton?.click();
      await w.__settled();

      expect(w.eval('S.popOn.nativeSetup')).toBe(true);
      const popup = w.document.querySelector('.pop-host[data-pop="nativeSetup"]') as HTMLElement | null;
      expect(popup).not.toBeNull();
      expect(popup?.textContent).toContain('小鲸鱼');
      expect(popup?.textContent).toContain('鲸鲸');
      expect(popup?.textContent).toContain('DSH Desktop');
      expect(popup?.textContent).toContain('已安装 · 添加时自动配置');

      const createBtn = popup?.querySelector('[data-act="nativeCreate"]') as HTMLButtonElement | null;
      expect(createBtn).not.toBeNull();
      expect(createBtn?.disabled).toBe(false);

      await w.eval('A.nativeCreate()');
      await w.__settled();

      expect(createdNative).toHaveLength(1);
      expect(createdNative[0]).toMatchObject({
        id: 'dsh',
        creationForm: expect.objectContaining({
          name: '小鲸鱼',
          nickname: '鲸鲸',
          acpStartupArgs: '--profile prepared-acp',
        }),
      });
      expect(errors).not.toHaveBeenCalled();
    } finally {
      dom.window.close();
    }
  });

  it('provides DeepSeek 鲸鲸 (DSH) quick tool binding & template linkage in v2 memberNew', async () => {
    const { dom, w, dshDesktopCmd, errors } = await bootV2();
    try {
      w.eval("go('memberNew')");
      await w.__settled();

      const runtimeSelect = w.document.getElementById('f-runtime') as HTMLSelectElement | null;
      expect(runtimeSelect).not.toBeNull();
      const dshOption = Array.from(runtimeSelect?.options ?? []).find((o) => o.value === 'dsh');
      expect(dshOption).toBeDefined();
      expect(dshOption?.textContent).toContain('DeepSeek 鲸鲸 (DSH)');

      if (runtimeSelect) {
        runtimeSelect.value = 'dsh';
        runtimeSelect.dispatchEvent(new w.Event('change', { bubbles: true }));
      }
      await w.__settled();

      const vmForm = w.eval('VM.memberNew().form');
      expect(vmForm.d.breed).toBe('小鲸鱼');
      expect(vmForm.d.name).toBe('鲸鲸');
      expect(vmForm.d.acpCmd).toBe(dshDesktopCmd);
      expect(vmForm.d.acpArgs).toBe('--profile acp');
      expect(vmForm.save.missingCount).toBe(0);
      expect(w.document.getElementById('rt-dsh-profile')).not.toBeNull();

      expect(errors).not.toHaveBeenCalled();
    } finally {
      dom.window.close();
    }
  });
});
