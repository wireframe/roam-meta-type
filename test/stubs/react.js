// Stub for vitest: src/settings-panel.js imports React and Blueprint at module
// load. Tests only exercise the pure helpers (parseFieldsInput, etc.), so this
// stub provides just enough surface to satisfy the import. The build pipeline
// (bin/build.mjs) does NOT use these stubs — it externalizes "react" to
// window.React via the roam-globals esbuild plugin.
const React = {
  createElement: () => null,
  Fragment: Symbol("Fragment"),
};
export default React;
// useState's setter is a no-op in this stub; component-level tests are not supported.
// Helpers are tested via vitest-direct imports; the component is verified manually in Roam.
export const useState = (initial) => [
  typeof initial === "function" ? initial() : initial,
  () => {},
];
export const useEffect = () => {};
export const useCallback = (fn) => fn;
export const useMemo = (fn) => fn();
export const useRef = (v) => ({ current: v });
export const createElement = React.createElement;
export const Fragment = React.Fragment;
