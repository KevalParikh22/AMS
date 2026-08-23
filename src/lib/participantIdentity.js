// Participant identity helpers.
//
// Balaks rarely have a phone of their own, so the contact number on a record is
// the guardian's — which is what the public registration form has always
// collected under "Guardian Mobile Number". Rosters supply that number inside
// the free-text guardian column ("Manish Patel (Father) - 9876543211"), so the
// importer reads it back out rather than asking for a separate phone column.

// First run of 10+ digits wins; keeps the last 10 so country prefixes normalise.
export const extractGuardianPhone = (text) => {
  const source = String(text || '');
  const runs = source.match(/\d[\d\s.\-()]{7,}\d/g) || [];
  for (const run of runs) {
    const digits = run.replace(/\D/g, '');
    if (digits.length >= 10) return digits.slice(-10);
  }
  const all = source.replace(/\D/g, '');
  return all.length >= 10 ? all.slice(-10) : '';
};

// A dedicated phone column, if a sheet still has one. Anything containing
// letters is free text (a guardian name with a number in it), not a number —
// rejecting it stops "Manish Patel - 98765..." being stored as the contact
// when a header like "Guardian Mobile" auto-maps to both fields.
export const normalizePhone = (value) => {
  const source = String(value || '').trim();
  if (!source || /[A-Za-z]/.test(source)) return '';
  const digits = source.replace(/\D/g, '');
  if (digits.length < 6) return '';
  return digits.length > 10 ? digits.slice(-10) : digits;
};

// Lowercased, trimmed, whitespace-collapsed. Shared by both keys below so they
// can never disagree about whether two names are the same.
const normalizeName = (value) =>
  String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');

// Identity is name + guardian number, not the number alone: siblings share a
// guardian, so keying on the number would collapse them into one record.
export const participantKey = (name, phone) =>
  `${normalizeName(name)}|${String(phone || '').trim()}`;

// Same name within the same mandal-sabha.
//
// Name alone is too loose to act on: common names repeat across mandals and
// belong to different balaks, so a name-only rule buries the real duplicates
// under false ones. Two records carrying the same name in the SAME mandal are
// a genuine duplicate signal — the roster for one mandal is small enough that
// a repeated name there is almost always one person entered twice.
export const sabhaNameKey = (sabha, name) =>
  `${normalizeName(sabha)}|${normalizeName(name)}`;
