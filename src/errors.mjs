// Structured errors for the newer commands (profile, lint, stylecard, kit, delta, drift, consent).
// Exit codes: 0 success or advisory, 1 an explicit enforce-policy violation, 2 invalid arguments,
// schema, missing consent or missing profile, 3 an IO or environment error. The older commands keep
// their exit code 1 for every error, as before.
export const EXIT = { OK: 0, POLICY: 1, INVALID: 2, IO: 3 };

export class CliError extends Error {
  constructor(code, message, { exitCode = EXIT.INVALID, remedy = null, details = null } = {}) {
    super(message);
    this.code = code;
    this.exitCode = exitCode;
    this.remedy = remedy;
    this.details = details;
  }
}

export const invalid = (code, message, remedy, details) => new CliError(code, message, { exitCode: EXIT.INVALID, remedy, details });
export const ioError = (code, message, remedy, details) => new CliError(code, message, { exitCode: EXIT.IO, remedy, details });

/** Wrap a file-system error as an IO CliError with a remedy. */
export function wrapIo(err, what) {
  if (err instanceof CliError) return err;
  const code = err && err.code ? String(err.code) : 'EIO';
  const remedy = code === 'ENOENT' ? `Check the path: ${what}` : code === 'EACCES' || code === 'EPERM' ? `Check the permissions of ${what}` : `Retry, or check ${what}`;
  return ioError('E_IO', `Could not read or write ${what} (${code}).`, remedy);
}

export function errorJson(err) {
  return {
    schemaVersion: 1,
    error: { code: err.code || 'E_UNEXPECTED', message: err.message, remedy: err.remedy || null, ...(err.details ? { details: err.details } : {}) },
    exitCode: err.exitCode ?? 1,
  };
}
