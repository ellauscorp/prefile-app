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
const SCHEDULE_C_REFERENCE = {
  "Advertising & marketing": "Schedule C Line 8",
  "Car & mileage":           "Varies — depends on use, review before filing",
  "Contractors & services":  "Varies — depends on use, review before filing",
  "Insurance":               "Schedule C Line 15",
  "Legal & professional":    "Varies — depends on use, review before filing",
  "Office expenses":         "Varies — depends on use, review before filing",
  "Rent / workspace":        "Schedule C Line 20b",
  "Supplies":                "Schedule C Line 22",
  "Taxes & licenses":        "Varies — depends on use, review before filing",
  "Travel":                  "Schedule C Line 24a",
  "Business meals":          "Schedule C Line 24b",
  "Utilities":               "Schedule C Line 25",
  "Software & subscriptions":"Varies — depends on use, review before filing",
  "Equipment & tools":       "Varies — depends on use, review before filing",
  "Other":                   "Varies — depends on use, review before filing",
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
export const PREFILE_DISCLAIMER = "PreFile is an organizational tool designed to help you collect and structure financial information before filing taxes. It does not provide tax, legal, or financial advice, and does not determine the accuracy or tax treatment of any information. All data, categorizations, and outputs should be reviewed and confirmed by you and/or a qualified tax professional before being used for tax filing or reporting purposes.";

export const PREFILE_SHORT_DISCLAIMER = "For organization and review only — not tax advice. Confirm with a qualified tax professional.";

export const PREFILE_POSITIONING = "PreFile helps you organize your financial information before filing taxes — so you can review everything clearly and work more efficiently with your tax professional.";

export const PREFILE_USER_RESPONSIBILITY = "You are responsible for reviewing all entries and confirming their accuracy with a qualified tax professional before filing.";

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
        line: `${n} of your meal receipts ${verb} over $75. These typically require documented attendees and a business purpose — add these notes before filing, or they can be disallowed if reviewed.`,
      });
    } else {
      const overstateBy = mealsTotal * 0.5;
      const entryWord   = mealReceipts.length === 1 ? "entry" : "entries";
      insights.push({
        id: "meals_50pct", tier: 1, priority: 75, conversionScore: 78,
        line: `Your meals total $${mealsTotal.toFixed(0)} across ${mealReceipts.length} ${entryWord}. If these are filed at 100%, this could overstate your deductions by about $${overstateBy.toFixed(0)}, since meals are typically only 50% deductible. Check that the meals deduction is filed at 50%, not 100%.`,
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
      line: `You logged $${gasTotal.toFixed(0)} in gas and parking but no business mileage. The IRS standard mileage rate is $0.67/mile for 2025 — most freelancers who drive for work miss $1,500–$3,000 in deductible mileage. Add your mileage estimate before filing.`,
    });
  }

  // ── Health insurance missing (priority 90) — large-dollar gap ───────────
  const insuranceTotal = catTotals["Insurance"] || 0;
  if (insuranceTotal === 0 && grandBiz >= 5000) {
    insights.push({
      id: "health_insurance_missing", tier: 1, priority: 90, conversionScore: 130,
      line: `You have no health insurance recorded. Self-employed freelancers can deduct 100% of health insurance premiums on Schedule 1 — for typical coverage that's $4,800–$9,600 per year. If you pay for your own coverage, this is one of the largest single deductions you can claim. Add this entry before filing if it applies to you.`,
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
      line: `We detected ${subscriptions.length} ${subWord} in your data (${merchantList}). At your pace, these total $${annualizedTotal.toFixed(0)}/year — make sure you're claiming the full year, not just the months you logged.`,
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
      line: `You logged $${utilTotal.toFixed(0)} in utilities/internet but no home office expense. If you work from home, the simplified home office deduction is $5/sq ft up to 300 sq ft — up to $1,500/year. This is one of the most commonly missed deductions for freelancers. Add a home office entry before filing if you qualify.`,
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
      line: `You have duplicate entries on ${dupes[0].date}: ${dupes[0].merchant} for $${parseFloat(dupes[0].amount).toFixed(2)}, listed ${dupes.length} times. If this is a duplicate entry, remove it before filing — duplicates can inflate your deduction.`,
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
      line: `You marked ${mixedUse100.length} purchases from ${merchants} as 100% business. These are merchants where personal use can slip in — if any portion was personal, claiming 100% may not be allowed if reviewed. Review and adjust the business % where appropriate.`,
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
      line: `Several of your entries appear rounded (e.g., $100, $500). Estimated values may attract questions — consider reviewing these against actual receipts.`,
    });
  }

  // ── High meals ratio (priority 60) — meals > 30% of total ───────────────
  if (mealsTotal > 0) {
    const mealsPct = (mealsTotal / grandBiz) * 100;
    if (mealsPct > 30) {
      insights.push({
        id: "meals_high_ratio", tier: 1, priority: 60, conversionScore: 55,
        line: `Meals make up ${mealsPct.toFixed(0)}% of your expenses, which is unusually high and may attract questions if not well documented. Confirm each meal entry has a business purpose noted before filing.`,
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
          line: `Your receipts span ${monthName(first)}–${monthName(last)}, but we see a gap in ${gapLabel}. Either no business activity happened then — or receipts from those months aren't logged yet. Review your records for those months before filing — missing months can mean unclaimed deductions.`,
        });
      }
    }
  }

  // ── Category dominance (priority 45) — one category >= 40% ──────────────
  const topPct = (sorted[0][1] / grandBiz) * 100;
  if (topPct >= 40) {
    insights.push({
      id: "category_dominance", tier: 2, priority: 45, conversionScore: 60,
      line: `${sorted[0][0]} makes up ${topPct.toFixed(0)}% of your expenses — unusually high concentration in one category. Confirm accuracy before filing.`,
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
      line: `You have ${smallEntries.length} small expenses under $10 totaling $${smallTotal.toFixed(0)}. These add up — review that each is business-related, since high volumes of small entries can attract questions if reviewed.`,
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
                Tax year 2025 · Freelancers & side hustlers
              </span>
            </div>

            <h1 style={{
              fontFamily: "'Fraunces', serif",
              fontSize: "clamp(32px, 5vw, 52px)", fontWeight: 700, color: C.ink,
              lineHeight: 1.13, letterSpacing: "-0.8px", marginBottom: 18,
              opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(20px)",
              transition: "opacity 0.5s 0.07s, transform 0.5s 0.07s",
            }}>
              Turn scattered receipts into a{" "}
              <em style={{ color: C.forest, fontStyle: "italic" }}>CPA-ready summary — without spreadsheets</em>
            </h1>

            <p style={{
              fontSize: 16, color: C.inkLight, lineHeight: 1.7, marginBottom: 32, maxWidth: 480,
              opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(20px)",
              transition: "opacity 0.5s 0.14s, transform 0.5s 0.14s",
            }}>
              If your receipts are scattered across emails, photos, and pockets, PreFile pulls them into one structured file — ready for your accountant or your own review.
            </p>
            <p style={{ fontSize: 12, color: C.inkFaint, marginBottom: 0, marginTop: 6 }}>
              Built for freelancers, small business owners, and side hustlers
            </p>

            <p style={{ fontSize: 14, color: C.ink, fontWeight: 600, lineHeight: 1.55, marginTop: 22, marginBottom: 16, maxWidth: 460 }}>
              If you've got a year of receipts and a looming tax deadline — start here.
            </p>

            <div style={{
              display: "flex", flexDirection: "column", gap: 10, maxWidth: 380,
              opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(20px)",
              transition: "opacity 0.5s 0.21s, transform 0.5s 0.21s",
            }}>
              <button className="pf-btn-primary" onClick={() => { logEvent("CTA_START_CLICKED"); onStart(); }} style={{ width: "100%", fontSize: 16, padding: "16px 28px" }}>
                Organize my receipts →
              </button>
              <div style={{ fontSize: 11, color: C.inkFaint, textAlign: "center", marginTop: 6 }}>
                Free to try · Save your progress as you go
              </div>
              <div>
                <button className="pf-btn-secondary" onClick={onCheck} style={{ width: "100%" }}>
                  Check what I might be missing →
                </button>
                <div style={{ fontSize: 11, color: C.inkFaint, textAlign: "center", marginTop: 6 }}>
                  Most freelancers miss at least 3 deductions — check yours in 60 seconds
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
            <h2 style={{ fontFamily: "'Fraunces', serif", fontSize: "clamp(24px, 4vw, 36px)", fontWeight: 700, color: C.white, letterSpacing: "-0.4px" }}>Three steps, two minutes</h2>
            <p style={{ fontSize: 14, color: "rgba(255,255,255,0.72)", maxWidth: 640, lineHeight: 1.7, textAlign: "center", margin: "12px auto 0" }}>
              You don't need to build spreadsheets, guess categories, or organize everything manually. PreFile structures your receipts for you — so you can focus on reviewing, not figuring it out.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 20 }}>
            {[
              { n:"01", iconName:"receipt", title:"Add your receipts", body:"Photograph, upload, or type in any receipt — meals, software, shipping, phone bills." },
              { n:"02", iconName:"clipboard", title:"PreFile suggests a category", body:"We match common merchants automatically. You confirm or change — you always decide." },
              { n:"03", iconName:"download", title:"Download your organizer", body:"A clean, color-coded file organized by category — prepared for review by your tax professional." },
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
          Get organized before you file
        </h2>
        <p style={{ color:"rgba(255,255,255,0.65)", fontSize:15, marginBottom:30, maxWidth:380, margin:"0 auto 30px" }}>
          No account needed. Start adding receipts in seconds.
        </p>
        <button className="pf-btn-primary" onClick={() => { logEvent("CTA_START_CLICKED"); onStart(); }} style={{ background:C.white, color:C.forest, boxShadow:"0 4px 20px rgba(0,0,0,0.18)", margin:"0 auto", padding:"16px 36px", fontSize:16 }}>
          Organize my receipts →
        </button>
        <div style={{ marginTop:12, fontSize:12, color:"rgba(255,255,255,0.7)" }}>
          You stay in control — review everything before filing.
        </div>
        <div style={{ marginTop:18, fontSize:11, color:"rgba(255,255,255,0.4)" }}>
          PreFile is an organizational tool — not tax advice. Always verify with your tax professional.
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

// STEP 1 — ADD RECEIPT
function AddReceiptScreen({ onMethod, isMobile }) {
  return (
    <div className="slide-up" style={{ maxWidth: 520, margin: "0 auto", padding: "40px 24px" }}>
      <div style={{ marginBottom: 28 }}>
        <div className="pf-label">Step 1 of 3</div>
        <div className="progress-bar"><div className="progress-fill" style={{ width: "33%" }} /></div>
        <h2 style={{ fontFamily:"'Fraunces', serif", fontSize:28, fontWeight:700, color:C.ink, letterSpacing:"-0.4px", marginBottom:8 }}>
          Add a receipt
        </h2>
        <p style={{ fontSize:14, color:C.inkLight, lineHeight:1.65 }}>
          Upload, scan, or enter a receipt — we'll help you organize it
        </p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap:14, marginBottom:16 }}>
        {/* Primary on mobile: Scan. Primary on desktop: Upload */}
        {isMobile ? (
          <button className="method-card primary" onClick={() => onMethod("scan")} style={{ gridColumn:"1/-1" }}>
            <span style={{ fontSize:36 }}>📷</span>
            <div style={{ fontSize:16, fontWeight:700, color:C.forest, fontFamily:"'Fraunces', serif" }}>Scan receipt</div>
            <div style={{ fontSize:12, color:C.inkFaint }}>Point your camera at any receipt</div>
          </button>
        ) : (
          <button className="method-card primary" onClick={() => onMethod("upload")}>
            <span style={{ fontSize:36 }}>📂</span>
            <div style={{ fontSize:15, fontWeight:700, color:C.forest, fontFamily:"'Fraunces', serif" }}>Upload file</div>
            <div style={{ fontSize:12, color:C.inkFaint }}>JPG, PNG, or PDF</div>
          </button>
        )}

        {isMobile ? (
          <button className="method-card" onClick={() => onMethod("upload")}>
            <span style={{ fontSize:30 }}>📂</span>
            <div style={{ fontSize:14, fontWeight:600, color:C.ink }}>Upload from library</div>
            <div style={{ fontSize:12, color:C.inkFaint }}>Photo or PDF</div>
          </button>
        ) : (
          <button className="method-card" onClick={() => onMethod("scan")}>
            <span style={{ fontSize:30 }}>📷</span>
            <div style={{ fontSize:14, fontWeight:600, color:C.ink }}>Scan receipt</div>
            <div style={{ fontSize:12, color:C.inkFaint }}>Use your camera</div>
          </button>
        )}
      </div>

      <div style={{ position:"relative", marginBottom:16 }}>
        <div style={{ height:1, background:C.creamDeep }} />
        <span style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)", background:C.cream, padding:"0 12px", fontSize:11, color:C.inkFaint, fontWeight:600 }}>
          OR
        </span>
      </div>

      <button className="method-card" onClick={() => onMethod("manual")} style={{ width:"100%", flexDirection:"row", justifyContent:"flex-start", padding:"16px 20px", gap:14 }}>
        <span style={{ fontSize:24 }}>✏️</span>
        <div style={{ textAlign:"left" }}>
          <div style={{ fontSize:14, fontWeight:600, color:C.ink }}>Enter manually</div>
          <div style={{ fontSize:12, color:C.inkFaint }}>Type in merchant, amount, date</div>
        </div>
      </button>

      <div style={{ marginTop:20, fontSize:11, color:C.inkFaint, textAlign:"center" }}>
        You decide what is deductible · PreFile organizes — not tax advice
      </div>
      <DisclaimerFooter compact />
    </div>
  );
}

// STEP 2 — PROCESSING / MANUAL ENTRY
function ProcessingScreen({ method, onExtracted }) {
  const [phase, setPhase] = useState(method === "manual" ? "manual" : "loading");
  const [manualData, setManualData] = useState({ merchant: "", amount: "", date: new Date().toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"}), category: "" });

  useEffect(() => {
    if (method !== "manual") {
      const t1 = setTimeout(() => setPhase("extracting"), 800);
      const t2 = setTimeout(() => {
        // Pick a random sample receipt as mock extraction
        const sample = SAMPLE_MERCHANTS[Math.floor(Math.random() * SAMPLE_MERCHANTS.length)];
        onExtracted({ ...sample, id: Date.now(), businessPct: 100 });
      }, 2400);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [method]);

  if (phase === "loading" || phase === "extracting") {
    return (
      <div className="fade-in" style={{ maxWidth:520, margin:"0 auto", padding:"80px 24px", textAlign:"center" }}>
        <div style={{ width:48, height:48, borderRadius:"50%", border:`3px solid ${C.creamDeep}`, borderTopColor:C.forest, margin:"0 auto 24px" }} className="spin" />
        <div style={{ fontFamily:"'Fraunces', serif", fontSize:22, fontWeight:600, color:C.ink, marginBottom:8 }}>
          {phase === "loading" ? "Uploading…" : "Reading your receipt…"}
        </div>
        <div style={{ fontSize:13, color:C.inkFaint }}>
          {phase === "extracting" ? "Extracting merchant, amount, and date" : ""}
        </div>
      </div>
    );
  }

  // Manual entry form
  const handleManualSubmit = () => {
    if (!manualData.merchant || !manualData.amount) return;
    const cat = manualData.category || suggestCategory(manualData.merchant);
    onExtracted({ ...manualData, category: cat, id: Date.now(), businessPct: 100 });
  };

  return (
    <div className="slide-up" style={{ maxWidth:520, margin:"0 auto", padding:"40px 24px" }}>
      <div style={{ marginBottom:24 }}>
        <div className="pf-label">Step 2 of 3</div>
        <div className="progress-bar"><div className="progress-fill" style={{ width:"66%" }} /></div>
        <h2 style={{ fontFamily:"'Fraunces', serif", fontSize:26, fontWeight:700, color:C.ink, letterSpacing:"-0.3px", marginBottom:6 }}>Enter receipt details</h2>
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
function PaywallModal({ onUnlock, onDismiss, receiptCount = 0, hiddenInsightsCount = 0, receipts = [] }) {
  const [preparing, setPreparing] = useState(false);
  // Build a candidate pool from tier1 + tier2, exclude the teaser insight the
  // user already saw on the Organizer screen, and pick whichever remaining
  // insight has the highest conversionScore. The teaser is selected with the
  // same curiosity-weighted comparator OrganizerScreen uses, so this filter
  // tracks the actual on-screen teaser rather than tier1[0].
  const { tier1, tier2 } = computeInsights(receipts);
  const teaserInsight = tier1.length > 0
    ? [...tier1].sort((a, b) => {
        const curiosityBoost = { mileage_gap: 50, subscription_velocity: 40, meals_high_dollar: 35 };
        return (
          (b.conversionScore + (curiosityBoost[b.id] || 0)) -
          (a.conversionScore + (curiosityBoost[a.id] || 0))
        );
      })[0]
    : null;
  const allCandidates = [...tier1, ...tier2];
  const unseenInsights = allCandidates.filter(ins => ins.id !== teaserInsight?.id);
  const paywallInsight = unseenInsights.length > 0
    ? [...unseenInsights].sort((a, b) => b.conversionScore - a.conversionScore)[0]
    : null;
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
        padding: "28px 26px",
        borderRadius: 22,
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

        {/* Strong hook headline */}
        <h2 style={{
          fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700,
          color: C.ink, letterSpacing: "-0.3px", marginBottom: 6,
        }}>
          Your organized summary is ready.
        </h2>
        <p style={{ fontSize: 13, color: C.inkLight, lineHeight: 1.6, marginBottom: 18 }}>
          Your receipts are categorized, totals calculated, and key items flagged for review.
        </p>
        <div style={{ fontSize: 12, color: C.inkLight, marginTop: 6 }}>
          You've already organized everything — don't leave it behind.
        </div>

        {/* Value stack */}
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.inkFaint, textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 10 }}>
            Your file includes:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 7, marginBottom: 14 }}>
            {valueItems.map(item => (
              <div key={item} style={{ display: "flex", alignItems: "center", gap: 9 }}>
                <Icon name="checkCircle" size={13} color={C.forest} strokeWidth={2.2} style={{ flexShrink: 0 }} />
                <span style={{ fontSize: 13, color: C.ink }}>{item}</span>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 11, color: C.inkFaint, marginTop: 10, marginBottom: 0, lineHeight: 1.5 }}>
            Everything you enter is saved — your file is always ready to download.
          </p>
        </div>
        <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 6 }}>
          Works with TurboTax, H&amp;R Block, or your accountant
        </div>

        {/* Spreadsheet preview */}
        <div style={{
          border: `1px solid ${C.creamDeep}`, borderRadius: 10,
          overflow: "hidden", marginBottom: 14,
        }}>
          <div style={{
            background: C.ink, display: "grid",
            gridTemplateColumns: "60px 1fr 1fr 56px",
            padding: "5px 10px", gap: 6,
          }}>
            {["Date","Merchant","Category","Amount"].map(h => (
              <span key={h} style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.05em" }}>{h}</span>
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

        {/* Confidence line */}
        <div style={{
          background: "rgba(27,94,32,0.06)", borderRadius: 9,
          padding: "9px 12px", marginBottom: 8,
          fontSize: 11, color: C.forestMid, lineHeight: 1.55, fontStyle: "italic",
        }}>
          Formatted exactly how most tax professionals prefer to receive expense data.
        </div>

        {/* Price */}
        <div style={{
          background: C.creamDark, borderRadius: 11, padding: "11px 14px",
          display: "flex", alignItems: "center", justifyContent: "flex-end",
          marginBottom: 14,
        }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 700, color: C.forest }}>$12</div>
        </div>

        {/* Insight trigger — sits directly above CTA. Shows a new, unrevealed insight when available. */}
        {paywallInsight && (
          <div style={{ fontSize: 12, color: C.inkLight, textAlign: "center", marginBottom: 10, lineHeight: 1.5 }}>
            {paywallInsight.line}
          </div>
        )}

        {/* Primary CTA */}
        <button
          className="pf-btn-primary"
          onClick={() => {
            if (preparing) return;
            logEvent("PAY_CLICKED", { count: receiptCount });
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
            "Get my summary — $12"
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

        {/* Social proof + legal */}
        <div style={{ fontSize: 10, color: C.inkFaint, textAlign: "center", lineHeight: 1.6 }}>
          Used by freelancers and small business owners
        </div>
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
  const taxYear   = "2025";

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
              <strong>Disclaimer:</strong> PreFile is an organizational tool — not tax advice. All amounts are self-reported estimates.
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

function OrganizerScreen({ receipts, onAddAnother, isSaved, onExport, showSavedConfirm, onGenerateSummary, onClearData, onDeleteReceipt, showDownloadMsg, isDownloading }) {
  const [confirmed, setConfirmed] = useState(false);
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
            Your organized totals
          </h2>
          <p style={{ fontSize: 13, color: C.inkFaint, marginTop: 4 }}>
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
        // Teaser selection adds a curiosity boost to specific insight ids on top
        // of conversionScore, so the on-screen teaser is optimized for opening
        // a loop the paywall can close — not just for raw score order.
        const teaserInsight = [...tier1].sort((a, b) => {
          const curiosityBoost = { mileage_gap: 50, subscription_velocity: 40, meals_high_dollar: 35 };
          return (
            (b.conversionScore + (curiosityBoost[b.id] || 0)) -
            (a.conversionScore + (curiosityBoost[a.id] || 0))
          );
        })[0];
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
                We noticed
              </div>
              <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.55 }}>
                {teaserInsight.line}
              </div>
            </div>
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
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", padding: "8px 14px", background: C.ink }}>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Category</span>
                  <span style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.07em" }}>Amount</span>
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
                <button
                  className="pf-btn-primary"
                  onClick={() => { logEvent("PAYWALL_VIEWED", { count: receipts.length }); logEvent("PAYWALL_SHOWN", { count: receipts.length }); setShowPaywall(true); }}
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
                <div style={{ marginTop: 8, fontSize: 11, color: C.inkFaint, textAlign: "center" }}>
                  {isSaved
                    ? "Your receipts are saved · Export ready"
                    : "Your receipts are not saved yet — use the button below to download your file."
                  }
                </div>
                {isSaved && !showDownloadMsg && (
                  <div style={{
                    marginTop: 10, padding: "10px 14px",
                    background: "rgba(27,94,32,0.08)",
                    border: "1px solid rgba(27,94,32,0.2)",
                    borderRadius: 10, fontSize: 13, fontWeight: 700,
                    color: C.forest, lineHeight: 1.5,
                  }}>
                    Your full summary is ready — use the button above to download your file.
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
        PreFile is an organizational tool — not tax advice · Always verify with your tax professional
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
  const [receiptStep, setReceiptStep] = useState("add");
  const [checkStep, setCheckStep]   = useState("questions"); // questions | loading | reveal
  const [checkAnswers, setCheckAnswers] = useState(null);
  const [method, setMethod]         = useState(null);
  const [pendingReceipt, setPendingReceipt] = useState(null);
  const [receipts, setReceipts]     = useState([]);
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

  // ── Persistence: load receipts on mount ──
  useEffect(() => {
    const saved = localStorage.getItem("prefile_receipts");
    if (saved) {
      try { setReceipts(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  // ── Persistence: save receipts whenever they change ──
  useEffect(() => {
    localStorage.setItem("prefile_receipts", JSON.stringify(receipts));
  }, [receipts]);

  const showToast = msg => {
    setToast({ visible: true, message: msg });
    setTimeout(() => setToast(t => ({ ...t, visible: false })), 3000);
  };

  // ── Receipt flow handlers ──
  const handleMethod = m => { setMethod(m); setReceiptStep("processing"); };
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
  const handleAddAnother = () => { setPage("receipt-flow"); setReceiptStep("add"); };
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
      case "processing": return <ProcessingScreen method={method} onExtracted={handleExtracted} />;
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

    // ── Sheet 1: RECEIPTS ────────────────────────────────────
    const COLS_RECEIPTS = ["A","B","C","D","E","F","G","H"];
    const HDR_RECEIPTS  = [
      "Date", "Merchant", "Category",
      "What this covers", "Amount ($)", "Business %", "Business Amount ($)", "Notes / Business purpose"
    ];
    const NCOLS = HDR_RECEIPTS.length; // 8

    const ws1 = {};
    const grandTotal = receipts.reduce((s,r) => s + ((parseFloat(r.amount)||0)*((r.businessPct||100)/100)), 0);
    const preparedDate = new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });

    // ── Header block rows 1–4 ──────────────────────────────
    const metaLabelStyle = {
      font:  { bold: true, color: { rgb: WHITE }, name: "Calibri", sz: 11 },
      fill:  { fgColor: { rgb: FOREST }, patternType: "solid" },
      alignment: { horizontal: "left", vertical: "center" },
    };
    const metaValueStyle = {
      font:  { color: { rgb: "FFCCE5CC" }, name: "Calibri", sz: 11 },
      fill:  { fgColor: { rgb: FOREST }, patternType: "solid" },
      alignment: { horizontal: "left", vertical: "center" },
    };

    ws1["!merges"] = [
      { s:{r:0,c:0}, e:{r:0,c:NCOLS-1} }, // Row 1: app title
      { s:{r:1,c:1}, e:{r:1,c:NCOLS-1} }, // Row 2: date value
      { s:{r:2,c:1}, e:{r:2,c:NCOLS-1} }, // Row 3: count value
      { s:{r:3,c:1}, e:{r:3,c:NCOLS-1} }, // Row 4: total value
    ];

    // Row 1 — App title banner
    ws1["A1"] = { v: "PreFile Tax Organizer — Tax Year 2025", t: "s", s: {
      font:      { bold: true, color: { rgb: WHITE }, name: "Calibri", sz: 13 },
      fill:      { fgColor: { rgb: FOREST }, patternType: "solid" },
      alignment: { horizontal: "left", vertical: "center" },
    }};
    // Row 2 — Prepared date
    ws1["A2"] = { v: "Prepared on:", t: "s", s: metaLabelStyle };
    ws1["B2"] = { v: preparedDate, t: "s", s: metaValueStyle };
    // Row 3 — Receipt count
    ws1["A3"] = { v: "Total receipts:", t: "s", s: metaLabelStyle };
    ws1["B3"] = { v: receipts.length, t: "n", s: metaValueStyle };
    // Row 4 — Total business amount
    ws1["A4"] = { v: "Total business amount:", t: "s", s: metaLabelStyle };
    ws1["B4"] = { v: grandTotal, t: "n", s: { ...metaValueStyle, font: { ...metaValueStyle.font, bold: true, sz: 12 } } };
    ws1["B4"].z = "$#,##0.00";

    // Fill remaining cells in rows 1-4 with forest green
    for (let row = 1; row <= 4; row++) {
      for (let col = 1; col < NCOLS; col++) {
        const addr = COLS_RECEIPTS[col] + row;
        if (!ws1[addr]) ws1[addr] = { v: "", t: "s", s: metaLabelStyle };
      }
    }

    // ── Column headers row 5 (index 4) ────────────────────
    HDR_RECEIPTS.forEach((h, ci) => {
      const addr = COLS_RECEIPTS[ci] + "5";
      ws1[addr] = { v: h, t: "s", s: headerStyle() };
    });

    // ── Data rows starting at row 6 (index 5) ─────────────
    const range1 = { s: { c:0, r:0 }, e: { c: NCOLS-1, r: 4 } };

    receipts.forEach((r, i) => {
      const rowNum  = i + 6;
      const pct     = r.businessPct || 100;
      const amt     = parseFloat(r.amount) || 0;
      const bizAmt  = amt * pct / 100;
      const catMeta = CAT_META[r.category] || CAT_META["Other"];
      const catDef  = CATEGORY_DEFINITIONS[r.category] || "";
      const bgArgb  = soften(catMeta.color);

      const rowData = [
        r.date || "",
        r.merchant,
        r.category,
        catDef,
        amt,
        pct / 100,
        bizAmt,
        "",                    // Notes / business purpose — left blank for user
      ];

      rowData.forEach((v, ci) => {
        const addr = COLS_RECEIPTS[ci] + rowNum;
        const isAmt  = ci === 4 || ci === 6;
        const isPct  = ci === 5;
        const isLeft = ci <= 3 || ci === 7;
        const s = dataStyle(bgArgb, ci === 1, isLeft ? "left" : "right");
        ws1[addr] = { v, t: typeof v === "number" ? "n" : "s", s };
        if (isAmt) ws1[addr].z = "$#,##0.00";
        if (isPct) ws1[addr].z = "0%";
      });

      if (rowNum > range1.e.r) range1.e.r = rowNum;
    });

    // ── Total row ──────────────────────────────────────────
    const totalRow = receipts.length + 6;
    Array(NCOLS).fill("").forEach((_, ci) => {
      const addr = COLS_RECEIPTS[ci] + totalRow;
      ws1[addr] = { v: "", t: "s", s: totalStyle };
    });
    ws1["B" + totalRow] = { v: "TOTAL", t: "s", s: { ...totalStyle, alignment: { horizontal: "left", vertical: "center" } }};
    ws1["G" + totalRow] = { v: grandTotal, t: "n", s: totalStyle };
    ws1["G" + totalRow].z = "$#,##0.00";

    // ── Disclaimer row ─────────────────────────────────────
    const discRow = totalRow + 1;
    ws1["A" + discRow] = {
      v: "For organization purposes only · Amounts are estimates · Always verify with your tax professional before filing",
      t: "s",
      s: {
        font:      { italic: true, color: { rgb: "FF9A9A97" }, name: "Calibri", sz: 9 },
        fill:      { fgColor: { rgb: CREAM2 }, patternType: "solid" },
        alignment: { horizontal: "left", vertical: "center", wrapText: true },
      },
    };
    ws1["!merges"].push({ s:{r:discRow-1,c:0}, e:{r:discRow-1,c:NCOLS-1} });

    range1.e.r = discRow;
    ws1["!ref"] = XLSX.utils.encode_range(range1);
    ws1["!cols"] = [
      { wch: 14 }, // Date
      { wch: 28 }, // Merchant
      { wch: 24 }, // Category
      { wch: 48 }, // Definition
      { wch: 14 }, // Amount
      { wch: 12 }, // Business %
      { wch: 18 }, // Business Amount
      { wch: 32 }, // Notes
    ];
    ws1["!rows"] = [
      { hpt: 24 }, // Title
      { hpt: 18 }, // Date
      { hpt: 18 }, // Count
      { hpt: 18 }, // Total
      { hpt: 18 }, // Column headers
      ...receipts.map(() => ({ hpt: 36 })),
      { hpt: 18 }, // Total row
      { hpt: 28 }, // Disclaimer
    ];
    // Freeze pane below header block + column headers (row 6)
    ws1["!freeze"] = { xSplit: 0, ySplit: 5 };
    // Auto-filter on column header row
    ws1["!autofilter"] = { ref: `A5:H5` };

    // ── Sheet 2: SUMMARY ─────────────────────────────────────
    const ws2 = {};

    // Build category totals, sorted by business amount descending
    const catTotals = {};
    receipts.forEach(r => {
      const amt    = parseFloat(r.amount) || 0;
      const bizAmt = amt * ((r.businessPct || 100) / 100);
      catTotals[r.category] = (catTotals[r.category] || 0) + bizAmt;
    });
    const sorted = Object.entries(catTotals).sort((a,b) => b[1] - a[1]);
    const grandBiz = grandTotal;

    // Reusable styles for this sheet
    const summaryHeaderStyle = {
      font:      { bold: true, color: { rgb: "FF1B5E20" }, name: "Calibri", sz: 14 },
      alignment: { horizontal: "left", vertical: "center" },
      fill:      { patternType: "solid", fgColor: { rgb: "FFE8F5E9" } },  // very light green tint
    };
    const totalLabelStyle = {
      font:      { bold: true, color: { rgb: INK }, name: "Calibri", sz: 12 },
      alignment: { horizontal: "left", vertical: "center" },
      fill:      { patternType: "solid", fgColor: { rgb: "FFE8F5E9" } },  // very light green tint
    };
    const totalAmountStyle = {
      font:      { bold: true, color: { rgb: INK }, name: "Calibri", sz: 12 },
      alignment: { horizontal: "right", vertical: "center" },
      fill:      { patternType: "solid", fgColor: { rgb: "FFE8F5E9" } },  // very light green tint
    };
    const tableHeaderStyle = {
      font:      { bold: true, color: { rgb: INK }, name: "Calibri", sz: 11 },
      alignment: { horizontal: "left", vertical: "center" },
    };
    const tableHeaderFillStyle = {
      ...tableHeaderStyle,
      fill:      { patternType: "solid", fgColor: { rgb: "FFF5F5F5" } },  // very light gray
    };
    const summarySubheaderStyle = {
      font:      { italic: true, color: { rgb: INK }, name: "Calibri", sz: 11 },
      alignment: { horizontal: "left", vertical: "center" },
    };
    const summaryBylineStyle = {
      font:      { italic: true, color: { rgb: "FF8B8B8B" }, name: "Calibri", sz: 10 },
      alignment: { horizontal: "left", vertical: "center" },
    };
    // Insight row styling — gold for "review" (default) vs soft red for "risk" items
    // (duplicates, overstatements). Fills are intentionally near-white so the sheet
    // never feels saturated; left borders carry most of the visual grouping.
    const RISK_INSIGHT_IDS = new Set(["duplicate_entries", "mixed_use_100pct", "rounded_numbers"]);
    const insightReviewStyle = {
      font:      { color: { rgb: INK }, name: "Calibri", sz: 11 },
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
      fill:      { patternType: "solid", fgColor: { rgb: "FFFFF8E1" } },  // very light amber
      border:    { left: { style: "thin", color: { rgb: "FFE6A700" } } }, // soft gold
    };
    const insightRiskStyle = {
      font:      { color: { rgb: INK }, name: "Calibri", sz: 11 },
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
      fill:      { patternType: "solid", fgColor: { rgb: "FFFFEBEE" } },  // very light red
      border:    { left: { style: "thin", color: { rgb: "FFC62828" } } }, // soft red
    };
    const insightNeutralStyle = {
      font:      { color: { rgb: INK }, name: "Calibri", sz: 11 },
      alignment: { horizontal: "left", vertical: "center", wrapText: true },
      fill:      { patternType: "solid", fgColor: { rgb: "FFF5F5F5" } },  // very light gray
      border:    { left: { style: "thin", color: { rgb: "FF9E9E9E" } } }, // mid gray
    };
    // Top-category-row highlight — the first (largest) row in Category Breakdown
    const topCategoryRowStyle = {
      font:      { bold: true, color: { rgb: INK }, name: "Calibri", sz: 11 },
      fill:      { patternType: "solid", fgColor: { rgb: "FFFFF8E1" } },  // very light amber
    };

    // Row 1: Sheet header (styled)
    ws2["A1"] = { v: "Here are your full analysis results — including additional insights to review.", t: "s", s: summaryHeaderStyle };

    // Row 2: Subheader (italic, smaller, muted ink — sits directly under header)
    ws2["A2"] = { v: "Review each section carefully before filing.", t: "s", s: summarySubheaderStyle };

    // Row 3: Byline tagline (small italic, muted gray — uses the existing gap slot)
    ws2["A3"] = { v: "Prepared with PreFile — organized for review before filing.", t: "s", s: summaryBylineStyle };

    // Row 4: blank (gap between header block and totals)

    // Row 5: Total Business Expenses (label + amount, both bold, B as currency)
    ws2["A5"] = { v: "Total Business Expenses", t: "s", s: totalLabelStyle };
    ws2["B5"] = { v: grandBiz, t: "n", s: totalAmountStyle, z: "$#,##0.00" };

    // Row 6: blank (gap between totals and insight block)

    // Rows 7..N (only when there's data): Insights — one per row, full list.
    // Uses the shared computeInsights() helper so the paywall teaser count and
    // the exported file are guaranteed to be in sync. The XLSX uses the full
    // .all list (deduped + sorted by priority desc); the paywall pitch uses
    // .tier1 length only.
    // The "highest spend" top-line summary follows as the last insight row.
    // When sorted is empty, no insights are written and downstream rows do NOT shift.
    const insights = sorted.length > 0 ? computeInsights(receipts).all : [];
    const insightCount  = insights.length;
    const topLineShift  = sorted.length > 0 ? 1 : 0;
    const shift = insightCount + topLineShift;

    insights.forEach((ins, i) => {
      const isRisk = RISK_INSIGHT_IDS.has(ins.id);
      ws2["A" + (7 + i)] = { v: ins.line, t: "s", s: isRisk ? insightRiskStyle : insightReviewStyle };
    });
    if (sorted.length > 0) {
      const topPct = grandBiz > 0 ? ((sorted[0][1] / grandBiz) * 100).toFixed(0) : 0;
      ws2["A" + (7 + insightCount)] = { v: `Your highest business spend is ${sorted[0][0]} (${topPct}% of total)`, t: "s", s: insightNeutralStyle };
    }

    // Blank row between insight block and Category Breakdown — then section title
    ws2["A" + (8 + shift)] = { v: "Category Breakdown", t: "s", s: tableHeaderStyle };

    // Table headers
    const headerRow = 9 + shift;
    ws2["A" + headerRow] = { v: "Category",    t: "s", s: tableHeaderFillStyle };
    ws2["B" + headerRow] = { v: "Total",       t: "s", s: { ...tableHeaderFillStyle, alignment: { horizontal: "right", vertical: "center" } } };
    ws2["C" + headerRow] = { v: "% of Spend",  t: "s", s: { ...tableHeaderFillStyle, alignment: { horizontal: "right", vertical: "center" } } };
    ws2["D" + headerRow] = { v: "Common mapping (verify before filing)", t: "s", s: tableHeaderFillStyle };

    // Category data (sorted by total DESC, top row gets subtle highlight).
    // Column D shows the common Schedule C line for the category — see
    // SCHEDULE_C_REFERENCE for the mapping. Marked clearly as guidance only
    // via the column header and the disclaimer row below.
    sorted.forEach(([cat, bizAmt], i) => {
      const rowNum = i + 10 + shift;
      const pctOfTotal = grandBiz > 0 ? bizAmt / grandBiz : 0;
      const isTop = i === 0;
      const reference = SCHEDULE_C_REFERENCE[cat] || "Varies — depends on use, review before filing";
      ws2["A" + rowNum] = { v: cat,        t: "s", ...(isTop ? { s: topCategoryRowStyle } : {}) };
      ws2["B" + rowNum] = { v: bizAmt,     t: "n", z: "$#,##0.00", ...(isTop ? { s: { ...topCategoryRowStyle, alignment: { horizontal: "right" } } } : {}) };
      ws2["C" + rowNum] = { v: pctOfTotal, t: "n", z: "0.0%",      ...(isTop ? { s: { ...topCategoryRowStyle, alignment: { horizontal: "right" } } } : {}) };
      ws2["D" + rowNum] = { v: reference,  t: "s", ...(isTop ? { s: topCategoryRowStyle } : {}) };
    });

    // Disclaimer + Top Categories section
    // Layout: data → blank → disclaimer → blank → Top Categories title → top 3
    const lastDataRow      = 9 + shift + sorted.length;   // row of last category (or headerRow if empty)
    const disclaimerRow    = lastDataRow + 2;             // blank row, then disclaimer
    const topTitleRow      = disclaimerRow + 2;           // blank row after disclaimer, then title
    ws2["A" + disclaimerRow] = {
      v: "References are provided for general guidance only. Confirm all classifications with a qualified tax professional before filing.",
      t: "s",
      s: { font: { italic: true, color: { rgb: "FF8B8B8B" }, name: "Calibri", sz: 10 }, alignment: { horizontal: "left", vertical: "center", wrapText: true } },
    };
    ws2["A" + topTitleRow] = { v: "Top Categories", t: "s", s: tableHeaderFillStyle };

    const topThree = sorted.slice(0, 3);
    const topThreeRowStyle = {
      font:      { bold: true, color: { rgb: INK }, name: "Calibri", sz: 11 },
      alignment: { horizontal: "left", vertical: "center" },
    };
    topThree.forEach(([cat, bizAmt], i) => {
      const rowNum = topTitleRow + 1 + i;
      ws2["A" + rowNum] = { v: `#${i + 1} ${cat} — $${bizAmt.toFixed(2)} (${grandBiz > 0 ? ((bizAmt / grandBiz) * 100).toFixed(0) : 0}% of spend)`, t: "s", s: topThreeRowStyle };
    });

    // Sheet metadata: range, columns, no merges
    const lastRow = topTitleRow + topThree.length;    // last row containing content
    ws2["!ref"]  = XLSX.utils.encode_range({ s:{c:0,r:0}, e:{c:3,r:lastRow} });
    ws2["!cols"] = [{ wch: 34 }, { wch: 16 }, { wch: 14 }, { wch: 38 }];
    ws2["!freeze"] = { ySplit: 1 };
    // No merges, no per-row heights, no fills beyond header — per spec

    // ── Build disclaimer / README sheet ──────────────────────
    const disclaimerSheet = XLSX.utils.aoa_to_sheet([
      ["PreFile Organizer — For Preparation & Review Only"],
      [""],
      ["This document is an organized summary of financial information based on user input and suggested categorization."],
      [""],
      ["It is not a completed tax return and should not be used for filing without review."],
      [""],
      ["Please confirm all entries with a qualified tax professional before submitting any tax forms."],
      [""],
      ["PreFile is an organizational tool designed to help you collect and structure financial information before filing taxes. It does not provide tax, legal, or financial advice. You are responsible for reviewing all entries before filing."],
    ]);
    // Header styling — A1 only (bold, larger, dark green)
    disclaimerSheet["A1"] = {
      v: "PreFile Organizer — For Preparation & Review Only",
      t: "s",
      s: {
        font: { bold: true, color: { rgb: "FF1B5E20" }, name: "Calibri", sz: 14 },
        alignment: { horizontal: "left", vertical: "center", wrapText: true },
      },
    };
    disclaimerSheet["!cols"] = [{ wch: 110 }];
    disclaimerSheet["!rows"] = [
      { hpt: 26 }, // 1: header
      { hpt: 8 },  // 2: blank
      { hpt: 32 }, // 3: body
      { hpt: 8 },  // 4: blank
      { hpt: 22 }, // 5: body
      { hpt: 8 },  // 6: blank
      { hpt: 32 }, // 7: body
      { hpt: 8 },  // 8: blank
      { hpt: 48 }, // 9: long body
    ];

    // ── Build & download workbook ────────────────────────────
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, disclaimerSheet, "README — PreFile Organizer");
    XLSX.utils.book_append_sheet(wb, ws1, "Receipts");
    XLSX.utils.book_append_sheet(wb, ws2, "Summary");
    XLSX.writeFile(wb, "PreFile_Organizer_2025.xlsx");
    logEvent("EXPORT_COMPLETED", { count: receipts.length });
    showToast("Color-coded organizer downloaded ✓");
    // Brief delay so the 'Your full summary is ready' callout has time to be
    // read before the 'Downloaded ✓' callout takes over. The file itself is
    // already downloading by this point — only the visual confirmation lags.
    setTimeout(() => setShowDownloadMsg(true), 800);
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
      showToast("Your full summary is ready — download starting…");
      Promise.resolve().then(() => doExport());
    }, 600);
    setTimeout(() => {
      showToast("Saved to your device.");
    }, 3500);
  };

  const handlePaywallDismiss = () => {
    logEvent("PAYWALL_DISMISSED", { count: receipts.length });
    const reason = prompt(
      "Quick question — what made you not download right now?\n\nYou can just type a number or a few words:\n\n1. Too expensive\n2. Not needed\n3. Just testing\n4. Something unclear\n\nOr tell me in your own words:"
    );
    logEvent("PAYWALL_REASON", { reason: reason?.trim() || "dismissed_no_response" });
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
  const handleRevealContinue = () => { setPage("receipt-flow"); setReceiptStep("add"); };

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
        onLogoClick={() => { setPage("home"); setReceiptStep("add"); setCheckStep("questions"); setShowPaywall(false); }}
        receiptCount={receipts.length}
      />

      <main style={{ minHeight: "calc(100vh - 65px)", background: C.cream }}>
        {page === "home" && (
          <Homepage
            onStart={() => setPage("receipt-flow")}
            onCheck={handleCheckStart}
          />
        )}
        {page === "receipt-flow" && renderReceiptFlow()}
        {page === "organizer" && (
          <OrganizerScreen receipts={receipts} onAddAnother={handleAddAnother} isSaved={isSaved} onExport={handleExport} showSavedConfirm={showSavedConfirm} onGenerateSummary={handleGenerateSummary} onClearData={handleClearData} onDeleteReceipt={handleDeleteReceipt} showDownloadMsg={showDownloadMsg} isDownloading={isDownloading} />
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
            onClick={() => { logEvent("PAYWALL_VIEWED", { count: receipts.length }); setShowPaywall(true); }}
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
