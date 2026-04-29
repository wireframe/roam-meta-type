// Stub for vitest: see test/stubs/react.js for rationale.
// The build pipeline maps "@blueprintjs/core" to window.Blueprint.Core via the
// roam-globals esbuild plugin and does not consult these stubs.
const stub = (name) => {
  const fn = () => null;
  fn.displayName = name;
  return fn;
};
export const Button = stub("Button");
export const InputGroup = stub("InputGroup");
export const HTMLTable = stub("HTMLTable");
export const Dialog = stub("Dialog");
export const FormGroup = stub("FormGroup");
export const Tooltip = stub("Tooltip");
export const Icon = stub("Icon");
export const Intent = { NONE: "none", PRIMARY: "primary", DANGER: "danger" };
export default { Button, InputGroup, HTMLTable, Dialog, FormGroup, Tooltip, Icon, Intent };
