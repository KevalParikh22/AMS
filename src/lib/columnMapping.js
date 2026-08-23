// Match spreadsheet headers to import fields.
//
// `fields` is a map of fieldKey -> { synonyms: [...] }; the result maps every
// fieldKey to a column index, or -1 when nothing matched.
//
// A per-field `findIndex` over the synonyms was wrong in both directions.
// "Guardian Contact Details" and "Guardian Mobile Number" both contain
// "guardian", so whichever appeared first in the sheet won BOTH fields — the
// roster export re-imported its own phone column into the guardian details
// field and left the phone unmapped entirely.
//
// Two rules fix it: score a match by the length of the synonym that matched, so
// a long specific synonym claims its column ahead of a short generic one; and
// let each column be claimed once, so two fields can never share it.
export function autoMapHeaders(headers, fields) {
  const candidates = [];
  Object.entries(fields).forEach(([fieldKey, config]) => {
    headers.forEach((header, idx) => {
      const h = String(header).toLowerCase();
      (config.synonyms || []).forEach(syn => {
        if (h.includes(String(syn).toLowerCase())) {
          candidates.push({ fieldKey, idx, weight: String(syn).length });
        }
      });
    });
  });

  // Longest synonym wins; ties break on the earlier column so the result is
  // stable for a given sheet.
  candidates.sort((a, b) => b.weight - a.weight || a.idx - b.idx);

  const mappings = {};
  Object.keys(fields).forEach(k => { mappings[k] = -1; });
  const takenColumns = new Set();
  candidates.forEach(({ fieldKey, idx }) => {
    if (mappings[fieldKey] !== -1 || takenColumns.has(idx)) return;
    mappings[fieldKey] = idx;
    takenColumns.add(idx);
  });
  return mappings;
}
