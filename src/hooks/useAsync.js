import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Runs an async loader and exposes { data, loading, error, retry }.
 *
 * Every page uses this so loading, empty and error states are consistent
 * instead of each page inventing its own. Results from a superseded run are
 * discarded, which is what stops a slow request from overwriting a fast one
 * when the user navigates or retypes.
 */
export function useAsync(loader, deps, initial = null) {
  const [data, setData] = useState(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const runId = useRef(0);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    const id = ++runId.current;
    let cancelled = false;

    setLoading(true);
    setError(null);

    Promise.resolve()
      .then(loader)
      .then((result) => {
        if (cancelled || id !== runId.current) return;
        setData(result);
      })
      .catch((caught) => {
        if (cancelled || id !== runId.current) return;
        setError(caught);
      })
      .finally(() => {
        if (cancelled || id !== runId.current) return;
        setLoading(false);
      });

    return () => { cancelled = true; };
    // The caller owns the dependency list; `loader` is intentionally excluded
    // so an inline arrow does not retrigger the effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  return { data, loading, error, retry };
}
