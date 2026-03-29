export function parseArgs(argv = process.argv.slice(2)) {
  const args = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split("=", 2);
    const key = rawKey.trim();

    if (!key) {
      continue;
    }

    if (inlineValue !== undefined) {
      args[key] = inlineValue;
      continue;
    }

    const next = argv[index + 1];

    if (!next || next.startsWith("--")) {
      args[key] = true;
      continue;
    }

    args[key] = next;
    index += 1;
  }

  return args;
}

export function getNumberArg(args, key, fallback) {
  if (!(key in args)) {
    return fallback;
  }

  const value = Number(args[key]);

  if (!Number.isFinite(value)) {
    throw new Error(`Invalid numeric value for --${key}: ${args[key]}`);
  }

  return value;
}

export function printUsage(lines) {
  for (const line of lines) {
    console.log(line);
  }
}
