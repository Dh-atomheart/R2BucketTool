import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";

import {
  buildClientConfigPayload,
  resolveGuiConfig,
  saveGuiConfigInput,
} from "../src/gui/config-store.js";

test("resolveGuiConfig applies GUI over .env over process env", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "r2bt-config-"));

  try {
    await writeFile(
      path.join(cwd, ".env"),
      [
        "R2_BUCKET=dotenv-bucket",
        "R2_PUBLIC_BASE_URL=https://dotenv.example.com",
        "R2_ACCESS_KEY_ID=dotenv-access",
      ].join("\n"),
      "utf8",
    );

    await saveGuiConfigInput(
      {
        R2_BUCKET: "gui-bucket",
        R2_SECRET_ACCESS_KEY: "gui-secret",
      },
      { cwd },
    );

    const resolved = await resolveGuiConfig({
      cwd,
      env: {
        R2_BUCKET: "process-bucket",
        R2_PUBLIC_BASE_URL: "https://process.example.com",
        R2_ACCOUNT_ID: "process-account",
      },
    });
    const payload = buildClientConfigPayload(resolved);

    assert.equal(resolved.effectiveConfig.R2_BUCKET, "gui-bucket");
    assert.equal(resolved.effectiveConfig.R2_PUBLIC_BASE_URL, "https://dotenv.example.com");
    assert.equal(resolved.effectiveConfig.R2_ACCOUNT_ID, "process-account");
    assert.equal(resolved.effectiveConfig.R2_KEY_PREFIX, "photos");
    assert.equal(payload.secrets.R2_ACCESS_KEY_ID.configured, true);
    assert.equal(payload.secrets.R2_SECRET_ACCESS_KEY.configured, true);
    assert.equal("R2_SECRET_ACCESS_KEY" in payload.values, false);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test("saveGuiConfigInput preserves saved secrets when blank values are submitted", async () => {
  const cwd = await mkdtemp(path.join(os.tmpdir(), "r2bt-config-save-"));

  try {
    await saveGuiConfigInput(
      {
        R2_BUCKET: "first-bucket",
        R2_ACCESS_KEY_ID: "first-access",
        R2_SECRET_ACCESS_KEY: "first-secret",
      },
      { cwd },
    );

    await saveGuiConfigInput(
      {
        R2_BUCKET: "",
        R2_ACCESS_KEY_ID: "",
        R2_SECRET_ACCESS_KEY: "",
        R2_PUBLIC_BASE_URL: "https://img.example.com",
      },
      { cwd },
    );

    const saved = JSON.parse(await readFile(path.join(cwd, ".r2buckettool.gui.json"), "utf8"));

    assert.equal(saved.R2_BUCKET, undefined);
    assert.equal(saved.R2_PUBLIC_BASE_URL, "https://img.example.com");
    assert.equal(saved.R2_ACCESS_KEY_ID, "first-access");
    assert.equal(saved.R2_SECRET_ACCESS_KEY, "first-secret");
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});
