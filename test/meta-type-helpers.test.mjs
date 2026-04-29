import { describe, it, expect } from "vitest";
import { chipHtml, fieldRowHtml, renderRoamMarkdown } from "../src/meta-type-helpers.mjs";

describe("chipHtml", () => {
  it("returns a span with meta-type-chip class, data-type attribute, and #TypeName text", () => {
    const html = chipHtml("Project");
    expect(html).toContain('class="meta-type-chip"');
    expect(html).toContain('data-type="Project"');
    expect(html).toContain(">#Project<");
  });

  it("escapes the typeName in the data-type attribute", () => {
    const html = chipHtml('Bad"Name');
    expect(html).not.toContain('data-type="Bad"Name"');
    expect(html).toContain("&quot;");
  });

  it("html-escapes < and > in plain text content", () => {
    const html = chipHtml("A<B>");
    expect(html).not.toMatch(/>#A<B>/);
    expect(html).toContain("&lt;");
    expect(html).toContain("&gt;");
  });
});

describe("fieldRowHtml", () => {
  it("renders a filled value with label, value, and data-block-uid", () => {
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
    expect(html).toContain("Doing");
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

  it("renders [[Page Name]] in the value via renderRoamMarkdown (rm-page-ref)", () => {
    const html = fieldRowHtml({
      label: "Topics",
      value: "[[Acme Corp]]",
      blockUid: "uid1",
      isEmpty: false,
    });
    expect(html).toContain("rm-page-ref");
    expect(html).toContain("Acme Corp");
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

describe("renderRoamMarkdown", () => {
  it("html-escapes raw &, <, > in plain text", () => {
    const out = renderRoamMarkdown("a & b < c > d");
    expect(out).toContain("&amp;");
    expect(out).toContain("&lt;");
    expect(out).toContain("&gt;");
  });

  it("renders [[Page Name]] as an rm-page-ref span", () => {
    const out = renderRoamMarkdown("see [[Acme]]");
    expect(out).toContain('class="rm-page-ref"');
    expect(out).toContain('data-page="Acme"');
    expect(out).toContain(">Acme<");
  });

  it("renders #Tag as an rm-page-ref span with leading #", () => {
    const out = renderRoamMarkdown("hello #Inbox today");
    expect(out).toContain('class="rm-page-ref"');
    expect(out).toContain('data-page="Inbox"');
    expect(out).toContain(">#Inbox<");
  });

  it("renders **bold** as <strong>", () => {
    const out = renderRoamMarkdown("this is **bold** text");
    expect(out).toContain("<strong>bold</strong>");
  });

  it("renders __italic__ as <em>", () => {
    const out = renderRoamMarkdown("this is __italic__ text");
    expect(out).toContain("<em>italic</em>");
  });

  it("renders [text](url) as an anchor with target=_blank", () => {
    const out = renderRoamMarkdown("see [docs](https://example.com)");
    expect(out).toContain('href="https://example.com"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain(">docs</a>");
  });

  it("auto-links a bare https URL", () => {
    const out = renderRoamMarkdown("https://example.com/path");
    expect(out).toContain('href="https://example.com/path"');
    expect(out).toContain('target="_blank"');
    expect(out).toContain(">https://example.com/path</a>");
  });

  it("auto-links a bare http URL", () => {
    const out = renderRoamMarkdown("http://example.com");
    expect(out).toContain('href="http://example.com"');
  });

  it("preserves URL fragments instead of mangling them as hashtags", () => {
    const out = renderRoamMarkdown("https://example.com/page#section");
    expect(out).toContain('href="https://example.com/page#section"');
    expect(out).not.toContain('data-page="section"');
  });

  it("does not double-link URLs already inside markdown links", () => {
    const out = renderRoamMarkdown("[docs](https://example.com)");
    const anchorMatches = out.match(/<a /g) || [];
    expect(anchorMatches.length).toBe(1);
  });

  it("stops click propagation on auto-linked URLs so the row does not enter edit mode", () => {
    const out = renderRoamMarkdown("https://example.com");
    expect(out).toContain('onclick="event.stopPropagation()"');
  });
});
