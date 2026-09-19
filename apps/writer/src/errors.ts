/**
 * Every way filing a sighting can fail, each with its own user-facing words.
 * classifyError() turns whatever was thrown (Swarm ID messages, bee-js
 * errors, fetch TypeErrors) into one of these, so the UI never shows a single
 * generic "upload failed".
 */

export type ErrorCode =
  | 'SWARM_ID_UNAVAILABLE'
  | 'POPUP_BLOCKED'
  | 'NOT_SIGNED_IN'
  | 'SIGN_IN_NOT_RECEIVED'
  | 'NO_DRIVE'
  | 'STAMPER_FAILED'
  | 'DRIVE_EXPIRED'
  | 'UPLOAD_UNAVAILABLE'
  | 'LOCAL_NODE_UNREACHABLE'
  | 'LOCAL_NODE_NO_USABLE_BATCH'
  | 'OFFLINE'
  | 'GATEWAY_CORS_REFUSED'
  | 'PAYLOAD_TOO_LARGE'
  | 'PHOTO_UNREADABLE'
  | 'RATE_LIMITED'
  | 'GATEWAY_REJECTED'
  | 'GATEWAY_5XX'
  | 'TIMEOUT'
  | 'VALIDATION'
  | 'JOURNAL_PUBLISH_FAILED'
  | 'UNKNOWN';

export type FixAction = 'sign-in' | 'open-swarm-id' | 'switch-to-gateway' | 'open-route-settings' | 'retry' | 'retry-journal' | 'fix-fields' | 'choose-photo';

export interface ErrorCopy {
  title: string;
  /** What happened, specifically. */
  message: string;
  /** What to do about it. */
  next: string;
  action?: FixAction;
}

export const MESSAGES: Record<ErrorCode, ErrorCopy> = {
  SWARM_ID_UNAVAILABLE: {
    title: 'Swarm ID did not load',
    message: 'The sign-in frame from Swarm ID never answered, so this page cannot sign or upload anything.',
    next: 'Check your connection and reload. Some privacy extensions block the frame; allowing swarm-id.snaha.net fixes it.',
    action: 'retry',
  },
  POPUP_BLOCKED: {
    title: 'The sign-in window was blocked',
    message: 'Your browser stopped the Swarm ID window from opening.',
    next: 'Allow pop-ups for this page, then press Sign in again.',
    action: 'sign-in',
  },
  NOT_SIGNED_IN: {
    title: 'Sign in first',
    message: 'Sightings are stored under your own Swarm ID, so the journal needs to know who you are.',
    next: 'Sign in with Swarm ID. It takes a minute the first time and nothing to install.',
    action: 'sign-in',
  },
  SIGN_IN_NOT_RECEIVED: {
    title: 'This page has not heard from Swarm ID yet',
    message:
      'If the Swarm ID window said you are connected, your browser held that news back from this page. Some browsers only let the Swarm ID frame see a new sign-in after the page reloads.',
    next: 'Reload this page to pick up your sign-in. Your notes are kept on this device; a photo you attached will need choosing again. If you closed the window before finishing, press Sign in.',
    action: 'sign-in',
  },
  NO_DRIVE: {
    title: 'Your Swarm ID has no storage yet',
    message: 'New Swarm ID accounts start without a drive (a postage stamp) to pay for uploads, and no free gateway is covering for it here right now.',
    next: 'Add a drive in Swarm ID, then reload this page (what you have written is kept). Your own Bee node cannot replace it: the journal pointer is always signed and sent through Swarm ID.',
    action: 'open-swarm-id',
  },
  STAMPER_FAILED: {
    title: 'Your drive would not open',
    message: 'Swarm ID found your drive but could not prepare it for signing uploads.',
    next: 'Open Swarm ID and check the drive under Storage, then reload this page (what you have written is kept).',
    action: 'open-swarm-id',
  },
  DRIVE_EXPIRED: {
    title: 'Your drive has expired',
    message: 'The postage stamp behind your Swarm ID drive ran out, so new uploads cannot be paid for.',
    next: 'Top up or replace the drive in Swarm ID, then reload this page (what you have written is kept).',
    action: 'open-swarm-id',
  },
  UPLOAD_UNAVAILABLE: {
    title: 'Uploads are switched off for this session',
    message: 'Swarm ID says this session cannot upload, for a reason this app does not recognise.',
    next: 'Open Swarm ID to check your account, then reload this page (what you have written is kept).',
    action: 'open-swarm-id',
  },
  LOCAL_NODE_UNREACHABLE: {
    title: 'Your Bee node is not answering',
    message: 'The node address in Where uploads go could not be reached, or it refused requests from this page.',
    next: 'Start the node (Swarm Desktop), and allow this page with --cors-allowed-origins. Or switch back to Swarm ID uploads.',
    action: 'open-route-settings',
  },
  LOCAL_NODE_NO_USABLE_BATCH: {
    title: 'That postage batch cannot be used',
    message: 'Your node does not have a usable batch with the ID you chose. New batches take about a minute to become usable.',
    next: 'Pick another batch, wait a minute, or switch back to Swarm ID uploads.',
    action: 'open-route-settings',
  },
  OFFLINE: {
    title: 'You are offline',
    message: 'This device has no network connection right now.',
    next: 'Your draft is kept on this device. File it once you are back online.',
    action: 'retry',
  },
  GATEWAY_CORS_REFUSED: {
    title: 'The browser blocked the upload request',
    message:
      'The request got no answer this page is allowed to read ("Failed to fetch"). Browsers report three causes this way and will not say which: the gateway refusing the request under its CORS rules (for example a header it does not accept), a network filter in between, or the gateway being unreachable.',
    next: 'Try again on another network. If it keeps happening, file through your own drive or Bee node in Where uploads go.',
    action: 'retry',
  },
  PAYLOAD_TOO_LARGE: {
    title: 'That is too big to upload',
    message: 'The photo or record is over the size limit (25 MB before shrinking, 4 MB after).',
    next: 'Choose a smaller photo or crop it first.',
    action: 'choose-photo',
  },
  PHOTO_UNREADABLE: {
    title: 'That photo could not be opened',
    message: 'The browser could not decode the file as an image.',
    next: 'Use a JPEG, PNG or WebP photo.',
    action: 'choose-photo',
  },
  RATE_LIMITED: {
    title: 'The gateway asked us to slow down',
    message: 'Too many uploads went to the public gateway in a short time.',
    next: 'Wait a minute and file again. Your draft is safe.',
    action: 'retry',
  },
  GATEWAY_REJECTED: {
    title: 'The gateway rejected the upload',
    message: 'The storage endpoint answered with an error about the request itself.',
    next: 'Try again. If it repeats, the details below will help whoever looks into it.',
    action: 'retry',
  },
  GATEWAY_5XX: {
    title: 'The storage endpoint had a problem',
    message: 'The gateway or node failed while storing the data. This is on its side, not yours.',
    next: 'Wait a moment and try again.',
    action: 'retry',
  },
  TIMEOUT: {
    title: 'Storing took too long',
    message: 'No answer came back in time. The upload may or may not have landed.',
    next: 'Try again. Filing the same sighting twice is harmless; readers de-duplicate by its id.',
    action: 'retry',
  },
  VALIDATION: {
    title: 'A few details need fixing',
    message: 'The sighting does not match the published record format yet.',
    next: 'Fix the highlighted fields.',
    action: 'fix-fields',
  },
  JOURNAL_PUBLISH_FAILED: {
    title: 'Saved, but not listed in your journal yet',
    message: 'The sighting itself is on Swarm, but updating your journal (the list readers follow) failed.',
    next: 'Retry the journal update. The sighting is queued and will be included next time either way.',
    action: 'retry-journal',
  },
  UNKNOWN: {
    title: 'Something unexpected went wrong',
    message: 'The upload failed with an error this app does not recognise.',
    next: 'Try again. The details below show exactly what came back.',
    action: 'retry',
  },
};

export type Step = 'check' | 'photo' | 'record' | 'journal' | 'pointer';

export class UploadFailure extends Error {
  readonly code: ErrorCode;
  readonly detail: string | undefined;
  readonly step: Step | undefined;
  /** Set when the record made it to Swarm before a later step failed. */
  readonly recordRef: string | undefined;
  readonly fieldIssues: { path: string; message: string }[];

  constructor(
    code: ErrorCode,
    options: {
      detail?: string | undefined;
      step?: Step | undefined;
      recordRef?: string | undefined;
      fieldIssues?: { path: string; message: string }[];
      cause?: unknown;
    } = {},
  ) {
    super(MESSAGES[code].message, { cause: options.cause });
    this.name = 'UploadFailure';
    this.code = code;
    this.detail = options.detail;
    this.step = options.step;
    this.recordRef = options.recordRef;
    this.fieldIssues = options.fieldIssues ?? [];
  }

  get copy(): ErrorCopy {
    return MESSAGES[this.code];
  }
}

function statusOf(err: unknown): number | undefined {
  if (typeof err === 'object' && err !== null && 'status' in err && typeof (err as { status: unknown }).status === 'number') {
    return (err as { status: number }).status;
  }
  // Swarm ID relays errors as text, e.g. "Subsidised chunk upload failed: 413 Payload Too Large - …"
  // or "SOC upload failed: 500 Internal Server Error - …".
  const match = /\b(?:failed|error)[^\d]{0,12}(\d{3})\b/i.exec(messageOf(err));
  return match ? Number(match[1]) : undefined;
}

function messageOf(err: unknown): string {
  if (err instanceof Error) return err.message;
  return typeof err === 'string' ? err : JSON.stringify(err);
}

/** Maps any thrown value to a specific failure. Never returns a bare "failed". */
export function classifyError(err: unknown, step?: Step, isOnline: () => boolean = () => navigator.onLine): UploadFailure {
  if (err instanceof UploadFailure) return err;
  const detail = messageOf(err);
  const opts = { detail, step, cause: err };

  if (!isOnline()) return new UploadFailure('OFFLINE', opts);
  if (/not authenticated|please login/i.test(detail)) return new UploadFailure('NOT_SIGNED_IN', opts);
  if (/drive has expired|stamp.*expired/i.test(detail)) return new UploadFailure('DRIVE_EXPIRED', opts);
  if (/popup|pop-up|window.*(blocked|open)/i.test(detail)) return new UploadFailure('POPUP_BLOCKED', opts);
  if (/not initialized|initialization timeout|iframe/i.test(detail)) return new UploadFailure('SWARM_ID_UNAVAILABLE', opts);
  if (/timeout|timed out|aborted/i.test(detail)) return new UploadFailure('TIMEOUT', opts);

  const status = statusOf(err);
  if (status === 413) return new UploadFailure('PAYLOAD_TOO_LARGE', opts);
  if (status === 429) return new UploadFailure('RATE_LIMITED', opts);
  if (status === 402) return new UploadFailure('NO_DRIVE', opts);
  if (status !== undefined && status >= 500) return new UploadFailure('GATEWAY_5XX', opts);
  if (status !== undefined && status >= 400) return new UploadFailure('GATEWAY_REJECTED', opts);

  // A CORS refusal reaches JavaScript only as a bare network error.
  if (/failed to fetch|networkerror when attempting|load failed|network error/i.test(detail)) {
    return new UploadFailure('GATEWAY_CORS_REFUSED', opts);
  }
  return new UploadFailure('UNKNOWN', opts);
}
