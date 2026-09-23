// Supabase returns database errors as plain objects ({ message, code, ... }),
// not Error instances, so `error instanceof Error` alone drops the message a
// Postgres function raised (e.g. "This child is already booked ...").
export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message
  }

  if (typeof error === 'object' && error !== null && 'message' in error) {
    const { message } = error as { message: unknown }

    if (typeof message === 'string' && message) {
      return message
    }
  }

  return fallback
}
