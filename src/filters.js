export const filterValues = value =>
  (Array.isArray(value) ? value : value ? [value] : []).map(String);
export function matchesFilter(value, predicate, mode = 'or') {
  const values = filterValues(value);
  return !values.length || (mode === 'and' ? values.every(predicate) : values.some(predicate));
}
export function filterSummary(value, labels, mode = 'or') {
  return filterValues(value)
    .map(key => labels[key] ?? key)
    .join(mode === 'and' ? ' 그리고 ' : ' 또는 ');
}
