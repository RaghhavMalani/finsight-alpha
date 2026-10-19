function fail(message: string): never {
  throw new Error(message);
}

/** Decode before JSON.parse could discard duplicate keys; no permissive reviver. */
export function strictJSON(text: string): unknown {
  let at = 0;
  const space = () => {
    while (/[ \t\n\r]/.test(text[at] ?? "") && at < text.length) at++;
  };
  const string = (): string => {
    const start = at++;
    while (at < text.length) {
      const char = text[at++];
      if (char === "\\") {
        at++;
        continue;
      }
      if (char === '"') return JSON.parse(text.slice(start, at)) as string;
    }
    return fail("Unterminated JSON string.");
  };
  const value = (): unknown => {
    space();
    if (text[at] === '"') return string();
    if (text[at] === "{") {
      at++;
      space();
      const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
      if (text[at] === "}") {
        at++;
        return result;
      }
      while (at < text.length) {
        space();
        if (text[at] !== '"') fail("Object key required.");
        const key = string();
        space();
        if (Object.hasOwn(result, key)) fail("Duplicate JSON key.");
        if (text[at++] !== ":") fail("JSON colon required.");
        result[key] = value();
        space();
        const delimiter = text[at++];
        if (delimiter === "}") return result;
        if (delimiter !== ",") fail("JSON object delimiter required.");
      }
      return fail("Unterminated JSON object.");
    }
    if (text[at] === "[") {
      at++;
      space();
      const result: unknown[] = [];
      if (text[at] === "]") {
        at++;
        return result;
      }
      while (at < text.length) {
        result.push(value());
        space();
        const delimiter = text[at++];
        if (delimiter === "]") return result;
        if (delimiter !== ",") fail("JSON array delimiter required.");
      }
      return fail("Unterminated JSON array.");
    }
    const token = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(
      text.slice(at),
    );
    if (!token) return fail("Invalid JSON token.");
    at += token[0].length;
    const result: unknown = JSON.parse(token[0]);
    if (typeof result === "number" && !Number.isFinite(result)) fail("Nonfinite JSON.");
    return result;
  };
  const result = value();
  space();
  if (at !== text.length) fail("Trailing JSON content.");
  return result;
}
