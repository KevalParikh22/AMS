// Collision-resistant record ids.
//
// Ids used to be minted as `PREFIX + Date.now()`, which breaks as soon as two
// devices write at once: two volunteers marking attendance in the same
// millisecond produce the same id, and the second write silently overwrites the
// first instead of creating a second row. Sequential ids are also unusable for
// anonymous public writes, since RLS hides the existing rows a counter would
// have to be derived from.
//
// Timestamp first so ids sort roughly chronologically; the random half carries
// the uniqueness. A timestamp plus only a few random characters is NOT enough —
// measured at ~8 collisions per 20k ids minted in a tight loop.
export const uniqueId = (prefix) => {
  const random = globalThis.crypto?.randomUUID
    ? globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    : `${Math.random().toString(36).slice(2, 10)}${Math.random().toString(36).slice(2, 8)}`;
  return `${prefix}${Date.now().toString(36)}${random}`;
};
