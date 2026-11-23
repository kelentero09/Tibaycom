# Project plan and status

_Last updated: 23 November 2026_

## Objective

An affordable platform where Philippine construction professionals showcase projects, establish an online presence, create professional quotations and connect with clients — optimised for simplicity, low operating cost and security.

## Delivery status

| # | Module | Status | Verified by |
|---|---|---|---|
| 1 | Foundation: Next.js on Cloudflare Workers, D1 + Drizzle, R2, design system | Done | Build, Worker dry-run |
| 2 | Authentication: sign-up, email verification, login, password reset, 2FA, account deletion | Done | Smoke, e2e |
| 3 | Professional profiles and portfolios with owner-only inline editing | Done | Integration, e2e, smoke |
| 4 | Public site: landing, directory with filters, profile pages, pricing, legal pages, SEO | Done | e2e, smoke |
| 5 | Quotation generator with client-side PDF | Done | Unit, integration, e2e |
| 6 | Subscriptions with PayMongo Checkout + webhooks | Done against a simulated gateway; **real PayMongo test run pending** | Integration (25 tests), smoke |
| 7 | Super Admin dashboard | Done | Admin smoke, integration |
| 8 | Security hardening, tests, CI, documentation | Done | See TESTING.md |

| 9 | Requests inbox, photo ordering + cover, shareable quotation links, PDF share sheet | Done | Integration, e2e |
| 10 | Google sign-in (Facebook ready, needs credentials), English / Filipino interface | Done; **Google needs its redirect URI set and one manual sign-in test** | Typecheck, e2e (language) |
| 11 | Upgrade prompts at plan limits, owner alerts for failures | Done | Integration, e2e |
| 12 | Visual refresh and transitions | Done | Screenshots reviewed on desktop and phone |

Not done by design: production deployment, live payments (both need the owner's approval).

## Decisions that differ from the original brief

| Brief | What was built | Why |
|---|---|---|
| Astro + React | **Next.js 16 (App Router)** | Changed at the owner's instruction during the build. |
| "Officially supported payment and subscription APIs" | PayMongo **Checkout Sessions**, prepaid periods, manual renewal with reminder emails | PayMongo's Subscriptions API requires account activation by PayMongo; the brief allows manual renewal when automatic recurring payments are unavailable. Also lets customers pay with GCash/Maya, not only cards. |
| Resend (SDK) | Resend's HTTP API via `fetch` | One less dependency and a smaller Worker bundle. |
| shadcn/ui | shadcn-style components written by hand on Radix primitives | The shadcn CLI hung on a hidden prompt in this environment; the resulting components follow the same conventions. |
| Turbopack (Next.js default) | **webpack** for production builds | Turbopack duplicated shared server code per route (4.8 MiB gzipped, over the 3 MiB free-plan limit). Webpack produces 2.28 MiB. |
| Plan table in the brief (₱149; 3/20 projects; 10/100 photos; 3/50 quotations) | **₱399 / ₱3,990; Free 2 projects, 2 photos per project, 2 quotations a month; Premium 50 projects, 10 photos per project, unlimited quotations** | Changed at the owner's instruction. The photo limit is now per project instead of a total. |
| Quotation limit | Enforced on **creating** quotations | PDFs are generated in the browser, so the saved quotation is the unit the server can enforce. Sharing a link or re-downloading a PDF does not use quota. |
| "Contact / request quotation" emailed only | Saved to a requests inbox **and** emailed; auto-deleted after 180 days | A spam-filtered email no longer loses the lead. |
| Email + password only | Also Google / Facebook sign-in | Removes the email-verification drop-off. Administrators cannot use it (password + 2FA only). |
| "Quotation history for premium users" | Free accounts can open only the current month's quotations; older ones are kept but locked | Preserves data across downgrade and upgrade. |

## Assumptions

1. Currency is PHP only; quotation tax is a single optional percentage (12% VAT shortcut), not BIR-compliant invoicing.
2. One profile per account; up to 6 professions (from the list in `src/lib/professions.ts` and/or typed under "Other") and 8 specializations. Typed professions are searchable by text but are not directory filter options.
8. A shared quotation link keeps working until the owner turns it off or deletes the quotation, including on the Free plan after the month ends.
9. "Filipino" covers navigation, landing, sign-up / log-in, directory and pricing. Deeper screens, emails and legal pages remain in English.
3. Locations come from the PSGC (82 provinces including "Metro Manila" as a pseudo-province; 1,634 cities/municipalities). Cotabato City and Isabela City are filed under Maguindanao and Basilan.
4. Downgrades hide content above Free limits and never delete it.
5. Refunds are initiated in the PayMongo dashboard, not from Tibay's admin.
6. The directory sorts by most recently updated. Premium does not buy ranking.
7. Sessions last 30 days. Admins must use TOTP 2FA.

## Limitations and unresolved items

| Item | Impact | Suggested action |
|---|---|---|
| **PayMongo webhook signature format not verified against a real delivery** | If the format differs, live webhooks would be rejected (payments would still activate through the return-URL verification, but refunds and failures would not sync). | DEPLOYMENT.md step 7 — a 15-minute test-mode rehearsal. |
| **Workers Free CPU limit vs. password hashing** | Sign-in may be terminated under load on the free plan. | Monitor logs; budget US$5/month for Workers Paid if it occurs. Decision for the owner. |
| **Google sign-in redirect URI** | The OAuth client currently lists `http://localhost:3000` as its redirect URI; Google will reject the sign-in until `…/api/auth/callback/google` is added. | Add it in Google Cloud Console for localhost and for the production domain (DEPLOYMENT.md). |
| Existing Free users above the new, lower limits | Extra projects, photos beyond 2 per project stay saved but are hidden from visitors. | Intended ("downgrade never deletes"); tell early users before lowering limits in production. |
| Unlimited quotations | No monthly cap for Premium; write endpoints are still rate limited (120 / hour). | Watch D1 usage if a single account creates thousands. |
| Enabled PayMongo payment methods vary per merchant account | Checkout creation fails if the code requests a method the account lacks. | Trim the list in `createCheckoutSession()` during the rehearsal. |
| CSP allows inline scripts and styles | Weaker XSS backstop than a nonce-based policy. | Acceptable for launch (no user HTML is rendered); revisit later. |
| Privacy Policy and Terms are templates | Not legal advice; operator details missing. | Fill in entity details, appoint a DPO, legal review. |
| Accessibility checked structurally, not with axe or a screen reader | Unknown issues may remain. | Run an axe scan and a manual pass before launch. |
| No load or Lighthouse testing on real infrastructure | Performance claims are from local measurements. | Run after the first staging deploy. |
| R2 has no automatic backup | Image loss is possible in a bucket-level incident. | Optional periodic mirror (DEPLOYMENT.md). |
| `npm` on the development machine is corrupted (`format-bytes.js` unreadable in the Node installation) | Use pnpm (already the project's package manager). | Reinstall Node.js when convenient. |

## Before going live (owner checklist)

- [ ] Approve production deployment.
- [ ] Domain on Cloudflare; Resend sending domain verified.
- [ ] Real Turnstile keys; all secrets set with `wrangler secret put` (including Google credentials and, optionally, `ALERT_WEBHOOK_URL`).
- [ ] Google OAuth redirect URIs added; one manual Google sign-in tested.
- [ ] `/admin/system` → *Send test alert* received by email (and chat, if configured).
- [ ] `database_id` filled in; remote migration applied.
- [ ] First Super Admin promoted and 2FA enabled.
- [ ] PayMongo test-mode rehearsal completed (payment, webhook, refund).
- [ ] Decide Workers Free vs. Paid.
- [ ] Privacy Policy / Terms completed and reviewed; DPO appointed.
- [ ] Backup export scheduled and one restore drill done.
- [ ] Approve switching to live PayMongo keys.

## Future enhancements (out of scope now)

Real-time messaging · job marketplace · project bidding · GPS / maps · ratings and reviews · AI features · native mobile apps · escrow payments · advanced project management · microservices. Nearer-term candidates: automatic recurring billing once PayMongo Subscriptions is enabled on the account, caching public profile pages, serving images from an R2 custom domain, translating the remaining screens and emails, profile view counts, nonce-based CSP.
