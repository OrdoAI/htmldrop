import { describe, it, expect } from "vitest";
import { type CopyComment, formatCommentsForCopy, locateQuote } from "../anchor";

describe("locateQuote", () => {
  it("returns the range for a context (prefix/suffix) match", () => {
    const text = "the quick brown fox jumps over";
    expect(locateQuote(text, { exact: "brown", prefix: "quick ", suffix: " fox" })).toEqual({
      start: 10,
      end: 15,
    });
  });

  it("falls back to exact-only when the exact text is unique", () => {
    const text = "alpha beta gamma";
    expect(locateQuote(text, { exact: "gamma", prefix: "", suffix: "" })).toEqual({
      start: 11,
      end: 16,
    });
  });

  it("returns null for ambiguous exact-only matches", () => {
    const text = "go here then go there";
    expect(locateQuote(text, { exact: "go", prefix: "", suffix: "" })).toBeNull();
  });

  it("disambiguates repeated exact text by prefix/suffix", () => {
    const text = "go here then go there";
    // second "go" is preceded by "then " and followed by " there"
    expect(locateQuote(text, { exact: "go", prefix: "then ", suffix: " there" })).toEqual({
      start: 13,
      end: 15,
    });
  });

  it("returns null when the quote is gone", () => {
    expect(locateQuote("nothing matches", { exact: "missing", prefix: "", suffix: "" })).toBeNull();
  });

  it("returns null for an empty exact", () => {
    expect(locateQuote("abc", { exact: "", prefix: "", suffix: "" })).toBeNull();
  });
});

describe("formatCommentsForCopy", () => {
  const text = "line one\nline two has a quote here\nline three";

  it("returns the text unchanged when there are no comments", () => {
    expect(formatCommentsForCopy(text, [], locateQuote)).toBe(text);
  });

  it("renders a located anchor as a 1-based line number", () => {
    const comments: CopyComment[] = [
      {
        cid: "c1",
        anchor: { exact: "a quote", prefix: "two has ", suffix: " here" },
        author: "Alice",
        text: "please clarify",
        resolved: false,
      },
    ];
    const out = formatCommentsForCopy(text, comments, locateQuote);
    expect(out.startsWith(text)).toBe(true);
    expect(out).toContain("---\nComments");
    expect(out).toContain("[Comment C1] line 2");
    expect(out).toContain('Quote: "a quote"');
    expect(out).toContain("Author: Alice");
    expect(out).toContain("Status: open");
    expect(out).toContain("Text: please clarify");
  });

  it("spans multiple lines as lines X-Y", () => {
    const comments: CopyComment[] = [
      { cid: "c1", anchor: { exact: "quote here\nline three", prefix: "", suffix: "" }, author: "A", text: "t", resolved: false },
    ];
    expect(formatCommentsForCopy(text, comments, locateQuote)).toContain("[Comment C1] lines 2-3");
  });

  it("marks an explicit null anchor as orphan", () => {
    const comments: CopyComment[] = [
      { cid: "c1", anchor: null, author: "A", text: "general note", resolved: false },
    ];
    expect(formatCommentsForCopy(text, comments, locateQuote)).toContain("[Comment C1] orphan");
  });

  it("marks an unlocatable anchor as orphan", () => {
    const comments: CopyComment[] = [
      { cid: "c1", anchor: { exact: "not in the text", prefix: "", suffix: "" }, author: "A", text: "t", resolved: false },
    ];
    expect(formatCommentsForCopy(text, comments, locateQuote)).toContain("[Comment C1] orphan");
  });

  it("includes resolved threads and marks status", () => {
    const comments: CopyComment[] = [
      { cid: "c1", anchor: null, author: "A", text: "done", resolved: true },
    ];
    expect(formatCommentsForCopy(text, comments, locateQuote)).toContain("Status: resolved");
  });

  it("nests replies under their root comment", () => {
    const comments: CopyComment[] = [
      { cid: "c1", anchor: null, author: "Alice", text: "question", resolved: false },
      { cid: "r1", parentId: "c1", author: "Bob", text: "answer", resolved: false },
    ];
    const out = formatCommentsForCopy(text, comments, locateQuote);
    expect(out).toContain("Replies:");
    expect(out).toContain("- Bob: answer");
  });
});
