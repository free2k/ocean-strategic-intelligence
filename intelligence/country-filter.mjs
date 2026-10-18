// A comma-separated selection is an OR across countries, never a synthetic country.
// Keep the existing single-country query/storage contract compatible.
export function selectedCountries(value) {
  return [...new Set((Array.isArray(value) ? value : String(value || '').split(','))
    .map(code => String(code).trim().toUpperCase()).filter(Boolean))].sort();
}
export const normalizeCountryFilter = value => selectedCountries(value).join(',');
export function matchesCountry(country, selection) {
  const codes = selectedCountries(selection);
  return !codes.length || codes.includes(country);
}
export function matchesCountries(countries, selection) {
  const codes = selectedCountries(selection);
  return !codes.length || (countries || []).some(code => codes.includes(code));
}
