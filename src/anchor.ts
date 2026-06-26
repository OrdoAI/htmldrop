// Text-quote anchoring. A comment stores the selected text (`exact`) plus a
// short slice of the text immediately before (`prefix`) and after (`suffix`).
// On load the widget rebuilds the document's text and asks `locateQuote` where
// the quote now lives, so anchors survive an in-place re-upload as long as the
// quoted text is still present. When the text changed or moved ambiguously the
// quote cannot be located and the comment is shown as an orphan.
//
// This is the single source of truth for quote location: it is unit-tested
// here and injected verbatim (via `Function.prototype.toString`) into the
// browser widget, so the tested logic is the shipped logic. Keep it a pure,
// fully self-contained function over strings only (no DOM, no module-scope
// references) or the toString injection breaks.

export interface QuoteAnchor {
  exact: string;
  prefix: string;
  suffix: string;
}

export interface QuoteRange {
  start: number;
  end: number;
}

// ponytail: exact (raw, no whitespace normalization) matching only. A re-upload
// that changes whitespace inside/around the quote orphans the comment, which is
// the accepted v1 degradation. Add whitespace-normalized + fuzzy matching if the
// orphan rate proves annoying.
export function locateQuote(fullText: string, anchor: QuoteAnchor): QuoteRange | null {
  const exact = anchor.exact;
  if (!exact) return null;

  const occurrences: number[] = [];
  for (let i = fullText.indexOf(exact); i !== -1; i = fullText.indexOf(exact, i + 1)) {
    occurrences.push(i);
  }
  if (occurrences.length === 0) return null;

  const prefix = anchor.prefix ?? "";
  const suffix = anchor.suffix ?? "";

  // Prefer the single occurrence whose surrounding text matches the stored
  // prefix/suffix. This disambiguates quotes that repeat in the document.
  const contextMatches = occurrences.filter((start) => {
    const end = start + exact.length;
    const before = fullText.substring(Math.max(0, start - prefix.length), start);
    const after = fullText.substring(end, end + suffix.length);
    return (prefix === "" || before === prefix) && (suffix === "" || after === suffix);
  });
  if (contextMatches.length === 1) {
    return { start: contextMatches[0], end: contextMatches[0] + exact.length };
  }

  // Fall back to exact-only, but only when the exact text is unique. An
  // ambiguous exact-only match is treated as an orphan rather than guessed.
  if (occurrences.length === 1) {
    return { start: occurrences[0], end: occurrences[0] + exact.length };
  }

  return null;
}

export interface CopyComment {
  cid: string;
  parentId?: string;
  anchor?: QuoteAnchor | null;
  author: string;
  text: string;
  resolved: boolean;
}

// Appends a plain-text "Comments" section to the text that "Copy for LLM"
// already copies, so an LLM reading the copy sees the review threads with line
// anchors. Root comments are located in `text` via the injected `locate`
// (so it reuses the exact same quote logic) and rendered as 1-based line
// numbers, or `orphan` when the quote no longer matches. Replies follow their
// root; resolved threads are included and marked. Returns `text` unchanged when
// there are no comments. Plain string assembly only: no HTML, nothing to inject.
//
// `locate` is passed in (not referenced from module scope) so this stays fully
// self-contained and can be injected into the browser widget via
// `Function.prototype.toString` alongside `locateQuote`.
export function formatCommentsForCopy(
  text: string,
  comments: CopyComment[],
  locate: (fullText: string, anchor: QuoteAnchor) => QuoteRange | null,
): string {
  const roots = comments.filter((c) => !c.parentId);
  if (roots.length === 0) return text;

  const lines = text.split("\n");
  const lineAt = (offset: number): number => {
    let cursor = 0;
    for (let i = 0; i < lines.length; i++) {
      const span = lines[i].length + 1; // +1 for the newline
      if (offset < cursor + span) return i + 1;
      cursor += span;
    }
    return lines.length || 1;
  };

  const out: string[] = [];
  let n = 0;
  for (const root of roots) {
    n += 1;
    let where = "orphan";
    if (root.anchor) {
      const loc = locate(text, root.anchor);
      if (loc) {
        const a = lineAt(loc.start);
        const b = lineAt(Math.max(loc.start, loc.end - 1));
        where = a === b ? `line ${a}` : `lines ${a}-${b}`;
      }
    }
    out.push(`[Comment C${n}] ${where}`);
    if (root.anchor && root.anchor.exact) out.push(`Quote: "${root.anchor.exact}"`);
    out.push(`Author: ${root.author || "匿名"}`);
    out.push(`Status: ${root.resolved ? "resolved" : "open"}`);
    out.push(`Text: ${root.text}`);
    const replies = comments.filter((c) => c.parentId === root.cid);
    if (replies.length > 0) {
      out.push("Replies:");
      for (const r of replies) out.push(`- ${r.author || "匿名"}: ${r.text}`);
    }
    out.push("");
  }

  return `${text}\n\n---\nComments\n\n${out.join("\n").replace(/\n+$/, "\n")}`;
}
