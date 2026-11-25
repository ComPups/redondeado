export class WorkflowError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'WorkflowError';
  }
}

export function errorCode(error: unknown): string | undefined {
  if (error instanceof WorkflowError) return error.code;
  return (error as { code?: string })?.code;
}
