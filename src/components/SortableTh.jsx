import { ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react';

// A <th> that sorts its table.
//
// A drop-in replacement for a plain <th>: it emits exactly one cell, so no
// colSpan on a "show more" or empty row has to change. Action columns stay
// plain <th> — there is nothing to order them by.
//
// `sort` is the object from useTableSort, passed whole to keep call sites to
// two props. Use firstDir="desc" for columns people expect highest-first
// (counts, percentages, present-before-absent).
export default function SortableTh({ sortKey, sort, firstDir = 'asc', title, children }) {
  const active = sort.key === sortKey;
  const activate = () => sort.toggle(sortKey, firstDir);

  return (
    <th
      className={`sortable-th${active ? ' is-sorted' : ''}`}
      onClick={activate}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
      tabIndex={0}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      title={title || 'Sort by this column'}
    >
      <span className="sortable-th-label">
        {children}
        {active
          ? (sort.dir === 'asc' ? <ChevronUp size={13} /> : <ChevronDown size={13} />)
          : <ChevronsUpDown size={13} className="sortable-th-idle" />}
      </span>
    </th>
  );
}
