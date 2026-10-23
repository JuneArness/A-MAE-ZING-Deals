"""
End-to-end browser test of the store in PREVIEW mode (no real database).
Run:   npm run build:demo && npx vite preview --mode demo --port 4173
then:  python3 tests/e2e.py
Needs Python Playwright with Chromium (pip install playwright && playwright install chromium).
"""
import asyncio, json, os, re, struct, sys, zlib
from pathlib import Path
from playwright.async_api import async_playwright, expect

B = os.environ.get("BASE", "http://127.0.0.1:4173")
WIDTHS = [1920, 1440, 1280, 1024, 768, 480, 430, 390, 375]
AXE = (Path(__file__).parent.parent / "node_modules/axe-core/axe.min.js").read_text()
results = []

def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (f"  [{detail}]" if detail and not ok else ""))

def png_bytes(w=40, h=30, rgb=(200, 100, 70)):
    raw = b"".join(b"\x00" + bytes(rgb) * w for _ in range(h))
    def chunk(t, d): return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xffffffff)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw)) + chunk(b"IEND", b"")

async def seen(loc, timeout=6000):
    try:
        await expect(loc.first).to_be_visible(timeout=timeout)
        return True
    except AssertionError:
        return False

async def money_text(loc):
    return float(re.sub(r"[^0-9.]", "", await loc.inner_text()))

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={"width": 1280, "height": 900})
        pg = await ctx.new_page()
        errors = []
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)

        # ---------------------------------------------------------------- home
        await pg.goto(B + "/")
        await expect(pg.get_by_role("heading", level=1)).to_contain_text("MAE")
        await expect(pg.locator("main article").first).to_be_visible()
        for h in ["Shop by category", "New Arrivals", "Deals Under $5", "Everyday Household Essentials", "How ordering and payment work", "Your neighborhood essentials store"]:
            check(f"home section: {h}", await seen(pg.get_by_role("heading", name=h)))
        check("best sellers hidden when none are flagged", await pg.get_by_role("heading", name="Best Sellers").count() == 0)
        check("tel links on phone numbers", await pg.locator('a[href="tel:+16167197033"]').count() >= 2 and await pg.locator('a[href="tel:+12698380075"]').count() >= 2)
        check("no fake ratings/testimonials", not re.search(r"\breviews?\b|\bratings?\b|testimonial|★", (await pg.locator("main").inner_text()).lower()))

        await pg.goto(B + "/about")
        check("about page names both founders", await seen(pg.get_by_role("heading", name="Stephen A. Parks Jr. & Gina P. McCoy")) and await seen(pg.locator("img[alt^='#ChooseHappiness']")))

        # ---------------------------------------------------------------- search & filters
        await pg.goto(B + "/shop?q=sponge")
        await expect(pg.locator("main ul li article").first).to_be_visible()
        names = await pg.locator("main article h3").all_inner_texts()
        check("search finds sponges", any("Sponge" in n for n in names), str(names))
        await pg.goto(B + "/shop?q=zzzzqq")
        await pg.wait_for_timeout(600)
        check("empty search state", await seen(pg.get_by_role("heading", name="No matching products")))
        await pg.goto(B + "/shop?max=5&sort=price-asc")
        await expect(pg.locator("main article").first).to_be_visible()
        prices = [float(re.sub(r"[^0-9.]", "", t)) for t in await pg.locator("main article .text-forest.font-black").all_inner_texts()]
        check("price filter <= $5", prices and max(prices) <= 5, str(prices[:5]))
        check("sort low to high", prices == sorted(prices))
        await pg.goto(B + "/category/laundry")
        await expect(pg.locator("main article").first).to_be_visible()
        n = await pg.locator("main article").count()
        check("category page shows 8 laundry items", n == 8, str(n))
        await pg.goto(B + "/category/does-not-exist")
        await pg.wait_for_timeout(600)
        check("unknown category shows 404 page", await seen(pg.get_by_role("heading", name="We couldn't find that page")))

        # ---------------------------------------------------------------- product + cart
        await pg.goto(B + "/product/heavy-duty-scrub-brush")
        await pg.get_by_role("button", name="Increase quantity").click()
        await pg.get_by_role("button", name="Increase quantity").click()
        await pg.locator("main").get_by_role("button", name="Add to cart", exact=True).click()
        await expect(pg.get_by_label(re.compile(r"Cart, 3 items"))).to_be_visible()
        check("add 3 to cart from product page", True)
        check("sample listing labeled", await seen(pg.get_by_text("This is a sample listing")))
        check("no Product JSON-LD for sample listing", "\"@type\":\"Product\"" not in await pg.content())

        await pg.goto(B + "/product/lint-brush")
        await pg.locator("main").get_by_role("button", name="Add to cart", exact=True).click()
        await pg.goto(B + "/cart")
        sub = await money_text(pg.locator("aside dl div").last.locator("dd"))
        check("cart subtotal = 3x3.50 + 2.00", abs(sub - 12.50) < 0.001, str(sub))
        # quantity beyond stock is capped
        qty_in = pg.get_by_label("Quantity", exact=True).first
        await qty_in.fill("999")
        await pg.wait_for_timeout(150)
        capped = int(await qty_in.input_value())
        check("quantity capped to stock", capped < 999 and capped >= 1, str(capped))
        await qty_in.fill("2"); await pg.wait_for_timeout(100)
        await pg.reload()
        await expect(pg.get_by_label(re.compile(r"Cart, 3 items"))).to_be_visible()
        check("cart persists after refresh", True)
        await pg.get_by_role("button", name="Remove Lint Brush").click()
        await expect(pg.get_by_label(re.compile(r"Cart, 2 items"))).to_be_visible()
        check("remove item from cart", True)

        # ---------------------------------------------------------------- checkout validation
        await pg.get_by_role("button", name=re.compile("Continue to checkout")).click()
        await expect(pg.get_by_role("heading", name="Checkout", exact=True)).to_be_visible()
        await pg.get_by_role("button", name="Place order request").click()
        check("checkout: required name error", await seen(pg.get_by_text("Please enter your name.")))
        check("checkout: focus moved to first error", await pg.evaluate("document.activeElement.id") == "co-name")
        await pg.get_by_label("Full name").fill("Test Shopper")
        await pg.get_by_label("Phone number").fill("123")
        await pg.get_by_role("button", name="Place order request").click()
        check("checkout: invalid phone", await seen(pg.get_by_text("Please enter a valid phone number with area code.")))
        await pg.get_by_label("Phone number").fill("(616) 555-0142")
        await pg.get_by_text("Venmo", exact=True).click()
        check("payment info when not configured", await seen(pg.get_by_text("We'll send our Venmo details when we confirm your order.")))
        # double click to try a duplicate submission
        btn = pg.get_by_role("button", name="Place order request")
        await btn.dblclick()
        await expect(pg.get_by_role("heading", name=re.compile("Your order request is in"))).to_be_visible()
        order_no = (await pg.locator("main p.text-2xl").inner_text()).strip()
        check("order number generated", re.match(r"^AMZ-\d{6}-\d+$", order_no) is not None, order_no)
        check("confirmation says not paid", await seen(pg.get_by_text("Nothing has been charged.")))
        tot = await money_text(pg.locator("tfoot td"))
        check("confirmation total", abs(tot - 7.00) < 0.001, str(tot))
        conf_url = pg.url
        await expect(pg.get_by_label(re.compile(r"Cart, 0 items"))).to_be_visible()
        check("cart cleared after order", True)
        await pg.reload()
        check("confirmation reloads from link", order_no in await pg.content())
        await pg.goto(conf_url.split("?")[0] + "?t=00000000-0000-4000-8000-000000000000")
        check("wrong token can't view order", await seen(pg.get_by_role("heading", name="We couldn't find that order")))
        await pg.goto(B + "/product/heavy-duty-scrub-brush")

        # ---------------------------------------------------------------- admin auth
        await pg.goto(B + "/admin/products")
        check("admin requires sign-in", await seen(pg.get_by_role("heading", name="Owner sign in")))
        check("no product data shown when signed out", await pg.locator("table").count() == 0)
        await pg.get_by_label("Email").fill("demo@amaezing.local"); await pg.get_by_label("Password").fill("wrong")
        await pg.get_by_role("button", name="Sign in").click()
        check("wrong password rejected", await seen(pg.get_by_text("That email and password didn't work")))
        await pg.get_by_label("Password").fill("preview-only")
        await pg.get_by_role("button", name="Sign in").click()
        await expect(pg.get_by_role("heading", name="Products", exact=True)).to_be_visible()
        check("admin sign-in works", True)

        CAT = json.loads((Path(__file__).parent.parent / "supabase/seed-data/catalog.json").read_text())
        start_qty = next(x["inventory_qty"] for x in CAT["products"] if x["slug"] == "heavy-duty-scrub-brush")
        async def admin_qty():
            await pg.goto(B + "/admin/products?q=heavy-duty")
            await expect(pg.locator("tbody tr").first).to_be_visible()
            return int(await pg.locator("tbody tr").first.locator("td").nth(3).inner_text())
        async def admin_qty_slug(slug):
            await pg.goto(B + f"/admin/products?q={slug}")
            await expect(pg.locator("tbody tr").first).to_be_visible()
            return int(await pg.locator("tbody tr").first.locator("td").nth(3).inner_text())
        q1 = await admin_qty()
        check("stock reduced by 2 after order", q1 == start_qty - 2, f"{start_qty} -> {q1}")

        # ---------------------------------------------------------------- orders: duplicate check, status, cancel
        await pg.goto(B + "/admin/orders")
        await expect(pg.locator("tbody tr").first).to_be_visible()
        rows = await pg.locator("tbody tr").count()
        check("double-click created exactly one order", rows == 1, str(rows))
        await pg.goto(B + "/admin")
        await expect(pg.get_by_role("link", name=re.compile("Pending orders"))).to_be_visible()
        check("dashboard pending order count", (await pg.get_by_role("link", name=re.compile("Pending orders")).inner_text()).strip().endswith("1"))
        check("dashboard paid sales is $0 while unpaid", "$0.00" in await pg.get_by_role("link", name=re.compile("Paid sales")).inner_text())
        await pg.goto(B + "/admin/orders")
        await pg.get_by_role("link", name=order_no).click()
        await pg.get_by_label("Order status").select_option("confirmed")
        await pg.get_by_label("Payment").select_option("paid")
        await pg.get_by_label("Add to history").fill("Called customer")
        await pg.get_by_role("button", name="Save changes").click()
        await expect(pg.get_by_text("Called customer")).to_be_visible()
        check("order status + history saved", await seen(pg.get_by_text("pending confirmation -> confirmed")))
        await pg.goto(B + "/admin")
        await expect(pg.get_by_role("link", name=re.compile("Paid sales"))).to_be_visible()
        check("paid sales counts paid order", "$7.00" in await pg.get_by_role("link", name=re.compile("Paid sales")).inner_text())
        await pg.goto(B + "/admin/orders"); await pg.get_by_role("link", name=order_no).click()
        pg.once("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await pg.get_by_role("button", name="Cancel order…").click()
        check("paid order can't be canceled until refunded", await seen(pg.get_by_text("Set Payment to Refunded")))
        await pg.get_by_label("Payment").select_option("refunded")
        pg.once("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await pg.get_by_role("button", name="Cancel order…").click()
        await expect(pg.get_by_text("This order is canceled.")).to_be_visible()
        check("cancel restores stock", await admin_qty() == start_qty)

        # ---------------------------------------------------------------- admin: create product + image
        await pg.goto(B + "/admin/products/new")
        await pg.get_by_role("button", name="Create product").click()
        check("product form validation", await seen(pg.get_by_text("Product name is required.")))
        await pg.get_by_label("Product name", exact=True).fill("Owner Test Lint Roller")
        await pg.get_by_label("Description").fill("A test product added from the admin.")
        await pg.get_by_label("Category").select_option(label="Laundry Essentials")
        await pg.get_by_label("Selling price ($)").fill("3.25")
        await pg.get_by_label("Quantity on hand").fill("7")
        await pg.get_by_label("Published").check()
        check("live preview shows price", "$3.25" in await pg.locator("aside[aria-labelledby=pe-preview]").inner_text())
        await pg.get_by_role("button", name="Create product").click()
        await expect(pg.get_by_role("heading", name="Photos")).to_be_visible()
        check("product created, photo section available", True)
        Path("/tmp/claude-0/test.png").write_bytes(png_bytes(64, 48))
        Path("/tmp/claude-0/test.txt").write_text("not an image")
        await pg.locator('input[type=file]').first.set_input_files("/tmp/claude-0/test.txt")
        check("non-image upload rejected", await seen(pg.get_by_text("isn't a JPG, PNG or WebP image")))
        await pg.locator('input[type=file]').first.set_input_files("/tmp/claude-0/test.png")
        await expect(pg.get_by_text("Main photo")).to_be_visible()
        check("image upload works", True)
        await pg.goto(B + "/shop?q=owner%20test")
        check("new product appears on storefront", await seen(pg.get_by_role("heading", name="Owner Test Lint Roller")))
        await pg.goto(B + "/product/owner-test-lint-roller")
        check("uploaded image shown on product page", await seen(pg.locator("main img[alt='Owner Test Lint Roller']")))
        ld = await pg.locator("#page-jsonld").text_content()
        check("Product JSON-LD for real listing (no ratings)", ld and '"@type":"Product"' in ld and "aggregateRating" not in ld and "review" not in ld)

        # ---------------------------------------------------------------- categories
        await pg.goto(B + "/admin/categories")
        await expect(pg.get_by_text("/laundry")).to_be_visible()
        check("delete disabled for category with products", await pg.get_by_role("button", name="Delete").first.is_disabled())
        await pg.get_by_role("button", name="Add category").click()
        await pg.get_by_label("Name").fill("Seasonal")
        await pg.get_by_role("button", name="Save category").click()
        await expect(pg.get_by_text("/seasonal")).to_be_visible()
        pg.once("dialog", lambda d: asyncio.ensure_future(d.accept()))
        await pg.locator("li", has_text="/seasonal").get_by_role("button", name="Delete").click()
        await expect(pg.get_by_text("/seasonal")).to_have_count(0)
        check("add and delete empty category", True)

        # ---------------------------------------------------------------- CSV import
        bad = "slug,name,category,price\nbad slug!,X,nope,abc\n"
        good = "slug,name,category,price,inventory_qty,availability\ncsv-test-bin,CSV Test Bin,organization,6.50,4,available\n"
        Path("/tmp/claude-0/bad.csv").write_text(bad); Path("/tmp/claude-0/good.csv").write_text(good)
        await pg.goto(B + "/admin/import")
        await pg.locator('input[type=file]').set_input_files("/tmp/claude-0/bad.csv")
        check("CSV errors reported before applying", await seen(pg.get_by_text("has problems")) and await pg.get_by_role("button", name=re.compile("^Apply")).is_disabled())
        await pg.locator('input[type=file]').set_input_files("/tmp/claude-0/good.csv")
        await pg.get_by_role("button", name=re.compile("^Apply")).click()
        await expect(pg.get_by_text("Import complete: 1 added, 0 updated.")).to_be_visible()
        await pg.goto(B + "/product/csv-test-bin")
        check("CSV-imported product live", await seen(pg.get_by_role("heading", name="CSV Test Bin")))
        # partial update: only price column changes; stock and sample label stay
        before = await admin_qty_slug("lint-brush")
        Path("/tmp/claude-0/partial.csv").write_text("slug,name,category,price\nlint-brush,Lint Brush,laundry,2.50\n")
        await pg.goto(B + "/admin/import")
        await pg.locator('input[type=file]').set_input_files("/tmp/claude-0/partial.csv")
        await pg.get_by_role("button", name=re.compile("^Apply")).click()
        await expect(pg.get_by_text("Import complete: 0 added, 1 updated.")).to_be_visible()
        after = await admin_qty_slug("lint-brush")
        await pg.goto(B + "/product/lint-brush")
        check("partial CSV update keeps stock + sample label, changes price", before == after and await seen(pg.get_by_text("$2.50")) and await seen(pg.get_by_text("This is a sample listing")), f"{before}->{after}")

        # ---------------------------------------------------------------- settings
        await pg.goto(B + "/admin/settings")
        await pg.get_by_label("Cash App $Cashtag").fill("not a tag")
        await pg.get_by_role("button", name="Save settings").click()
        check("cashtag validated", await seen(pg.get_by_text("Cash App tags start with $")))
        await pg.get_by_label("Cash App $Cashtag").fill("$TestStore")
        await pg.get_by_role("button", name="Save settings").click()
        await pg.wait_for_timeout(300)
        await pg.goto(B + "/policies/payment")
        check("payment details appear once configured", await seen(pg.get_by_text("$TestStore")))

        # ---------------------------------------------------------------- sign out, persistence
        await pg.goto(B + "/admin"); await pg.get_by_role("button", name="Sign out").click()
        await expect(pg.get_by_role("heading", name="Owner sign in")).to_be_visible()
        await pg.goto(B + "/product/owner-test-lint-roller")
        check("image still there after sign-out + reload", await seen(pg.locator("main img[alt='Owner Test Lint Roller']")))

        # ---------------------------------------------------------------- accessibility (axe-core) on key pages
        for path in ["/", "/shop", "/product/lint-brush", "/cart", "/policies/privacy", "/contact", "/about", "/admin"]:
            await pg.goto(B + path); await pg.wait_for_timeout(400)
            await pg.add_script_tag(content=AXE)
            r = await pg.evaluate("axe.run(document, {runOnly: ['wcag2a','wcag2aa']}).then(r => r.violations.map(v => v.id + ':' + v.nodes.length))")
            check(f"axe WCAG A/AA: {path}", not r, ", ".join(r))

        # ---------------------------------------------------------------- responsive sweep
        bad_w = []
        mctx = await b.new_context()
        mp = await mctx.new_page()
        await mp.goto(B + "/product/lint-brush"); await mp.locator("main").get_by_role("button", name="Add to cart", exact=True).click()
        for w in WIDTHS:
            await mp.set_viewport_size({"width": w, "height": 900})
            for path in ["/", "/shop", "/category/kitchen", "/product/lint-brush", "/cart", "/checkout", "/contact", "/about", "/policies/returns", "/nope", "/admin"]:
                await mp.goto(B + path); await mp.wait_for_timeout(120)
                ov = await mp.evaluate("document.documentElement.scrollWidth - window.innerWidth")
                if ov > 0: bad_w.append(f"{w}{path}:{ov}")
        check("no sideways scrolling at 9 widths x 11 pages", not bad_w, ", ".join(bad_w[:8]))

        # mobile menu dialog
        await mp.set_viewport_size({"width": 390, "height": 844}); await mp.goto(B + "/")
        await mp.get_by_role("button", name="Open menu").click()
        await expect(mp.get_by_role("dialog", name="Menu")).to_be_visible()
        await mp.keyboard.press("Escape")
        check("mobile menu opens and closes with Escape", await mp.get_by_role("dialog", name="Menu").count() == 0 or not await mp.get_by_role("dialog", name="Menu").is_visible())

        real_errors = [e for e in errors if "favicon" not in e]
        check("no browser errors", not real_errors, " | ".join(real_errors[:5]))
        await b.close()

    passed = sum(1 for r in results if r[1])
    print(f"\n{passed}/{len(results)} checks passed")
    sys.exit(0 if passed == len(results) else 1)

asyncio.run(main())
