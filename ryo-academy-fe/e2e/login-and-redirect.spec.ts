import { expect, test } from '@playwright/test';

test.describe('unauthenticated access', () => {
  test('renders the login page and enforces required credentials client-side', async ({ page }) => {
    await page.goto('/login');

    await expect(page.getByRole('heading', { name: 'Sign in to your office' })).toBeVisible();
    const email = page.getByLabel('Email address');
    const password = page.getByLabel('Password');
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await expect(email).toHaveAttribute('required', '');
    await expect(password).toHaveAttribute('required', '');

    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(email).toBeFocused();
  });

  test('redirects an unauthenticated protected route to login', async ({ page }) => {
    await page.goto('/financial-log');

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: 'Sign in to your office' })).toBeVisible();
  });
});
