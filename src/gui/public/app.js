const state = {
  config: null,
  job: null,
  jobId: localStorage.getItem("r2bt:jobId") || "",
  selectedItemKey: "",
  selectedPreset: "card",
  photoFormat: "jpeg",
  photoQuality: 88,
  pollHandle: null,
};

const elements = {
  globalStatus: document.querySelector("#global-status"),
  globalDetail: document.querySelector("#global-detail"),
  configWarning: document.querySelector("#config-warning"),
  configHealth: document.querySelector("#config-health"),
  saveConfig: document.querySelector("#save-config"),
  reloadConfig: document.querySelector("#reload-config"),
  configForm: document.querySelector("#config-form"),
  folderInput: document.querySelector("#folder-input"),
  folderMeta: document.querySelector("#folder-meta"),
  photoFormat: document.querySelector("#photo-format"),
  photoFormatChip: document.querySelector("#photo-format-chip"),
  photoQuality: document.querySelector("#photo-quality"),
  photoQualityChip: document.querySelector("#photo-quality-chip"),
  photoQualityHelp: document.querySelector("#photo-quality-help"),
  startJob: document.querySelector("#start-job"),
  uploadJob: document.querySelector("#upload-job"),
  cleanupJob: document.querySelector("#cleanup-job"),
  jobActions: document.querySelector("#job-actions"),
  resultsBody: document.querySelector("#results-body"),
  resultRowTemplate: document.querySelector("#result-row-template"),
  summaryFiles: document.querySelector("#summary-files"),
  summaryOriginal: document.querySelector("#summary-original"),
  summaryOptimized: document.querySelector("#summary-optimized"),
  summarySaved: document.querySelector("#summary-saved"),
  originalPreview: document.querySelector("#original-preview"),
  optimizedPreview: document.querySelector("#optimized-preview"),
  originalCaption: document.querySelector("#original-caption"),
  optimizedCaption: document.querySelector("#optimized-caption"),
  optimizedArchiveLink: document.querySelector("#optimized-archive-link"),
  manifestLink: document.querySelector("#manifest-link"),
  uploadedManifestLink: document.querySelector("#uploaded-manifest-link"),
  deliveryState: document.querySelector("#delivery-state"),
  deliveryEmpty: document.querySelector("#delivery-empty"),
  deliveryPanel: document.querySelector("#delivery-panel"),
  presetSwitcher: document.querySelector("#preset-switcher"),
};

const outputFields = new Map([
  ["sourceUrl", document.querySelector("#sourceUrl")],
  ["transformTemplate", document.querySelector("#transformTemplate")],
  ["src", document.querySelector("#src")],
  ["srcset", document.querySelector("#srcset")],
  ["html", document.querySelector("#html")],
]);

bootstrap().catch((error) => {
  setGlobalStatus("Error", error.message);
});

async function bootstrap() {
  bindEvents();
  await loadConfig();

  if (state.jobId) {
    await refreshJob();
  } else {
    render();
  }
}

function bindEvents() {
  elements.reloadConfig.addEventListener("click", () => {
    void loadConfig();
  });

  elements.saveConfig.addEventListener("click", () => {
    void saveConfig();
  });

  elements.folderInput.addEventListener("change", () => {
    const count = elements.folderInput.files?.length || 0;
    elements.folderMeta.textContent = count > 0 ? `${count} file(s) selected.` : "No folder selected.";
  });

  elements.photoFormat.addEventListener("change", () => {
    state.photoFormat = elements.photoFormat.value;
    renderCompressionControls();
  });

  elements.photoQuality.addEventListener("input", () => {
    state.photoQuality = Number(elements.photoQuality.value);
    renderCompressionControls();
  });

  elements.startJob.addEventListener("click", () => {
    void createJob();
  });

  elements.uploadJob.addEventListener("click", () => {
    void uploadCurrentJob();
  });

  elements.cleanupJob.addEventListener("click", () => {
    void cleanupCurrentJob();
  });

  elements.presetSwitcher.addEventListener("click", (event) => {
    const button = event.target.closest("[data-preset]");

    if (!button) {
      return;
    }

    state.selectedPreset = button.dataset.preset;
    renderDelivery();
  });

  document.body.addEventListener("click", async (event) => {
    const copyButton = event.target.closest("[data-copy]");

    if (!copyButton) {
      return;
    }

    const field = copyButton.dataset.copy;
    const target = outputFields.get(field);

    if (!target) {
      return;
    }

    await navigator.clipboard.writeText(target.textContent || "");
    copyButton.textContent = "Copied";
    window.setTimeout(() => {
      copyButton.textContent = "Copy";
    }, 1200);
  });
}

async function loadConfig() {
  const response = await fetch("/api/config");
  const payload = await response.json();
  state.config = payload;
  renderConfig();
  render();
}

async function saveConfig() {
  const formData = new FormData(elements.configForm);
  const payload = Object.fromEntries(formData.entries());
  const response = await fetch("/api/config", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  state.config = result;
  renderConfig();
  setGlobalStatus("Saved", "Configuration updated.");
}

async function createJob() {
  const files = [...(elements.folderInput.files || [])];

  if (files.length === 0) {
    setGlobalStatus("Idle", "Choose a folder before starting compression.");
    return;
  }

  const formData = new FormData();

  for (const file of files) {
    const relativePath = file.webkitRelativePath || file.name;
    formData.append(`file:${encodeURIComponent(relativePath)}`, file, file.name);
  }

  formData.append("photoFormat", state.photoFormat);
  formData.append("photoQuality", String(state.photoQuality));

  setGlobalStatus(
    "Processing",
    `Uploading ${files.length} file(s) to the local job workspace with ${state.photoFormat.toUpperCase()} Q${state.photoQuality}...`,
  );

  const response = await fetch("/api/jobs", {
    method: "POST",
    body: formData,
  });
  const payload = await response.json();

  if (!response.ok) {
    setGlobalStatus("Error", payload.error || "Failed to create job.");
    return;
  }

  state.jobId = payload.jobId;
  localStorage.setItem("r2bt:jobId", state.jobId);
  state.job = null;
  state.selectedItemKey = "";
  startPolling();
  render();
}

async function refreshJob() {
  if (!state.jobId) {
    return;
  }

  const response = await fetch(`/api/jobs/${state.jobId}`);

  if (response.status === 404) {
    resetCurrentJobState();
    render();
    return;
  }

  const payload = await response.json();
  state.job = payload;

  if (!state.selectedItemKey && payload.items.length > 0) {
    state.selectedItemKey = payload.items[0].key;
  }

  if (!payload.items.find((item) => item.key === state.selectedItemKey) && payload.items.length > 0) {
    state.selectedItemKey = payload.items[0].key;
  }

  if (payload.status !== "processing") {
    stopPolling();
  }

  render();
}

async function uploadCurrentJob() {
  if (!state.jobId) {
    return;
  }

  setGlobalStatus("Processing", "Uploading optimized assets to R2...");

  const response = await fetch(`/api/jobs/${state.jobId}/upload`, {
    method: "POST",
  });
  const payload = await response.json();

  if (!response.ok) {
    setGlobalStatus("Error", payload.error || "Upload failed.");
    return;
  }

  startPolling();
}

async function cleanupCurrentJob() {
  if (!state.jobId || !state.job || state.job.status === "processing") {
    return;
  }

  const confirmed = window.confirm(
    "Clean temp files for this job? This removes the local input, optimized output, and manifest files for the current job.",
  );

  if (!confirmed) {
    return;
  }

  setGlobalStatus("Processing", "Cleaning local temp files...");

  const response = await fetch(`/api/jobs/${state.jobId}/cleanup`, {
    method: "POST",
  });
  const payload = await response.json();

  if (!response.ok) {
    setGlobalStatus("Error", payload.error || "Failed to clean temp files.");
    return;
  }

  resetCurrentJobState();
  render();
  setGlobalStatus("Idle", "Temporary job files were removed.");
}

function startPolling() {
  stopPolling();
  void refreshJob();
  state.pollHandle = window.setInterval(() => {
    void refreshJob();
  }, 1000);
}

function stopPolling() {
  if (state.pollHandle) {
    window.clearInterval(state.pollHandle);
    state.pollHandle = null;
  }
}

function render() {
  renderCompressionControls();
  renderJobStatus();
  renderJobActions();
  renderSummary();
  renderResultsTable();
  renderPreview();
  renderDelivery();
}

function renderConfig() {
  if (!state.config) {
    return;
  }

  for (const [key, value] of Object.entries(state.config.values)) {
    const input = document.querySelector(`#${CSS.escape(key)}`);

    if (input) {
      input.value = value;
    }
  }

  document.querySelector("#R2_ACCESS_KEY_ID").value = "";
  document.querySelector("#R2_SECRET_ACCESS_KEY").value = "";
  elements.configWarning.textContent = state.config.warning;
  elements.configHealth.innerHTML = "";

  if (state.config.missingUploadFields.length === 0) {
    elements.configHealth.append(buildTag("Upload configuration is complete.", "is-good"));
  } else {
    elements.configHealth.append(
      buildTag(`Missing upload fields: ${state.config.missingUploadFields.join(", ")}`, "is-bad"),
    );
  }

  if (state.config.secrets.R2_ACCESS_KEY_ID?.configured) {
    elements.configHealth.append(buildTag("Access key ID is configured.", "is-good"));
  }

  if (state.config.secrets.R2_SECRET_ACCESS_KEY?.configured) {
    elements.configHealth.append(buildTag("Secret access key is configured.", "is-good"));
  }
}

function renderCompressionControls() {
  elements.photoFormat.value = state.photoFormat;
  elements.photoQuality.value = String(state.photoQuality);
  elements.photoFormatChip.textContent = state.photoFormat.toUpperCase();
  elements.photoQualityChip.textContent = `Q${state.photoQuality}`;
  elements.photoQualityHelp.textContent =
    state.photoQuality <= 55
      ? "High compression. Best chance to reach 90%+ savings, but visible loss is more likely."
      : state.photoQuality <= 72
        ? "Balanced compression. Smaller files with moderate visual loss."
        : "Conservative compression. Better visual quality, but lower savings.";
}

function renderJobStatus() {
  if (!state.job) {
    setGlobalStatus("Idle", "No active job.");
    return;
  }

  if (state.job.status === "processing") {
    setGlobalStatus("Processing", `Job ${state.job.phase || "running"}...`);
    return;
  }

  if (state.job.status === "ready") {
    const defaults = state.job.defaults || {};
    setGlobalStatus(
      "Ready",
      `${state.job.summary?.totalFiles || 0} file(s) optimized with ${String(
        defaults.photoFormat || state.photoFormat,
      ).toUpperCase()} Q${defaults.photoQuality || state.photoQuality}.`,
    );
    return;
  }

  if (state.job.status === "uploaded") {
    setGlobalStatus("Uploaded", "Assets uploaded. Copy the delivery code from the publish panel.");
    return;
  }

  if (state.job.status === "error") {
    setGlobalStatus("Error", state.job.error || "The job failed.");
  }
}

function renderJobActions() {
  elements.jobActions.innerHTML = "";
  elements.deliveryState.innerHTML = "";
  const canStart = !state.job || state.job.status !== "processing";
  elements.startJob.disabled = !canStart;

  if (state.job) {
    elements.jobActions.append(buildTag(`Job ID ${state.job.id.slice(0, 8)}`));
    elements.jobActions.append(buildTag(`Status: ${state.job.status}`, state.job.status === "error" ? "is-bad" : "is-good"));

    if (state.job.defaults?.photoFormat) {
      elements.jobActions.append(
        buildTag(`Photo output: ${String(state.job.defaults.photoFormat).toUpperCase()} Q${state.job.defaults.photoQuality}`),
      );
    }
  }

  const canUpload =
    state.job &&
    (state.job.status === "ready" || state.job.status === "uploaded") &&
    state.config &&
    state.config.missingUploadFields.length === 0;
  const canCleanup = Boolean(state.job && state.job.status !== "processing");

  elements.uploadJob.disabled = !canUpload;
  elements.cleanupJob.disabled = !canCleanup;

  if (state.config?.missingUploadFields.length > 0) {
    elements.deliveryState.append(
      buildTag(`Upload blocked: ${state.config.missingUploadFields.join(", ")}`, "is-bad"),
    );
  } else {
    elements.deliveryState.append(buildTag("Upload requirements satisfied.", "is-good"));
  }
}

function renderSummary() {
  const summary = state.job?.summary;
  const defaults = state.job?.defaults || {};
  elements.summaryFiles.textContent = summary ? String(summary.totalFiles) : "0";
  elements.summaryOriginal.textContent = summary ? formatBytes(summary.totalOriginalBytes) : "0 B";
  elements.summaryOptimized.textContent = summary ? formatBytes(summary.totalOptimizedBytes) : "0 B";
  elements.summarySaved.textContent = summary ? formatPercent(summary.totalSavingsRatio) : "0%";

  if (defaults.photoFormat) {
    state.photoFormat = defaults.photoFormat;
  }

  if (Number.isFinite(defaults.photoQuality)) {
    state.photoQuality = Number(defaults.photoQuality);
  }

  setLinkState(elements.optimizedArchiveLink, state.job?.exports?.optimizedArchive || "");
  setLinkState(elements.manifestLink, state.job?.exports?.manifest || "");
  setLinkState(elements.uploadedManifestLink, state.job?.exports?.uploadedManifest || "");
}

function renderResultsTable() {
  const items = state.job?.items || [];
  elements.resultsBody.innerHTML = "";

  if (items.length === 0) {
    elements.resultsBody.innerHTML = '<tr><td colspan="7" class="empty-cell">No results yet.</td></tr>';
    return;
  }

  for (const item of items) {
    const row = elements.resultRowTemplate.content.firstElementChild.cloneNode(true);
    row.dataset.key = item.key;

    if (item.key === state.selectedItemKey) {
      row.classList.add("is-selected");
    }

    row.querySelector(".file-cell").textContent = item.sourceRelativePath;
    row.querySelector(".strategy-cell").innerHTML = `<span class="strategy-pill">${item.strategy}</span>`;
    row.querySelector(".dimension-cell").textContent = item.width && item.height ? `${item.width} x ${item.height}` : "-";
    row.querySelector(".original-cell").textContent = formatBytes(item.originalBytes);
    row.querySelector(".optimized-cell").textContent = formatBytes(item.optimizedBytes);
    row.querySelector(".saved-cell").textContent = formatPercent(item.savingsRatio);
    row.querySelector(".key-cell").textContent = item.key;
    row.addEventListener("click", () => {
      state.selectedItemKey = item.key;
      render();
    });

    elements.resultsBody.append(row);
  }
}

function renderPreview() {
  const item = getSelectedItem();

  if (!item) {
    elements.originalPreview.removeAttribute("src");
    elements.optimizedPreview.removeAttribute("src");
    elements.originalCaption.textContent = "Select an item";
    elements.optimizedCaption.textContent = "Select an item";
    return;
  }

  elements.originalPreview.src = item.previews.source;
  elements.optimizedPreview.src = item.previews.optimized;
  elements.originalCaption.textContent = `${formatBytes(item.originalBytes)} | ${item.sourceRelativePath}`;
  elements.optimizedCaption.textContent = `${formatBytes(item.optimizedBytes)} | ${item.key}`;
}

function renderDelivery() {
  const item = getSelectedItem();

  elements.presetSwitcher.querySelectorAll("[data-preset]").forEach((button) => {
    button.classList.toggle("active", button.dataset.preset === state.selectedPreset);
  });

  if (!item || !item.delivery) {
    elements.deliveryEmpty.classList.remove("hidden");
    elements.deliveryPanel.classList.add("hidden");
    return;
  }

  const preset = item.delivery.presets[state.selectedPreset];

  if (!preset) {
    elements.deliveryEmpty.classList.remove("hidden");
    elements.deliveryPanel.classList.add("hidden");
    return;
  }

  elements.deliveryEmpty.classList.add("hidden");
  elements.deliveryPanel.classList.remove("hidden");
  outputFields.get("sourceUrl").textContent = item.delivery.sourceUrl;
  outputFields.get("transformTemplate").textContent = item.delivery.transformTemplate;
  outputFields.get("src").textContent = preset.src;
  outputFields.get("srcset").textContent = preset.srcset;
  outputFields.get("html").textContent = preset.html;
}

function getSelectedItem() {
  return state.job?.items?.find((item) => item.key === state.selectedItemKey) || null;
}

function setGlobalStatus(label, detail) {
  elements.globalStatus.textContent = label;
  elements.globalDetail.textContent = detail;
}

function resetCurrentJobState() {
  stopPolling();
  state.job = null;
  state.jobId = "";
  state.selectedItemKey = "";
  elements.folderInput.value = "";
  elements.folderMeta.textContent = "No folder selected.";
  localStorage.removeItem("r2bt:jobId");
}

function buildTag(text, modifier = "") {
  const span = document.createElement("span");
  span.className = `tag ${modifier}`.trim();
  span.textContent = text;

  return span;
}

function setLinkState(anchor, href) {
  if (!href) {
    anchor.href = "#";
    anchor.classList.add("disabled-link");
    return;
  }

  anchor.href = href;
  anchor.classList.remove("disabled-link");
}

function formatBytes(value) {
  if (!Number.isFinite(value)) {
    return "-";
  }

  const units = ["B", "KB", "MB", "GB"];
  let current = value;
  let unitIndex = 0;

  while (current >= 1024 && unitIndex < units.length - 1) {
    current /= 1024;
    unitIndex += 1;
  }

  return `${current.toFixed(current >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function formatPercent(value) {
  if (!Number.isFinite(value)) {
    return "0%";
  }

  return `${(value * 100).toFixed(1)}%`;
}
