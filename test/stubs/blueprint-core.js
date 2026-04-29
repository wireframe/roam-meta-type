// Stub for vitest: see test/stubs/react.js for rationale.
// The build pipeline maps "@blueprintjs/core" to window.Blueprint.Core via the
// roam-globals esbuild plugin and does not consult these stubs.
const stub = (name) => {
  const fn = () => null;
  fn.displayName = name;
  return fn;
};
export const Button = stub("Button");
export const Card = stub("Card");
export const InputGroup = stub("InputGroup");
export const TextArea = stub("TextArea");
export default { Button, Card, InputGroup, TextArea };
