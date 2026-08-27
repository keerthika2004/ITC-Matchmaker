const DEMO_EMAIL = "owner@demo.in";
const DEMO_PASSWORD = "demo123";

const state = {
    user: JSON.parse(localStorage.getItem("itc-user") || "null"),
    uploaded: localStorage.getItem("itc-uploaded") === "true",
    contacted: JSON.parse(localStorage.getItem("itc-contacted") || "[]"),
    corrected: JSON.parse(localStorage.getItem("itc-corrected") || "{}"),
    resolved: JSON.parse(localStorage.getItem("itc-resolved") || "0"),
    rechecked: localStorage.getItem("itc-rechecked") === "true",
    modalInvoiceld: null,
    modalType: "reconcile",
    stepsopen: false,
    accountopen: false,
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

const purchaseRegister = [
    { id: "INV-101", supplier: "Kumar Traders", gstin: "29KUMAR1234F1Z2", invNo: "INV-101", date: "04 AUG", taxable: 42000, gst: 7560 },
    { id: "INV-203", supplier: "Kumar Traders", gstin: "29KUMAR1234F1Z2", invNo: "INV-203", date: "12 AUG", taxable: 46667, gst: 8400 },
    { id: "KR-1129", supplier: "Kumar Traders", gstin: "29KUMAR1234F1Z2", invNo: "KR-1129", date: "18 AUG", taxable: 52000, gst: 9360 },
    { id: "SC-881", supplier: "Shakti Components", gstin: "29SHAKTI5678L1Z7", invNo: "SC-881", date: "08 AUG", taxable: 62222, gst: 11200 },
    { id: "ME-442", supplier: "Metro Electronics", gstin: "29METRO2456Q1Z8", invNo: "ME-442", date: "15 AUG", taxable: 70000, gst: 12600 },
    { id: "SIL-207", supplier: "South India Logistics", gstin: "29SILOG1111K1Z1", invNo: "SIL-207", date: "19 AUG", taxable: 30000, gst: 5400, blocked: true, blockReason: "a personal vehicle-related expense" },
    { id: "BP-710", supplier: "Bright Packaging", gstin: "29BRIGH9988D1Z3", invNo: "BP-710", date: "21 Aug", taxable: 21667, gst: 3900 },
    { id: "BP-710b", supplier: "Bright Packaging", gstin: "29BRIGH9988D1Z3", invNo: "BP-710", date: "21 Aug", taxable: 21667, gst: 3900 },
    { id: "SC-910", supplier: "Shakti Components", gstin: "29SHAKT5678L127", invNo: "SC-910", date: "24 Aug", taxable: 50000, gst: 9000 },
    { id: "ML-330", supplier: "Mysore Lights", gstin: "29MYSOR7788P1Z4", invNo: "ML-330", date: "26 Aug", taxable: 27000, gst: 4860 },
    { id: "ME-509", supplier: "Metro Eletronics", gstin: "29METRO2456Q1Z8", invNo: "ME-509", date: "29 Aug", taxable: 22222, gst: 4000 }
];

const gstr2b = [
    { gstin: "29KUMAR1234F1Z2", invNo: "INV-101", date: "04 AUG", taxable: 42000, gst: 7560 },
    { gstin: "29KUMAR1234F1Z2", invNo: "INV-230", date: "12 AUG", taxable: 46667, gst: 8400 },
    { gstin: "29SHAKTI5678L1Z7", invNo: "SC-881", date: "08 AUG", taxable: 51111, gst: 9200 },
    { gstin: "29METRO2456Q1Z8", invNo: "ME-442", date: "15 AUG", taxable: 70000, gst: 12600 },
    { gstin: "29SILOG1111K1Z1", invNo: "SIL-207", date: "19 AUG", taxable: 30000, gst: 5400 },
    { gstin: "29BRIGH9988D1Z3", invNo: "BP-710", date: "21 Aug", taxable: 21667, gst: 3900 },
    { gstin: "29MYSOR7788P9Z9", invNo: "ML-330", date: "26 Aug", taxable: 27000, gst: 4860 },
    { gstin: "29METRO2456Q1Z8", invNo: "ME-509", date: "29 Aug", taxable: 22222, gst: 4000 }
];

function normInv(inv) {
    return String(inv).toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function levenshtein(a, b) {
    const m = a.length, n = b.length;
    const d = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
    for (let i = 0; i <= m; i++) d[i][0] = i;
    for (let j = 0; j <= n; j++) d[0][j] = j;
    for (let i = 1; i <= m; i++) {
        for (let j = 1; j <= n; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(
                d[i - 1][j] + 1,      // deletion
                d[i][j - 1] + 1,      // insertion
                d[i - 1][j - 1] + cost // substitution
            );
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
    ["#/dashboard", "Start Here", "1"],
    ["#/upload", "Upload Bills", "2"],
    ["#/register", "Purchase Register", "3"],
    ["#/reconcile", "Reconcile", "4"],
    ["#/matchmaker", "Fix Problems", "5"],
    ["#/suppliers", "Send Messages", "6"],
    ["#/report", "Filing Report", "7"],
    ["#/readiness", "Can I File?", "8"]
];

const flowSteps = [
    ["#/dashboard", "Start"],
    ["#/upload", "Import"],
    ["#/register", "Review"],
    ["#/reconcile", "Compare"],
    ["#/matchmaker", "Fix"],
    ["#/suppliers", "Contact"],
    ["#/report", "Report"],
    ["#/readiness", "Decision"]
];

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
    if (invoice.status === "Matched") return `<span class="badge badge-green">Safe</span>`;
    if (invoice.risk === "High") return `<span class="badge badge-red">High risk</span>`;
    if (invoice.risk === "Medium") return `<span class="badge badge-amber">Needs fix</span>`;
    return `<span class="badge badge-blue">${invoice.status}</span>`;
}

function pageTitle(route) {
    const titles = {
        "#/dashboard": ["Can you safely file GST this month?", "See what money is safe, what money is stuck, and what to do next."],
        "#/upload": ["Import purchase bills", "Upload your purchase register and compare it with supplier GST records."],
        "#/register": ["Purchase register", "Review the bills you imported before checking ITC problems."],
        "#/reconcile": ["Reconciliation room", "See your purchase bill and the supplier GST record side by side."],
        "#/matchmaker": ["Fix ITC problems", "Each problem is translated into simple language and one clear action."],
        "#/suppliers": ["Send supplier messages", "Ready-to-copy messages for only the problems suppliers can actually fix."],
        "#/report": ["Filing report", "See recovered credit, remaining risk, and what is still pending."],
        "#/readiness": ["Can I file now?", "A simple filing recommendation before you submit GSTR-3B."]
    };
    return titles[route] || titles["#/dashboard"];
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
       <strong>Step ${index + 1} of ${flowSteps.length}: ${flowSteps[index][1]}</strong>
       <span>${percent}% complete</span>
     </div>
     <div class="flow-progress-bar"><div style="width: ${percent}%"></div></div>
     <div class="flow-progress-steps">
       ${flowSteps.map(([href, label], stepIndex) => `<a href="${href}" class="${stepIndex === index ? "active" : stepIndex < index ? "done" : ""}">${stepIndex + 1}. ${label}</a>`).join("")}
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
    const nextLabel = index === 0 ? "Start importing bills" : index === flowSteps.length - 1 ? "Back to start" : `Continue to ${next[1]}`;
    const nextHref = index === flowSteps.length - 1 ? "#/dashboard" : next?.[0];
    return `
   <section class="flow-footer">
     <div>
       <strong>${index === flowSteps.length - 1 ? "Workflow complete" : "Next step"}</strong>
       <p>${footerHint(index)}</p>
     </div>
     <div class="flow-footer-actions">
       ${prev ? `<a class="btn btn-ghost" href="${prev[0]}">Back</a>` : ""}
       ${importBlocked ? `<button class="btn btn-primary" disabled>Import purchase register to continue</button>` : nextHref ? `<a class="btn btn-primary" href="${nextHref}">${nextLabel}</a>` : ""}
     </div>
   </section>
 `;
}

function footerHint(index) {
    const hints = [
        "Start by importing your August purchase register.",
        state.uploaded ? "Next, review what the system read from your file." : "Import the purchase register on this page to unlock the next step.",
        "Next, compare your purchase records with supplier GSTR-2B records.",
        "Then review the issues in simple language.",
        "After understanding issues, send supplier messages.",
        "After supplier actions, review your filing report.",
        "Use the report to make the final filing decision.",
        "You can return to any previous step if needed."
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
    document.querySelector("#login-error").innerHTML = "Enter the email and password for this business account.";
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
    showToast("Imported file cleared. You can import a new purchase register.");
}

function markSupplierCorrected(supplier) {
    state.corrected[supplier] = true;
    state.rechecked = false;
    save();
    showToast(`${supplier} marked corrected. Re-run ITC check to confirm recovery.`);
}

function resolveInternal(id) {
    const invoice = invoices.find((item) => item.id === id);
    state.resolved[id] = true;
    save();
    closeModal();
    showToast(`${invoice.bookNo} marked as resolved.`);
}

function rerunCheck() {
    state.rechecked = true;
    save();
    showToast(`${rupee(recoveredAmount())} recovered after recheck.`);
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
         <div class="logo"><span class="logo-mark" aria-hidden="true"><span class="logo-doc logo-doc-back"></span><span class="logo-doc logo-doc-front"></span><span class="logo-check"></span></span><span>ITC Matchmaker</span></div>
         <h2>Sign in to your GST workspace</h2>
         <p class="muted">Check whether your Input Tax Credit is safe before filing this month.</p>
         <div class="form-field">
           <label for="email">Email</label>
           <input class="input" id="email" name="email" placeholder="owner@business.in" autocomplete="username" value="${DEMO_EMAIL}" />
         </div>
         <div class="form-field">
           <label for="password">Password</label>
           <input class="input" id="password" name="password" placeholder="Enter password" type="password" autocomplete="current-password" value="${DEMO_PASSWORD}" />
         </div>
         <button class="btn btn-primary btn-block" style="margin-top: 20px;">Continue</button>
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
         <strong>${business.name}</strong>
         <small>${business.gstin}</small>
         <small>${business.period} return</small>
       </div>
       <nav class="nav">
         ${navItems.map(([href, label, icon]) => `<a class="${route === href ? "active" : ""}" href="${href}" onclick="closeSteps()"><span>${icon}</span>${label}</a>`).join("")}
       </nav>
       <div class="side-note">
         <strong>Product promise</strong>
         <span>No GST jargon. Just money, reason, action.</span>
       </div>
       <button class="btn btn-ghost btn-block" style="margin-top: 10px;" onclick="logout()">Logout</button>
     </aside>
     <main class="main">
       <div class="mobile-account-bar">
         <div class="mobile-brand">
           <span class="logo-mark" aria-hidden="true"><span class="logo-doc logo-doc-back"></span><span class="logo-doc logo-doc-front"></span><span class="logo-check"></span></span>
           <strong class="brand-name">ITC Matchmaker</strong>
         </div>
         <button class="account-trigger ${state.accountOpen ? "open" : ""}" onclick="toggleAccountMenu()" aria-expanded="${state.accountOpen ? "true" : "false"}" aria-label="Account menu">
           <span class="account-avatar-sm">AE</span>
           <span class="account-caret"></span>
         </button>
         ${state.accountOpen ? `
           <div class="account-dropdown">
             <div class="account-dropdown-head">
               <span class="account-avatar">AE</span>
               <div class="account-details">
                 <strong>${business.name}</strong>
                 <span>${business.gstin}</span>
                 <span>${state.user?.email || DEMO_EMAIL}</span>
               </div>
             </div>
             <button class="account-logout" onclick="logout()">
               <span class="account-logout-icon"></span>
               Log out
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
         <span class="badge badge-amber deadline-badge">GSTR-3B due date: ${business.deadline}</span>
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
        .map(([supplier, items]) => ({ type: "supplier", title: `Contact ${supplier}`, supplier, count: items.length, amount: items.reduce((sum, item) => sum + item.gst, 0), high: items.some((item) => item.risk === "High") }));
    const reviewActions = internalActions().map((invoice) => ({
        type: "review",
        title: invoice.status === "Duplicate" ? `Remove duplicate ${invoice.bookNo}` : `Review ${invoice.bookNo}`,
        count: 1,
        amount: invoice.gst,
        high: invoice.risk === "High",
        helper: invoice.status === "Duplicate" ? "Internal purchase book issue. Supplier cannot fix this." : "This may be blocked credit. Review before claiming."
    }));
    const topActions = [...supplierActions, ...reviewActions].sort((a, b) => b.amount - a.amount).slice(0, 5);
    const allClear = unresolvedRiskInvoices().length === 0;
    const safeToClaim = extraSummary.safeItc + recoveredAmount();

    return shell(`
   <section class="story-hero ${allClear ? "hero-ready" : ""}">
     <div>
       <span class="eyebrow light">${business.name} - August GST return</span>
       <h2>${allClear ? `You are ready to file. ${rupee(safeToClaim)} is safe to claim.` : `Do not file yet. ${rupee(riskAmount())} of tax credit needs attention.`}</h2>
       <p>${allClear ? "All supplier mismatches and internal items have been handled. Review the filing report and submit before the due date." : "You already paid this GST to suppliers. If supplier records do not match, you may have to pay this amount again in cash or face questions later."}</p>
       <div class="hero-actions">
         ${allClear
            ? `<a class="btn btn-orange" href="#/report">View filing report</a><a class="btn btn-light" href="#/readiness">Filing decision</a>`
            : `<a class="btn btn-orange" href="#/upload">${state.uploaded ? "Review uploaded bills" : "Start with your bills"}</a><a class="btn btn-light" href="#/reconcile">See what mismatched</a>`
        }
       </div>
     </div>
     <div class="verdict-card">
       <span>${allClear ? "Filing status" : "Cash impact"}</span>
       <strong>${allClear ? "Ready to file" : `${rupee(riskAmount())} could be paid again`}</strong>
       <p>${allClear ? "All ITC problems resolved." : "Use the filing check later for the final yes/no decision."}</p>
     </div>
   </section>

   <section class="money-strip">
     <div class="money-card safe-money">
       <span>Safe money</span>
       <strong>${rupee(safeToClaim)}</strong>
       <p>Invoices matched or recovered.</p>
     </div>
     <div class="money-card ${allClear ? "safe-money" : "danger-money"}">
       <span>${allClear ? "Cleared" : "Stuck money"}</span>
       <strong>${rupee(riskAmount())}</strong>
       <p>${allClear ? "Nothing pending before filing." : "Needs fixing before filing."}</p>
     </div>
     <div class="money-card neutral-money">
       <span>Next step</span>
       <strong>${allClear ? "File GSTR-3B" : `${Object.keys(groups).length} suppliers`}</strong>
       <p>${allClear ? "Submit before " + business.deadline + "." : `Send messages + review ${internalActions().length} internal issues.`}</p>
     </div>
   </section>

   ${allClear
            ? `<section class="guided-card" style="margin-top: 18px;">
          <div class="all-clear">
            <div class="all-clear-icon">✓</div>
            <h3>Every ITC problem is resolved</h3>
            <p>You protected ${rupee(riskAmountOriginal())} of tax credit that was at risk.</p>
            <a class="btn btn-primary" href="#/report">View filing report</a>
          </div>
        </section>`
            : `<section class="guided-card" style="margin-top: 18px;">
          <div class="section-title">
            <div>
              <h2>Your action plan</h2>
              <p class="muted">This is the only list you need before filing.</p>
            </div>
            <a class="btn btn-primary" href="#/matchmaker">Explain each issue</a>
          </div>
          <div class="simple-actions">
            ${topActions.map((item, index) => `
              <div class="plain-action">
                <div class="rank big-rank">${index + 1}</div>
                <div>
                  <p class="row-title">${item.title}</p>
                  <p class="row-sub">${item.helper || `${item.count} supplier-fixable mismatch${item.count > 1 ? "es" : ""}. ${item.high ? "High urgency." : "Medium urgency."}`}</p>
                </div>
                <strong class="amount">${rupee(item.amount)}</strong>
              </div>
            `).join("")}
          </div>
        </section>`
        }

   <section class="explain-band">
     <div><strong>What is happening?</strong><span>Some purchase bills do not match supplier GST records.</span></div>
     <div><strong>Why should you care?</strong><span>Mismatch can block credit and hurt cashflow.</span></div>
     <div><strong>What does the app do?</strong><span>Finds the issue and writes the supplier message.</span></div>
     <div><strong>Why 20 September?</strong><span>For an August monthly return, GSTR-3B is due in the next month.</span></div>
   </section>
 `);
}

function uploadView() {
    const importStatus = state.uploaded ? `Imported ${invoices.length} invoices from August purchase register` : "No purchase register imported for August yet";
    return shell(`
   <section class="guided-card">
     <div class="flow-title">
       <span class="flow-pill">Import</span>
       <h2>Import your August purchase register.</h2>
       <p>Upload the bills from your accounting software. ITC Matchmaker checks whether suppliers reported the same invoices correctly.</p>
     </div>
     <div class="grid grid-2">
       <div class="upload-zone simple-upload">
       <div>
         <div class="upload-icon">Bills</div>
         <h2>August_Purchase_Bills.xlsx</h2>
         <p class="muted">${invoices.length} purchase invoices with supplier name, GSTIN, invoice number, date, taxable value, GST amount, and total bill value.</p>
         <div class="import-status">${importStatus}</div>
         <button class="btn btn-orange" onclick="state.uploaded = true; save(); showToast('Purchase register imported.'); window.location.hash = '#/register';">${state.uploaded ? "Open purchase register" : "Import purchase register"}</button>
         ${state.uploaded ? `<button class="btn btn-ghost btn-block" style="margin-top: 10px;" onclick="resetDemo(); window.location.hash = '#/upload';">Replace imported file</button>` : ""}
         <div class="file-rules">
           <span>Accepted: XLSX or CSV</span>
           <span>Works with exports from Tally, Zoho Books, Busy, Vyapar, or any purchase register</span>
         </div>
       </div>
       </div>
       <div class="simple-explainer">
       <h2>What the system checks</h2>
       ${[
            ["1", "We check if suppliers uploaded your bills."],
            ["2", "We find bills with wrong amount, wrong number, or missing records."],
            ["3", "We tell you who to contact and what message to send."],
            ["4", "We answer: can you safely file GST now?"]
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
   ${!state.uploaded ? `<div class="friendly-alert"><strong>No file imported yet.</strong> Start from <a href="#/upload">Import purchase bills</a> to load your purchase register.</div>` : ""}
   <section class="guided-card">
     <div class="flow-title">
       <span class="flow-pill">Review file</span>
       <h2>Check the purchase bills that were imported.</h2>
       <p>This is your purchase register. The app reads these invoice fields and compares them with supplier GST records.</p>
     </div>

     <div class="register-summary">
       <div>
         <span>File imported</span>
         <strong>August_Purchase_Bills.xlsx</strong>
         <p>Source: accounting software export</p>
       </div>
       <div>
         <span>Rows found</span>
         <strong>${invoices.length}</strong>
         <p>${matchedCount} auto-matched with GSTR-2B</p>
       </div>
       <div>
         <span>Total bill value</span>
         <strong>${rupee(totalValue)}</strong>
         <p>Taxable value plus GST</p>
       </div>
       <div>
         <span>GST credit in file</span>
         <strong>${rupee(extraSummary.totalItc)}</strong>
         <p>Checked against supplier records</p>
       </div>
     </div>

     <div class="mapped-fields">
       <strong>Fields detected:</strong>
       <span>Supplier</span>
       <span>GSTIN</span>
       <span>Invoice No.</span>
       <span>Date</span>
       <span>Taxable value</span>
       <span>GST amount</span>
       <span>Total value</span>
     </div>

     <div class="section-title" style="margin-top: 22px;">
       <div>
         <h2>Imported bills</h2>
         <p class="muted">Open any flagged bill to see why it may affect your ITC.</p>
       </div>
       <a class="btn btn-primary" href="#/reconcile">Compare with GSTR-2B</a>
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
    const action = invoice.risk === "Low" ? "Safe to claim" : resolved ? "Resolved" : "Review";
    const badge = resolved ? `<span class="badge badge-green">Resolved</span>` : statusBadge(invoice);
    return `
   <button class="reg-card" onclick="openModal('${invoice.id}', 'reconcile')">
     <div class="reg-card-head">
       <div class="reg-id">
         <strong>${invoice.bookNo}</strong>
         <span>${invoice.supplier} · ${invoice.date}</span>
       </div>
       ${badge}
     </div>
     <div class="reg-card-body">
       <div><span>GSTIN</span><b>${invoice.supplierGstin}</b></div>
       <div><span>Taxable</span><b>${rupee(invoice.taxable)}</b></div>
       <div><span>GST</span><b>${rupee(invoice.gst)}</b></div>
       <div><span>Total</span><b>${rupee(total)}</b></div>
     </div>
     <div class="reg-card-foot">
       <span class="reg-note">${invoice.risk === "Low" ? "Matches supplier record" : plainProblemTitle(invoice)}</span>
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
       <span class="flow-pill">Compare records</span>
       <h2>Now see exactly what did not match.</h2>
       <p>Tap any bill to compare your purchase register against the supplier-reported GSTR-2B record.</p>
     </div>

     <div class="reconcile-grid">
       ${rows.map((invoice) => `
         <button class="reconcile-item" onclick="openModal('${invoice.id}', 'reconcile')">
           <div class="reconcile-item-top">
             <span class="badge ${isResolved(invoice) ? "badge-green" : invoice.risk === "High" ? "badge-red" : "badge-amber"}">${isResolved(invoice) ? "Recovered" : invoice.risk + " risk"}</span>
             <strong>${rupee(invoice.gst)}</strong>
           </div>
           <strong class="reconcile-item-id">${invoice.bookNo}</strong>
           <p>${plainProblemTitle(invoice)}</p>
           <span class="reconcile-item-cta">Compare records</span>
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
         <span class="mini-label">${isReconcile ? "Reconciliation" : "Problem details"}</span>
         <h3>${invoice.bookNo} · ${invoice.supplier}</h3>
       </div>
       <button class="modal-close" onclick="closeModal()" aria-label="Close">×</button>
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
        { label: "Invoice no.", you: invoice.bookNo, portal: missing ? "Not filed" : invoice.portalNo, mismatch: missing || normInv(invoice.bookNo) !== normInv(invoice.portalNo) },
        { label: "GSTIN", you: invoice.supplierGstin, portal: missing ? "—" : invoice.portalGstin, mismatch: missing || invoice.portalGstin !== invoice.supplierGstin },
        { label: "Date", you: invoice.date, portal: missing ? "—" : invoice.portalDate, mismatch: missing || invoice.portalDate !== invoice.date },
        { label: "GST amount", you: rupee(invoice.gst), portal: invoice.portalGst == null ? "—" : rupee(invoice.portalGst), mismatch: missing || (invoice.portalGst != null && invoice.portalGst !== invoice.gst) }
    ];
    return `
   <div class="compare-table">
     <div class="compare-thead">
       <span></span>
       <span>Your register</span>
       <span>GSTR-2B</span>
     </div>
     ${fields.map((f) => `
       <div class="compare-trow ${f.mismatch ? "mismatch" : "ok"}">
         <span class="compare-field">${f.label}</span>
         <span class="compare-you">${f.you}</span>
         <span class="compare-portal">${f.portal}</span>
       </div>
     `).join("")}
   </div>

   <div class="match-verdict">
     <div>
       <span>Match confidence</span>
       <strong>${invoice.confidence}%</strong>
     </div>
     <div>
       <span>Problem</span>
       <strong>${plainProblemTitle(invoice)}</strong>
     </div>
     <div>
       <span>Current status</span>
       <strong>${issueStatus(invoice)}</strong>
     </div>
   </div>

   <div class="mini-panel" style="margin-top: 14px;">
     <h4>What this means</h4>
     <p>${invoice.issue} ${isResolved(invoice) ? `This issue was rechecked and ${rupee(invoice.gst)} is now treated as recovered.` : invoice.fix}</p>
   </div>

   <div class="hero-actions">
     ${needsSupplierAction(invoice) && !state.corrected[invoice.supplier] ? `<button class="btn btn-orange" onclick="markSupplierCorrected('${invoice.supplier}')">Mark supplier corrected</button>` : ""}
     ${needsSupplierAction(invoice) && state.corrected[invoice.supplier] && !state.rechecked ? `<button class="btn btn-primary" onclick="rerunCheck()">Re-run ITC check</button>` : ""}
     <a class="btn btn-ghost" href="#/report">View filing report</a>
   </div>
 `;
}

function issueStatus(invoice) {
    if (isResolved(invoice)) return "Recovered after recheck";
    if (isSupplierCorrected(invoice)) return "Supplier corrected - recheck pending";
    if (state.contacted[invoice.supplier] && needsSupplierAction(invoice)) return "Message sent";
    if (!needsSupplierAction(invoice)) return "Internal review needed";
    return "Action needed";
}

function matchmakerView() {
    const problemRows = unresolvedRiskInvoices();
    const allClear = problemRows.length === 0;
    return shell(`
   ${!state.uploaded ? `<div class="friendly-alert"><strong>Start here:</strong> You can explore results now, but the normal flow starts from <a href="#/upload">Upload Bills</a>.</div>` : ""}
   <section class="guided-card">
     <div class="flow-title">
       <span class="flow-pill">Prioritise fixes</span>
       <h2>${allClear ? "All problems resolved." : `The app found ${problemRows.length} problem${problemRows.length === 1 ? "" : "s"}. Start with the money at highest risk.`}</h2>
       <p>${allClear ? "Every risky invoice has been fixed or reviewed. You are ready to check your filing report." : "Tap any problem to see what happened, why it matters, and what to do."}</p>
     </div>
     ${recoveredAmount() > 0 ? `<div class="recovered-banner"><strong>${rupee(recoveredAmount())} recovered</strong><span>after supplier correction and recheck.</span></div>` : ""}
     ${allClear
            ? `<div class="all-clear">
            <div class="all-clear-icon">✓</div>
            <h3>No pending ITC problems</h3>
            <p>All supplier mismatches and internal items have been handled.</p>
            <a class="btn btn-primary" href="#/report">View filing report</a>
          </div>`
            : `<div class="problem-grid">${problemRows.map((invoice) => problemCard(invoice)).join("")}</div>`
        }
   </section>
   ${modalMarkup()}
 `);
}

function problemCard(invoice) {
    const action = needsSupplierAction(invoice) ? `Send message to ${invoice.supplier}` : invoice.status === "Duplicate" ? "Remove duplicate bill" : "Review before claiming";
    return `
   <button class="problem-card" onclick="openModal('${invoice.id}', 'problem')" aria-label="Explain ${invoice.id}">
     <div class="problem-top">
       <span class="badge ${invoice.risk === "High" ? "badge-red" : "badge-amber"}">${invoice.risk} risk</span>
       <strong>${rupee(invoice.gst)}</strong>
     </div>
     <h3>${plainProblemTitle(invoice)}</h3>
     <p>${invoice.issue}</p>
     <div class="problem-action">${action}</div>
   </button>
 `;
}

function problemDetail(invoice) {
    const supplierAction = needsSupplierAction(invoice);
    const resolved = isResolved(invoice);
    const resolveLabel = invoice.status === "Duplicate" ? "Remove duplicate & resolve" : "Mark as reviewed & resolve";
    return `
   <span class="badge ${resolved ? "badge-green" : invoice.risk === "High" ? "badge-red" : invoice.risk === "Medium" ? "badge-amber" : "badge-green"}">${resolved ? "Resolved" : invoice.risk + " risk"}</span>
   <div class="big-money ${resolved ? "resolved" : ""}">${resolved ? `${rupee(invoice.gst)} secured` : `${rupee(invoice.gst)} may be affected`}</div>
   <div class="answer-stack">
     <div>
       <span>What happened?</span>
       <strong>${invoice.issue}</strong>
     </div>
     <div>
       <span>Why care?</span>
       <strong>${invoice.risk === "Low" ? "This credit looks safe." : "This money may not be available when you file GST."}</strong>
     </div>
     <div>
       <span>Do this now</span>
       <strong>${supplierAction ? `Send a message to ${invoice.supplier}.` : internalActionMessage(invoice)}</strong>
     </div>
   </div>
   ${resolved
            ? `<div class="resolved-note">This issue is marked resolved and counted as safe in your filing report.</div>`
            : supplierAction
                ? `<a class="btn btn-primary btn-block" style="margin-top: 16px;" onclick="closeModal()" href="#/suppliers">Send supplier message</a>
          <a class="btn btn-ghost btn-block" style="margin-top: 10px;" onclick="closeModal()" href="#/reconcile">Compare records side by side</a>`
                : `<button class="btn btn-primary btn-block" style="margin-top: 16px;" onclick="resolveInternal('${invoice.id}')">${resolveLabel}</button>
          <a class="btn btn-ghost btn-block" style="margin-top: 10px;" onclick="closeModal()" href="#/reconcile">Compare records side by side</a>`
        }
 `;
}

function plainProblemTitle(invoice) {
    const titles = {
        "Likely Match": "Same bill, wrong number",
        "Missing": "Supplier has not uploaded bill",
        "Amount Mismatch": "GST amount does not match",
        "GSTIN Mismatch": "Supplier GST number mismatch",
        "Duplicate": "Bill repeated in your file",
        "Blocked ITC": "Credit may not be allowed"
    };
    return titles[invoice.status] || invoice.status;
}

function internalActionMessage(invoice) {
    if (invoice.status === "Duplicate") {
        return `This invoice appears duplicated in your purchase book. Remove the duplicate entry before filing so you do not accidentally claim the same ITC twice.`;
    }
    if (invoice.status === "Blocked ITC") {
        return `This credit may be blocked or not allowed. Do not claim it blindly. Review it before filing and keep it separate from supplier-fixable mismatches.`;
    }
    return invoice.fix;
}

function suppliersView() {
    const groups = supplierGroups();
    const correctedSuppliers = Object.keys(state.corrected).filter((supplier) => state.corrected[supplier]);
    return shell(`
   <section class="guided-card">
     <div class="flow-title">
       <span class="flow-pill">Contact suppliers</span>
       <h2>You do not need to explain GST mismatches manually.</h2>
       <p>The app writes simple supplier messages and groups multiple problems into one note.</p>
     </div>
     ${correctedSuppliers.length > 0 && !state.rechecked ? `<div class="friendly-alert"><strong>${correctedSuppliers.length} supplier${correctedSuppliers.length > 1 ? "s" : ""} marked corrected.</strong> Re-run the ITC check to confirm recovered credit. <button class="btn btn-primary" style="margin-top: 12px;" onclick="rerunCheck()">Re-run ITC check</button></div>` : ""}
     ${recoveredAmount() > 0 ? `<div class="recovered-banner"><strong>${rupee(recoveredAmount())} recovered</strong><span>Supplier corrections are now reflected in the filing report.</span></div>` : ""}
     <div class="grid">
     ${Object.entries(groups).map(([supplier, items]) => {
        const amount = items.reduce((sum, item) => sum + item.gst, 0);
        return `
         <div class="supplier-message-card">
           <div class="supplier-row">
             <div>
               <p class="row-title">${supplier}</p>
               <p class="row-sub">${items.length} issue${items.length > 1 ? "s" : ""}: ${items.map((item) => item.bookNo).join(", ")}</p>
             </div>
             <div>
               <span class="badge ${state.corrected[supplier] && state.rechecked ? "badge-green" : items.some((item) => item.risk === "High") ? "badge-red" : "badge-amber"}">${state.corrected[supplier] && state.rechecked ? "Recovered" : state.corrected[supplier] ? "Correction received" : state.contacted[supplier] ? "Message sent" : "Contact today"}</span>
             </div>
             <strong class="amount">${rupee(amount)}</strong>
           </div>
           <div class="copy-box" style="margin-top: 14px;">${groupSupplierMessage(supplier, items)}</div>
           <button class="btn btn-orange" style="margin-top: 14px;" onclick="copySupplierGroup('${supplier}')">Copy supplier message</button>
           <button class="btn btn-ghost" style="margin-top: 10px;" onclick="markSupplierCorrected('${supplier}')">Mark supplier corrected</button>
         </div>
       `;
    }).join("")}
     ${Object.keys(groups).length === 0 ? `<div class="empty">No supplier actions pending. Go to the filing report to review remaining internal items.</div>` : ""}
     </div>
   </section>
 `);
}

function groupSupplierMessage(supplier, items) {
    const list = items.map((item) => `${item.bookNo} (${rupee(item.gst)} GST - ${item.issue})`).join("; ");
    return `Hi ${supplier}, we found GST mismatches affecting our ITC: ${list}. Could you please check your GSTR-1 records and correct these before ${business.deadline}? Thank you.`;
}

function copySupplierGroup(supplier) {
    const groups = supplierGroups();
    navigator.clipboard?.writeText(groupSupplierMessage(supplier, groups[supplier]));
    state.contacted[supplier] = true;
    save();
    showToast(`${supplier} message copied.`);
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
       <span class="flow-pill">Filing report</span>
       <h2>Your filing report is ready.</h2>
       <p>This report shows what improved after supplier corrections and what is still risky before GSTR-3B filing.</p>
     </div>

     <div class="report-grid">
       <div class="report-card green">
         <span>Safe to claim now</span>
         <strong>${rupee(safeToClaim)}</strong>
         <p>Matched ITC plus recovered supplier corrections.</p>
       </div>
       <div class="report-card blue">
         <span>Recovered after recheck</span>
         <strong>${rupee(recoveredAmount())}</strong>
         <p>Supplier fixes confirmed by re-running the check.</p>
       </div>
       <div class="report-card ${allClear ? "green" : "red"}">
         <span>Still at risk</span>
         <strong>${rupee(riskAmount())}</strong>
         <p>${allClear ? "Nothing pending. All issues handled." : `${unresolved.length} invoice${unresolved.length === 1 ? "" : "s"} still need action.`}</p>
       </div>
     </div>

     <div class="grid grid-2" style="margin-top: 18px;">
       <div class="mini-panel">
         <h4>Supplier action pending</h4>
         <p>${supplierPending.length ? `${supplierPending.length} invoice${supplierPending.length === 1 ? "" : "s"} still need supplier correction.` : "No supplier actions pending."}</p>
       </div>
       <div class="mini-panel">
         <h4>Internal review pending</h4>
         <p>${internalPending.length ? `${internalPending.length} invoice${internalPending.length === 1 ? "" : "s"} should be reviewed internally before claiming.` : "No internal review pending."}</p>
       </div>
     </div>

     <div class="filing-decision ${allClear ? "better" : ""}">
       <span>Recommendation</span>
       <strong>${allClear ? "You are ready to file GSTR-3B." : "Do not file yet."}</strong>
       <p>${allClear ? `All ITC problems are resolved. You can safely claim ${rupee(safeToClaim)} and file before ${business.deadline}.` : "Resolve the remaining problems on the Fix Problems step, then re-check here."}</p>
       ${allClear ? `<a class="btn btn-primary" style="margin-top: 14px;" href="#/readiness">Go to filing decision</a>` : `<a class="btn btn-ghost" style="margin-top: 14px;" href="#/matchmaker">Back to Fix Problems</a>`}
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
         <span class="flow-pill">Final answer</span>
         <h2>Yes. You are ready to file.</h2>
         <p>All ITC problems are resolved. You can safely claim ${rupee(safeToClaim)} this month.</p>
         <div class="readiness-ring">100%</div>
         <span class="muted">filing readiness</span>
       </div>
       <div class="guided-card">
         <div class="section-title">
           <div>
             <h2>You are all set</h2>
             <p class="muted">A quick final checklist before you submit GSTR-3B.</p>
           </div>
         </div>
         <div class="action-list">
           ${[
                ["Safe ITC confirmed", `${rupee(safeToClaim)} is matched and ready to claim.`],
                ["Supplier issues resolved", "All supplier mismatches were corrected and rechecked."],
                ["Internal items reviewed", "Duplicates and blocked credits have been handled."],
                ["File before due date", `Submit GSTR-3B before ${business.deadline}.`]
            ].map(([title, sub], index) => `
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
       <span class="flow-pill">Final answer</span>
       <h2>${supplierPending === 0 ? "Almost ready. Review internal items." : "No. You should not file yet."}</h2>
       <p>${rupee(riskAmount())} is still unresolved. ${recoveredAmount() > 0 ? `${rupee(recoveredAmount())} has been recovered after recheck.` : "Filing now may create extra cash payment or future questions."}</p>
       <div class="readiness-ring">${score}%</div>
       <span class="muted">filing readiness</span>
     </div>
     <div class="guided-card">
       <div class="section-title">
         <div>
           <h2>Before filing, do this</h2>
           <p class="muted">Resolve these on the Fix Problems step.</p>
         </div>
       </div>
       <div class="action-list">
         ${[
            [`Fix ${supplierPending} supplier issue${supplierPending === 1 ? "" : "s"}`, supplierPending ? "They need to correct or upload bills." : "Supplier-side issues are resolved."],
            [`Review ${internalPending} internal item${internalPending === 1 ? "" : "s"}`, internalPending ? "Handle duplicates and blocked credit." : "Internal items are resolved."],
            ["Re-check the filing report", "Confirm recovered credit before filing."],
            ["File before the due date", `Submit GSTR-3B before ${business.deadline}.`]
        ].map(([title, sub], index) => `
           <div class="action-item">
             <div class="rank">${index + 1}</div>
             <div><p class="row-title">${title}</p><p class="row-sub">${sub}</p></div>
           </div>
         `).join("")}
       </div>
       <a class="btn btn-primary" style="margin-top: 16px;" href="#/matchmaker">Go to Fix Problems</a>
     </div>
   </section>
 `);
}

function render() {
    const route = window.location.hash || "#/dashboard";
    const app = document.querySelector("#app");

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
render();
requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));



