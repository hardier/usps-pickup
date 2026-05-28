import type { Browser, Page } from 'playwright-core';
import { getNextPickupDate } from './business-days';

const INFO = {
  firstName: process.env.USPS_FIRST_NAME ?? 'Erzhen',
  lastName:  process.env.USPS_LAST_NAME  ?? 'Lin',
  address:   process.env.USPS_ADDRESS    ?? '3931 Duncan Pl',
  city:      process.env.USPS_CITY       ?? 'Palo Alto',
  state:     process.env.USPS_STATE      ?? 'CA',
  zip:       process.env.USPS_ZIP        ?? '94306',
  phone:     process.env.USPS_PHONE      ?? '650-785-5885',
  email:     process.env.USPS_EMAIL      ?? 'erzhenlin@gmail.com',
};

const CHROMIUM_PACK_URL =
  process.env.CHROMIUM_PACK_URL ??
  'https://github.com/Sparticuz/chromium/releases/download/v133.0.0/chromium-v133.0.0-pack.tar';

async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import('playwright-core');

  if (process.env.VERCEL) {
    const chromiumMin = (await import('@sparticuz/chromium-min')).default;
    chromiumMin.setHeadlessMode = true;
    chromiumMin.setGraphicsMode = false;
    return chromium.launch({
      args: chromiumMin.args,
      executablePath: await chromiumMin.executablePath(CHROMIUM_PACK_URL),
      headless: true,
    });
  }

  const localChrome: Partial<Record<NodeJS.Platform, string>> = {
    darwin: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    linux:  '/usr/bin/google-chrome',
    win32:  'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  };

  return chromium.launch({
    headless: true,
    executablePath: localChrome[process.platform],
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });
}

export async function schedulePickup(
  packages: number,
  weight: number,
  onProgress: (step: string) => void = () => {},
): Promise<{ success: boolean; message: string; confirmationNumber?: string }> {
  onProgress('Launching browser…');
  const browser = await launchBrowser();

  try {
    const page = await browser.newPage();
    await page.setViewportSize({ width: 1280, height: 900 });
    page.setDefaultTimeout(20_000);

    onProgress('Opening USPS pickup page…');
    await page.goto('https://tools.usps.com/schedule-pickup-steps.htm', {
      waitUntil: 'domcontentloaded',
      timeout: 30_000,
    });

    onProgress('Filling in contact information…');
    await fillStep1ContactInfo(page);

    onProgress('Checking availability…');
    // Wait for Angular validation to settle before clicking
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.getByRole('button', { name: 'Check Availability' }).click();

    onProgress('Setting pickup preferences…');
    await fillStep2PickupPreferences(page, onProgress);

    onProgress('Entering package details…');
    await fillStep4PackageDetails(page, packages, weight);

    onProgress('Submitting pickup request…');
    await page.waitForLoadState('networkidle').catch(() => {});
    await page.getByRole('button', { name: 'Schedule a Pickup' }).click();

    onProgress('Waiting for confirmation…');
    await page.waitForSelector(
      'h1:has-text("Confirmed"), h2:has-text("Confirmed"), [class*="confirm"], [id*="confirm"]:not(input):not(button)',
      { timeout: 30_000 },
    );

    const bodyText = (await page.textContent('body')) ?? '';
    const match = bodyText.match(/confirmation\s*(?:#|number|no\.?)?\s*:?\s*([A-Z0-9]{6,})/i);

    return {
      success: true,
      message: 'Your USPS pickup has been scheduled successfully.',
      confirmationNumber: match?.[1],
    };
  } catch (err) {
    return {
      success: false,
      message: err instanceof Error ? err.message : String(err),
    };
  } finally {
    await browser.close();
  }
}

async function fillStep1ContactInfo(page: Page) {
  // Wait using the visible placeholder text from the actual USPS form
  await page.waitForSelector('input[placeholder="First"]', { timeout: 15_000 });

  await page.getByPlaceholder('First').fill(INFO.firstName);
  await page.getByPlaceholder('Last').fill(INFO.lastName);
  await page.getByPlaceholder('123 Main Street').fill(INFO.address);
  await page.getByPlaceholder('City').fill(INFO.city);

  // State is the only <select> on this form
  await page.locator('select').first().selectOption(INFO.state);

  await page.getByPlaceholder('00000').fill(INFO.zip);
  await page.getByPlaceholder('000-000-0000').fill(INFO.phone);
  await page.getByPlaceholder('email123@email.com').fill(INFO.email);
}

// USPS radio/checkbox inputs are display:none — force:true still fails.
// The only reliable way is to call el.click() directly via evaluate().
async function jsClick(page: Page, selector: string) {
  await page.locator(selector).waitFor({ state: 'attached', timeout: 30_000 });
  await page.locator(selector).evaluate((el: HTMLElement) => el.click());
}

async function fillStep2PickupPreferences(page: Page, onProgress: (s: string) => void) {
  // Dog question: id is on the <input>, label is CSS display:none
  await jsClick(page, '#second-radio-verification');

  // Step 2: Location of your packages
  // The label is CSS display:none so getByLabel fails — wait for the Step 2
  // heading (which IS visible), then pick the only <select> left on the page.
  await page.getByText('Where will you leave your package').waitFor({ state: 'visible', timeout: 15_000 });

  // The State <select> from Step 1 stays in the DOM (hidden) after availability
  // check, so locator('select').first() grabs the wrong one. Search all selects
  // for the one that contains a "Front Door" option.
  await page.evaluate(() => {
    for (const select of document.querySelectorAll('select')) {
      const opt = Array.from((select as HTMLSelectElement).options)
        .find(o => o.text.includes('Front Door'));
      if (opt) {
        (select as HTMLSelectElement).value = opt.value;
        select.dispatchEvent(new Event('change', { bubbles: true }));
        return;
      }
    }
    throw new Error('Front Door option not found in any <select> on the page');
  });

  // Step 3: "Pick up during regular mail delivery." radio — also display:none
  await page.locator('label').filter({ hasText: 'Pick up during regular mail delivery' })
    .first().waitFor({ state: 'attached', timeout: 15_000 });
  await page.evaluate(() => {
    const label = Array.from(document.querySelectorAll('label'))
      .find(l => l.textContent?.includes('Pick up during regular mail delivery'));
    const id = label?.getAttribute('for');
    const input = id ? document.getElementById(id) as HTMLInputElement : null;
    if (!input) throw new Error('Pick up during regular mail delivery radio not found');
    // Fire all events Angular might be watching
    input.checked = true;
    input.dispatchEvent(new Event('input',  { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    input.click();
  });

  const date = getNextPickupDate();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const y = date.getFullYear();
  onProgress(`Selecting pickup date: ${m}/${d}/${y}…`);
  await selectCalendarDate(page, date);
}


async function selectCalendarDate(page: Page, date: Date) {
  const m  = date.getMonth() + 1;
  const d  = date.getDate();
  const y  = date.getFullYear();
  const mm = String(m).padStart(2, '0');
  const dd = String(d).padStart(2, '0');

  // Calendar wrapper is display:none like everything else — wait for DOM presence
  await page.locator('.choose-day-calendar-wrapper').first()
    .waitFor({ state: 'attached', timeout: 15_000 });

  const clicked = await page.evaluate(({ m, d, y, mm, dd }) => {
    const dayStr = String(d);

    // Try aria-label with common date formats first
    for (const fmt of [`${m}/${d}/${y}`, `${mm}/${dd}/${y}`, `${y}-${mm}-${dd}`]) {
      const el = document.querySelector(`[aria-label="${fmt}"]`) as HTMLElement | null;
      if (el) { el.click(); return `aria-label=${fmt}`; }
    }

    // Walk all calendar wrappers and find a non-disabled cell matching the day number
    for (const wrapper of document.querySelectorAll('.choose-day-calendar-wrapper')) {
      for (const cell of wrapper.querySelectorAll('td, button, [role="gridcell"]')) {
        if (cell.textContent?.trim() !== dayStr) continue;
        if (cell.getAttribute('aria-disabled') === 'true') continue;
        if (['disabled', 'unavailable', 'inactive'].some(c => cell.classList.contains(c))) continue;
        (cell as HTMLElement).click();
        return `cell text=${dayStr}`;
      }
    }

    // Debug: return what cells are available
    const cells = Array.from(document.querySelectorAll('.choose-day-calendar-wrapper td, .choose-day-calendar-wrapper button'))
      .map(c => c.textContent?.trim()).filter(Boolean).slice(0, 20);
    return `NOT_FOUND cells=[${cells.join(',')}]`;
  }, { m, d, y, mm, dd });

  if (!clicked || clicked.startsWith('NOT_FOUND')) {
    throw new Error(`Could not click date ${m}/${d}/${y} in calendar. Debug: ${clicked}`);
  }
}

async function fillStep4PackageDetails(page: Page, packages: number, weight: number) {
  await page.waitForSelector(
    'input[id*="ground" i], input[id*="Ground"], input[id*="GA" i]',
    { timeout: 20_000 },
  );

  const groundInput = page
    .locator('input[id*="ground" i], input[id*="Ground"], input[id*="GA" i]')
    .first();
  await groundInput.fill(String(packages));

  const weightInput = page
    .locator('input[id*="weight" i], input[placeholder*="weight" i], input[id*="Weight"]')
    .first();
  await weightInput.fill(String(weight));

  await page.click(
    'label:has-text("do not contain any Hazardous"), ' +
    'input[type="checkbox"]:near(:text("do not contain any Hazardous"))',
  );

  await page.click(
    'label:has-text("Terms & Conditions"), label:has-text("Terms and Conditions"), ' +
    'input[type="checkbox"]:near(:text("Terms"))',
  );
}
