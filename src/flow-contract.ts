export const CAPTURE_EXIT_CODES = {
  success: 0,
  error: 1,
  noAvailability: 2,
  authFailed: 3,
} as const;

export type CaptureOutcome = 'success' | 'no-availability' | 'auth-failed' | 'error';

export interface CaptureResultArtifact {
  outcome: CaptureOutcome;
  accountsWithHolds: string[];
  usedDefaultAccount: boolean;
}

export function captureOutcomeToExitCode(outcome: CaptureOutcome): number {
  switch (outcome) {
    case 'success':
      return CAPTURE_EXIT_CODES.success;
    case 'no-availability':
      return CAPTURE_EXIT_CODES.noAvailability;
    case 'auth-failed':
      return CAPTURE_EXIT_CODES.authFailed;
    default:
      return CAPTURE_EXIT_CODES.error;
  }
}

export function captureExitCodeToOutcome(exitCode?: number | null): CaptureOutcome {
  switch (exitCode) {
    case CAPTURE_EXIT_CODES.success:
      return 'success';
    case CAPTURE_EXIT_CODES.noAvailability:
      return 'no-availability';
    case CAPTURE_EXIT_CODES.authFailed:
      return 'auth-failed';
    default:
      return 'error';
  }
}
