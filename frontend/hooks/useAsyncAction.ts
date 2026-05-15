import { useState, useCallback } from 'react';

interface AsyncActionResult {
  loading: boolean;
  error: string;
  setError: (msg: string) => void;
  run: (action: () => Promise<void>) => Promise<void>;
}

/**
 * Encapsulates the loading/error/try-catch pattern used in every form handler.
 * Usage:
 *   const { loading, error, run } = useAsyncAction();
 *   const handleSubmit = (e) => { e.preventDefault(); run(async () => { ... }); };
 */
export function useAsyncAction(): AsyncActionResult {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const run = useCallback(async (action: () => Promise<void>) => {
    setLoading(true);
    setError('');
    try {
      await action();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Có lỗi xảy ra');
    } finally {
      setLoading(false);
    }
  }, []);

  return { loading, error, setError, run };
}
