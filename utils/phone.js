/**
 * Normalize phone numbers for consistent storage and lookup.
 * Stores everything WITHOUT +91 prefix for simplicity,
 * so both "9876543210" and "+919876543210" resolve to same record.
 */
function normalizePhone(phone) {
  if (!phone) return '';
  // Remove spaces, dashes, dots
  let p = phone.toString().replace(/[\s\-\.]/g, '').trim();
  // Remove +91 or 91 prefix if 12/13 digits
  if (p.startsWith('+91') && p.length === 13) p = p.slice(3);
  else if (p.startsWith('91') && p.length === 12) p = p.slice(2);
  return p;
}

module.exports = { normalizePhone };

