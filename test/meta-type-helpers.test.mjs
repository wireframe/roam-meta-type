import { describe, it, expect } from "vitest";
import { chipHtml, fieldRowHtml } from "../src/meta-type-helpers.mjs";

describe("chipHtml", () => {
  it("returns a span with meta-type-chip class, data-type attribute, and #TypeName text", () => {
    const html = chipHtml("Project", null);
    expect(html).toContain('class="meta-type-chip"');
    expect(html).toContain('data-type="Project"');
    expect(html).toContain(">#Project<");
  });

  it("escapes the typeName in the data-type attribute", () => {
    const html = chipHtml('Bad"Name', null);
    expect(html).not.toContain('data-type="Bad"Name"');
    expect(html).toContain("&quot;");
  });

  it("html-escapes < and > in plain text content", () => {
    const html = chipHtml("A<B>", null);
    expect(html).not.toMatch(/>#A<B>/);
    expect(html).toContain("&lt;");
    expect(html).toContain("&gt;");
  });

  it("renders inline style with accent", () => {
    const html = chipHtml("Project", { h: 158, s: 50 });
    expect(html).toContain('style="--chip-h:158;--chip-s:50%"');
  });
});

describe("fieldRowHtml", () => {
  it("renders a row scaffold with label, empty value cell, and data-block-uid", () => {
    const html = fieldRowHtml({
      label: "Status",
      value: "Doing",
      blockUid: "abc123",
      isEmpty: false,
    });
    expect(html).toContain('class="meta-type-field"');
    expect(html).toContain('data-block-uid="abc123"');
    expect(html).toContain('class="meta-type-field-label"');
    expect(html).toContain(">Status<");
    expect(html).toContain('class="meta-type-field-value"');
    // Value is populated post-mount via renderString — not in the scaffold.
    expect(html).not.toContain("Doing");
  });

  it("renders an empty value with em-dash and meta-type-empty class", () => {
    const html = fieldRowHtml({
      label: "Status",
      value: "",
      blockUid: null,
      isEmpty: true,
    });
    expect(html).toContain("meta-type-empty");
    expect(html).toContain("—");
  });

  it("does not include a populated data-block-uid when isEmpty and blockUid is null", () => {
    const html = fieldRowHtml({
      label: "Status",
      value: "",
      blockUid: null,
      isEmpty: true,
    });
    expect(html).not.toMatch(/data-block-uid="[^"]+"/);
  });

  it("escapes the label text", () => {
    const html = fieldRowHtml({
      label: "A<B>",
      value: "ok",
      blockUid: "u",
      isEmpty: false,
    });
    expect(html).toContain("A&lt;B&gt;");
  });
});
