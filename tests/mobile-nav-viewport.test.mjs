import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const code = ts.transpileModule(await readFile(new URL('../src/hooks/use-mobile-nav-viewport.ts', import.meta.url), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness({ active = true, visualViewport = true } = {}) {
  function events() {
    const listeners = new Map();
    return {
      addEventListener: (name, fn) => listeners.set(name, fn),
      removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); },
      fire: name => listeners.get(name)?.(),
      listeners,
    };
  }
  const viewport = Object.assign(events(), { offsetTop: 0, height: 844, scale: 1 });
  const frames = new Map();
  const timers = new Map();
  let nextFrame = 0;
  const window = Object.assign(events(), {
    innerHeight: 844,
    visualViewport: visualViewport ? viewport : null,
    requestAnimationFrame: fn => { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: id => frames.delete(id),
    setTimeout: fn => { timers.set(++nextFrame, fn); return nextFrame; },
    clearTimeout: id => timers.delete(id),
  });
  const document = Object.assign(events(), { documentElement: { clientHeight: 844 } });
  const values = new Map();
  const writes = [];
  const ref = { current: { style: {
    setProperty: (name, value) => { values.set(name, value); writes.push(value); },
    removeProperty: name => values.delete(name),
  } } };
  const effects = [];
  const exports = {};
  vm.runInNewContext(code, {
    exports, window, document,
    require: name => {
      if (name === 'react') return { useEffect: effect => effects.push(effect) };
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  exports.useMobileNavViewport(ref, active);
  const cleanup = effects[0]();
  return {
    window, document, viewport, frames, timers, writes, values, cleanup,
    bottom: () => values.get('--mobile-nav-viewport-bottom'),
    flush: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); },
    settle: () => { const pending = [...timers.values()]; timers.clear(); pending.forEach(fn => fn()); },
  };
}

test('keyboard and stale visual viewport measurements cannot strand the navbar mid-screen', () => {
  const h = harness();
  assert.equal(h.bottom(), '844px');
  h.viewport.height = 450;
  h.viewport.offsetTop = 70;
  h.window.innerHeight = 450;
  h.viewport.fire('resize');
  h.flush();
  assert.equal(h.bottom(), '844px');
  h.viewport.height = 844;
  h.viewport.offsetTop = 0;
  h.window.innerHeight = 844;
  h.document.fire('focusout');
  h.viewport.fire('resize');
  h.flush();
  assert.equal(h.bottom(), '844px');
  h.cleanup();
});

test('coalesces scroll events and avoids unnecessary style writes', () => {
  const h = harness();
  h.window.fire('scroll');
  h.viewport.fire('scroll');
  h.viewport.fire('resize');
  assert.equal(h.frames.size, 1);
  h.flush();
  assert.equal(h.writes.length, 1);
  h.viewport.offsetTop = 12;
  h.viewport.fire('scroll');
  h.flush();
  assert.equal(h.bottom(), '844px');
  h.cleanup();
});

test('rechecks on app restoration and orientation changes', () => {
  for (const event of ['pageshow', 'orientationchange', 'visibilitychange']) {
    const h = harness();
    h.viewport.height = 390;
    h.document.documentElement.clientHeight = 390;
    h.window.innerHeight = 390;
    (event === 'visibilitychange' ? h.document : h.window).fire(event);
    h.flush();
    assert.equal(h.bottom(), '390px');
    h.cleanup();
  }
});

test('falls back without VisualViewport and does not follow pinch zoom', () => {
  const fallback = harness({ visualViewport: false });
  fallback.window.innerHeight = 700;
  fallback.document.documentElement.clientHeight = 700;
  fallback.window.fire('resize');
  fallback.flush();
  assert.equal(fallback.bottom(), '700px');
  fallback.cleanup();
  const zoomed = harness();
  zoomed.viewport.scale = 2;
  zoomed.viewport.height = 422;
  zoomed.viewport.offsetTop = 100;
  zoomed.viewport.fire('resize');
  zoomed.flush();
  assert.equal(zoomed.bottom(), '844px');
  zoomed.cleanup();
});

test('ignores invalid measurements and cancels pending work on removal', () => {
  const h = harness();
  h.document.documentElement.clientHeight = Number.NaN;
  h.window.innerHeight = Number.NaN;
  h.viewport.fire('resize');
  h.flush();
  assert.equal(h.bottom(), '844px');
  h.viewport.fire('scroll');
  h.cleanup();
  assert.equal(h.frames.size, 0);
  assert.equal(h.timers.size, 0);
  assert.equal(h.values.size, 0);
  for (const target of [h.window, h.document, h.viewport]) assert.equal(target.listeners.size, 0);
});

test('focusout rechecks after Safari settles without needing another resize event', () => {
  const h = harness();
  h.document.documentElement.clientHeight = 450;
  h.window.innerHeight = 450;
  h.document.fire('focusout');
  h.flush();
  assert.equal(h.bottom(), '450px');
  h.document.documentElement.clientHeight = 844;
  h.window.innerHeight = 844;
  // The visual viewport is still stale; the delayed recovery uses full layout.
  h.viewport.height = 450;
  h.settle();
  h.flush();
  assert.equal(h.bottom(), '844px');
  assert.equal(h.timers.size, 0);
  assert.equal(h.frames.size, 0);
  h.cleanup();
});

test('does not attach viewport work when navigation is hidden', () => {
  const h = harness({ active: false });
  assert.equal(h.bottom(), undefined);
  assert.equal(h.window.listeners.size, 0);
  assert.equal(h.viewport.listeners.size, 0);
});
