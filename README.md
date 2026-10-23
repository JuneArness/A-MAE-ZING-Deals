# A MAE Zing Deals LLC: Online Store

**Everyday Home Essentials You MAE Need!**

An online store for affordable household essentials in S.E. Grand Rapids, Michigan.
Shoppers browse, search, add items to a cart and place an order request, then pay with
Cash App, Venmo or cash. The owner runs the store from a password-protected dashboard,
with no code editing.

Built by SAP Development Solutions, LLC.

---

## Status: what's done and what you still need to do

| Area | Status |
| --- | --- |
| Storefront, cart, checkout, order confirmation | **Built and tested** in preview mode (72 automated browser checks) |
| Database, security rules, order logic | **Built and tested** on a real Postgres engine (17 automated checks) |
| Owner dashboard: products, photos, categories, orders, settings, CSV | **Built and tested** in preview mode |
| Supabase project (database, logins, photo storage) | **You create it** (free); steps below. Not yet connected to a real project. |
| Hosting / going live | **You deploy it** (free); steps below. **Not deployed yet.** |
| Cash App / Venmo details | **You enter them** in Admin → Settings. None are filled in. |
| Store policies | Draft text included, **needs your review** |
| Email confirmations | **Not included.** Customers see an on-screen confirmation and the store calls or texts them. |
| Online card payments | **Not included** (by design: Cash App, Venmo and cash only) |

The 65 starter products are **sample listings**. Each is labeled "Sample listing" on the
site, none has a comparison ("compare at") price, and stock numbers are placeholders.
On the real store, **sample listings can't be ordered** until you switch that on
(Settings → Sample listings). Replace them with your real items before you launch.

---

## How it works

- **Website:** React + TypeScript (built with Vite) and Tailwind CSS. Hosted as a static site
  on Netlify or Cloudflare Pages (both have free plans).
- **Backend:** [Supabase](https://supabase.com), which provides the Postgres database, the
  owner login and photo storage.
- **Security:** enforced by the database itself (row-level security), not by hiding buttons:
  - Shoppers can only **read** published products and store settings.
  - Orders can only be created through one database function, `place_order`. It looks up the
    real prices, checks and reserves stock inside a transaction, blocks duplicate submissions,
    and limits abuse:
    - 20 of any one item per order, and 100 items in total;
    - 5 orders per phone number in 15 minutes;
    - no more than 25 pending orders store-wide per hour.
  - Only accounts listed in `admin_users` can change products or settings, see orders, or
    upload photos.
  - No secret keys are in the website code. The "anon" key in the website is public by design.
- **Prices** are stored in cents. The cart total on the screen is a preview; the database
  recalculates it when an order is placed.

```text
amaezing-deals/
├── src/
│   ├── pages/            Storefront: Home, Shop/Category, Product, Cart, Checkout, Order confirmation, Policies, About, Contact, 404
│   ├── admin/            Owner dashboard: Overview, Products + editor + photos, Categories, Orders, Settings, Import/Export
│   ├── components/       Shared UI: header/footer layout, logo, product card, dialogs
│   ├── lib/
│   │   ├── api.ts        One interface used by the whole app
│   │   ├── supabaseApi.ts  The real backend
│   │   ├── demoApi.ts    Preview mode only (sample data in the browser)
│   │   ├── cart.tsx, store.tsx, auth.tsx, validation.ts, image.ts, csv.ts, seo.ts, format.ts
│   └── data/defaults.ts  Default settings and DRAFT policy text
├── supabase/
│   ├── migrations/       0001 schema · 0002 functions · 0003 security rules · 0004 photo storage
│   ├── seed.sql          65 sample products in 8 categories (optional)
│   └── seed-data/catalog.json
├── public/               Favicon, app icon, share image, robots.txt, hosting redirects/headers
├── scripts/              generate-seed.mjs, generate-sitemap.mjs
├── tests/                db.test.mjs (database), e2e.py (browser)
├── .env.example          Template for the two public Supabase values
└── netlify.toml, vercel.json, public/_redirects, public/_headers
```

---

## 1. Preview it on your computer (no setup needed)

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev:demo
```

Open the address it prints (usually http://localhost:5173).

- **Preview mode** runs everything in your browser with the sample products. Nothing is saved
  to a server, and orders don't reach anyone.
- Owner dashboard: go to `/admin` and sign in with `demo@amaezing.local` / `preview-only`.
  This preview-only login doesn't exist in the real store.

---

## 2. Set up Supabase (database, login, photos)

1. Go to https://supabase.com, sign up, and click **New project**.
   - Name: `amaezing-deals`. Set a strong database password and save it in a password manager.
   - Region: **East US** (closest to Michigan).
   - Wait about 2 minutes for it to finish.
2. Open **SQL Editor** → **New query**. Run each of these files **in order**: open the file,
   copy everything, paste it in, and click **Run**. Each should say "Success".
   1. `supabase/migrations/0001_schema.sql`
   2. `supabase/migrations/0002_functions.sql`
   3. `supabase/migrations/0003_security.sql`
   4. `supabase/migrations/0004_storage.sql`
   5. *(Optional)* `supabase/seed.sql`: the 65 sample products. Skip it to start empty.
3. **Turn off public sign-ups**, so only accounts you create can log in. Go to
   **Authentication** → **Sign In / Providers** (called **Providers** or **Settings** in some
   dashboard versions) and switch **Allow new users to sign up** off.
4. **Create the owner login.** Go to **Authentication** → **Users** → **Add user** → **Create
   new user**, enter the owner's email and a strong password, and tick **Auto Confirm User**.
5. **Make that user an administrator.** In the **SQL Editor**, run the following, using the
   email from step 4:

   ```sql
   insert into public.admin_users (user_id, email)
   select id, email from auth.users where email = 'owner@example.com';
   ```

   It should say "1 row". To add another admin later, repeat steps 4 and 5. To remove one:
   `delete from public.admin_users where email = '...';`
6. **Copy the two public values.** Go to **Project Settings** → **API** (or **Data API**):
   - **Project URL** (looks like `https://abcdxyz.supabase.co`)
   - **anon / public key** (a long string)

   ⚠️ Never use the **service_role** (secret) key anywhere in this project.
7. **Check photo storage.** **Storage** should show a bucket named `product-images` marked
   **Public**. Migration 0004 created it, with a 5 MB limit and JPG/PNG/WebP only.

To test it locally against your real project, copy `.env.example` to `.env.local`, fill in
the two values, run `npm run dev`, and sign in at `/admin`.

---

## 3. Put the code on GitHub

1. Create a **private** repository on GitHub, for example `amaezing-deals`.
2. Upload the project folder, or use Git:

   ```bash
   git init && git add . && git commit -m "A MAE Zing Deals store"
   git branch -M main
   git remote add origin https://github.com/YOUR-ACCOUNT/amaezing-deals.git
   git push -u origin main
   ```

`.env.local` and `node_modules` are excluded automatically by `.gitignore`.

---

## 4. Deploy (go live)

### Netlify (recommended)

1. Sign in at https://app.netlify.com → **Add new site** → **Import an existing project** →
   **GitHub**, and pick the repository.
2. The build settings come from `netlify.toml`: build command `npm run build`, publish
   directory `dist`.
3. Before deploying, open **Environment variables** and add:

   | Key | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | your Project URL |
   | `VITE_SUPABASE_ANON_KEY` | your anon public key |
   | `VITE_SITE_URL` | the live address, e.g. `https://amaezingdeals.netlify.app` (no slash at the end) |

4. Click **Deploy**. Then open the site and run the launch test below.
5. **Custom domain** (optional): **Domain management** → **Add a domain**. Follow Netlify's DNS
   steps, then update `VITE_SITE_URL` to match and redeploy.

### Cloudflare Pages (alternative)

**Workers & Pages** → **Create** → **Pages** → connect to Git. Use framework preset
**None**, build command `npm run build`, output directory `dist`, and the same three
environment variables. Routing (`public/_redirects`) and security headers (`public/_headers`)
are already included.

> If the environment variables are missing, the site shows a "This store isn't connected yet"
> page with the phone numbers instead of breaking.

---

## 5. Before launch checklist

The dashboard's **Overview** page lists what's still missing.

- [ ] **Admin → Settings → Payment details:** enter your **real** Cash App $Cashtag and/or
  Venmo username. Test each by sending yourself $1.
- [ ] **Settings → Pickup:** add pickup instructions (where and when). No street address is
  shown unless you type one.
- [ ] **Settings → Policies:** read and edit the five drafts, then tick **I've reviewed these
  policies**. They are plain-language drafts, not legal advice.
- [ ] **Products:** replace the sample listings with your real items.
  - For each item: confirm the stock, upload a photo, set **Availability → Available**.
  - Archive any samples you don't carry. Sample listings can't be ordered on the real store
    unless you switch on **Settings → Sample listings**.
- [ ] Only enter a **compare-at price** when you've checked the same item at another store,
  and note where and when. It's only shown when you tick "I checked this comparison price".
- [ ] Only tick **Best seller** for items that really sell well. The Best Sellers section stays
  hidden until you do.
- [ ] **Launch test** on the live site:
  1. Mark one real product **Available** with stock, then place a small test order for it on
     your phone.
  2. Check it appears in **Admin → Orders**.
  3. Mark it **Paid**, then **Cancel** it, and confirm the stock went back up.
  4. Upload a photo, refresh, sign out, and confirm the photo is still there.
- [ ] Edit `public/robots.txt` if needed. The sitemap address is filled in automatically from
  `VITE_SITE_URL`.

---

### #ChooseHappiness brand files

`public/brand/` holds the **#ChooseHappiness** logo made from the founders' sunset photo:
- the round seal badge, used on the About page;
- the "#Choose Happiness" wordmark with the sunset "o", used in the footer;
- `choose-happiness-badge.svg`, the seal as a vector file for signs and print (text is outlined, so no fonts are needed).

The full logo set (emblem, seals, wordmarks, square icon) is delivered separately as `ChooseHappiness-logos-v2.zip`.

The founders' names and story on the About page are edited in **Admin → Settings → About page**.

## 6. Running the store day to day

- **New order:** it appears under **Orders** (and on the Overview) as *Pending confirmation*.
  1. Call or text the customer. The number is a tap-to-call link.
  2. Set the status to **Confirmed** or **Awaiting payment**.
  3. Mark **Paid** when the money arrives.
  4. Set **Fulfilled** when it's picked up.
- **Canceling** puts the items back in stock automatically.
  - A canceled order can't be reopened; ask the customer to order again.
  - A fulfilled order can't be canceled.
  - To cancel a paid order, set Payment to **Refunded** first.
- **Stale orders:** on the **Orders** page, **Cancel stale unpaid orders** cancels every unpaid
  order that has waited more than 48 hours and puts the items back in stock.
- **Revenue** on the dashboard counts only orders you marked **Paid** (and not canceled).
- **Stock** goes down when an order is placed and up when it's canceled. Every change is logged.
- **Photos:** in a product, click **Add photos** (works from a phone camera roll). Use
  **Replace**, **Earlier**/**Later** and the trash icon to manage them. The first photo is the
  main one.
- **Bulk changes:** in **Products**, tick several items to publish, unpublish, set
  availability, set stock or archive them all at once.
- **Spreadsheets:** **Import / Export** downloads all products as a CSV file. You can edit it
  in Excel or Google Sheets and import it back.
  - Products are matched by `slug`.
  - Updates only change the columns in your file. A file with just `slug,name,category,price`
    changes prices without touching stock.
  - Every row is checked first, and nothing changes until the file has no errors.
- **Categories:** you can add, rename, reorder (↑ ↓), hide or delete them. A category that
  still has products can't be deleted.

---

## 7. Testing

```bash
npm run typecheck   # TypeScript
npm run test:db     # database tests (real Postgres via PGlite): 17 checks
npm run build:demo && npx vite preview --mode demo --port 4173   # then, in a second terminal:
npm run test:e2e    # browser tests (needs: pip install playwright && playwright install chromium): 72 checks
```

### What the tests cover

**Database tests** (they run all four migrations and the seed):
- Shoppers can't see unpublished or archived products, and can't write to any table.
- Signed-in non-admins can't change data or read orders.
- Prices come from the database, not the browser.
- Duplicate order submissions create one order.
- Out-of-stock, invalid and unavailable items are refused, and nothing changes when they are.
- The rate limit works.
- An order can only be looked up with its private link.
- Canceling restores stock exactly once.
- Dashboard revenue counts paid orders only.
- Only admins can upload photos.

**Browser tests:**
- Every home page section.
- Search, filters and sorting.
- Cart math, stock caps and the cart surviving a refresh.
- Checkout validation, and a double-click creating only one order.
- The confirmation page, including a wrong-link test.
- Admin login, a wrong password and blocked access when signed out.
- Order status changes, canceling and stock restoring.
- Creating a product and uploading a photo; non-image files are rejected.
- Categories, CSV import with error reporting, and settings.
- Accessibility checks (axe-core, WCAG A/AA) on 7 pages.
- No sideways scrolling at 9 screen widths on 10 pages.

### Not tested yet (needs your live Supabase project)

The browser tests run in preview mode. The real Supabase connection (sign-in emails,
uploads to Supabase Storage and live database rules) is covered by the database tests and
the code, but **has not been run against a live project**. Do the launch test in section 5
after deploying.

---

## 8. Services and costs

Prices change, so check each service's pricing page before relying on these numbers.

| Service | Used for | Cost |
| --- | --- | --- |
| Supabase | Database, owner login, photo storage | **Free plan:** 500 MB database, 1 GB file storage, about 5 GB bandwidth a month. Free projects **pause after one week with no activity** and must be restored in the dashboard. **Pro plan:** about $25/month, with no pausing. *(Figures from a third-party summary dated mid-2026; confirm at supabase.com/pricing.)* |
| Netlify or Cloudflare Pages | Hosting the website | Free plans fit a small store |
| Domain name (optional) | e.g. amaezingdeals.com | Roughly $10–20/year from a registrar |
| Cash App / Venmo | Payments (outside the website) | Their own terms and fees apply. Business accounts may have fees. |

**Tip:** if the free Supabase plan pauses the store during a slow week, shoppers will see an
error until you restore it. Upgrading to Pro removes pausing.

---

## 9. Limits and honest notes

- **No online payments.** Customers place an order request, and you confirm before they pay.
  Nothing is charged by the website, and no card or bank details are collected.
- **Sales tax and delivery fees** are not calculated online. The checkout says the store will
  confirm any charges before payment. Ask a tax professional how Michigan sales tax applies to
  your sales.
- **No email confirmations.** These need an email service (e.g. Resend or Postmark), which can
  be added later. The site never claims an email was sent.
- **Search engines:**
  - Each product has its own address, title, description, share preview and (for real,
    non-sample listings) structured product data, with no reviews or ratings.
  - The site is a single-page app, so pages are built in the browser. Google handles this
    well; some smaller crawlers may not.
- **Sitemap:** it's built when the site deploys. New products are added to it the next time you
  redeploy (in Netlify: **Deploys** → **Trigger deploy**).
- **Bot protection:** orders have rate limits but no CAPTCHA. If spam orders ever become a
  problem, a free Cloudflare Turnstile check can be added.
- **Product photos:** the sample listings show a colored placeholder with an icon until you
  upload real photos. No stock photos of other brands are used.
- **Policies** are drafts for you to review, not legal advice.

---

## 10. Maintenance tips

- **Back up:** in Supabase → **Database** → **Backups**. The free plan has limited backups, so
  also use **Admin → Import / Export** to download a product CSV regularly.
- **Change brand colors** in `src/index.css` (the `@theme` block).
- **Edit the starter catalog** in `supabase/seed-data/catalog.json`, then run `npm run seed` to
  rebuild `supabase/seed.sql`.
- Never commit `.env.local` or any Supabase **service_role** key.
