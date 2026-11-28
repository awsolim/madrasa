import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

async function source(path) {
  return ts.transpileModule(await readFile(new URL(path, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
}
const refreshCode = await source('../src/hooks/use-refresh-on-return.ts');
const cacheCode = await source('../src/lib/query-cache.ts');
const navigationCode = await source('../src/components/layout/workspace-navigation.tsx');
const paths = {};
vm.runInNewContext(await source('../src/lib/navigation-paths.ts'), { exports: paths, process: { env: {} } });

for (const origin of ['http://localhost:3000', 'https://assiddiq.madrasa.ca']) {
  test(`Classes reselect reaches refresh listeners without a reload on ${origin}`, () => {
    const events = [];
    const prefix = origin.includes('localhost') ? '/m/assiddiq' : '';
    const window = {
      location: new URL(`${origin}${prefix}/teacher/classes?tab=mine`),
      dispatchEvent: event => events.push(event.type),
      history: { pushState: (_a, _b, destination) => { window.location = new URL(destination, origin); } },
      scrollTo() {},
    };
    const exports = {};
    vm.runInNewContext(navigationCode, {
      exports, window, URL, Event, process: { env: {} },
      require: name => {
        if (name === 'react') return {
          createContext: () => ({ Provider: 'provider' }), useCallback: fn => fn,
          useEffect() {}, useMemo: fn => fn(), useSyncExternalStore: (_subscribe, snapshot) => snapshot(),
        };
        if (name === 'react/jsx-runtime') return { jsx: (_type, props) => props };
        if (name === 'next/navigation') return {
          usePathname: () => window.location.pathname,
          useSearchParams: () => window.location.searchParams,
        };
        if (name.endsWith('/navigation-paths')) return paths;
        throw new Error(`Unexpected dependency ${name}`);
      },
    });
    const { value } = exports.WorkspaceNavigationProvider({ slug: 'assiddiq', section: 'teacher', children: null });
    assert.equal(value.navigate('/m/assiddiq/teacher/classes?tab=mine'), true);
    assert.deepEqual(events, ['tareeqah:workspace-reselect']);
    events.length = 0;
    assert.equal(value.navigate('/m/assiddiq/teacher/classes'), true);
    assert.deepEqual(events, ['tareeqah:workspace-location', 'tareeqah:workspace-reselect']);
    events.length = 0;
    assert.equal(value.navigate('/m/assiddiq/teacher'), true);
    assert.deepEqual(events, ['tareeqah:workspace-location']);
  });
}

function eventTarget() {
  const listeners = new Map();
  return {
    addEventListener: (name, fn) => listeners.set(name, fn),
    removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
    fire: name => listeners.get(name)?.(), listeners,
  };
}

test('Classes refreshes on return, reselect and app foreground, without hidden-page work', () => {
  const window = eventTarget();
  const document = Object.assign(eventTarget(), { visibilityState: 'visible' });
  const effects = [];
  const exports = {};
  let refreshes = 0;
  vm.runInNewContext(refreshCode, {
    exports, window, document,
    require: () => ({ useEffect: effect => effects.push(effect) }),
  });
  const refetch = async () => { refreshes++; };
  exports.useRefreshOnReturn(false, refetch);
  effects.pop()();
  assert.equal(refreshes, 0);
  exports.useRefreshOnReturn(true, refetch);
  const leave = effects.pop()();
  assert.equal(refreshes, 1);
  window.fire('tareeqah:workspace-reselect');
  assert.equal(refreshes, 2);
  document.visibilityState = 'hidden';
  document.fire('visibilitychange');
  assert.equal(refreshes, 2);
  document.visibilityState = 'visible';
  document.fire('visibilitychange');
  assert.equal(refreshes, 3);
  leave();
  window.fire('tareeqah:workspace-reselect');
  document.fire('visibilitychange');
  assert.equal(refreshes, 3);
  exports.useRefreshOnReturn(true, refetch);
  effects.pop()();
  assert.equal(refreshes, 4, 'a retained page refreshes on its next activation');
});

for (const fail of [false, true]) {
  test(`background refresh ${fail ? 'failure preserves the list' : 'updates counts without a loading screen'} and shares requests`, async () => {
    const effects = [];
    const state = [];
    const exports = {};
    const window = { dispatchEvent() {}, localStorage: { length: 0, setItem() {}, removeItem() {} } };
    vm.runInNewContext(cacheCode, {
      exports, window, CustomEvent: class {}, DOMException,
      require: () => ({
        useCallback: fn => fn, useRef: value => ({ current: value }),
        useEffect: effect => effects.push(effect),
        useState: initial => {
          const cell = { value: typeof initial === 'function' ? initial() : initial };
          state.push(cell);
          return [cell.value, update => { cell.value = typeof update === 'function' ? update(cell.value) : update; }];
        },
      }),
    });
    const key = 'teacher-programs:assiddiq:viewer';
    const oldCounts = { students: 15, pendingApplications: 3, pendingWithdrawals: 1 };
    exports.prefetchQuery(key, async () => oldCounts);
    await new Promise(resolve => setImmediate(resolve));
    let finish;
    let calls = 0;
    const query = exports.useCachedQuery(key, () => {
      calls++;
      return new Promise((resolve, reject) => { finish = fail ? reject : resolve; });
    });
    effects.forEach(effect => effect());
    assert.equal(query.loading, false);
    const first = query.refetch();
    const second = query.refetch();
    assert.equal(calls, 1, 'repeated taps share the in-flight refresh');
    assert.equal(state[1].value.data, oldCounts, 'old list remains visible while refreshing');
    assert.equal(state[1].value.loading, false);
    const newCounts = { students: 16, pendingApplications: 1, pendingWithdrawals: 0 };
    finish(fail ? new Error('temporarily unavailable') : newCounts);
    await Promise.all([first, second]);
    assert.equal(state[1].value.data, fail ? oldCounts : newCounts);
    assert.equal(state[1].value.loading, false);
    assert.equal(state[2].value, null, 'a failed background refresh does not replace useful content with an error screen');
  });
}
