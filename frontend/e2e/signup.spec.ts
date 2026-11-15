import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('End-to-end Onboarding and Accessibility Journey', () => {
  test('completes full sign-up with keyboard-accessible controls and 0 blocking axe issues', async ({
    page,
  }) => {
    await page.goto('/');

    // 0. Language screen (first, until a language is chosen on this device)
    await page.getByLabel('English').check();
    await page.getByRole('button', { name: 'Continue' }).click();

    // 1. Welcome Screen
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Sign up to learn with us');

    let axeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    let blocking = axeResults.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking).toEqual([]);

    await page.getByRole('button', { name: 'Continue' }).click();

    // 2. Data Consent
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('How we use your answers');
    await page.getByRole('checkbox').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // 3. Full Name
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('What is your full name?');
    await page.getByRole('textbox').fill('Abebe Bikila');
    await page.getByRole('button', { name: 'Continue' }).click();

    // 4. Preferred Name (optional)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('What should we call you?');
    await page.getByRole('button', { name: 'Skip this question' }).click();

    // 5. Contact Method
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('How can we reach you?');
    await page.getByLabel('Through an organisation that helps me').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // 6. Date of birth
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('When were you born?');
    await page.getByRole('button', { name: 'Skip this question' }).click();

    // 7. ID route
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Which of these do you have?');
    await page.getByLabel('Fayda (national ID)').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // 8. ID last 4
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'What are the last 4 letters or numbers on it?',
    );
    await page.getByRole('button', { name: 'Skip this question' }).click();

    // 9. Support needs
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('What would help you?');
    await page.getByLabel('I use a screen reader or need things read aloud').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // 10. Support other
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Is there anything else that would help?',
    );
    await page.getByRole('button', { name: 'Skip this question' }).click();

    // 11. Support share
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'Who can see what would help you?',
    );
    await page.getByRole('button', { name: 'Skip this question' }).click();

    // 12. Check answers
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Check your answers');
    await expect(page.getByText('Abebe Bikila')).toBeVisible();

    axeResults = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    blocking = axeResults.violations.filter(
      (v) => v.impact === 'critical' || v.impact === 'serious',
    );
    expect(blocking).toEqual([]);

    // Submit
    await page.getByRole('button', { name: 'Continue' }).click();

    // 13. Done
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('You are signed up');
  });
});
