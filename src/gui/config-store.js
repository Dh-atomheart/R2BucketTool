import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { DEFAULT_CACHE_CONTROL } from "../lib/constants.js";
import { readEnvFile } from "../lib/env.js";

export const GUI_CONFIG_FILENAME = ".r2buckettool.gui.json";
export const GUI_CONFIG_KEYS = Object.freeze([
  "R2_ACCOUNT_ID",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_BASE_URL",
  "R2_KEY_PREFIX",
  "R2_CACHE_CONTROL",
]);
export const GUI_SECRET_KEYS = new Set(["R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY"]);
export const UPLOAD_REQUIRED_KEYS = Object.freeze([
  "R2_ACCOUNT_ID",
  "R2_BUCKET",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_PUBLIC_BASE_URL",
]);
export const DELIVERY_REQUIRED_KEYS = Object.freeze(["R2_PUBLIC_BASE_URL"]);

const DEFAULTS = Object.freeze({
  R2_KEY_PREFIX: "photos",
  R2_CACHE_CONTROL: DEFAULT_CACHE_CONTROL,
});

export async function readGuiConfig({ cwd = process.cwd(), configPath = getGuiConfigPath(cwd) } = {}) {
  try {
    const text = await readFile(configPath, "utf8");
    const parsed = JSON.parse(text);

    return normalizeConfigObject(parsed);
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

export async function writeGuiConfig(values, { cwd = process.cwd(), configPath = getGuiConfigPath(cwd) } = {}) {
  await mkdir(path.dirname(configPath), { recursive: true });
  await writeFile(configPath, `${JSON.stringify(normalizeConfigObject(values), null, 2)}\n`, "utf8");
}

export async function saveGuiConfigInput(input, { cwd = process.cwd(), configPath = getGuiConfigPath(cwd) } = {}) {
  const existing = await readGuiConfig({ cwd, configPath });
  const next = mergeGuiConfigInput(existing, input);

  await writeGuiConfig(next, { cwd, configPath });

  return next;
}

export async function resolveGuiConfig({ cwd = process.cwd(), env = process.env } = {}) {
  const configPath = getGuiConfigPath(cwd);
  const guiConfig = await readGuiConfig({ cwd, configPath });
  const envFileConfig = readEnvFile(path.join(cwd, ".env"));
  const effective = {};
  const sources = {};

  for (const key of GUI_CONFIG_KEYS) {
    const resolved = resolveValueForKey(key, guiConfig, envFileConfig, env);
    effective[key] = resolved.value;
    sources[key] = resolved.source;
  }

  return {
    configPath,
    guiConfig,
    envFileConfig,
    effectiveConfig: effective,
    sources,
    missingUploadFields: findMissingFields(effective, UPLOAD_REQUIRED_KEYS),
    missingDeliveryFields: findMissingFields(effective, DELIVERY_REQUIRED_KEYS),
  };
}

export function buildClientConfigPayload(resolvedConfig) {
  const values = {};
  const secrets = {};

  for (const key of GUI_CONFIG_KEYS) {
    if (GUI_SECRET_KEYS.has(key)) {
      secrets[key] = {
        configured: Boolean(resolvedConfig.effectiveConfig[key]),
        source: resolvedConfig.sources[key],
      };
      continue;
    }

    values[key] = resolvedConfig.effectiveConfig[key];
  }

  return {
    configPath: normalizeForClient(resolvedConfig.configPath),
    warning: "Secrets are stored in plain text in a local project file. Use this only on a trusted single-user machine.",
    values,
    secrets,
    sources: resolvedConfig.sources,
    missingUploadFields: resolvedConfig.missingUploadFields,
    missingDeliveryFields: resolvedConfig.missingDeliveryFields,
  };
}

export function mergeGuiConfigInput(existingConfig, input) {
  const existing = normalizeConfigObject(existingConfig);
  const next = { ...existing };

  for (const key of GUI_CONFIG_KEYS) {
    if (!input || typeof input !== "object" || !(key in input)) {
      continue;
    }

    const value = normalizeString(input[key]);

    if (GUI_SECRET_KEYS.has(key)) {
      if (value) {
        next[key] = value;
      }

      continue;
    }

    if (value) {
      next[key] = value;
      continue;
    }

    delete next[key];
  }

  return next;
}

export function getGuiConfigPath(cwd = process.cwd()) {
  return path.resolve(cwd, GUI_CONFIG_FILENAME);
}

export function findMissingFields(config, keys) {
  return keys.filter((key) => !normalizeString(config[key]));
}

function resolveValueForKey(key, guiConfig, envFileConfig, env) {
  if (normalizeString(guiConfig[key])) {
    return { value: normalizeString(guiConfig[key]), source: "gui" };
  }

  if (normalizeString(envFileConfig[key])) {
    return { value: normalizeString(envFileConfig[key]), source: "dotenv" };
  }

  if (normalizeString(env[key])) {
    return { value: normalizeString(env[key]), source: "process" };
  }

  if (normalizeString(DEFAULTS[key])) {
    return { value: DEFAULTS[key], source: "default" };
  }

  return { value: "", source: null };
}

function normalizeConfigObject(values) {
  const normalized = {};

  if (!values || typeof values !== "object") {
    return normalized;
  }

  for (const key of GUI_CONFIG_KEYS) {
    if (!(key in values)) {
      continue;
    }

    const value = normalizeString(values[key]);

    if (value) {
      normalized[key] = value;
    }
  }

  return normalized;
}

function normalizeString(value) {
  return value == null ? "" : String(value).trim();
}

function normalizeForClient(value) {
  return value.split(path.sep).join("/");
}
