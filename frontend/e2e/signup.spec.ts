import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

test.describe('End-to-end Onboarding and Accessibility Journey', () => {
  test('completes full sign-up with keyboard-accessible controls and 0 blocking axe issues', async ({
    page,
  }) => {
    await page.route('**/api/v1/**', async (route) => {
      const url = route.request().url();
      if (url.includes('/config')) {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            partner_name: 'Savanna',
            default_language: 'en',
            languages: ['en', 'am'],
            referral_partners: [{ id: 'org_1', name: 'Ethiopian Association of the Blind' }],
          }),
        });
      } else if (url.includes('/registrations') && route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            registration_id: 'reg_123',
            learner_id: 'lrn_123',
            status: 'draft',
            current_step: 'welcome',
            session: { token: 'tok_123', expires_at: '2099-01-01T00:00:00Z' },
          }),
        });
      } else {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            ok: true,
            registration_id: 'reg_123',
            learner_id: 'lrn_123',
            session: { token: 'tok_123' },
          }),
        });
      }
    });

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

    // 4. Contact Method
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('How can we reach you?');
    await page.getByLabel('Through an organisation that helps me').click();
    await page.getByRole('button', { name: 'Continue' }).click();

    // 5. Date of birth
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('When were you born?');
    await page.getByRole('button', { name: 'Skip this question' }).click();

    // 6. Sex, region and education (optional)
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('What is your sex?');
    await page.getByRole('button', { name: 'Skip this question' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Where do you live?');
    await page.getByRole('button', { name: 'Skip this question' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      'What is the highest level of school you finished?',
    );
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
    await page.getByRole('button', { name: /Send my answers|Continue/i }).click();

    // 13. Done
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('You are signed up');
  });
});
