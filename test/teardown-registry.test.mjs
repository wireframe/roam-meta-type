import { describe, it, expect, vi } from "vitest";
import { createTeardownRegistry } from "../src/teardown-registry.mjs";

describe("createTeardownRegistry", () => {
  it("runs a registered function exactly once when runAll is called", () => {
    const registry = createTeardownRegistry();
    const fn = vi.fn();
    registry.register(fn);

    registry.runAll();

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("runs registered functions in reverse (LIFO) order", () => {
    const registry = createTeardownRegistry();
    const calls = [];
    registry.register(() => calls.push("A"));
    registry.register(() => calls.push("B"));

    registry.runAll();

    expect(calls).toEqual(["B", "A"]);
  });

  it("continues running earlier-registered cleanups when a later one throws", () => {
    const registry = createTeardownRegistry();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const calls = [];
    registry.register(() => calls.push("first"));
    registry.register(() => {
      throw new Error("boom");
    });
    registry.register(() => calls.push("third"));

    expect(() => registry.runAll()).not.toThrow();

    expect(calls).toEqual(["third", "first"]);
    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("clears the registry after runAll so a second runAll is a no-op", () => {
    const registry = createTeardownRegistry();
    const fn = vi.fn();
    registry.register(fn);

    registry.runAll();
    registry.runAll();

    expect(fn).toHaveBeenCalledTimes(1);
  });
});
