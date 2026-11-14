import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

// The gate needs 0 serious and 0 critical axe issues on every screen. Copy this pattern per screen.
test('the widget loads on a non-ALX host page with no serious accessibility issues', async ({
  page,
}) => {
  await page.goto('/demo/plain.html');

  // Playwright locators reach inside open shadow roots.
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
    .analyze();
  const blocking = results.violations.filter(
    (v) => v.impact === 'critical' || v.impact === 'serious',
  );
  expect(blocking).toEqual([]);
});
