#!/usr/bin/env node

import http from "node:http";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath, pathToFileURL } from "node:url";

import archiver from "archiver";
import Busboy from "busboy";

import {
  buildClientConfigPayload,
  findMissingFields,
  resolveGuiConfig,
  saveGuiConfigInput,
  UPLOAD_REQUIRED_KEYS,
} from "./config-store.js";
import { JobManager } from "./job-manager.js";

const STATIC_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "public");
const STATIC_FILES = new Map([
  ["/", "index.html"],
  ["/index.html", "index.html"],
  ["/styles.css", "styles.css"],
  ["/app.js", "app.js"],
]);
const CONTENT_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".png", "image/png"],
  [".svg", "image/svg+xml"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".avif", "image/avif"],
]);

export function createGuiServer({
  cwd = process.cwd(),
  env = process.env,
  host = "127.0.0.1",
  port = 4173,
  jobManager = new JobManager({ rootDir: path.resolve(cwd, ".tmp/gui-jobs") }),
} = {}) {
  const server = http.createServer((request, response) =>
    routeRequest({ request, response, cwd, env, jobManager }),
  );

  return {
    server,
    jobManager,
    async start() {
      await new Promise((resolve) => server.listen(port, host, resolve));

      return { host, port, url: `http://${host}:${port}` };
    },
    async close() {
      await new Promise((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    },
  };
}

async function routeRequest({ request, response, cwd, env, jobManager }) {
  try {
    const url = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);

    if (request.method === "GET" && url.pathname === "/api/config") {
      const resolvedConfig = await resolveGuiConfig({ cwd, env });
      return sendJson(response, 200, buildClientConfigPayload(resolvedConfig));
    }

    if (request.method === "POST" && url.pathname === "/api/config") {
      const body = await readJsonBody(request);
      await saveGuiConfigInput(body, { cwd });
      const resolvedConfig = await resolveGuiConfig({ cwd, env });
      return sendJson(response, 200, buildClientConfigPayload(resolvedConfig));
    }

    if (request.method === "POST" && url.pathname === "/api/jobs") {
      if (jobManager.optimizeBusy) {
        return sendJson(response, 409, { error: "Another optimization job is already running." });
      }

      const resolvedConfig = await resolveGuiConfig({ cwd, env });
      const job = await jobManager.createJob();
      const parsed = await writeMultipartInputToJob(request, job);

      if (parsed.fileCount === 0) {
        await jobManager.cleanupJob(job.id);
        return sendJson(response, 400, { error: "Select a folder with at least one image file." });
      }

      void jobManager
        .runOptimization(job.id, {
          config: resolvedConfig.effectiveConfig,
          options: {
            photoFormat: parsed.fields.photoFormat,
            photoQuality: parsed.fields.photoQuality,
          },
        })
        .catch(() => {});

      return sendJson(response, 202, {
        jobId: job.id,
        status: "processing",
        phase: "optimizing",
        fileCount: parsed.fileCount,
      });
    }

    if (request.method === "GET" && url.pathname.startsWith("/api/jobs/") && !url.pathname.includes("/files/") && !url.pathname.endsWith("/export") && !url.pathname.endsWith("/upload") && !url.pathname.endsWith("/download")) {
      const jobId = url.pathname.split("/")[3];
      const resolvedConfig = await resolveGuiConfig({ cwd, env });
      const job = jobManager.serializeJob(jobId, { config: resolvedConfig.effectiveConfig });

      return sendJson(response, 200, job);
    }

    if (request.method === "POST" && url.pathname.endsWith("/upload")) {
      const parts = url.pathname.split("/");
      const jobId = parts[3];
      const resolvedConfig = await resolveGuiConfig({ cwd, env });
      const missingUploadFields = findMissingFields(resolvedConfig.effectiveConfig, UPLOAD_REQUIRED_KEYS);

      if (missingUploadFields.length > 0) {
        return sendJson(response, 400, {
          error: "Missing required R2 configuration.",
          missingFields: missingUploadFields,
        });
      }

      if (jobManager.uploadBusy) {
        return sendJson(response, 409, { error: "Another upload job is already running." });
      }

      void jobManager.runUpload(jobId, {
        config: resolvedConfig.effectiveConfig,
      }).catch(() => {});

      return sendJson(response, 202, {
        jobId,
        status: "processing",
        phase: "uploading",
      });
    }

    if (request.method === "POST" && url.pathname.endsWith("/cleanup")) {
      const parts = url.pathname.split("/");
      const jobId = parts[3];
      const result = await jobManager.cleanupJob(jobId);

      return sendJson(response, 200, result);
    }

    if (request.method === "GET" && url.pathname.includes("/files/")) {
      return serveJobFile({ response, url, jobManager });
    }

    if (request.method === "GET" && url.pathname.endsWith("/export")) {
      return serveExport({ response, url, jobManager });
    }

    if (request.method === "GET" && url.pathname.endsWith("/download")) {
      return serveDownload({ response, url, jobManager });
    }

    if (request.method === "GET" && STATIC_FILES.has(url.pathname)) {
      return serveStatic(response, STATIC_FILES.get(url.pathname));
    }

    return sendJson(response, 404, { error: "Not found" });
  } catch (error) {
    if (error && error.code === "JOB_NOT_FOUND") {
      return sendJson(response, 404, { error: error.message });
    }

    if (error && error.code === "JOB_BUSY") {
      return sendJson(response, 409, { error: error.message });
    }

    return sendJson(response, 500, { error: error.message || "Internal server error" });
  }
}

async function writeMultipartInputToJob(request, job) {
  const busboy = Busboy({
    headers: request.headers,
    limits: {
      files: 2000,
      fileSize: 250 * 1024 * 1024,
    },
  });
  const pendingWrites = [];
  const fields = {};
  let fileCount = 0;

  await new Promise((resolve, reject) => {
    let settled = false;

    const finish = (callback) => (value) => {
      if (settled) {
        return;
      }

      settled = true;
      Promise.resolve(callback(value)).catch(reject);
    };

    busboy.on(
      "file",
      (fieldname, stream, info) => {
        const relativePath = sanitizeRelativePath(decodeFieldPath(fieldname) || info.filename || `${randomUUID()}`);
        const absolutePath = path.join(job.paths.input, ...relativePath.split("/"));
        const writePromise = mkdir(path.dirname(absolutePath), { recursive: true }).then(() =>
          pipeline(stream, createWriteStream(absolutePath)),
        );

        pendingWrites.push(writePromise);
        fileCount += 1;
      },
    );
    busboy.on("field", (fieldname, value) => {
      fields[String(fieldname)] = String(value);
    });

    busboy.on("error", finish(reject));
    busboy.on(
      "finish",
      finish(async () => {
        await Promise.all(pendingWrites);
        resolve();
      }),
    );

    request.pipe(busboy);
  });

  return { fileCount, fields };
}

async function serveJobFile({ response, url, jobManager }) {
  const [, , , jobId, , bucket, ...rest] = url.pathname.split("/");
  const job = jobManager.requireJob(jobId);
  const relativePath = sanitizeRelativePath(rest.map(decodeURIComponent).join("/"));
  const filePath =
    bucket === "input"
      ? path.join(job.paths.input, ...relativePath.split("/"))
      : path.join(job.paths.output, ...relativePath.split("/"));
  const extension = path.extname(filePath).toLowerCase();
  const content = await readFile(filePath);

  response.writeHead(200, {
    "Content-Type": CONTENT_TYPES.get(extension) || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  response.end(content);
}

async function serveExport({ response, url, jobManager }) {
  const parts = url.pathname.split("/");
  const jobId = parts[3];
  const type = url.searchParams.get("type") === "uploaded" ? "uploaded" : "manifest";
  const job = jobManager.requireJob(jobId);
  const filePath = type === "uploaded" ? job.paths.uploadedManifest : job.paths.manifest;
  const content = await readFile(filePath);

  response.writeHead(200, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Disposition": `attachment; filename="${type === "uploaded" ? "uploaded-manifest.json" : "manifest.json"}"`,
    "Cache-Control": "no-store",
  });
  response.end(content);
}

async function serveDownload({ response, url, jobManager }) {
  const parts = url.pathname.split("/");
  const jobId = parts[3];
  const type = url.searchParams.get("type") || "optimized";
  const job = jobManager.requireJob(jobId);

  if (type !== "optimized") {
    response.writeHead(400, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(`${JSON.stringify({ error: "Unsupported download type." })}\n`);
    return;
  }

  if (!job.manifest) {
    response.writeHead(400, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    response.end(`${JSON.stringify({ error: "This job has no optimized output yet." })}\n`);
    return;
  }

  const archive = archiver("zip", {
    zlib: { level: 9 },
  });
  const filename = `optimized-images-${job.id.slice(0, 8)}.zip`;

  response.writeHead(200, {
    "Content-Type": "application/zip",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store",
  });

  archive.on("error", (error) => {
    if (!response.headersSent) {
      response.writeHead(500, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      response.end(`${JSON.stringify({ error: error.message })}\n`);
      return;
    }

    response.destroy(error);
  });

  archive.pipe(response);
  archive.directory(job.paths.output, false);
  await archive.finalize();
}

async function serveStatic(response, filename) {
  const filePath = path.join(STATIC_ROOT, filename);
  const content = await readFile(filePath);

  response.writeHead(200, {
    "Content-Type": CONTENT_TYPES.get(path.extname(filename).toLowerCase()) || "application/octet-stream",
    "Cache-Control": "no-store",
  });
  response.end(content);
}

async function readJsonBody(request) {
  const chunks = [];

  for await (const chunk of request) {
    chunks.push(chunk);
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(`${JSON.stringify(payload)}\n`);
}

function decodeFieldPath(fieldname) {
  if (!fieldname.startsWith("file:")) {
    return "";
  }

  return decodeURIComponent(fieldname.slice(5));
}

function sanitizeRelativePath(value) {
  const normalized = String(value)
    .replace(/\\/gu, "/")
    .split("/")
    .filter(Boolean);

  if (normalized.length === 0) {
    throw new Error("Invalid file path.");
  }

  for (const segment of normalized) {
    if (segment === "." || segment === "..") {
      throw new Error("Invalid file path.");
    }
  }

  return normalized.join("/");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const app = createGuiServer();

  app
    .start()
    .then(({ url }) => {
      console.log(`R2 Bucket Tool GUI is running at ${url}`);
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
