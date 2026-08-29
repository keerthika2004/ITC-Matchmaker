const DEMO_EMAIL = "owner@demo.in";
const DEMO_PASSWORD = "demo123";

const state = {
 user: JSON.parse(localStorage.getItem("itc-user") || "null"),
 uploaded: localStorage.getItem("itc-uploaded") === "true",
 contacted: JSON.parse(localStorage.getItem("itc-contacted") || "{}"),
 corrected: JSON.parse(localStorage.getItem("itc-corrected") || "{}"),
 resolved: JSON.parse(localStorage.getItem("itc-resolved") || "{}"),
 rechecked: localStorage.getItem("itc-rechecked") === "true",
 modalInvoiceId: null,
 modalType: "reconcile",
 stepsOpen: false,
 accountOpen: false,
 lang: localStorage.getItem("itc-lang") || "en",
 toast: ""
};

const business = {
 name: "Aarohi Electronics",
 gstin: "29ABCDE1234F1Z5",
 owner: "Neha Sharma",
 state: "Karnataka",
 period: "August 2026",
 deadline: "20 September 2026"
};

// ── Two independent source datasets (this is what a real product ingests) ──
// 1) Purchase register = the business's own books (from Tally/Zoho/etc.)
const purchaseRegister = [
 { id: "INV-101", supplier: "Kumar Traders",         gstin: "29KUMAR1234F1Z2", invNo: "INV-101", date: "04 Aug", taxable: 42000, gst: 7560 },
 { id: "INV-203", supplier: "Kumar Traders",         gstin: "29KUMAR1234F1Z2", invNo: "INV-203", date: "12 Aug", taxable: 46667, gst: 8400 },
 { id: "KR-1129", supplier: "Kumar Traders",         gstin: "29KUMAR1234F1Z2", invNo: "KR-1129", date: "18 Aug", taxable: 52000, gst: 9360 },
 { id: "SC-881",  supplier: "Shakti Components",     gstin: "29SHAKT5678L1Z7", invNo: "SC-881",  date: "08 Aug", taxable: 62222, gst: 11200 },
 { id: "ME-442",  supplier: "Metro Electronics",     gstin: "29METRO2456Q1Z8", invNo: "ME-442",  date: "15 Aug", taxable: 70000, gst: 12600 },
 { id: "SIL-207", supplier: "South India Logistics", gstin: "29SILOG1111K1Z1", invNo: "SIL-207", date: "19 Aug", taxable: 30000, gst: 5400, blocked: true, blockReason: "a personal vehicle-related expense" },
 { id: "BP-710",  supplier: "Bright Packaging",      gstin: "29BRIGH9988D1Z3", invNo: "BP-710",  date: "21 Aug", taxable: 21667, gst: 3900 },
 { id: "BP-710b", supplier: "Bright Packaging",      gstin: "29BRIGH9988D1Z3", invNo: "BP-710",  date: "21 Aug", taxable: 21667, gst: 3900 },
 { id: "SC-910",  supplier: "Shakti Components",     gstin: "29SHAKT5678L1Z7", invNo: "SC-910",  date: "24 Aug", taxable: 50000, gst: 9000 },
 { id: "ML-330",  supplier: "Mysore Lights",         gstin: "29MYSOR7788P1Z4", invNo: "ML-330",  date: "26 Aug", taxable: 27000, gst: 4860 },
 { id: "ME-509",  supplier: "Metro Electronics",     gstin: "29METRO2456Q1Z8", invNo: "ME-509",  date: "29 Aug", taxable: 22222, gst: 4000 }
];

// 2) GSTR-2B = what suppliers actually reported to the GST portal
const gstr2b = [
 { gstin: "29KUMAR1234F1Z2", invNo: "INV-101", date: "04 Aug", taxable: 42000, gst: 7560 },
 { gstin: "29KUMAR1234F1Z2", invNo: "INV-230", date: "12 Aug", taxable: 46667, gst: 8400 }, // invoice number typo vs books (INV-203)
 { gstin: "29SHAKT5678L1Z7", invNo: "SC-881",  date: "08 Aug", taxable: 51111, gst: 9200 }, // amount differs vs books
 { gstin: "29METRO2456Q1Z8", invNo: "ME-442",  date: "15 Aug", taxable: 70000, gst: 12600 },
 { gstin: "29SILOG1111K1Z1", invNo: "SIL-207", date: "19 Aug", taxable: 30000, gst: 5400 },
 { gstin: "29BRIGH9988D1Z3", invNo: "BP-710",  date: "21 Aug", taxable: 21667, gst: 3900 },
 { gstin: "29MYSOR7788P9Z9", invNo: "ML-330",  date: "26 Aug", taxable: 27000, gst: 4860 }, // GSTIN differs vs books
 { gstin: "29METRO2456Q1Z8", invNo: "ME-509",  date: "29 Aug", taxable: 22222, gst: 4000 }
 // KR-1129 and SC-910 are absent: suppliers never filed them
];

// ── Matching engine: compares the two datasets at runtime ──
function normInv(s) {
 return String(s).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function levenshtein(a, b) {
 const m = a.length, n = b.length;
 const d = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
 for (let i = 0; i <= m; i++) d[i][0] = i;
 for (let j = 0; j <= n; j++) d[0][j] = j;
 for (let i = 1; i <= m; i++) {
   for (let j = 1; j <= n; j++) {
     const cost = a[i - 1] === b[j - 1] ? 0 : 1;
     d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
   }
 }
 return d[m][n];
}

function invSimilarity(a, b) {
 a = normInv(a); b = normInv(b);
 if (!a.length && !b.length) return 1;
 return 1 - levenshtein(a, b) / Math.max(a.length, b.length);
}

// Compare one purchase-register row against every GSTR-2B row and classify it.
function reconcile(books, portal) {
 const usedPortal = new Set();
 const seenBookKeys = new Set();

 return books.map((b) => {
   const base = {
     id: b.id, supplier: b.supplier, supplierGstin: b.gstin,
     bookNo: b.invNo, date: b.date, taxable: b.taxable, gst: b.gst,
     portalNo: "Missing", portalGst: null, portalGstin: "—", portalDate: "—", filed: false
   };
   const finalize = (o, status, confidence, risk, issue, fix) =>
     ({ ...o, status, confidence, risk, issue, fix, filed: o.portalNo !== "Missing" });

   // Duplicate: same GSTIN + invoice number already seen earlier in the books
   const bookKey = b.gstin + "|" + normInv(b.invNo);
   const isDuplicate = seenBookKeys.has(bookKey);
   seenBookKeys.add(bookKey);
   if (isDuplicate) {
     const orig = portal.find((p) => p.gstin === b.gstin && normInv(p.invNo) === normInv(b.invNo));
     if (orig) Object.assign(base, { portalNo: orig.invNo, portalGst: orig.gst, portalGstin: orig.gstin, portalDate: orig.date });
     return finalize(base, "Duplicate", 60, "Medium",
       "Same invoice appears twice in your purchase book.",
       "Remove the duplicate entry before filing.");
   }

   // Score every still-available GSTR-2B row and keep the best candidate
   let best = null, bestScore = -1;
   portal.forEach((p, idx) => {
     if (usedPortal.has(idx)) return;
     const gstinMatch = p.gstin === b.gstin;
     const sim = invSimilarity(b.invNo, p.invNo);
     const amtMatch = p.gst === b.gst;
     const dateMatch = p.date === b.date;
     const score = (gstinMatch ? 3 : 0) + sim * 3 + (amtMatch ? 2 : 0) + (dateMatch ? 1 : 0);
     if (score > bestScore) { bestScore = score; best = { p, idx, gstinMatch, sim, amtMatch, dateMatch }; }
   });

   // A candidate is only valid if the supplier GSTIN matches, or the invoice+amount are a strong match
   const c = (best && (best.gstinMatch || (best.sim >= 0.8 && best.amtMatch))) ? best : null;
   if (!c) {
     return finalize(base, "Missing", 0, "High",
       "Supplier has not uploaded this invoice.",
       "Ask supplier to upload this invoice in GSTR-1 before the filing cut-off.");
   }

   usedPortal.add(c.idx);
   Object.assign(base, { portalNo: c.p.invNo, portalGst: c.p.gst, portalGstin: c.p.gstin, portalDate: c.p.date });

   // Eligibility check is separate from matching: a bill can match but still be blocked credit
   if (b.blocked) {
     return finalize(base, "Blocked ITC", 100, "High",
       `This looks like blocked credit for ${b.blockReason}.`,
       "Review with your accountant before claiming.");
   }
   if (!c.gstinMatch) {
     return finalize(base, "GSTIN Mismatch", Math.round(50 + c.sim * 20), "High",
       "Supplier GSTIN in your book does not match portal record.",
       "Confirm the supplier GSTIN and correct your purchase book, or ask the supplier to amend.");
   }
   if (!c.amtMatch) {
     return finalize(base, "Amount Mismatch", 78, "High",
       "GST amount differs between your book and supplier record.",
       "Ask supplier to check the taxable value and tax amount.");
   }
   if (normInv(b.invNo) !== normInv(c.p.invNo)) {
     return finalize(base, "Likely Match", Math.round(60 + c.sim * 40), "Medium",
       "Invoice number typo.",
       `Ask supplier to amend invoice number from ${c.p.invNo} to ${b.invNo}.`);
   }
   return finalize(base, "Matched", 100, "Low", "Exact match found.", "Safe to claim.");
 });
}

const invoices = reconcile(purchaseRegister, gstr2b);

const extraSummary = {
 totalInvoices: invoices.length,
 matchedInvoices: invoices.filter((i) => i.risk === "Low").length,
 totalItc: invoices.reduce((s, i) => s + i.gst, 0),
 safeItc: invoices.filter((i) => i.risk === "Low").reduce((s, i) => s + i.gst, 0),
 blocked: invoices.filter((i) => i.status === "Blocked ITC").reduce((s, i) => s + i.gst, 0)
};

const navItems = [
 ["#/dashboard", "nav_dashboard", "1"],
 ["#/upload", "nav_upload", "2"],
 ["#/register", "nav_register", "3"],
 ["#/reconcile", "nav_reconcile", "4"],
 ["#/matchmaker", "nav_matchmaker", "5"],
 ["#/suppliers", "nav_suppliers", "6"],
 ["#/report", "nav_report", "7"],
 ["#/readiness", "nav_readiness", "8"]
];

const flowSteps = [
 ["#/dashboard", "step_start"],
 ["#/upload", "step_import"],
 ["#/register", "step_review"],
 ["#/reconcile", "step_compare"],
 ["#/matchmaker", "step_fix"],
 ["#/suppliers", "step_contact"],
 ["#/report", "step_report"],
 ["#/readiness", "step_decision"]
];

// ────────────────────────────────────────────────────────────
//  Internationalisation (English + हिंदी)
// ────────────────────────────────────────────────────────────
const STR = {
 en: {
   // language + chrome
   lang_label: "भाषा / Language", en_name: "English", hi_name: "हिंदी",
   product_promise: "Product promise", promise_body: "No GST jargon. Just money, reason, action.",
   logout: "Logout", log_out: "Log out", account_menu: "Account menu",
   return_suffix: "return", due_date: "GSTR-3B due date: {date}",
   // login
   login_h: "Sign in to your GST workspace",
   login_sub: "Check whether your Input Tax Credit is safe before filing this month.",
   email: "Email", password: "Password", password_ph: "Enter password", continue: "Continue",
   login_err: "Enter the email and password for this business account.",
   // portal reality preview
   reality_eyebrow: "The reality today",
   reality_link: "See what the GST portal shows you today →",
   portal_back: "← This is the better way",
   portal_banner: "You are viewing a re-creation of the government GST portal experience.",
   // nav
   nav_dashboard: "Start Here", nav_upload: "Upload Bills", nav_register: "Purchase Register",
   nav_reconcile: "Reconcile", nav_matchmaker: "Fix Problems", nav_suppliers: "Send Messages",
   nav_report: "Filing Report", nav_readiness: "Can I File?",
   // flow step short labels
   step_start: "Start", step_import: "Import", step_review: "Review", step_compare: "Compare",
   step_fix: "Fix", step_contact: "Contact", step_report: "Report", step_decision: "Decision",
   step_of: "Step {n} of {total}: {label}", pct_complete: "{p}% complete",
   // flow footer
   next_step: "Next step", workflow_complete: "Workflow complete", back: "Back",
   start_importing: "Start importing bills", back_to_start: "Back to start",
   continue_to: "Continue to {label}", import_to_continue: "Import purchase register to continue",
   hint0: "Start by importing your August purchase register.",
   hint1a: "Next, review what the system read from your file.",
   hint1b: "Import the purchase register on this page to unlock the next step.",
   hint2: "Next, compare your purchase records with supplier GSTR-2B records.",
   hint3: "Then review the issues in simple language.",
   hint4: "After understanding issues, send supplier messages.",
   hint5: "After supplier actions, review your filing report.",
   hint6: "Use the report to make the final filing decision.",
   hint7: "You can return to any previous step if needed.",
   // page titles
   t_dashboard: "Can you safely file GST this month?", s_dashboard: "See what money is safe, what money is stuck, and what to do next.",
   t_upload: "Import purchase bills", s_upload: "Upload your purchase register and compare it with supplier GST records.",
   t_register: "Purchase register", s_register: "Review the bills you imported before checking ITC problems.",
   t_reconcile: "Reconciliation room", s_reconcile: "See your purchase bill and the supplier GST record side by side.",
   t_matchmaker: "Fix ITC problems", s_matchmaker: "Each problem is translated into simple language and one clear action.",
   t_suppliers: "Send supplier messages", s_suppliers: "Ready-to-copy messages for only the problems suppliers can actually fix.",
   t_report: "Filing report", s_report: "See recovered credit, remaining risk, and what is still pending.",
   t_readiness: "Can I file now?", s_readiness: "A simple filing recommendation before you submit GSTR-3B.",
   // status badges
   b_safe: "Safe", b_high: "High risk", b_needsfix: "Needs fix",
   // dashboard
   d_return_tag: "{name} - August GST return",
   d_ready_h: "You are ready to file. {amt} is safe to claim.",
   d_notready_h: "Do not file yet. {amt} of tax credit needs attention.",
   d_ready_p: "All supplier mismatches and internal items have been handled. Review the filing report and submit before the due date.",
   d_notready_p: "You already paid this GST to suppliers. If supplier records do not match, you may have to pay this amount again in cash or face questions later.",
   d_view_report: "View filing report", d_filing_decision: "Filing decision",
   d_review_bills: "Review uploaded bills", d_start_bills: "Start with your bills", d_see_mismatch: "See what mismatched",
   d_filing_status: "Filing status", d_cash_impact: "Cash impact",
   d_ready_to_file: "Ready to file", d_could_pay: "{amt} could be paid again",
   d_all_resolved: "All ITC problems resolved.", d_use_check: "Use the filing check later for the final yes/no decision.",
   d_safe_money: "Safe money", d_matched_recovered: "Invoices matched or recovered.",
   d_cleared: "Cleared", d_stuck_money: "Stuck money",
   d_nothing_pending: "Nothing pending before filing.", d_needs_fixing: "Needs fixing before filing.",
   d_nextstep: "Next step", d_file_gstr: "File GSTR-3B", d_n_suppliers: "{n} suppliers",
   d_submit_before: "Submit before {date}.", d_send_review: "Send messages + review {n} internal issues.",
   d_every_resolved: "Every ITC problem is resolved", d_protected: "You protected {amt} of tax credit that was at risk.",
   d_action_plan: "Your action plan", d_only_list: "This is the only list you need before filing.",
   d_explain_each: "Explain each issue",
   d_contact_s: "Contact {s}", d_remove_dup: "Remove duplicate {b}", d_review_b: "Review {b}",
   d_internal_note: "Internal purchase book issue. Supplier cannot fix this.",
   d_blocked_note: "This may be blocked credit. Review before claiming.",
   d_fixable_one: "{n} supplier-fixable mismatch. {u}", d_fixable_many: "{n} supplier-fixable mismatches. {u}",
   d_high_urgency: "High urgency.", d_med_urgency: "Medium urgency.",
   eb_happening_q: "What is happening?", eb_happening_a: "Some purchase bills do not match supplier GST records.",
   eb_care_q: "Why should you care?", eb_care_a: "Mismatch can block credit and hurt cashflow.",
   eb_app_q: "What does the app do?", eb_app_a: "Finds the issue and writes the supplier message.",
   eb_why_q: "Why 20 September?", eb_why_a: "For an August monthly return, GSTR-3B is due in the next month.",
   // upload
   u_flowpill: "Import", u_h: "Import your August purchase register.",
   u_p: "Upload the bills from your accounting software. ITC Matchmaker checks whether suppliers reported the same invoices correctly.",
   u_bills: "Bills", u_desc: "{n} purchase invoices with supplier name, GSTIN, invoice number, date, taxable value, GST amount, and total bill value.",
   u_status_yes: "Imported {n} invoices from August purchase register", u_status_no: "No purchase register imported for August yet",
   u_open: "Open purchase register", u_import: "Import purchase register", u_replace: "Replace imported file",
   u_accepted: "Accepted: XLSX or CSV", u_works: "Works with exports from Tally, Zoho Books, Busy, Vyapar, or any purchase register",
   u_checks_h: "What the system checks",
   u_c1: "We check if suppliers uploaded your bills.",
   u_c2: "We find bills with wrong amount, wrong number, or missing records.",
   u_c3: "We tell you who to contact and what message to send.",
   u_c4: "We answer: can you safely file GST now?",
   u_toast: "Purchase register imported.", file_name: "August_Purchase_Bills.xlsx",
   // register
   r_alert: "No file imported yet.", r_alert2: "Start from Import purchase bills to load your purchase register.",
   r_flowpill: "Review file", r_h: "Check the purchase bills that were imported.",
   r_p: "This is your purchase register. The app reads these invoice fields and compares them with supplier GST records.",
   r_file: "File imported", r_source: "Source: accounting software export",
   r_rows: "Rows found", r_automatched: "{n} auto-matched with GSTR-2B",
   r_totalbill: "Total bill value", r_taxplusgst: "Taxable value plus GST",
   r_credit: "GST credit in file", r_checked: "Checked against supplier records",
   r_fields: "Fields detected:", r_supplier: "Supplier", r_invno: "Invoice No.", r_date: "Date",
   r_taxable: "Taxable value", r_gstamt: "GST amount", r_total: "Total value",
   r_imported_bills: "Imported bills", r_open_flagged: "Open any flagged bill to see why it may affect your ITC.",
   r_compare_gstr: "Compare with GSTR-2B",
   r_safe_claim: "Safe to claim", r_resolved: "Resolved", r_review: "Review", r_matches: "Matches supplier record",
   r_gstin: "GSTIN", r_tax: "Taxable", r_gst: "GST", r_tot: "Total",
   // reconcile
   rc_flowpill: "Compare records", rc_h: "Now see exactly what did not match.",
   rc_p: "Tap any bill to compare your purchase register against the supplier-reported GSTR-2B record.",
   rc_recovered: "Recovered", rc_risk: "{r} risk", rc_compare: "Compare records",
   // modal
   m_reconciliation: "Reconciliation", m_problem: "Problem details", m_close: "Close",
   cmp_invno: "Invoice no.", cmp_notfiled: "Not filed", cmp_gstin: "GSTIN", cmp_date: "Date", cmp_gstamt: "GST amount",
   cmp_your: "Your register", cmp_gstr: "GSTR-2B",
   cmp_confidence: "Match confidence", cmp_problem: "Problem", cmp_status: "Current status",
   cmp_means: "What this means", cmp_recheck_note: "This issue was rechecked and {amt} is now treated as recovered.",
   mark_corrected: "Mark supplier corrected", rerun_check: "Re-run ITC check", view_report: "View filing report",
   // issue status
   is_recovered: "Recovered after recheck", is_corrected: "Supplier corrected - recheck pending",
   is_sent: "Message sent", is_internal: "Internal review needed", is_action: "Action needed",
   // matchmaker
   mm_flowpill: "Prioritise fixes", mm_all_h: "All problems resolved.",
   mm_found_one: "The app found {n} problem. Start with the money at highest risk.",
   mm_found_many: "The app found {n} problems. Start with the money at highest risk.",
   mm_all_p: "Every risky invoice has been fixed or reviewed. You are ready to check your filing report.",
   mm_tap_p: "Tap any problem to see what happened, why it matters, and what to do.",
   mm_recovered: "{amt} recovered", mm_recovered_sub: "after supplier correction and recheck.",
   mm_none_h: "No pending ITC problems", mm_none_p: "All supplier mismatches and internal items have been handled.",
   mm_start_alert: "Start here:", mm_start_alert2: "You can explore results now, but the normal flow starts from Upload Bills.",
   pc_send: "Send message to {s}", pc_remove: "Remove duplicate bill", pc_review: "Review before claiming",
   // problem detail
   pd_resolved: "Resolved", pd_secured: "{amt} secured", pd_may_affect: "{amt} may be affected",
   pd_happened: "What happened?", pd_whycare: "Why care?",
   pd_safe: "This credit looks safe.", pd_notavail: "This money may not be available when you file GST.",
   pd_donow: "Do this now", pd_send_to: "Send a message to {s}.",
   pd_resolved_note: "This issue is marked resolved and counted as safe in your filing report.",
   pd_send_msg: "Send supplier message", pd_compare_side: "Compare records side by side",
   pd_remove_resolve: "Remove duplicate & resolve", pd_review_resolve: "Mark as reviewed & resolve",
   // plain problem titles
   ppt_likely: "Same bill, wrong number", ppt_missing: "Supplier has not uploaded bill",
   ppt_amount: "GST amount does not match", ppt_gstin: "Supplier GST number mismatch",
   ppt_duplicate: "Bill repeated in your file", ppt_blocked: "Credit may not be allowed",
   issue_likely: "Invoice number typo.", issue_missing: "Supplier has not uploaded this invoice.",
   issue_amount: "GST amount differs between your book and supplier record.",
   issue_gstin: "Supplier GSTIN in your book does not match portal record.",
   issue_dup: "Same invoice appears twice in your purchase book.",
   issue_blocked: "This looks like blocked credit for a personal vehicle-related expense.",
   issue_matched: "Exact match found.",
   fix_likely: "Ask supplier to amend invoice number from {portal} to {book}.",
   fix_missing: "Ask supplier to upload this invoice in GSTR-1 before the filing cut-off.",
   fix_amount: "Ask supplier to check the taxable value and tax amount.",
   fix_gstin: "Confirm the supplier GSTIN and correct your purchase book, or ask the supplier to amend.",
   fix_dup: "Remove the duplicate entry before filing.",
   fix_blocked: "Review with your accountant before claiming.",
   fix_matched: "Safe to claim.",
   // internal action messages
   iam_dup: "This invoice appears duplicated in your purchase book. Remove the duplicate entry before filing so you do not accidentally claim the same ITC twice.",
   iam_blocked: "This credit may be blocked or not allowed. Do not claim it blindly. Review it before filing and keep it separate from supplier-fixable mismatches.",
   // suppliers
   sp_flowpill: "Contact suppliers", sp_h: "You do not need to explain GST mismatches manually.",
   sp_p: "The app writes simple supplier messages and groups multiple problems into one note.",
   sp_marked_one: "{n} supplier marked corrected.", sp_marked_many: "{n} suppliers marked corrected.",
   sp_rerun_hint: "Re-run the ITC check to confirm recovered credit.",
   sp_recovered: "{amt} recovered", sp_recovered_sub: "Supplier corrections are now reflected in the filing report.",
   sp_issue_one: "{n} issue: {list}", sp_issue_many: "{n} issues: {list}",
   sp_recovered_badge: "Recovered", sp_correction: "Correction received", sp_sent: "Message sent", sp_contact_today: "Contact today",
   sp_copy: "Copy supplier message", sp_mark: "Mark supplier corrected",
   sp_empty: "No supplier actions pending. Go to the filing report to review remaining internal items.",
   sp_msg_intro: "Hi {s}, we found GST mismatches affecting our ITC: {list}. Could you please check your GSTR-1 records and correct these before {date}? Thank you.",
   sp_copied: "{s} message copied.",
   sp_marked_toast: "{s} marked corrected. Re-run ITC check to confirm recovery.",
   // filing report
   fr_flowpill: "Filing report", fr_h: "Your filing report is ready.",
   fr_p: "This report shows what improved after supplier corrections and what is still risky before GSTR-3B filing.",
   fr_safe: "Safe to claim now", fr_safe_sub: "Matched ITC plus recovered supplier corrections.",
   fr_recovered: "Recovered after recheck", fr_recovered_sub: "Supplier fixes confirmed by re-running the check.",
   fr_risk: "Still at risk", fr_nothing: "Nothing pending. All issues handled.",
   fr_still_one: "{n} invoice still needs action.", fr_still_many: "{n} invoices still need action.",
   fr_sp_pending: "Supplier action pending",
   fr_sp_one: "{n} invoice still needs supplier correction.", fr_sp_many: "{n} invoices still need supplier correction.",
   fr_sp_none: "No supplier actions pending.",
   fr_int_pending: "Internal review pending",
   fr_int_one: "{n} invoice should be reviewed internally before claiming.", fr_int_many: "{n} invoices should be reviewed internally before claiming.",
   fr_int_none: "No internal review pending.",
   fr_reco: "Recommendation", fr_ready: "You are ready to file GSTR-3B.", fr_notready: "Do not file yet.",
   fr_ready_p: "All ITC problems are resolved. You can safely claim {amt} and file before {date}.",
   fr_notready_p: "Resolve the remaining problems on the Fix Problems step, then re-check here.",
   fr_goto_decision: "Go to filing decision", fr_back_fix: "Back to Fix Problems",
   // readiness
   rd_final: "Final answer", rd_yes: "Yes. You are ready to file.",
   rd_yes_p: "All ITC problems are resolved. You can safely claim {amt} this month.", rd_readiness: "filing readiness",
   rd_allset: "You are all set", rd_checklist: "A quick final checklist before you submit GSTR-3B.",
   rd_safe_conf: "Safe ITC confirmed", rd_safe_conf_sub: "{amt} is matched and ready to claim.",
   rd_sp_res: "Supplier issues resolved", rd_sp_res_sub: "All supplier mismatches were corrected and rechecked.",
   rd_int_rev: "Internal items reviewed", rd_int_rev_sub: "Duplicates and blocked credits have been handled.",
   rd_file_before: "File before due date", rd_file_before_sub: "Submit GSTR-3B before {date}.",
   rd_almost: "Almost ready. Review internal items.", rd_no: "No. You should not file yet.",
   rd_unresolved: "{amt} is still unresolved.", rd_recovered_note: "{amt} has been recovered after recheck.",
   rd_filenow_warn: "Filing now may create extra cash payment or future questions.",
   rd_before_h: "Before filing, do this", rd_before_p: "Resolve these on the Fix Problems step.",
   rd_fix_sp_one: "Fix {n} supplier issue", rd_fix_sp_many: "Fix {n} supplier issues",
   rd_fix_sp_yes: "They need to correct or upload bills.", rd_fix_sp_no: "Supplier-side issues are resolved.",
   rd_rev_int_one: "Review {n} internal item", rd_rev_int_many: "Review {n} internal items",
   rd_rev_int_yes: "Handle duplicates and blocked credit.", rd_rev_int_no: "Internal items are resolved.",
   rd_recheck: "Re-check the filing report", rd_recheck_sub: "Confirm recovered credit before filing.",
   rd_filedue: "File before the due date", rd_filedue_sub: "Submit GSTR-3B before {date}.",
   rd_goto_fix: "Go to Fix Problems",
   // toasts / misc
   toast_reset: "Imported file cleared. You can import a new purchase register.",
   toast_resolved: "{b} marked as resolved.",
   toast_recovered: "{amt} recovered after recheck."
 },
 hi: {
   lang_label: "भाषा / Language", en_name: "English", hi_name: "हिंदी",
   product_promise: "हमारा वादा", promise_body: "कोई GST शब्दजाल नहीं। सिर्फ़ पैसा, कारण और कार्रवाई।",
   logout: "लॉगआउट", log_out: "लॉग आउट", account_menu: "खाता मेन्यू",
   return_suffix: "रिटर्न", due_date: "GSTR-3B की अंतिम तिथि: {date}",
   login_h: "अपने GST वर्कस्पेस में साइन इन करें",
   login_sub: "इस महीने फाइल करने से पहले जाँचें कि आपका इनपुट टैक्स क्रेडिट सुरक्षित है या नहीं।",
   email: "ईमेल", password: "पासवर्ड", password_ph: "पासवर्ड दर्ज करें", continue: "आगे बढ़ें",
   login_err: "इस बिज़नेस अकाउंट का ईमेल और पासवर्ड दर्ज करें।",
   // portal reality preview
   reality_eyebrow: "आज की हकीकत",
   reality_link: "देखें आज जीएसटी पोर्टल आपको क्या दिखाता है →",
   portal_back: "← यह बेहतर तरीका है",
   portal_banner: "आप सरकारी जीएसटी पोर्टल अनुभव की पुनर्रचना देख रहे हैं।",
   nav_dashboard: "यहाँ से शुरू करें", nav_upload: "बिल अपलोड करें", nav_register: "खरीद रजिस्टर",
   nav_reconcile: "मिलान करें", nav_matchmaker: "समस्याएँ ठीक करें", nav_suppliers: "संदेश भेजें",
   nav_report: "फाइलिंग रिपोर्ट", nav_readiness: "क्या मैं फाइल करूँ?",
   step_start: "शुरू", step_import: "आयात", step_review: "जाँच", step_compare: "तुलना",
   step_fix: "सुधार", step_contact: "संपर्क", step_report: "रिपोर्ट", step_decision: "निर्णय",
   step_of: "चरण {n} / {total}: {label}", pct_complete: "{p}% पूर्ण",
   next_step: "अगला चरण", workflow_complete: "प्रक्रिया पूरी हुई", back: "वापस",
   start_importing: "बिल आयात करना शुरू करें", back_to_start: "शुरुआत पर लौटें",
   continue_to: "{label} पर जाएँ", import_to_continue: "आगे बढ़ने के लिए खरीद रजिस्टर आयात करें",
   hint0: "अपना अगस्त का खरीद रजिस्टर आयात करके शुरू करें।",
   hint1a: "अब देखें कि सिस्टम ने आपकी फाइल से क्या पढ़ा।",
   hint1b: "अगला चरण खोलने के लिए इस पेज पर खरीद रजिस्टर आयात करें।",
   hint2: "अब अपने खरीद रिकॉर्ड की सप्लायर के GSTR-2B रिकॉर्ड से तुलना करें।",
   hint3: "फिर समस्याओं को सरल भाषा में देखें।",
   hint4: "समस्याएँ समझने के बाद सप्लायर को संदेश भेजें।",
   hint5: "सप्लायर की कार्रवाई के बाद अपनी फाइलिंग रिपोर्ट देखें।",
   hint6: "रिपोर्ट के आधार पर अंतिम फाइलिंग निर्णय लें।",
   hint7: "ज़रूरत हो तो आप किसी भी पिछले चरण पर लौट सकते हैं।",
   t_dashboard: "क्या आप इस महीने सुरक्षित रूप से GST फाइल कर सकते हैं?", s_dashboard: "देखें कौन-सा पैसा सुरक्षित है, कौन-सा फँसा है, और आगे क्या करना है।",
   t_upload: "खरीद बिल आयात करें", s_upload: "अपना खरीद रजिस्टर अपलोड करें और सप्लायर के GST रिकॉर्ड से मिलाएँ।",
   t_register: "खरीद रजिस्टर", s_register: "ITC समस्याएँ जाँचने से पहले आयात किए गए बिल देखें।",
   t_reconcile: "मिलान कक्ष", s_reconcile: "अपना खरीद बिल और सप्लायर का GST रिकॉर्ड साथ-साथ देखें।",
   t_matchmaker: "ITC समस्याएँ ठीक करें", s_matchmaker: "हर समस्या सरल भाषा और एक स्पष्ट कार्रवाई में बदली जाती है।",
   t_suppliers: "सप्लायर को संदेश भेजें", s_suppliers: "सिर्फ़ उन्हीं समस्याओं के तैयार संदेश जिन्हें सप्लायर ठीक कर सकते हैं।",
   t_report: "फाइलिंग रिपोर्ट", s_report: "रिकवर हुआ क्रेडिट, बचा जोखिम और लंबित कार्य देखें।",
   t_readiness: "क्या मैं अभी फाइल करूँ?", s_readiness: "GSTR-3B जमा करने से पहले एक सरल सिफ़ारिश।",
   b_safe: "सुरक्षित", b_high: "उच्च जोखिम", b_needsfix: "सुधार ज़रूरी",
   d_return_tag: "{name} - अगस्त GST रिटर्न",
   d_ready_h: "आप फाइल करने के लिए तैयार हैं। {amt} दावा करने योग्य है।",
   d_notready_h: "अभी फाइल न करें। {amt} के टैक्स क्रेडिट पर ध्यान देना ज़रूरी है।",
   d_ready_p: "सभी सप्लायर मिस-मैच और आंतरिक मामले संभाल लिए गए हैं। फाइलिंग रिपोर्ट देखें और अंतिम तिथि से पहले जमा करें।",
   d_notready_p: "यह GST आप सप्लायर को पहले ही चुका चुके हैं। यदि सप्लायर रिकॉर्ड मेल नहीं खाते, तो यह रकम फिर से नकद देनी पड़ सकती है या सवाल उठ सकते हैं।",
   d_view_report: "फाइलिंग रिपोर्ट देखें", d_filing_decision: "फाइलिंग निर्णय",
   d_review_bills: "अपलोड किए बिल देखें", d_start_bills: "अपने बिलों से शुरू करें", d_see_mismatch: "क्या मेल नहीं खाया देखें",
   d_filing_status: "फाइलिंग स्थिति", d_cash_impact: "नकद प्रभाव",
   d_ready_to_file: "फाइल के लिए तैयार", d_could_pay: "{amt} फिर से देना पड़ सकता है",
   d_all_resolved: "सभी ITC समस्याएँ हल हो गईं।", d_use_check: "अंतिम हाँ/ना निर्णय के लिए बाद में फाइलिंग जाँच का उपयोग करें।",
   d_safe_money: "सुरक्षित पैसा", d_matched_recovered: "मेल खाए या रिकवर हुए बिल।",
   d_cleared: "साफ़ हुआ", d_stuck_money: "फँसा पैसा",
   d_nothing_pending: "फाइलिंग से पहले कुछ भी लंबित नहीं।", d_needs_fixing: "फाइलिंग से पहले सुधार ज़रूरी।",
   d_nextstep: "अगला कदम", d_file_gstr: "GSTR-3B फाइल करें", d_n_suppliers: "{n} सप्लायर",
   d_submit_before: "{date} से पहले जमा करें।", d_send_review: "संदेश भेजें + {n} आंतरिक मामले देखें।",
   d_every_resolved: "हर ITC समस्या हल हो गई", d_protected: "आपने जोखिम में पड़े {amt} के टैक्स क्रेडिट को बचाया।",
   d_action_plan: "आपकी कार्य योजना", d_only_list: "फाइलिंग से पहले आपको बस यही सूची चाहिए।",
   d_explain_each: "हर समस्या समझाएँ",
   d_contact_s: "{s} से संपर्क करें", d_remove_dup: "डुप्लिकेट {b} हटाएँ", d_review_b: "{b} की समीक्षा करें",
   d_internal_note: "यह आंतरिक खरीद-बुक की समस्या है। सप्लायर इसे ठीक नहीं कर सकता।",
   d_blocked_note: "यह ब्लॉक्ड क्रेडिट हो सकता है। दावा करने से पहले समीक्षा करें।",
   d_fixable_one: "{n} सप्लायर-सुधार योग्य मिस-मैच। {u}", d_fixable_many: "{n} सप्लायर-सुधार योग्य मिस-मैच। {u}",
   d_high_urgency: "उच्च तात्कालिकता।", d_med_urgency: "मध्यम तात्कालिकता।",
   eb_happening_q: "क्या हो रहा है?", eb_happening_a: "कुछ खरीद बिल सप्लायर के GST रिकॉर्ड से मेल नहीं खाते।",
   eb_care_q: "आपको परवाह क्यों करनी चाहिए?", eb_care_a: "मिस-मैच क्रेडिट रोक सकता है और कैशफ़्लो को नुकसान पहुँचा सकता है।",
   eb_app_q: "ऐप क्या करता है?", eb_app_a: "समस्या ढूँढता है और सप्लायर का संदेश लिख देता है।",
   eb_why_q: "20 सितंबर क्यों?", eb_why_a: "अगस्त के मासिक रिटर्न के लिए GSTR-3B अगले महीने देय होता है।",
   u_flowpill: "आयात", u_h: "अपना अगस्त खरीद रजिस्टर आयात करें।",
   u_p: "अपने अकाउंटिंग सॉफ़्टवेयर से बिल अपलोड करें। ITC Matchmaker जाँचता है कि सप्लायर ने वही इनवॉइस सही रिपोर्ट किए या नहीं।",
   u_bills: "बिल", u_desc: "{n} खरीद इनवॉइस — सप्लायर नाम, GSTIN, इनवॉइस नंबर, तारीख, कर योग्य मूल्य, GST राशि और कुल बिल मूल्य के साथ।",
   u_status_yes: "अगस्त खरीद रजिस्टर से {n} इनवॉइस आयात हुए", u_status_no: "अगस्त के लिए अभी कोई खरीद रजिस्टर आयात नहीं हुआ",
   u_open: "खरीद रजिस्टर खोलें", u_import: "खरीद रजिस्टर आयात करें", u_replace: "आयातित फाइल बदलें",
   u_accepted: "स्वीकार्य: XLSX या CSV", u_works: "टैली, ज़ोहो बुक्स, बिज़ी, व्यापार या किसी भी खरीद रजिस्टर के एक्सपोर्ट के साथ काम करता है",
   u_checks_h: "सिस्टम क्या जाँचता है",
   u_c1: "हम जाँचते हैं कि सप्लायर ने आपके बिल अपलोड किए या नहीं।",
   u_c2: "हम गलत राशि, गलत नंबर या गायब रिकॉर्ड वाले बिल ढूँढते हैं।",
   u_c3: "हम बताते हैं किससे संपर्क करें और कौन-सा संदेश भेजें।",
   u_c4: "हम जवाब देते हैं: क्या अब आप सुरक्षित रूप से GST फाइल कर सकते हैं?",
   u_toast: "खरीद रजिस्टर आयात हो गया।", file_name: "अगस्त_खरीद_बिल.xlsx",
   r_alert: "अभी कोई फाइल आयात नहीं हुई।", r_alert2: "अपना खरीद रजिस्टर लोड करने के लिए ‘खरीद बिल आयात करें’ से शुरू करें।",
   r_flowpill: "फाइल जाँचें", r_h: "आयात किए गए खरीद बिल जाँचें।",
   r_p: "यह आपका खरीद रजिस्टर है। ऐप इन इनवॉइस फ़ील्ड्स को पढ़कर सप्लायर के GST रिकॉर्ड से मिलाता है।",
   r_file: "आयातित फाइल", r_source: "स्रोत: अकाउंटिंग सॉफ़्टवेयर एक्सपोर्ट",
   r_rows: "मिली पंक्तियाँ", r_automatched: "{n} स्वतः GSTR-2B से मेल खाए",
   r_totalbill: "कुल बिल मूल्य", r_taxplusgst: "कर योग्य मूल्य + GST",
   r_credit: "फाइल में GST क्रेडिट", r_checked: "सप्लायर रिकॉर्ड से जाँचा गया",
   r_fields: "पहचाने गए फ़ील्ड:", r_supplier: "सप्लायर", r_invno: "इनवॉइस नं.", r_date: "तारीख",
   r_taxable: "कर योग्य मूल्य", r_gstamt: "GST राशि", r_total: "कुल मूल्य",
   r_imported_bills: "आयातित बिल", r_open_flagged: "किसी भी फ़्लैग किए बिल को खोलें और देखें कि यह आपके ITC को क्यों प्रभावित कर सकता है।",
   r_compare_gstr: "GSTR-2B से तुलना करें",
   r_safe_claim: "दावा करने योग्य", r_resolved: "हल हुआ", r_review: "समीक्षा", r_matches: "सप्लायर रिकॉर्ड से मेल खाता है",
   r_gstin: "GSTIN", r_tax: "कर योग्य", r_gst: "GST", r_tot: "कुल",
   rc_flowpill: "रिकॉर्ड की तुलना", rc_h: "अब देखें ठीक-ठीक क्या मेल नहीं खाया।",
   rc_p: "किसी भी बिल पर टैप करें और अपने खरीद रजिस्टर की सप्लायर-रिपोर्टेड GSTR-2B रिकॉर्ड से तुलना करें।",
   rc_recovered: "रिकवर हुआ", rc_risk: "{r} जोखिम", rc_compare: "रिकॉर्ड की तुलना",
   m_reconciliation: "मिलान", m_problem: "समस्या विवरण", m_close: "बंद करें",
   cmp_invno: "इनवॉइस नं.", cmp_notfiled: "फाइल नहीं हुआ", cmp_gstin: "GSTIN", cmp_date: "तारीख", cmp_gstamt: "GST राशि",
   cmp_your: "आपका रजिस्टर", cmp_gstr: "GSTR-2B",
   cmp_confidence: "मैच विश्वास", cmp_problem: "समस्या", cmp_status: "वर्तमान स्थिति",
   cmp_means: "इसका मतलब क्या है", cmp_recheck_note: "इस समस्या की दोबारा जाँच हुई और {amt} अब रिकवर माना गया है।",
   mark_corrected: "सप्लायर सुधार दर्ज करें", rerun_check: "ITC जाँच दोबारा चलाएँ", view_report: "फाइलिंग रिपोर्ट देखें",
   is_recovered: "दोबारा जाँच के बाद रिकवर हुआ", is_corrected: "सप्लायर ने सुधारा - दोबारा जाँच लंबित",
   is_sent: "संदेश भेजा गया", is_internal: "आंतरिक समीक्षा ज़रूरी", is_action: "कार्रवाई ज़रूरी",
   mm_flowpill: "सुधारों को प्राथमिकता", mm_all_h: "सभी समस्याएँ हल हो गईं।",
   mm_found_one: "ऐप को {n} समस्या मिली। सबसे अधिक जोखिम वाले पैसे से शुरू करें।",
   mm_found_many: "ऐप को {n} समस्याएँ मिलीं। सबसे अधिक जोखिम वाले पैसे से शुरू करें।",
   mm_all_p: "हर जोखिम वाला इनवॉइस ठीक या समीक्षित हो गया है। अब आप अपनी फाइलिंग रिपोर्ट देख सकते हैं।",
   mm_tap_p: "किसी भी समस्या पर टैप करें और देखें क्या हुआ, क्यों मायने रखता है, और क्या करना है।",
   mm_recovered: "{amt} रिकवर हुआ", mm_recovered_sub: "सप्लायर सुधार और दोबारा जाँच के बाद।",
   mm_none_h: "कोई लंबित ITC समस्या नहीं", mm_none_p: "सभी सप्लायर मिस-मैच और आंतरिक मामले संभाल लिए गए हैं।",
   mm_start_alert: "यहाँ से शुरू करें:", mm_start_alert2: "आप अभी परिणाम देख सकते हैं, पर सामान्य क्रम ‘बिल अपलोड करें’ से शुरू होता है।",
   pc_send: "{s} को संदेश भेजें", pc_remove: "डुप्लिकेट बिल हटाएँ", pc_review: "दावे से पहले समीक्षा करें",
   pd_resolved: "हल हुआ", pd_secured: "{amt} सुरक्षित", pd_may_affect: "{amt} प्रभावित हो सकता है",
   pd_happened: "क्या हुआ?", pd_whycare: "क्यों ज़रूरी?",
   pd_safe: "यह क्रेडिट सुरक्षित लगता है।", pd_notavail: "GST फाइल करते समय यह पैसा उपलब्ध न हो सकता है।",
   pd_donow: "अभी यह करें", pd_send_to: "{s} को एक संदेश भेजें।",
   pd_resolved_note: "यह समस्या हल के रूप में दर्ज है और आपकी फाइलिंग रिपोर्ट में सुरक्षित गिनी गई है।",
   pd_send_msg: "सप्लायर को संदेश भेजें", pd_compare_side: "रिकॉर्ड साथ-साथ तुलना करें",
   pd_remove_resolve: "डुप्लिकेट हटाएँ और हल करें", pd_review_resolve: "समीक्षित के रूप में हल करें",
   ppt_likely: "वही बिल, गलत नंबर", ppt_missing: "सप्लायर ने बिल अपलोड नहीं किया",
   ppt_amount: "GST राशि मेल नहीं खाती", ppt_gstin: "सप्लायर GST नंबर मिस-मैच",
   ppt_duplicate: "बिल आपकी फाइल में दोहराया गया", ppt_blocked: "क्रेडिट शायद अनुमत नहीं",
   issue_likely: "इनवॉइस नंबर में टाइपिंग गलती।", issue_missing: "सप्लायर ने यह इनवॉइस अपलोड नहीं किया।",
   issue_amount: "आपकी बुक और सप्लायर रिकॉर्ड की GST राशि अलग है।",
   issue_gstin: "आपकी बुक का सप्लायर GSTIN पोर्टल रिकॉर्ड से मेल नहीं खाता।",
   issue_dup: "यही इनवॉइस आपकी खरीद-बुक में दो बार है।",
   issue_blocked: "यह किसी निजी वाहन-संबंधी खर्च का ब्लॉक्ड क्रेडिट लगता है।",
   issue_matched: "सटीक मेल मिला।",
   fix_likely: "सप्लायर से इनवॉइस नंबर {portal} से {book} में सुधारने को कहें।",
   fix_missing: "सप्लायर से फाइलिंग कट-ऑफ़ से पहले यह इनवॉइस GSTR-1 में अपलोड करने को कहें।",
   fix_amount: "सप्लायर से कर योग्य मूल्य और टैक्स राशि जाँचने को कहें।",
   fix_gstin: "सप्लायर GSTIN की पुष्टि करें और अपनी खरीद-बुक सुधारें, या सप्लायर से संशोधन करने को कहें।",
   fix_dup: "फाइलिंग से पहले डुप्लिकेट प्रविष्टि हटाएँ।",
   fix_blocked: "दावा करने से पहले अपने अकाउंटेंट से समीक्षा करें।",
   fix_matched: "दावा करने के लिए सुरक्षित।",
   iam_dup: "यह इनवॉइस आपकी खरीद-बुक में दो बार दिख रहा है। फाइलिंग से पहले डुप्लिकेट प्रविष्टि हटाएँ ताकि गलती से एक ही ITC दो बार दावा न हो।",
   iam_blocked: "यह क्रेडिट ब्लॉक्ड या अनुमत नहीं हो सकता। इसे बिना सोचे दावा न करें। फाइलिंग से पहले समीक्षा करें और सप्लायर-सुधार वाले मामलों से अलग रखें।",
   sp_flowpill: "सप्लायर से संपर्क", sp_h: "आपको GST मिस-मैच खुद समझाने की ज़रूरत नहीं।",
   sp_p: "ऐप सरल सप्लायर संदेश लिखता है और कई समस्याओं को एक नोट में जोड़ देता है।",
   sp_marked_one: "{n} सप्लायर सुधार दर्ज।", sp_marked_many: "{n} सप्लायर सुधार दर्ज।",
   sp_rerun_hint: "रिकवर हुए क्रेडिट की पुष्टि के लिए ITC जाँच दोबारा चलाएँ।",
   sp_recovered: "{amt} रिकवर हुआ", sp_recovered_sub: "सप्लायर सुधार अब फाइलिंग रिपोर्ट में दिख रहे हैं।",
   sp_issue_one: "{n} समस्या: {list}", sp_issue_many: "{n} समस्याएँ: {list}",
   sp_recovered_badge: "रिकवर हुआ", sp_correction: "सुधार प्राप्त", sp_sent: "संदेश भेजा", sp_contact_today: "आज संपर्क करें",
   sp_copy: "सप्लायर संदेश कॉपी करें", sp_mark: "सप्लायर सुधार दर्ज करें",
   sp_empty: "कोई सप्लायर कार्रवाई लंबित नहीं। बचे आंतरिक मामलों के लिए फाइलिंग रिपोर्ट देखें।",
   sp_msg_intro: "नमस्ते {s}, हमें हमारे ITC को प्रभावित करने वाले GST मिस-मैच मिले हैं: {list}. कृपया अपने GSTR-1 रिकॉर्ड जाँचें और {date} से पहले इन्हें ठीक करें। धन्यवाद।",
   sp_copied: "{s} का संदेश कॉपी हुआ।",
   sp_marked_toast: "{s} सुधार दर्ज। रिकवरी की पुष्टि के लिए ITC जाँच दोबारा चलाएँ।",
   fr_flowpill: "फाइलिंग रिपोर्ट", fr_h: "आपकी फाइलिंग रिपोर्ट तैयार है।",
   fr_p: "यह रिपोर्ट दिखाती है कि सप्लायर सुधार के बाद क्या बेहतर हुआ और GSTR-3B फाइलिंग से पहले अब भी क्या जोखिम में है।",
   fr_safe: "अभी दावा करने योग्य", fr_safe_sub: "मेल खाया ITC और रिकवर हुए सप्लायर सुधार।",
   fr_recovered: "दोबारा जाँच के बाद रिकवर", fr_recovered_sub: "जाँच दोबारा चलाकर सप्लायर सुधार पुष्ट हुए।",
   fr_risk: "अब भी जोखिम में", fr_nothing: "कुछ भी लंबित नहीं। सभी मामले संभाल लिए गए।",
   fr_still_one: "{n} इनवॉइस पर अब भी कार्रवाई ज़रूरी।", fr_still_many: "{n} इनवॉइस पर अब भी कार्रवाई ज़रूरी।",
   fr_sp_pending: "सप्लायर कार्रवाई लंबित",
   fr_sp_one: "{n} इनवॉइस पर अब भी सप्लायर सुधार ज़रूरी।", fr_sp_many: "{n} इनवॉइस पर अब भी सप्लायर सुधार ज़रूरी।",
   fr_sp_none: "कोई सप्लायर कार्रवाई लंबित नहीं।",
   fr_int_pending: "आंतरिक समीक्षा लंबित",
   fr_int_one: "दावे से पहले {n} इनवॉइस की आंतरिक समीक्षा होनी चाहिए।", fr_int_many: "दावे से पहले {n} इनवॉइस की आंतरिक समीक्षा होनी चाहिए।",
   fr_int_none: "कोई आंतरिक समीक्षा लंबित नहीं।",
   fr_reco: "सिफ़ारिश", fr_ready: "आप GSTR-3B फाइल करने के लिए तैयार हैं।", fr_notready: "अभी फाइल न करें।",
   fr_ready_p: "सभी ITC समस्याएँ हल हो गई हैं। आप सुरक्षित रूप से {amt} दावा कर सकते हैं और {date} से पहले फाइल कर सकते हैं।",
   fr_notready_p: "‘समस्याएँ ठीक करें’ चरण पर बची समस्याएँ हल करें, फिर यहाँ दोबारा जाँचें।",
   fr_goto_decision: "फाइलिंग निर्णय पर जाएँ", fr_back_fix: "समस्याएँ ठीक करें पर लौटें",
   rd_final: "अंतिम उत्तर", rd_yes: "हाँ। आप फाइल करने के लिए तैयार हैं।",
   rd_yes_p: "सभी ITC समस्याएँ हल हो गई हैं। आप इस महीने सुरक्षित रूप से {amt} दावा कर सकते हैं।", rd_readiness: "फाइलिंग तैयारी",
   rd_allset: "सब तैयार है", rd_checklist: "GSTR-3B जमा करने से पहले एक त्वरित अंतिम चेकलिस्ट।",
   rd_safe_conf: "सुरक्षित ITC पुष्ट", rd_safe_conf_sub: "{amt} मेल खाया और दावे के लिए तैयार है।",
   rd_sp_res: "सप्लायर समस्याएँ हल", rd_sp_res_sub: "सभी सप्लायर मिस-मैच सुधारे और दोबारा जाँचे गए।",
   rd_int_rev: "आंतरिक मामले समीक्षित", rd_int_rev_sub: "डुप्लिकेट और ब्लॉक्ड क्रेडिट संभाल लिए गए।",
   rd_file_before: "अंतिम तिथि से पहले फाइल करें", rd_file_before_sub: "{date} से पहले GSTR-3B जमा करें।",
   rd_almost: "लगभग तैयार। आंतरिक मामले देखें।", rd_no: "नहीं। आपको अभी फाइल नहीं करना चाहिए।",
   rd_unresolved: "{amt} अब भी अनसुलझा है।", rd_recovered_note: "दोबारा जाँच के बाद {amt} रिकवर हुआ है।",
   rd_filenow_warn: "अभी फाइल करने से अतिरिक्त नकद भुगतान या भविष्य में सवाल हो सकते हैं।",
   rd_before_h: "फाइलिंग से पहले यह करें", rd_before_p: "इन्हें ‘समस्याएँ ठीक करें’ चरण पर हल करें।",
   rd_fix_sp_one: "{n} सप्लायर समस्या ठीक करें", rd_fix_sp_many: "{n} सप्लायर समस्याएँ ठीक करें",
   rd_fix_sp_yes: "उन्हें बिल सुधारने या अपलोड करने की ज़रूरत है।", rd_fix_sp_no: "सप्लायर-पक्ष की समस्याएँ हल हो गईं।",
   rd_rev_int_one: "{n} आंतरिक मामला देखें", rd_rev_int_many: "{n} आंतरिक मामले देखें",
   rd_rev_int_yes: "डुप्लिकेट और ब्लॉक्ड क्रेडिट संभालें।", rd_rev_int_no: "आंतरिक मामले हल हो गए।",
   rd_recheck: "फाइलिंग रिपोर्ट दोबारा जाँचें", rd_recheck_sub: "फाइलिंग से पहले रिकवर हुए क्रेडिट की पुष्टि करें।",
   rd_filedue: "अंतिम तिथि से पहले फाइल करें", rd_filedue_sub: "{date} से पहले GSTR-3B जमा करें।",
   rd_goto_fix: "समस्याएँ ठीक करें पर जाएँ",
   toast_reset: "आयातित फाइल हटा दी गई। आप नया खरीद रजिस्टर आयात कर सकते हैं।",
   toast_resolved: "{b} हल के रूप में दर्ज।",
   toast_recovered: "दोबारा जाँच के बाद {amt} रिकवर हुआ।"
 }
};

function t(key, vars) {
 let s = (STR[state.lang] && STR[state.lang][key]) || STR.en[key] || key;
 if (vars) for (const k in vars) s = s.split("{" + k + "}").join(loc(vars[k]));
 return loc(s);
}

const MONTHS_HI = { January: "जनवरी", February: "फरवरी", March: "मार्च", April: "अप्रैल", May: "मई", June: "जून", July: "जुलाई", August: "अगस्त", September: "सितंबर", October: "अक्टूबर", November: "नवंबर", December: "दिसंबर" };

function localizeDate(str) {
 if (state.lang !== "hi") return str;
 return str.replace(/January|February|March|April|May|June|July|August|September|October|November|December/g, (m) => MONTHS_HI[m] || m);
}

// Proper-noun localization: company/people/place names shown to the user.
// Keys stay in English internally (matching engine, onclick handlers); only display text is localized.
const NAME_HI = {
 "Aarohi Electronics": "आरोही इलेक्ट्रॉनिक्स",
 "Kumar Traders": "कुमार ट्रेडर्स",
 "Shakti Components": "शक्ति कंपोनेंट्स",
 "Metro Electronics": "मेट्रो इलेक्ट्रॉनिक्स",
 "South India Logistics": "साउथ इंडिया लॉजिस्टिक्स",
 "Bright Packaging": "ब्राइट पैकेजिंग",
 "Mysore Lights": "मैसूर लाइट्स",
 "Neha Sharma": "नेहा शर्मा",
 "Karnataka": "कर्नाटक"
};
const MONTHS_ABBR_HI = { Jan: "जन", Feb: "फ़र", Mar: "मार्च", Apr: "अप्रैल", May: "मई", Jun: "जून", Jul: "जुल", Aug: "अगस्त", Sep: "सित", Oct: "अक्तू", Nov: "नव", Dec: "दिस" };

// GST-domain acronyms rendered in Devanagari (standard in Hindi tax communication).
// Ordered longest/most-specific first so "GSTIN"/"GSTR" are matched before "GST".
const ACRONYM_HI = [
 ["GSTIN", "जीएसटीआईएन"],
 ["GSTR-2B", "जीएसटीआर-2बी"],
 ["GSTR-3B", "जीएसटीआर-3बी"],
 ["GSTR-2A", "जीएसटीआर-2ए"],
 ["GSTR-1", "जीएसटीआर-1"],
 ["GSTR", "जीएसटीआर"],
 ["GST", "जीएसटी"],
 ["ITC", "आईटीसी"]
];

// Localize any display string: proper nouns + abbreviated month names + tax acronyms.
function loc(str) {
 if (state.lang !== "hi" || str == null) return str;
 let s = String(str);
 for (const k in NAME_HI) s = s.split(k).join(NAME_HI[k]);
 s = s.replace(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g, (m) => MONTHS_ABBR_HI[m] || m);
 for (const [en, hi] of ACRONYM_HI) s = s.split(en).join(hi);
 return s;
}

function setLang(lang) {
 state.lang = lang;
 localStorage.setItem("itc-lang", lang);
 document.documentElement.lang = lang;
 render();
}

function langToggle() {
 return `
   <div class="lang-toggle" role="group" aria-label="${t("lang_label")}">
     <button class="${state.lang === "en" ? "active" : ""}" onclick="setLang('en')">EN</button>
     <button class="${state.lang === "hi" ? "active" : ""}" onclick="setLang('hi')">हिं</button>
   </div>
 `;
}

function rupee(value) {
 return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(value);
}

function atRiskInvoices() {
 return invoices.filter((invoice) => invoice.risk !== "Low");
}

function needsSupplierAction(invoice) {
 return !["Duplicate", "Blocked ITC"].includes(invoice.status) && invoice.risk !== "Low";
}

function isSupplierCorrected(invoice) {
 return needsSupplierAction(invoice) && state.corrected[invoice.supplier];
}

function isResolved(invoice) {
 if (state.resolved[invoice.id]) return true;
 return isSupplierCorrected(invoice) && state.rechecked;
}

function unresolvedRiskInvoices() {
 return atRiskInvoices().filter((invoice) => !isResolved(invoice));
}

function recoveredInvoices() {
 return atRiskInvoices().filter(isResolved);
}

function riskAmount() {
 return unresolvedRiskInvoices().reduce((sum, invoice) => sum + invoice.gst, 0);
}

function riskAmountOriginal() {
 return atRiskInvoices().reduce((sum, invoice) => sum + invoice.gst, 0);
}

function recoveredAmount() {
 return recoveredInvoices().reduce((sum, invoice) => sum + invoice.gst, 0);
}

function readinessScore() {
 const penalty = unresolvedRiskInvoices().reduce((sum, invoice) => sum + (invoice.risk === "High" ? 5 : 3), 0);
 return Math.max(68, 100 - penalty);
}

function noticeScore() {
 return Math.min(100, 30 + unresolvedRiskInvoices().filter((invoice) => invoice.risk === "High").length * 6);
}

function supplierGroups() {
 return unresolvedRiskInvoices().filter(needsSupplierAction).reduce((groups, invoice) => {
   if (!groups[invoice.supplier]) {
     groups[invoice.supplier] = [];
   }
   groups[invoice.supplier].push(invoice);
   return groups;
 }, {});
}

function internalActions() {
 return unresolvedRiskInvoices().filter((invoice) => !needsSupplierAction(invoice));
}

function statusBadge(invoice) {
 if (invoice.status === "Matched") return `<span class="badge badge-green">${t("b_safe")}</span>`;
 if (invoice.risk === "High") return `<span class="badge badge-red">${t("b_high")}</span>`;
 if (invoice.risk === "Medium") return `<span class="badge badge-amber">${t("b_needsfix")}</span>`;
 return `<span class="badge badge-blue">${invoice.status}</span>`;
}

function pageTitle(route) {
 const keys = {
   "#/dashboard": ["t_dashboard", "s_dashboard"],
   "#/upload": ["t_upload", "s_upload"],
   "#/register": ["t_register", "s_register"],
   "#/reconcile": ["t_reconcile", "s_reconcile"],
   "#/matchmaker": ["t_matchmaker", "s_matchmaker"],
   "#/suppliers": ["t_suppliers", "s_suppliers"],
   "#/report": ["t_report", "s_report"],
   "#/readiness": ["t_readiness", "s_readiness"]
 };
 const pair = keys[route] || keys["#/dashboard"];
 return [t(pair[0]), t(pair[1])];
}

function normalizedFlowRoute(route) {
 return route;
}

function currentStepIndex(route) {
 return flowSteps.findIndex(([href]) => href === normalizedFlowRoute(route));
}

function flowProgress(route) {
 const index = currentStepIndex(route);
 if (index < 0) return "";
 const percent = Math.round(((index + 1) / flowSteps.length) * 100);
 return `
   <section class="flow-progress" aria-label="Filing workflow progress">
     <div class="flow-progress-top">
       <strong>${t("step_of", { n: index + 1, total: flowSteps.length, label: t(flowSteps[index][1]) })}</strong>
       <span>${t("pct_complete", { p: percent })}</span>
     </div>
     <div class="flow-progress-bar"><div style="width: ${percent}%"></div></div>
     <div class="flow-progress-steps">
       ${flowSteps.map(([href, label], stepIndex) => `<a href="${href}" class="${stepIndex === index ? "active" : stepIndex < index ? "done" : ""}">${stepIndex + 1}. ${t(label)}</a>`).join("")}
     </div>
   </section>
 `;
}

function flowFooter(route) {
 const index = currentStepIndex(route);
 if (index < 0) return "";
 const prev = flowSteps[index - 1];
 const next = flowSteps[index + 1];
 const importBlocked = normalizedFlowRoute(route) === "#/upload" && !state.uploaded;
 const nextLabel = index === 0 ? t("start_importing") : index === flowSteps.length - 1 ? t("back_to_start") : t("continue_to", { label: t(next[1]) });
 const nextHref = index === flowSteps.length - 1 ? "#/dashboard" : next?.[0];
 return `
   <section class="flow-footer">
     <div>
       <strong>${index === flowSteps.length - 1 ? t("workflow_complete") : t("next_step")}</strong>
       <p>${footerHint(index)}</p>
     </div>
     <div class="flow-footer-actions">
       ${prev ? `<a class="btn btn-ghost" href="${prev[0]}">${t("back")}</a>` : ""}
       ${importBlocked ? `<button class="btn btn-primary" disabled>${t("import_to_continue")}</button>` : nextHref ? `<a class="btn btn-primary" href="${nextHref}">${nextLabel}</a>` : ""}
     </div>
   </section>
 `;
}

function footerHint(index) {
 const hints = [
   t("hint0"),
   state.uploaded ? t("hint1a") : t("hint1b"),
   t("hint2"),
   t("hint3"),
   t("hint4"),
   t("hint5"),
   t("hint6"),
   t("hint7")
 ];
 return hints[index] || "";
}

function save() {
 localStorage.setItem("itc-contacted", JSON.stringify(state.contacted));
 localStorage.setItem("itc-corrected", JSON.stringify(state.corrected));
 localStorage.setItem("itc-resolved", JSON.stringify(state.resolved));
 localStorage.setItem("itc-rechecked", String(state.rechecked));
 localStorage.setItem("itc-uploaded", String(state.uploaded));
}

function showToast(message) {
 state.toast = message;
 render();
 window.setTimeout(() => {
   state.toast = "";
   render();
 }, 2200);
}

function login(email, password) {
 if (email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD) {
   state.user = { email: DEMO_EMAIL, name: business.owner };
   localStorage.setItem("itc-user", JSON.stringify(state.user));
   window.location.hash = "#/dashboard";
   render();
   return;
 }
 document.querySelector("#login-error").innerHTML = t("login_err");
}

function logout() {
 state.user = null;
 localStorage.removeItem("itc-user");
 window.location.hash = "#/login";
 render();
}

function resetDemo() {
 localStorage.removeItem("itc-uploaded");
 localStorage.removeItem("itc-contacted");
 localStorage.removeItem("itc-corrected");
 localStorage.removeItem("itc-resolved");
 localStorage.removeItem("itc-rechecked");
 state.uploaded = false;
 state.contacted = {};
 state.corrected = {};
 state.resolved = {};
 state.rechecked = false;
 showToast(t("toast_reset"));
}

function markSupplierCorrected(supplier) {
 state.corrected[supplier] = true;
 state.rechecked = false;
 save();
 showToast(t("sp_marked_toast", { s: supplier }));
}

function resolveInternal(id) {
 const invoice = invoices.find((item) => item.id === id);
 state.resolved[id] = true;
 save();
 closeModal();
 showToast(t("toast_resolved", { b: invoice.bookNo }));
}

function rerunCheck() {
 state.rechecked = true;
 save();
 showToast(t("toast_recovered", { amt: rupee(recoveredAmount()) }));
}

function closeSteps() {
 state.stepsOpen = false;
}

function toggleAccountMenu() {
 state.accountOpen = !state.accountOpen;
 render();
}

function loginView() {
 return `
   <main class="login-page login-only">
     <section class="login-panel">
       <form class="login-card" onsubmit="event.preventDefault(); login(this.email.value, this.password.value)">
         <div class="login-card-top">
           <div class="logo"><span class="logo-mark" aria-hidden="true"><span class="logo-doc logo-doc-back"></span><span class="logo-doc logo-doc-front"></span><span class="logo-check"></span></span><span>ITC Matchmaker</span></div>
           ${langToggle()}
         </div>
         <h2>${t("login_h")}</h2>
         <p class="muted">${t("login_sub")}</p>
         <div class="form-field">
           <label for="email">${t("email")}</label>
           <input class="input" id="email" name="email" placeholder="owner@business.in" autocomplete="username" value="${DEMO_EMAIL}" />
         </div>
         <div class="form-field">
           <label for="password">${t("password")}</label>
           <input class="input" id="password" name="password" placeholder="${t("password_ph")}" type="password" autocomplete="current-password" value="${DEMO_PASSWORD}" />
         </div>
         <button class="btn btn-primary btn-block" style="margin-top: 20px;">${t("continue")}</button>
         <div id="login-error"></div>
       </form>
     </section>
   </main>
 `;
}

function shell(content) {
 const route = window.location.hash || "#/dashboard";
 const [title, subtitle] = pageTitle(route);
 return `
   <div class="app-shell simple-shell">
     <aside class="sidebar simple-sidebar ${state.stepsOpen ? "open" : ""}" id="sidebar">
       <div class="logo"><span class="logo-mark" aria-hidden="true"><span class="logo-doc logo-doc-back"></span><span class="logo-doc logo-doc-front"></span><span class="logo-check"></span></span><span>ITC Matchmaker</span></div>
       <div class="profile-card">
         <strong>${loc(business.name)}</strong>
         <small>${business.gstin}</small>
         <small>${localizeDate(business.period)} ${t("return_suffix")}</small>
       </div>
       <nav class="nav">
         ${navItems.map(([href, label, icon]) => `<a class="${route === href ? "active" : ""}" href="${href}" onclick="closeSteps()"><span>${icon}</span>${t(label)}</a>`).join("")}
       </nav>
       ${langToggle()}
       <div class="side-note">
         <strong>${t("product_promise")}</strong>
         <span>${t("promise_body")}</span>
       </div>
       <button class="btn btn-ghost btn-block" style="margin-top: 10px;" onclick="logout()">${t("logout")}</button>
     </aside>
     <main class="main">
       <div class="mobile-account-bar">
         <div class="mobile-brand">
           <span class="logo-mark" aria-hidden="true"><span class="logo-doc logo-doc-back"></span><span class="logo-doc logo-doc-front"></span><span class="logo-check"></span></span>
           <strong class="brand-name">ITC Matchmaker</strong>
         </div>
         <button class="account-trigger ${state.accountOpen ? "open" : ""}" onclick="toggleAccountMenu()" aria-expanded="${state.accountOpen ? "true" : "false"}" aria-label="${t("account_menu")}">
           <span class="account-avatar-sm">AE</span>
           <span class="account-caret"></span>
         </button>
         ${state.accountOpen ? `
           <div class="account-dropdown">
             <div class="account-dropdown-head">
               <span class="account-avatar">AE</span>
               <div class="account-details">
                 <strong>${loc(business.name)}</strong>
                 <span>${business.gstin}</span>
                 <span>${state.user?.email || DEMO_EMAIL}</span>
               </div>
             </div>
             <div class="account-lang">${langToggle()}</div>
             <button class="account-logout" onclick="logout()">
               <span class="account-logout-icon"></span>
               ${t("log_out")}
             </button>
           </div>
         ` : ""}
       </div>
       ${state.accountOpen ? `<div class="account-overlay" onclick="toggleAccountMenu()"></div>` : ""}
       <div class="topbar">
         <div>
           <h1>${title}</h1>
           <p>${subtitle}</p>
         </div>
         <span class="badge badge-amber deadline-badge">${t("due_date", { date: localizeDate(business.deadline) })}</span>
       </div>
       ${flowProgress(route)}
       ${content}
       ${flowFooter(route)}
     </main>
     ${state.toast ? `<div class="toast">${state.toast}</div>` : ""}
   </div>
 `;
}

function dashboardView() {
 const groups = supplierGroups();
 const supplierActions = Object.entries(groups)
   .map(([supplier, items]) => ({ type: "supplier", title: t("d_contact_s", { s: supplier }), supplier, count: items.length, amount: items.reduce((sum, item) => sum + item.gst, 0), high: items.some((item) => item.risk === "High") }));
 const reviewActions = internalActions().map((invoice) => ({
   type: "review",
   title: invoice.status === "Duplicate" ? t("d_remove_dup", { b: invoice.bookNo }) : t("d_review_b", { b: invoice.bookNo }),
   count: 1,
   amount: invoice.gst,
   high: invoice.risk === "High",
   helper: invoice.status === "Duplicate" ? t("d_internal_note") : t("d_blocked_note")
 }));
 const topActions = [...supplierActions, ...reviewActions].sort((a, b) => b.amount - a.amount).slice(0, 5);
 const allClear = unresolvedRiskInvoices().length === 0;
 const safeToClaim = extraSummary.safeItc + recoveredAmount();

 return shell(`
   <section class="story-hero ${allClear ? "hero-ready" : ""}">
     <div>
       <span class="eyebrow light">${t("d_return_tag", { name: business.name })}</span>
       <h2>${allClear ? t("d_ready_h", { amt: rupee(safeToClaim) }) : t("d_notready_h", { amt: rupee(riskAmount()) })}</h2>
       <p>${allClear ? t("d_ready_p") : t("d_notready_p")}</p>
       <div class="hero-actions">
         ${allClear
           ? `<a class="btn btn-orange" href="#/report">${t("d_view_report")}</a><a class="btn btn-light" href="#/readiness">${t("d_filing_decision")}</a>`
           : `<a class="btn btn-orange" href="#/upload">${state.uploaded ? t("d_review_bills") : t("d_start_bills")}</a><a class="btn btn-light" href="#/reconcile">${t("d_see_mismatch")}</a>`
         }
       </div>
       <a class="reality-link" href="#/portal-preview">${t("reality_link")}</a>
     </div>
     <div class="verdict-card">
       <span>${allClear ? t("d_filing_status") : t("d_cash_impact")}</span>
       <strong>${allClear ? t("d_ready_to_file") : t("d_could_pay", { amt: rupee(riskAmount()) })}</strong>
       <p>${allClear ? t("d_all_resolved") : t("d_use_check")}</p>
     </div>
   </section>

   <section class="money-strip">
     <div class="money-card safe-money">
       <span>${t("d_safe_money")}</span>
       <strong>${rupee(safeToClaim)}</strong>
       <p>${t("d_matched_recovered")}</p>
     </div>
     <div class="money-card ${allClear ? "safe-money" : "danger-money"}">
       <span>${allClear ? t("d_cleared") : t("d_stuck_money")}</span>
       <strong>${rupee(riskAmount())}</strong>
       <p>${allClear ? t("d_nothing_pending") : t("d_needs_fixing")}</p>
     </div>
     <div class="money-card neutral-money">
       <span>${t("d_nextstep")}</span>
       <strong>${allClear ? t("d_file_gstr") : t("d_n_suppliers", { n: Object.keys(groups).length })}</strong>
       <p>${allClear ? t("d_submit_before", { date: localizeDate(business.deadline) }) : t("d_send_review", { n: internalActions().length })}</p>
     </div>
   </section>

   ${allClear
     ? `<section class="guided-card" style="margin-top: 18px;">
          <div class="all-clear">
            <div class="all-clear-icon">✓</div>
            <h3>${t("d_every_resolved")}</h3>
            <p>${t("d_protected", { amt: rupee(riskAmountOriginal()) })}</p>
            <a class="btn btn-primary" href="#/report">${t("d_view_report")}</a>
          </div>
        </section>`
     : `<section class="guided-card" style="margin-top: 18px;">
          <div class="section-title">
            <div>
              <h2>${t("d_action_plan")}</h2>
              <p class="muted">${t("d_only_list")}</p>
            </div>
            <a class="btn btn-primary" href="#/matchmaker">${t("d_explain_each")}</a>
          </div>
          <div class="simple-actions">
            ${topActions.map((item, index) => `
              <div class="plain-action">
                <div class="rank big-rank">${index + 1}</div>
                <div>
                  <p class="row-title">${item.title}</p>
                  <p class="row-sub">${item.helper || t(item.count > 1 ? "d_fixable_many" : "d_fixable_one", { n: item.count, u: item.high ? t("d_high_urgency") : t("d_med_urgency") })}</p>
                </div>
                <strong class="amount">${rupee(item.amount)}</strong>
              </div>
            `).join("")}
          </div>
        </section>`
   }

   <section class="explain-band">
     <div><strong>${t("eb_happening_q")}</strong><span>${t("eb_happening_a")}</span></div>
     <div><strong>${t("eb_care_q")}</strong><span>${t("eb_care_a")}</span></div>
     <div><strong>${t("eb_app_q")}</strong><span>${t("eb_app_a")}</span></div>
     <div><strong>${t("eb_why_q")}</strong><span>${t("eb_why_a")}</span></div>
   </section>
 `);
}

function uploadView() {
 const importStatus = state.uploaded ? t("u_status_yes", { n: invoices.length }) : t("u_status_no");
 return shell(`
   <section class="guided-card">
     <div class="flow-title">
       <span class="flow-pill">${t("u_flowpill")}</span>
       <h2>${t("u_h")}</h2>
       <p>${t("u_p")}</p>
     </div>
     <div class="grid grid-2">
       <div class="upload-zone simple-upload">
       <div>
         <div class="upload-icon">${t("u_bills")}</div>
         <h2>${t("file_name")}</h2>
         <p class="muted">${t("u_desc", { n: invoices.length })}</p>
         <div class="import-status">${importStatus}</div>
         <button class="btn btn-orange" onclick="state.uploaded = true; save(); showToast(t('u_toast')); window.location.hash = '#/register';">${state.uploaded ? t("u_open") : t("u_import")}</button>
         ${state.uploaded ? `<button class="btn btn-ghost btn-block" style="margin-top: 10px;" onclick="resetDemo(); window.location.hash = '#/upload';">${t("u_replace")}</button>` : ""}
         <div class="file-rules">
           <span>${t("u_accepted")}</span>
           <span>${t("u_works")}</span>
         </div>
       </div>
       </div>
       <div class="simple-explainer">
       <h2>${t("u_checks_h")}</h2>
       ${[
         ["1", t("u_c1")],
         ["2", t("u_c2")],
         ["3", t("u_c3")],
         ["4", t("u_c4")]
       ].map(([num, text]) => `<div class="explain-step"><b>${num}</b><span>${text}</span></div>`).join("")}
       </div>
     </div>
   </section>
 `);
}

function registerView() {
 const totalValue = invoices.reduce((sum, invoice) => sum + invoice.taxable + invoice.gst, 0);
 const matchedCount = invoices.filter((i) => i.risk === "Low").length;
 return shell(`
   ${!state.uploaded ? `<div class="friendly-alert"><strong>${t("r_alert")}</strong> <a href="#/upload">${t("r_alert2")}</a></div>` : ""}
   <section class="guided-card">
     <div class="flow-title">
       <span class="flow-pill">${t("r_flowpill")}</span>
       <h2>${t("r_h")}</h2>
       <p>${t("r_p")}</p>
     </div>

     <div class="register-summary">
       <div>
         <span>${t("r_file")}</span>
         <strong>${t("file_name")}</strong>
         <p>${t("r_source")}</p>
       </div>
       <div>
         <span>${t("r_rows")}</span>
         <strong>${invoices.length}</strong>
         <p>${t("r_automatched", { n: matchedCount })}</p>
       </div>
       <div>
         <span>${t("r_totalbill")}</span>
         <strong>${rupee(totalValue)}</strong>
         <p>${t("r_taxplusgst")}</p>
       </div>
       <div>
         <span>${t("r_credit")}</span>
         <strong>${rupee(extraSummary.totalItc)}</strong>
         <p>${t("r_checked")}</p>
       </div>
     </div>

     <div class="mapped-fields">
       <strong>${t("r_fields")}</strong>
       <span>${t("r_supplier")}</span>
       <span>${t("r_gstin")}</span>
       <span>${t("r_invno")}</span>
       <span>${t("r_date")}</span>
       <span>${t("r_taxable")}</span>
       <span>${t("r_gstamt")}</span>
       <span>${t("r_total")}</span>
     </div>

     <div class="section-title" style="margin-top: 22px;">
       <div>
         <h2>${t("r_imported_bills")}</h2>
         <p class="muted">${t("r_open_flagged")}</p>
       </div>
       <a class="btn btn-primary" href="#/reconcile">${t("r_compare_gstr")}</a>
     </div>

     <div class="register-list">
       ${invoices.map((invoice) => purchaseRegisterRow(invoice)).join("")}
     </div>
   </section>
   ${modalMarkup()}
 `);
}

function purchaseRegisterRow(invoice) {
 const total = invoice.taxable + invoice.gst;
 const resolved = isResolved(invoice);
 const action = invoice.risk === "Low" ? t("r_safe_claim") : resolved ? t("r_resolved") : t("r_review");
 const badge = resolved ? `<span class="badge badge-green">${t("r_resolved")}</span>` : statusBadge(invoice);
 return `
   <button class="reg-card" onclick="openModal('${invoice.id}', 'reconcile')">
     <div class="reg-card-head">
       <div class="reg-id">
         <strong>${invoice.bookNo}</strong>
         <span>${loc(invoice.supplier)} · ${loc(invoice.date)}</span>
       </div>
       ${badge}
     </div>
     <div class="reg-card-body">
       <div><span>${t("r_gstin")}</span><b>${invoice.supplierGstin}</b></div>
       <div><span>${t("r_tax")}</span><b>${rupee(invoice.taxable)}</b></div>
       <div><span>${t("r_gst")}</span><b>${rupee(invoice.gst)}</b></div>
       <div><span>${t("r_tot")}</span><b>${rupee(total)}</b></div>
     </div>
     <div class="reg-card-foot">
       <span class="reg-note">${invoice.risk === "Low" ? t("r_matches") : plainProblemTitle(invoice)}</span>
       <span class="reg-cta">${action} →</span>
     </div>
   </button>
 `;
}

function reconcileView() {
 const rows = atRiskInvoices();
 return shell(`
   <section class="guided-card">
     <div class="flow-title">
       <span class="flow-pill">${t("rc_flowpill")}</span>
       <h2>${t("rc_h")}</h2>
       <p>${t("rc_p")}</p>
     </div>

     <div class="reconcile-grid">
       ${rows.map((invoice) => `
         <button class="reconcile-item" onclick="openModal('${invoice.id}', 'reconcile')">
           <div class="reconcile-item-top">
             <span class="badge ${isResolved(invoice) ? "badge-green" : invoice.risk === "High" ? "badge-red" : "badge-amber"}">${isResolved(invoice) ? t("rc_recovered") : t("rc_risk", { r: t(invoice.risk === "High" ? "b_high" : invoice.risk === "Medium" ? "b_needsfix" : "b_safe") })}</span>
             <strong>${rupee(invoice.gst)}</strong>
           </div>
           <strong class="reconcile-item-id">${invoice.bookNo}</strong>
           <p>${plainProblemTitle(invoice)}</p>
           <span class="reconcile-item-cta">${t("rc_compare")}</span>
         </button>
       `).join("")}
     </div>
   </section>
   ${modalMarkup()}
 `);
}

function modalMarkup() {
 const invoice = state.modalInvoiceId ? invoices.find((item) => item.id === state.modalInvoiceId) : null;
 if (!invoice) return "";
 const isReconcile = state.modalType === "reconcile";
 return `
   <div class="modal-overlay" onclick="closeModal()"></div>
   <div class="modal" role="dialog" aria-modal="true">
     <div class="modal-head">
       <div>
         <span class="mini-label">${isReconcile ? t("m_reconciliation") : t("m_problem")}</span>
         <h3>${invoice.bookNo} · ${loc(invoice.supplier)}</h3>
       </div>
       <button class="modal-close" onclick="closeModal()" aria-label="${t("m_close")}">×</button>
     </div>
     <div class="modal-body">
       ${isReconcile ? reconcileDetail(invoice) : problemDetail(invoice)}
     </div>
   </div>
 `;
}

function openModal(id, type) {
 state.modalInvoiceId = id;
 state.modalType = type || "reconcile";
 document.body.style.overflow = "hidden";
 render();
}

function closeModal() {
 state.modalInvoiceId = null;
 document.body.style.overflow = "";
 render();
}

function reconcileDetail(invoice) {
 const missing = invoice.portalNo === "Missing";
 const fields = [
   { label: t("cmp_invno"), you: invoice.bookNo, portal: missing ? t("cmp_notfiled") : invoice.portalNo, mismatch: missing || normInv(invoice.bookNo) !== normInv(invoice.portalNo) },
   { label: t("cmp_gstin"), you: invoice.supplierGstin, portal: missing ? "—" : invoice.portalGstin, mismatch: missing || invoice.portalGstin !== invoice.supplierGstin },
   { label: t("cmp_date"), you: invoice.date, portal: missing ? "—" : invoice.portalDate, mismatch: missing || invoice.portalDate !== invoice.date },
   { label: t("cmp_gstamt"), you: rupee(invoice.gst), portal: invoice.portalGst == null ? "—" : rupee(invoice.portalGst), mismatch: missing || (invoice.portalGst != null && invoice.portalGst !== invoice.gst) }
 ];
 return `
   <div class="compare-table">
     <div class="compare-thead">
       <span></span>
       <span>${t("cmp_your")}</span>
       <span>${t("cmp_gstr")}</span>
     </div>
     ${fields.map((f) => `
       <div class="compare-trow ${f.mismatch ? "mismatch" : "ok"}">
         <span class="compare-field">${f.label}</span>
         <span class="compare-you">${loc(f.you)}</span>
         <span class="compare-portal">${loc(f.portal)}</span>
       </div>
     `).join("")}
   </div>

   <div class="match-verdict">
     <div>
       <span>${t("cmp_confidence")}</span>
       <strong>${invoice.confidence}%</strong>
     </div>
     <div>
       <span>${t("cmp_problem")}</span>
       <strong>${plainProblemTitle(invoice)}</strong>
     </div>
     <div>
       <span>${t("cmp_status")}</span>
       <strong>${issueStatus(invoice)}</strong>
     </div>
   </div>

   <div class="mini-panel" style="margin-top: 14px;">
     <h4>${t("cmp_means")}</h4>
     <p>${invoiceIssueText(invoice)} ${isResolved(invoice) ? t("cmp_recheck_note", { amt: rupee(invoice.gst) }) : invoiceFixText(invoice)}</p>
   </div>

   <div class="hero-actions">
     ${needsSupplierAction(invoice) && !state.corrected[invoice.supplier] ? `<button class="btn btn-orange" onclick="markSupplierCorrected('${invoice.supplier}')">${t("mark_corrected")}</button>` : ""}
     ${needsSupplierAction(invoice) && state.corrected[invoice.supplier] && !state.rechecked ? `<button class="btn btn-primary" onclick="rerunCheck()">${t("rerun_check")}</button>` : ""}
     <a class="btn btn-ghost" href="#/report">${t("view_report")}</a>
   </div>
 `;
}

function issueStatus(invoice) {
 if (isResolved(invoice)) return t("is_recovered");
 if (isSupplierCorrected(invoice)) return t("is_corrected");
 if (state.contacted[invoice.supplier] && needsSupplierAction(invoice)) return t("is_sent");
 if (!needsSupplierAction(invoice)) return t("is_internal");
 return t("is_action");
}

function matchmakerView() {
 const problemRows = unresolvedRiskInvoices();
 const allClear = problemRows.length === 0;
 return shell(`
   ${!state.uploaded ? `<div class="friendly-alert"><strong>${t("mm_start_alert")}</strong> <a href="#/upload">${t("mm_start_alert2")}</a></div>` : ""}
   <section class="guided-card">
     <div class="flow-title">
       <span class="flow-pill">${t("mm_flowpill")}</span>
       <h2>${allClear ? t("mm_all_h") : t(problemRows.length === 1 ? "mm_found_one" : "mm_found_many", { n: problemRows.length })}</h2>
       <p>${allClear ? t("mm_all_p") : t("mm_tap_p")}</p>
     </div>
     ${recoveredAmount() > 0 ? `<div class="recovered-banner"><strong>${t("mm_recovered", { amt: rupee(recoveredAmount()) })}</strong><span>${t("mm_recovered_sub")}</span></div>` : ""}
     ${allClear
       ? `<div class="all-clear">
            <div class="all-clear-icon">✓</div>
            <h3>${t("mm_none_h")}</h3>
            <p>${t("mm_none_p")}</p>
            <a class="btn btn-primary" href="#/report">${t("d_view_report")}</a>
          </div>`
       : `<div class="problem-grid">${problemRows.map((invoice) => problemCard(invoice)).join("")}</div>`
     }
   </section>
   ${modalMarkup()}
 `);
}

function problemCard(invoice) {
 const action = needsSupplierAction(invoice) ? t("pc_send", { s: invoice.supplier }) : invoice.status === "Duplicate" ? t("pc_remove") : t("pc_review");
 return `
   <button class="problem-card" onclick="openModal('${invoice.id}', 'problem')" aria-label="Explain ${invoice.id}">
     <div class="problem-top">
       <span class="badge ${invoice.risk === "High" ? "badge-red" : "badge-amber"}">${t("rc_risk", { r: t(invoice.risk === "High" ? "b_high" : "b_needsfix") })}</span>
       <strong>${rupee(invoice.gst)}</strong>
     </div>
     <h3>${plainProblemTitle(invoice)}</h3>
     <p>${invoiceIssueText(invoice)}</p>
     <div class="problem-action">${action}</div>
   </button>
 `;
}

function problemDetail(invoice) {
 const supplierAction = needsSupplierAction(invoice);
 const resolved = isResolved(invoice);
 const resolveLabel = invoice.status === "Duplicate" ? t("pd_remove_resolve") : t("pd_review_resolve");
 return `
   <span class="badge ${resolved ? "badge-green" : invoice.risk === "High" ? "badge-red" : invoice.risk === "Medium" ? "badge-amber" : "badge-green"}">${resolved ? t("pd_resolved") : t("rc_risk", { r: t(invoice.risk === "High" ? "b_high" : invoice.risk === "Medium" ? "b_needsfix" : "b_safe") })}</span>
   <div class="big-money ${resolved ? "resolved" : ""}">${resolved ? t("pd_secured", { amt: rupee(invoice.gst) }) : t("pd_may_affect", { amt: rupee(invoice.gst) })}</div>
   <div class="answer-stack">
     <div>
       <span>${t("pd_happened")}</span>
       <strong>${invoiceIssueText(invoice)}</strong>
     </div>
     <div>
       <span>${t("pd_whycare")}</span>
       <strong>${invoice.risk === "Low" ? t("pd_safe") : t("pd_notavail")}</strong>
     </div>
     <div>
       <span>${t("pd_donow")}</span>
       <strong>${supplierAction ? t("pd_send_to", { s: invoice.supplier }) : internalActionMessage(invoice)}</strong>
     </div>
   </div>
   ${resolved
     ? `<div class="resolved-note">${t("pd_resolved_note")}</div>`
     : supplierAction
       ? `<a class="btn btn-primary btn-block" style="margin-top: 16px;" onclick="closeModal()" href="#/suppliers">${t("pd_send_msg")}</a>
          <a class="btn btn-ghost btn-block" style="margin-top: 10px;" onclick="closeModal()" href="#/reconcile">${t("pd_compare_side")}</a>`
       : `<button class="btn btn-primary btn-block" style="margin-top: 16px;" onclick="resolveInternal('${invoice.id}')">${resolveLabel}</button>
          <a class="btn btn-ghost btn-block" style="margin-top: 10px;" onclick="closeModal()" href="#/reconcile">${t("pd_compare_side")}</a>`
   }
 `;
}

function plainProblemTitle(invoice) {
 const keys = {
   "Likely Match": "ppt_likely",
   "Missing": "ppt_missing",
   "Amount Mismatch": "ppt_amount",
   "GSTIN Mismatch": "ppt_gstin",
   "Duplicate": "ppt_duplicate",
   "Blocked ITC": "ppt_blocked"
 };
 return keys[invoice.status] ? t(keys[invoice.status]) : invoice.status;
}

function invoiceIssueText(invoice) {
 const keys = {
   "Likely Match": "issue_likely",
   "Missing": "issue_missing",
   "Amount Mismatch": "issue_amount",
   "GSTIN Mismatch": "issue_gstin",
   "Duplicate": "issue_dup",
   "Blocked ITC": "issue_blocked",
   "Matched": "issue_matched"
 };
 return keys[invoice.status] ? t(keys[invoice.status]) : invoice.issue;
}

function invoiceFixText(invoice) {
 if (invoice.status === "Likely Match") return t("fix_likely", { portal: invoice.portalNo, book: invoice.bookNo });
 const keys = {
   "Missing": "fix_missing",
   "Amount Mismatch": "fix_amount",
   "GSTIN Mismatch": "fix_gstin",
   "Duplicate": "fix_dup",
   "Blocked ITC": "fix_blocked",
   "Matched": "fix_matched"
 };
 return keys[invoice.status] ? t(keys[invoice.status]) : invoice.fix;
}

function internalActionMessage(invoice) {
 if (invoice.status === "Duplicate") return t("iam_dup");
 if (invoice.status === "Blocked ITC") return t("iam_blocked");
 return invoiceFixText(invoice);
}

function suppliersView() {
 const groups = supplierGroups();
 const correctedSuppliers = Object.keys(state.corrected).filter((supplier) => state.corrected[supplier]);
 return shell(`
   <section class="guided-card">
     <div class="flow-title">
       <span class="flow-pill">${t("sp_flowpill")}</span>
       <h2>${t("sp_h")}</h2>
       <p>${t("sp_p")}</p>
     </div>
     ${correctedSuppliers.length > 0 && !state.rechecked ? `<div class="friendly-alert"><strong>${t(correctedSuppliers.length > 1 ? "sp_marked_many" : "sp_marked_one", { n: correctedSuppliers.length })}</strong> ${t("sp_rerun_hint")} <button class="btn btn-primary" style="margin-top: 12px;" onclick="rerunCheck()">${t("rerun_check")}</button></div>` : ""}
     ${recoveredAmount() > 0 ? `<div class="recovered-banner"><strong>${t("sp_recovered", { amt: rupee(recoveredAmount()) })}</strong><span>${t("sp_recovered_sub")}</span></div>` : ""}
     <div class="grid">
     ${Object.entries(groups).map(([supplier, items]) => {
       const amount = items.reduce((sum, item) => sum + item.gst, 0);
       return `
         <div class="supplier-message-card">
           <div class="supplier-row">
             <div>
               <p class="row-title">${loc(supplier)}</p>
               <p class="row-sub">${t(items.length > 1 ? "sp_issue_many" : "sp_issue_one", { n: items.length, list: items.map((item) => item.bookNo).join(", ") })}</p>
             </div>
             <div>
               <span class="badge ${state.corrected[supplier] && state.rechecked ? "badge-green" : items.some((item) => item.risk === "High") ? "badge-red" : "badge-amber"}">${state.corrected[supplier] && state.rechecked ? t("sp_recovered_badge") : state.corrected[supplier] ? t("sp_correction") : state.contacted[supplier] ? t("sp_sent") : t("sp_contact_today")}</span>
             </div>
             <strong class="amount">${rupee(amount)}</strong>
           </div>
           <div class="copy-box" style="margin-top: 14px;">${groupSupplierMessage(supplier, items)}</div>
           <button class="btn btn-orange" style="margin-top: 14px;" onclick="copySupplierGroup('${supplier}')">${t("sp_copy")}</button>
           <button class="btn btn-ghost" style="margin-top: 10px;" onclick="markSupplierCorrected('${supplier}')">${t("sp_mark")}</button>
         </div>
       `;
     }).join("")}
     ${Object.keys(groups).length === 0 ? `<div class="empty">${t("sp_empty")}</div>` : ""}
     </div>
   </section>
 `);
}

function groupSupplierMessage(supplier, items) {
 const list = items.map((item) => `${item.bookNo} (${rupee(item.gst)} GST - ${invoiceIssueText(item)})`).join("; ");
 return t("sp_msg_intro", { s: supplier, list, date: localizeDate(business.deadline) });
}

function copySupplierGroup(supplier) {
 const groups = supplierGroups();
 navigator.clipboard?.writeText(groupSupplierMessage(supplier, groups[supplier]));
 state.contacted[supplier] = true;
 save();
 showToast(t("sp_copied", { s: supplier }));
}

function filingReportView() {
 const unresolved = unresolvedRiskInvoices();
 const supplierPending = unresolved.filter(needsSupplierAction);
 const internalPending = unresolved.filter((invoice) => !needsSupplierAction(invoice));
 const safeToClaim = extraSummary.safeItc + recoveredAmount();
 const allClear = unresolved.length === 0;
 return shell(`
   <section class="guided-card">
     <div class="flow-title">
       <span class="flow-pill">${t("fr_flowpill")}</span>
       <h2>${t("fr_h")}</h2>
       <p>${t("fr_p")}</p>
     </div>

     <div class="report-grid">
       <div class="report-card green">
         <span>${t("fr_safe")}</span>
         <strong>${rupee(safeToClaim)}</strong>
         <p>${t("fr_safe_sub")}</p>
       </div>
       <div class="report-card blue">
         <span>${t("fr_recovered")}</span>
         <strong>${rupee(recoveredAmount())}</strong>
         <p>${t("fr_recovered_sub")}</p>
       </div>
       <div class="report-card ${allClear ? "green" : "red"}">
         <span>${t("fr_risk")}</span>
         <strong>${rupee(riskAmount())}</strong>
         <p>${allClear ? t("fr_nothing") : t(unresolved.length === 1 ? "fr_still_one" : "fr_still_many", { n: unresolved.length })}</p>
       </div>
     </div>

     <div class="grid grid-2" style="margin-top: 18px;">
       <div class="mini-panel">
         <h4>${t("fr_sp_pending")}</h4>
         <p>${supplierPending.length ? t(supplierPending.length === 1 ? "fr_sp_one" : "fr_sp_many", { n: supplierPending.length }) : t("fr_sp_none")}</p>
       </div>
       <div class="mini-panel">
         <h4>${t("fr_int_pending")}</h4>
         <p>${internalPending.length ? t(internalPending.length === 1 ? "fr_int_one" : "fr_int_many", { n: internalPending.length }) : t("fr_int_none")}</p>
       </div>
     </div>

     <div class="filing-decision ${allClear ? "better" : ""}">
       <span>${t("fr_reco")}</span>
       <strong>${allClear ? t("fr_ready") : t("fr_notready")}</strong>
       <p>${allClear ? t("fr_ready_p", { amt: rupee(safeToClaim), date: localizeDate(business.deadline) }) : t("fr_notready_p")}</p>
       ${allClear ? `<a class="btn btn-primary" style="margin-top: 14px;" href="#/readiness">${t("fr_goto_decision")}</a>` : `<a class="btn btn-ghost" style="margin-top: 14px;" href="#/matchmaker">${t("fr_back_fix")}</a>`}
     </div>
   </section>
 `);
}

function readinessView() {
 const score = readinessScore();
 const supplierPending = unresolvedRiskInvoices().filter(needsSupplierAction).length;
 const internalPending = internalActions().length;
 const allClear = unresolvedRiskInvoices().length === 0;
 const safeToClaim = extraSummary.safeItc + recoveredAmount();
 if (allClear) {
   return shell(`
     <section class="filing-verdict">
       <div class="verdict-main ready">
         <span class="flow-pill">${t("rd_final")}</span>
         <h2>${t("rd_yes")}</h2>
         <p>${t("rd_yes_p", { amt: rupee(safeToClaim) })}</p>
         <div class="readiness-ring">100%</div>
         <span class="muted">${t("rd_readiness")}</span>
       </div>
       <div class="guided-card">
         <div class="section-title">
           <div>
             <h2>${t("rd_allset")}</h2>
             <p class="muted">${t("rd_checklist")}</p>
           </div>
         </div>
         <div class="action-list">
           ${[
             [t("rd_safe_conf"), t("rd_safe_conf_sub", { amt: rupee(safeToClaim) })],
             [t("rd_sp_res"), t("rd_sp_res_sub")],
             [t("rd_int_rev"), t("rd_int_rev_sub")],
             [t("rd_file_before"), t("rd_file_before_sub", { date: localizeDate(business.deadline) })]
           ].map(([title, sub]) => `
             <div class="action-item">
               <div class="rank done">✓</div>
               <div><p class="row-title">${title}</p><p class="row-sub">${sub}</p></div>
             </div>
           `).join("")}
         </div>
       </div>
     </section>
   `);
 }
 return shell(`
   <section class="filing-verdict">
     <div class="verdict-main">
       <span class="flow-pill">${t("rd_final")}</span>
       <h2>${supplierPending === 0 ? t("rd_almost") : t("rd_no")}</h2>
       <p>${t("rd_unresolved", { amt: rupee(riskAmount()) })} ${recoveredAmount() > 0 ? t("rd_recovered_note", { amt: rupee(recoveredAmount()) }) : t("rd_filenow_warn")}</p>
       <div class="readiness-ring">${score}%</div>
       <span class="muted">${t("rd_readiness")}</span>
     </div>
     <div class="guided-card">
       <div class="section-title">
         <div>
           <h2>${t("rd_before_h")}</h2>
           <p class="muted">${t("rd_before_p")}</p>
         </div>
       </div>
       <div class="action-list">
         ${[
           [t(supplierPending === 1 ? "rd_fix_sp_one" : "rd_fix_sp_many", { n: supplierPending }), supplierPending ? t("rd_fix_sp_yes") : t("rd_fix_sp_no")],
           [t(internalPending === 1 ? "rd_rev_int_one" : "rd_rev_int_many", { n: internalPending }), internalPending ? t("rd_rev_int_yes") : t("rd_rev_int_no")],
           [t("rd_recheck"), t("rd_recheck_sub")],
           [t("rd_filedue"), t("rd_filedue_sub", { date: localizeDate(business.deadline) })]
         ].map(([title, sub], index) => `
           <div class="action-item">
             <div class="rank">${index + 1}</div>
             <div><p class="row-title">${title}</p><p class="row-sub">${sub}</p></div>
           </div>
         `).join("")}
       </div>
       <a class="btn btn-primary" style="margin-top: 16px;" href="#/matchmaker">${t("rd_goto_fix")}</a>
     </div>
   </section>
 `);
}

function portalPreviewView() {
 // Intentionally dense, jargon-heavy re-creation of the government GSTR-2B experience.
 // English-only and unexplained on purpose — this is the "before" that ITC Matchmaker fixes.
 const nameByGstin = {};
 purchaseRegister.forEach((b) => { nameByGstin[b.gstin] = b.supplier; });

 const rows = gstr2b.map((r, i) => {
   const rate = 18;
   const igst = 0;
   const cgst = Math.round(r.gst / 2);
   const sgst = r.gst - cgst;
   const invVal = r.taxable + r.gst;
   const itcYes = i % 3 !== 2;
   const reason = itcYes ? "—" : "Rule 37A / supplier default";
   return `
     <tr class="${itcYes ? "" : "gp-flag"}">
       <td class="gp-mono">${r.gstin}</td>
       <td>${(nameByGstin[r.gstin] || "—").toUpperCase()}</td>
       <td class="gp-mono">${r.invNo}</td>
       <td>R</td>
       <td>${r.date}-2026</td>
       <td class="gp-num">${invVal.toLocaleString("en-IN")}.00</td>
       <td>29-Karnataka</td>
       <td>${rate}%</td>
       <td class="gp-num">${r.taxable.toLocaleString("en-IN")}.00</td>
       <td class="gp-num">${igst.toFixed(2)}</td>
       <td class="gp-num">${cgst.toLocaleString("en-IN")}.00</td>
       <td class="gp-num">${sgst.toLocaleString("en-IN")}.00</td>
       <td class="gp-num">0.00</td>
       <td class="${itcYes ? "gp-yes" : "gp-no"}">${itcYes ? "Yes" : "No"}</td>
       <td class="gp-reason">${reason}</td>
     </tr>`;
 }).join("");

 const tabs = ["B2B", "B2BA", "B2B-CDNR", "B2B-CDNRA", "ISD", "ISD-A", "IMPG", "IMPG (SEZ)"];

 return `
   <div class="gp-root">
     <div class="gp-topband">
       <div class="gp-topband-inner">
         <span>Goods and Services Tax</span>
         <span class="gp-topband-links">Skip to Main Content · A+ A-  ·  English ▾  ·  Logout</span>
       </div>
     </div>
     <header class="gp-header">
       <div class="gp-emblem"><span class="gp-emblem-mark">☸</span><div><strong>GST</strong><small>Government of India</small></div></div>
       <div class="gp-userbox">
         <div>29ABCDE1234F1Z5</div>
         <div class="gp-muted">AAROHI ELECTRONICS · FY 2026-27 · Aug</div>
       </div>
     </header>
     <nav class="gp-menu">
       <span>Dashboard</span><span>Services ▾</span><span>GST Law</span><span>Downloads ▾</span><span>Search Taxpayer ▾</span><span>Help and Taxpayer Facilities</span><span>e-Invoice</span>
     </nav>
     <div class="gp-breadcrumb">Dashboard > Returns > Returns Dashboard > Auto-drafted ITC Statement GSTR-2B</div>

     <main class="gp-main">
       <div class="gp-titlebar">
         <h1>GSTR-2B  <span class="gp-muted">Auto-drafted ITC Statement</span></h1>
         <div class="gp-actions">
           <button class="gp-btn">GENERATE JSON FILE TO DOWNLOAD</button>
           <button class="gp-btn">DOWNLOAD EXCEL</button>
           <button class="gp-btn gp-btn-primary">VIEW ADVISORY</button>
         </div>
       </div>

       <div class="gp-notice">
         <strong>Advisory:</strong> ITC available in Table 4(A)(5) is provisional and subject to Section 16(2)(aa), Rule 36(4), Rule 37 and Rule 37A. Recipient must reconcile with books before availing. Values are auto-populated from supplier GSTR-1/IFF/GSTR-5. Non-availment / reversal, if any, to be reported in GSTR-3B Table 4(B). E. & O.E.
       </div>

       <div class="gp-tabs">
         ${tabs.map((name, i) => `<span class="gp-tab ${i === 0 ? "gp-tab-active" : ""}">${name}</span>`).join("")}
       </div>

       <div class="gp-summarygrid">
         <div><span class="gp-muted">No. of records</span><strong>${gstr2b.length}</strong></div>
         <div><span class="gp-muted">Taxable value (₹)</span><strong>${gstr2b.reduce((s, r) => s + r.taxable, 0).toLocaleString("en-IN")}.00</strong></div>
         <div><span class="gp-muted">Integrated tax (₹)</span><strong>0.00</strong></div>
         <div><span class="gp-muted">Central tax (₹)</span><strong>${gstr2b.reduce((s, r) => s + Math.round(r.gst / 2), 0).toLocaleString("en-IN")}.00</strong></div>
         <div><span class="gp-muted">State/UT tax (₹)</span><strong>${gstr2b.reduce((s, r) => s + (r.gst - Math.round(r.gst / 2)), 0).toLocaleString("en-IN")}.00</strong></div>
         <div><span class="gp-muted">Cess (₹)</span><strong>0.00</strong></div>
       </div>

       <div class="gp-tablewrap">
         <table class="gp-table">
           <thead>
             <tr>
               <th>GSTIN of Supplier</th><th>Trade/Legal name</th><th>Invoice no.</th><th>Type</th><th>Invoice Date</th><th>Invoice Value (₹)</th><th>Place of supply</th><th>Rate (%)</th><th>Taxable value (₹)</th><th>Integrated Tax (₹)</th><th>Central Tax (₹)</th><th>State/UT Tax (₹)</th><th>Cess (₹)</th><th>ITC avbl.</th><th>Reason</th>
             </tr>
           </thead>
           <tbody>${rows}</tbody>
         </table>
       </div>

       <p class="gp-footnote">Note: Invoices reported by your suppliers only. Missing invoices will NOT appear here. Any mismatch in invoice number, GSTIN, taxable value or tax amount must be identified and reconciled by the recipient. Availing ineligible ITC may attract interest u/s 50 and penalty. This statement does not constitute confirmation of eligibility.</p>
     </main>

     <a class="gp-return" href="#/dashboard">${t("portal_back")} (ITC Matchmaker)</a>
     <div class="gp-watermark">${t("portal_banner")}</div>
   </div>
 `;
}

function render() {
 const route = window.location.hash || "#/dashboard";
 const app = document.querySelector("#app");

 if (route === "#/portal-preview") {
   app.innerHTML = portalPreviewView();
   return;
 }

 if (!state.user || route === "#/login") {
   app.innerHTML = loginView();
   return;
 }

 const views = {
   "#/dashboard": dashboardView,
   "#/upload": uploadView,
   "#/register": registerView,
   "#/reconcile": reconcileView,
   "#/matchmaker": matchmakerView,
   "#/suppliers": suppliersView,
   "#/report": filingReportView,
   "#/readiness": readinessView
 };
 app.innerHTML = (views[route] || dashboardView)();
}

window.addEventListener("hashchange", () => {
 state.stepsOpen = false;
 state.accountOpen = false;
 state.modalInvoiceId = null;
 document.body.style.overflow = "";
 render();
 requestAnimationFrame(() => {
   window.scrollTo({ top: 0, left: 0, behavior: "auto" });
   document.querySelector(".main")?.scrollTo({ top: 0, left: 0, behavior: "auto" });
 });
});
if (!window.location.hash) window.location.hash = state.user ? "#/dashboard" : "#/login";
document.documentElement.lang = state.lang;
render();
requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
 