# USPS Pickup Scheduler

Next.js webapp that automates scheduling a USPS carrier pickup by driving the live USPS form with Playwright.

## Stack
- **Next.js 15** (App Router) + **Tailwind CSS v3**
- **Playwright** for browser automation (`playwright-core` + `@sparticuz/chromium-min` for Vercel)
- Deployed on **Vercel** (requires **Pro plan** — function timeout is 120s)
- GitHub: https://github.com/hardier/usps-pickup

## Key files
| File | Purpose |
|------|---------|
| `app/page.tsx` | UI — packages count + weight inputs, SSE progress list, result display |
| `app/api/schedule-pickup/route.ts` | POST endpoint; streams Server-Sent Events back to the client |
| `lib/automation.ts` | All Playwright logic — fills and submits the USPS form step by step |
| `lib/business-days.ts` | Computes next USPS business day (skips weekends + federal holidays) |
| `vercel.json` | Sets `maxDuration: 120` for the API function |

## Hardcoded defaults (override via env vars on Vercel)
```
USPS_FIRST_NAME   Erzhen
USPS_LAST_NAME    Lin
USPS_ADDRESS      3931 Duncan Pl
USPS_CITY         Palo Alto
USPS_STATE        CA
USPS_ZIP          94306
USPS_PHONE        650-785-5885
USPS_EMAIL        erzhenlin@gmail.com
```

## USPS form automation — what each step does

### Step 1 — Contact info
Fills fields by **placeholder text** (IDs are unreliable). State is the only `<select>` on the form at this point.

### After "Check Availability"
The page stays at the same URL and reveals sections inline. All USPS labels have `class="schedule-a-pickup-validation"` (CSS `display:none`). All inputs are also hidden. **Every interaction uses `evaluate()` to call `el.click()` directly in the browser** — Playwright's `force:true` and normal `.click()` both fail on `display:none` elements.

- **Dog radio**: `#second-radio-verification` — wait `state:'attached'`, then `evaluate(() => el.click())`
- **Location dropdown**: search all `<select>` for the one containing "Front Door" option
- **Delivery timing radio** (Step 3): find label by text "Pick up during regular mail delivery", get `for` attr, fire `input`+`change`+`click`
- **Calendar**: wait for `td`/`button` cells with exact day number to appear anywhere on page, then click via `evaluate()`

### Step 4 — Package details
- Ground Advantage count: fill by `input[id*="ground" i]`
- Weight: fill by `input[id*="weight" i]`
- **Hazmat radio** (NOT a checkbox — it's `input[type="radio"]`): `#hazmat-no` or find radio near "do not contain" text
- **Terms checkbox**: text lives in `<p>`/`<span>`, NOT a `<label>` — wait for `text=I have read`, then walk DOM to find adjacent `input[type="checkbox"]`

### Confirmation
Use `waitForFunction` scanning all headings/paragraphs for: "pickup scheduled", "pickup confirmed", "has been scheduled", "confirmation number", "thank you".

## Local dev
```bash
npm run dev          # http://localhost:3000
# Uses /Applications/Google Chrome.app on macOS
```

## Vercel deploy
```bash
npx vercel           # first time
npx vercel --prod    # subsequent deploys
```
Requires Pro plan. Set `CHROMIUM_PACK_URL` env var if you need to pin a different Chromium version (default: v133.0.0).

## Current status (as of 2026-05-31)
Working through selector fixes iteratively — each USPS form element uses `display:none` and requires `evaluate()`. Last known failure: confirmation page wait (`waitForFunction` for success text). The form does submit successfully; the confirmation selector just needs to match the actual USPS success page text.
