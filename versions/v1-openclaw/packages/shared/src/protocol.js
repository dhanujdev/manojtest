import { z } from 'zod';

// Messages extension <-> local agent

export const CaptureJobRequest = z.object({
  type: z.literal('job.capture'),
  url: z.string().url()
});

export const StartJobRequest = z.object({
  type: z.literal('job.start'),
  jobId: z.string()
});

export const ProvideFieldRequest = z.object({
  type: z.literal('field.provide'),
  jobId: z.string(),
  requestId: z.string(),
  value: z.any(),
  save: z.boolean().optional()
});

export const ProfileGetRequest = z.object({
  type: z.literal('profile.get')
});

export const ProfileSetRequest = z.object({
  type: z.literal('profile.set'),
  data: z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string(),
    phone: z.string().optional(),
    linkedin: z.string().optional(),
    github: z.string().optional(),
    portfolio: z.string().optional(),
    city: z.string().optional(),
    state: z.string().optional(),
    country: z.string().optional(),
    street: z.string().optional(),
    zipCode: z.string().optional(),
    workAuthorization: z.string().optional(),
    requiresSponsorship: z.boolean().optional(),
    currentCompany: z.string().optional(),
    currentTitle: z.string().optional(),
    salaryExpectation: z.string().optional(),
    skills: z.string().optional(),
    university: z.string().optional(),
    degree: z.string().optional(),
    graduationYear: z.string().optional()
  })
});

export const CustomValuesListRequest = z.object({
  type: z.literal('custom_values.list')
});

export const CustomValuesDeleteRequest = z.object({
  type: z.literal('custom_values.delete'),
  signatureHash: z.string()
});

export const JobSummaryRequest = z.object({
  type: z.literal('job.summary'),
  jobId: z.string()
});

export const AgentEvent = z.object({
  type: z.literal('event'),
  jobId: z.string(),
  state: z.string(),
  message: z.string().optional(),
  missingField: z
    .object({
      label: z.string(),
      required: z.boolean().default(false),
      suggestedKey: z.string().optional()
    })
    .optional()
});

export const AnyInbound = z.union([
  CaptureJobRequest,
  StartJobRequest,
  ProvideFieldRequest,
  ProfileGetRequest,
  ProfileSetRequest,
  CustomValuesListRequest,
  CustomValuesDeleteRequest,
  JobSummaryRequest
]);
