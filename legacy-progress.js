export const LEGACY_STORAGE_KEY = 'pierres_perdues_v1';

export function readLegacyProgress(storage) {
  try {
    const saved = JSON.parse(storage.getItem(LEGACY_STORAGE_KEY));
    return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
  } catch { return {}; }
}

// Archive completion is an in-memory display, not a migration of earned progress.
export function displayedProgress(saved, count, archiveCompleted) {
  if (!archiveCompleted) return { ...saved };
  return { ...saved, ...Object.fromEntries(Array.from({ length: count }, (_, i) => [i, true])) };
}
