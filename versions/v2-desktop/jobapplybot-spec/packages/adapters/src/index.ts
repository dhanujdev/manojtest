import { createHash } from "node:crypto";
import { JSDOM } from "jsdom";

import { isSubmitLabel, type Field, type FieldInputType, type PortalType } from "@jobapplybot/protocol";

export interface AdapterInput {
  url: URL;
  html: string;
}

export interface FieldOptionBinding {
  label: string;
  selector: string;
  value?: string;
}

export interface FieldBinding {
  signatureHash: string;
  inputType: FieldInputType;
  selector?: string;
  optionBindings?: FieldOptionBinding[];
}

export interface AdapterModel {
  portalType: PortalType;
  adapterName: string;
  company: string;
  title: string;
  fields: Field[];
  bindings: FieldBinding[];
  finalStepDetected: boolean;
  submitButtonLabel?: string;
  nextButtonLabel?: string;
  htmlSnapshot: string;
}

export interface PortalAdapter {
  readonly portalType: PortalType;
  readonly adapterName: string;
  canHandle(url: URL): boolean;
  buildModel(input: AdapterInput): AdapterModel;
}

const nextLabels = new Set(["next", "continue", "review", "save and continue"]);

function slugToTitle(slug?: string): string {
  if (!slug) {
    return "Untitled Role";
  }

  return slug
    .split(/[-_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function normalizeText(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function escapeAttribute(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function buildSelectorSegment(element: Element): string {
  const tagName = element.tagName.toLowerCase();
  const id = normalizeText(element.getAttribute("id"));

  if (id) {
    return `${tagName}[id="${escapeAttribute(id)}"]`;
  }

  let segment = tagName;
  const name = normalizeText(element.getAttribute("name"));

  if (name) {
    segment += `[name="${escapeAttribute(name)}"]`;
  }

  if (tagName === "input") {
    const type = normalizeText(element.getAttribute("type"));

    if (type) {
      segment += `[type="${escapeAttribute(type)}"]`;
    }
  }

  const parent = element.parentElement;

  if (parent) {
    const sameTagSiblings = Array.from(parent.children).filter((child) => child.tagName === element.tagName);

    if (sameTagSiblings.length > 1) {
      segment += `:nth-of-type(${sameTagSiblings.indexOf(element) + 1})`;
    }
  }

  return segment;
}

function buildCssPath(element: Element, root: Element): string {
  const segments: string[] = [];
  let current: Element | null = element;

  while (current) {
    segments.unshift(buildSelectorSegment(current));

    if (current === root) {
      break;
    }

    current = current.parentElement;
  }

  return segments.join(" > ");
}

export function normalizeLabel(label: string): string {
  return normalizeText(label)
    .toLowerCase()
    .replace(/[^\w\s]/g, "")
    .replace(/\s+/g, " ");
}

export function computeFieldSignature(
  label: string,
  inputType: FieldInputType,
  options: string[] = [],
  metadata: { name?: string; id?: string; sectionLabel?: string } = {}
): string {
  const payload = JSON.stringify({
    label: normalizeLabel(label),
    inputType,
    name: normalizeLabel(metadata.name ?? ""),
    id: normalizeLabel(metadata.id ?? ""),
    sectionLabel: normalizeLabel(metadata.sectionLabel ?? ""),
    options: [...options].map((option) => normalizeLabel(option)).sort()
  });

  return createHash("sha256").update(payload).digest("hex");
}

function readTextContent(node: Element | null): string {
  return normalizeText(node?.textContent);
}

function findLabelForElement(element: Element, form: Element): string {
  const id = element.getAttribute("id");

  if (id) {
    const labels = Array.from(form.querySelectorAll("label"));
    const explicit = labels.find((label) => label.getAttribute("for") === id);

    if (explicit) {
      const text = readTextContent(explicit);

      if (text) {
        return text;
      }
    }
  }

  const wrappingLabel = element.closest("label");

  if (wrappingLabel) {
    const text = readTextContent(wrappingLabel);

    if (text) {
      return text;
    }
  }

  const ariaLabel = normalizeText(element.getAttribute("aria-label"));

  if (ariaLabel) {
    return ariaLabel;
  }

  const placeholder = normalizeText(element.getAttribute("placeholder"));

  if (placeholder) {
    return placeholder;
  }

  const name = normalizeText(element.getAttribute("name"));

  if (name) {
    return name;
  }

  return normalizeText(element.getAttribute("id")) || "Unnamed Field";
}

function findSectionLabel(element: Element): string | undefined {
  const fieldset = element.closest("fieldset");
  const legend = fieldset?.querySelector("legend");
  const text = readTextContent(legend ?? null);

  return text || undefined;
}

function isRequired(element: Element, label: string): boolean {
  if (element.hasAttribute("required")) {
    return true;
  }

  if (element.getAttribute("aria-required") === "true") {
    return true;
  }

  return label.includes("*");
}

function toFieldInputType(element: Element): FieldInputType | null {
  const tagName = element.tagName.toLowerCase();

  if (tagName === "textarea") {
    return "textarea";
  }

  if (tagName === "select") {
    return "select";
  }

  if (tagName !== "input") {
    return null;
  }

  const rawType = normalizeText(element.getAttribute("type")).toLowerCase();

  if (!rawType || rawType === "text") {
    return "text";
  }

  if (rawType === "email" || rawType === "tel" || rawType === "number" || rawType === "date") {
    return rawType;
  }

  if (rawType === "radio") {
    return "radio";
  }

  if (rawType === "checkbox") {
    return "checkbox";
  }

  if (rawType === "file") {
    return "file";
  }

  if (rawType === "search" || rawType === "url" || rawType === "password") {
    return "text";
  }

  if (["hidden", "submit", "button", "reset", "image"].includes(rawType)) {
    return null;
  }

  return "text";
}

function extractOptionsForSelect(element: Element): string[] {
  return Array.from(element.querySelectorAll("option"))
    .map((option) => normalizeText(option.textContent))
    .filter(Boolean)
    .slice(0, 50);
}

function createField(
  label: string,
  inputType: FieldInputType,
  required: boolean,
  options: string[] = [],
  metadata: { name?: string; id?: string; sectionLabel?: string } = {}
): Field {
  const uniqueOptions = [...new Set(options.map((option) => normalizeText(option)).filter(Boolean))].slice(0, 50);

  return {
    label: normalizeText(label) || "Unnamed Field",
    inputType,
    required,
    options: uniqueOptions.length > 0 ? uniqueOptions : undefined,
    signatureHash: computeFieldSignature(label, inputType, uniqueOptions, metadata)
  };
}

function deriveButtons(form: Element): { finalStepDetected: boolean; submitButtonLabel?: string; nextButtonLabel?: string } {
  let submitButtonLabel: string | undefined;
  let nextButtonLabel: string | undefined;

  const controls = Array.from(form.querySelectorAll("button, input[type='submit'], input[type='button']"));

  for (const control of controls) {
    const label =
      control.tagName.toLowerCase() === "input"
        ? normalizeText(control.getAttribute("value"))
        : readTextContent(control);

    if (!label) {
      continue;
    }

    const normalized = normalizeLabel(label);

    if (!submitButtonLabel && isSubmitLabel(label)) {
      submitButtonLabel = label;
    }

    if (!nextButtonLabel && nextLabels.has(normalized)) {
      nextButtonLabel = label;
    }
  }

  return {
    finalStepDetected: Boolean(submitButtonLabel),
    submitButtonLabel,
    nextButtonLabel
  };
}

function extractFields(form: Element): { fields: Field[]; bindings: FieldBinding[] } {
  const fields: Field[] = [];
  const bindings: FieldBinding[] = [];
  const radioGroups = new Map<string, Element[]>();
  const checkboxGroups = new Map<string, Element[]>();

  for (const element of Array.from(form.querySelectorAll("input, select, textarea"))) {
    if (element.hasAttribute("disabled")) {
      continue;
    }

    const inputType = toFieldInputType(element);

    if (!inputType) {
      continue;
    }

    const label = findLabelForElement(element, form);
    const sectionLabel = findSectionLabel(element);
    const metadata = {
      name: normalizeText(element.getAttribute("name")),
      id: normalizeText(element.getAttribute("id")),
      sectionLabel
    };

    if (inputType === "radio") {
      const key = metadata.name || metadata.id || label;
      const existing = radioGroups.get(key) ?? [];
      existing.push(element);
      radioGroups.set(key, existing);
      continue;
    }

    if (inputType === "checkbox") {
      const key = metadata.name || metadata.id || label;
      const existing = checkboxGroups.get(key) ?? [];
      existing.push(element);
      checkboxGroups.set(key, existing);
      continue;
    }

    const options = inputType === "select" ? extractOptionsForSelect(element) : [];
    const field = createField(label, inputType, isRequired(element, label), options, metadata);

    fields.push(field);
    bindings.push({
      signatureHash: field.signatureHash,
      inputType,
      selector: buildCssPath(element, form)
    });
  }

  for (const [groupKey, elements] of radioGroups.entries()) {
    const first = elements[0];
    const firstLabel = findLabelForElement(first, form);
    const sectionLabel = findSectionLabel(first);
    const optionBindings: FieldOptionBinding[] = [];
    const options = elements.map((element) => {
      const explicitValue = normalizeText(element.getAttribute("value"));
      const optionLabel = findLabelForElement(element, form);
      const resolvedLabel = optionLabel === firstLabel ? explicitValue || optionLabel : optionLabel;

      optionBindings.push({
        label: resolvedLabel,
        selector: buildCssPath(element, form),
        value: explicitValue || undefined
      });

      return resolvedLabel;
    });

    const field = createField(firstLabel, "radio", elements.some((element) => isRequired(element, firstLabel)), options, {
      name: groupKey,
      id: normalizeText(first.getAttribute("id")),
      sectionLabel
    });

    fields.push(field);
    bindings.push({
      signatureHash: field.signatureHash,
      inputType: "radio",
      optionBindings
    });
  }

  for (const [groupKey, elements] of checkboxGroups.entries()) {
    const first = elements[0];
    const firstLabel = findLabelForElement(first, form);
    const sectionLabel = findSectionLabel(first);
    const optionBindings: FieldOptionBinding[] = [];
    const options =
      elements.length > 1
        ? elements.map((element) => {
            const explicitValue = normalizeText(element.getAttribute("value"));
            const optionLabel = findLabelForElement(element, form);
            const resolvedLabel = optionLabel === firstLabel ? explicitValue || optionLabel : optionLabel;

            optionBindings.push({
              label: resolvedLabel,
              selector: buildCssPath(element, form),
              value: explicitValue || undefined
            });

            return resolvedLabel;
          })
        : [];

    if (elements.length === 1) {
      optionBindings.push({
        label: firstLabel,
        selector: buildCssPath(first, form),
        value: normalizeText(first.getAttribute("value")) || undefined
      });
    }

    const field = createField(firstLabel, "checkbox", elements.some((element) => isRequired(element, firstLabel)), options, {
      name: groupKey,
      id: normalizeText(first.getAttribute("id")),
      sectionLabel
    });

    fields.push(field);
    bindings.push({
      signatureHash: field.signatureHash,
      inputType: "checkbox",
      optionBindings
    });
  }

  return {
    fields,
    bindings
  };
}

function resolveTitle(document: Document, url: URL): string {
  const heading = readTextContent(document.querySelector("h1"));

  if (heading) {
    return heading;
  }

  const titleTag = normalizeText(document.title);

  if (titleTag) {
    return titleTag;
  }

  const segments = url.pathname.split("/").filter(Boolean);
  return slugToTitle(segments.at(-1));
}

function resolveCompany(url: URL, fallback: string): string {
  const segments = url.pathname.split("/").filter(Boolean);

  if (segments.length > 0) {
    return segments[0];
  }

  return url.hostname || fallback;
}

function extractModel(input: AdapterInput, adapterName: string, portalType: PortalType): AdapterModel {
  const dom = new JSDOM(input.html);
  const document = dom.window.document;
  const form =
    document.querySelector("form#application_form") ??
    document.querySelector("form[data-qa='application-form']") ??
    document.querySelector("form");

  if (!form) {
    throw new Error("Application form not found");
  }

  const extracted = extractFields(form);
  const buttons = deriveButtons(form);

  return {
    portalType,
    adapterName,
    company: resolveCompany(input.url, portalType),
    title: resolveTitle(document, input.url),
    fields: extracted.fields,
    bindings: extracted.bindings,
    finalStepDetected: buttons.finalStepDetected,
    submitButtonLabel: buttons.submitButtonLabel,
    nextButtonLabel: buttons.nextButtonLabel,
    htmlSnapshot: input.html
  };
}

const greenhouseAdapter: PortalAdapter = {
  portalType: "greenhouse",
  adapterName: "GreenhouseAdapter",
  canHandle(url) {
    return (
      url.hostname === "boards.greenhouse.io" ||
      url.hostname === "job-boards.greenhouse.io" ||
      /greenhouse/i.test(url.pathname)
    );
  },
  buildModel(input) {
    return extractModel(input, "GreenhouseAdapter", "greenhouse");
  }
};

const leverAdapter: PortalAdapter = {
  portalType: "lever",
  adapterName: "LeverAdapter",
  canHandle(url) {
    return url.hostname === "jobs.lever.co" || url.hostname.endsWith(".lever.co") || /lever/i.test(url.pathname);
  },
  buildModel(input) {
    return extractModel(input, "LeverAdapter", "lever");
  }
};

const adapters: PortalAdapter[] = [greenhouseAdapter, leverAdapter];

export function getAdapterForUrl(rawUrl: string): PortalAdapter | null {
  const parsed = new URL(rawUrl);
  return adapters.find((adapter) => adapter.canHandle(parsed)) ?? null;
}

export function listAdapters(): PortalAdapter[] {
  return [...adapters];
}
