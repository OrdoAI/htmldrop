// The one-line summary printed to stderr after an upload in an interactive
// TTY. Kept pure (response JSON in, string out) so tests can cover both expiry
// modes without a terminal.

function day(iso) {
  return typeof iso === "string" && iso ? iso.split("T")[0] : "";
}

// `expiresAt` is null for an operator-pinned page, which never expires. For a
// renew-on-view page it is the date the page goes if nobody opens it, and
// `renewUntil` is the hard cap no amount of visits extends past.
export function formatExpiry(data) {
  const expires = day(data?.expiresAt);
  if (!expires) return "never";
  if (data.renewOnView !== true) return expires;
  const until = day(data.renewUntil);
  return `${expires} if unopened (renews on visit${until ? `, until ${until}` : ""})`;
}

export function formatStatusLine(data, { updated = false, note: extra = "" } = {}) {
  let note = (updated ? " | updated in place" : "") + extra;
  if (data?.public) note += " | public";
  return `  id: ${data?.id} | expires: ${formatExpiry(data)}${note}`;
}
