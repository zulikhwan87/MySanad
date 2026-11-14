import type { ZodError } from 'zod';

/** Zod issues keyed by dotted path ("node.full_name_rumi"), first message per path. */
export function issuesByPath(error: ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.');
    if (!(key in out)) out[key] = issue.message;
  }
  return out;
}
