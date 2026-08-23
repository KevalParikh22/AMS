import { useState, useCallback } from 'react';

// Shared ordering for every sortable table and for the attendance desk's sort
// dropdown. Kept in lib/ rather than beside the SortableTh component because a
// module that exports both a component and a hook trips the
// react/only-export-components lint rule.

const isBlank = (v) => v === null || v === undefined || v === '';

// A total order for one cell value. Columns in this app hold four kinds of
// value: strings, numbers, booleans, and precomputed percentages (numbers).
// Blanks are handled by sortRows, not here, because they must ignore direction.
export function compareValues(a, b) {
  if (typeof a === 'boolean' || typeof b === 'boolean') {
    return Number(Boolean(a)) - Number(Boolean(b));
  }
  if (typeof a === 'number' && typeof b === 'number') {
    // A NaN makes every comparison false, which yields an arbitrary order
    // rather than an obviously-wrong one. Pin it to the end instead.
    if (Number.isNaN(a) || Number.isNaN(b)) {
      if (Number.isNaN(a) === Number.isNaN(b)) return 0;
      return Number.isNaN(a) ? 1 : -1;
    }
    return a - b;
  }
  // Numeric collation so P-9 sorts before P-10, and so a phone stored as a
  // number still orders sensibly against one stored as a string.
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
}

// Sort a COPY of `rows`; `get` reads the sort value off a row.
//
// Array.prototype.sort has been stable since ES2019, so whatever order `rows`
// arrives in is preserved for ties. That is how each table gets a sensible
// tiebreak from its own base ordering, with no secondary-key plumbing.
export function sortRows(rows, get, dir = 'asc') {
  const sign = dir === 'desc' ? -1 : 1;
  return [...rows].sort((rowA, rowB) => {
    const a = get(rowA);
    const b = get(rowB);
    const aBlank = isBlank(a);
    const bBlank = isBlank(b);
    // Blanks sink in BOTH directions — deliberately outside the sign flip. A
    // column of mostly-empty phone numbers is useless if reversing it fills
    // the first screen with nothing.
    if (aBlank || bBlank) {
      if (aBlank === bBlank) return 0;
      return aBlank ? 1 : -1;
    }
    return sign * compareValues(a, b);
  });
}

// One table's sort state. Called once per table — tables never share state, so
// sorting the roster cannot reorder a summary.
//
//   const rosterSort = useTableSort();
//   <SortableTh sortKey="name" sort={rosterSort}>Full Name</SortableTh>
//   const rows = rosterSort.sorted(rosterBase);
//
// A null key means "leave the array in its base order".
export function useTableSort(initialKey = null, initialDir = 'asc') {
  const [sort, setSort] = useState({ key: initialKey, dir: initialDir });

  const toggle = useCallback((key, firstDir = 'asc') => {
    setSort(prev => (prev.key === key
      ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: firstDir }));
  }, []);

  // `accessors` only needs entries for columns that are not a plain field on
  // the row.
  const sorted = useCallback((rows, accessors) => {
    if (!sort.key) return rows;
    const get = (accessors && accessors[sort.key]) || ((row) => row[sort.key]);
    return sortRows(rows, get, sort.dir);
  }, [sort]);

  return { key: sort.key, dir: sort.dir, toggle, sorted };
}
