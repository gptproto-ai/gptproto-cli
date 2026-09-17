export interface ParsedArgs {
  readonly positionals: string[];
  readonly options: Map<string, string[]>;
  readonly flags: Set<string>;
}

export function parseArgs(tokens: readonly string[]): ParsedArgs {
  const positionals: string[] = [];
  const options = new Map<string, string[]>();
  const flags = new Set<string>();

  const addOption = (name: string, value: string): void => {
    const values = options.get(name) ?? [];
    values.push(value);
    options.set(name, values);
  };

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token === "--") {
      positionals.push(...tokens.slice(index + 1));
      break;
    }
    if (token.startsWith("--")) {
      const raw = token.slice(2);
      const equalsIndex = raw.indexOf("=");
      if (equalsIndex !== -1) {
        addOption(raw.slice(0, equalsIndex), raw.slice(equalsIndex + 1));
        continue;
      }
      const next = tokens[index + 1];
      if (next !== undefined && !next.startsWith("-")) {
        addOption(raw, next);
        index += 1;
      } else {
        flags.add(raw);
      }
      continue;
    }
    if (token.startsWith("-") && token.length > 1) {
      for (const flag of token.slice(1)) {
        flags.add(flag);
      }
      continue;
    }
    positionals.push(token);
  }

  return { positionals, options, flags };
}

export function option(
  args: ParsedArgs,
  ...names: readonly string[]
): string | undefined {
  for (const name of names) {
    const values = args.options.get(name);
    if (values && values.length > 0) {
      return values[values.length - 1];
    }
  }
  return undefined;
}

export function options(
  args: ParsedArgs,
  ...names: readonly string[]
): string[] {
  for (const name of names) {
    const values = args.options.get(name);
    if (values && values.length > 0) {
      return [...values];
    }
  }
  return [];
}

export function hasFlag(args: ParsedArgs, ...names: readonly string[]): boolean {
  return names.some((name) => {
    const value = option(args, name);
    return args.flags.has(name) || value === "true";
  });
}
