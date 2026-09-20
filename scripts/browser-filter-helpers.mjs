export async function setFilter(page, id, value, mode = 'or') {
  const group = page.locator('#' + id);
  if (!(await group.evaluate(el => el.open))) await group.locator('summary').click();
  for (const checkbox of await group.locator('[data-choice]').all()) await checkbox.uncheck();
  for (const key of Array.isArray(value) ? value : value ? [value] : [])
    await group.locator(`[data-choice][value="${key}"]`).check();
  await group.locator(`input[type=radio][value="${mode}"]`).check();
}
export async function selectedFilters(page, id) {
  return page
    .locator(`#${id} [data-choice]:checked`)
    .evaluateAll(inputs => inputs.map(input => input.value));
}
