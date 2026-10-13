import { expect, test, type Page } from '@playwright/test';

test.use({
  trace: 'off',
  screenshot: 'off',
  video: 'off',
});

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`BLOCKED: ${name} is required for Phase 2 authentication tests`);
  }
  return value;
}

function validAuthEnv() {
  return {
    email: requiredEnv('E2E_AUTH_EMAIL'),
    password: requiredEnv('E2E_AUTH_PASSWORD'),
  };
}

function invalidAuthEnv() {
  return {
    email: requiredEnv('E2E_INVALID_EMAIL'),
    password: requiredEnv('E2E_INVALID_PASSWORD'),
  };
}

function protectedMeUrl() {
  const baseUrl = requiredEnv('VITE_API_BASE_URL').replace(/\/+$/, '');
  return new URL('protected/me', `${baseUrl}/`).toString();
}

async function loginThroughUi(page: Page, email: string, password: string) {
  await page.goto('/login');
  const loginResponse = page.waitForResponse(
    (response) =>
      response.request().method() === 'POST' &&
      response.url().endsWith('/auth/login'),
  );
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  return loginResponse;
}

test.describe('real backend authentication and session handling', () => {
  test('logs in through the real backend and reaches the dashboard', async ({ page }) => {
    const { email, password } = validAuthEnv();
    const response = await loginThroughUi(page, email, password);

    expect(response.status()).toBe(201);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('rejects invalid credentials without establishing a session', async ({ page }) => {
    const { email, password } = invalidAuthEnv();
    const response = await loginThroughUi(page, email, password);

    expect(response.status()).toBe(401);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('alert')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sign in to your office' })).toBeVisible();
    await expect(
      page.evaluate(() => localStorage.getItem('ryo-academy-access-token') === null),
    ).resolves.toBe(true);
  });

  test('restores the authenticated session after a page reload', async ({ page }) => {
    const { email, password } = validAuthEnv();
    await loginThroughUi(page, email, password);
    await expect(page).toHaveURL(/\/dashboard$/);

    const restoration = page.waitForResponse(
      (response) =>
        response.request().method() === 'GET' &&
        response.url().endsWith('/protected/me'),
    );
    await page.reload();

    expect((await restoration).status()).toBe(200);
    await expect(page).toHaveURL(/\/dashboard$/);
  });

  test('handles financial-log access according to the authenticated account permissions', async ({ page }) => {
    const { email, password } = validAuthEnv();
    await loginThroughUi(page, email, password);
    await expect(page).toHaveURL(/\/dashboard$/);

    await page.goto('/financial-log');
    const allowed = page.getByRole('heading', { name: 'Financial Log' });
    const denied = page.getByRole('heading', { name: 'That view is outside your role' });
    const apiError = page.getByRole('heading', { name: 'Could not load financial log' });
    await expect(allowed.or(denied)).toBeVisible();
    await expect(apiError).toHaveCount(0);
  });

  test('clears the client session when protected/me returns 401', async ({ page }) => {
    const { email, password } = validAuthEnv();
    await loginThroughUi(page, email, password);
    await expect(page).toHaveURL(/\/dashboard$/);

    const endpoint = protectedMeUrl();
    let intercepted = false;
    await page.route(endpoint, async (route) => {
      const request = route.request();
      if (request.method() !== 'GET' || request.url() !== endpoint) {
        await route.fallback();
        return;
      }
      intercepted = true;
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: '{"statusCode":401,"message":"Unauthorized"}',
      });
    });

    try {
      await page.reload();
      await expect(page).toHaveURL(/\/login$/);
      await expect(page.getByRole('heading', { name: 'Sign in to your office' })).toBeVisible();
      await expect(
        page.evaluate(() => localStorage.getItem('ryo-academy-access-token') === null),
      ).resolves.toBe(true);
      expect(intercepted).toBe(true);
    } finally {
      await page.unroute(endpoint);
    }
  });
});
