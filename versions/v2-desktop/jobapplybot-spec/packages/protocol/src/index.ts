import { z } from "zod";

export const fieldInputTypes = [
  "text",
  "email",
  "tel",
  "number",
  "date",
  "select",
  "radio",
  "checkbox",
  "file",
  "textarea"
] as const;

export const jobStates = [
  "captured",
  "running",
  "paused",
  "ready_to_submit",
  "failed",
  "completed"
] as const;

export const portalTypes = ["greenhouse", "lever", "unknown"] as const;

export const fieldValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.array(z.string())
]);

export type FieldValue = z.infer<typeof fieldValueSchema>;
export type FieldInputType = (typeof fieldInputTypes)[number];
export type JobState = (typeof jobStates)[number];
export type PortalType = (typeof portalTypes)[number];

export const fieldSchema = z.object({
  label: z.string().min(1),
  inputType: z.enum(fieldInputTypes),
  required: z.boolean(),
  options: z.array(z.string().min(1)).max(50).optional(),
  signatureHash: z.string().min(16)
});

export type Field = z.infer<typeof fieldSchema>;

export const jobSummarySchema = z.object({
  jobId: z.string().uuid(),
  url: z.string().url(),
  portalType: z.enum(portalTypes),
  status: z.enum(jobStates),
  adapterName: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  finalStepDetected: z.boolean(),
  fields: z.array(fieldSchema),
  filledValues: z.record(fieldValueSchema),
  pendingRequestId: z.string().uuid().optional(),
  lastError: z.string().optional()
});

export type JobSummary = z.infer<typeof jobSummarySchema>;

export const captureJobCommandSchema = z.object({
  command: z.literal("job.capture"),
  payload: z.object({
    url: z.string().url(),
    source: z.string().min(1)
  })
});

export const startJobCommandSchema = z.object({
  command: z.literal("job.start"),
  payload: z.object({
    jobId: z.string().uuid()
  })
});

export const provideFieldCommandSchema = z.object({
  command: z.literal("field.provide"),
  payload: z.object({
    jobId: z.string().uuid(),
    requestId: z.string().uuid(),
    value: fieldValueSchema,
    save: z.boolean().optional()
  })
});

export const profileGetCommandSchema = z.object({
  command: z.literal("profile.get"),
  payload: z.object({}).optional()
});

export const profileSetCommandSchema = z.object({
  command: z.literal("profile.set"),
  payload: z.object({
    data: z.record(z.string())
  })
});

export const customValuesListCommandSchema = z.object({
  command: z.literal("custom_values.list"),
  payload: z.object({}).optional()
});

export const customValuesDeleteCommandSchema = z.object({
  command: z.literal("custom_values.delete"),
  payload: z.object({
    signatureHash: z.string().min(16)
  })
});

export const jobSummaryCommandSchema = z.object({
  command: z.literal("job.summary"),
  payload: z.object({
    jobId: z.string().uuid()
  })
});

export const commandSchema = z.discriminatedUnion("command", [
  captureJobCommandSchema,
  startJobCommandSchema,
  provideFieldCommandSchema,
  profileGetCommandSchema,
  profileSetCommandSchema,
  customValuesListCommandSchema,
  customValuesDeleteCommandSchema,
  jobSummaryCommandSchema
]);

export type AgentCommand = z.infer<typeof commandSchema>;

export const statusEventSchema = z.object({
  type: z.literal("status"),
  data: z.object({
    state: z.enum(jobStates),
    portalType: z.enum(portalTypes),
    adapterName: z.string().optional(),
    message: z.string().optional(),
    fieldsCount: z.number().int().nonnegative().optional(),
    error: z.string().optional()
  })
});

export const fieldsReadyEventSchema = z.object({
  type: z.literal("fields_ready"),
  data: z.object({
    jobId: z.string().uuid(),
    fields: z.array(fieldSchema)
  })
});

export const needFieldEventSchema = z.object({
  type: z.literal("need_field"),
  data: z.object({
    jobId: z.string().uuid(),
    requestId: z.string().uuid(),
    field: fieldSchema,
    reason: z.string().min(1)
  })
});

export const agentEventSchema = z.discriminatedUnion("type", [
  statusEventSchema,
  fieldsReadyEventSchema,
  needFieldEventSchema
]);

export type AgentEvent = z.infer<typeof agentEventSchema>;

const submitLabels = new Set([
  "submit",
  "submit application",
  "apply",
  "send application"
]);

export function parseCommand(input: unknown): AgentCommand {
  return commandSchema.parse(input);
}

export function parseEvent(input: unknown): AgentEvent {
  return agentEventSchema.parse(input);
}

export function isSubmitLabel(label: string): boolean {
  return submitLabels.has(label.trim().toLowerCase().replace(/\s+/g, " "));
}

export function toSseMessage(event: AgentEvent): string {
  return `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`;
}
