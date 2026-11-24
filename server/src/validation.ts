import { z } from 'zod';
import { SESSION_CODE_DIGITS } from '@shared/constants.js';
import { AppError } from './errors.js';

const deviceSchema = z.object({
  name: z.string().min(1, 'Device name is required').max(80),
  platform: z.string().min(1).max(40),
  browser: z.string().min(1).max(40),
});

const tokenSchema = z
  .string()
  .min(20)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/, 'Malformed token');

const sessionIdSchema = z
  .string()
  .length(32)
  .regex(/^[a-f0-9]{32}$/, 'Malformed session id');

export const sessionCreateSchema = z.object({
  device: deviceSchema,
  maxPeers: z.number().int().min(2).max(16).default(2),
});

export const sessionJoinSchema = z.object({
  code: z
    .string()
    .regex(new RegExp(`^\\d{${SESSION_CODE_DIGITS}}$`), 'Enter the 6-digit code'),
  inviteToken: tokenSchema.optional(),
  device: deviceSchema,
});

export const sessionResumeSchema = z.object({
  sessionId: sessionIdSchema,
  role: z.enum(['sender', 'receiver']),
  peerToken: tokenSchema,
  device: deviceSchema.optional(),
});

export const sessionLeaveSchema = z.object({
  sessionId: sessionIdSchema,
  peerToken: tokenSchema,
});

export const sessionCancelSchema = z.object({
  sessionId: sessionIdSchema,
  peerToken: tokenSchema,
});

const descriptionSchema = z.object({
  type: z.enum(['offer', 'answer']),
  sdp: z.string().min(1).max(300_000),
});

const candidateSchema = z.object({
  candidate: z.string().max(4_000),
  sdpMid: z.string().max(256).nullish(),
  sdpMLineIndex: z.number().int().min(0).max(255).nullish(),
  usernameFragment: z.string().max(256).nullish(),
});

export const signalSchema = z.object({
  sessionId: sessionIdSchema,
  peerToken: tokenSchema,
  targetPeerId: z.string().max(128).optional(),
  payload: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('description'), description: descriptionSchema }),
    z.object({ kind: z.literal('candidate'), candidate: candidateSchema }),
  ]),
});

export type SessionCreateInput = z.infer<typeof sessionCreateSchema>;
export type SessionJoinInput = z.infer<typeof sessionJoinSchema>;
export type SessionResumeInput = z.infer<typeof sessionResumeSchema>;
export type SignalInput = z.infer<typeof signalSchema>;
export type DeviceInput = z.infer<typeof deviceSchema>;

/** Validates untrusted socket/REST input and throws a client-safe AppError. */
export function validateInput<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const first = result.error.issues[0];
    const path = first?.path.join('.') ?? 'input';
    throw new AppError('INVALID_INPUT', `Invalid ${path}: ${first?.message ?? 'unexpected value'}`, false);
  }
  return result.data;
}
