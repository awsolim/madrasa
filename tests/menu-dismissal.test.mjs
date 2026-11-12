import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

const source = await readFile(new URL('../src/hooks/use-dismiss-menu.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function fixture(open = true) {
  const handlers = new Map();
  const removals = [];
  const target = name => ({
    addEventListener(type, callback, capture) { handlers.set(`${name}:${type}`, { callback, capture }); },
    removeEventListener(type, callback, capture) {
      assert.equal(handlers.get(`${name}:${type}`).callback, callback);
      assert.equal(handlers.get(`${name}:${type}`).capture, capture);
      removals.push(`${name}:${type}`);
    },
  });
  let cleanup, dismissed = 0, focused = 0;
  const trigger = { matches: () => true, focus: () => focused++ };
  const panel = {};
  const exports = {};
  vm.runInNewContext(compiled, { exports, document: target('document'), window: target('window'),
    require: () => ({ useEffect: effect => { cleanup = effect(); } }),
  });
  exports.useDismissMenu(open, [{ current: trigger }, { current: panel }], () => dismissed++);
  return { trigger, panel, handlers, removals, cleanup,
    fire: (type, event) => handlers.get(type).callback(event),
    dismissed: () => dismissed, focused: () => focused,
  };
}

test('touch/click outside dismisses without cancelling the underlying action; trigger and portal stay interactive', () => {
  const menu = fixture();
  assert.equal(menu.handlers.get('document:pointerdown').capture, true);
  menu.fire('document:pointerdown', { composedPath: () => [menu.trigger] });
  menu.fire('document:pointerdown', { composedPath: () => [{}, menu.panel] });
  assert.equal(menu.dismissed(), 0);
  // No preventDefault/stopPropagation supplied: neither may be used.
  menu.fire('document:pointerdown', { composedPath: () => [{}] });
  assert.equal(menu.dismissed(), 1);
});

test('Escape restores trigger focus; keyboard focus outside and navigation dismiss', () => {
  const menu = fixture();
  menu.fire('document:keydown', { key: 'ArrowDown' });
  assert.equal(menu.dismissed(), 0);
  menu.fire('document:keydown', { key: 'Escape' });
  assert.equal(menu.focused(), 1);
  menu.fire('document:focusin', { composedPath: () => [menu.panel] });
  assert.equal(menu.dismissed(), 1);
  menu.fire('document:focusin', { composedPath: () => [{}] });
  menu.fire('window:tareeqah:workspace-location', {});
  menu.fire('window:tareeqah:nav-preview', {});
  assert.equal(menu.dismissed(), 4);
});

test('closed menus attach no listeners; unmount removes every listener', () => {
  assert.equal(fixture(false).handlers.size, 0);
  const menu = fixture();
  menu.cleanup();
  assert.equal(menu.removals.length, menu.handlers.size);
});
