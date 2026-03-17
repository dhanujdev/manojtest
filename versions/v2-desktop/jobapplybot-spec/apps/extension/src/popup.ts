type AgentStatus = "captured" | "running" | "paused" | "ready_to_submit" | "failed" | "completed";

interface StatusEventData {
  state: AgentStatus;
  portalType: string;
  adapterName?: string;
  message?: string;
  error?: string;
  fieldsCount?: number;
}

interface NeedFieldEventData {
  jobId: string;
  requestId: string;
  field: {
    label: string;
    inputType: string;
    required: boolean;
    signatureHash: string;
  };
  reason: string;
}

interface JobSummary {
  jobId: string;
  status: AgentStatus;
  company?: string;
  title?: string;
  url: string;
  adapterName?: string;
  finalStepDetected: boolean;
  fields: Array<{ label: string; inputType: string; required: boolean }>;
  filledValues: Record<string, unknown>;
}

const state = {
  jobId: "",
  pendingRequestId: "",
  eventSource: null as EventSource | null
};

function getInput(id: string): HTMLInputElement {
  return document.getElementById(id) as HTMLInputElement;
}

function getTextArea(id: string): HTMLTextAreaElement {
  return document.getElementById(id) as HTMLTextAreaElement;
}

function setConnectionStatus(text: string): void {
  document.getElementById("connection-status")!.textContent = text;
}

function setRunStatus(text: string): void {
  document.getElementById("run-status")!.textContent = text;
}

function setJobId(jobId: string): void {
  state.jobId = jobId;
  localStorage.setItem("jobId", jobId);
  document.getElementById("job-id-label")!.textContent = jobId ? `Job: ${jobId}` : "No job captured yet";
}

function getSecret(): string {
  return getInput("secret").value.trim();
}

async function callAgent(command: string, payload: Record<string, unknown> = {}): Promise<any> {
  const secret = getSecret();

  if (!secret) {
    throw new Error("Shared secret is required");
  }

  const response = await fetch("http://127.0.0.1:4318/api", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-jobapplybot-secret": secret
    },
    body: JSON.stringify({
      command,
      payload
    })
  });

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.error ?? "Agent request failed");
  }

  setConnectionStatus("Connected");
  return data;
}

function showNeedField(data: NeedFieldEventData): void {
  state.pendingRequestId = data.requestId;
  document.getElementById("need-field-card")!.classList.remove("hidden");
  document.getElementById("need-field-label")!.textContent = `${data.field.label} (${data.reason})`;
  getTextArea("need-field-value").value = "";
}

function hideNeedField(): void {
  state.pendingRequestId = "";
  document.getElementById("need-field-card")!.classList.add("hidden");
}

function renderSummary(summary: JobSummary | null): void {
  const output = document.getElementById("review-output")!;

  output.textContent = JSON.stringify(summary ?? {}, null, 2);
}

async function loadSummary(): Promise<void> {
  if (!state.jobId) {
    return;
  }

  const result = await callAgent("job.summary", {
    jobId: state.jobId
  });

  renderSummary(result.summary);
}

function connectToEvents(): void {
  if (!state.jobId) {
    return;
  }

  state.eventSource?.close();
  state.eventSource = new EventSource(
    `http://127.0.0.1:4318/events/${state.jobId}?secret=${encodeURIComponent(getSecret())}`
  );

  state.eventSource.addEventListener("status", async (event) => {
    const data = JSON.parse((event as MessageEvent).data) as StatusEventData;
    const suffix = data.error ? ` (${data.error})` : "";
    setRunStatus(`${data.state}: ${data.message ?? "Job updated"}${suffix}`);

    if (data.state === "ready_to_submit") {
      hideNeedField();
      await loadSummary();
    }
  });

  state.eventSource.addEventListener("need_field", (event) => {
    const data = JSON.parse((event as MessageEvent).data) as NeedFieldEventData;
    showNeedField(data);
  });

  state.eventSource.addEventListener("fields_ready", async () => {
    await loadSummary();
  });

  state.eventSource.onerror = () => {
    setConnectionStatus("Event stream disconnected");
  };
}

async function loadProfile(): Promise<void> {
  const result = await callAgent("profile.get");
  const data = result.data ?? {};

  getInput("profile-full-name").value = data.fullName ?? "";
  getInput("profile-email").value = data.email ?? "";
  getInput("profile-phone").value = data.phone ?? "";
  getInput("profile-linkedin").value = data.linkedin ?? "";
}

async function saveProfile(): Promise<void> {
  await callAgent("profile.set", {
    data: {
      fullName: getInput("profile-full-name").value.trim(),
      email: getInput("profile-email").value.trim(),
      phone: getInput("profile-phone").value.trim(),
      linkedin: getInput("profile-linkedin").value.trim()
    }
  });
  setRunStatus("Profile saved");
}

async function captureJob(): Promise<void> {
  const result = await callAgent("job.capture", {
    url: getInput("job-url").value.trim(),
    source: getInput("job-source").value.trim() || "popup"
  });

  setJobId(result.jobId);
  renderSummary(null);
  setRunStatus("Job captured");
}

async function startJob(): Promise<void> {
  if (!state.jobId) {
    await captureJob();
  }

  connectToEvents();
  await callAgent("job.start", {
    jobId: state.jobId
  });
}

async function submitPendingField(): Promise<void> {
  if (!state.jobId || !state.pendingRequestId) {
    return;
  }

  await callAgent("field.provide", {
    jobId: state.jobId,
    requestId: state.pendingRequestId,
    value: getTextArea("need-field-value").value.trim(),
    save: getInput("save-answer").checked
  });
  hideNeedField();
}

function useCurrentTab(): void {
  chrome?.tabs?.query({ active: true, currentWindow: true }, (tabs) => {
    const url = tabs[0]?.url;

    if (url) {
      getInput("job-url").value = url;
    }
  });
}

function restoreState(): void {
  getInput("secret").value = localStorage.getItem("secret") ?? "";
  setJobId(localStorage.getItem("jobId") ?? "");
}

function bindEvents(): void {
  getInput("secret").addEventListener("input", () => {
    localStorage.setItem("secret", getInput("secret").value.trim());
  });

  document.getElementById("capture-tab")!.addEventListener("click", useCurrentTab);
  document.getElementById("capture-job")!.addEventListener("click", () => {
    captureJob().catch((error) => {
      setRunStatus(error instanceof Error ? error.message : "Failed to capture job");
    });
  });
  document.getElementById("start-job")!.addEventListener("click", () => {
    startJob().catch((error) => {
      setRunStatus(error instanceof Error ? error.message : "Failed to start job");
    });
  });
  document.getElementById("load-profile")!.addEventListener("click", () => {
    loadProfile().catch((error) => {
      setRunStatus(error instanceof Error ? error.message : "Failed to load profile");
    });
  });
  document.getElementById("save-profile")!.addEventListener("click", () => {
    saveProfile().catch((error) => {
      setRunStatus(error instanceof Error ? error.message : "Failed to save profile");
    });
  });
  document.getElementById("submit-field")!.addEventListener("click", () => {
    submitPendingField().catch((error) => {
      setRunStatus(error instanceof Error ? error.message : "Failed to resume run");
    });
  });
}

restoreState();
bindEvents();
