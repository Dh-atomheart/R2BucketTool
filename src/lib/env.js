import { existsSync, readFileSync } from "node:fs";

export function loadEnvFile(pathname) {
  const loaded = readEnvFile(pathname);

  for (const [key, value] of Object.entries(loaded)) {
    if (!(key in process.env)) {
      process.env[key] = value;
    }
  }

  return loaded;
}

export function readEnvFile(pathname) {
  if (!pathname || !existsSync(pathname)) {
    return {};
  }

  return parseEnvText(readFileSync(pathname, "utf8"));
}

export function parseEnvText(text) {
  const loaded = {};

  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");

    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();
    const value = stripWrappingQuotes(rawValue);

    if (!key) {
      continue;
    }

    loaded[key] = value;
  }

  return loaded;
}

function stripWrappingQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }

  return value;
}
