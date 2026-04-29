export function createTeardownRegistry() {
  const cleanups = [];

  function register(fn) {
    cleanups.push(fn);
  }

  function runAll() {
    while (cleanups.length > 0) {
      runSafely(cleanups.pop());
    }
  }

  return { register, runAll };
}

function runSafely(fn) {
  try {
    fn();
  } catch (error) {
    console.error("teardown-registry: cleanup threw", error);
  }
}
