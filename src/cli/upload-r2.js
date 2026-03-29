#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { parseArgs, printUsage, getNumberArg } from "../lib/cli.js";
import { loadEnvFile } from "../lib/env.js";
import { uploadManifestItems } from "../lib/r2.js";

async function main() {
  const args = parseArgs();

  if (args.help) {
    printUsage([
      "Usage: node src/cli/upload-r2.js --manifest ./dist/images/manifest.json [options]",
      "",
      "Options:",
      "  --manifest <path>      Manifest path from optimize step",
      "  --env-file <path>      Optional env file, defaults to ./.env when present",
      "  --concurrency <n>      Upload concurrency, defaults to 4",
      "  --dry-run              Validate files and print URLs without uploading",
      "  --write-manifest <p>   Output path for uploaded manifest",
      "  --help                 Show this message",
    ]);
    return;
  }

  const envFile = String(args["env-file"] || ".env");
  loadEnvFile(envFile);

  const manifestPath = path.resolve(String(args.manifest || "./dist/images/manifest.json"));
  const writeManifestPath = path.resolve(
    String(args["write-manifest"] || path.join(path.dirname(manifestPath), "uploaded-manifest.json")),
  );
  const concurrency = getNumberArg(args, "concurrency", 4);
  const dryRun = Boolean(args["dry-run"]);
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const uploadedManifest = await uploadManifestItems({
    manifest,
    outputRoot: manifest.outputDir || path.dirname(manifestPath),
    dryRun,
    concurrency,
  });

  await mkdir(path.dirname(writeManifestPath), { recursive: true });
  await writeFile(writeManifestPath, `${JSON.stringify(uploadedManifest, null, 2)}\n`, "utf8");

  console.log(`${dryRun ? "Validated" : "Uploaded"} ${uploadedManifest.items.length} file(s).`);
  console.log(`Bucket: ${uploadedManifest.bucket}`);
  console.log(`Manifest: ${writeManifestPath}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
