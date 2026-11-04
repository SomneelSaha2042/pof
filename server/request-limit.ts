export function requestLimit(maximum: number, windowMs: number) {
  const windows = new Map<string, { count: number; resetAt: number }>();
  return (key: string, now = Date.now()): boolean => {
    let window = windows.get(key);
    if (!window || now >= window.resetAt) {
      if (windows.size >= 10000) {
        for (const [id, entry] of Array.from(windows)) if (now >= entry.resetAt) windows.delete(id);
        if (!windows.has(key) && windows.size >= 10000) return false;
      }
      window = { count: 0, resetAt: now + windowMs };
      windows.set(key, window);
    }
    return ++window.count <= maximum;
  };
}
