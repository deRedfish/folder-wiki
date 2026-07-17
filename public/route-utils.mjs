export function articleHash(path, heading = "") {
  const base = `#article/${encodeURIComponent(path)}`;
  return heading ? `${base}?heading=${encodeURIComponent(heading)}` : base;
}

export function parseRouteHash(hash = "#home") {
  const raw = (hash || "#home").replace(/^#/, "");
  const slash = raw.indexOf("/");
  const routeName = slash === -1 ? raw : raw.slice(0, slash);
  const tail = slash === -1 ? "" : raw.slice(slash + 1);
  const queryAt = tail.indexOf("?");
  const encoded = queryAt === -1 ? tail : tail.slice(0, queryAt);
  const query = queryAt === -1 ? "" : tail.slice(queryAt + 1);
  return { routeName, encoded, heading: new URLSearchParams(query).get("heading") || "" };
}
