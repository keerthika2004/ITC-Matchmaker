# ITC Matchmaker


 

ITC Matchmaker is a browser-based proof of concept that reimagines the GST portal for small business owners. It runs a **real matching engine** over a purchase register and GSTR-2B, then guides the business through fixing mismatches to a confident filing decision.


 

## Who it is for


 

Small and mid-size businesses (MSMEs) that buy from many suppliers.


 

## Problem


 

Since **Section 16(2)(aa)** (effective 1 Jan 2022), Input Tax Credit can be claimed **only if the invoice appears in GSTR-2B**. So every month a business must reconcile its purchase books against GSTR-2B and chase suppliers to fix mismatches before the return deadline. GSTR-2B automated the *statement*, but the books-vs-2B reconciliation and supplier follow-up is still manual, technical, and painful — especially for owners who are not tax experts.


 

## How the matching works (it is real, not hardcoded)


 

The app ingests **two independent datasets** — the `purchaseRegister` (your books) and `gstr2b` (what suppliers reported) — and a `reconcile()` engine compares them at runtime:


 

- **Fuzzy invoice-number matching** using Levenshtein distance (catches typos like `INV-203` vs `INV-230`)

- **GSTIN, amount and date** comparison

- Classifies each bill as **Matched, Likely match, Amount mismatch, GSTIN mismatch, Missing, Duplicate, or Blocked ITC**, each with a computed **confidence score**


 

The mismatches are discovered by the algorithm — nothing is pre-labelled.


 

## Solution — an 8-step guided journey


 

1. **Start Here** — safe money, stuck money, and a clear cash-impact warning.

2. **Upload Bills** — import your August purchase register (XLSX/CSV from Tally, Zoho, Busy, Vyapar, etc.).

3. **Purchase Register** — review the imported invoices and how many auto-matched.

4. **Reconcile** — open any bill in a dialog to compare your record vs the supplier's GSTR-2B, with the mismatched field highlighted.

5. **Fix Problems** — each problem opens a popup explaining what happened, why it matters, and what to do. Internal issues (duplicate/blocked) can be resolved directly.

6. **Send Messages** — copy ready-made supplier messages and mark suppliers corrected.

7. **Filing Report** — recovered credit, remaining risk, and a clear recommendation.

8. **Can I File?** — a simple yes/no decision. Reaches a "Yes, you are ready to file" state once every issue is resolved.


 

## Demo credentials


 

Email: `owner@demo.in`


 

Password: `demo123`


 

## How to run


 

Open `index.html` in any modern browser.


 

No backend, installation, or build step is required. Progress is saved in the browser (localStorage). Use **Replace imported file** on the Import step to start over.


 

## What is mock vs real


 

- **Mock (demo data):** the two datasets — the purchase register and the GSTR-2B records — plus login and supplier messages.

- **Real (computed at runtime):** the matching itself — classification, mismatch highlighting, confidence scores, at-risk totals, recovered credit, and the filing decision are all calculated by `reconcile()`, not authored by hand.


 

## Why it is better than the current experience


 

GSTR-2B tells you *what* is eligible. It does **not** tell a non-expert *why* an invoice is missing, *who* to contact, or *what to say* — and it does not confirm recovery. ITC Matchmaker closes that last-mile gap:


 

- How much ITC is safe? How much is at risk? Why?

- Who should I contact, and what exactly should I say?

- Fix it, re-check, and watch recovered credit go up.

- Am I ready to file? A clear yes/no answer.


 

This helps businesses protect cashflow instead of discovering ITC problems too late.


 