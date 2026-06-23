/**
 * ViraEdit Timeline Engine — Error Classes
 *
 * Typed errors thrown by operations.ts so callers can distinguish
 * "clip not found" from "invalid operation" without string-matching.
 */

/** Base class for all timeline operation errors */
export class TimelineOperationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TimelineOperationError'
    // Maintains proper stack trace in V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor)
    }
  }
}

/** Thrown when a trackId does not exist in the timeline */
export class TrackNotFoundError extends TimelineOperationError {
  constructor(public readonly trackId: string) {
    super(`Track "${trackId}" not found in the timeline`)
    this.name = 'TrackNotFoundError'
  }
}

/** Thrown when a clipId does not exist in any track */
export class ClipNotFoundError extends TimelineOperationError {
  constructor(public readonly clipId: string) {
    super(`Clip "${clipId}" not found in any track`)
    this.name = 'ClipNotFoundError'
  }
}

/** Thrown when adding a clip or track with an ID that already exists */
export class DuplicateIdError extends TimelineOperationError {
  constructor(
    public readonly id: string,
    public readonly kind: 'clip' | 'track'
  ) {
    super(`A ${kind} with ID "${id}" already exists in the timeline`)
    this.name = 'DuplicateIdError'
  }
}

/** Thrown when an operation is logically invalid (e.g., split out of range) */
export class InvalidOperationError extends TimelineOperationError {
  constructor(message: string) {
    super(message)
    this.name = 'InvalidOperationError'
  }
}
