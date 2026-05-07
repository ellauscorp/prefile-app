import { useState, useEffect, useRef } from "react";

function logEvent(event, data = {}) {
  const entry = { event, data, timestamp: new Date().toISOString() };
  console.log(event, data);
  try {
    const existing = JSON.parse(localStorage.getItem("pf_events") || "[]");
    existing.push(entry);
    localStorage.setItem("pf_events", JSON.stringify(existing));
  } catch (e) {}
}

import * as XLSX from "xlsx-js-style";

// ─── DESIGN TOKENS ───────────────────────────────────────────────────────────
const C = {
  forest: "#1B5E20", forestMid: "#2E7D32", forestLight: "#43A047",
  cream: "#FAFAF7", creamDark: "#F2F0EB", creamDeep: "#E8E5DF",
  ink: "#1A1A18", inkLight: "#4A4A47", inkFaint: "#9A9A97",
  gold: "#D4A017", goldLight: "#F5E6C0",
  white: "#FFFFFF", red: "#C62828",
};

const FONTS = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,600;0,9..144,700;1,9..144,400&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
`;

const CATEGORIES = [
  "Advertising & marketing", "Car & mileage", "Contractors & services",
  "Legal & professional", "Office expenses", "Supplies", "Travel",
  "Business meals", "Utilities", "Software & subscriptions",
  "Insurance", "Rent / workspace", "Taxes & licenses",
  "Equipment & tools", "Other",
];

// Common mapping of expense categories to lines on the current IRS Schedule C
// (Form 1040). Conservative posture: only mappings where the IRS form's printed
// line label literally matches the category (e.g., Line 15 "Insurance",
// Line 24a "Travel", Line 20b "Other business property" for office rent).
// Mappings that require any judgment about *which* line a category belongs to
// (Car & mileage, Contractors, Legal, Office expenses, Taxes & licenses,
// Software, Equipment, Other) use "Varies" so the user is nudged to confirm
// rather than presented with an inferred line number.
// This is COMMON MAPPING, not tax advice — see the disclaimer rendered below
// the Category Breakdown table in the exported XLSX.
// Mapping of internal category names to Schedule C lines. Where IRS guidance
// is unambiguous for the category as named, the specific line is given. Where
// the category covers multiple potential lines (e.g., Equipment may be
// expensed or depreciated depending on cost), the value is "Varies". The
// export sheet renders "Varies" entries in their own bucket so a preparer
// sees them separately from line-mapped totals.
const SCHEDULE_C_REFERENCE = {
  "Advertising & marketing": "Schedule C Line 8",
  "Car & mileage":           "Schedule C Line 9",
  "Contractors & services":  "Schedule C Line 11",
  "Insurance":               "Schedule C Line 15",
  "Legal & professional":    "Schedule C Line 17",
  "Office expenses":         "Schedule C Line 18",
  "Rent / workspace":        "Schedule C Line 20b",
  "Supplies":                "Schedule C Line 22",
  "Taxes & licenses":        "Schedule C Line 23",
  "Travel":                  "Schedule C Line 24a",
  "Business meals":          "Schedule C Line 24b",
  "Utilities":               "Schedule C Line 25",
  "Software & subscriptions":"Schedule C Line 27a",
  "Equipment & tools":       "Varies — depends on cost & expected life, review before filing",
  "Other":                   "Varies — review before filing",
};


const CATEGORY_DEFINITIONS = {
  "Advertising & marketing": "Costs to promote your business — social media ads, flyers, business cards, sponsored posts, or any paid promotion.",
  "Car & mileage":           "Business driving expenses — client visits, errands, deliveries. Track miles at $0.67/mile (2025) or deduct actual car costs.",
  "Contractors & services":  "Payments to freelancers, subcontractors, or agencies you hired to do work for your business.",
  "Legal & professional":    "Fees paid to lawyers, accountants, consultants, or other licensed professionals for business-related services.",
  "Office expenses":         "Day-to-day office costs — printer ink, paper, pens, folders, postage, and small items used to run your business.",
  "Supplies":                "Materials consumed in your business — packaging, shipping supplies, raw materials, or items you use to deliver your product or service.",
  "Travel":                  "Overnight business trips — flights, hotels, taxis, rental cars. Must be primarily for business, not personal.",
  "Business meals":          "Food and drinks with clients, partners, or while traveling for work. Generally 50% deductible — keep the receipt and note who you met.",
  "Utilities":               "Business portion of phone, internet, electricity, or water bills. Deduct only the percentage used for work.",
  "Software & subscriptions":"Apps, tools, and platforms used for your business — design tools, accounting software, project managers, cloud storage.",
  "Insurance":               "Business insurance premiums — liability, professional indemnity, equipment, or health insurance if you're self-employed.",
  "Rent / workspace":        "Rent for an office, studio, or workspace. If you work from home, you may deduct a percentage based on your home office size.",
  "Taxes & licenses":        "Business licenses, permits, professional certifications, and certain taxes paid as part of running your business.",
  "Equipment & tools":       "Business equipment purchases — computers, cameras, tools, machinery. May be fully deductible in year one under Section 179.",
  "Other":                   "Expenses that don't fit a standard category. Note the business purpose clearly — your tax professional can help classify these.",
};

const PAYWALL_COPY_VARIANT = "A"; // change to "B" to test
const LOSS_LINE_VARIANT    = "A"; // "A" = current, "B" = tighter version

// ─── LEGAL CONSTANTS ────────────────────────────────────────────────────────
export const PREFILE_DISCLAIMER = "PreFile prepares structured financial data for your tax professional. It does not file your return, calculate your tax liability, or provide tax, legal, or financial advice. All data, categorizations, and outputs should be reviewed and confirmed by you and a qualified tax professional before being used to prepare or file any tax return.";

export const PREFILE_SHORT_DISCLAIMER = "Filing-ready data for your tax professional — not tax advice or a completed return. Confirm with a qualified tax professional.";

export const PREFILE_POSITIONING = "PreFile turns scattered receipts into a filing-ready summary for your tax professional — so you arrive at tax time prepared, not reconstructing.";

export const PREFILE_USER_RESPONSIBILITY = "You are responsible for reviewing all entries and confirming their accuracy with a qualified tax professional before filing.";

// ── Tax year config ──
// Single source of truth for the current tax year. To roll the app forward
// to a new tax year, update TAX_YEAR here. All hardcoded year labels in the
// homepage badge, paywall preview, workbook subheaders, and filename pull
// from this constant.
export const TAX_YEAR = 2026;
export const TAX_YEAR_LABEL = `Tax year ${TAX_YEAR}`;

// Reusable footer disclaimer block — drop into any screen
function DisclaimerFooter({ compact = false }) {
  return (
    <div style={{
      maxWidth: 720, margin: "32px auto 0", padding: "16px 24px",
      borderTop: `1px solid ${C.creamDeep}`,
      fontSize: compact ? 10 : 11, color: C.inkFaint,
      lineHeight: 1.6, textAlign: "center",
      fontFamily: "'DM Sans', sans-serif",
    }}>
      {PREFILE_SHORT_DISCLAIMER}
    </div>
  );
}


// ─── SVG ICON SYSTEM ─────────────────────────────────────────────────────────
// All icons: stroke-based, 24×24 viewBox, no fill, Stripe/Linear style
const SvgIcon = ({ d, size = 16, color = "currentColor", strokeWidth = 1.5, style = {} }) => (
  <svg
    width={size} height={size}
    viewBox="0 0 24 24"
    fill="none"
    stroke={color}
    strokeWidth={strokeWidth}
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ display: "inline-block", flexShrink: 0, ...style }}
  >
    {Array.isArray(d) ? d.map((path, i) => <path key={i} d={path} />) : <path d={d} />}
  </svg>
);

// Icon path library — all 24×24, stroke only
const ICON_PATHS = {
  receipt:        ["M4 2h16v20l-2-1-2 1-2-1-2 1-2-1-2 1V2Z", "M8 10h8", "M8 14h8", "M8 6h4"],
  megaphone:      ["M3 11v2M21 12c0 4.418-4.03 8-9 8a9.86 9.86 0 01-4-.82", "M21 12C21 7.582 16.97 4 12 4c-1.66 0-3.21.42-4.54 1.15L3 7v10l4.46 1.85A9.97 9.97 0 0012 20"],
  car:            ["M5 17H3v-5l2-5h14l2 5v5h-2", "M5 17a2 2 0 104 0 2 2 0 00-4 0", "M15 17a2 2 0 104 0 2 2 0 00-4 0", "M3 12h18"],
  users:          ["M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2", "M9 11a4 4 0 100-8 4 4 0 000 8", "M23 21v-2a4 4 0 00-3-3.87", "M16 3.13a4 4 0 010 7.75"],
  briefcase:      ["M20 7H4a2 2 0 00-2 2v10a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2Z", "M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2", "M12 12v4", "M8 12h8"],
  paperclip:      ["M21.44 11.05l-9.19 9.19a6 6 0 01-8.49-8.49l9.19-9.19a4 4 0 015.66 5.66l-9.2 9.19a2 2 0 01-2.83-2.83l8.49-8.48"],
  package:        ["M16.5 9.4l-9-5.19", "M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 002 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16Z", "M3.27 6.96L12 12.01l8.73-5.05", "M12 22.08V12"],
  plane:          ["M21 16v-2l-8-5V3.5a1.5 1.5 0 00-3 0V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5Z"],
  utensils:       ["M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2", "M7 2v20", "M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"],
  zap:            ["M13 2L3 14h9l-1 8 10-12h-9l1-8Z"],
  shield:         ["M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"],
  home:           ["M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9Z", "M9 22V12h6v10"],
  clipboard:      ["M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2", "M9 2h6a1 1 0 011 1v2a1 1 0 01-1 1H9a1 1 0 01-1-1V3a1 1 0 011-1Z", "M12 11h4", "M12 16h4", "M8 11h.01", "M8 16h.01"],
  wrench:         ["M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76Z"],
  file:           ["M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6Z", "M14 2v6h6", "M16 13H8", "M16 17H8", "M10 9H8"],
  // Paywall / UI icons
  save:           ["M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2Z", "M17 21v-8H7v8", "M7 3v5h8"],
  folder:         ["M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2v11Z"],
  download:       ["M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4", "M7 10l5 5 5-5", "M12 15V3"],
  // Check / check-reveal
  checkCircle:    ["M22 11.08V12a10 10 0 11-5.93-9.14", "M22 4L12 14.01l-3-3"],
  // Directional
  chevronDown:    ["M6 9l6 6 6-6"],
};

// Convenience component — picks path by name
const Icon = ({ name, size = 16, color = "currentColor", strokeWidth = 1.5, style = {} }) => (
  <SvgIcon d={ICON_PATHS[name] || ICON_PATHS.file} size={size} color={color} strokeWidth={strokeWidth} style={style} />
);

// Category → icon name mapping
const CAT_ICON = {
  "Advertising & marketing":  "megaphone",
  "Car & mileage":            "car",
  "Contractors & services":   "users",
  "Legal & professional":     "briefcase",
  "Office expenses":          "paperclip",
  "Supplies":                 "package",
  "Travel":                   "plane",
  "Business meals":           "utensils",
  "Utilities":                "zap",
  "Software & subscriptions": "wrench",
  "Insurance":                "shield",
  "Rent / workspace":         "home",
  "Taxes & licenses":         "clipboard",
  "Equipment & tools":        "wrench",
  "Other":                    "file",
};

// Render a category icon as SVG (single source of truth — no emoji fallback)
const CatIcon = ({ category, size = 14, color }) => {
  const meta = CAT_META[category] || CAT_META["Other"];
  const iconName = CAT_ICON[category] || "file";
  return <Icon name={iconName} size={size} color={color || meta.color} strokeWidth={1.6} />;
};

const CAT_META = {
  "Advertising & marketing": { color: "#7C3AED" },
  "Car & mileage":           { color: "#D97706" },
  "Contractors & services":  { color: "#0369A1" },
  "Legal & professional":    { color: "#475569" },
  "Office expenses":         { color: "#1D4ED8" },
  "Supplies":                { color: "#1B5E20" },
  "Travel":                  { color: "#0891B2" },
  "Business meals":          { color: "#D4A017" },
  "Utilities":               { color: "#C62828" },
  "Software & subscriptions":{ color: "#6B21A8" },
  "Insurance":               { color: "#065F46" },
  "Rent / workspace":        { color: "#92400E" },
  "Taxes & licenses":        { color: "#374151" },
  "Equipment & tools":       { color: "#7C2D12" },
  "Other":                   { color: "#6B7280" },
};

// Merchant → category auto-suggest
const MERCHANT_HINTS = {
  canva: "Software & subscriptions", shopify: "Software & subscriptions",
  adobe: "Software & subscriptions", google: "Software & subscriptions",
  zoom: "Software & subscriptions", slack: "Software & subscriptions",
  notion: "Software & subscriptions", figma: "Software & subscriptions",
  usps: "Supplies", fedex: "Supplies", ups: "Supplies",
  staples: "Office expenses", "office depot": "Office expenses",
  amazon: "Supplies", costco: "Supplies",
  starbucks: "Business meals", "whole foods": "Business meals",
  uber: "Travel", lyft: "Travel", airbnb: "Travel",
  shell: "Car & mileage", chevron: "Car & mileage",
  "at&t": "Utilities", verizon: "Utilities", comcast: "Utilities",
  facebook: "Advertising & marketing", instagram: "Advertising & marketing",
  meta: "Advertising & marketing", pinterest: "Advertising & marketing",
};

function suggestCategory(merchant) {
  if (!merchant) return "Other";
  const lower = merchant.toLowerCase();
  for (const [key, cat] of Object.entries(MERCHANT_HINTS)) {
    if (lower.includes(key)) return cat;
  }
  return "Other";
}


// ─── E-COMMERCE TAGGING SYSTEM ──────────────────────────────────────────────
// DESIGN CONSTRAINT — READ BEFORE EXTENDING
//
// Tags are an INTERNAL classification layer that exists only to route certain
// receipts to the correct Schedule C placement in the export. They are NOT
// a parallel category system, NOT a user-facing taxonomy, and NOT the
// foundation for accounting features.
//
// What tags do:
//   - Route tagged receipts to a specific Schedule C line in the export
//     (cogs_inventory / freight_in / import_duties → Part III Purchases;
//      shipping_out → Line 22; promo_goods → Line 8)
//   - Override category-based Schedule C placement when present
//   - Surface as a small dismissible pill on EditScreen so the user can
//     remove an incorrect auto-suggestion
//
// What tags DO NOT do — and should not be extended to do:
//   - Tags do NOT appear in the category dropdown
//   - Tags are NOT a second axis of categorization for users to manage
//   - Tags do NOT track inventory (no beginning/ending balances, no SKUs,
//     no stock counts, no "on hand" quantities)
//   - Tags do NOT compute COGS. The Part III bucket holds PURCHASES only —
//     one of several inputs to the real COGS computation that a tax
//     preparer performs separately. The export label says exactly that:
//     "Schedule C Part III — Purchases (one of several COGS inputs)".
//   - Tags do NOT support multi-tagging. One tag per receipt, max.
//
// Why this matters:
//   PreFile is a structured financial organization system that prepares data
//   for tax professionals. It is NOT a full accounting system. Adding
//   inventory tracking, COGS calculation, multi-tagging, or a tag picker UI
//   would change what the product IS, not just what it can do — and would
//   break the simple-categorization-experience promise the product makes
//   to non-accountant users.
//
// THIS IS A DESIGN CONSTRAINT, NOT A MISSING FEATURE.
//
// If a future contributor needs to:
//   - Add a new tag value: extend TAG_META and MERCHANT_TAG_HINTS below.
//     The existing 5 tag values are sufficient for the e-commerce gap;
//     adding more is a real product decision, not a routine change.
//   - Add inventory tracking: don't. Talk to the product owner first.
//   - Add COGS calculation: don't. Talk to the product owner first.
//   - Expose tags in the UI beyond the existing pill: don't. Talk to the
//     product owner first.
const TAG_META = {
  cogs_inventory: {
    label: "Inventory purchase",
    schCLine: "Schedule C Line 36",
    section: "Schedule C Part III — Purchases (one of several COGS inputs)",
    hint: "Looks like wholesale inventory — flagged for Schedule C Part III.",
  },
  freight_in: {
    label: "Inbound freight",
    schCLine: "Schedule C Line 36",
    section: "Schedule C Part III — Purchases (one of several COGS inputs)",
    hint: "Looks like inbound freight from a supplier — flagged for Schedule C Part III.",
  },
  import_duties: {
    label: "Import duties",
    schCLine: "Schedule C Line 36",
    section: "Schedule C Part III — Purchases (one of several COGS inputs)",
    hint: "Looks like customs / import duties — flagged for Schedule C Part III.",
  },
  shipping_out: {
    label: "Shipping to customer",
    schCLine: "Schedule C Line 22",
    section: null, // routes into the standard Supplies group
    hint: "Looks like outbound shipping — flagged as a delivery expense.",
  },
  promo_goods: {
    label: "Free sample / promo",
    schCLine: "Schedule C Line 8",
    section: null, // routes into the standard Advertising group
    hint: "Looks like promotional goods — flagged as advertising.",
  },
};

// Merchant substring → tag. Conservative: only fires when the substring is a
// strong signal. USPS / FedEx / UPS by themselves are NOT tagged (could be
// outbound shipping, office mail, customs pickup); only tag when paired with
// shipping context like "label" or "shipping". Same logic for the others.
const MERCHANT_TAG_HINTS = [
  // Inventory: wholesale marketplaces and direct supplier names
  { match: /\bfaire\b/i,            tag: "cogs_inventory" },
  { match: /\balibaba\b/i,          tag: "cogs_inventory" },
  { match: /\baliexpress\b/i,       tag: "cogs_inventory" },
  { match: /\bflorence leather\b/i, tag: "cogs_inventory" },
  { match: /\bwholesale\b/i,        tag: "cogs_inventory" },
  // Inbound freight: international couriers in shipping contexts
  { match: /\bfreight\b/i,          tag: "freight_in" },
  { match: /\bcargo\b/i,            tag: "freight_in" },
  { match: /\bdhl\b.*\b(import|inbound|international)\b/i, tag: "freight_in" },
  // Import duties / customs
  { match: /\bcustoms\b/i,          tag: "import_duties" },
  { match: /\bduty\b/i,             tag: "import_duties" },
  { match: /\btariff\b/i,           tag: "import_duties" },
  { match: /\bcbp\b/i,              tag: "import_duties" }, // U.S. Customs and Border Protection
  // Outbound shipping: shipping platforms + carrier+context patterns
  { match: /\bshipstation\b/i,      tag: "shipping_out" },
  { match: /\bpirate ship\b/i,      tag: "shipping_out" },
  { match: /\beasypost\b/i,         tag: "shipping_out" },
  { match: /\bstamps\.com\b/i,      tag: "shipping_out" },
  { match: /\b(usps|ups|fedex)\b.*\b(label|shipping|parcel|outbound|priority mail)\b/i, tag: "shipping_out" },
  // Promo goods / samples
  { match: /\bsample(s)?\b/i,       tag: "promo_goods" },
  { match: /\bpromo(tional)?\b/i,   tag: "promo_goods" },
  { match: /\bgiveaway\b/i,         tag: "promo_goods" },
  { match: /\bswag\b/i,             tag: "promo_goods" },
];

// Returns a tag id or null. Conservative — null means "no tag," not "Other."
function suggestTag(merchant) {
  if (!merchant) return null;
  for (const { match, tag } of MERCHANT_TAG_HINTS) {
    if (match.test(merchant)) return tag;
  }
  return null;
}

// ── Schedule 1 item type catalog ──
// Suggested types for the Schedule 1 manual-entry dropdown. Users can also
// pick "Other adjustment" or "Other income" and label it themselves via notes.
const SCHED_1_ITEM_TYPES = [
  "Self-employed health insurance",
  "IRA contribution",
  "Student loan interest",
  "Additional income",
  "Other adjustment",
];

// ── Schedule D term inference ──
// Returns "Long-term" (held >1 year) or "Short-term" per IRS holding-period
// rule. This is calendar arithmetic, not a tax calculation. Returns "" if
// either date is missing or unparseable.
function computeSchedDTerm(dateAcquired, dateSold) {
  if (!dateAcquired || !dateSold) return "";
  const a = new Date(dateAcquired);
  const s = new Date(dateSold);
  if (isNaN(a.getTime()) || isNaN(s.getTime())) return "";
  // Holding period: > 1 year between acquisition and sale → long-term
  const oneYearLater = new Date(a);
  oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
  return s > oneYearLater ? "Long-term" : "Short-term";
}

// ── Schedule D IRS reference ──
// Organizer-level IRS mapping foundation only — not completed filing logic.
// Real IRS Schedule D structure separates Part I (short-term, held ≤1 year)
// and Part II (long-term, held >1 year). This app currently maps at the
// part level only so a tax professional can see the intended routing context
// without implying full form-completion behavior.
//
// Year-sensitive note: the Part I / Part II structure is stable, but any
// future deeper routing should still be rechecked against the current IRS
// Schedule D instructions for TAX_YEAR.
//
// Extension point: if future 1099-B box-level or basis-reporting routing is
// needed, add a separate detailed reference structure (for example,
// SCHEDULE_D_DETAIL_REFERENCE) rather than overloading this term-based map.
// Do NOT change the stored schedDItems shape just to force more detailed IRS
// routing into this organizer-level structure.
const SCHEDULE_D_REFERENCE = {
  "Short-term": {
    part: "Part I",
    label: "Short-term capital gains and losses",
    description: "Assets held one year or less",
    summaryLine: "Line 7",
  },
  "Long-term": {
    part: "Part II",
    label: "Long-term capital gains and losses",
    description: "Assets held more than one year",
    summaryLine: "Line 15",
  },
};

// Resolve a Schedule D entry to its IRS-section reference. Returns null if
// the term cannot be inferred (missing/invalid dates).
function getSchedDReference(entry) {
  const term = computeSchedDTerm(entry && entry.dateAcquired, entry && entry.dateSold);
  return SCHEDULE_D_REFERENCE[term] || null;
}

// ── Schedule 1 IRS reference ──
// Organizer-level IRS mapping foundation only — not completed filing logic.
// Real Schedule 1 (Form 1040) structure separates Part I (additional income)
// and Part II (adjustments to income). Each user-facing item type below is
// mapped to its current organizer-level IRS line reference for cleaner
// tax-professional handoff.
//
// Year-sensitive note: these line references were validated against the
// current implemented IRS structure for this phase. If the IRS renumbers
// Schedule 1 lines in a future tax year, update this map here rather than
// scattering line strings throughout the app.
//
// Extension point: if new Schedule 1 item types are added later, they must be
// added to this mapping structure too, and their current-year IRS line
// references should be verified before shipping.
const SCHEDULE_1_REFERENCE = {
  "Self-employed health insurance": {
    part: "Part II",
    section: "Adjustments to income",
    line: "Line 17",
  },
  "IRA contribution": {
    part: "Part II",
    section: "Adjustments to income",
    line: "Line 20",
  },
  "Student loan interest": {
    part: "Part II",
    section: "Adjustments to income",
    line: "Line 21",
  },
  "Additional income": {
    part: "Part I",
    section: "Additional income",
    line: "Line 8z",
  },
  "Other adjustment": {
    part: "Part II",
    section: "Adjustments to income",
    line: "Line 24z",
  },
};

// Resolve a Schedule 1 item type to its IRS reference. Falls back to a
// neutral "review with tax professional" reference for unknown types.
function getSched1Reference(itemType) {
  return SCHEDULE_1_REFERENCE[itemType] || {
    part: "—",
    section: "Review with tax professional",
    line: "—",
  };
}

// ── Validators ──
// Foundation-level validation. Returns { valid: bool, errors: { field: msg } }
// where each errors entry is suitable for inline display next to the field.

function validateSchedDEntry(form) {
  const errors = {};
  if (!form.asset || !form.asset.trim()) {
    errors.asset = "Add an asset description to continue.";
  }
  if (!form.dateAcquired) {
    errors.dateAcquired = "Enter the purchase date to continue.";
  }
  if (!form.dateSold) {
    errors.dateSold = "Enter the sale date to continue.";
  }
  // Date-order check (only if both parse cleanly)
  if (form.dateAcquired && form.dateSold) {
    const a = new Date(form.dateAcquired);
    const s = new Date(form.dateSold);
    if (!isNaN(a.getTime()) && !isNaN(s.getTime()) && s < a) {
      errors.dateSold = "Check the dates. The sale date can’t be earlier than the purchase date.";
    }
  }
  // Numeric checks — empty/non-numeric/negative all flag
  const proceeds = parseFloat(form.proceeds);
  if (form.proceeds === "" || form.proceeds === undefined || form.proceeds === null) {
    errors.proceeds = "Enter the proceeds amount to continue.";
  } else if (isNaN(proceeds) || proceeds < 0) {
    errors.proceeds = "Enter a non-negative number. No commas needed.";
  }
  const basis = parseFloat(form.costBasis);
  if (form.costBasis === "" || form.costBasis === undefined || form.costBasis === null) {
    errors.costBasis = "Enter the cost basis to continue.";
  } else if (isNaN(basis) || basis < 0) {
    errors.costBasis = "Enter a non-negative number. No commas needed.";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

function validateSched1Entry(form) {
  const errors = {};
  if (!form.itemType || !form.itemType.trim()) {
    errors.itemType = "Choose an item type to continue.";
  }
  const amount = parseFloat(form.amount);
  if (form.amount === "" || form.amount === undefined || form.amount === null) {
    errors.amount = "Enter the amount to continue.";
  } else if (isNaN(amount) || amount < 0) {
    errors.amount = "Enter a non-negative number. No commas needed.";
  }
  return { valid: Object.keys(errors).length === 0, errors };
}

const SAMPLE_MERCHANTS = [
  { merchant: "Canva Pro — monthly plan",      amount: "12.99", date: "Apr 18, 2026", category: "Software & subscriptions" },
  { merchant: "USPS — label purchase",          amount: "18.45", date: "Apr 15, 2026", category: "Supplies" },
  { merchant: "Starbucks — client meeting",     amount: "11.85", date: "Apr 12, 2026", category: "Business meals" },
  { merchant: "Google Workspace — team plan",   amount: "14.40", date: "Apr 10, 2026", category: "Software & subscriptions" },
  { merchant: "AT&T — internet & phone",        amount: "89.20", date: "Apr 1, 2026",  category: "Utilities" },
];

// ─── SHARED STYLES ───────────────────────────────────────────────────────────
const GLOBAL_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  body { background: ${C.cream}; }

  .pf-btn-primary {
    background: ${C.forest}; color: ${C.white}; border: none;
    border-radius: 13px; padding: 15px 28px; font-size: 15px;
    font-weight: 700; cursor: pointer; font-family: 'DM Sans', sans-serif;
    transition: background 0.18s, transform 0.12s, box-shadow 0.18s;
    box-shadow: 0 4px 18px rgba(27,94,32,0.22);
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .pf-btn-primary:hover { background: ${C.forestMid}; transform: translateY(-1px); box-shadow: 0 6px 24px rgba(27,94,32,0.3); }
  .pf-btn-primary:active { transform: translateY(0); }

  .pf-btn-secondary {
    background: transparent; color: ${C.ink}; border: 1.5px solid ${C.creamDeep};
    border-radius: 13px; padding: 13px 28px; font-size: 14px;
    font-weight: 600; cursor: pointer; font-family: 'DM Sans', sans-serif;
    transition: background 0.18s, border-color 0.18s;
    display: flex; align-items: center; justify-content: center; gap: 8px;
  }
  .pf-btn-secondary:hover { background: ${C.creamDark}; border-color: ${C.inkFaint}; }

  .pf-btn-ghost {
    background: none; border: none; color: ${C.inkFaint};
    font-size: 13px; font-weight: 500; cursor: pointer;
    font-family: 'DM Sans', sans-serif; padding: 8px 0;
    text-decoration: underline; text-underline-offset: 3px;
  }
  .pf-btn-ghost:hover { color: ${C.ink}; }

  .pf-input {
    width: 100%; padding: 12px 14px; border: 1.5px solid ${C.creamDeep};
    border-radius: 11px; font-size: 14px; font-family: 'DM Sans', sans-serif;
    color: ${C.ink}; background: ${C.white}; outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
  }
  .pf-input:focus { border-color: ${C.forestLight}; box-shadow: 0 0 0 3px rgba(27,94,32,0.08); }

  .pf-select {
    width: 100%; padding: 12px 14px; border: 1.5px solid ${C.creamDeep};
    border-radius: 11px; font-size: 14px; font-family: 'DM Sans', sans-serif;
    color: ${C.ink}; background: ${C.white}; outline: none;
    cursor: pointer; appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1l5 5 5-5' stroke='%239A9A97' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 14px center;
    padding-right: 36px;
    transition: border-color 0.15s;
  }
  .pf-select:focus { border-color: ${C.forestLight}; }

  .pf-card {
    background: ${C.white}; border-radius: 18px;
    box-shadow: 0 2px 16px rgba(0,0,0,0.06);
    border: 1px solid ${C.creamDark};
  }

  .pf-label { font-size: 11px; font-weight: 600; color: ${C.inkFaint}; text-transform: uppercase; letter-spacing: 0.07em; margin-bottom: 6px; }

  .fade-in { animation: fadeIn 0.35s ease; }
  .slide-up { animation: slideUp 0.4s cubic-bezier(0.16,1,0.3,1); }
  @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
  @keyframes slideUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }

  .receipt-row { animation: receiptIn 0.4s cubic-bezier(0.16,1,0.3,1) both; }
  @keyframes receiptIn { from { opacity:0; transform:translateX(-12px); } to { opacity:1; transform:translateX(0); } }

  .trust-dot { width: 3px; height: 3px; border-radius: 50%; background: ${C.inkFaint}; display: inline-block; margin: 0 7px; vertical-align: middle; }

  .spin { animation: spin 0.9s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }

  .progress-bar { height: 3px; background: ${C.creamDeep}; border-radius: 10px; margin-bottom: 24px; }
  .progress-fill { height: 100%; background: ${C.forest}; border-radius: 10px; transition: width 0.4s ease; }

  .method-card {
    background: ${C.white}; border: 2px solid ${C.creamDeep}; border-radius: 16px;
    padding: 22px 20px; cursor: pointer; text-align: center;
    transition: border-color 0.18s, box-shadow 0.18s, transform 0.15s;
    display: flex; flex-direction: column; align-items: center; gap: 10px;
  }
  .method-card:hover { border-color: ${C.forestLight}; box-shadow: 0 4px 20px rgba(27,94,32,0.12); transform: translateY(-2px); }
  .method-card.primary { border-color: ${C.forest}; background: rgba(27,94,32,0.03); }

  .cat-chip {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 5px 12px; border-radius: 20px; font-size: 12px; font-weight: 600;
    cursor: pointer; border: 1.5px solid transparent;
    transition: all 0.15s;
  }
  .cat-chip:hover { transform: translateY(-1px); }
  .cat-chip.selected { border-width: 2px; }

  @media (max-width: 600px) {
    .mobile-stack { flex-direction: column !important; }
    .mobile-full { width: 100% !important; }
  }
`;


// ── INSIGHT ENGINE ──────────────────────────────────────────────────────────
// Single source of truth for rule-based insights. Called from BOTH the paywall
// teaser (to count hidden insights) and the XLSX Summary sheet (to render them).
//
// Returns: { tier1: [], tier2: [], all: [] }
//   tier1 — high-value catches (top 5, sorted by priority desc)
//   tier2 — supporting patterns (top 3, sorted by priority desc)
//   all   — full deduplicated list, sorted by priority desc (used by XLSX export)
//
// Each insight: { id, tier: 1 | 2, priority: number, line: string }
// Higher priority = more important. Insights are deduped by id before sorting.

// Merchant heuristics — used by detection rules below.
const GAS_MERCHANT_RX = /\b(shell|chevron|exxon|mobil|bp|arco|costco gas|sunoco|valero|conoco|phillips|76|texaco|sinclair|marathon|speedway|wawa|sheetz|circle k|7-eleven|gas|fuel|petro)\b/i;
const PARKING_RX      = /\b(parking|garage|park\+ride|paybyphone|spothero|premium parking|impark|laz parking|toll|e-?zpass|fastrak)\b/i;
const MILEAGE_APP_RX  = /\b(mileiq|stride|everlance|hurdlr|triplog|mileage)\b/i;
const MIXED_USE_RX    = /\b(amazon|costco|target|walmart|sam'?s club|whole foods|trader joe|kroger|safeway|cvs|walgreens|home depot|lowe'?s)\b/i;
const UTILITY_RX      = /\b(internet|wifi|comcast|xfinity|spectrum|verizon|at&t|t-mobile|sprint|cox|frontier|optimum|cable|electric|pg&e|edison|water|sewer|gas company)\b/i;

function computeInsights(receipts) {
  const empty = { tier1: [], tier2: [], all: [] };
  if (!receipts || receipts.length === 0) return empty;

  // ── Aggregate ─────────────────────────────────────────────────────────────
  const catTotals = {};
  let grandBiz = 0;
  receipts.forEach(r => {
    const amt = parseFloat(r.amount) || 0;
    const bizAmt = amt * ((r.businessPct || 100) / 100);
    catTotals[r.category] = (catTotals[r.category] || 0) + bizAmt;
    grandBiz += bizAmt;
  });
  if (grandBiz === 0) return empty;

  const sorted = Object.entries(catTotals).sort((a,b) => b[1] - a[1]);
  const insights = [];

  // ─────────────────────────────────────────────────────────────────────────
  // TIER 1 — CATCHES (concrete mistakes or missed money)
  // Priority numbers: higher = more conversion impact.
  // ─────────────────────────────────────────────────────────────────────────

  // ── High-dollar meals (priority 100) — strongest catch in current data ──
  const mealsTotal   = catTotals["Business meals"] || 0;
  const mealReceipts = receipts.filter(r => r.category === "Business meals");
  if (mealsTotal > 0) {
    const highDollar = mealReceipts.filter(r => (parseFloat(r.amount) || 0) > 75);
    if (highDollar.length > 0) {
      const n = highDollar.length;
      const verb = n === 1 ? "is" : "are";
      insights.push({
        id: "meals_high_dollar", tier: 1, priority: 100, conversionScore: 85,
        line: `Your file flags ${n} meal receipt${n>1?'s':''} ${verb} over $75 — these need documented attendees and business purpose. Review before filing.`,
      });
    } else {
      const overstateBy = mealsTotal * 0.5;
      const entryWord   = mealReceipts.length === 1 ? "entry" : "entries";
      insights.push({
        id: "meals_50pct", tier: 1, priority: 75, conversionScore: 78,
        line: `Your file flags $${mealsTotal.toFixed(0)} in meals across ${mealReceipts.length} ${entryWord} — if filed at 100%, this overstates by $${overstateBy.toFixed(0)} — meals are typically 50% deductible. Confirm with your tax professional.`,
      });
    }
  }

  // ── Mileage gap (priority 95) — gas/parking but no mileage entry ────────
  const carReceipts = receipts.filter(r => r.category === "Car & mileage");
  const gasParkingReceipts = carReceipts.filter(r =>
    GAS_MERCHANT_RX.test(r.merchant || "") || PARKING_RX.test(r.merchant || "")
  );
  const hasMileageEntry = carReceipts.some(r => MILEAGE_APP_RX.test(r.merchant || ""));
  if (gasParkingReceipts.length > 0 && !hasMileageEntry) {
    const gasTotal = gasParkingReceipts.reduce(
      (s, r) => s + (parseFloat(r.amount) || 0) * ((r.businessPct || 100) / 100), 0
    );
    insights.push({
      id: "mileage_gap", tier: 1, priority: 95, conversionScore: 140,
      line: `Your file flags $${gasTotal.toFixed(0)} in gas/parking but no business mileage — $1,500–$3,000 in mileage deductions are missing (2025 IRS rate: $0.67/mile). Adjust if needed.`,
    });
  }

  // ── Health insurance missing (priority 90) — large-dollar gap ───────────
  const insuranceTotal = catTotals["Insurance"] || 0;
  if (insuranceTotal === 0 && grandBiz >= 5000) {
    insights.push({
      id: "health_insurance_missing", tier: 1, priority: 90, conversionScore: 130,
      line: `Your file flags no self-employed health insurance — typical coverage runs $4,800–$9,600/year and is one of the largest Schedule 1 deductions. Confirm with your tax professional.`,
    });
  }

  // ── Subscription velocity (priority 85) — annualize partial logging ─────
  const softwareReceipts = receipts.filter(r => r.category === "Software & subscriptions");
  const byMerchant = {};
  softwareReceipts.forEach(r => {
    const m = (r.merchant || "").trim().toLowerCase();
    if (!m) return;
    if (!byMerchant[m]) byMerchant[m] = [];
    byMerchant[m].push(r);
  });
  const subscriptions = [];
  Object.entries(byMerchant).forEach(([, group]) => {
    if (group.length < 2) return;
    const amounts = group.map(r => parseFloat(r.amount) || 0);
    const variance = Math.max(...amounts) - Math.min(...amounts);
    if (variance > 1) return;
    const dated = group
      .map(r => ({ ...r, _d: new Date(r.date) }))
      .filter(r => !isNaN(r._d))
      .sort((a, b) => a._d - b._d);
    if (dated.length < 2) return;
    let monthly = true;
    for (let i = 1; i < dated.length; i++) {
      const days = (dated[i]._d - dated[i-1]._d) / 86400000;
      if (days < 25 || days > 35) { monthly = false; break; }
    }
    if (!monthly) return;
    subscriptions.push({ merchant: group[0].merchant, monthly: amounts[0] });
  });
  if (subscriptions.length > 0) {
    const annualizedTotal = subscriptions.reduce((s, sub) => s + sub.monthly * 12, 0);
    const merchantList = subscriptions.map(s => s.merchant).slice(0, 3).join(", ") +
                         (subscriptions.length > 3 ? `, +${subscriptions.length - 3} more` : "");
    const subWord = subscriptions.length === 1 ? "recurring subscription" : "recurring subscriptions";
    insights.push({
      id: "subscription_velocity", tier: 1, priority: 85, conversionScore: 90,
      line: `Your file flags ${subscriptions.length} recurring ${subWord} (${merchantList}) — these annualize to $${annualizedTotal.toFixed(0)}/year. Confirm with your tax professional.`,
    });
  }

  // ── Home office with utility signal (priority 80) ────────────────────────
  const hasWorkspace = (catTotals["Rent / workspace"] || 0) > 0;
  const hasUtilitySignal =
    (catTotals["Utilities"] || 0) > 0 ||
    receipts.some(r => UTILITY_RX.test(r.merchant || ""));
  if (!hasWorkspace && hasUtilitySignal) {
    const utilTotal = (catTotals["Utilities"] || 0) +
      receipts
        .filter(r => r.category !== "Utilities" && UTILITY_RX.test(r.merchant || ""))
        .reduce((s, r) => s + (parseFloat(r.amount) || 0) * ((r.businessPct || 100) / 100), 0);
    insights.push({
      id: "home_office_with_signal", tier: 1, priority: 80, conversionScore: 88,
      line: `Your file flags $${utilTotal.toFixed(0)} in utilities but no home office entry — the simplified deduction is up to $1,500/year. Adjust if needed.`,
    });
  }

  // ── Duplicate entries (priority 75) — same merchant, amount, date ────────
  const dupKey = r => `${(r.merchant || "").toLowerCase().trim()}|${parseFloat(r.amount) || 0}|${r.date}`;
  const dupGroups = {};
  receipts.forEach(r => {
    const k = dupKey(r);
    if (!dupGroups[k]) dupGroups[k] = [];
    dupGroups[k].push(r);
  });
  const dupes = Object.values(dupGroups).find(g => g.length > 1);
  if (dupes) {
    insights.push({
      id: "duplicate_entries", tier: 1, priority: 75, conversionScore: 70,
      line: `Your file flags possible duplicate entries on ${dupes[0].date}: ${dupes[0].merchant} for $${parseFloat(dupes[0].amount).toFixed(2)}, listed ${dupes.length} times. Review before filing.`,
    });
  }

  // ── Mixed-use 100% (priority 70) — Amazon/Costco at 100% business ───────
  const mixedUse100 = receipts.filter(r =>
    r.businessPct === 100 && MIXED_USE_RX.test(r.merchant || "")
  );
  if (mixedUse100.length >= 3) {
    const merchants = [...new Set(mixedUse100.map(r => r.merchant))].slice(0, 3).join(", ");
    insights.push({
      id: "mixed_use_100pct", tier: 1, priority: 70, conversionScore: 75,
      line: `Your file flags ${mixedUse100.length} purchases from ${merchants} marked 100% business — personal use is not deductible. Adjust if needed.`,
    });
  }

  // ── Rounded numbers (priority 65) — 3+ entries divisible by 50 or 100 ───
  const roundedEntries = receipts.filter(r => {
    const amt = parseFloat(r.amount) || 0;
    return amt >= 20 && (amt % 100 === 0 || amt % 50 === 0);
  });
  if (roundedEntries.length >= 3) {
    insights.push({
      id: "rounded_numbers", tier: 1, priority: 65, conversionScore: 80,
      line: `Your file flags several entries (e.g., $100, $500) — these appear as rounded amounts, not exact amounts. Review before filing.`,
    });
  }

  // ── High meals ratio (priority 60) — meals > 30% of total ───────────────
  if (mealsTotal > 0) {
    const mealsPct = (mealsTotal / grandBiz) * 100;
    if (mealsPct > 30) {
      insights.push({
        id: "meals_high_ratio", tier: 1, priority: 60, conversionScore: 55,
        line: `Your file flags meals at ${mealsPct.toFixed(0)}% of total expenses — unusually high for most businesses. Confirm with your tax professional.`,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TIER 2 — SUPPORTING PATTERNS
  // ─────────────────────────────────────────────────────────────────────────

  // ── Date gaps (priority 50) — missing months in middle of date range ────
  const dated = receipts
    .map(r => ({ d: new Date(r.date), amt: parseFloat(r.amount) || 0 }))
    .filter(r => !isNaN(r.d));
  if (dated.length >= 5) {
    const monthsPresent = new Set(dated.map(r => `${r.d.getFullYear()}-${r.d.getMonth()}`));
    const ds = dated.map(r => r.d).sort((a,b) => a - b);
    const first = ds[0], last = ds[ds.length - 1];
    const spanMonths = (last.getFullYear() - first.getFullYear()) * 12 + (last.getMonth() - first.getMonth()) + 1;
    if (spanMonths >= 4) {
      // Walk months between first and last; collect gaps of 2+ consecutive missing months
      const gaps = [];
      let curGap = [];
      const cursor = new Date(first.getFullYear(), first.getMonth(), 1);
      const stop   = new Date(last.getFullYear(),  last.getMonth(),  1);
      while (cursor <= stop) {
        const key = `${cursor.getFullYear()}-${cursor.getMonth()}`;
        if (!monthsPresent.has(key)) {
          curGap.push(new Date(cursor));
        } else {
          if (curGap.length >= 2) gaps.push([...curGap]);
          curGap = [];
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
      if (curGap.length >= 2) gaps.push(curGap);
      if (gaps.length > 0) {
        const monthName = d => d.toLocaleDateString("en-US", { month: "short" });
        const gap = gaps[0]; // most prominent gap (first one chronologically)
        const gapStart = monthName(gap[0]);
        const gapEnd   = monthName(gap[gap.length - 1]);
        const gapLabel = gap.length === 1 ? gapStart : `${gapStart}–${gapEnd}`;
        insights.push({
          id: "date_gaps", tier: 2, priority: 50, conversionScore: 45,
          line: `Your file flags a gap in ${gapLabel} — your receipts span ${monthName(first)}–${monthName(last)} but those months have no entries. Review before filing.`,
        });
      }
    }
  }

  // ── Category dominance (priority 45) — one category >= 40% ──────────────
  const topPct = (sorted[0][1] / grandBiz) * 100;
  if (topPct >= 40) {
    insights.push({
      id: "category_dominance", tier: 2, priority: 45, conversionScore: 60,
      line: `Your file flags ${sorted[0][0]} at ${topPct.toFixed(0)}% of total expenses — unusually concentrated. Confirm with your tax professional.`,
    });
  }

  // ── Small expenses accumulation (priority 40) — many sub-$10 entries ────
  const smallEntries = receipts.filter(r => {
    const amt = parseFloat(r.amount) || 0;
    return amt > 0 && amt < 10;
  });
  if (smallEntries.length >= 10) {
    const smallTotal = smallEntries.reduce(
      (s, r) => s + (parseFloat(r.amount) || 0) * ((r.businessPct || 100) / 100), 0
    );
    insights.push({
      id: "small_accumulation", tier: 2, priority: 40, conversionScore: 50,
      line: `Your file flags ${smallEntries.length} entries under $10 totaling $${smallTotal.toFixed(0)} — high volume can trigger review. Review before filing.`,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Dedupe by id, sort by priority desc, slice tiers
  // ─────────────────────────────────────────────────────────────────────────
  const seen = new Set();
  const deduped = [];
  insights.forEach(ins => {
    if (!seen.has(ins.id)) {
      seen.add(ins.id);
      deduped.push(ins);
    }
  });
  const sortedInsights = [...deduped].sort((a, b) => b.conversionScore - a.conversionScore);

  const tier1 = sortedInsights.filter(i => i.tier === 1).slice(0, 4);
  const tier2 = sortedInsights.filter(i => i.tier === 2).slice(0, 3);
  const all   = sortedInsights;

  return { tier1: tier1 || [], tier2: tier2 || [], all: all || [] };
}


// ── USER-TYPE CLASSIFIER (analytics segmentation only) ─────────────────────
// Buckets a session into one of three personas based on receipt patterns,
// purely so logEvent payloads can be segmented downstream. Does NOT alter
// any visible product behavior — selection logic, copy, and pricing are
// independent of the result.
//
// Heuristics (intentional, but worth periodic recalibration):
//   - "agency"       → has any contractor expense, OR > $15k total, OR ≥ 6 distinct categories
//   - "side_hustle"  → < $5k total AND < 20 receipts (both must hold)
//   - "freelancer"   → catch-all default
//
// Known loose signal: the contractor check fires on a single contractor
// purchase regardless of amount, so a freelancer with one bookkeeper
// invoice will classify as "agency". Tighten with a $-threshold or
// count-threshold if/when this distorts segmentation reads.
function getUserType(receipts) {
  const total = receipts.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const hasContractors = receipts.some(r => r.category === "Contractors & services");
  const categories = new Set(receipts.map(r => r.category));

  if (hasContractors || total > 15000 || categories.size >= 6) {
    return "agency";
  }
  if (total < 5000 && receipts.length < 20) {
    return "side_hustle";
  }
  return "freelancer";
}


// ── INSIGHT PRIORITY MAP (per user type) ────────────────────────────────────
// Single source of truth for which insight ids to surface in the teaser slot
// vs. the paywall slot, parameterised by user type from getUserType().
// Both PaywallModal and OrganizerScreen read from this same constant — keeping
// the priority lists in one place ensures the no-duplication guarantee holds
// (paywall filters out whatever the teaser actually showed).
//
// Notes:
//   - Some ids appear in multiple user types' lists with different roles
//     (e.g. mileage_gap is the side_hustle paywall pick AND the side_hustle
//     teaser pick — but only one of those will fire per session because the
//     teaser-exclusion filter removes whichever fired first).
//   - Agency teaser ids overlap with its paywall ids by design; the
//     no-duplication filter ensures the paywall falls through to the next
//     priority id when the teaser already used one.
const PRIORITY_MAP = {
  freelancer: {
    teaser:  ["mileage_gap", "subscription_velocity"],
    paywall: ["home_office_with_signal", "health_insurance_missing", "meals_high_dollar"],
  },
  agency: {
    teaser:  ["duplicate_entries", "meals_high_dollar"],
    paywall: ["duplicate_entries", "meals_high_dollar", "health_insurance_missing"],
  },
  side_hustle: {
    teaser:  ["mixed_use_100pct", "subscription_velocity"],
    paywall: ["mixed_use_100pct", "rounded_numbers", "mileage_gap"],
  },
};


// ── CATEGORY LABEL WITH TOOLTIP ─────────────────────────────────────────────
function CategoryLabel({ category, size = 12, showIcon = true, style = {} }) {
  const meta = CAT_META[category] || CAT_META["Other"];
  const def  = CATEGORY_DEFINITIONS[category] || "";
  const [hovered, setHovered] = useState(false);

  return (
    <span
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        cursor: "default",
        ...style,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {showIcon && <CatIcon category={category} size={size + 1} color={meta.color} />}
      <span style={{ fontSize: size, fontWeight: 600, color: meta.color }}>{category}</span>
      {/* ⓘ indicator */}
      <span style={{
        fontSize: size - 2,
        color: hovered ? meta.color : C.inkFaint,
        lineHeight: 1,
        transition: "color 0.15s",
        userSelect: "none",
        flexShrink: 0,
      }}>ⓘ</span>

      {/* Tooltip */}
      {hovered && def && (
        <span style={{
          position: "absolute",
          bottom: "calc(100% + 8px)",
          left: "50%",
          transform: "translateX(-50%)",
          background: C.ink,
          color: C.white,
          fontSize: 11,
          fontWeight: 400,
          lineHeight: 1.55,
          borderRadius: 10,
          padding: "9px 13px",
          width: 230,
          zIndex: 9000,
          boxShadow: "0 4px 20px rgba(0,0,0,0.25)",
          pointerEvents: "none",
          whiteSpace: "normal",
          textAlign: "left",
          fontFamily: "'DM Sans', sans-serif",
        }}>
          {/* Tooltip arrow */}
          <span style={{
            position: "absolute",
            bottom: -5,
            left: "50%",
            transform: "translateX(-50%)",
            width: 10, height: 10,
            background: C.ink,
            clipPath: "polygon(0 0, 100% 0, 50% 100%)",
          }} />
          <strong style={{ display: "block", marginBottom: 3, fontSize: 11, color: meta.color, display: "flex", alignItems: "center", gap: 5 }}>
            <CatIcon category={category} size={11} color={meta.color} /> {category}
          </strong>
          {def}
        </span>
      )}
    </span>
  );
}


// ─── NAV ─────────────────────────────────────────────────────────────────────
function Nav({ onLogoClick, receiptCount }) {
  return (
    <nav style={{
      padding: "16px 24px", display: "flex", alignItems: "center",
      justifyContent: "space-between", borderBottom: `1px solid ${C.creamDark}`,
      background: C.cream, position: "sticky", top: 0, zIndex: 100,
      backdropFilter: "blur(8px)",
    }}>
      <button onClick={onLogoClick} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, background: C.forest, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M3 1.5H15C15.4142 1.5 15.75 1.83579 15.75 2.25V16.5L13.5 15L11.25 16.5L9 15L6.75 16.5L4.5 15L2.25 16.5V2.25C2.25 1.83579 2.58579 1.5 3 1.5Z" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
  <path d="M5.25 6H12.75" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
  <path d="M5.25 9H12.75" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
  <path d="M5.25 12H9.75" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
</svg>
        </div>
        <span style={{ fontSize: 18, fontWeight: 700, color: C.ink, fontFamily: "'Fraunces', serif", letterSpacing: "-0.3px" }}>PreFile</span>
      </button>
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        {receiptCount > 0 && (
          <span style={{ fontSize: 12, fontWeight: 600, color: C.forest, background: "rgba(27,94,32,0.1)", padding: "4px 10px", borderRadius: 20 }}>
            {receiptCount} receipt{receiptCount !== 1 ? "s" : ""}
          </span>
        )}
        <span style={{ fontSize: 11, color: C.inkFaint, display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#22C55E", display: "inline-block" }} />
          No signup required
        </span>
      </div>
    </nav>
  );
}

// ─── ANIMATED COUNTER ─────────────────────────────────────────────────────────
function AnimCounter({ value, prefix = "", suffix = "" }) {
  const [n, setN] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const start = prev.current; const end = value;
    if (start === end) return;
    const dur = 600; const step = (end - start) / (dur / 16);
    let cur = start;
    const t = setInterval(() => {
      cur += step;
      if ((step > 0 && cur >= end) || (step < 0 && cur <= end)) { setN(end); prev.current = end; clearInterval(t); }
      else setN(Math.round(cur * 100) / 100);
    }, 16);
    return () => clearInterval(t);
  }, [value]);
  return <span>{prefix}{typeof value === "number" && !Number.isInteger(value) ? n.toFixed(2) : Math.round(n)}{suffix}</span>;
}

// ─── RECEIPT CARD (mini) ──────────────────────────────────────────────────────
function MiniReceiptCard({ receipt, style = {} }) {
  const meta = CAT_META[receipt.category] || CAT_META["Other"];
  return (
    <div style={{
      background: C.white, borderRadius: 13, padding: "12px 14px",
      display: "flex", alignItems: "center", gap: 12,
      border: `1px solid ${C.creamDark}`,
      boxShadow: "0 1px 8px rgba(0,0,0,0.05)",
      ...style,
    }}>
      <div style={{ width: 36, height: 36, borderRadius: 9, background: meta.color + "18", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        <CatIcon category={receipt.category} size={16} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: "'Fraunces', serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {receipt.merchant}
        </div>
        <div style={{ marginTop: 2 }}>
          <CategoryLabel category={receipt.category} size={11} showIcon={false} />
        </div>
      </div>
      <div style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: "'Fraunces', serif", flexShrink: 0 }}>
        ${parseFloat(receipt.amount).toFixed(2)}
      </div>
    </div>
  );
}

// ─── TOTALS SIDEBAR ───────────────────────────────────────────────────────────
function TotalsSidebar({ receipts }) {
  const total = receipts.reduce((s, r) => s + (parseFloat(r.businessAmount || r.amount) || 0), 0);
  const byCategory = {};
  receipts.forEach(r => {
    const cat = r.category;
    const amt = parseFloat(r.businessAmount || r.amount) || 0;
    byCategory[cat] = (byCategory[cat] || 0) + amt;
  });
  return (
    <div className="pf-card slide-up" style={{ padding: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>Organized so far</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: C.forest, fontFamily: "'Fraunces', serif", marginBottom: 16 }}>
        $<AnimCounter value={total} />
      </div>
      {Object.entries(byCategory).map(([cat, amt]) => {
        const meta = CAT_META[cat] || CAT_META["Other"];
        return (
          <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <CatIcon category={cat} size={14} color={meta.color} />
            <span style={{ fontSize: 12, color: C.inkLight, flex: 1 }}>{cat}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>${amt.toFixed(2)}</span>
          </div>
        );
      })}
      {receipts.length === 0 && <div style={{ fontSize: 12, color: C.inkFaint }}>No receipts yet</div>}
      <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${C.creamDark}`, fontSize: 10, color: C.inkFaint }}>
        For organization only · Not a tax calculation
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// HOMEPAGE
// ═══════════════════════════════════════════════════════════════════════════════
function Homepage({ onStart, onCheck }) {
  const [vis, setVis] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVis(true), 80); return () => clearTimeout(t); }, []);

  const previewReceipts = SAMPLE_MERCHANTS.slice(0, 2);

  return (
    <div style={{ fontFamily: "'DM Sans', sans-serif" }}>
      {/* HERO */}
      <section style={{ maxWidth: 1080, margin: "0 auto", padding: "56px 24px 72px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 40, alignItems: "center" }}>

          {/* LEFT */}
          <div style={{ maxWidth: 560 }}>
            <div style={{
              opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(20px)",
              transition: "opacity 0.5s, transform 0.5s",
            }}>
              <span style={{ display: "inline-block", background: "rgba(27,94,32,0.1)", color: C.forest, borderRadius: 20, padding: "4px 12px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 20 }}>
                Tax year {TAX_YEAR} · Freelancers, side hustlers, and small business owners
              </span>
            </div>

            <h1 style={{
              fontFamily: "'Fraunces', serif",
              fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 700, color: C.ink,
              lineHeight: 1.13, letterSpacing: "-0.8px", marginBottom: 18,
              opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(20px)",
              transition: "opacity 0.5s 0.07s, transform 0.5s 0.07s",
            }}>
              Stop reconstructing your year{" "}
              <em style={{ color: C.forest, fontStyle: "italic" }}>at tax time</em>
            </h1>

            <p style={{
              fontSize: 16, color: C.inkLight, lineHeight: 1.7, marginBottom: 16, maxWidth: 480,
              opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(20px)",
              transition: "opacity 0.5s 0.14s, transform 0.5s 0.14s",
            }}>
              PreFile helps you build your tax file as you go, so tax season feels calmer, cleaner, and far less overwhelming.
            </p>
            <p style={{
              fontSize: 14, color: C.inkLight, lineHeight: 1.65, marginBottom: 32, maxWidth: 480,
              opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(20px)",
              transition: "opacity 0.5s 0.18s, transform 0.5s 0.18s",
            }}>
              Keep your expenses organized in one place, highlight items to review, and turn your records into a filing-ready summary for your tax professional.
            </p>

            <div style={{
              display: "flex", flexDirection: "column", gap: 10, maxWidth: 380,
              opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(20px)",
              transition: "opacity 0.5s 0.21s, transform 0.5s 0.21s",
            }}>
              <button className="pf-btn-primary" onClick={() => { logEvent("CTA_START_CLICKED"); onStart(); }} style={{ width: "100%", fontSize: 16, padding: "16px 28px" }}>
                Start my tax file →
              </button>
              <div style={{ fontSize: 11, color: C.inkFaint, textAlign: "center", marginTop: 6 }}>
                Free to try · Save your progress as you go
              </div>
              <div>
                <button className="pf-btn-secondary" onClick={onCheck} style={{ width: "100%" }}>
                  See what I might be missing →
                </button>
                <div style={{ fontSize: 11, color: C.inkFaint, textAlign: "center", marginTop: 6 }}>
                  PreFile checks for common gaps, duplicates, and review items before tax season becomes a scramble
                </div>
              </div>
            </div>

            <div style={{
              marginTop: 22, fontSize: 11, color: C.inkFaint, display: "flex", alignItems: "center", flexWrap: "wrap",
              opacity: vis ? 1 : 0, transition: "opacity 0.5s 0.28s",
            }}>
              <span>No signup required</span><span className="trust-dot" />
              <span>Your data stays on your device</span><span className="trust-dot" />
              <span>Not tax advice</span>
            </div>
            <div style={{ marginTop: 6, fontSize: 11, color: C.forestLight, fontWeight: 600, opacity: vis ? 1 : 0, transition: "opacity 0.5s 0.3s" }}>
              Pay only to save and export
            </div>
          </div>

          {/* RIGHT — Preview (desktop: full 5, mobile: 2 cards) */}
          <div style={{
            opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(20px)",
            transition: "opacity 0.5s 0.32s, transform 0.5s 0.32s",
          }}>
            <div style={{ background: C.creamDark, borderRadius: 22, padding: 20 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 11, fontWeight: 600, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.07em" }}>Tracked expenses</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: C.ink, fontFamily: "'Fraunces', serif", marginTop: 2 }}>$146.89</div>
                </div>
                <div style={{ background: C.forest, color: C.white, fontSize: 11, fontWeight: 700, padding: "5px 11px", borderRadius: 8 }}>
                  5 receipts
                </div>
              </div>

              {/* Mobile: show 2, Desktop: show all 5 */}
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {SAMPLE_MERCHANTS.map((r, i) => (
                  <div key={i} style={{
                    display: i >= 2 ? undefined : undefined,
                  }} className={i >= 2 ? "hide-on-mobile" : ""}>
                    <MiniReceiptCard receipt={r} />
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 14, background: C.forest, borderRadius: 12, padding: "11px 16px", display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#A5D6A7", fontSize: 12, fontWeight: 600 }}>Total tracked</span>
                <span style={{ color: C.white, fontSize: 17, fontWeight: 700, fontFamily: "'Fraunces', serif" }}>$146.89</span>
              </div>
              <div style={{ marginTop: 8, fontSize: 10, color: C.inkFaint, textAlign: "center" }}>For organization only · Confirm deductibility with your tax professional</div>
            </div>
          </div>

        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ background: C.ink, padding: "60px 24px" }}>
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 44 }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: C.forestLight, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 10 }}>How it works</div>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: C.white, letterSpacing: "-0.4px" }}>Skip the tax-time scramble</h2>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.72)", maxWidth: 640, lineHeight: 1.7, textAlign: "center", margin: "12px auto 0" }}>
              You don't need to build spreadsheets, guess categories, or organize everything manually. PreFile structures your receipts for you — so you can focus on reviewing, not figuring it out.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 20 }}>
            {[
              { n:"01", iconName:"receipt", title:"Add your receipts", body:"Type in any receipt — meals, software, shipping, phone bills." },
              { n:"02", iconName:"clipboard", title:"PreFile suggests a category", body:"We match common merchants automatically. You confirm or change — you always decide." },
              { n:"03", iconName:"download", title:"Download your organizer", body:"A clean, color-coded summary — filing-ready for your tax professional." },
            ].map((s, i) => (
              <div key={i} style={{ background:"rgba(255,255,255,0.05)", borderRadius:16, padding:"26px 22px", border:"1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.forestLight, letterSpacing:"0.1em", marginBottom:10 }}>{s.n}</div>
                <div style={{ marginBottom:10 }}><Icon name={s.iconName} size={26} color={C.forestLight} strokeWidth={1.5} /></div>
                <div style={{ fontSize:15, fontWeight:700, color:C.white, fontFamily:"'Fraunces', serif", marginBottom:7 }}>{s.title}</div>
                <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)", lineHeight:1.65 }}>{s.body}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DIFFERENTIATION */}
      <section style={{ padding: "60px 24px", background: C.cream }}>
        <div style={{ maxWidth: 720, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{
            fontFamily: "'Fraunces', serif",
            fontSize: "clamp(22px,3.5vw,34px)", fontWeight: 700, color: C.ink,
            letterSpacing: "-0.4px", marginBottom: 14,
          }}>
            Not a spreadsheet. A prepared summary.
          </h2>
          <p style={{ fontSize: 15, color: C.inkLight, lineHeight: 1.65, margin: 0 }}>
            Spreadsheets require setup, formulas, and manual organization. PreFile does the structuring for you — and shows what actually matters.
          </p>
        </div>
      </section>

      {/* CATEGORIES */}
      <section style={{ padding: "48px 24px", background: C.cream }}>
        <div style={{ maxWidth: 860, margin: "0 auto", textAlign: "center", marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: C.inkFaint, fontWeight: 500 }}>Covers all common freelancer expense categories</div>
        </div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap", justifyContent: "center", maxWidth: 860, margin: "0 auto" }}>
          {CATEGORIES.map((cat, i) => {
            const meta = CAT_META[cat] || CAT_META["Other"];
            return (
              <span key={i}
                title={CATEGORY_DEFINITIONS[cat] || cat}
                style={{
                  background: C.white, border: `1px solid ${C.creamDark}`,
                  borderRadius: 20, padding: "6px 13px", fontSize: 12, fontWeight: 600, color: C.inkLight,
                  display: "flex", alignItems: "center", gap: 5, cursor: "default",
                }}>
                <CatIcon category={cat} size={13} />{cat}
                <span style={{ fontSize: 10, color: C.inkFaint }}>ⓘ</span>
              </span>
            );
          })}
        </div>
      </section>

      {/* PAIN POINTS */}
      <section style={{ padding: "60px 24px", background: C.creamDark }}>
        <div style={{ maxWidth: 860, margin: "0 auto" }}>
          <h2 style={{ fontFamily:"'Fraunces', serif", fontSize:"clamp(22px,3.5vw,34px)", fontWeight:700, color:C.ink, textAlign:"center", marginBottom:36, letterSpacing:"-0.4px" }}>
            Sound familiar?
          </h2>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(240px, 1fr))", gap:14 }}>
            {[
              "Receipts scattered everywhere — email, photos, paper, apps",
              "Can't tell what was business vs personal",
              "Scrambling the night before your tax appointment",
              "Worried you're missing deductions you actually qualify for",
            ].map((pain, i) => (
              <div key={i} className="pf-card" style={{ padding:"18px 18px", display:"flex", gap:12, alignItems:"flex-start" }}>
                <span style={{ flexShrink:0, marginTop:1 }}><Icon name="checkCircle" size={17} color={C.forestMid} strokeWidth={2} /></span>
                <span style={{ fontSize:13, color:C.inkLight, lineHeight:1.65 }}>{pain}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section style={{ padding:"68px 24px", background:C.forest, textAlign:"center" }}>
        <h2 style={{ fontFamily:"'Fraunces', serif", fontSize:"clamp(24px,4vw,38px)", fontWeight:700, color:C.white, letterSpacing:"-0.4px", marginBottom:12 }}>
          Don't reconstruct it later
        </h2>
        <p style={{ color:"rgba(255,255,255,0.65)", fontSize:15, marginBottom:30, maxWidth:380, margin:"0 auto 30px" }}>
          No account needed. Start adding receipts in seconds.
        </p>
        <button className="pf-btn-primary" onClick={() => { logEvent("CTA_START_CLICKED"); onStart(); }} style={{ background:C.white, color:C.forest, boxShadow:"0 4px 20px rgba(0,0,0,0.18)", margin:"0 auto", padding:"16px 36px", fontSize:16 }}>
          Start my tax file →
        </button>
        <div style={{ marginTop:12, fontSize:12, color:"rgba(255,255,255,0.7)" }}>
          You stay in control — review everything before filing.
        </div>
        <div style={{ marginTop:18, fontSize:11, color:"rgba(255,255,255,0.4)" }}>
          PreFile prepares filing-ready data for your tax professional — not tax advice. Always verify with your tax professional.
        </div>
      </section>
      <DisclaimerFooter />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// RECEIPT FLOW
// step: "add" | "processing" | "confirm" | "edit" | "list"
// ═══════════════════════════════════════════════════════════════════════════════

// STEP 1 — CHOOSE WHAT TO ADD
function AddReceiptScreen({ onMethod, isMobile }) {
  const options = [
    {
      id: "schedule-c",
      title: "Business expense",
      subtitle: "Schedule C · Merchant, amount, date, and category",
      icon: "🧾",
    },
    {
      id: "schedule-d",
      title: "Investment sale",
      subtitle: "Schedule D · Asset, dates, proceeds, and cost basis",
      icon: "📈",
    },
    {
      id: "schedule-1",
      title: "Adjustment or additional income",
      subtitle: "Schedule 1 · Item type, amount, and notes",
      icon: "🗂️",
    },
  ];

  return (
    <div className="slide-up" style={{ maxWidth: 560, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ marginBottom: 28 }}>
        <div className="pf-label">Choose what to add</div>
        <h2 style={{ fontFamily:"'Fraunces', serif", fontSize:28, fontWeight:700, color:C.ink, letterSpacing:"-0.4px", marginBottom:8 }}>
          Build your tax file
        </h2>
        <p style={{ fontSize:14, color:C.inkLight, lineHeight:1.65 }}>
          Pick the kind of item you want to add, then we’ll take you to the right form.
        </p>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
        {options.map(option => (
          <button
            key={option.id}
            className="method-card"
            onClick={() => onMethod(option.id)}
            style={{ width:"100%", flexDirection:"row", justifyContent:"flex-start", padding:"16px 20px", gap:14 }}
          >
            <span style={{ fontSize:24 }}>{option.icon}</span>
            <div style={{ textAlign:"left" }}>
              <div style={{ fontSize:14, fontWeight:600, color:C.ink }}>{option.title}</div>
              <div style={{ fontSize:12, color:C.inkFaint }}>{option.subtitle}</div>
            </div>
          </button>
        ))}
      </div>

      <div style={{ marginTop:20, fontSize:11, color:C.inkFaint, textAlign:"center" }}>
        You decide what is deductible · PreFile prepares the data — not tax advice
      </div>
      <DisclaimerFooter compact />
    </div>
  );
}

// STEP 2 — PROCESSING / MANUAL ENTRY
// Manual-first product phase: this screen is the manual entry form.
// The legacy upload/scan extraction path (fake "Reading your receipt…"
// timers + random SAMPLE_MERCHANTS injection) has been removed. The
// `method` prop is still accepted for caller-API stability but no longer
// affects behavior — every entry path lands directly in the manual form.
function ProcessingScreen({ method, onExtracted, receipts = [] }) {
  const [manualData, setManualData] = useState({ merchant: "", amount: "", date: new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}), category: "" });

  // Manual entry form
  const handleManualSubmit = () => {
    if (!manualData.merchant || !manualData.amount) return;
    const cat = manualData.category || suggestCategory(manualData.merchant);
    const tag = suggestTag(manualData.merchant);
    onExtracted({ ...manualData, category: cat, tag, id: Date.now(), businessPct: 100 });
  };

  return (
    <div className="slide-up" style={{ maxWidth:520, margin:"0 auto", padding:"40px 24px" }}>
      <div style={{ marginBottom:24 }}>
        <div className="pf-label">Step 2 of 3</div>
        <div className="progress-bar"><div className="progress-fill" style={{ width:"66%" }} /></div>
        <h2 style={{ fontFamily:"'Fraunces', serif", fontSize:26, fontWeight:700, color:C.ink, letterSpacing:"-0.3px", marginBottom:6 }}>Enter business expense details</h2>
        <p style={{ fontSize:13, color:C.inkLight }}>Fill in what you know — we'll suggest a category for you to review</p>
      </div>

      <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
        <div>
          <div className="pf-label">Merchant / store name</div>
          <input className="pf-input" placeholder="e.g. Canva, Starbucks, USPS" value={manualData.merchant}
            onChange={e => {
              const v = e.target.value;
              const suggested = suggestCategory(v);
              setManualData(d => ({ ...d, merchant: v, category: d.category || suggested }));
            }} />
          {/* Merchant memory: prefix-match suggestions from prior receipts.
              Renders only when 2+ chars typed AND 2+ unique prior matches available.
              Tap a row to fill the field. */}
          {(() => {
            const typed = (manualData.merchant || "").trim();
            if (typed.length < 2) return null;
            const lower = typed.toLowerCase();
            // Most-recent-first by reversing receipts (later entries are more recent in the stored array)
            const seen = new Set();
            const matches = [];
            for (let i = receipts.length - 1; i >= 0; i--) {
              const m = (receipts[i].merchant || "").trim();
              if (!m) continue;
              const key = m.toLowerCase();
              if (seen.has(key)) continue;
              if (key === lower) continue; // exact match isn't a useful suggestion
              if (!key.startsWith(lower)) continue;
              seen.add(key);
              matches.push(m);
              if (matches.length >= 5) break;
            }
            if (matches.length < 2) return null;
            return (
              <div style={{
                marginTop: 6, border: `1px solid ${C.creamDeep}`,
                borderRadius: 10, overflow: "hidden",
                background: C.white,
              }}>
                {matches.map((m, idx) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      const suggested = suggestCategory(m);
                      setManualData(d => ({ ...d, merchant: m, category: d.category || suggested }));
                    }}
                    style={{
                      display: "block", width: "100%", textAlign: "left",
                      background: "transparent", border: "none",
                      padding: "8px 12px", fontSize: 13, color: C.ink,
                      cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                      borderTop: idx > 0 ? `1px solid ${C.creamDark}` : "none",
                      transition: "background 0.12s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = C.cream; }}
                    onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
                  >
                    <span style={{ color: C.inkLight }}>↳ </span>{m}
                  </button>
                ))}
              </div>
            );
          })()}
          {manualData.merchant && !manualData.category && (
            <div style={{ fontSize:11, color:C.forest, marginTop:4 }}>
              Suggested based on common patterns (please review): {suggestCategory(manualData.merchant)}
            </div>
          )}
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:14 }}>
          <div>
            <div className="pf-label">Amount ($)</div>
            <input className="pf-input" type="number" placeholder="0.00" value={manualData.amount}
              onChange={e => setManualData(d => ({ ...d, amount: e.target.value }))} />
          </div>
          <div>
            <div className="pf-label">Date</div>
            <input className="pf-input" type="date" value={manualData.date}
              onChange={e => setManualData(d => ({ ...d, date: e.target.value }))} />
          </div>
        </div>

        <div>
          <div className="pf-label">Category</div>
          <select className="pf-select" value={manualData.category || suggestCategory(manualData.merchant)}
            onChange={e => setManualData(d => ({ ...d, category: e.target.value }))}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <button className="pf-btn-primary" onClick={handleManualSubmit} style={{ width:"100%", opacity: (!manualData.merchant || !manualData.amount) ? 0.4 : 1 }}
          disabled={!manualData.merchant || !manualData.amount}>
          Review receipt →
        </button>
      </div>
      <DisclaimerFooter compact />
    </div>
  );
}

// STEP 3 — CONFIRMATION
function ConfirmScreen({ receipt, onConfirm, onEdit }) {
  const meta = CAT_META[receipt.category] || CAT_META["Other"];
  return (
    <div className="slide-up" style={{ maxWidth:520, margin:"0 auto", padding:"40px 24px" }}>
      <div style={{ marginBottom:24 }}>
        <div className="pf-label">Step 3 of 3</div>
        <div className="progress-bar"><div className="progress-fill" style={{ width:"100%" }} /></div>
        <h2 style={{ fontFamily:"'Fraunces', serif", fontSize:26, fontWeight:700, color:C.ink, letterSpacing:"-0.3px", marginBottom:6 }}>Does this look correct?</h2>
        <p style={{ fontSize:13, color:C.inkLight }}>Suggested category based on common patterns (please review)</p>
      </div>

      <div className="pf-card" style={{ padding:24, marginBottom:20 }}>
        {/* Category badge */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
          <div style={{ width:48, height:48, borderRadius:12, background:meta.color+"18", display:"flex", alignItems:"center", justifyContent:"center" }}>
            <CatIcon category={receipt.category} size={22} color={meta.color} />
          </div>
          <div>
            <div style={{ fontSize:11, color:C.inkFaint, fontWeight:600, marginBottom:2 }}>Suggested category based on common patterns (please review)</div>
            <CategoryLabel category={receipt.category} size={14} />
          </div>
        </div>

        {/* Fields */}
        {[
          { label:"Merchant", value:receipt.merchant },
          { label:"Amount", value:`$${parseFloat(receipt.amount).toFixed(2)}` },
          { label:"Date", value:receipt.date },
          { label:"Business use", value:`${receipt.businessPct || 100}%` },
        ].map(f => (
          <div key={f.label} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"10px 0", borderBottom:`1px solid ${C.creamDark}` }}>
            <span style={{ fontSize:12, color:C.inkFaint, fontWeight:600 }}>{f.label}</span>
            <span style={{ fontSize:14, fontWeight:700, color:C.ink, fontFamily:"'Fraunces', serif" }}>{f.value}</span>
          </div>
        ))}
      </div>

      <div style={{ display:"flex", gap:10, marginBottom:16 }}>
        <button className="pf-btn-primary" onClick={onConfirm} style={{ flex:2 }}>
          ✓ Confirm & add
        </button>
        <button className="pf-btn-secondary" onClick={onEdit} style={{ flex:1 }}>
          Edit
        </button>
      </div>

      <div style={{
        textAlign:"center", fontSize:11, color:C.inkFaint,
        padding:"10px 14px", background:"rgba(212,160,23,0.08)",
        borderRadius:8, border:"1px solid rgba(212,160,23,0.2)",
        lineHeight:1.5,
      }}>
        {PREFILE_USER_RESPONSIBILITY}
      </div>
      <DisclaimerFooter compact />
    </div>
  );
}

// STEP 3b — EDIT MODE
function EditScreen({ receipt, onSave, onCancel }) {
  const [data, setData] = useState({ ...receipt });
  const meta = CAT_META[data.category] || CAT_META["Other"];

  return (
    <div className="slide-up" style={{ maxWidth:520, margin:"0 auto", padding:"40px 24px" }}>
      <div style={{ marginBottom:24 }}>
        <div className="pf-label">Edit receipt</div>
        <div className="progress-bar"><div className="progress-fill" style={{ width:"100%" }} /></div>
        <h2 style={{ fontFamily:"'Fraunces', serif", fontSize:26, fontWeight:700, color:C.ink, letterSpacing:"-0.3px", marginBottom:6 }}>Edit details</h2>
        <p style={{ fontSize:13, color:C.inkLight }}>Adjust merchant, amount, or category</p>
      </div>

      <div className="pf-card" style={{ padding:20, marginBottom:16 }}>
        <div style={{ display:"flex", flexDirection:"column", gap:14 }}>
          <div>
            <div className="pf-label">Merchant</div>
            <input className="pf-input" value={data.merchant} onChange={e => setData(d => ({ ...d, merchant: e.target.value }))} />
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
            <div>
              <div className="pf-label">Amount ($)</div>
              <input className="pf-input" type="number" value={data.amount} onChange={e => setData(d => ({ ...d, amount: e.target.value }))} />
            </div>
            <div>
              <div className="pf-label">Date</div>
              <input className="pf-input" value={data.date} onChange={e => setData(d => ({ ...d, date: e.target.value }))} />
            </div>
          </div>
          <div>
            <div className="pf-label">Category</div>
            <select className="pf-select" value={data.category} onChange={e => setData(d => ({ ...d, category: e.target.value }))}>
              {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            {data.tag && TAG_META[data.tag] && (
              <div style={{
                display: "inline-flex", alignItems: "center", gap: 6,
                marginTop: 8, padding: "4px 8px 4px 10px",
                background: "rgba(27,94,32,0.08)",
                border: `1px solid rgba(27,94,32,0.18)`,
                borderRadius: 12, fontSize: 11, color: C.forest, fontWeight: 600,
              }}>
                <span>{TAG_META[data.tag].label}</span>
                <button
                  onClick={() => setData(d => ({ ...d, tag: null }))}
                  title="Remove this tag"
                  aria-label={`Remove ${TAG_META[data.tag].label} tag`}
                  style={{
                    background: "transparent", border: "none", padding: 0,
                    color: C.forest, cursor: "pointer", fontSize: 14, lineHeight: 1,
                    width: 16, height: 16, display: "flex", alignItems: "center", justifyContent: "center",
                  }}
                >×</button>
              </div>
            )}
            {data.tag && TAG_META[data.tag] && (
              <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 6, lineHeight: 1.4 }}>
                Used for tax grouping — remove if incorrect.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mixed expense section */}
      <div className="pf-card" style={{ padding:20, marginBottom:20, border:`1.5px solid ${C.creamDeep}` }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:12 }}>
          <div>
            <div style={{ fontSize:13, fontWeight:700, color:C.ink }}>Mixed personal / business?</div>
            <div style={{ fontSize:11, color:C.inkFaint, marginTop:3 }}>For mixed expenses, enter estimated % used for business</div>
          </div>
          <span style={{ fontSize:16 }}>🔀</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <input className="pf-input" type="number" min={0} max={100}
            value={data.businessPct || 100}
            onChange={e => setData(d => ({ ...d, businessPct: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }))}
            style={{ width:80 }} />
          <span style={{ fontSize:13, color:C.inkLight }}>% business use</span>
        </div>
        <div style={{ marginTop:10, display:"flex", gap:8, flexWrap:"wrap" }}>
          {[30, 50, 60, 70, 80, 100].map(pct => (
            <button key={pct} onClick={() => setData(d => ({ ...d, businessPct: pct }))}
              style={{
                padding:"4px 12px", borderRadius:20, fontSize:11, fontWeight:600, cursor:"pointer", border:"1.5px solid",
                borderColor: data.businessPct === pct ? C.forest : C.creamDeep,
                background: data.businessPct === pct ? C.forest : C.white,
                color: data.businessPct === pct ? C.white : C.inkLight,
                transition:"all 0.15s",
              }}>
              {pct}%
            </button>
          ))}
        </div>
        {data.businessPct < 100 && (
          <div style={{ marginTop:10, fontSize:11, color:C.forest, background:"rgba(27,94,32,0.06)", borderRadius:8, padding:"7px 10px" }}>
            Business amount: ${((parseFloat(data.amount) || 0) * (data.businessPct / 100)).toFixed(2)} of ${parseFloat(data.amount || 0).toFixed(2)}
          </div>
        )}
        <div style={{ marginTop:8, fontSize:10, color:C.inkFaint }}>
          Common examples: Phone 30–70% · Internet 40–70% · Home office based on workspace %
        </div>
      </div>

      <div style={{ display:"flex", gap:10 }}>
        <button className="pf-btn-primary" onClick={() => onSave(data)} style={{ flex:2 }}>Save changes →</button>
        <button className="pf-btn-secondary" onClick={onCancel} style={{ flex:1 }}>Cancel</button>
      </div>
      <DisclaimerFooter compact />
    </div>
  );
}

// RECEIPT LIST / ORGANIZER SCREEN

// ═══════════════════════════════════════════════════════════════════════════════
// PAYWALL MODAL
// ═══════════════════════════════════════════════════════════════════════════════

// ─── INSIGHT FORMATTERS (teaser + paywall) ──────────────────────────────────
// Maps an insight id to display copy for two surfaces:
//   - TEASER_BY_ID: pre-paywall teaser (curiosity-driven, lightweight, 1 sentence)
//   - PAYWALL_BY_ID: paywall pre-CTA slot (specific, calm, attributes review
//     action to the tax professional, 1 sentence)
//
// Both formatters accept a `userType` parameter for forward compatibility —
// the user-type-aware differentiation currently happens upstream in
// PRIORITY_MAP (which selects WHICH insight is shown per user type), so the
// copy itself is uniform across user types. If a future iteration wants
// per-user-type variants (e.g., agency users see audit-defensibility framing
// of mileage_gap while side_hustle users see correctness framing), wire it
// through the formatter without changing call sites.
//
// Falls back to insight.line (full computeInsights prose) if an id isn't
// in the map — defense in depth so a new insight can ship without breaking
// the render path.
const TEASER_BY_ID = {
  mileage_gap:              "You may be missing a significant amount of business mileage.",
  mixed_use_100pct:         "Some expenses may be marked as 100% business when they shouldn't be.",
  health_insurance_missing: "A major deduction may be missing from your file.",
  duplicate_entries:        "Duplicate transactions may be inflating your expenses.",
  subscription_velocity:    "Your subscriptions suggest your yearly totals may be incomplete.",
  meals_high_dollar:        "Your meals may be higher than typical ranges.",
  meals_50pct:              "Some meal expenses may need adjustment.",
  home_office_with_signal:  "You may be missing a home office deduction.",
};
const PAYWALL_BY_ID = {
  mileage_gap:              "Your file flags possible missing mileage deductions of $1,500–$3,000. Adjust if needed.",
  health_insurance_missing: "Your file flags no self-employed health insurance — a deduction typically worth $4,800–$9,600. Confirm with your tax professional.",
  home_office_with_signal:  "Your file flags a possible home office deduction — up to $1,500. Adjust if needed.",
  meals_high_dollar:        "Your file flags higher-dollar meals that need documented attendees and business purpose. Review before filing.",
  mixed_use_100pct:         "Your file flags mixed-use purchases marked 100% business. Adjust if needed.",
  duplicate_entries:        "Your file flags possible duplicate entries. Review before filing.",
  rounded_numbers:          "Your file flags entries that appear as rounded amounts. Review before filing.",
  subscription_velocity:    "Your file flags recurring charges that span less than a full year. Confirm with your tax professional.",
  meals_50pct:              "Your file flags meals filed at 100% — these are typically 50% deductible. Confirm with your tax professional.",
};

// eslint-disable-next-line no-unused-vars
function formatTeaserInsight(insight, userType) {
  if (!insight) return "";
  // Prefer the specific compute-side .line string over the generic TEASER_BY_ID
  // copy — the .line string is anchored in the user's actual numbers/merchants
  // and lands the "I would have missed this on my own" moment. TEASER_BY_ID
  // remains as a defensive fallback if .line is ever missing.
  return insight.line || TEASER_BY_ID[insight.id] || "";
}

// eslint-disable-next-line no-unused-vars
function formatPaywallInsight(insight, userType) {
  if (!insight) return "";
  return PAYWALL_BY_ID[insight.id] || insight.line || "";
}

function PaywallModal({ onUnlock, onDismiss, receiptCount = 0, hiddenInsightsCount = 0, receipts = [] }) {
  const [preparing, setPreparing] = useState(false);
  // Insight selection is driven by user-type-aware priority lists from
  // PRIORITY_MAP. Both screens compute the same userType from the same
  // receipts, so they pick the same teaser id deterministically — and the
  // paywall's unseenInsights filter therefore reliably excludes the teaser
  // the user just saw.
  const { tier1, tier2 } = computeInsights(receipts);
  const userType = getUserType(receipts);
  const teaserInsight =
    PRIORITY_MAP[userType].teaser
      .map(id => tier1.find(i => i.id === id))
      .find(Boolean)
    || tier1[0]
    || null;
  const allCandidates = [...tier1, ...tier2];
  const unseenInsights = allCandidates.filter(ins => ins.id !== teaserInsight?.id);
  const paywallInsight =
    PRIORITY_MAP[userType].paywall
      .map(id => unseenInsights.find(i => i.id === id))
      .find(Boolean)
    || [...unseenInsights].sort((a, b) => b.conversionScore - a.conversionScore)[0]
    || null;
  const valueItems = [
    `${receiptCount} receipts organized`,
    "Totals by category",
    "Items worth reviewing",
    "Clean format ready for filing",
  ];

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: "24px",
    }}>
      {/* Backdrop */}
      <div
        onClick={onDismiss}
        style={{
          position: "absolute", inset: 0,
          background: "rgba(26,26,24,0.6)",
          backdropFilter: "blur(5px)",
        }}
      />

      {/* Modal card */}
      <div className="slide-up pf-card" style={{
        position: "relative", zIndex: 1,
        maxWidth: 400, width: "100%",
        padding: 24,
      }}>
        {/* Close */}
        <button
          onClick={onDismiss}
          style={{
            position: "absolute", top: 14, right: 14,
            background: C.creamDark, border: "none", borderRadius: 8,
            width: 26, height: 26, display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer",
            fontSize: 13, color: C.inkFaint, fontFamily: "'DM Sans', sans-serif",
          }}
        >✕</button>

        {/* Icon */}
        <div style={{
          width: 48, height: 48, borderRadius: 13,
          background: C.forest, display: "flex", alignItems: "center",
          justifyContent: "center", marginBottom: 16,
        }}>
          <svg width="24" height="24" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M3 1.5H15C15.4142 1.5 15.75 1.83579 15.75 2.25V16.5L13.5 15L11.25 16.5L9 15L6.75 16.5L4.5 15L2.25 16.5V2.25C2.25 1.83579 2.58579 1.5 3 1.5Z" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M5.25 6H12.75" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M5.25 9H12.75" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
            <path d="M5.25 12H9.75" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </div>

        {/* Completion-framed headline — calm, final, no stacked persuasion */}
        <h2 style={{
          fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700,
          color: C.ink, letterSpacing: "-0.3px", marginBottom: 6,
        }}>
          Your filing-ready summary is complete.
        </h2>
        <p style={{ fontSize: 13, color: C.inkLight, lineHeight: 1.6, marginBottom: 18 }}>
          This is the version your tax professional actually needs — categorized, totaled, and ready to review. What usually takes 4+ hours of cleanup is already done.
        </p>

        {/* Spreadsheet preview */}
        <div style={{
          fontSize: 11, fontWeight: 600, color: C.inkFaint,
          textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6,
        }}>
          Preview of your organized summary
        </div>
        <div style={{
          border: `1px solid ${C.creamDeep}`, borderRadius: 10,
          overflow: "hidden", marginBottom: 14,
        }}>
          <div style={{
            background: "linear-gradient(180deg, #eef6f0 0%, #e6f2ea 100%)", display: "grid",
            gridTemplateColumns: "60px 1fr 1fr 56px",
            padding: "10px 8px", gap: 6,
            borderBottom: "1px solid #d6e8dc",
          }}>
            {["Date","Merchant","Category","Amount"].map(h => (
              <span key={h} style={{ fontSize: 9, fontWeight: 700, color: "#1f5f2e", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
            ))}
          </div>
          {[
            ["Apr 18", "Canva Pro", "Software & subscriptions", "$12.99"],
            ["Apr 15", "USPS Shipping", "Supplies", "$47.80"],
            ["Apr 12", "Starbucks", "Business meals", "$38.50"],
          ].map((row, i) => (
            <div key={i} style={{
              display: "grid", gridTemplateColumns: "60px 1fr 1fr 56px",
              padding: "6px 10px", gap: 6,
              background: i % 2 === 0 ? C.white : C.cream,
              borderTop: `1px solid ${C.creamDark}`,
            }}>
              {row.map((cell, ci) => (
                <span key={ci} style={{
                  fontSize: 10, color: ci === 0 ? C.inkFaint : ci === 3 ? C.ink : C.inkLight,
                  fontWeight: ci === 3 ? 700 : 400,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{cell}</span>
              ))}
            </div>
          ))}
          <div style={{ padding: "5px 10px", background: C.creamDark, borderTop: `1px solid ${C.creamDeep}` }}>
            <span style={{ fontSize: 9, color: C.inkFaint, fontStyle: "italic" }}>Preview of your file — your actual receipts will appear here</span>
          </div>
        </div>

        {/* Price */}
        <div style={{
          background: C.creamDark, borderRadius: 11, padding: "11px 14px",
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          marginBottom: 14,
        }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 700, color: C.forest }}>$12</div>
        </div>

        {/* Calm one-line summary of the strongest insight — sits directly above CTA */}
        {paywallInsight && (
          <div style={{ fontSize: 12, color: C.inkLight, textAlign: "center", marginBottom: 10, lineHeight: 1.5 }}>
            {formatPaywallInsight(paywallInsight, userType)}
          </div>
        )}

        {/* Primary CTA */}
        <button
          className="pf-btn-primary"
          onClick={() => {
            if (preparing) return;
            logEvent("PAY_CLICKED", { count: receiptCount, userType: getUserType(receipts) });
            setPreparing(true);
            // Brief loading transition before paywall closes (lets user see acknowledgment)
            setTimeout(() => onUnlock(), 400);
          }}
          disabled={preparing}
          style={{
            width: "100%", fontSize: 15, padding: "14px", marginBottom: 6,
            opacity: preparing ? 0.85 : 1,
            cursor: preparing ? "not-allowed" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
          }}
        >
          {preparing ? (
            <>
              <svg
                className="spin"
                width="16" height="16" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.5"
                strokeLinecap="round" strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
              </svg>
              Preparing your summary…
            </>
          ) : (
            "Download my filing-ready summary — $12"
          )}
        </button>
        <div style={{ fontSize: 11, color: C.inkFaint, textAlign: "center", marginTop: 6, marginBottom: 12 }}>
          One-time $12 — your file downloads right away. Yours to keep — no subscription, no account.
        </div>

        <button
          className="pf-btn-ghost"
          onClick={onDismiss}
          style={{ width: "100%", textAlign: "center", marginBottom: 12 }}
        >
          Continue without saving
        </button>

        {/* Legal */}
        <div style={{
          marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.creamDark}`,
          fontSize: 10, color: C.inkFaint, lineHeight: 1.55, textAlign: "center",
        }}>
          {PREFILE_SHORT_DISCLAIMER}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORGANIZER SCREEN — UPDATED WITH PART 1 IMPROVEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

// ── MISSING DEDUCTIONS PANEL ─────────────────────────────────────────────────
function MissingDeductionsPanel({ receipts }) {
  const presentCats = new Set(receipts.map(r => r.category));
  const missing = COMMON_FREELANCER_CATS.filter(cat => !presentCats.has(cat));
  const coverage = COMMON_FREELANCER_CATS.filter(cat => presentCats.has(cat)).length;
  const isStrong = coverage >= 3;
  const [expanded, setExpanded] = useState(true);

  // Only show if user has at least 1 receipt
  if (receipts.length === 0) return null;

  return (
    <div className="pf-card fade-in" style={{
      marginBottom: 20,
      border: `1.5px solid ${isStrong ? "rgba(27,94,32,0.2)" : "rgba(214,158,0,0.25)"}`,
      overflow: "hidden",
    }}>
      {/* Header — always visible */}
      <button
        onClick={() => setExpanded(e => !e)}
        style={{
          width: "100%", background: "none", border: "none", cursor: "pointer",
          padding: "14px 18px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: "'DM Sans', sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <Icon
            name={isStrong ? "checkCircle" : "zap"}
            size={16}
            color={isStrong ? C.forestMid : "#B45309"}
            strokeWidth={2}
          />
          <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
            {isStrong
              ? "You've captured most common expense categories"
              : "You're likely missing a few deductions — review before exporting"
            }
          </span>
        </div>
        <Icon
          name={expanded ? "checkCircle" : "zap"}
          size={14}
          color={C.inkFaint}
          strokeWidth={1.8}
          style={{ transform: expanded ? "rotate(0deg)" : "rotate(180deg)", transition: "transform 0.2s" }}
        />
      </button>

      {/* Coverage bar */}
      <div style={{ paddingInline: 18, paddingBottom: expanded ? 0 : 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: expanded ? 12 : 0 }}>
          <div style={{
            flex: 1, height: 5, background: C.creamDeep, borderRadius: 10, overflow: "hidden",
          }}>
            <div style={{
              height: "100%",
              width: `${(coverage / COMMON_FREELANCER_CATS.length) * 100}%`,
              background: isStrong ? C.forestMid : "#D97706",
              borderRadius: 10,
              transition: "width 0.6s ease",
            }} />
          </div>
          <span style={{ fontSize: 11, color: C.inkFaint, whiteSpace: "nowrap", flexShrink: 0 }}>
            {coverage} of {COMMON_FREELANCER_CATS.length} common categories
          </span>
        </div>
      </div>

      {/* Missing categories — collapsible */}
      {expanded && missing.length > 0 && (
        <div style={{ paddingInline: 18, paddingBottom: 16 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
            You might be missing these common deductions:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {missing.map(cat => {
              const meta = CAT_META[cat] || CAT_META["Other"];
              const shortDef = SHORT_DEFS[cat] || CATEGORY_DEFINITIONS[cat] || "";
              return (
                <div key={cat} style={{
                  background: C.cream,
                  border: `1px solid ${C.creamDeep}`,
                  borderLeft: `3px solid ${meta.color}`,
                  borderRadius: "0 10px 10px 0",
                  padding: "11px 14px",
                }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <CatIcon category={cat} size={13} />
                    <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>{cat}</span>
                  </div>
                  <p style={{ fontSize: 11, color: C.inkLight, lineHeight: 1.6, margin: "0 0 6px" }}>
                    {shortDef}
                  </p>
                  <p style={{ fontSize: 10, color: C.inkFaint, fontStyle: "italic", margin: 0, lineHeight: 1.5 }}>
                    Many freelancers forget to track this — even small amounts add up over the year.
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {expanded && missing.length === 0 && (
        <div style={{ padding: "4px 18px 16px", fontSize: 12, color: C.forestMid }}>
          Great — you have receipts across all commonly missed categories.
        </div>
      )}
    </div>
  );
}


// ─── SMART ASSISTANT — MISSING DEDUCTION DETECTOR ────────────────────────────
const COMMON_FREELANCER_CATS = [
  "Business meals",
  "Software & subscriptions",
  "Utilities",
  "Rent / workspace",
  "Insurance",
];

const SHORT_DEFS = {
  "Business meals":          "Client meals, coffee meetings, working lunches — 50% deductible with a business purpose.",
  "Software & subscriptions":"Design tools, accounting apps, cloud storage, project managers — fully deductible.",
  "Utilities":               "Business portion of phone, internet, or electricity — deduct the percentage used for work.",
  "Rent / workspace":        "Office rent or home office deduction — even a dedicated corner of a room may qualify.",
  "Insurance":               "Business liability, professional indemnity, or self-employed health insurance premiums.",
};


// ═══════════════════════════════════════════════════════════════════════════════
// YEAR-END SUMMARY SCREEN
// ═══════════════════════════════════════════════════════════════════════════════
function YearEndSummary({ receipts, onBack, onPrint }) {
  const total     = receipts.reduce((s, r) => s + ((parseFloat(r.amount)||0) * ((r.businessPct||100)/100)), 0);
  const gross     = receipts.reduce((s, r) => s + (parseFloat(r.amount)||0), 0);
  const n         = receipts.length;
  const prepDate  = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
  const taxYear   = TAX_YEAR;

  // Category breakdown sorted highest → lowest
  const catTotals = {};
  receipts.forEach(r => {
    const amt = (parseFloat(r.amount)||0) * ((r.businessPct||100)/100);
    catTotals[r.category] = (catTotals[r.category] || 0) + amt;
  });
  const sorted = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
  const topCat  = sorted[0]?.[0] || null;

  // Insight: which common cats are missing
  const presentCats  = new Set(receipts.map(r => r.category));
  const missingCommon = COMMON_FREELANCER_CATS.filter(c => !presentCats.has(c));

  return (
    <>
      {/* Print styles injected into head */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .yer-wrapper { box-shadow: none !important; border: none !important; max-width: 100% !important; padding: 32px !important; }
        }
      `}</style>

      {/* Back + Print bar */}
      <div className="no-print" style={{
        position: "sticky", top: 0, zIndex: 10,
        background: C.cream, borderBottom: `1px solid ${C.creamDark}`,
        padding: "12px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
      }}>
        <button className="pf-btn-ghost" onClick={onBack} style={{ display: "flex", alignItems: "center", gap: 6, textDecoration: "none", color: C.inkFaint }}>
          <Icon name="file" size={14} color={C.inkFaint} /> ← Back to organizer
        </button>
        <button className="pf-btn-primary" onClick={onPrint} style={{ padding: "9px 20px", fontSize: 13 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <Icon name="download" size={14} color="white" /> Print / Save as PDF
          </span>
        </button>
      </div>

      {/* Report body */}
      <div style={{ maxWidth: 720, margin: "32px auto 60px", padding: "0 24px" }}>
        <div className="yer-wrapper" style={{
          background: "white", borderRadius: 20,
          boxShadow: "0 4px 32px rgba(0,0,0,0.08)",
          border: `1px solid ${C.creamDark}`,
          overflow: "hidden",
        }}>

          {/* ── HEADER BAND ── */}
          <div style={{ background: C.forest, padding: "32px 36px 28px" }}>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 32, height: 32, background: "rgba(255,255,255,0.15)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Icon name="receipt" size={18} color="white" strokeWidth={1.5} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.7)", letterSpacing: "0.05em", textTransform: "uppercase" }}>PreFile</span>
                </div>
                <h1 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: "white", letterSpacing: "-0.5px", margin: 0 }}>
                  Year-End Summary
                </h1>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.65)", marginTop: 4 }}>
                  Tax Year {taxYear} · Prepared {prepDate}
                </p>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)", marginBottom: 4 }}>Total business deductions</div>
                <div style={{ fontFamily: "'Fraunces', serif", fontSize: 34, fontWeight: 700, color: "white" }}>
                  ${total.toFixed(2)}
                </div>
              </div>
            </div>

            {/* Stat row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
              {[
                { label: "Receipts tracked",    value: n.toString() },
                { label: "Gross receipt total",  value: "$" + gross.toFixed(2) },
                { label: "Categories covered",   value: sorted.length + " categories" },
              ].map(s => (
                <div key={s.label} style={{
                  background: "rgba(255,255,255,0.1)", borderRadius: 12, padding: "14px 16px",
                }}>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 4 }}>
                    {s.label}
                  </div>
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, fontWeight: 700, color: "white" }}>
                    {s.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ── CATEGORY BREAKDOWN ── */}
          <div style={{ padding: "28px 36px" }}>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: "-0.2px", marginBottom: 16 }}>
              Breakdown by category
            </h2>

            {sorted.length === 0 && (
              <div style={{ color: C.inkFaint, fontSize: 13 }}>No receipts to summarize.</div>
            )}

            {sorted.map(([cat, amt], i) => {
              const meta    = CAT_META[cat] || CAT_META["Other"];
              const pct     = total > 0 ? (amt / total) * 100 : 0;
              const isTop   = i === 0;
              return (
                <div key={cat} style={{
                  display: "grid", gridTemplateColumns: "1fr auto",
                  alignItems: "center", gap: 12,
                  padding: "12px 0",
                  borderBottom: `1px solid ${C.creamDark}`,
                }}>
                  <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}>
                      <CatIcon category={cat} size={13} />
                      <span style={{ fontSize: 13, fontWeight: isTop ? 700 : 600, color: C.ink }}>
                        {cat}
                      </span>
                      {isTop && (
                        <span style={{
                          fontSize: 10, fontWeight: 700, color: C.forest,
                          background: "rgba(27,94,32,0.1)", borderRadius: 6, padding: "1px 7px",
                        }}>Largest</span>
                      )}
                    </div>
                    {/* Bar */}
                    <div style={{ height: 4, background: C.creamDeep, borderRadius: 6, overflow: "hidden" }}>
                      <div style={{
                        height: "100%", width: `${pct}%`,
                        background: meta.color, borderRadius: 6,
                        transition: "width 0.6s ease",
                      }} />
                    </div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontFamily: "'Fraunces', serif", fontSize: 15, fontWeight: 700, color: C.ink }}>
                      ${amt.toFixed(2)}
                    </div>
                    <div style={{ fontSize: 10, color: C.inkFaint }}>{pct.toFixed(1)}% of total</div>
                  </div>
                </div>
              );
            })}

            {/* Total row */}
            {sorted.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: "1fr auto", padding: "14px 0 0", gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>Total business deductions</span>
                <span style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 700, color: C.forest }}>
                  ${total.toFixed(2)}
                </span>
              </div>
            )}
          </div>

          {/* ── INSIGHTS ── */}
          <div style={{ padding: "0 36px 28px" }}>
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: "-0.2px", marginBottom: 14 }}>
              Insights
            </h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {[
                topCat && {
                  icon: "checkCircle",
                  color: C.forestMid,
                  text: `Your largest expense category was ${topCat} — ${(((catTotals[topCat]||0)/total)*100).toFixed(0)}% of total tracked expenses.`,
                },
                {
                  icon: "receipt",
                  color: C.forestMid,
                  text: `You tracked ${n} receipt${n !== 1 ? "s" : ""} across ${sorted.length} categor${sorted.length !== 1 ? "ies" : "y"} this year.`,
                },
                missingCommon.length > 0 && {
                  icon: "zap",
                  color: "#B45309",
                  text: `Categories you may have missed: ${missingCommon.slice(0, 3).join(", ")}. These are commonly overlooked by freelancers.`,
                },
                {
                  icon: "shield",
                  color: C.forestMid,
                  text: "Keep this summary with your tax records. Your accountant may request documentation for any listed expense.",
                },
              ].filter(Boolean).map((item, i) => (
                <div key={i} style={{
                  display: "flex", gap: 12, alignItems: "flex-start",
                  background: C.cream, borderRadius: 10, padding: "11px 14px",
                }}>
                  <Icon name={item.icon} size={14} color={item.color} strokeWidth={2} style={{ flexShrink: 0, marginTop: 1 }} />
                  <p style={{ fontSize: 12, color: C.inkLight, lineHeight: 1.65, margin: 0 }}>{item.text}</p>
                </div>
              ))}
            </div>
          </div>

          {/* ── DISCLAIMER ── */}
          <div style={{ background: C.creamDark, padding: "16px 36px" }}>
            <p style={{ fontSize: 10, color: C.inkFaint, lineHeight: 1.6, margin: 0 }}>
              <strong>Disclaimer:</strong> PreFile prepares filing-ready data — not tax advice. All amounts are self-reported estimates.
              Confirm deductibility of each expense with a qualified tax professional before filing. Amounts shown reflect business
              use percentages entered by the user and may not reflect final deductible amounts.
            </p>
          </div>

        </div>

        {/* Print hint */}
        <div className="no-print" style={{ textAlign: "center", marginTop: 16, fontSize: 11, color: C.inkFaint }}>
          Use Print / Save as PDF above · Or press Cmd+P (Mac) / Ctrl+P (Windows)
        </div>
      </div>
    </>
  );
}

function OrganizerScreen({ receipts, onAddAnother, isSaved, onExport, showSavedConfirm, onGenerateSummary, onClearData, onDeleteReceipt, showDownloadMsg, isDownloading, pendingRestore, onRestore, onDiscardRestore, schedDItems = [], sched1Items = [], onOpenSchedD, onOpenSched1 }) {
  const [confirmed, setConfirmed] = useState(false);
  const [monthOpen, setMonthOpen] = useState(false);
  const total = receipts.reduce((s, r) => s + ((parseFloat(r.amount) || 0) * ((r.businessPct || 100) / 100)), 0);
  const byCategory = {};
  receipts.forEach(r => {
    const cat = r.category;
    const amt = (parseFloat(r.amount) || 0) * ((r.businessPct || 100) / 100);
    byCategory[cat] = (byCategory[cat] || 0) + amt;
  });
  const n = receipts.length;

  // Completion momentum copy
  const momentumMsg =
    n === 0 ? null :
    n < 3   ? `${n} receipt${n > 1 ? "s" : ""} organized — keep going` :
    n < 5   ? "You're building your organized file for review — save and export everything at the end" :
              "You're almost done — review everything and download your file";

  const momentumColor = n >= 3 ? C.forest : C.inkFaint;
  const momentumBg    = n >= 3 ? "rgba(27,94,32,0.07)" : "transparent";
  const momentumBorder = n >= 3 ? `1px solid rgba(27,94,32,0.15)` : "none";

  // Progress line under totals
  const progressLine =
    n === 0 ? null :
    n === 1 ? "1 receipt tracked — every one counts" :
    n < 3   ? `${n} receipts tracked — you're on your way` :
    n < 5   ? `${n} receipts in — most freelancers miss deductions like these` :
              `${n} receipts — you're almost done, review and download your file`;

  return (
    <div style={{ maxWidth: 740, margin: "0 auto", padding: "32px 24px" }}>

      {/* Header */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8, flexWrap: "wrap", gap: 12 }}>
        <div>
          <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 700, color: C.ink, letterSpacing: "-0.3px" }}>
            Your tax file is in progress
          </h2>
          <p style={{ fontSize: 12, color: C.forestMid, marginTop: 4, fontWeight: 500 }}>
            Saved on this device and ready to build over time
          </p>
          <p style={{ fontSize: 13, color: C.inkFaint, marginTop: 6 }}>
            Estimated totals for organization purposes — review before filing
          </p>
          {n > 0 && (
            <p style={{ fontSize: 11, color: C.inkFaint, marginTop: 5 }}>
              Everything here is already prepared for your tax file
            </p>
          )}
          {/* Value reinforcement */}
          {n > 0 && (
            <p style={{ fontSize: 12, color: C.forestMid, marginTop: 6, fontWeight: 500 }}>
              Common categories most freelancers track — review with your tax professional to confirm what applies
            </p>
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <button className="pf-btn-primary" onClick={onAddAnother} style={{ padding: "12px 22px", fontSize: 14 }}>
            + Add receipt
          </button>
          {n > 0 && (
            <button
              onClick={onClearData}
              style={{
                background: "none", border: `1px solid ${C.creamDeep}`,
                borderRadius: 11, padding: "11px 14px", fontSize: 12,
                fontWeight: 600, color: C.inkFaint, cursor: "pointer",
                fontFamily: "'DM Sans', sans-serif",
                transition: "border-color 0.15s, color 0.15s",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.red; e.currentTarget.style.color = C.red; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.creamDeep; e.currentTarget.style.color = C.inkFaint; }}
              title="Clear all receipts and reset"
            >
              Clear data
            </button>
          )}
        </div>
      </div>

      {/* Resume saved session — appears only when localStorage has prior
          receipts the user has not yet acknowledged. Replaces the previous
          silent-restore behavior so users explicitly opt in or discard. */}
      {pendingRestore && (
        <div style={{
          marginBottom: 16, padding: "14px 16px",
          background: "#FFFAF0",
          border: "1px solid rgba(230,184,0,0.35)",
          borderLeft: "3px solid #E6B800",
          borderRadius: 10, lineHeight: 1.5,
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <Icon name="folder" size={16} color="#E6B800" strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 1 }}>
                Resume saved receipts?
              </div>
              <div style={{ fontSize: 12, color: C.inkLight }}>
                We found organizer progress saved on this device.
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <button
                onClick={onRestore}
                style={{
                  background: C.forest, color: C.white, border: "none",
                  borderRadius: 9, padding: "8px 14px", fontSize: 12,
                  fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                }}
              >
                Resume saved receipts
              </button>
              <button
                onClick={onDiscardRestore}
                style={{
                  background: "transparent", color: C.inkLight, border: "none",
                  fontSize: 12, fontWeight: 600, cursor: "pointer",
                  fontFamily: "'DM Sans', sans-serif", textDecoration: "underline",
                  textUnderlineOffset: 2,
                }}
              >
                Start fresh
              </button>
            </div>
          </div>
          <div style={{ fontSize: 11, color: C.inkFaint, paddingLeft: 30 }}>
            Starting fresh will clear the saved organizer on this device.
          </div>
        </div>
      )}

      {/* This month + nudge — lightweight monthly habit loop.
          Calm continuity signals only; no notifications, streaks, or progress UI.
          Renders alongside YTD when there's any logging history. */}
      {n > 0 && (() => {
        const now = new Date();
        const curYear = now.getFullYear();
        const curMonth = now.getMonth();
        // Receipts in the current calendar month (business-weighted, same as YTD)
        let monthTotal = 0;
        let monthCount = 0;
        // Track most recent receipt date to detect a 2+ month gap when current month is empty
        let mostRecent = null;
        receipts.forEach(r => {
          const d = new Date(r.date);
          if (isNaN(d)) return;
          if (!mostRecent || d > mostRecent) mostRecent = d;
          if (d.getFullYear() === curYear && d.getMonth() === curMonth) {
            const amt = (parseFloat(r.amount) || 0) * ((r.businessPct || 100) / 100);
            monthTotal += amt;
            monthCount += 1;
          }
        });

        // Compute nudge text. Three mutually-exclusive branches:
        //   (a) this month has receipts → count message
        //   (b) this month empty AND last receipt was 2+ months ago → name missed month
        //   (c) this month empty AND no real gap → calm "yet" message
        const monthNames = ["January","February","March","April","May","June","July","August","September","October","November","December"];
        let nudge;
        if (monthCount > 0) {
          nudge = `You've logged ${monthCount} receipt${monthCount !== 1 ? "s" : ""} this month`;
        } else if (mostRecent) {
          // Months elapsed since most recent receipt (calendar-month difference)
          const monthsAgo = (curYear - mostRecent.getFullYear()) * 12 + (curMonth - mostRecent.getMonth());
          if (monthsAgo >= 2) {
            // The "last missing month" is the calendar month immediately before the current one.
            // Naming it as the gap reads more naturally than naming the most-recent-logged month.
            const gapMonth = curMonth === 0 ? 11 : curMonth - 1;
            const gapYear  = curMonth === 0 ? curYear - 1 : curYear;
            nudge = `Nothing logged in ${monthNames[gapMonth]} ${gapYear}`;
          } else {
            nudge = "No receipts logged this month yet";
          }
        } else {
          nudge = "No receipts logged this month yet";
        }

        return (
          <>
            <div style={{
              fontSize: 12, color: C.inkLight, marginBottom: 4,
              letterSpacing: "0.01em", lineHeight: 1.5,
            }}>
              <span style={{ color: C.inkFaint, textTransform: "uppercase", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", marginRight: 8 }}>
                This month
              </span>
              <span style={{ color: C.ink, fontWeight: 600 }}>
                ${monthTotal.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
              </span>
              <span style={{ color: C.inkFaint }}> · {monthCount} receipt{monthCount !== 1 ? "s" : ""}</span>
            </div>
            <div style={{ fontSize: 11, color: C.inkFaint, marginBottom: 14, lineHeight: 1.5 }}>
              {nudge}
            </div>
          </>
        );
      })()}

      {/* Year-to-date running total + items needing review.
          Year-round continuity signal — calm single line, derived from
          existing state (no new fields). The "to review" suffix appears
          only when computeInsights flags items. */}
      {n > 0 && (() => {
        const reviewCount = computeInsights(receipts).all.length;
        return (
          <div style={{
            fontSize: 12, color: C.inkLight, marginBottom: 16,
            letterSpacing: "0.01em", lineHeight: 1.5,
          }}>
            <span style={{ color: C.inkFaint, textTransform: "uppercase", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", marginRight: 8 }}>
              Year to date
            </span>
            <span style={{ color: C.ink, fontWeight: 600 }}>
              ${total.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })} business
            </span>
            <span style={{ color: C.inkFaint }}> · {n} receipt{n !== 1 ? "s" : ""}</span>
            {reviewCount > 0 && (
              <span style={{ color: C.inkFaint }}> · {reviewCount} to review</span>
            )}
          </div>
        );
      })()}

      {/* Soft momentum banner */}
      {momentumMsg && n >= 3 && (
        <div className="fade-in" style={{
          background: momentumBg, border: momentumBorder,
          borderRadius: 12, padding: "10px 16px", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <Icon name={n >= 5 ? "checkCircle" : "zap"} size={16} color={C.forest} strokeWidth={1.8} />
          <span style={{ fontSize: 13, color: momentumColor, fontWeight: 600 }}>
            {momentumMsg}
          </span>
        </div>
      )}

      {/* Free insight teaser — surfaces the top tier-1 insight to build trust */}
      {(() => {
        const { tier1 } = computeInsights(receipts);
        if (tier1.length === 0) return null;
        // Teaser priority is read from the shared PRIORITY_MAP keyed by user
        // type. Must use the same map (and therefore the same userType) as
        // PaywallModal so the paywall's no-duplication filter reliably
        // excludes whichever teaser actually rendered here.
        const userType = getUserType(receipts);
        const teaserInsight =
          PRIORITY_MAP[userType].teaser
            .map(id => tier1.find(i => i.id === id))
            .find(Boolean)
          || tier1[0];
        return (
          <div style={{
            background: "rgba(212,160,23,0.10)",
            border: "1px solid rgba(212,160,23,0.28)",
            borderRadius: 11, padding: "14px 16px",
            marginBottom: 20,
            display: "flex", alignItems: "flex-start", gap: 12,
          }}>
            <Icon name="zap" size={18} color="#B8860B" strokeWidth={2} />
            <div style={{ flex: 1 }}>
              <div style={{
                fontSize: 11, fontWeight: 700, color: "#7A5C0A",
                textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4,
              }}>
                Found in your file
              </div>
              <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.55 }}>
                {formatTeaserInsight(teaserInsight, userType)}
              </div>
            </div>
          </div>
        );
      })()}

      {/* MASTER SUMMARY preview — document-style block.
          Mirrors the export's Master Summary sheet to give users a
          completion-confidence artifact before downloading. All data
          derived from existing state (receipts + computeInsights +
          SCHEDULE_C_REFERENCE); no new fields, no interaction.
          Uses formatPaywallInsight for Review & Flags — the document-
          style surface needs the calmer "Your file flags..." voice,
          not the curiosity-shaped teaser voice. */}
      {n > 0 && (() => {
        const userType = getUserType(receipts);

        // Tax year: most recent receipt's year, fallback to current year
        let taxYear = new Date().getFullYear();
        let mostRecentDate = null;
        receipts.forEach(r => {
          const d = new Date(r.date);
          if (isNaN(d)) return;
          if (!mostRecentDate || d > mostRecentDate) mostRecentDate = d;
        });
        if (mostRecentDate) taxYear = mostRecentDate.getFullYear();

        // Top 5 categories by business-weighted total
        const catTotals = {};
        receipts.forEach(r => {
          const amt = (parseFloat(r.amount) || 0) * ((r.businessPct || 100) / 100);
          catTotals[r.category] = (catTotals[r.category] || 0) + amt;
        });
        const topCategories = Object.entries(catTotals)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);

        // Top 2 insights via paywall formatter (document-tone, not teaser-tone)
        const allInsights = computeInsights(receipts).all || [];
        const flagsToShow = allInsights.slice(0, 2);

        // Dynamic status — 0 flags = clean, ≥1 = ready with caveats
        const statusText = flagsToShow.length === 0
          ? "Ready for Review"
          : "Ready — with items to review";

        // IRS Schedule C 2024 line → form-side category names. Used only
        // for the Master Summary preview to format "Line 27a (Other expenses)"
        // alongside the user-facing PreFile category in column 1. Kept
        // local to this IIFE since it's a display-only mapping.
        const IRS_LINE_NAMES = {
          "Line 8":   "Advertising",
          "Line 9":   "Car and truck expenses",
          "Line 11":  "Contract labor",
          "Line 15":  "Insurance",
          "Line 17":  "Legal and professional services",
          "Line 18":  "Office expense",
          "Line 20b": "Rent — other business property",
          "Line 22":  "Supplies",
          "Line 23":  "Taxes and licenses",
          "Line 24a": "Travel",
          "Line 24b": "Deductible meals",
          "Line 25":  "Utilities",
          "Line 27a": "Other expenses",
        };

        // Document-feel typography helper
        const docLabelStyle = {
          fontSize: 10, fontWeight: 700, color: C.inkFaint,
          textTransform: "uppercase", letterSpacing: "0.08em",
          marginBottom: 10,
        };
        const docTrustLineStyle = {
          fontSize: 12, color: C.inkLight, fontStyle: "italic",
          lineHeight: 1.5, marginTop: -10, marginBottom: 22,
        };

        return (
          <div style={{
            background: C.white,
            borderTop: `3px solid ${C.forest}`,
            border: `1px solid ${C.creamDeep}`,
            borderTopColor: C.forest,
            padding: "22px 26px",
            marginBottom: 20,
            maxWidth: "100%",
          }}>
            {/* Header row */}
            <div style={{
              display: "flex", justifyContent: "space-between",
              alignItems: "baseline", flexWrap: "wrap", gap: 8,
              marginBottom: 4,
            }}>
              <div style={{
                fontFamily: "'Fraunces', serif", fontSize: 20, fontWeight: 700,
                color: C.ink, letterSpacing: "-0.3px",
              }}>
                Master Summary
              </div>
              <div style={{
                fontSize: 11, fontStyle: "italic", color: C.forest,
                letterSpacing: "0.02em", textAlign: "right",
              }}>
                {statusText}
              </div>
            </div>
            <div style={{ fontSize: 12, color: C.inkFaint, marginBottom: 22 }}>
              Business · Tax Year {taxYear}
            </div>

            {/* Quick Overview — three-row label/value grid + trust line.
                Net Profit visibly present but rendered as "—" since PreFile
                doesn't track income. Maintains CPA-expected structure while
                being honest about the data gap. */}
            <div style={docLabelStyle}>Quick Overview</div>
            <div style={{ marginBottom: 10 }}>
              {[
                ["Total Income",   "— (not tracked)"],
                ["Total Expenses", `$${total.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`],
                ["Net Profit",     "— (income not tracked)"],
              ].map(([label, value]) => (
                <div key={label} style={{
                  display: "flex", justifyContent: "space-between",
                  padding: "5px 0", fontSize: 13,
                  borderBottom: `1px solid ${C.creamDark}`,
                }}>
                  <span style={{ color: C.inkLight }}>{label}</span>
                  <span style={{
                    color: value.startsWith("—") ? C.inkFaint : C.ink,
                    fontWeight: value.startsWith("—") ? 400 : 600,
                    fontStyle: value.startsWith("—") ? "italic" : "normal",
                  }}>
                    {value}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ fontSize: 12, color: C.inkLight, lineHeight: 1.5, marginBottom: 22 }}>
              Structured and ready for CPA review — prepared for filing.
            </div>

            {/* Schedule C Snapshot — top 5 rows.
                Intro line frames the section as preparer-ready.
                IRS Line cell reads "Line X (IRS form category)" so a
                preparer sees both the line number and the form-page name. */}
            <div style={docLabelStyle}>Schedule C Snapshot</div>
            <div style={docTrustLineStyle}>
              This is what your tax professional uses to file Schedule C.
            </div>
            <div style={{ marginBottom: flagsToShow.length > 0 ? 22 : 4 }}>
              {topCategories.map(([cat, amount]) => {
                const ref = SCHEDULE_C_REFERENCE[cat] || "Varies";
                // Compact line label: "Schedule C Line 22" → "Line 22"; "Varies — …" → "Varies"
                const lineCompact = ref.startsWith("Schedule C ")
                  ? ref.replace(/^Schedule C /, "")
                  : ref.startsWith("Varies")
                    ? "Varies"
                    : ref;
                // Append IRS form category in parens when known
                const lineLabel = IRS_LINE_NAMES[lineCompact]
                  ? `${lineCompact} (${IRS_LINE_NAMES[lineCompact]})`
                  : lineCompact;
                return (
                  <div key={cat} style={{
                    display: "grid",
                    gridTemplateColumns: "1.4fr 1.6fr auto",
                    gap: 16,
                    padding: "5px 0", fontSize: 13,
                    borderBottom: `1px solid ${C.creamDark}`,
                    alignItems: "baseline",
                  }}>
                    <span style={{ color: C.ink }}>{cat}</span>
                    <span style={{ color: C.inkFaint, fontSize: 11 }}>{lineLabel}</span>
                    <span style={{ color: C.ink, fontWeight: 600, minWidth: 70, textAlign: "right" }}>
                      ${amount.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Review & Flags — exactly 2 items via paywall formatter,
                post-processed to use imperative action phrases */}
            {flagsToShow.length > 0 && (
              <>
                <div style={docLabelStyle}>Review &amp; Flags</div>
                <div style={{ marginBottom: 18 }}>
                  {flagsToShow.map((ins, i) => (
                    <div key={ins.id || i} style={{
                      fontSize: 13, color: C.inkLight, lineHeight: 1.6,
                      padding: "4px 0",
                    }}>
                      {formatPaywallInsight(ins, userType)}
                    </div>
                  ))}
                </div>
              </>
            )}

            {/* Footer attribution — small, centered, muted */}
            <div style={{
              fontSize: 10, color: C.inkFaint, textAlign: "center",
              marginTop: flagsToShow.length > 0 ? 4 : 18,
              letterSpacing: "0.04em",
            }}>
              Generated by PreFile
            </div>
          </div>
        );
      })()}

      {/* By month — year-round continuity signal. Collapsed by default;
          computes month-by-month totals from receipts, reverse-chronological. */}
      {n > 0 && (() => {
        const byMonth = {};
        receipts.forEach(r => {
          const d = new Date(r.date);
          if (isNaN(d)) return;
          const key = `${d.getFullYear()}-${String(d.getMonth()).padStart(2, "0")}`;
          const amt = (parseFloat(r.amount) || 0) * ((r.businessPct || 100) / 100);
          if (!byMonth[key]) byMonth[key] = { total: 0, count: 0, year: d.getFullYear(), month: d.getMonth() };
          byMonth[key].total += amt;
          byMonth[key].count += 1;
        });
        const months = Object.values(byMonth).sort((a, b) => {
          if (a.year !== b.year) return b.year - a.year;
          return b.month - a.month;
        });
        if (months.length === 0) return null;
        const monthNames = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
        return (
          <div style={{
            border: `1px solid ${C.creamDeep}`, borderRadius: 11,
            marginBottom: 20, overflow: "hidden",
          }}>
            <button
              onClick={() => setMonthOpen(o => !o)}
              type="button"
              style={{
                width: "100%", display: "flex", alignItems: "center",
                justifyContent: "space-between", gap: 10,
                background: monthOpen ? C.cream : "transparent",
                border: "none", padding: "11px 16px",
                cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
                transition: "background 0.15s",
              }}
              onMouseEnter={e => { if (!monthOpen) e.currentTarget.style.background = C.cream; }}
              onMouseLeave={e => { if (!monthOpen) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
                By month
              </span>
              <span style={{ fontSize: 11, color: C.inkFaint, fontWeight: 500 }}>
                {months.length} month{months.length !== 1 ? "s" : ""} {monthOpen ? "▴" : "▾"}
              </span>
            </button>
            {monthOpen && (
              <div style={{ borderTop: `1px solid ${C.creamDeep}`, padding: "8px 0" }}>
                {months.map(m => (
                  <div key={`${m.year}-${m.month}`} style={{
                    display: "flex", justifyContent: "space-between",
                    padding: "6px 16px", fontSize: 12, color: C.inkLight,
                  }}>
                    <span>{monthNames[m.month]} {m.year}</span>
                    <span>
                      <span style={{ color: C.ink, fontWeight: 600 }}>
                        ${m.total.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </span>
                      <span style={{ color: C.inkFaint }}> across {m.count} receipt{m.count !== 1 ? "s" : ""}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })()}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 288px", gap: 24, alignItems: "start" }}>

        {/* LEFT — Receipt list */}
        <div>
          <div className="pf-label" style={{ marginBottom: 12 }}>
            {n} receipt{n !== 1 ? "s" : ""} organized
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {receipts.map((r, i) => (
              <div key={r.id} className="receipt-row" style={{ animationDelay: `${i * 60}ms`, position: "relative" }}>
                <MiniReceiptCard receipt={r} />
                <button
                  onClick={() => {
                    if (window.confirm("Delete this receipt?")) {
                      onDeleteReceipt(r.id);
                    }
                  }}
                  title="Delete receipt"
                  style={{
                    position: "absolute", top: 8, right: 8,
                    background: "none", border: "none", cursor: "pointer",
                    color: C.inkLight, fontSize: 14, lineHeight: 1,
                    padding: "2px 6px", borderRadius: 5,
                    fontFamily: "'DM Sans', sans-serif",
                    transition: "color 0.15s, background 0.15s",
                  }}
                  onMouseEnter={e => { e.currentTarget.style.color = C.red; e.currentTarget.style.background = "rgba(198,40,40,0.08)"; }}
                  onMouseLeave={e => { e.currentTarget.style.color = C.inkLight; e.currentTarget.style.background = "none"; }}
                >✕</button>
              </div>
            ))}
          </div>

          {n === 0 && (
            <div className="pf-card" style={{ padding: 32, textAlign: "center" }}>
              <div style={{ marginBottom: 12 }}><Icon name="file" size={32} color={C.inkFaint} strokeWidth={1.2} /></div>
              <div style={{ fontSize: 14, color: C.inkFaint }}>No receipts yet — add your first one above</div>
            </div>
          )}

          {/* Post-unlock confirmation */}
          {showSavedConfirm && (
            <div className="fade-in" style={{
              background: "rgba(27,94,32,0.08)", border: "1px solid rgba(27,94,32,0.2)",
              borderRadius: 11, padding: "10px 14px", marginBottom: 14,
              display: "flex", alignItems: "center", gap: 8,
              animation: "fadeIn 0.3s ease",
            }}>
              <span style={{ fontSize: 15 }}>✅</span>
              <span style={{ fontSize: 13, fontWeight: 600, color: C.forest }}>
                Saved ✓ Your file is now yours
              </span>
            </div>
          )}

          {/* SMART ASSISTANT — MISSING DEDUCTIONS */}
          <MissingDeductionsPanel receipts={receipts} />

          {/* EXPORT PREVIEW + DOWNLOAD */}
          {n > 0 && (
            <div className="pf-card fade-in" style={{ padding: 20, border: `1.5px solid ${C.creamDeep}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: "'Fraunces', serif" }}>
                    Preview your organized file for review
                  </div>
                  <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 3 }}>
                    This is what your exported file will look like
                  </div>
                  <div style={{ fontSize: 11, color: C.inkFaint, textAlign: "center", marginTop: 4 }}>
                    This is exactly how your downloaded Excel file will look.
                  </div>
                </div>
                <span style={{ fontSize: 20 }}>📊</span>
              </div>

              {/* Preview table */}
              <div style={{ background: C.cream, borderRadius: 10, overflow: "hidden", border: `1px solid ${C.creamDeep}` }}>
                {/* Header row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", padding: "8px 14px", background: "#eef6f0", borderBottom: "1px solid #d6e8dc" }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#1f5f2e", textTransform: "uppercase", letterSpacing: "0.07em" }}>Category</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "#1f5f2e", textTransform: "uppercase", letterSpacing: "0.07em" }}>Amount</span>
                </div>
                {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt], i) => {
                  const meta = CAT_META[cat] || CAT_META["Other"];
                  return (
                    <div key={cat} style={{
                      display: "grid", gridTemplateColumns: "1fr auto",
                      padding: "9px 14px", alignItems: "center",
                      background: i % 2 === 0 ? C.white : C.cream,
                      borderBottom: `1px solid ${C.creamDark}`,
                    }}>
                      <span style={{ display: "flex", alignItems: "center" }}>
                        <CategoryLabel category={cat} size={12} />
                      </span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>${amt.toFixed(2)}</span>
                    </div>
                  );
                })}
                {/* Total row */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", padding: "10px 14px", background: C.forest }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.8)" }}>Total tracked expenses</span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: C.white, fontFamily: "'Fraunces', serif" }}>${total.toFixed(2)}</span>
                </div>
              </div>

              <div style={{ marginTop: 10, fontSize: 10, color: C.inkFaint, lineHeight: 1.5 }}>
                For organization only · Confirm deductibility with your tax professional before filing
              </div>

              {/* Download button */}
              <div style={{ marginTop: 18, paddingTop: 16, borderTop: `1px solid ${C.creamDark}` }}>

                {/* Export moment — what's included */}
                {receipts.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: C.ink, marginBottom: 10 }}>
                      Your file includes:
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 12 }}>
                      {[
                        `${receipts.length} organized receipt${receipts.length !== 1 ? "s" : ""}`,
                        "Category breakdown with color coding",
                        "Clean, reviewable formatting",
                        "Definitions for every category",
                        "Notes column for business purpose",
                      ].map((item, i) => (
                        <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12, color: C.inkLight }}>
                          <Icon name="checkCircle" size={13} color={C.forestMid} strokeWidth={2} />
                          {item}
                        </div>
                      ))}
                    </div>
                    <div style={{
                      background: "rgba(27,94,32,0.06)", borderRadius: 9,
                      padding: "9px 12px", marginBottom: 12,
                      fontSize: 11, color: C.forestMid, lineHeight: 1.55, fontStyle: "italic",
                    }}>
                      This is formatted exactly how most tax professionals prefer to receive expense data.
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, fontWeight: 600, color: C.forest, marginBottom: 12 }}>
                      <Icon name="checkCircle" size={14} color={C.forest} strokeWidth={2.2} />
                      Prepared for review by your tax professional
                    </div>
                  </div>
                )}

                {receipts.length > 0 && (
                  <div style={{
                    marginBottom: 12, padding: "12px 14px",
                    background: "rgba(212,160,23,0.08)",
                    border: "1px solid rgba(212,160,23,0.25)",
                    borderRadius: 9, fontSize: 12, color: C.ink, lineHeight: 1.55,
                  }}>
                    <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={confirmed}
                        onChange={e => setConfirmed(e.target.checked)}
                        style={{ marginTop: 3, width: 16, height: 16, cursor: "pointer", flexShrink: 0 }}
                      />
                      <span>
                        I confirm I have reviewed all entries and understand this file is for preparation and review purposes only.
                      </span>
                    </label>
                  </div>
                )}
                {!isSaved && (
                  <div style={{
                    marginBottom: 8, padding: "9px 12px",
                    background: "#FFFAF0",
                    border: "1px solid rgba(230,184,0,0.35)",
                    borderLeft: "3px solid #E6B800",
                    borderRadius: 10, lineHeight: 1.5,
                    display: "flex", flexDirection: "column", gap: 6,
                  }}>
                    <div style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
                      <Icon name="zap" size={14} color="#E6B800" strokeWidth={2.2} style={{ marginTop: 3, flexShrink: 0 }} />
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 1 }}>
                          Your receipts aren't saved yet.
                        </div>
                        <div style={{ fontSize: 12, color: C.inkLight }}>
                          Save them first to unlock your download below.
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", justifyContent: "center", marginTop: -2 }}>
                      <Icon name="chevronDown" size={14} color="#E6B800" strokeWidth={2} />
                    </div>
                  </div>
                )}
                <button
                  className="pf-btn-primary"
                  onClick={() => {
                    if (isSaved) {
                      onExport();
                    } else {
                      const userType = getUserType(receipts);
                      logEvent("PAYWALL_VIEWED", { count: receipts.length, userType });
                      logEvent("PAYWALL_SHOWN", { count: receipts.length, userType });
                      setShowPaywall(true);
                    }
                  }}
                  disabled={isDownloading || (receipts.length > 0 && !confirmed)}
                  style={{
                    width: "100%", fontSize: 14, padding: "13px",
                    opacity: (isDownloading || (receipts.length > 0 && !confirmed)) ? 0.5 : 1,
                    transition: "opacity 0.2s",
                    cursor: (receipts.length > 0 && !confirmed) ? "not-allowed" : "pointer",
                  }}
                >
                  {isDownloading ? "Downloading..." : showDownloadMsg ? "Downloaded ✓" : isSaved ? "Download your file →" : "Download organizer →"}
                </button>
                <div style={{ fontSize: 11, color: C.inkFaint, textAlign: "center", marginTop: 6 }}>
                  Start free — only pay if you download
                </div>
                {isSaved && (
                  <div style={{ marginTop: 8, fontSize: 11, color: C.inkFaint, textAlign: "center" }}>
                    Your receipts are saved · Export ready
                  </div>
                )}
                {isSaved && !showDownloadMsg && (
                  <div style={{
                    marginTop: 10, padding: "10px 14px",
                    background: "rgba(27,94,32,0.08)",
                    border: "1px solid rgba(27,94,32,0.2)",
                    borderRadius: 10, fontSize: 13, fontWeight: 700,
                    color: C.forest, lineHeight: 1.5,
                  }}>
                    Your filing-ready summary is ready — use the button above to download.
                  </div>
                )}
                {showDownloadMsg && (
                  <div style={{
                    marginTop: 10, padding: "10px 14px",
                    background: "rgba(27,94,32,0.08)",
                    border: "1px solid rgba(27,94,32,0.2)",
                    borderRadius: 10, fontSize: 12,
                    color: C.forestMid, lineHeight: 1.5,
                  }}>
                    <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 6, color: C.forest }}>
                      ✓ Your file is ready
                    </div>
                    Open your file in Excel, then click “Enable Editing” to review your summary.
                    <div style={{ marginTop: 6 }}>
                      Your receipts are now organized by category, totals, and review points — ready for filing or your accountant.
                    </div>
                    <div style={{ marginTop: 6, fontStyle: "italic" }}>
                      Some entries may include personal use — review before filing.
                    </div>
                    <div style={{ marginTop: 6 }}>
                      Most users find reviewing everything much faster once it's organized.
                    </div>
                  </div>
                )}

                {/* Year-End Summary trigger */}
                {receipts.length > 0 && (
                  <div style={{ marginTop: 12 }}>
                    <button
                      onClick={onGenerateSummary}
                      className="pf-btn-secondary"
                      style={{ width: "100%", fontSize: 13, padding: "11px", gap: 8 }}
                    >
                      <Icon name="clipboard" size={14} color={C.ink} />
                      Generate Year-End Summary
                    </button>
                    <div style={{ marginTop: 6, fontSize: 10, color: C.inkFaint, textAlign: "center" }}>
                      Printable report · Prepared for review by your tax professional
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT — Sticky totals sidebar */}
        <div style={{ position: "sticky", top: 80 }}>
          <div className="pf-card slide-up" style={{ padding: 20 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 8 }}>
              Total tracked
            </div>
            <div style={{ fontSize: 30, fontWeight: 700, color: C.forest, fontFamily: "'Fraunces', serif", marginBottom: 4 }}>
              $<AnimCounter value={total} />
            </div>

            {/* Progress line */}
            {progressLine && (
              <div style={{ fontSize: 11, color: C.forestMid, fontWeight: 500, marginBottom: 16, lineHeight: 1.4 }}>
                {progressLine}
              </div>
            )}

            <div style={{ fontSize: 11, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
              By category
            </div>
            {Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([cat, amt]) => {
              const meta = CAT_META[cat] || CAT_META["Other"];
              return (
                <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <CatIcon category={cat} size={14} />
                  <span style={{ fontSize: 11, color: C.inkLight, flex: 1, lineHeight: 1.3 }}>{cat}</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.ink }}>${amt.toFixed(2)}</span>
                </div>
              );
            })}
            {Object.keys(byCategory).length === 0 && (
              <div style={{ fontSize: 12, color: C.inkFaint }}>Add receipts to see totals</div>
            )}
            <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${C.creamDark}`, fontSize: 10, color: C.inkFaint, lineHeight: 1.5 }}>
              For organization only · Not a tax calculation · Confirm with your tax professional
            </div>
          </div>
        </div>

      </div>

      {/* More tax modules — Schedule D / Schedule 1 entry points */}
      <div style={{ maxWidth: 980, margin: "32px auto 0", padding: "0 24px" }}>
        <div className="pf-label" style={{ marginBottom: 12 }}>More tax modules</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
          <button
            onClick={onOpenSchedD}
            style={{
              background: C.white, border: `1px solid ${C.creamDeep}`, borderRadius: 12,
              padding: "16px 18px", textAlign: "left", cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, fontFamily: "'Fraunces', serif", marginBottom: 3 }}>
                Schedule D
              </div>
              <div style={{ fontSize: 12, color: C.inkFaint, lineHeight: 1.5 }}>
                Capital gains & investment activity
              </div>
            </div>
            <div style={{ flexShrink: 0, fontSize: 12, color: C.forest, fontWeight: 600 }}>
              {schedDItems.length > 0 ? `${schedDItems.length} entered →` : "Add →"}
            </div>
          </button>

          <button
            onClick={onOpenSched1}
            style={{
              background: C.white, border: `1px solid ${C.creamDeep}`, borderRadius: 12,
              padding: "16px 18px", textAlign: "left", cursor: "pointer",
              display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14,
              fontFamily: "'DM Sans', sans-serif",
            }}
          >
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, fontFamily: "'Fraunces', serif", marginBottom: 3 }}>
                Schedule 1
              </div>
              <div style={{ fontSize: 12, color: C.inkFaint, lineHeight: 1.5 }}>
                Adjustments & additional income
              </div>
            </div>
            <div style={{ flexShrink: 0, fontSize: 12, color: C.forest, fontWeight: 600 }}>
              {sched1Items.length > 0 ? `${sched1Items.length} entered →` : "Add →"}
            </div>
          </button>
        </div>
      </div>

      <DisclaimerFooter />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// CHECK FLOW
// checkStep: "questions" | "loading" | "reveal"
// ═══════════════════════════════════════════════════════════════════════════════

const CHECK_ITEMS = [
  {
    id: "homeoffice",
    iconName: "home",
    title: "Home office deduction",
    desc: "If you work from a dedicated space at home, a portion of rent/mortgage and utilities may be deductible.",
    trigger: a => a.workFromHome,
    form: "Form 8829",
  },
  {
    id: "phone",
    iconName: "wrench",
    title: "Phone & internet — business portion",
    desc: "The percentage of your phone and internet bill used for work is deductible. Typically 30–70%.",
    trigger: a => a.usePhone,
    form: "Schedule C",
  },
  {
    id: "mileage",
    iconName: "car",
    title: "Vehicle mileage",
    desc: "Every business mile is worth $0.67 in 2025. Most people forget to track this.",
    trigger: a => a.driveForWork,
    form: "Schedule C / Form 4562",
  },
  {
    id: "software",
    iconName: "wrench",
    title: "Software subscriptions",
    desc: "Any software used for your business — design tools, accounting apps, project managers — is fully deductible.",
    trigger: () => true,
    form: "Schedule C",
  },
  {
    id: "meals",
    iconName: "utensils",
    title: "Business meals",
    desc: "Meals with clients or for business purposes are 50% deductible. Keep the receipt and note who you met.",
    trigger: () => true,
    form: "Schedule C",
  },
  {
    id: "equipment",
    iconName: "wrench",
    title: "Equipment purchases",
    desc: "Computers, cameras, office furniture, tools — anything bought for your business may be fully deductible in year one.",
    trigger: () => true,
    form: "Schedule C / Section 179",
  },
  {
    id: "startup",
    iconName: "zap",
    title: "Startup costs",
    desc: "If your business launched this year, up to $5,000 in startup expenses are deductible.",
    trigger: a => a.incomeType !== "w2only",
    form: "Schedule C",
  },
  {
    id: "selfemployed_health",
    iconName: "shield",
    title: "Self-employed health insurance",
    desc: "If you pay your own health insurance and are self-employed, 100% of premiums may be deductible.",
    trigger: a => a.incomeType !== "w2only",
    form: "Schedule 1",
  },
];

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULE D MANUAL ENTRY
// Transaction-entry model: asset / dates / proceeds / cost basis / notes.
// Term is inferred at render time from the two dates (calendar arithmetic).
// ═══════════════════════════════════════════════════════════════════════════════
function SchedDScreen({ items, onAdd, onDelete, onBack, pendingRestore, onRestore, onDiscardRestore }) {
  const [form, setForm] = useState({ asset: "", dateAcquired: "", dateSold: "", proceeds: "", costBasis: "", notes: "" });
  const [errors, setErrors] = useState({});

  const handleSubmit = () => {
    const result = validateSchedDEntry(form);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    onAdd({
      asset: form.asset.trim(),
      dateAcquired: form.dateAcquired,
      dateSold: form.dateSold,
      proceeds: parseFloat(form.proceeds) || 0,
      costBasis: parseFloat(form.costBasis) || 0,
      notes: form.notes || "",
    });
    setForm({ asset: "", dateAcquired: "", dateSold: "", proceeds: "", costBasis: "", notes: "" });
    setErrors({});
  };

  // Field updater that clears that field's error on change
  const updateField = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    if (errors[field]) setErrors(e => { const next = { ...e }; delete next[field]; return next; });
  };

  // Small helper for inline error text
  const ErrorText = ({ msg }) => msg ? (
    <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 4 }}>{msg}</div>
  ) : null;

  return (
    <div className="slide-up" style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.inkFaint, fontSize: 13, cursor: "pointer", marginBottom: 16, padding: 0 }}>
        ← Back to organizer
      </button>

      <div style={{ marginBottom: 28 }}>
        <div className="pf-label">Schedule D</div>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: C.ink, letterSpacing: "-0.4px", marginBottom: 8 }}>
          Capital gains & investment activity
        </h2>
        <p style={{ fontSize: 14, color: C.inkLight, lineHeight: 1.65 }}>
          Add stock, ETF, or crypto sales as you make them. Term is inferred from the dates.
        </p>
      </div>

      {pendingRestore && (
        <div style={{
          marginBottom: 20, padding: "14px 16px",
          background: "#FFFAF0",
          border: "1px solid rgba(230,184,0,0.35)",
          borderLeft: "3px solid #E6B800",
          borderRadius: 10, lineHeight: 1.5,
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <Icon name="folder" size={16} color="#E6B800" strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 1 }}>
                Resume saved Schedule D progress?
              </div>
              <div style={{ fontSize: 12, color: C.inkLight }}>
                We found {pendingRestore.count} saved {pendingRestore.count === 1 ? "transaction" : "transactions"} on this device.
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <button onClick={onRestore} style={{ background: C.forest, color: C.white, border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                Resume
              </button>
              <button onClick={onDiscardRestore} style={{ background: "transparent", color: C.inkLight, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", textDecoration: "underline" }}>
                Start fresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List of entered items */}
      {items.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div className="pf-label" style={{ marginBottom: 8 }}>Your entries ({items.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map(it => {
              const term = computeSchedDTerm(it.dateAcquired, it.dateSold);
              const ref  = getSchedDReference(it);
              const gain = (it.proceeds || 0) - (it.costBasis || 0);
              return (
                <div key={it.id} style={{ background: C.white, borderRadius: 10, padding: "12px 14px", border: `1px solid ${C.creamDeep}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 2 }}>{it.asset}</div>
                    <div style={{ fontSize: 11, color: C.inkFaint }}>
                      {it.dateAcquired} → {it.dateSold} · {term || "—"}{ref ? ` · ${ref.part}` : ""} · {gain >= 0 ? "+" : ""}${gain.toFixed(2)}
                    </div>
                  </div>
                  <button onClick={() => onDelete(it.id)} style={{ background: "none", border: "none", color: C.inkFaint, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Entry form */}
      <div style={{ background: C.white, borderRadius: 12, padding: 20, border: `1px solid ${C.creamDeep}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 14 }}>Add a transaction</div>
        {Object.keys(errors).length > 0 && (
          <div style={{ fontSize: 12, color: C.inkLight, marginBottom: 12 }}>
            Fix the highlighted fields, then try saving again.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div className="pf-label">Asset / description</div>
            <input className="pf-input" placeholder="e.g. Acme Corp common stock (50 sh)" value={form.asset} onChange={e => updateField("asset", e.target.value)} />
            <ErrorText msg={errors.asset} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div className="pf-label">Date acquired</div>
              <input className="pf-input" type="date" value={form.dateAcquired} onChange={e => updateField("dateAcquired", e.target.value)} />
              <ErrorText msg={errors.dateAcquired} />
            </div>
            <div>
              <div className="pf-label">Date sold</div>
              <input className="pf-input" type="date" value={form.dateSold} onChange={e => updateField("dateSold", e.target.value)} />
              <ErrorText msg={errors.dateSold} />
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div className="pf-label">Proceeds</div>
              <input className="pf-input" type="number" placeholder="4250.00" value={form.proceeds} onChange={e => updateField("proceeds", e.target.value)} />
              <ErrorText msg={errors.proceeds} />
            </div>
            <div>
              <div className="pf-label">Cost basis</div>
              <input className="pf-input" type="number" placeholder="3100.00" value={form.costBasis} onChange={e => updateField("costBasis", e.target.value)} />
              <ErrorText msg={errors.costBasis} />
            </div>
          </div>
          <div>
            <div className="pf-label">Notes (optional)</div>
            <input className="pf-input" placeholder="Any context for your tax professional" value={form.notes} onChange={e => updateField("notes", e.target.value)} />
          </div>
          <button className="pf-btn-primary" onClick={handleSubmit}>
            Add transaction →
          </button>
        </div>
      </div>

      <div style={{ marginTop: 18, fontSize: 11, color: C.inkFaint, textAlign: "center" }}>
        Structured entry only — PreFile does not calculate your tax · Confirm with your tax professional
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SCHEDULE 1 MANUAL ENTRY
// Adjustment / item-type model: typed dropdown of common adjustments and
// additional income items, with amount and optional notes.
// ═══════════════════════════════════════════════════════════════════════════════
function Sched1Screen({ items, onAdd, onDelete, onBack, pendingRestore, onRestore, onDiscardRestore }) {
  const [form, setForm] = useState({ itemType: SCHED_1_ITEM_TYPES[0], amount: "", notes: "" });
  const [errors, setErrors] = useState({});

  const handleSubmit = () => {
    const result = validateSched1Entry(form);
    if (!result.valid) {
      setErrors(result.errors);
      return;
    }
    onAdd({
      itemType: form.itemType,
      amount: parseFloat(form.amount) || 0,
      notes: form.notes || "",
    });
    setForm({ itemType: SCHED_1_ITEM_TYPES[0], amount: "", notes: "" });
    setErrors({});
  };

  const updateField = (field, value) => {
    setForm(f => ({ ...f, [field]: value }));
    if (errors[field]) setErrors(e => { const next = { ...e }; delete next[field]; return next; });
  };

  const ErrorText = ({ msg }) => msg ? (
    <div style={{ fontSize: 11, color: "#B91C1C", marginTop: 4 }}>{msg}</div>
  ) : null;

  return (
    <div className="slide-up" style={{ maxWidth: 640, margin: "0 auto", padding: "40px 24px" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: C.inkFaint, fontSize: 13, cursor: "pointer", marginBottom: 16, padding: 0 }}>
        ← Back to organizer
      </button>

      <div style={{ marginBottom: 28 }}>
        <div className="pf-label">Schedule 1</div>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: C.ink, letterSpacing: "-0.4px", marginBottom: 8 }}>
          Adjustments & additional income
        </h2>
        <p style={{ fontSize: 14, color: C.inkLight, lineHeight: 1.65 }}>
          Add items that don't fit the Schedule C expense flow — health insurance, IRA contributions, student loan interest, additional income.
        </p>
      </div>

      {pendingRestore && (
        <div style={{
          marginBottom: 20, padding: "14px 16px",
          background: "#FFFAF0",
          border: "1px solid rgba(230,184,0,0.35)",
          borderLeft: "3px solid #E6B800",
          borderRadius: 10, lineHeight: 1.5,
          display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
            <Icon name="folder" size={16} color="#E6B800" strokeWidth={2.2} style={{ flexShrink: 0 }} />
            <div style={{ flex: "1 1 240px", minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, marginBottom: 1 }}>
                Resume saved Schedule 1 progress?
              </div>
              <div style={{ fontSize: 12, color: C.inkLight }}>
                We found {pendingRestore.count} saved {pendingRestore.count === 1 ? "item" : "items"} on this device.
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
              <button onClick={onRestore} style={{ background: C.forest, color: C.white, border: "none", borderRadius: 9, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
                Resume
              </button>
              <button onClick={onDiscardRestore} style={{ background: "transparent", color: C.inkLight, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "'DM Sans', sans-serif", textDecoration: "underline" }}>
                Start fresh
              </button>
            </div>
          </div>
        </div>
      )}

      {/* List of entered items */}
      {items.length > 0 && (
        <div style={{ marginBottom: 28 }}>
          <div className="pf-label" style={{ marginBottom: 8 }}>Your entries ({items.length})</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {items.map(it => {
              const ref = getSched1Reference(it.itemType);
              return (
                <div key={it.id} style={{ background: C.white, borderRadius: 10, padding: "12px 14px", border: `1px solid ${C.creamDeep}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 2 }}>{it.itemType}</div>
                    <div style={{ fontSize: 11, color: C.inkFaint }}>
                      ${(it.amount || 0).toFixed(2)} · {ref.part} · {ref.line}{it.notes ? ` · ${it.notes}` : ""}
                    </div>
                  </div>
                  <button onClick={() => onDelete(it.id)} style={{ background: "none", border: "none", color: C.inkFaint, fontSize: 11, cursor: "pointer", textDecoration: "underline" }}>
                    Delete
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Entry form */}
      <div style={{ background: C.white, borderRadius: 12, padding: 20, border: `1px solid ${C.creamDeep}` }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink, marginBottom: 14 }}>Add an item</div>
        {Object.keys(errors).length > 0 && (
          <div style={{ fontSize: 12, color: C.inkLight, marginBottom: 12 }}>
            Fix the highlighted fields, then try saving again.
          </div>
        )}
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <div className="pf-label">Item type</div>
            <select className="pf-input" value={form.itemType} onChange={e => updateField("itemType", e.target.value)}>
              {SCHED_1_ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <ErrorText msg={errors.itemType} />
          </div>
          <div>
            <div className="pf-label">Amount</div>
            <input className="pf-input" type="number" placeholder="6800.00" value={form.amount} onChange={e => updateField("amount", e.target.value)} />
            <ErrorText msg={errors.amount} />
          </div>
          <div>
            <div className="pf-label">Notes (optional)</div>
            <input className="pf-input" placeholder="Any context for your tax professional" value={form.notes} onChange={e => updateField("notes", e.target.value)} />
          </div>
          <button className="pf-btn-primary" onClick={handleSubmit}>
            Add item →
          </button>
        </div>
      </div>

      <div style={{ marginTop: 18, fontSize: 11, color: C.inkFaint, textAlign: "center" }}>
        Structured entry only — PreFile does not calculate your tax · Confirm with your tax professional
      </div>
    </div>
  );
}

// Step 1 — Questions
function CheckQuestions({ onDone }) {
  const [answers, setAnswers] = useState({ incomeType: null, workFromHome: null, usePhone: null, driveForWork: null });
  const [step, setStep] = useState(0);

  const questions = [
    {
      key: "incomeType",
      q: "How do you earn income?",
      sub: "This helps us find the right deductions for you",
      options: [
        { label: "W-2 employee only", value: "w2only", iconName: "briefcase" },
        { label: "Freelance / 1099 only", value: "1099only", iconName: "receipt" },
        { label: "Both W-2 and freelance", value: "both", iconName: "file" },
      ],
    },
    {
      key: "workFromHome",
      q: "Do you work from home?",
      sub: "A dedicated workspace — even a corner of a room — may qualify",
      options: [
        { label: "Yes, I have a home workspace", value: true, iconName: "home" },
        { label: "No, I work outside the home", value: false, iconName: "briefcase" },
      ],
    },
    {
      key: "usePhone",
      q: "Do you use your phone or internet for work?",
      sub: "Business portion of your bill is deductible",
      options: [
        { label: "Yes, regularly", value: true, iconName: "zap" },
        { label: "No, personal only", value: false, iconName: "file" },
      ],
    },
    {
      key: "driveForWork",
      q: "Do you drive for work?",
      sub: "Client visits, errands, deliveries — every business mile counts",
      options: [
        { label: "Yes, I drive for work", value: true, iconName: "car" },
        { label: "No, I don't drive for work", value: false, iconName: "file" },
      ],
    },
  ];

  const current = questions[step];
  const allAnswered = step >= questions.length;
  const progress = ((step) / questions.length) * 100;

  useEffect(() => {
    if (allAnswered) {
      onDone(answers);
    }
  }, [allAnswered]);

  const handleAnswer = (key, value) => {
    const updated = { ...answers, [key]: value };
    setAnswers(updated);
    setTimeout(() => setStep(s => s + 1), 220);
  };

  if (allAnswered) return null;

  return (
    <div className="slide-up" style={{ maxWidth: 520, margin: "0 auto", padding: "40px 24px" }}>
      {/* Progress */}
      <div style={{ marginBottom: 28 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div className="pf-label">Question {step + 1} of {questions.length}</div>
          <div style={{ fontSize: 11, color: C.inkFaint }}>60 seconds</div>
        </div>
        <div className="progress-bar" style={{ marginBottom: 0 }}>
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      <div key={step} className="slide-up">
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 700, color: C.ink, letterSpacing: "-0.3px", marginBottom: 8 }}>
          {current.q}
        </h2>
        <p style={{ fontSize: 13, color: C.inkLight, marginBottom: 28, lineHeight: 1.6 }}>
          {current.sub}
        </p>

        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {current.options.map(opt => (
            <button
              key={String(opt.value)}
              onClick={() => handleAnswer(current.key, opt.value)}
              style={{
                background: C.white,
                border: `2px solid ${C.creamDeep}`,
                borderRadius: 14,
                padding: "16px 20px",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 14,
                textAlign: "left",
                transition: "all 0.15s",
                fontFamily: "'DM Sans', sans-serif",
              }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.forest; e.currentTarget.style.background = "rgba(27,94,32,0.03)"; e.currentTarget.style.transform = "translateY(-1px)"; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.creamDeep; e.currentTarget.style.background = C.white; e.currentTarget.style.transform = "none"; }}
            >
              <Icon name={opt.iconName || "file"} size={22} color={C.inkLight} strokeWidth={1.5} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{opt.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// Step 2 — Loading
function CheckLoading({ onDone }) {
  const [phase, setPhase] = useState(0);
  const phrases = [
    "Reviewing common deductions…",
    "Matching to your situation…",
    "Building your checklist…",
  ];

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 700);
    const t2 = setTimeout(() => setPhase(2), 1500);
    const t3 = setTimeout(() => onDone(), 2600);
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, []);

  return (
    <div className="fade-in" style={{ maxWidth: 520, margin: "0 auto", padding: "100px 24px", textAlign: "center" }}>
      <div style={{
        width: 52, height: 52, borderRadius: "50%",
        border: `3px solid ${C.creamDeep}`, borderTopColor: C.forest,
        margin: "0 auto 28px",
      }} className="spin" />
      <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 24, fontWeight: 700, color: C.ink, marginBottom: 10, letterSpacing: "-0.3px" }}>
        Building your checklist…
      </h2>
      <p key={phase} className="fade-in" style={{ fontSize: 14, color: C.inkFaint, lineHeight: 1.6 }}>
        {phrases[phase]}
      </p>
    </div>
  );
}

// Step 3 — Reveal
function CheckReveal({ answers, onContinue }) {
  const items = CHECK_ITEMS.filter(item => item.trigger(answers));
  const [checked, setChecked] = useState({});

  const toggle = id => setChecked(c => ({ ...c, [id]: !c[id] }));
  const checkedCount = Object.values(checked).filter(Boolean).length;

  return (
    <div className="slide-up" style={{ maxWidth: 600, margin: "0 auto", padding: "40px 24px" }}>

      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{
          display: "inline-flex", alignItems: "center", gap: 8,
          background: "rgba(27,94,32,0.1)", borderRadius: 20,
          padding: "5px 14px", marginBottom: 16,
        }}>
          <Icon name="checkCircle" size={13} color={C.forest} strokeWidth={2} />
          <span style={{ fontSize: 12, fontWeight: 700, color: C.forest }}>
            {items.length} items found for your situation
          </span>
        </div>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: 28, fontWeight: 700, color: C.ink, letterSpacing: "-0.4px", marginBottom: 10 }}>
          Based on your answers, here are items you may be missing
        </h2>
        <p style={{ fontSize: 14, color: C.inkLight, lineHeight: 1.65 }}>
          These are commonly overlooked — confirm each with your tax professional before filing
        </p>
      </div>

      {/* Checklist */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 28 }}>
        {items.map((item, i) => {
          const isChecked = checked[item.id];
          return (
            <div
              key={item.id}
              className="fade-in"
              onClick={() => toggle(item.id)}
              style={{
                animationDelay: `${i * 80}ms`,
                background: isChecked ? "rgba(27,94,32,0.05)" : C.white,
                border: `1.5px solid ${isChecked ? C.forestLight : C.creamDeep}`,
                borderRadius: 14,
                padding: "16px 18px",
                cursor: "pointer",
                display: "flex",
                gap: 14,
                alignItems: "flex-start",
                transition: "all 0.18s",
              }}
            >
              {/* Checkbox */}
              <div style={{
                width: 22, height: 22, borderRadius: 6, flexShrink: 0, marginTop: 1,
                border: `2px solid ${isChecked ? C.forest : C.creamDeep}`,
                background: isChecked ? C.forest : C.white,
                display: "flex", alignItems: "center", justifyContent: "center",
                transition: "all 0.15s",
              }}>
                {isChecked && <Icon name="checkCircle" size={12} color={C.white} strokeWidth={2.5} />}
              </div>

              <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                  <span style={{ fontSize: 18 }}>{item.icon}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: C.ink, fontFamily: "'Fraunces', serif" }}>
                    {item.title}
                  </span>
                </div>
                <p style={{ fontSize: 12, color: C.inkLight, lineHeight: 1.6, margin: 0 }}>
                  {item.desc}
                </p>
                <div style={{
                  display: "inline-block", marginTop: 8,
                  background: C.creamDark, borderRadius: 6,
                  padding: "2px 8px", fontSize: 10, fontWeight: 700, color: C.inkFaint,
                }}>
                  {item.form}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Progress note */}
      {checkedCount > 0 && (
        <div className="fade-in" style={{
          background: "rgba(27,94,32,0.08)", border: `1px solid rgba(27,94,32,0.15)`,
          borderRadius: 12, padding: "10px 16px", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 16 }}>🎯</span>
          <span style={{ fontSize: 13, color: C.forest, fontWeight: 600 }}>
            {checkedCount} item{checkedCount > 1 ? "s" : ""} marked to track — add receipts for each one
          </span>
        </div>
      )}

      {/* CTA */}
      <button className="pf-btn-primary" onClick={onContinue} style={{ width: "100%", fontSize: 16, padding: "16px" }}>
        Continue organizing my receipts →
      </button>
      <div style={{ marginTop: 12, fontSize: 11, color: C.inkFaint, textAlign: "center" }}>
        PreFile prepares filing-ready data for your tax professional — not tax advice · Always verify with your tax professional
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUCCESS TOAST
// ═══════════════════════════════════════════════════════════════════════════════
function Toast({ message, visible }) {
  return (
    <div style={{
      position: "fixed", bottom: 24, left: "50%",
      transform: `translateX(-50%) translateY(${visible ? 0 : 20}px)`,
      opacity: visible ? 1 : 0, transition: "all 0.3s cubic-bezier(0.16,1,0.3,1)",
      background: C.ink, color: C.white, borderRadius: 12, padding: "12px 20px",
      fontSize: 13, fontWeight: 600, zIndex: 999, whiteSpace: "nowrap",
      boxShadow: "0 8px 32px rgba(0,0,0,0.2)",
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{ color: "#22C55E" }}>✓</span> {message}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT APP — UPDATED ROUTING
// ═══════════════════════════════════════════════════════════════════════════════
export default function PreFileApp() {
  // pages: home | receipt-flow | organizer | check | yearend
  const [page, setPage]             = useState("home");
  const [entryOrigin, setEntryOrigin] = useState("flow"); // flow | organizer
  const [receiptStep, setReceiptStep] = useState("add");
  const [checkStep, setCheckStep]   = useState("questions"); // questions | loading | reveal
  const [checkAnswers, setCheckAnswers] = useState(null);
  const [method, setMethod]         = useState(null);
  const [pendingReceipt, setPendingReceipt] = useState(null);
  const [receipts, setReceipts]     = useState([]);
  // ── Schedule D / Schedule 1 manual-entry state ──
  // Kept separate from the receipts/category model because these schedules
  // have fundamentally different shapes:
  //   Schedule D = transaction-entry model (asset, dates, proceeds, basis)
  //   Schedule 1 = adjustment/item-type model (typed line items)
  const [schedDItems, setSchedDItems] = useState([]);
  const [sched1Items, setSched1Items] = useState([]);
  const [pendingSchedDRestore, setPendingSchedDRestore] = useState(null); // { count, data } | null
  const [pendingSched1Restore, setPendingSched1Restore] = useState(null); // { count, data } | null
  const [toast, setToast]           = useState({ visible: false, message: "" });
  const [isSaved, setIsSaved]       = useState(false);
  const [showPaywall, setShowPaywall] = useState(false);
  const [showSavedConfirm, setShowSavedConfirm] = useState(false);
  const [showDownloadMsg, setShowDownloadMsg]   = useState(false);
  const [isDownloading, setIsDownloading]       = useState(false);
  const isExportingRef = useRef(false);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  // ── Warn before leaving if receipts exist and not saved ──
  useEffect(() => {
    const handleBeforeUnload = e => {
      if (receipts.length > 0 && !isSaved) {
        e.preventDefault();
        e.returnValue = "Your receipts are not saved yet — are you sure you want to leave?";
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [receipts.length, isSaved]);

  // ── Persistence: measure saved receipts on mount (do NOT silently restore).
  //    Previously this useEffect called setReceipts(JSON.parse(saved)), which
  //    silently dropped users back into a list of every receipt they'd ever
  //    added — frequently dozens — without any continuity cue. Now we capture
  //    the saved data into pendingRestore and surface a resume banner so the
  //    user explicitly opts in (resume) or out (discard).
  const [pendingRestore, setPendingRestore] = useState(null); // { count, data } | null
  useEffect(() => {
    const saved = localStorage.getItem("prefile_receipts");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      if (Array.isArray(parsed) && parsed.length > 0) {
        setPendingRestore({ count: parsed.length, data: parsed });
      }
    } catch (e) {}
  }, []);

  // Restore the saved receipts when the user explicitly chooses to resume.
  const handleRestore = () => {
    if (!pendingRestore) return;
    setReceipts(pendingRestore.data);
    setPendingRestore(null);
  };

  // Discard the saved receipts when the user chooses a fresh start.
  const handleDiscardRestore = () => {
    localStorage.removeItem("prefile_receipts");
    setPendingRestore(null);
  };

  // ── Persistence: save receipts whenever they change ──
  // If the user adds receipts while a pendingRestore is still live (i.e.
  // they ignored the resume banner and started fresh), treat that first
  // write as an implicit "Start fresh" — clear the pending restore and
  // begin persisting normally. This prevents the new receipts from being
  // overwritten if the user later clicks Resume.
  useEffect(() => {
    if (pendingRestore && receipts.length === 0) return; // still empty, don't overwrite saved
    if (pendingRestore && receipts.length > 0) {
      // User added something without resuming → implicit discard
      setPendingRestore(null);
    }
    localStorage.setItem("prefile_receipts", JSON.stringify(receipts));
  }, [receipts, pendingRestore]);

  // ── Schedule D / Schedule 1 persistence ──
  // Match the explicit receipt restore pattern: measure saved progress on
  // mount, stage it as pending, and let the user consciously resume or start
  // fresh rather than silently restoring items into view.
  useEffect(() => {
    const savedD = localStorage.getItem("prefile_sched_d");
    if (savedD) {
      try {
        const parsed = JSON.parse(savedD);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPendingSchedDRestore({ count: parsed.length, data: parsed });
        }
      } catch (e) {}
    }
    const saved1 = localStorage.getItem("prefile_sched_1");
    if (saved1) {
      try {
        const parsed = JSON.parse(saved1);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setPendingSched1Restore({ count: parsed.length, data: parsed });
        }
      } catch (e) {}
    }
  }, []);

  const handleRestoreSchedD = () => {
    if (!pendingSchedDRestore) return;
    setSchedDItems(pendingSchedDRestore.data);
    setPendingSchedDRestore(null);
  };

  const handleDiscardSchedDRestore = () => {
    localStorage.removeItem("prefile_sched_d");
    setPendingSchedDRestore(null);
  };

  const handleRestoreSched1 = () => {
    if (!pendingSched1Restore) return;
    setSched1Items(pendingSched1Restore.data);
    setPendingSched1Restore(null);
  };

  const handleDiscardSched1Restore = () => {
    localStorage.removeItem("prefile_sched_1");
    setPendingSched1Restore(null);
  };

  useEffect(() => {
    if (pendingSchedDRestore && schedDItems.length == 0) return;
    if (pendingSchedDRestore && schedDItems.length > 0) {
      setPendingSchedDRestore(null);
    }
    localStorage.setItem("prefile_sched_d", JSON.stringify(schedDItems));
  }, [schedDItems, pendingSchedDRestore]);

  useEffect(() => {
    if (pendingSched1Restore && sched1Items.length == 0) return;
    if (pendingSched1Restore && sched1Items.length > 0) {
      setPendingSched1Restore(null);
    }
    localStorage.setItem("prefile_sched_1", JSON.stringify(sched1Items));
  }, [sched1Items, pendingSched1Restore]);

  const showToast = msg => {
    setToast({ visible: true, message: msg });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  };

  // ── Receipt flow handlers ──
  const handleMethod = m => {
    if (m === "schedule-c" || m === "manual") {
      setMethod("manual");
      setReceiptStep("processing");
      setPage("receipt-flow");
      return;
    }
    if (m === "schedule-d") {
      setEntryOrigin("flow");
      setPage("schedule-d");
      return;
    }
    if (m === "schedule-1") {
      setEntryOrigin("flow");
      setPage("schedule-1");
    }
  };
  const handleExtracted = r => { setPendingReceipt(r); setReceiptStep("confirm"); };
  const handleConfirm = () => {
    setReceipts(r => [...r, pendingReceipt]);
    showToast(`${pendingReceipt.merchant} added · $${parseFloat(pendingReceipt.amount).toFixed(2)}`);
    setPage("organizer");
    setReceiptStep("add");
    setPendingReceipt(null);
  };
  const handleEdit      = () => setReceiptStep("edit");
  const handleSaveEdit  = u => { setPendingReceipt(u); setReceiptStep("confirm"); };
  const handleAddAnother = () => { setEntryOrigin("flow"); setPage("receipt-flow"); setReceiptStep("add"); };
  const handleDeleteReceipt = (id) => {
    setReceipts(prev => prev.filter(r => r.id !== id));
  };

  const handleClearData  = () => {
    if (!window.confirm("Clear all receipts? This cannot be undone.")) return;
    localStorage.removeItem("prefile_receipts");
    setReceipts([]);
    setIsSaved(false);
    setPage("home");
    showToast("All receipts cleared");
  };

  const renderReceiptFlow = () => {
    switch (receiptStep) {
      case "add":        return <AddReceiptScreen onMethod={handleMethod} isMobile={isMobile} />;
      case "processing": return <ProcessingScreen method={method} onExtracted={handleExtracted} receipts={receipts} />;
      case "confirm":    return <ConfirmScreen receipt={pendingReceipt} onConfirm={handleConfirm} onEdit={handleEdit} />;
      case "edit":       return <EditScreen receipt={pendingReceipt} onSave={handleSaveEdit} onCancel={() => setReceiptStep("confirm")} />;
      default:           return null;
    }
  };

  // ── Export / paywall handlers ──
  const handleExport = () => {
    setIsDownloading(true);
    setShowDownloadMsg(false);
    try { doExport(); } catch(e) { console.error(e); }
    setTimeout(() => {
      setIsDownloading(false);
    }, 1500);
  };

  const doExport = () => {
    // Part 6: empty guard — bail before consuming the export lock
    if (!receipts || receipts.length === 0) {
      showToast("Add at least one receipt before downloading.");
      return;
    }
    // Part 1: re-entry guard — prevent double export from rapid clicks or state races
    if (isExportingRef.current) return;
    isExportingRef.current = true;
    // Part 2: reset download confirmation state before this export runs
    setShowDownloadMsg(false);

    try {
    // ── Helpers ──────────────────────────────────────────────
    // Convert hex #RRGGBB → XLSX ARGB "FF" + RRGGBB (uppercase, no #)
    const toArgb = hex => "FF" + hex.replace("#", "").toUpperCase().padEnd(6, "0");

    // Soft pastel: blend hex toward white at 75% opacity
    const soften = hex => {
      const h = hex.replace("#", "");
      const r = Math.round(parseInt(h.slice(0,2),16) * 0.25 + 255 * 0.75);
      const g = Math.round(parseInt(h.slice(2,4),16) * 0.25 + 255 * 0.75);
      const b = Math.round(parseInt(h.slice(4,6),16) * 0.25 + 255 * 0.75);
      return "FF" + [r,g,b].map(n => n.toString(16).padStart(2,"0")).join("").toUpperCase();
    };

    const cell = (v, opts = {}) => ({ v, t: typeof v === "number" ? "n" : "s", ...opts });

    const applyStyle = (ws, addr, style) => {
      if (!ws[addr]) ws[addr] = { v: "", t: "s" };
      ws[addr].s = style;
    };

    const INK    = "FF1A1A18";
    const WHITE  = "FFFFFFFF";
    const CREAM  = "FFFAFAF7";
    const CREAM2 = "FFF2F0EB";
    const FOREST = "FF1B5E20";

    const headerStyle = (bg = INK) => ({
      font:      { bold: true, color: { rgb: WHITE }, name: "Calibri", sz: 10 },
      fill:      { fgColor: { rgb: bg }, patternType: "solid" },
      alignment: { horizontal: "center", vertical: "center", wrapText: false },
      border: {
        top:    { style: "thin", color: { rgb: "FFD0D0D0" } },
        bottom: { style: "thin", color: { rgb: "FFD0D0D0" } },
        left:   { style: "thin", color: { rgb: "FFD0D0D0" } },
        right:  { style: "thin", color: { rgb: "FFD0D0D0" } },
      },
    });

    const dataStyle = (bg, bold = false, align = "left") => ({
      font:      { bold, color: { rgb: INK }, name: "Calibri", sz: 10 },
      fill:      { fgColor: { rgb: bg }, patternType: "solid" },
      alignment: { horizontal: align, vertical: "center", wrapText: true },
      border: {
        top:    { style: "thin", color: { rgb: "FFEAEAEA" } },
        bottom: { style: "thin", color: { rgb: "FFEAEAEA" } },
        left:   { style: "thin", color: { rgb: "FFEAEAEA" } },
        right:  { style: "thin", color: { rgb: "FFEAEAEA" } },
      },
    });

    const totalStyle = {
      font:      { bold: true, color: { rgb: WHITE }, name: "Calibri", sz: 11 },
      fill:      { fgColor: { rgb: FOREST }, patternType: "solid" },
      alignment: { horizontal: "right", vertical: "center" },
      border: {
        top:    { style: "medium", color: { rgb: "FF0D4A10" } },
        bottom: { style: "medium", color: { rgb: "FF0D4A10" } },
        left:   { style: "thin",   color: { rgb: "FF0D4A10" } },
        right:  { style: "thin",   color: { rgb: "FF0D4A10" } },
      },
    };

    // ──────────────────────────────────────────────────────────────────────
    // SHARED DATA + STYLES for the 4-sheet CPA-aligned export
    // ──────────────────────────────────────────────────────────────────────
    const grandTotal = receipts.reduce(
      (s, r) => s + ((parseFloat(r.amount) || 0) * ((r.businessPct || 100) / 100)),
      0
    );
    const preparedDate = new Date().toLocaleDateString("en-US", {
      year: "numeric", month: "long", day: "numeric",
    });

    // Per-category business totals + receipts grouped by category
    const catTotals = {};
    const catReceipts = {};
    receipts.forEach(r => {
      const amt = parseFloat(r.amount) || 0;
      const bizAmt = amt * ((r.businessPct || 100) / 100);
      catTotals[r.category]   = (catTotals[r.category]   || 0) + bizAmt;
      catReceipts[r.category] = catReceipts[r.category]  || [];
      catReceipts[r.category].push(r);
    });
    const sortedCats = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    const grandBiz = grandTotal;

    // Schedule C line totals — tag-aware. Each receipt is routed to its
    // EFFECTIVE Schedule C line: if the receipt has a tag (cogs_inventory,
    // freight_in, etc.), the tag's mapping wins; otherwise the category's
    // mapping is used. This means a "Supplies" receipt tagged as
    // cogs_inventory will appear under Schedule C Line 36, not Line 22.
    //
    // Bucketing key in lineTotals reflects the tagged section name when
    // present (e.g. "Schedule C Part III — Purchases (one of several COGS
    // inputs)") so a preparer reading the export sees the COGS-related
    // grouping clearly, not just a Line 36 cell with no context.
    const effectiveLineFor = (r) => {
      const meta = r.tag && TAG_META[r.tag];
      if (meta) return meta.section || meta.schCLine;
      return SCHEDULE_C_REFERENCE[r.category] || "Varies — review before filing";
    };
    // Display label for the "Category" column in the Schedule C sheet. For
    // tagged receipts, show the tag label (e.g. "Inventory purchase") so the
    // preparer sees why the receipt was routed differently from its category.
    const displayCategoryFor = (r) => {
      const meta = r.tag && TAG_META[r.tag];
      return meta ? `${meta.label} (was ${r.category})` : r.category;
    };
    const lineTotals = {}; // { line/section: { total, items: { displayCategory: { amount, receipts } } } }
    receipts.forEach(r => {
      const amt = parseFloat(r.amount) || 0;
      const bizAmt = amt * ((r.businessPct || 100) / 100);
      const line = effectiveLineFor(r);
      const display = displayCategoryFor(r);
      if (!lineTotals[line]) lineTotals[line] = { total: 0, items: {} };
      if (!lineTotals[line].items[display]) {
        lineTotals[line].items[display] = { amount: 0, receipts: [] };
      }
      lineTotals[line].total += bizAmt;
      lineTotals[line].items[display].amount += bizAmt;
      lineTotals[line].items[display].receipts.push(r);
    });
    // Convert each line's items map into a sorted array (descending by amount)
    Object.values(lineTotals).forEach(group => {
      group.categories = Object.entries(group.items)
        .map(([category, data]) => ({ category, amount: data.amount, receipts: data.receipts }))
        .sort((a, b) => b.amount - a.amount);
      delete group.items;
    });
    // Sort: Schedule C Part III (COGS) first, then numbered Schedule C lines
    // in ascending order, then "Varies" buckets last.
    const sortedLines = Object.entries(lineTotals).sort(([a], [b]) => {
      const aIsCOGS = a.startsWith("Schedule C Part III");
      const bIsCOGS = b.startsWith("Schedule C Part III");
      if (aIsCOGS && !bIsCOGS) return -1;
      if (bIsCOGS && !aIsCOGS) return 1;
      const aNum = a.match(/Line (\d+)/);
      const bNum = b.match(/Line (\d+)/);
      if (aNum && bNum) return parseInt(aNum[1]) - parseInt(bNum[1]);
      if (aNum) return -1;
      if (bNum) return 1;
      return a.localeCompare(b);
    });

    // Insights for Review & Flags sheet (re-uses existing computeInsights output)
    const insightsForReview = computeInsights(receipts).all || [];

    // ── Shared style palette (matches the design language established in
    //    the previous Summary-sheet pass) ──
    //   FF1F5F2E — dark green (titles, totals, table-header text)
    //   FFF4FAF6 — very light green (totals fill)
    //   FFEEF6F0 — light green tint (table header fill)
    //   FFD6E8DC — soft green border
    //   FFFFFAF0 — soft warm fill (insight rows)
    //   FFE6B800 — warm gold (insight left border accent)
    //   FF4A4A4A — neutral gray (description / disclaimer text)
    //   FF6B6B6B — section-label gray
    //   FFFAFAFA — zebra row fill
    //   FFF0F0F0 — thin row divider
    const titleStyle = {
      font:      { bold: true, color: { rgb: "FFFFFFFF" }, name: "Calibri", sz: 18 },
      alignment: { horizontal: "left", vertical: "center" },
      fill:      { patternType: "solid", fgColor: { rgb: "FF1B5E20" } },
    };
    const subheaderStyle = {
      font:      { color: { rgb: "FF4A4A4A" }, name: "Calibri", sz: 11 },
      alignment: { horizontal: "left", vertical: "center" },
    };
    const bylineStyle = {
      font:      { italic: true, color: { rgb: "FF3A6B40" }, name: "Calibri", sz: 10 },
      alignment: { horizontal: "left", vertical: "center" },
    };
    const sectionLabelStyle = {
      font:      { bold: true, color: { rgb: "FF1F5F2E" }, name: "Calibri", sz: 13 },
      alignment: { horizontal: "left", vertical: "center" },
      fill:      { patternType: "solid", fgColor: { rgb: "FFF4FAF6" } },
      border:    {
        left:   { style: "medium", color: { rgb: "FF1B5E20" } },
        bottom: { style: "thin",   color: { rgb: "FFD6E8DC" } },
      },
    };
    const tableHeaderStyle = {
      font:      { bold: true, color: { rgb: "FFFFFFFF" }, name: "Calibri", sz: 11 },
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
      fill:      { patternType: "solid", fgColor: { rgb: "FF1B5E20" } },
      border:    { bottom: { style: "thin", color: { rgb: "FFD6E8DC" } } },
    };
    const tableHeaderRightStyle = {
      ...tableHeaderStyle,
      alignment: { horizontal: "right", vertical: "center", wrapText: true },
    };
    const totalLabelStyle = {
      font:      { bold: true, color: { rgb: "FF1F5F2E" }, name: "Calibri", sz: 14 },
      alignment: { horizontal: "left", vertical: "center" },
      fill:      { patternType: "solid", fgColor: { rgb: "FFF4FAF6" } },
      border:    {
        top:    { style: "thin", color: { rgb: "FFD6E8DC" } },
        bottom: { style: "thin", color: { rgb: "FFD6E8DC" } },
        left:   { style: "thin", color: { rgb: "FFD6E8DC" } },
      },
    };
    const totalAmountStyle = {
      font:      { bold: true, color: { rgb: "FF1F5F2E" }, name: "Calibri", sz: 14 },
      alignment: { horizontal: "right", vertical: "center" },
      fill:      { patternType: "solid", fgColor: { rgb: "FFF4FAF6" } },
      border:    {
        top:    { style: "thin", color: { rgb: "FFD6E8DC" } },
        bottom: { style: "thin", color: { rgb: "FFD6E8DC" } },
        right:  { style: "thin", color: { rgb: "FFD6E8DC" } },
      },
    };
    const lineSubtotalLabelStyle = {
      font:      { bold: true, color: { rgb: "FF1F5F2E" }, name: "Calibri", sz: 11 },
      alignment: { horizontal: "left", vertical: "center" },
      fill:      { patternType: "solid", fgColor: { rgb: "FFF4FAF6" } },
      border:    { top: { style: "thin", color: { rgb: "FFD6E8DC" } } },
    };
    const lineSubtotalAmountStyle = {
      ...lineSubtotalLabelStyle,
      alignment: { horizontal: "right", vertical: "center" },
    };
    const dataRowEvenStyle = {
      font:      { color: { rgb: INK }, name: "Calibri", sz: 11 },
      alignment: { horizontal: "left", vertical: "center" },
      fill:      { patternType: "solid", fgColor: { rgb: "FFFFFFFF" } },
      border:    { bottom: { style: "thin", color: { rgb: "FFF0F0F0" } } },
    };
    const dataRowOddStyle = {
      ...dataRowEvenStyle,
      fill:      { patternType: "solid", fgColor: { rgb: "FFFAFAFA" } },
    };
    const dataAmountEvenStyle = { ...dataRowEvenStyle, alignment: { horizontal: "right", vertical: "center" } };
    const dataAmountOddStyle  = { ...dataRowOddStyle,  alignment: { horizontal: "right", vertical: "center" } };
    const flagIssueStyle = {
      font:      { bold: true, color: { rgb: INK }, name: "Calibri", sz: 11 },
      alignment: { horizontal: "left", vertical: "top", wrapText: true },
      fill:      { patternType: "solid", fgColor: { rgb: "FFFFFAF0" } },
      border:    { left: { style: "medium", color: { rgb: "FFE6B800" } } },
    };
    const flagBodyStyle = {
      font:      { color: { rgb: INK }, name: "Calibri", sz: 11 },
      alignment: { horizontal: "left", vertical: "top", wrapText: true },
      fill:      { patternType: "solid", fgColor: { rgb: "FFFFFAF0" } },
    };
    const disclaimerStyle = {
      font:      { italic: true, color: { rgb: "FF9A9A97" }, name: "Calibri", sz: 9 },
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
      border:    { top: { style: "thin", color: { rgb: "FFD6E8DC" } } },
    };

    // ──────────────────────────────────────────────────────────────────────
    // SHEET 1 — MASTER SUMMARY
    // Title, prepared date, top totals, navigation to other sheets, top 3
    // categories. No fabricated business name (PreFile does not collect it).
    // ──────────────────────────────────────────────────────────────────────
    const wsMaster = {};
    wsMaster["A1"] = { v: "PreFile Organizer — Master Summary", t: "s", s: titleStyle };
    wsMaster["A2"] = { v: `Tax Year ${TAX_YEAR}  ·  Prepared ` + preparedDate, t: "s", s: subheaderStyle };
    wsMaster["A3"] = { v: "Filing-ready summary for your tax professional. Confirm all amounts before filing.", t: "s", s: bylineStyle };

    // Key totals (rows 5–7)
    wsMaster["A5"] = { v: "Total Business Expenses", t: "s", s: totalLabelStyle };
    wsMaster["B5"] = { v: grandTotal, t: "n", z: "$#,##0.00", s: totalAmountStyle };
    wsMaster["A6"] = { v: "Total Receipts Logged", t: "s", s: { ...totalLabelStyle, font: { ...totalLabelStyle.font, sz: 11 } } };
    wsMaster["B6"] = { v: receipts.length, t: "n", s: { ...totalAmountStyle, font: { ...totalAmountStyle.font, sz: 11 } } };
    wsMaster["A7"] = { v: "Distinct Categories", t: "s", s: { ...totalLabelStyle, font: { ...totalLabelStyle.font, sz: 11 } } };
    wsMaster["B7"] = { v: sortedCats.length, t: "n", s: { ...totalAmountStyle, font: { ...totalAmountStyle.font, sz: 11 } } };

    // Top 3 categories preview (rows 9–13)
    wsMaster["A9"] = { v: "Top Categories", t: "s", s: sectionLabelStyle };
    wsMaster["A10"] = { v: "Category", t: "s", s: tableHeaderStyle };
    wsMaster["B10"] = { v: "Total", t: "s", s: tableHeaderRightStyle };
    wsMaster["C10"] = { v: "% of Spend", t: "s", s: tableHeaderRightStyle };
    sortedCats.slice(0, 3).forEach(([cat, total], i) => {
      const rowNum = 11 + i;
      const isOdd = i % 2 === 1;
      wsMaster["A" + rowNum] = { v: cat, t: "s", s: isOdd ? dataRowOddStyle : dataRowEvenStyle };
      wsMaster["B" + rowNum] = { v: total, t: "n", z: "$#,##0.00", s: isOdd ? dataAmountOddStyle : dataAmountEvenStyle };
      wsMaster["C" + rowNum] = { v: grandBiz > 0 ? total / grandBiz : 0, t: "n", z: "0.0%", s: isOdd ? dataAmountOddStyle : dataAmountEvenStyle };
    });

    // Navigator (rows 15+)
    const navStartRow = 11 + Math.min(3, sortedCats.length) + 1; // blank row, then label
    wsMaster["A" + navStartRow] = { v: "What's in this Workbook", t: "s", s: sectionLabelStyle };
    const navHeaderRow = navStartRow + 1;
    wsMaster["A" + navHeaderRow] = { v: "Sheet", t: "s", s: tableHeaderStyle };
    wsMaster["B" + navHeaderRow] = { v: "What it shows",     t: "s", s: tableHeaderStyle };
    const navRows = [
      ["Master Summary",            "Top totals, top categories, sheet navigator (this sheet)"],
      ["Schedule C Expenses",       "Receipt totals grouped by Schedule C line — preparer-ready view"],
      ["Business Expenses by Category", "Every receipt, grouped by category, tagged with its Schedule C line"],
      ["Review & Flags",            "Issues to confirm before filing, generated from the receipt data"],
    ];
    navRows.forEach(([sheet, desc], i) => {
      const rowNum = navHeaderRow + 1 + i;
      const isOdd = i % 2 === 1;
      wsMaster["A" + rowNum] = { v: sheet, t: "s", s: isOdd ? dataRowOddStyle : dataRowEvenStyle };
      wsMaster["B" + rowNum] = { v: desc,  t: "s", s: isOdd ? dataRowOddStyle : dataRowEvenStyle };
    });

    // Disclaimer footer
    const masterDiscRow = navHeaderRow + 1 + navRows.length + 1;
    wsMaster["A" + masterDiscRow] = {
      v: "For organization purposes only · Amounts are estimates · Always verify with your tax professional before filing",
      t: "s",
      s: disclaimerStyle,
    };
    wsMaster["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } }, // title
      { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } }, // subheader
      { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } }, // byline
      { s: { r: navStartRow - 1, c: 0 }, e: { r: navStartRow - 1, c: 2 } },
      { s: { r: navHeaderRow - 1, c: 1 }, e: { r: navHeaderRow - 1, c: 2 } }, // "What it shows" spans B+C
      ...navRows.map((_, i) => ({
        s: { r: navHeaderRow + i, c: 1 },
        e: { r: navHeaderRow + i, c: 2 },
      })),
      { s: { r: masterDiscRow - 1, c: 0 }, e: { r: masterDiscRow - 1, c: 2 } }, // disclaimer
    ];
    wsMaster["!ref"]  = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: 2, r: masterDiscRow - 1 } });
    wsMaster["!cols"] = [{ wch: 38 }, { wch: 18 }, { wch: 16 }];
    const masterRowHeights = [];
    masterRowHeights[0] = { hpt: 28 };
    masterRowHeights[1] = { hpt: 18 };
    masterRowHeights[2] = { hpt: 16 };
    masterRowHeights[4] = { hpt: 24 };
    masterRowHeights[masterDiscRow - 1] = { hpt: 28 };
    wsMaster["!rows"] = masterRowHeights;
    wsMaster["!freeze"] = { ySplit: 1 };

    // ──────────────────────────────────────────────────────────────────────
    // SHEET 2 — SCHEDULE C EXPENSES
    // Receipt totals grouped by IRS Schedule C line. This is the single
    // most preparer-useful view in the workbook — it answers "what goes
    // on each line of the form" directly.
    // ──────────────────────────────────────────────────────────────────────
    const wsSchC = {};
    wsSchC["A1"] = { v: "Schedule C Expenses", t: "s", s: titleStyle };
    wsSchC["A2"] = { v: `Tax Year ${TAX_YEAR}  ·  Receipt totals grouped by Schedule C line`, t: "s", s: subheaderStyle };
    wsSchC["A3"] = { v: "Line assignments are guidance based on category. Confirm each placement with your tax professional.", t: "s", s: bylineStyle };

    // Table headers at row 5
    const SCH_HDR_ROW = 5;
    wsSchC["A" + SCH_HDR_ROW] = { v: "Schedule C Line",             t: "s", s: tableHeaderStyle };
    wsSchC["B" + SCH_HDR_ROW] = { v: "Category",                    t: "s", s: tableHeaderStyle };
    wsSchC["C" + SCH_HDR_ROW] = { v: "Amount",                      t: "s", s: tableHeaderRightStyle };
    wsSchC["D" + SCH_HDR_ROW] = { v: "Source",                      t: "s", s: tableHeaderStyle };
    wsSchC["E" + SCH_HDR_ROW] = { v: "Notes",                       t: "s", s: tableHeaderStyle };

    // Build the data block: for each line, list the contributing categories
    // with subtotals. Each line gets a subtotal row at the bottom.
    let schRow = SCH_HDR_ROW + 1;
    let schZebra = 0;
    sortedLines.forEach(([line, group]) => {
      group.categories.forEach(({ category, amount, receipts: itemReceipts }) => {
        const isOdd = schZebra % 2 === 1;
        const merchantList = (itemReceipts || [])
          .map(r => r.merchant)
          .filter(Boolean);
        // Source = compact list of merchants for this bucket (truncated)
        const uniqueMerchants = [...new Set(merchantList)];
        const sourceText = uniqueMerchants.length === 0
          ? ""
          : uniqueMerchants.length <= 3
            ? uniqueMerchants.join(", ")
            : `${uniqueMerchants.slice(0, 3).join(", ")} + ${uniqueMerchants.length - 3} more`;
        // Notes: for tagged buckets, use the tag's hint; otherwise use the
        // category definition. This makes the routing decision visible.
        const taggedReceipt = (itemReceipts || []).find(r => r.tag);
        const noteText = taggedReceipt
          ? (TAG_META[taggedReceipt.tag]?.hint || "")
          : (CATEGORY_DEFINITIONS[(itemReceipts && itemReceipts[0]?.category) || ""] || "");
        wsSchC["A" + schRow] = { v: line,       t: "s", s: isOdd ? dataRowOddStyle : dataRowEvenStyle };
        wsSchC["B" + schRow] = { v: category,   t: "s", s: isOdd ? dataRowOddStyle : dataRowEvenStyle };
        wsSchC["C" + schRow] = { v: amount,     t: "n", z: "$#,##0.00", s: isOdd ? dataAmountOddStyle : dataAmountEvenStyle };
        wsSchC["D" + schRow] = { v: sourceText, t: "s", s: isOdd ? dataRowOddStyle : dataRowEvenStyle };
        wsSchC["E" + schRow] = { v: noteText,   t: "s", s: isOdd ? dataRowOddStyle : dataRowEvenStyle };
        schRow++;
        schZebra++;
      });
      // Line subtotal row
      wsSchC["A" + schRow] = { v: line + " — subtotal", t: "s", s: lineSubtotalLabelStyle };
      wsSchC["B" + schRow] = { v: "", t: "s", s: lineSubtotalLabelStyle };
      wsSchC["C" + schRow] = { v: group.total, t: "n", z: "$#,##0.00", s: lineSubtotalAmountStyle };
      wsSchC["D" + schRow] = { v: "", t: "s", s: lineSubtotalLabelStyle };
      wsSchC["E" + schRow] = { v: "", t: "s", s: lineSubtotalLabelStyle };
      schRow++;
      schZebra = 0; // reset zebra after each subtotal
    });

    // Grand total row
    const schTotalRow = schRow + 1;
    wsSchC["A" + schTotalRow] = { v: "TOTAL BUSINESS EXPENSES", t: "s", s: totalLabelStyle };
    wsSchC["B" + schTotalRow] = { v: "", t: "s", s: totalLabelStyle };
    wsSchC["C" + schTotalRow] = { v: grandTotal, t: "n", z: "$#,##0.00", s: totalAmountStyle };
    wsSchC["D" + schTotalRow] = { v: "", t: "s", s: totalLabelStyle };
    wsSchC["E" + schTotalRow] = { v: "", t: "s", s: totalLabelStyle };

    // Disclaimer
    const schDiscRow = schTotalRow + 2;
    wsSchC["A" + schDiscRow] = {
      v: "For organization purposes only · Always verify Schedule C placements with your tax professional before filing",
      t: "s",
      s: disclaimerStyle,
    };
    wsSchC["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 4 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 4 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 4 } },
      { s: { r: schDiscRow - 1, c: 0 }, e: { r: schDiscRow - 1, c: 4 } },
    ];
    wsSchC["!ref"]  = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: 4, r: schDiscRow - 1 } });
    wsSchC["!cols"] = [{ wch: 26 }, { wch: 26 }, { wch: 16 }, { wch: 32 }, { wch: 50 }];
    wsSchC["!freeze"] = { ySplit: SCH_HDR_ROW };
    wsSchC["!autofilter"] = { ref: `A${SCH_HDR_ROW}:E${SCH_HDR_ROW}` };
    const schRowHeights = [];
    schRowHeights[0] = { hpt: 28 };
    schRowHeights[1] = { hpt: 18 };
    schRowHeights[2] = { hpt: 16 };
    schRowHeights[SCH_HDR_ROW - 1] = { hpt: 26 };
    schRowHeights[schTotalRow - 1] = { hpt: 26 };
    schRowHeights[schDiscRow - 1] = { hpt: 28 };
    wsSchC["!rows"] = schRowHeights;

    // ──────────────────────────────────────────────────────────────────────
    // SHEET 3 — BUSINESS EXPENSES BY CATEGORY
    // Receipt-level detail, grouped by category, each row tagged with its
    // mapped Schedule C line. This is the "show me every receipt and where
    // it goes" view.
    // ──────────────────────────────────────────────────────────────────────
    const wsBiz = {};
    wsBiz["A1"] = { v: "Business Expenses — by Category", t: "s", s: titleStyle };
    wsBiz["A2"] = { v: `Tax Year ${TAX_YEAR}  ·  Receipt-level detail with Schedule C line tags`, t: "s", s: subheaderStyle };
    wsBiz["A3"] = { v: "Each row carries the Schedule C line its category typically maps to. Verify before filing.", t: "s", s: bylineStyle };

    const BIZ_HDR_ROW = 5;
    wsBiz["A" + BIZ_HDR_ROW] = { v: "Date",            t: "s", s: tableHeaderStyle };
    wsBiz["B" + BIZ_HDR_ROW] = { v: "Merchant",        t: "s", s: tableHeaderStyle };
    wsBiz["C" + BIZ_HDR_ROW] = { v: "Amount",          t: "s", s: tableHeaderRightStyle };
    wsBiz["D" + BIZ_HDR_ROW] = { v: "Business %",      t: "s", s: tableHeaderRightStyle };
    wsBiz["E" + BIZ_HDR_ROW] = { v: "Business Amount", t: "s", s: tableHeaderRightStyle };
    wsBiz["F" + BIZ_HDR_ROW] = { v: "Schedule C Line", t: "s", s: tableHeaderStyle };
    wsBiz["G" + BIZ_HDR_ROW] = { v: "Notes",           t: "s", s: tableHeaderStyle };

    let bizRow = BIZ_HDR_ROW + 1;
    sortedCats.forEach(([cat, catTotal]) => {
      const ref = SCHEDULE_C_REFERENCE[cat] || "Varies — review before filing";
      // Category subheader row
      wsBiz["A" + bizRow] = { v: cat + "  (default: " + ref + ")", t: "s", s: lineSubtotalLabelStyle };
      ["B","C","D","E","F","G"].forEach(c => {
        wsBiz[c + bizRow] = { v: "", t: "s", s: lineSubtotalLabelStyle };
      });
      bizRow++;
      // Receipts within this category
      let zebra = 0;
      (catReceipts[cat] || []).forEach(r => {
        const isOdd = zebra % 2 === 1;
        const amt = parseFloat(r.amount) || 0;
        const pct = (r.businessPct || 100) / 100;
        const bizAmt = amt * pct;
        // Tag-aware Schedule C placement: tag wins over category default.
        const tagMeta = r.tag && TAG_META[r.tag];
        const effectiveLine = tagMeta ? tagMeta.schCLine : ref;
        const noteSuffix = tagMeta ? `  [tagged: ${tagMeta.label.toLowerCase()}]` : "";
        const noteValue = (r.notes || "") + noteSuffix;
        wsBiz["A" + bizRow] = { v: r.date || "",   t: "s", s: isOdd ? dataRowOddStyle : dataRowEvenStyle };
        wsBiz["B" + bizRow] = { v: r.merchant || "", t: "s", s: isOdd ? dataRowOddStyle : dataRowEvenStyle };
        wsBiz["C" + bizRow] = { v: amt,    t: "n", z: "$#,##0.00", s: isOdd ? dataAmountOddStyle : dataAmountEvenStyle };
        wsBiz["D" + bizRow] = { v: pct,    t: "n", z: "0%",        s: isOdd ? dataAmountOddStyle : dataAmountEvenStyle };
        wsBiz["E" + bizRow] = { v: bizAmt, t: "n", z: "$#,##0.00", s: isOdd ? dataAmountOddStyle : dataAmountEvenStyle };
        wsBiz["F" + bizRow] = { v: effectiveLine, t: "s", s: isOdd ? dataRowOddStyle : dataRowEvenStyle };
        wsBiz["G" + bizRow] = { v: noteValue, t: "s", s: isOdd ? dataRowOddStyle : dataRowEvenStyle };
        bizRow++;
        zebra++;
      });
      // Category subtotal
      wsBiz["A" + bizRow] = { v: cat + " — subtotal", t: "s", s: lineSubtotalLabelStyle };
      ["B","C","D","F","G"].forEach(c => {
        wsBiz[c + bizRow] = { v: "", t: "s", s: lineSubtotalLabelStyle };
      });
      wsBiz["E" + bizRow] = { v: catTotal, t: "n", z: "$#,##0.00", s: lineSubtotalAmountStyle };
      bizRow++;
    });

    // Grand total
    const bizTotalRow = bizRow + 1;
    wsBiz["A" + bizTotalRow] = { v: "TOTAL BUSINESS EXPENSES", t: "s", s: totalLabelStyle };
    ["B","C","D","F","G"].forEach(c => {
      wsBiz[c + bizTotalRow] = { v: "", t: "s", s: totalLabelStyle };
    });
    wsBiz["E" + bizTotalRow] = { v: grandTotal, t: "n", z: "$#,##0.00", s: totalAmountStyle };

    const bizDiscRow = bizTotalRow + 2;
    wsBiz["A" + bizDiscRow] = {
      v: "For organization purposes only · Schedule C line assignments are guidance — confirm with your tax professional",
      t: "s",
      s: disclaimerStyle,
    };
    wsBiz["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } },
      { s: { r: bizDiscRow - 1, c: 0 }, e: { r: bizDiscRow - 1, c: 6 } },
    ];
    wsBiz["!ref"]  = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: 6, r: bizDiscRow - 1 } });
    wsBiz["!cols"] = [
      { wch: 14 }, // Date
      { wch: 28 }, // Merchant
      { wch: 14 }, // Amount
      { wch: 11 }, // Business %
      { wch: 16 }, // Business Amount
      { wch: 26 }, // Schedule C Line
      { wch: 32 }, // Notes
    ];
    wsBiz["!freeze"] = { ySplit: BIZ_HDR_ROW };
    wsBiz["!autofilter"] = { ref: `A${BIZ_HDR_ROW}:G${BIZ_HDR_ROW}` };
    const bizRowHeights = [];
    bizRowHeights[0] = { hpt: 28 };
    bizRowHeights[1] = { hpt: 18 };
    bizRowHeights[2] = { hpt: 16 };
    bizRowHeights[BIZ_HDR_ROW - 1] = { hpt: 22 };
    bizRowHeights[bizTotalRow - 1] = { hpt: 26 };
    bizRowHeights[bizDiscRow - 1] = { hpt: 28 };
    wsBiz["!rows"] = bizRowHeights;

    // ──────────────────────────────────────────────────────────────────────
    // SHEET 4 — SCHEDULE D PREVIEW (sample / preview only)
    // Demonstrates the structure for capital gains / investment activity.
    // Sample rows are illustrative; no real tax calculations are performed.
    // ──────────────────────────────────────────────────────────────────────
    const wsSchD = {};
    // Use entered manual data when available, sample rows otherwise
    const schdHasUserData = schedDItems.length > 0;
    wsSchD["A1"] = { v: "Schedule D Preview", t: "s", s: titleStyle };
    wsSchD["A2"] = {
      v: schdHasUserData
        ? `Tax Year ${TAX_YEAR}  ·  Capital gains, losses, and investment activity`
        : `Tax Year ${TAX_YEAR}  ·  Example layout for capital gains, losses, and investment activity`,
      t: "s", s: subheaderStyle,
    };
    wsSchD["A3"] = {
      v: schdHasUserData
        ? "Manual entries — confirm with your tax professional before filing."
        : "Sample structure — no real investment data is calculated.",
      t: "s", s: bylineStyle,
    };

    const SCHD_HDR_ROW = 5;
    const schdHeaders = ["Description / Asset", "Date acquired", "Date sold", "Proceeds", "Cost basis", "Gain / Loss", "Term"];
    const schdHeaderCols = ["A", "B", "C", "D", "E", "F", "G"];
    schdHeaders.forEach((h, i) => {
      // Right-align the numeric column headers (Proceeds, Cost basis, Gain/Loss)
      const isNum = i === 3 || i === 4 || i === 5;
      wsSchD[schdHeaderCols[i] + SCHD_HDR_ROW] = { v: h, t: "s", s: isNum ? tableHeaderRightStyle : tableHeaderStyle };
    });

    const schdSampleRows = [
      ["Acme Corp common stock (50 sh)", "Mar 12, 2023", "Aug 4, 2025",  4250.00, 3100.00, 1150.00, "Long-term · Part II"],
      ["Index ETF (VTI, 10 sh)",          "Jun 5, 2024",  "Nov 18, 2025", 2480.00, 2310.00,  170.00, "Long-term · Part II"],
      ["Bitcoin (0.05 BTC)",              "Jan 22, 2024", "Sep 30, 2025", 3120.00, 2050.00, 1070.00, "Long-term · Part II"],
    ];
    // Source rows: real entries if any, sample rows otherwise.
    // Term column for real entries reads "Long-term · Part II" / "Short-term · Part I"
    // so tax-professional handoff includes the IRS routing context inline.
    const schdRowsToRender = schdHasUserData
      ? schedDItems.map(it => {
          const proceeds = parseFloat(it.proceeds) || 0;
          const basis    = parseFloat(it.costBasis) || 0;
          const gain     = proceeds - basis;
          const term     = computeSchedDTerm(it.dateAcquired, it.dateSold);
          const ref      = SCHEDULE_D_REFERENCE[term];
          const termCell = term ? (ref ? `${term} · ${ref.part}` : term) : "—";
          return [it.asset, it.dateAcquired, it.dateSold, proceeds, basis, gain, termCell];
        })
      : schdSampleRows;
    schdRowsToRender.forEach((row, rIdx) => {
      const r = SCHD_HDR_ROW + 1 + rIdx;
      const isOdd = rIdx % 2 === 1;
      const textStyle  = isOdd ? dataRowOddStyle    : dataRowEvenStyle;
      const numStyle   = isOdd ? dataAmountOddStyle : dataAmountEvenStyle;
      // Description (A) + dates (B, C) — text style, left aligned
      wsSchD["A" + r] = { v: row[0], t: "s", s: textStyle };
      wsSchD["B" + r] = { v: row[1], t: "s", s: textStyle };
      wsSchD["C" + r] = { v: row[2], t: "s", s: textStyle };
      // Numeric (D, E, F) — number type with currency formatting via style
      wsSchD["D" + r] = { v: row[3], t: "n", z: "$#,##0.00", s: numStyle };
      wsSchD["E" + r] = { v: row[4], t: "n", z: "$#,##0.00", s: numStyle };
      wsSchD["F" + r] = { v: row[5], t: "n", z: "$#,##0.00", s: numStyle };
      // Term (G) — text style, left aligned
      wsSchD["G" + r] = { v: row[6], t: "s", s: textStyle };
    });

    // Footer note (2 rows below last row)
    const schdFooterRow = SCHD_HDR_ROW + 1 + schdRowsToRender.length + 1;
    wsSchD["A" + schdFooterRow] = {
      v: schdHasUserData
        ? "Manual entries · Term inferred from acquisition and sale dates · Confirm all values with your tax professional before filing."
        : "Preview structure only — real Schedule D values require imported or entered investment data.",
      t: "s", s: disclaimerStyle,
    };

    wsSchD["!ref"] = "A1:G" + schdFooterRow;
    wsSchD["!cols"] = [
      { wch: 32 }, // A: description
      { wch: 14 }, // B: acquired
      { wch: 14 }, // C: sold
      { wch: 13 }, // D: proceeds
      { wch: 13 }, // E: cost basis
      { wch: 13 }, // F: gain/loss
      { wch: 13 }, // G: term
    ];
    wsSchD["!rows"] = [
      { hpt: 32 }, // 1: title
      { hpt: 18 }, // 2: subheader
      { hpt: 16 }, // 3: byline
      { hpt: 8 },  // 4: spacer
      { hpt: 22 }, // 5: header
    ];
    // Merge title across all columns
    wsSchD["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 6 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 6 } },
      { s: { r: schdFooterRow - 1, c: 0 }, e: { r: schdFooterRow - 1, c: 6 } },
    ];
    // Freeze title + headers
    wsSchD["!freeze"] = { ySplit: 5 };

    // ──────────────────────────────────────────────────────────────────────
    // SHEET 5 — SCHEDULE 1 PREVIEW (sample / preview only)
    // Demonstrates the structure for adjustments and additional income items
    // that don't appear in the Schedule C expense flow. Sample rows only.
    // ──────────────────────────────────────────────────────────────────────
    const wsSch1 = {};
    const sch1HasUserData = sched1Items.length > 0;
    wsSch1["A1"] = { v: "Schedule 1 Preview", t: "s", s: titleStyle };
    wsSch1["A2"] = {
      v: sch1HasUserData
        ? `Tax Year ${TAX_YEAR}  ·  Adjustments and additional income items`
        : `Tax Year ${TAX_YEAR}  ·  Example layout for adjustments and additional income items`,
      t: "s", s: subheaderStyle,
    };
    wsSch1["A3"] = {
      v: sch1HasUserData
        ? "Manual entries — confirm with your tax professional before filing."
        : "Sample structure — no real adjustments are calculated.",
      t: "s", s: bylineStyle,
    };

    const SCH1_HDR_ROW = 5;
    wsSch1["A" + SCH1_HDR_ROW] = { v: "Item",              t: "s", s: tableHeaderStyle };
    wsSch1["B" + SCH1_HDR_ROW] = { v: "Category / Section", t: "s", s: tableHeaderStyle };
    wsSch1["C" + SCH1_HDR_ROW] = { v: "Amount",             t: "s", s: tableHeaderRightStyle };
    wsSch1["D" + SCH1_HDR_ROW] = { v: "Notes",              t: "s", s: tableHeaderStyle };

    const sch1SampleRows = [
      ["Self-employed health insurance",  "Adjustment · Line 17",       6800.00, "Annual premium for self-only coverage"],
      ["Traditional IRA contribution",    "Adjustment · Line 20",       6500.00, "Within annual contribution limit"],
      ["Student loan interest",           "Adjustment · Line 21",        720.00, "Subject to phase-out by income"],
      ["1099-INT interest income",        "Additional income · Line 8z", 148.00, "Interest from savings account"],
      ["Hobby income",                    "Additional income · Line 8j", 340.00, "Occasional craft sales (non-business)"],
    ];
    // Build the Section column for real entries by combining the part-level
    // section ("Adjustment" / "Additional income") with the IRS line number
    // from SCHEDULE_1_REFERENCE. This gives tax professionals direct routing
    // context — they know exactly which line each item should land on.
    const sch1RowsToRender = sch1HasUserData
      ? sched1Items.map(it => {
          const ref = getSched1Reference(it.itemType);
          const sectionLabel = ref.line && ref.line !== "—"
            ? `${ref.section} · ${ref.line}`
            : ref.section;
          return [it.itemType, sectionLabel, parseFloat(it.amount) || 0, it.notes || ""];
        })
      : sch1SampleRows;
    sch1RowsToRender.forEach((row, rIdx) => {
      const r = SCH1_HDR_ROW + 1 + rIdx;
      const isOdd = rIdx % 2 === 1;
      const textStyle = isOdd ? dataRowOddStyle    : dataRowEvenStyle;
      const numStyle  = isOdd ? dataAmountOddStyle : dataAmountEvenStyle;
      wsSch1["A" + r] = { v: row[0], t: "s", s: textStyle };
      wsSch1["B" + r] = { v: row[1], t: "s", s: textStyle };
      wsSch1["C" + r] = { v: row[2], t: "n", z: "$#,##0.00", s: numStyle };
      wsSch1["D" + r] = { v: row[3], t: "s", s: textStyle };
    });

    const sch1FooterRow = SCH1_HDR_ROW + 1 + sch1RowsToRender.length + 1;
    wsSch1["A" + sch1FooterRow] = {
      v: sch1HasUserData
        ? "Manual entries · Confirm all values and section placements with your tax professional before filing."
        : "Preview structure only — real Schedule 1 values require user-entered or imported tax data.",
      t: "s", s: disclaimerStyle,
    };

    wsSch1["!ref"] = "A1:D" + sch1FooterRow;
    wsSch1["!cols"] = [
      { wch: 36 }, // A: item
      { wch: 22 }, // B: category/section
      { wch: 13 }, // C: amount
      { wch: 44 }, // D: notes
    ];
    wsSch1["!rows"] = [
      { hpt: 32 }, // 1: title
      { hpt: 18 }, // 2: subheader
      { hpt: 16 }, // 3: byline
      { hpt: 8 },  // 4: spacer
      { hpt: 22 }, // 5: header
    ];
    wsSch1["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 3 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 3 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 3 } },
      { s: { r: sch1FooterRow - 1, c: 0 }, e: { r: sch1FooterRow - 1, c: 3 } },
    ];
    wsSch1["!freeze"] = { ySplit: 5 };

    // ──────────────────────────────────────────────────────────────────────
    // SHEET 6 — REVIEW & FLAGS
    // Issues / actions surfaced from computeInsights() output, presented
    // as a structured table (Issue / Explanation / Action) instead of the
    // prose paragraphs the previous Summary sheet used. Easier to scan,
    // easier for a preparer to triage.
    // ──────────────────────────────────────────────────────────────────────
    const wsReview = {};
    wsReview["A1"] = { v: "Review & Flags", t: "s", s: titleStyle };
    wsReview["A2"] = { v: `Tax Year ${TAX_YEAR}  ·  Items worth confirming before filing`, t: "s", s: subheaderStyle };
    wsReview["A3"] = { v: "Auto-generated from receipt data. None of these are errors — they are checks to confirm.", t: "s", s: bylineStyle };

    const REV_HDR_ROW = 5;
    wsReview["A" + REV_HDR_ROW] = { v: "Issue",       t: "s", s: tableHeaderStyle };
    wsReview["B" + REV_HDR_ROW] = { v: "Explanation", t: "s", s: tableHeaderStyle };
    wsReview["C" + REV_HDR_ROW] = { v: "Action",      t: "s", s: tableHeaderStyle };

    // Issue title for each insight id (short headline). Action is derived
    // from the last sentence of the insight line where possible, or a
    // generic "Confirm before filing" fallback.
    const ISSUE_TITLES = {
      mileage_gap:              "Possible missing mileage deduction",
      home_office_with_signal:  "Home office may be deductible",
      health_insurance_missing: "Self-employed health insurance not seen",
      meals_high_dollar:        "High-dollar meals to verify",
      meals_high_ratio:         "Meals are a large share of spend",
      meals_50pct:              "Confirm meals deducted at 50%",
      mixed_use_100pct:         "Mixed-use category at 100% — confirm",
      duplicate_entries:        "Possible duplicate entries",
      rounded_numbers:          "Rounded amounts — confirm precision",
      subscription_velocity:    "Recurring subscriptions to verify",
      home_office_missing:      "Home office not yet captured",
      category_dominance:       "One category dominates total spend",
      small_accumulation:       "Many small entries to spot-check",
      date_gaps:                "Date gaps in receipt timeline",
    };
    const extractAction = (line) => {
      if (!line) return "Confirm before filing.";
      // Take the last sentence as the action
      const sentences = line.split(/(?<=[.!?])\s+/).filter(Boolean);
      return sentences[sentences.length - 1] || "Confirm before filing.";
    };

    let revRow = REV_HDR_ROW + 1;
    if (insightsForReview.length === 0) {
      // No flags case — still render an empty-state row so the sheet isn't blank
      wsReview["A" + revRow] = { v: "No flags raised", t: "s", s: flagIssueStyle };
      wsReview["B" + revRow] = { v: "No issues were detected in the receipts you logged. This does not mean the return is complete — confirm all categories and totals with your tax professional.", t: "s", s: flagBodyStyle };
      wsReview["C" + revRow] = { v: "This workbook is ready to take to your tax professional.", t: "s", s: flagBodyStyle };
      revRow++;
    } else {
      insightsForReview.forEach((ins) => {
        const title  = ISSUE_TITLES[ins.id] || "Item to review";
        const action = extractAction(ins.line);
        // Explanation = full insight line minus the action (last sentence),
        // so the two columns don't repeat. If only one sentence exists,
        // show it as the explanation and keep action generic.
        const sentences = (ins.line || "").split(/(?<=[.!?])\s+/).filter(Boolean);
        const explanation = sentences.length > 1
          ? sentences.slice(0, -1).join(" ")
          : (ins.line || "");
        const actionText = sentences.length > 1
          ? action
          : "Confirm before filing.";
        wsReview["A" + revRow] = { v: title,       t: "s", s: flagIssueStyle };
        wsReview["B" + revRow] = { v: explanation, t: "s", s: flagBodyStyle };
        wsReview["C" + revRow] = { v: actionText,  t: "s", s: flagBodyStyle };
        revRow++;
      });
    }

    const revDiscRow = revRow + 1;
    wsReview["A" + revDiscRow] = {
      v: "Flags are auto-generated heuristics, not errors. None of them require action without preparer review.",
      t: "s",
      s: disclaimerStyle,
    };
    wsReview["!merges"] = [
      { s: { r: 0, c: 0 }, e: { r: 0, c: 2 } },
      { s: { r: 1, c: 0 }, e: { r: 1, c: 2 } },
      { s: { r: 2, c: 0 }, e: { r: 2, c: 2 } },
      { s: { r: revDiscRow - 1, c: 0 }, e: { r: revDiscRow - 1, c: 2 } },
    ];
    wsReview["!ref"]  = XLSX.utils.encode_range({ s: { c: 0, r: 0 }, e: { c: 2, r: revDiscRow - 1 } });
    wsReview["!cols"] = [{ wch: 36 }, { wch: 60 }, { wch: 40 }];
    wsReview["!freeze"] = { ySplit: REV_HDR_ROW };
    const revRowHeights = [];
    revRowHeights[0] = { hpt: 28 };
    revRowHeights[1] = { hpt: 18 };
    revRowHeights[2] = { hpt: 16 };
    revRowHeights[REV_HDR_ROW - 1] = { hpt: 22 };
    // Each flag row gets variable height based on text length
    const flagRowsCount = insightsForReview.length || 1;
    for (let i = 0; i < flagRowsCount; i++) {
      const ins = insightsForReview[i];
      const len = (ins?.line || "").length;
      const extra = Math.max(0, Math.ceil(len / 80) - 1);
      revRowHeights[REV_HDR_ROW + i] = { hpt: 44 + extra * 14 };
    }
    revRowHeights[revDiscRow - 1] = { hpt: 28 };
    wsReview["!rows"] = revRowHeights;

    // ── Build disclaimer / README sheet ──────────────────────
    // Build README using a structured cell-by-cell layout (matches the design
    // tier of Master Summary). 2-column grid: col A holds title/section labels
    // and the "Sheet" column of the navigator; col B holds nav-table descriptions
    // and is merged with col A for body-paragraph rows.
    const disclaimerSheet = {};

    // Row 1: title band (merged A1:B1)
    disclaimerSheet["A1"] = { v: "PreFile Organizer — Filing-Ready Summary", t: "s", s: titleStyle };
    disclaimerSheet["B1"] = { v: "", t: "s", s: titleStyle };

    // Row 2: subheader (merged A2:B2)
    disclaimerSheet["A2"] = { v: `Tax Year ${TAX_YEAR}  ·  Workbook guide`, t: "s", s: subheaderStyle };
    disclaimerSheet["B2"] = { v: "", t: "s", s: subheaderStyle };

    // Row 3: byline (merged A3:B3)
    disclaimerSheet["A3"] = { v: "What this workbook is for and how it's organized.", t: "s", s: bylineStyle };
    disclaimerSheet["B3"] = { v: "", t: "s", s: bylineStyle };

    // Row 5: section label "What's inside"
    disclaimerSheet["A5"] = { v: "What's inside", t: "s", s: sectionLabelStyle };
    disclaimerSheet["B5"] = { v: "", t: "s", s: sectionLabelStyle };

    // Row 6: navigator table headers
    disclaimerSheet["A6"] = { v: "Sheet",         t: "s", s: tableHeaderStyle };
    disclaimerSheet["B6"] = { v: "What it shows", t: "s", s: tableHeaderStyle };

    // Rows 7-10: navigator table body (zebra-striped)
    const readmeNavRows = [
      ["Master Summary",            "Top totals, top categories, sheet navigator"],
      ["Schedule C Expenses",       "Receipt totals grouped by IRS Schedule C line"],
      ["Business Expenses",         "Every receipt, with its Schedule C line tag"],
      ["Review & Flags",            "Items worth confirming before filing"],
    ];
    readmeNavRows.forEach((row, idx) => {
      const r = 7 + idx;
      const isOdd = idx % 2 === 1;
      const bodyStyle = isOdd ? dataRowOddStyle : dataRowEvenStyle;
      disclaimerSheet["A" + r] = { v: row[0], t: "s", s: bodyStyle };
      disclaimerSheet["B" + r] = { v: row[1], t: "s", s: bodyStyle };
    });

    // Row 12: section label "About this workbook"
    disclaimerSheet["A12"] = { v: "About this workbook", t: "s", s: sectionLabelStyle };
    disclaimerSheet["B12"] = { v: "", t: "s", s: sectionLabelStyle };

    // Row 13: body paragraph (merged A13:B13)
    const aboutBodyStyle = {
      font:      { color: { rgb: "FF1A1A18" }, name: "Calibri", sz: 11 },
      alignment: { horizontal: "left", vertical: "top", wrapText: true },
    };
    disclaimerSheet["A13"] = {
      v: "This workbook is a filing-ready summary of your business expenses, prepared for your tax professional. It is not a completed tax return — your tax professional finalizes and files it.",
      t: "s",
      s: aboutBodyStyle,
    };
    disclaimerSheet["B13"] = { v: "", t: "s", s: aboutBodyStyle };

    // Row 15: section label "Schedule C line caveats"
    disclaimerSheet["A15"] = { v: "Schedule C line caveats", t: "s", s: sectionLabelStyle };
    disclaimerSheet["B15"] = { v: "", t: "s", s: sectionLabelStyle };

    // Row 16: caveat paragraph (merged A16:B16)
    disclaimerSheet["A16"] = {
      v: "Schedule C line assignments are guidance based on your category selections. Some categories (e.g. equipment, contractor work) may belong on a different line depending on use. A small number of receipts may also be auto-tagged based on merchant patterns (wholesale suppliers → inventory, customs → import duties, etc.) and routed to a different Schedule C line than the user-facing category would suggest. Confirm each placement with your tax professional.",
      t: "s",
      s: aboutBodyStyle,
    };
    disclaimerSheet["B16"] = { v: "", t: "s", s: aboutBodyStyle };

    // Row 18: footer disclaimer (merged A18:B18) — uses bordered disclaimerStyle
    disclaimerSheet["A18"] = {
      v: "PreFile does not provide tax, legal, or financial advice. You are responsible for reviewing all entries and confirming the return with a qualified tax professional before filing.",
      t: "s",
      s: disclaimerStyle,
    };
    disclaimerSheet["B18"] = { v: "", t: "s", s: disclaimerStyle };

    // Sheet bounds — must explicitly set !ref for cell-by-cell built sheets
    disclaimerSheet["!ref"] = "A1:B18";

    // Column widths: col A holds sheet names + section labels (28), col B holds descriptions (82)
    disclaimerSheet["!cols"] = [{ wch: 28 }, { wch: 82 }];

    // Row heights — title 32, subheader/byline 18/16, section labels 22, body paragraphs taller for wrapping
    disclaimerSheet["!rows"] = [
      { hpt: 32 }, // 1: title band
      { hpt: 18 }, // 2: subheader
      { hpt: 16 }, // 3: byline
      { hpt: 8 },  // 4: spacer
      { hpt: 22 }, // 5: section label "What's inside"
      { hpt: 22 }, // 6: nav table header
      { hpt: 18 }, // 7: nav row 1
      { hpt: 18 }, // 8: nav row 2
      { hpt: 18 }, // 9: nav row 3
      { hpt: 18 }, // 10: nav row 4
      { hpt: 8 },  // 11: spacer
      { hpt: 22 }, // 12: section label "About"
      { hpt: 36 }, // 13: about body paragraph
      { hpt: 8 },  // 14: spacer
      { hpt: 22 }, // 15: section label "Caveats"
      { hpt: 56 }, // 16: caveat paragraph (longest)
      { hpt: 12 }, // 17: spacer
      { hpt: 36 }, // 18: footer disclaimer
    ];

    // Merges: span title/subheader/byline/section labels/body paragraphs across both columns
    disclaimerSheet["!merges"] = [
      { s: { r: 0,  c: 0 }, e: { r: 0,  c: 1 } }, // title
      { s: { r: 1,  c: 0 }, e: { r: 1,  c: 1 } }, // subheader
      { s: { r: 2,  c: 0 }, e: { r: 2,  c: 1 } }, // byline
      { s: { r: 4,  c: 0 }, e: { r: 4,  c: 1 } }, // "What's inside" label
      { s: { r: 11, c: 0 }, e: { r: 11, c: 1 } }, // "About this workbook" label
      { s: { r: 12, c: 0 }, e: { r: 12, c: 1 } }, // about body
      { s: { r: 14, c: 0 }, e: { r: 14, c: 1 } }, // "Schedule C line caveats" label
      { s: { r: 15, c: 0 }, e: { r: 15, c: 1 } }, // caveat body
      { s: { r: 17, c: 0 }, e: { r: 17, c: 1 } }, // footer disclaimer
    ];

    // ── Build & download workbook ────────────────────────────
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, disclaimerSheet, "README");
    XLSX.utils.book_append_sheet(wb, wsMaster,        "Master Summary");
    XLSX.utils.book_append_sheet(wb, wsSchC,          "Schedule C Expenses");
    XLSX.utils.book_append_sheet(wb, wsBiz,           "Business Expenses");
    XLSX.utils.book_append_sheet(wb, wsSchD,          "Schedule D Preview");
    XLSX.utils.book_append_sheet(wb, wsSch1,          "Schedule 1 Preview");
    XLSX.utils.book_append_sheet(wb, wsReview,        "Review & Flags");
    XLSX.writeFile(wb, `PreFile_Organizer_${TAX_YEAR}.xlsx`);
    logEvent("EXPORT_COMPLETED", { count: receipts.length, userType: getUserType(receipts) });
    showToast("Color-coded organizer downloaded ✓");
    // Brief delay so the 'Your filing-ready summary is ready' callout has time to be
    // read before the 'Downloaded ✓' callout takes over. The file itself is
    // already downloading by this point — only the visual confirmation lags.
    setTimeout(() => setShowDownloadMsg(true), 800);
    // Revert to default button label after the success state has had time to be
    // seen. Button was already mechanically re-clickable (disabled only checks
    // isDownloading) — this restores "Download…" label so re-download is visible.
    setTimeout(() => setShowDownloadMsg(false), 4000);
    } catch (e) {
      console.error(e);
      showToast("Something went wrong — please try downloading again.");
      isExportingRef.current = false;
      return;
    } finally {
      // Debounce window: prevent rapid re-fires for 1.5s after a successful run.
      // (On error path, the catch already reset the ref immediately so the
      // user can retry; this timer is then a harmless no-op.)
      setTimeout(() => { isExportingRef.current = false; }, 1500);
    }
  };

  const handleUnlock = () => {
    if (isSaved) return;
    setIsSaved(true);
    setShowPaywall(false);
    setShowSavedConfirm(true);
    setTimeout(() => setShowSavedConfirm(false), 2500);
    setTimeout(() => {
      showToast("Your filing-ready summary is ready to download.");
    }, 600);
    setTimeout(() => {
      showToast("Saved to your device.");
    }, 3500);
  };

  const handlePaywallDismiss = () => {
    const userType = getUserType(receipts);
    logEvent("PAYWALL_DISMISSED", { count: receipts.length, userType });
    const reason = prompt(
      "Quick question — what made you not download right now?\n\nYou can just type a number or a few words:\n\n1. Too expensive\n2. Not needed\n3. Just testing\n4. Something unclear\n\nOr tell me in your own words:"
    );
    logEvent("PAYWALL_REASON", { reason: reason?.trim() || "dismissed_no_response", userType });
    setShowPaywall(false);
  };

  // ── Year-End Summary handlers ──
  const handleGenerateSummary = () => setPage("yearend");
  const handleSummaryBack     = () => setPage("organizer");
  const handleSummaryPrint    = () => window.print();

  // ── Check flow handlers ──
  const handleCheckStart   = () => { setPage("check"); setCheckStep("questions"); };
  const handleQuestionsEnd = a => { setCheckAnswers(a); setCheckStep("loading"); };
  const handleLoadingEnd   = () => setCheckStep("reveal");
  const handleRevealContinue = () => { setEntryOrigin("flow"); setPage("receipt-flow"); setReceiptStep("add"); };

  const renderCheckFlow = () => {
    switch (checkStep) {
      case "questions": return <CheckQuestions onDone={handleQuestionsEnd} />;
      case "loading":   return <CheckLoading onDone={handleLoadingEnd} />;
      case "reveal":    return <CheckReveal answers={checkAnswers} onContinue={handleRevealContinue} />;
      default:          return null;
    }
  };

  return (
    <>
      <style>{FONTS + GLOBAL_CSS + `
        .hide-on-mobile { display: block; }
        @media (max-width: 600px) {
          .hide-on-mobile { display: none; }
        }
      `}</style>

      <Nav
        onLogoClick={() => { setPage("home"); setReceiptStep("add"); setCheckStep("questions"); setShowPaywall(false); setEntryOrigin("flow"); }}
        receiptCount={receipts.length}
      />

      <main style={{ minHeight: "calc(100vh - 65px)", background: C.cream }}>
        {page === "home" && (
          <Homepage
            onStart={() => { setEntryOrigin("flow"); setReceiptStep("add"); setPage("receipt-flow"); }}
            onCheck={handleCheckStart}
          />
        )}
        {page === "receipt-flow" && renderReceiptFlow()}
        {page === "organizer" && (
          <OrganizerScreen receipts={receipts} onAddAnother={handleAddAnother} isSaved={isSaved} onExport={handleExport} showSavedConfirm={showSavedConfirm} onGenerateSummary={handleGenerateSummary} onClearData={handleClearData} onDeleteReceipt={handleDeleteReceipt} showDownloadMsg={showDownloadMsg} isDownloading={isDownloading} pendingRestore={pendingRestore} onRestore={handleRestore} onDiscardRestore={handleDiscardRestore} schedDItems={schedDItems} sched1Items={sched1Items} onOpenSchedD={() => { setEntryOrigin("organizer"); setPage("schedule-d"); }} onOpenSched1={() => { setEntryOrigin("organizer"); setPage("schedule-1"); }} />
        )}
        {page === "schedule-d" && (
          <SchedDScreen items={schedDItems} onAdd={handleAddSchedD} onDelete={handleDeleteSchedD} onBack={() => setPage(entryOrigin === "organizer" ? "organizer" : "receipt-flow")} pendingRestore={pendingSchedDRestore} onRestore={handleRestoreSchedD} onDiscardRestore={handleDiscardSchedDRestore} />
        )}
        {page === "schedule-1" && (
          <Sched1Screen items={sched1Items} onAdd={handleAddSched1} onDelete={handleDeleteSched1} onBack={() => setPage(entryOrigin === "organizer" ? "organizer" : "receipt-flow")} pendingRestore={pendingSched1Restore} onRestore={handleRestoreSched1} onDiscardRestore={handleDiscardSched1Restore} />
        )}
        {page === "check" && renderCheckFlow()}
        {page === "yearend" && (
          <YearEndSummary
            receipts={receipts}
            onBack={handleSummaryBack}
            onPrint={handleSummaryPrint}
          />
        )}
      </main>

      <Toast visible={toast.visible} message={toast.message} />

      {/* Unsaved banner — shows when user has receipts but not saved */}
      {receipts.length > 0 && !isSaved && page === "organizer" && (
        <div style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          background: C.ink, color: C.white,
          padding: "12px 20px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          zIndex: 900, flexWrap: "wrap", gap: 10,
          borderTop: `3px solid ${C.forest}`,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="zap" size={16} color="#FCD34D" strokeWidth={2} />
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              Your receipts are not saved yet
            </span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
              · They will be lost if you close this tab
            </span>
          </div>
          <button
            onClick={() => { logEvent("PAYWALL_VIEWED", { count: receipts.length, userType: getUserType(receipts) }); setShowPaywall(true); }}
            style={{
              background: C.forest, color: C.white, border: "none",
              borderRadius: 9, padding: "8px 16px", fontSize: 12,
              fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif",
              flexShrink: 0,
            }}
          >
            Save my receipts →
          </button>
        </div>
      )}

      {/* Paywall modal */}
      {showPaywall && (() => {
        // tier1 is already capped at 5, sorted by priority desc. The on-screen
        // teaser shows tier1[0]; the paywall pitches the remainder.
        const { tier1 } = computeInsights(receipts);
        const hiddenInsightsCount = Math.max(0, tier1.length - 1);
        return (
          <PaywallModal
            onUnlock={handleUnlock}
            onDismiss={handlePaywallDismiss}
            receiptCount={receipts.length}
            hiddenInsightsCount={hiddenInsightsCount}
            receipts={receipts}
          />
        );
      })()}
    </>
  );
}
