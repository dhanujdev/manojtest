import { z } from 'zod';

export const AddressSchema = z.object({
  street: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  country: z.string().optional()
});

export const WorkAuthSchema = z.object({
  authorized_country: z.string().optional(),
  sponsorship_required: z.boolean().optional()
});

export const LinksSchema = z.object({
  linkedin: z.string().url().optional(),
  github: z.string().url().optional(),
  portfolio: z.string().url().optional()
});

export const EmploymentHistoryItemSchema = z.object({
  company: z.string().optional(),
  title: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional(),
  description: z.string().optional()
});

export const EducationItemSchema = z.object({
  school: z.string().optional(),
  degree: z.string().optional(),
  field_of_study: z.string().optional(),
  start_date: z.string().optional(),
  end_date: z.string().optional()
});

export const PreferencesSchema = z.object({
  salary_range: z.string().optional(),
  remote_ok: z.boolean().optional(),
  relocation_ok: z.boolean().optional()
});

export const UserProfileSchema = z.object({
  identity: z.object({
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional()
  }),
  address: AddressSchema.optional(),
  work_auth: WorkAuthSchema.optional(),
  links: LinksSchema.optional(),
  employment_history: z.array(EmploymentHistoryItemSchema).default([]),
  education: z.array(EducationItemSchema).default([]),
  skills: z.array(z.string()).default([]),
  preferences: PreferencesSchema.optional(),
  custom_fields: z.record(z.any()).default({})
});
