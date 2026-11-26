import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import ts from 'typescript';

for (const [file, component] of [
  ['portal-route-guard', 'PortalRouteGuard'],
  ['teacher-route-guard', 'TeacherRouteGuard'],
  ['admin-route-guard', 'AdminRouteGuard'],
]) {
  const code = ts.transpileModule(await readFile(new URL(`../src/components/auth/${file}.tsx`, import.meta.url), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  for (const hostname of ['localhost', 'assiddiq.madrasa.ca']) {
    test(`${component}: a signed-out history entry returns to guest Classes on ${hostname}`, async () => {
      const effects = []; const destinations = []; const rendered = [];
      const exports = {};
      const empty = () => null;
      vm.runInNewContext(code, {
        exports, window: { location: { hostname } }, setTimeout, clearTimeout,
        require: name => {
          if (name === 'react') return { useEffect: effect => effects.push(effect), useState: initial => [initial, () => {}] };
          if (name === 'react/jsx-runtime') return { jsx: (type, props) => { rendered.push(type); return { type, props }; } };
          if (name === 'next/navigation') return { useRouter: () => ({ replace: href => destinations.push(href) }), usePathname: () => '/m/assiddiq/teacher/classes' };
          if (name === 'next/link') return { default: empty };
          if (name.endsWith('/client-cache')) return { loadCachedSession: async () => null, loadCachedUserAccess: async () => { throw new Error('Guest should not fetch permissions'); } };
          if (name.endsWith('/authz')) return { emptyUserAccess: {} };
          if (name.endsWith('/navigation-paths')) return { browserHref: href => hostname === 'localhost' ? href : href.replace('/m/assiddiq', '') };
          if (name.endsWith('/use-session-identity')) return { useSessionIdentity: () => null };
          if (name.endsWith('/data-loading')) return { QuietPageLoadingState: empty };
          if (name.endsWith('/account-connection-error')) return { AccountConnectionError: empty, accountConnectionMessage: 'Connection unavailable' };
          throw new Error(`Unexpected dependency ${name}`);
        },
      });
      const privateContent = Symbol('private-content');
      const screen = exports[component]({ children: privateContent, slug: 'assiddiq' });
      assert.notEqual(screen.props.children, privateContent);
      const cleanups = effects.map(effect => effect());
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(destinations, [hostname === 'localhost' ? '/m/assiddiq/programs' : '/programs']);
      cleanups.forEach(cleanup => cleanup?.());
    });
  }
}
