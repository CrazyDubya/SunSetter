/**
 * Input validation using Zod
 * Ensures all location, time, and sensor data is properly validated
 * Provides both throwing and safe (non-throwing) validation functions
 */

import { z } from 'zod';

/**
 * Schema for validating location data
 * Enforces valid latitude, longitude, and altitude ranges
 */
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

/**
 * Validated location data type
 */
export type ValidatedLocation = z.infer<typeof LocationSchema>;

/**
 * Schema for validating timestamps
 * Ensures timestamps are within reasonable range (1900-2100)
 */
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

/**
 * Schema for validating track computation parameters
 * Ensures all parameters for sun track calculation are within valid ranges
 */
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

/**
 * Validated track parameters type
 */
export type ValidatedTrackParams = z.infer<typeof TrackParamsSchema>;

/**
 * Schema for validating device orientation data
 * Validates alpha (compass), beta (tilt), and gamma (roll) angles
 */
export const OrientationSchema = z.object({
  alpha: z.number().min(0).max(360).nullable(),
  beta: z.number().min(-180).max(180).nullable(),
  gamma: z.number().min(-90).max(90).nullable(),
  absolute: z.boolean().optional()
});

/**
 * Validated orientation data type
 */
export type ValidatedOrientation = z.infer<typeof OrientationSchema>;

/**
 * Schema for validating compass heading (0-360 degrees)
 */
export const HeadingSchema = z.number()
  .min(0, 'Heading must be >= 0')
  .max(360, 'Heading must be <= 360');

/**
 * Schema for validating sun position samples
 * Ensures azimuth, elevation, and timestamp are within valid ranges
 */
export const SunSampleSchema = z.object({
  t: TimestampSchema,
  az: z.number().min(0).max(360),
  el: z.number().min(-90).max(90),
  mass: z.number().positive().optional(),
  error: z.string().optional()
});

/**
 * Validated sun sample type
 */
export type ValidatedSunSample = z.infer<typeof SunSampleSchema>;

/**
 * Schema for validating moon position samples
 * Includes phase, illumination, and distance validation
 */
export const MoonSampleSchema = z.object({
  t: TimestampSchema,
  az: z.number().min(0).max(360),
  el: z.number().min(-90).max(90),
  phase: z.number().min(0).max(1),
  illumination: z.number().min(0).max(1),
  mass: z.number().positive(),
  distance: z.number().positive()
});

/**
 * Validated moon sample type
 */
export type ValidatedMoonSample = z.infer<typeof MoonSampleSchema>;

/**
 * Validate location data (throws on error)
 * @param data - Unknown data to validate
 * @returns Validated location data
 * @throws {ZodError} If validation fails
 */
export function validateLocation(data: unknown): ValidatedLocation {
  return LocationSchema.parse(data);
}

/**
 * Validate timestamp (throws on error)
 * @param data - Unknown data to validate
 * @returns Validated timestamp
 * @throws {ZodError} If validation fails
 */
export function validateTimestamp(data: unknown): number {
  return TimestampSchema.parse(data);
}

/**
 * Validate track parameters (throws on error)
 * @param data - Unknown data to validate
 * @returns Validated track parameters
 * @throws {ZodError} If validation fails
 */
export function validateTrackParams(data: unknown): ValidatedTrackParams {
  return TrackParamsSchema.parse(data);
}

/**
 * Validate orientation data (throws on error)
 * @param data - Unknown data to validate
 * @returns Validated orientation data
 * @throws {ZodError} If validation fails
 */
export function validateOrientation(data: unknown): ValidatedOrientation {
  return OrientationSchema.parse(data);
}

/**
 * Validate compass heading (throws on error)
 * @param data - Unknown data to validate
 * @returns Validated heading in degrees
 * @throws {ZodError} If validation fails
 */
export function validateHeading(data: unknown): number {
  return HeadingSchema.parse(data);
}

/**
 * Validate sun sample (throws on error)
 * @param data - Unknown data to validate
 * @returns Validated sun sample
 * @throws {ZodError} If validation fails
 */
export function validateSunSample(data: unknown): ValidatedSunSample {
  return SunSampleSchema.parse(data);
}

/**
 * Validate moon sample (throws on error)
 * @param data - Unknown data to validate
 * @returns Validated moon sample
 * @throws {ZodError} If validation fails
 */
export function validateMoonSample(data: unknown): ValidatedMoonSample {
  return MoonSampleSchema.parse(data);
}

/**
 * Safe validation for location data (returns result object instead of throwing)
 * @param data - Unknown data to validate
 * @returns Validation result with success boolean and data or error
 */
export function safeValidateLocation(data: unknown) {
  return LocationSchema.safeParse(data);
}

/**
 * Safe validation for timestamp (returns result object instead of throwing)
 * @param data - Unknown data to validate
 * @returns Validation result with success boolean and data or error
 */
export function safeValidateTimestamp(data: unknown) {
  return TimestampSchema.safeParse(data);
}

/**
 * Safe validation for track parameters (returns result object instead of throwing)
 * @param data - Unknown data to validate
 * @returns Validation result with success boolean and data or error
 */
export function safeValidateTrackParams(data: unknown) {
  return TrackParamsSchema.safeParse(data);
}

/**
 * Safe validation for orientation data (returns result object instead of throwing)
 * @param data - Unknown data to validate
 * @returns Validation result with success boolean and data or error
 */
export function safeValidateOrientation(data: unknown) {
  return OrientationSchema.safeParse(data);
}

/**
 * Safe validation for heading (returns result object instead of throwing)
 * @param data - Unknown data to validate
 * @returns Validation result with success boolean and data or error
 */
export function safeValidateHeading(data: unknown) {
  return HeadingSchema.safeParse(data);
}

/**
 * Validate an array of sun samples (throws on error)
 * @param data - Unknown data to validate
 * @returns Array of validated sun samples
 * @throws {ZodError} If validation fails
 */
export function validateSunSamples(data: unknown): ValidatedSunSample[] {
  const ArraySchema = z.array(SunSampleSchema);
  return ArraySchema.parse(data);
}

/**
 * Validate an array of moon samples (throws on error)
 * @param data - Unknown data to validate
 * @returns Array of validated moon samples
 * @throws {ZodError} If validation fails
 */
export function validateMoonSamples(data: unknown): ValidatedMoonSample[] {
  const ArraySchema = z.array(MoonSampleSchema);
  return ArraySchema.parse(data);
}
