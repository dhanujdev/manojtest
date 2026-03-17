import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { getAdapterForUrl, normalizeLabel, type FieldBinding } from "@jobapplybot/adapters";
import type { AgentEvent, Field, FieldValue } from "@jobapplybot/protocol";
import { FileBackedStore } from "@jobapplybot/storage";
import { chromium, type BrowserContext, type Page } from "playwright-core";

type EmitEvent = (event: AgentEvent) => void;

interface LiveBrowserSession {
  context: BrowserContext;
  page: Page;
}

interface RunSession {
  fields: Field[];
  pendingFields: Field[];
  filledValues: Record<string, FieldValue>;
  portalType: "greenhouse" | "lever" | "unknown";
  adapterName?: string;
  company?: string;
  title?: string;
  currentRequestId?: string;
  finalStepDetected: boolean;
  submitButtonLabel?: string;
  nextButtonLabel?: string;
  htmlSnapshot: string;
  jobUrl: URL;
  stepCount: number;
  bindings: Map<string, FieldBinding>;
  browser?: LiveBrowserSession;
}

export interface RunnerConfig {
  browserChannel?: string;
  browserExecutablePath?: string;
  browserHeadless?: boolean;
  browserProfileDir?: string;
  enableLiveBrowser?: boolean;
  stepLimit?: number;
}

function normalizeValue(value: FieldValue): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "boolean") {
    return value ? ["true"] : ["false"];
  }

  return [String(value).trim()].filter(Boolean);
}

function normalizeComparison(value: string): string {
  return normalizeLabel(value);
}

function escapeForCssAttribute(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export class JobRunner {
  private readonly sessions = new Map<string, RunSession>();

  private readonly config: Required<RunnerConfig>;

  constructor(private readonly store: FileBackedStore, config: RunnerConfig = {}) {
    this.config = {
      browserChannel: config.browserChannel ?? "chrome",
      browserExecutablePath: config.browserExecutablePath ?? "",
      browserHeadless: config.browserHeadless ?? false,
      browserProfileDir: config.browserProfileDir ?? path.join(process.cwd(), ".local", "browser-profile"),
      enableLiveBrowser: config.enableLiveBrowser ?? false,
      stepLimit: config.stepLimit ?? 10
    };
  }

  async captureJob(url: string, source: string): Promise<{ jobId: string }> {
    const jobId = randomUUID();
    const adapter = getAdapterForUrl(url);

    await this.store.createApplication({
      id: jobId,
      url,
      source,
      portalType: adapter?.portalType ?? "unknown",
      status: "captured"
    });

    return { jobId };
  }

  async startJob(jobId: string, emit: EmitEvent): Promise<void> {
    const application = await this.store.getApplication(jobId);

    if (!application) {
      throw new Error(`Unknown job id: ${jobId}`);
    }

    const adapter = getAdapterForUrl(application.url);

    if (!adapter) {
      await this.failJob(jobId, "Unsupported portal", emit);
      return;
    }

    const jobUrl = new URL(application.url);
    const session: RunSession = {
      fields: [],
      pendingFields: [],
      filledValues: {},
      portalType: application.portalType,
      finalStepDetected: false,
      htmlSnapshot: "",
      jobUrl,
      stepCount: 0,
      bindings: new Map(),
      browser: this.config.enableLiveBrowser ? await this.openBrowser(jobUrl) : undefined
    };

    this.sessions.set(jobId, session);
    await this.advanceJob(jobId, emit);
  }

  async provideField(
    jobId: string,
    requestId: string,
    value: FieldValue,
    save: boolean | undefined,
    emit: EmitEvent
  ): Promise<void> {
    const session = this.sessions.get(jobId);

    if (!session || session.currentRequestId !== requestId) {
      throw new Error("No matching pending field request");
    }

    const field = session.pendingFields.shift();

    if (!field) {
      throw new Error("No pending field found");
    }

    await this.applyValueToCurrentPage(session, field, value);
    session.filledValues[field.label] = value;
    session.currentRequestId = undefined;

    if (save) {
      await this.store.setCustomValue(field.signatureHash, value);
    }

    if (session.pendingFields.length > 0) {
      await this.store.updateApplication(jobId, (record) => ({
        ...record,
        status: "paused",
        filledValues: session.filledValues,
        pendingRequestId: undefined
      }));
      await this.emitNextRequest(jobId, emit);
      return;
    }

    await this.advanceJob(jobId, emit);
  }

  async getSummary(jobId: string) {
    return this.store.getJobSummary(jobId);
  }

  private async advanceJob(jobId: string, emit: EmitEvent): Promise<void> {
    const application = await this.store.getApplication(jobId);
    const session = this.sessions.get(jobId);

    if (!application || !session) {
      throw new Error(`Unknown job id: ${jobId}`);
    }

    if (session.stepCount >= this.config.stepLimit) {
      await this.failJob(jobId, `Exceeded max supported steps (${this.config.stepLimit})`, emit);
      return;
    }

    const adapter = getAdapterForUrl(application.url);

    if (!adapter) {
      await this.failJob(jobId, "Unsupported portal", emit);
      return;
    }

    const html = await this.loadCurrentHtml(session);
    const model = adapter.buildModel({
      url: session.jobUrl,
      html
    });

    session.fields = model.fields;
    session.portalType = model.portalType;
    session.adapterName = model.adapterName;
    session.company = model.company;
    session.title = model.title;
    session.finalStepDetected = model.finalStepDetected;
    session.submitButtonLabel = model.submitButtonLabel;
    session.nextButtonLabel = model.nextButtonLabel;
    session.htmlSnapshot = model.htmlSnapshot;
    session.bindings = new Map(model.bindings.map((binding) => [binding.signatureHash, binding]));
    session.pendingFields = [];
    session.stepCount += 1;

    await this.captureArtifacts(jobId, session);

    const profile = await this.store.getProfile();

    for (const field of model.fields) {
      const existingValue = session.filledValues[field.label];
      const resolvedValue =
        existingValue !== undefined ? existingValue : await this.resolveFieldValue(field, profile);

      if (resolvedValue === null || resolvedValue === "") {
        if (field.required) {
          session.pendingFields.push(field);
        }
        continue;
      }

      try {
        await this.applyValueToCurrentPage(session, field, resolvedValue);
        session.filledValues[field.label] = resolvedValue;
      } catch (error) {
        await this.failJob(
          jobId,
          error instanceof Error ? error.message : `Failed to fill field: ${field.label}`,
          emit
        );
        return;
      }
    }

    await this.store.updateApplication(jobId, (record) => ({
      ...record,
      portalType: model.portalType,
      adapterName: model.adapterName,
      company: model.company,
      title: model.title,
      status: "running",
      finalStepDetected: false,
      fields: model.fields,
      filledValues: session.filledValues,
      pendingRequestId: undefined,
      lastError: undefined
    }));

    emit({
      type: "status",
      data: {
        state: "running",
        portalType: model.portalType,
        adapterName: model.adapterName,
        message: `Processing step ${session.stepCount}`,
        fieldsCount: model.fields.length
      }
    });
    emit({
      type: "fields_ready",
      data: {
        jobId,
        fields: model.fields
      }
    });

    if (session.pendingFields.length > 0) {
      await this.emitNextRequest(jobId, emit);
      return;
    }

    if (session.finalStepDetected) {
      await this.completeToReview(jobId, emit);
      return;
    }

    if (session.browser && session.nextButtonLabel) {
      try {
        await this.clickNextStep(session);
        await this.advanceJob(jobId, emit);
      } catch (error) {
        await this.failJob(
          jobId,
          error instanceof Error ? error.message : `Failed to advance using ${session.nextButtonLabel}`,
          emit
        );
      }
      return;
    }

    const reason = session.nextButtonLabel
      ? `Detected multi-step flow requiring browser navigation: ${session.nextButtonLabel}`
      : "Submit step not detected on the current page";

    await this.failJob(jobId, reason, emit);
  }

  private async resolveFieldValue(field: Field, profile: Record<string, string>): Promise<FieldValue | null> {
    const mappedProfileValue = this.getProfileValue(field, profile);

    if (mappedProfileValue) {
      return mappedProfileValue;
    }

    return this.store.getCustomValue(field.signatureHash);
  }

  private getProfileValue(field: Field, profile: Record<string, string>): string | null {
    const label = normalizeLabel(field.label);

    if (label.includes("full name")) {
      const fallbackName = [profile.firstName, profile.lastName].filter(Boolean).join(" ").trim();
      return profile.fullName ?? (fallbackName || null);
    }

    if (label === "email") {
      return profile.email ?? null;
    }

    if (label === "phone") {
      return profile.phone ?? null;
    }

    if (label.includes("linkedin")) {
      return profile.linkedin ?? null;
    }

    return null;
  }

  private async emitNextRequest(jobId: string, emit: EmitEvent): Promise<void> {
    const session = this.sessions.get(jobId);

    if (!session || session.pendingFields.length === 0) {
      return;
    }

    const nextField = session.pendingFields[0];
    const requestId = randomUUID();
    session.currentRequestId = requestId;

    await this.store.updateApplication(jobId, (record) => ({
      ...record,
      status: "paused",
      pendingRequestId: requestId,
      filledValues: session.filledValues
    }));

    emit({
      type: "status",
      data: {
        state: "paused",
        portalType: session.portalType,
        adapterName: session.adapterName,
        message: `Waiting for: ${nextField.label}`,
        fieldsCount: session.fields.length
      }
    });
    emit({
      type: "need_field",
      data: {
        jobId,
        requestId,
        field: nextField,
        reason: "Missing required value"
      }
    });
  }

  private async completeToReview(jobId: string, emit: EmitEvent): Promise<void> {
    const session = this.sessions.get(jobId);

    if (!session) {
      return;
    }

    await this.store.updateApplication(jobId, (record) => ({
      ...record,
      status: "ready_to_submit",
      finalStepDetected: true,
      fields: session.fields,
      filledValues: session.filledValues,
      pendingRequestId: undefined
    }));

    await this.store.writeArtifact(jobId, `${jobId}-review.html`, session.htmlSnapshot, "HTML_SNAPSHOT");

    if (session.browser) {
      const image = await session.browser.page.screenshot({ fullPage: true, type: "png" });
      await this.store.writeArtifact(jobId, `${jobId}-review.png`, image, "SCREENSHOT");
    }

    emit({
      type: "status",
      data: {
        state: "ready_to_submit",
        portalType: session.portalType,
        adapterName: session.adapterName,
        message: session.submitButtonLabel
          ? `Final step detected: ${session.submitButtonLabel}. Review before submitting.`
          : "Final step detected. Review before submitting.",
        fieldsCount: session.fields.length
      }
    });
  }

  private async failJob(jobId: string, error: string, emit: EmitEvent): Promise<void> {
    const record = await this.store.updateApplication(jobId, (application) => ({
      ...application,
      status: "failed",
      lastError: error
    }));

    await this.store.writeArtifact(jobId, `${jobId}-error.log`, error, "LOG");

    emit({
      type: "status",
      data: {
        state: "failed",
        portalType: record?.portalType ?? "unknown",
        adapterName: record?.adapterName,
        error,
        message: error
      }
    });
  }

  private async loadCurrentHtml(session: RunSession): Promise<string> {
    if (session.browser) {
      return session.browser.page.content();
    }

    return this.loadPageHtml(session.jobUrl);
  }

  private async loadPageHtml(url: URL): Promise<string> {
    if (url.protocol === "file:") {
      return readFile(fileURLToPath(url), "utf8");
    }

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      throw new Error(`Unsupported URL protocol: ${url.protocol}`);
    }

    const response = await fetch(url, {
      headers: {
        "user-agent": "JobApplyBot/0.1"
      },
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`Failed to load application page: ${response.status} ${response.statusText}`);
    }

    return response.text();
  }

  private async openBrowser(url: URL): Promise<LiveBrowserSession> {
    await mkdir(this.config.browserProfileDir, { recursive: true });

    const launchOptions = {
      channel: this.config.browserChannel || undefined,
      executablePath: this.config.browserExecutablePath || undefined,
      headless: this.config.browserHeadless
    };

    const context = await chromium.launchPersistentContext(this.config.browserProfileDir, launchOptions);
    const page = context.pages()[0] ?? (await context.newPage());

    await page.goto(url.toString(), {
      waitUntil: "domcontentloaded"
    });
    await page.waitForTimeout(250);

    return {
      context,
      page
    };
  }

  private async captureArtifacts(jobId: string, session: RunSession): Promise<void> {
    await this.store.writeArtifact(jobId, `${jobId}-step-${session.stepCount}.html`, session.htmlSnapshot, "HTML_SNAPSHOT");

    if (!session.browser) {
      return;
    }

    const image = await session.browser.page.screenshot({ fullPage: true, type: "png" });
    await this.store.writeArtifact(jobId, `${jobId}-step-${session.stepCount}.png`, image, "SCREENSHOT");
  }

  private async clickNextStep(session: RunSession): Promise<void> {
    if (!session.browser || !session.nextButtonLabel) {
      throw new Error("No live browser step available to advance");
    }

    const page = session.browser.page;
    const labelPattern = new RegExp(`^\\s*${escapeRegExp(session.nextButtonLabel)}\\s*$`, "i");
    const buttonByRole = page.getByRole("button", { name: labelPattern }).first();

    if ((await buttonByRole.count()) > 0) {
      await buttonByRole.click();
    } else {
      const escapedLabel = escapeForCssAttribute(session.nextButtonLabel);
      const fallback = page
        .locator(
          `input[type="button"][value="${escapedLabel}"], input[type="submit"][value="${escapedLabel}"]`
        )
        .first();

      if ((await fallback.count()) === 0) {
        throw new Error(`Next button not found: ${session.nextButtonLabel}`);
      }

      await fallback.click();
    }

    await page.waitForLoadState("domcontentloaded");
    await page.waitForTimeout(250);
  }

  private async applyValueToCurrentPage(session: RunSession, field: Field, value: FieldValue): Promise<void> {
    if (!session.browser) {
      return;
    }

    const binding = session.bindings.get(field.signatureHash);

    if (!binding) {
      throw new Error(`No selector binding found for field: ${field.label}`);
    }

    const page = session.browser.page;

    if (binding.inputType === "radio") {
      const target = normalizeValue(value)[0];
      const optionBinding = binding.optionBindings?.find((option) => {
        const candidates = [option.label, option.value ?? ""].filter(Boolean);
        return candidates.some((candidate) => normalizeComparison(candidate) === normalizeComparison(target));
      });

      if (!optionBinding) {
        throw new Error(`No radio option matched "${target}" for field: ${field.label}`);
      }

      await page.locator(optionBinding.selector).first().check();
      return;
    }

    if (binding.inputType === "checkbox") {
      const targets = normalizeValue(value).map(normalizeComparison);
      const optionBindings = binding.optionBindings ?? [];

      if (optionBindings.length === 0 && binding.selector) {
        if (targets.includes("true") || targets.includes("yes") || targets.includes("1")) {
          await page.locator(binding.selector).first().check();
        } else {
          await page.locator(binding.selector).first().uncheck();
        }
        return;
      }

      for (const option of optionBindings) {
        const candidates = [option.label, option.value ?? ""].filter(Boolean).map(normalizeComparison);
        const shouldCheck = targets.some((target) => candidates.includes(target));
        const locator = page.locator(option.selector).first();

        if (shouldCheck) {
          await locator.check();
        } else {
          await locator.uncheck();
        }
      }

      return;
    }

    if (!binding.selector) {
      throw new Error(`No selector binding found for field: ${field.label}`);
    }

    const locator = page.locator(binding.selector).first();

    switch (binding.inputType) {
      case "text":
      case "email":
      case "tel":
      case "number":
      case "date":
      case "textarea": {
        await locator.fill(normalizeValue(value)[0] ?? "");
        return;
      }
      case "select": {
        const target = normalizeValue(value)[0] ?? "";

        try {
          await locator.selectOption({ label: target });
        } catch {
          await locator.selectOption(target);
        }
        return;
      }
      case "file": {
        const filePath = normalizeValue(value)[0];

        if (!filePath) {
          throw new Error(`File input requires a path for field: ${field.label}`);
        }

        await locator.setInputFiles(filePath);
        return;
      }
      default: {
        throw new Error(`Unsupported input type: ${binding.inputType}`);
      }
    }
  }
}
