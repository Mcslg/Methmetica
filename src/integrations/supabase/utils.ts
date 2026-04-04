export const SUPABASE_REQUEST_TIMEOUT_MS = 10000;

export const withSupabaseTimeout = async <T>(promise: PromiseLike<T>, label: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${SUPABASE_REQUEST_TIMEOUT_MS / 1000}s`));
    }, SUPABASE_REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([Promise.resolve(promise), timeoutPromise]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};
