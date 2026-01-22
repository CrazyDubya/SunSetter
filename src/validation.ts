/**
 * Input validation using Zod
 * Ensures all location, time, and sensor data is properly validated
 */

import { z } from 'zod';

// Location validation schemas
export const LocationSchema = z.object({
  lat: z.number()
    .min(-90, 'Latitude must be >= -90')
    .max(90, 'Latitude must be <= 90'),
  lon: z.number()
    .min(-180, 'Longitude must be >= -180')
    .max(180, 'Longitude must be <= 180'),
  alt: z.number()
    .min(-500, 'Altitude must be >= -500m')
    .max(10000, 'Altitude must be <= 10000m')
    .optional(),
  accuracy: z.number()
    .min(0, 'Accuracy must be >= 0')
    .optional(),
  timestamp: z.number()
    .positive('Timestamp must be positive')
    .optional()
});

export type ValidatedLocation = z.infer<typeof LocationSchema>;

// Timestamp validation
export const TimestampSchema = z.number()
  .int('Timestamp must be an integer')
  .refine(
    (val) => val >= new Date('1900-01-01').getTime(),
    'Timestamp must be after 1900'
  )
  .refine(
    (val) => val <= new Date('2100-01-01').getTime(),
    'Timestamp must be before 2100'
  );

// Track parameters validation
export const TrackParamsSchema = z.object({
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  alt: z.number().min(-500).max(10000).optional(),
  t0: TimestampSchema,
  durationH: z.number()
    .positive('Duration must be positive')
    .max(168, 'Duration must be <= 168 hours (1 week)'),
  stepMin: z.number()
    .positive('Step must be positive')
    .min(1, 'Step must be >= 1 minute')
    .max(1440, 'Step must be <= 1440 minutes (1 day)')
});

export type ValidatedTrackParams = z.infer<typeof TrackParamsSchema>;

// Sensor orientation validation
export const OrientationSchema = z.object({
  alpha: z.number().min(0).max(360).nullable(),
  beta: z.number().min(-180).max(180).nullable(),
  gamma: z.number().min(-90).max(90).nullable(),
  absolute: z.boolean().optional()
});

export type ValidatedOrientation = z.infer<typeof OrientationSchema>;

// Heading validation (compass direction)
export const HeadingSchema = z.number()
  .min(0, 'Heading must be >= 0')
  .max(360, 'Heading must be <= 360');

// Sun/Moon sample validation
export const SunSampleSchema = z.object({
  t: TimestampSchema,
  az: z.number().min(0).max(360),
  el: z.number().min(-90).max(90),
  mass: z.number().positive().optional(),
  error: z.string().optional()
});

export type ValidatedSunSample = z.infer<typeof SunSampleSchema>;

export const MoonSampleSchema = z.object({
  t: TimestampSchema,
  az: z.number().min(0).max(360),
  el: z.number().min(-90).max(90),
  phase: z.number().min(0).max(1),
  illumination: z.number().min(0).max(1),
  mass: z.number().positive(),
  distance: z.number().positive()
});

export type ValidatedMoonSample = z.infer<typeof MoonSampleSchema>;

// Validation helper functions
export function validateLocation(data: unknown): ValidatedLocation {
  return LocationSchema.parse(data);
}

export function validateTimestamp(data: unknown): number {
  return TimestampSchema.parse(data);
}

export function validateTrackParams(data: unknown): ValidatedTrackParams {
  return TrackParamsSchema.parse(data);
}

export function validateOrientation(data: unknown): ValidatedOrientation {
  return OrientationSchema.parse(data);
}

export function validateHeading(data: unknown): number {
  return HeadingSchema.parse(data);
}

export function validateSunSample(data: unknown): ValidatedSunSample {
  return SunSampleSchema.parse(data);
}

export function validateMoonSample(data: unknown): ValidatedMoonSample {
  return MoonSampleSchema.parse(data);
}

// Safe parsing (returns success/error instead of throwing)
export function safeValidateLocation(data: unknown) {
  return LocationSchema.safeParse(data);
}

export function safeValidateTimestamp(data: unknown) {
  return TimestampSchema.safeParse(data);
}

export function safeValidateTrackParams(data: unknown) {
  return TrackParamsSchema.safeParse(data);
}

export function safeValidateOrientation(data: unknown) {
  return OrientationSchema.safeParse(data);
}

export function safeValidateHeading(data: unknown) {
  return HeadingSchema.safeParse(data);
}

// Utility: Validate array of samples
export function validateSunSamples(data: unknown): ValidatedSunSample[] {
  const ArraySchema = z.array(SunSampleSchema);
  return ArraySchema.parse(data);
}

export function validateMoonSamples(data: unknown): ValidatedMoonSample[] {
  const ArraySchema = z.array(MoonSampleSchema);
  return ArraySchema.parse(data);
}
