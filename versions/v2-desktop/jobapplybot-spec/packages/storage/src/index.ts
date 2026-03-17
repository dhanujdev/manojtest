import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

import type { Field, FieldValue, JobSummary, JobState, PortalType } from "@jobapplybot/protocol";

export interface ApplicationRecord {
  id: string;
  url: string;
  source: string;
  portalType: PortalType;
  adapterName?: string;
  company?: string;
  title?: string;
  status: JobState;
  createdAt: number;
  updatedAt: number;
  lastError?: string;
  finalStepDetected: boolean;
  fields: Field[];
  filledValues: Record<string, FieldValue>;
  pendingRequestId?: string;
}

export interface ArtifactRecord {
  id: string;
  applicationId: string;
  kind: "SCREENSHOT" | "HTML_SNAPSHOT" | "LOG";
  path: string;
  createdAt: number;
}

type CustomValueRow = {
  signature_hash: string;
  value: string;
};

type ApplicationRow = {
  id: string;
  url: string;
  source: string;
  portal_type: PortalType;
  adapter_name: string | null;
  company: string | null;
  title: string | null;
  status: JobState;
  created_at: number;
  updated_at: number;
  last_error: string | null;
  final_step_detected: number;
  fields_json: string;
  filled_values_json: string;
  pending_request_id: string | null;
};

type ArtifactRow = {
  id: string;
  application_id: string;
  kind: ArtifactRecord["kind"];
  path: string;
  created_at: number;
};

function now(): number {
  return Date.now();
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) {
    return fallback;
  }

  return JSON.parse(value) as T;
}

const migrations = [
  {
    name: "001-initial-schema",
    sql: `
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS profile (
        id TEXT PRIMARY KEY,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS custom_values (
        signature_hash TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS applications (
        id TEXT PRIMARY KEY,
        url TEXT NOT NULL,
        source TEXT NOT NULL,
        portal_type TEXT NOT NULL,
        adapter_name TEXT,
        company TEXT,
        title TEXT,
        status TEXT NOT NULL,
        final_step_detected INTEGER NOT NULL DEFAULT 0,
        fields_json TEXT NOT NULL,
        filled_values_json TEXT NOT NULL,
        pending_request_id TEXT,
        last_error TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS artifacts (
        id TEXT PRIMARY KEY,
        application_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        path TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY(application_id) REFERENCES applications(id)
      );
    `
  }
];

export class JobApplyBotStore {
  private readonly db: DatabaseSync;

  private readonly artifactsDir: string;

  constructor(private readonly rootDir: string) {
    mkdirSync(rootDir, { recursive: true });
    this.artifactsDir = path.join(rootDir, "artifacts");
    mkdirSync(this.artifactsDir, { recursive: true });
    this.db = new DatabaseSync(path.join(rootDir, "jobapplybot.sqlite"));
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.applyMigrations();
  }

  async getProfile(): Promise<Record<string, string>> {
    const row = this.db
      .prepare("SELECT data FROM profile WHERE id = ?")
      .get("default") as { data: string } | undefined;

    return parseJson(row?.data ?? null, {});
  }

  async setProfile(data: Record<string, string>): Promise<void> {
    this.db
      .prepare(
        `
          INSERT INTO profile (id, data, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            data = excluded.data,
            updated_at = excluded.updated_at
        `
      )
      .run("default", JSON.stringify(data), now());
  }

  async listCustomValues(): Promise<Array<{ signatureHash: string; value: FieldValue }>> {
    const rows = this.db
      .prepare("SELECT signature_hash, value FROM custom_values ORDER BY updated_at DESC")
      .all() as CustomValueRow[];

    return rows.map((row) => ({
      signatureHash: row.signature_hash,
      value: JSON.parse(row.value) as FieldValue
    }));
  }

  async getCustomValue(signatureHash: string): Promise<FieldValue | null> {
    const row = this.db
      .prepare("SELECT value FROM custom_values WHERE signature_hash = ?")
      .get(signatureHash) as { value: string } | undefined;

    return row ? (JSON.parse(row.value) as FieldValue) : null;
  }

  async setCustomValue(signatureHash: string, value: FieldValue): Promise<void> {
    this.db
      .prepare(
        `
          INSERT INTO custom_values (signature_hash, value, updated_at)
          VALUES (?, ?, ?)
          ON CONFLICT(signature_hash) DO UPDATE SET
            value = excluded.value,
            updated_at = excluded.updated_at
        `
      )
      .run(signatureHash, JSON.stringify(value), now());
  }

  async deleteCustomValue(signatureHash: string): Promise<boolean> {
    const result = this.db
      .prepare("DELETE FROM custom_values WHERE signature_hash = ?")
      .run(signatureHash);

    return result.changes > 0;
  }

  async createApplication(
    record: Pick<ApplicationRecord, "id" | "url" | "source" | "portalType" | "status">
  ): Promise<ApplicationRecord> {
    const createdAt = now();

    this.db
      .prepare(
        `
          INSERT INTO applications (
            id, url, source, portal_type, adapter_name, company, title, status,
            final_step_detected, fields_json, filled_values_json, pending_request_id,
            last_error, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, NULL, NULL, NULL, ?, 0, ?, ?, NULL, NULL, ?, ?)
        `
      )
      .run(record.id, record.url, record.source, record.portalType, record.status, "[]", "{}", createdAt, createdAt);

    const created = await this.getApplication(record.id);

    if (!created) {
      throw new Error("Failed to create application record");
    }

    return created;
  }

  async getApplication(jobId: string): Promise<ApplicationRecord | null> {
    const row = this.db
      .prepare("SELECT * FROM applications WHERE id = ?")
      .get(jobId) as ApplicationRow | undefined;

    return row ? this.mapApplicationRow(row) : null;
  }

  async updateApplication(
    jobId: string,
    updater: (record: ApplicationRecord) => ApplicationRecord
  ): Promise<ApplicationRecord | null> {
    const existing = await this.getApplication(jobId);

    if (!existing) {
      return null;
    }

    const updated = {
      ...updater(existing),
      updatedAt: now()
    };

    this.db
      .prepare(
        `
          UPDATE applications
          SET
            url = ?,
            source = ?,
            portal_type = ?,
            adapter_name = ?,
            company = ?,
            title = ?,
            status = ?,
            final_step_detected = ?,
            fields_json = ?,
            filled_values_json = ?,
            pending_request_id = ?,
            last_error = ?,
            updated_at = ?
          WHERE id = ?
        `
      )
      .run(
        updated.url,
        updated.source,
        updated.portalType,
        updated.adapterName ?? null,
        updated.company ?? null,
        updated.title ?? null,
        updated.status,
        updated.finalStepDetected ? 1 : 0,
        JSON.stringify(updated.fields),
        JSON.stringify(updated.filledValues),
        updated.pendingRequestId ?? null,
        updated.lastError ?? null,
        updated.updatedAt,
        jobId
      );

    return updated;
  }

  async addArtifact(record: ArtifactRecord): Promise<void> {
    this.db
      .prepare(
        `
          INSERT INTO artifacts (id, application_id, kind, path, created_at)
          VALUES (?, ?, ?, ?, ?)
        `
      )
      .run(record.id, record.applicationId, record.kind, record.path, record.createdAt);
  }

  async listArtifacts(applicationId: string): Promise<ArtifactRecord[]> {
    const rows = this.db
      .prepare("SELECT * FROM artifacts WHERE application_id = ? ORDER BY created_at ASC")
      .all(applicationId) as ArtifactRow[];

    return rows.map((row) => ({
      id: row.id,
      applicationId: row.application_id,
      kind: row.kind,
      path: row.path,
      createdAt: row.created_at
    }));
  }

  async writeArtifact(
    applicationId: string,
    baseName: string,
    content: string | Uint8Array,
    kind: ArtifactRecord["kind"]
  ): Promise<ArtifactRecord> {
    const id = `${applicationId}-${baseName}`;
    const filePath = path.join(this.artifactsDir, baseName);
    writeFileSync(filePath, content);

    const artifact: ArtifactRecord = {
      id,
      applicationId,
      kind,
      path: filePath,
      createdAt: now()
    };

    await this.addArtifact(artifact);
    return artifact;
  }

  async getJobSummary(jobId: string): Promise<JobSummary | null> {
    const application = await this.getApplication(jobId);

    if (!application) {
      return null;
    }

    return {
      jobId: application.id,
      url: application.url,
      portalType: application.portalType,
      status: application.status,
      adapterName: application.adapterName,
      company: application.company,
      title: application.title,
      finalStepDetected: application.finalStepDetected,
      fields: application.fields,
      filledValues: application.filledValues,
      pendingRequestId: application.pendingRequestId,
      lastError: application.lastError
    };
  }

  private applyMigrations(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS migrations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        applied_at INTEGER NOT NULL
      );
    `);

    for (const migration of migrations) {
      const existing = this.db
        .prepare("SELECT 1 FROM migrations WHERE name = ?")
        .get(migration.name) as { 1: number } | undefined;

      if (existing) {
        continue;
      }

      this.db.exec(migration.sql);
      this.db
        .prepare("INSERT INTO migrations (name, applied_at) VALUES (?, ?)")
        .run(migration.name, now());
    }
  }

  private mapApplicationRow(row: ApplicationRow): ApplicationRecord {
    return {
      id: row.id,
      url: row.url,
      source: row.source,
      portalType: row.portal_type,
      adapterName: row.adapter_name ?? undefined,
      company: row.company ?? undefined,
      title: row.title ?? undefined,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      lastError: row.last_error ?? undefined,
      finalStepDetected: row.final_step_detected === 1,
      fields: parseJson(row.fields_json, []),
      filledValues: parseJson(row.filled_values_json, {}),
      pendingRequestId: row.pending_request_id ?? undefined
    };
  }
}

export { JobApplyBotStore as FileBackedStore };
