# Firewall / URL Categorization Checklist

Many corporate networks block sites that are **uncategorized** or flagged as a
**Newly Registered Domain (NRD)**. The fix is to get `resumes-gpt.com` classified
in each major web-filtering vendor's database with an appropriate, business-safe
category. Work through the list below.

## Before you submit
- [ ] Confirm the block is a corporate filter: the site loads on mobile data / a
      non-corporate network but not on the company laptop/Wi-Fi.
- [ ] Valid HTTPS certificate, no TLS errors.
- [ ] Both `http://`→`https://` and `www`/non-`www` redirect correctly.
- [ ] Homepage is reachable **without** a login wall (classifiers must see content).
- [ ] Site is indexed by Google (`site:resumes-gpt.com`) and submitted in
      Google Search Console + Bing Webmaster Tools.

## Suggested category
Pick the closest of: **Business / Economy**, **Computers & Internet / Information
Technology**, or **Job Search / Careers**. Avoid "Web Services / Proxy".

## Submit for categorization (one per major vendor)
- [ ] **Zscaler** — https://sitereview.zscaler.com/ → look up the URL → *Modify Categories*.
- [ ] **Palo Alto (PAN-DB) "Test A Site"** — https://urlfiltering.paloaltonetworks.com/
      → search the domain → *Request Change*. (A login is required for change
      requests as of 15 Mar 2026; lookups don't need login. Typically resolved ~48h.)
- [ ] **Cisco Talos** (powers Cisco Umbrella) —
      https://talosintelligence.com/reputation_center/web_categorization
      (report missing/incorrect content categorization; English subs ~1 business day).
- [ ] **Fortinet FortiGuard** — https://www.fortiguard.com/faq/wfratingsubmit
      (look up first at https://www.fortiguard.com/webfilter).
- [ ] **Symantec / Broadcom WebPulse** — https://sitereview.symantec.com/
      → *Check Category* → suggest category (updates typically 24–48h).
- [ ] **Forcepoint** — https://support.forcepoint.com/s/article/How-To-Submit-Uncategorized-Sites
      → Site Lookup (guest access available, no login) → *Recategorization*.

> Other vendors some enterprises use: Netskope, McAfee/Trellix (Skyhigh), Cloudflare
> Gateway. If a specific employer blocks you, their IT helpdesk can allowlist the
> domain directly — the fastest path for that one company.

## After submitting
- [ ] Note each ticket/reference number and the suggested category.
- [ ] Re-test after 24–72h (categorization caches need to expire/refresh).
- [ ] Keep the homepage content descriptive — the same crawlable content that
      helps SEO also helps these classifiers categorize the domain correctly.

_Last updated: 2026-06-29. Vendor portals can change; verify the link if a form moved._
