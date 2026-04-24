import { useState, useEffect, useRef } from "react";

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

const PAYWALL_COPY_VARIANT = "A"; // change to "B" to test

const CAT_META = {
  "Advertising & marketing": { icon: "📢", color: "#7C3AED" },
  "Car & mileage":           { icon: "🚗", color: "#D97706" },
  "Contractors & services":  { icon: "🤝", color: "#0369A1" },
  "Legal & professional":    { icon: "⚖️", color: "#475569" },
  "Office expenses":         { icon: "📎", color: "#1D4ED8" },
  "Supplies":                { icon: "📦", color: "#1B5E20" },
  "Travel":                  { icon: "✈️", color: "#0891B2" },
  "Business meals":          { icon: "🍽️", color: "#D4A017" },
  "Utilities":               { icon: "💡", color: "#C62828" },
  "Software & subscriptions":{ icon: "💻", color: "#6B21A8" },
  "Insurance":               { icon: "🛡️", color: "#065F46" },
  "Rent / workspace":        { icon: "🏠", color: "#92400E" },
  "Taxes & licenses":        { icon: "📋", color: "#374151" },
  "Equipment & tools":       { icon: "🔧", color: "#7C2D12" },
  "Other":                   { icon: "📄", color: "#6B7280" },
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
  { merchant: "Canva Pro", amount: "12.99", date: "Apr 18, 2026", category: "Software & subscriptions" },
  { merchant: "USPS Shipping", amount: "47.80", date: "Apr 15, 2026", category: "Supplies" },
  { merchant: "Starbucks", amount: "38.50", date: "Apr 12, 2026", category: "Business meals" },
  { merchant: "Google Workspace", amount: "14.00", date: "Apr 10, 2026", category: "Software & subscriptions" },
  { merchant: "AT&T Monthly", amount: "95.00", date: "Apr 1, 2026", category: "Utilities" },
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
        <div style={{ width: 32, height: 32, background: C.forest, borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15 }}>📁</div>
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
      <div style={{ width: 36, height: 36, borderRadius: 9, background: meta.color + "18", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, flexShrink: 0 }}>
        {meta.icon}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: "'Fraunces', serif", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {receipt.merchant}
        </div>
        <div style={{ fontSize: 11, color: meta.color, fontWeight: 600, marginTop: 2 }}>
          {receipt.category}
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
            <span style={{ fontSize: 14 }}>{meta.icon}</span>
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
              Turn your messy receipts into a{" "}
              <em style={{ color: C.forest, fontStyle: "italic" }}>clean, tax-ready file</em>
            </h1>

            <p style={{
              fontSize: 16, color: C.inkLight, lineHeight: 1.7, marginBottom: 32, maxWidth: 480,
              opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(20px)",
              transition: "opacity 0.5s 0.14s, transform 0.5s 0.14s",
            }}>
              Organize your receipts before you file — avoid missing deductions, reduce stress, and download a clean tax-ready file.
            </p>

            <div style={{
              display: "flex", flexDirection: "column", gap: 10, maxWidth: 380,
              opacity: vis ? 1 : 0, transform: vis ? "none" : "translateY(20px)",
              transition: "opacity 0.5s 0.21s, transform 0.5s 0.21s",
            }}>
              <button className="pf-btn-primary" onClick={onStart} style={{ width: "100%", fontSize: 16, padding: "16px 28px" }}>
                Organize my receipts →
              </button>
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
              Free to try · Pay only to save and export
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
                  <div style={{ fontSize: 22, fontWeight: 700, color: C.ink, fontFamily: "'Fraunces', serif", marginTop: 2 }}>$208.29</div>
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
                <span style={{ color: C.white, fontSize: 17, fontWeight: 700, fontFamily: "'Fraunces', serif" }}>$208.29</span>
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
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(230px, 1fr))", gap: 20 }}>
            {[
              { n:"01", icon:"📸", title:"Add your receipts", body:"Photograph, upload, or type in any receipt — meals, software, shipping, phone bills." },
              { n:"02", icon:"🏷️", title:"PreFile suggests a category", body:"We match common merchants automatically. You confirm or change — you always decide." },
              { n:"03", icon:"📊", title:"Download your organizer", body:"A clean, color-coded file organized by category — ready for your tax professional." },
            ].map((s, i) => (
              <div key={i} style={{ background:"rgba(255,255,255,0.05)", borderRadius:16, padding:"26px 22px", border:"1px solid rgba(255,255,255,0.08)" }}>
                <div style={{ fontSize:11, fontWeight:700, color:C.forestLight, letterSpacing:"0.1em", marginBottom:10 }}>{s.n}</div>
                <div style={{ fontSize:26, marginBottom:10 }}>{s.icon}</div>
                <div style={{ fontSize:15, fontWeight:700, color:C.white, fontFamily:"'Fraunces', serif", marginBottom:7 }}>{s.title}</div>
                <div style={{ fontSize:13, color:"rgba(255,255,255,0.5)", lineHeight:1.65 }}>{s.body}</div>
              </div>
            ))}
          </div>
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
              <span key={i} style={{
                background: C.white, border: `1px solid ${C.creamDark}`,
                borderRadius: 20, padding: "6px 13px", fontSize: 12, fontWeight: 600, color: C.inkLight,
                display: "flex", alignItems: "center", gap: 5,
              }}>
                <span style={{ fontSize: 13 }}>{meta.icon}</span>{cat}
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
                <span style={{ fontSize:17, flexShrink:0, marginTop:1 }}>✅</span>
                <span style={{ fontSize:13, color:C.inkLight, lineHeight:1.65 }}>{pain}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BOTTOM CTA */}
      <section style={{ padding:"68px 24px", background:C.forest, textAlign:"center" }}>
        <h2 style={{ fontFamily:"'Fraunces', serif", fontSize:"clamp(24px,4vw,38px)", fontWeight:700, color:C.white, letterSpacing:"-0.4px", marginBottom:12 }}>
          Ready to get organized?
        </h2>
        <p style={{ color:"rgba(255,255,255,0.65)", fontSize:15, marginBottom:30, maxWidth:380, margin:"0 auto 30px" }}>
          No account needed. Start adding receipts in seconds.
        </p>
        <button className="pf-btn-primary" onClick={onStart} style={{ background:C.white, color:C.forest, boxShadow:"0 4px 20px rgba(0,0,0,0.18)", margin:"0 auto", padding:"16px 36px", fontSize:16 }}>
          Organize my receipts →
        </button>
        <div style={{ marginTop:18, fontSize:11, color:"rgba(255,255,255,0.4)" }}>
          PreFile is an organizational tool — not tax advice. Always verify with your tax professional.
        </div>
      </section>
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
        <p style={{ fontSize:13, color:C.inkLight }}>Fill in what you know — category is auto-suggested</p>
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
              Suggested: {suggestCategory(manualData.merchant)}
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
            {CATEGORIES.map(c => <option key={c} value={c}>{(CAT_META[c]?.icon || "📄") + " " + c}</option>)}
          </select>
        </div>

        <button className="pf-btn-primary" onClick={handleManualSubmit} style={{ width:"100%", opacity: (!manualData.merchant || !manualData.amount) ? 0.4 : 1 }}
          disabled={!manualData.merchant || !manualData.amount}>
          Review receipt →
        </button>
      </div>
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
        <p style={{ fontSize:13, color:C.inkLight }}>Suggested category — confirm or edit</p>
      </div>

      <div className="pf-card" style={{ padding:24, marginBottom:20 }}>
        {/* Category badge */}
        <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:20 }}>
          <div style={{ width:48, height:48, borderRadius:12, background:meta.color+"18", display:"flex", alignItems:"center", justifyContent:"center", fontSize:22 }}>
            {meta.icon}
          </div>
          <div>
            <div style={{ fontSize:11, color:C.inkFaint, fontWeight:600, marginBottom:2 }}>Suggested category</div>
            <div style={{ fontSize:14, fontWeight:700, color:meta.color }}>{receipt.category}</div>
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

      <div style={{ textAlign:"center", fontSize:11, color:C.inkFaint }}>
        You decide what is deductible · Not tax advice
      </div>
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
              {CATEGORIES.map(c => <option key={c} value={c}>{(CAT_META[c]?.icon || "📄") + " " + c}</option>)}
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
    </div>
  );
}

// RECEIPT LIST / ORGANIZER SCREEN

// ═══════════════════════════════════════════════════════════════════════════════
// PAYWALL MODAL
// ═══════════════════════════════════════════════════════════════════════════════
function PaywallModal({ onUnlock, onDismiss }) {
  const features = [
    { icon: "💾", text: "Save your receipts across sessions" },
    { icon: "📁", text: "Access your organizer anytime" },
    { icon: "📥", text: "Export your tax-ready CSV file" },
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
          background: "rgba(26,26,24,0.55)",
          backdropFilter: "blur(4px)",
        }}
      />

      {/* Modal card */}
      <div className="slide-up pf-card" style={{
        position: "relative", zIndex: 1,
        maxWidth: 420, width: "100%",
        padding: "32px 28px",
        borderRadius: 22,
      }}>
        {/* Close */}
        <button
          onClick={onDismiss}
          style={{
            position: "absolute", top: 16, right: 16,
            background: C.creamDark, border: "none", borderRadius: 8,
            width: 28, height: 28, display: "flex", alignItems: "center",
            justifyContent: "center", cursor: "pointer",
            fontSize: 14, color: C.inkFaint, fontFamily: "'DM Sans', sans-serif",
          }}
        >✕</button>

        {/* Icon */}
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: C.forest, display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: 24, marginBottom: 20,
        }}>📁</div>

        {/* Headline */}
        <h2 style={{
          fontFamily: "'Fraunces', serif", fontSize: 22, fontWeight: 700,
          color: C.ink, letterSpacing: "-0.3px", marginBottom: 8,
        }}>
          Stay organized and ready for tax time
        </h2>
        <p style={{ fontSize: 12, color: C.inkFaint, marginTop: -4, marginBottom: 12 }}>
          This file was built from your receipts — don't lose it
        </p>
        <p style={{ fontSize: 13, color: C.inkLight, lineHeight: 1.65, marginBottom: 22 }}>
          Your tax-ready file is already prepared — save your receipts and download it instantly.
        </p>

        {/* Features */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
          {features.map(f => (
            <div key={f.text} style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                background: "rgba(27,94,32,0.1)",
                display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15,
              }}>{f.icon}</div>
              <span style={{ fontSize: 13, color: C.ink, fontWeight: 500 }}>{f.text}</span>
            </div>
          ))}
        </div>

        {/* Price */}
        <div style={{
          background: C.creamDark, borderRadius: 12, padding: "12px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: 18,
        }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>One-time payment</div>
            <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 2 }}>No subscription · Keep forever</div>
          </div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 26, fontWeight: 700, color: C.forest }}>$12</div>
        </div>

        {/* CTA buttons */}
        <button
          className="pf-btn-primary"
          onClick={onUnlock}
          style={{ width: "100%", fontSize: 15, padding: "14px", marginBottom: 10 }}
        >
          Unlock and save →
        </button>
        <div style={{ marginTop: 7, fontSize: 11, color: C.inkFaint, textAlign: "center" }}>
          {PAYWALL_COPY_VARIANT === "A"
            ? "Takes 10 seconds · One-time payment"
            : "Takes 10 seconds · Pay once, keep forever"}
        </div>
        <button
          className="pf-btn-ghost"
          onClick={onDismiss}
          style={{ width: "100%", textAlign: "center" }}
        >
          Continue without saving
        </button>

        <div style={{ marginTop: 14, fontSize: 10, color: C.inkFaint, textAlign: "center" }}>
          PreFile is an organizational tool · Not tax advice · Always verify with your tax professional
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ORGANIZER SCREEN — UPDATED WITH PART 1 IMPROVEMENTS
// ═══════════════════════════════════════════════════════════════════════════════
function OrganizerScreen({ receipts, onAddAnother, isSaved, onExport, showSavedConfirm }) {
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
    n < 5   ? "You're building your tax-ready file — save and export everything at the end" :
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
              Most freelancers miss deductions like these — you're now tracking them correctly
            </p>
          )}
        </div>
        <button className="pf-btn-primary" onClick={onAddAnother} style={{ padding: "12px 22px", fontSize: 14 }}>
          + Add receipt
        </button>
      </div>

      {/* Soft momentum banner */}
      {momentumMsg && n >= 3 && (
        <div className="fade-in" style={{
          background: momentumBg, border: momentumBorder,
          borderRadius: 12, padding: "10px 16px", marginBottom: 20,
          display: "flex", alignItems: "center", gap: 10,
        }}>
          <span style={{ fontSize: 16 }}>{n >= 5 ? "🎯" : "📈"}</span>
          <span style={{ fontSize: 13, color: momentumColor, fontWeight: 600 }}>
            {momentumMsg}
          </span>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "1fr 288px", gap: 24, alignItems: "start" }}>

        {/* LEFT — Receipt list */}
        <div>
          <div className="pf-label" style={{ marginBottom: 12 }}>
            {n} receipt{n !== 1 ? "s" : ""} organized
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 24 }}>
            {receipts.map((r, i) => (
              <div key={r.id} className="receipt-row" style={{ animationDelay: `${i * 60}ms` }}>
                <MiniReceiptCard receipt={r} />
              </div>
            ))}
          </div>

          {n === 0 && (
            <div className="pf-card" style={{ padding: 32, textAlign: "center" }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
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
                Saved · Your file is now yours
              </span>
            </div>
          )}

          {/* EXPORT PREVIEW + DOWNLOAD */}
          {n > 0 && (
            <div className="pf-card fade-in" style={{ padding: 20, border: `1.5px solid ${C.creamDeep}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.ink, fontFamily: "'Fraunces', serif" }}>
                    Preview your tax-ready file
                  </div>
                  <div style={{ fontSize: 11, color: C.inkFaint, marginTop: 3 }}>
                    This is what your exported file will look like
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
                      <span style={{ fontSize: 12, color: C.inkLight, display: "flex", alignItems: "center", gap: 7 }}>
                        <span style={{ fontSize: 13 }}>{meta.icon}</span>{cat}
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
                {receipts.length > 0 && (
                  <p style={{ fontSize: 11, color: C.inkFaint, marginBottom: 8, textAlign: "center" }}>
                    This file is ready — unlock to download
                  </p>
                )}
                <button
                  className="pf-btn-primary"
                  onClick={onExport}
                  style={{ width: "100%", fontSize: 14, padding: "13px" }}
                >
                  {isSaved ? "⬇ Download my tax-ready file" : "🔒 Download my tax-ready file"}
                </button>
                <div style={{ marginTop: 8, fontSize: 11, color: C.inkFaint, textAlign: "center" }}>
                  {isSaved
                    ? "Your receipts are saved · Export ready"
                    : "Free to try · Pay only to save and export"
                  }
                </div>
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
                  <span style={{ fontSize: 14, flexShrink: 0 }}>{meta.icon}</span>
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
    icon: "🏠",
    title: "Home office deduction",
    desc: "If you work from a dedicated space at home, a portion of rent/mortgage and utilities may be deductible.",
    trigger: a => a.workFromHome,
    form: "Form 8829",
  },
  {
    id: "phone",
    icon: "📱",
    title: "Phone & internet — business portion",
    desc: "The percentage of your phone and internet bill used for work is deductible. Typically 30–70%.",
    trigger: a => a.usePhone,
    form: "Schedule C",
  },
  {
    id: "mileage",
    icon: "🚗",
    title: "Vehicle mileage",
    desc: "Every business mile is worth $0.67 in 2025. Most people forget to track this.",
    trigger: a => a.driveForWork,
    form: "Schedule C / Form 4562",
  },
  {
    id: "software",
    icon: "💻",
    title: "Software subscriptions",
    desc: "Any software used for your business — design tools, accounting apps, project managers — is fully deductible.",
    trigger: () => true,
    form: "Schedule C",
  },
  {
    id: "meals",
    icon: "🍽️",
    title: "Business meals",
    desc: "Meals with clients or for business purposes are 50% deductible. Keep the receipt and note who you met.",
    trigger: () => true,
    form: "Schedule C",
  },
  {
    id: "equipment",
    icon: "🔧",
    title: "Equipment purchases",
    desc: "Computers, cameras, office furniture, tools — anything bought for your business may be fully deductible in year one.",
    trigger: () => true,
    form: "Schedule C / Section 179",
  },
  {
    id: "startup",
    icon: "🚀",
    title: "Startup costs",
    desc: "If your business launched this year, up to $5,000 in startup expenses are deductible.",
    trigger: a => a.incomeType !== "w2only",
    form: "Schedule C",
  },
  {
    id: "selfemployed_health",
    icon: "🛡️",
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
        { label: "W-2 employee only", value: "w2only", icon: "💼" },
        { label: "Freelance / 1099 only", value: "1099only", icon: "🧾" },
        { label: "Both W-2 and freelance", value: "both", icon: "🔀" },
      ],
    },
    {
      key: "workFromHome",
      q: "Do you work from home?",
      sub: "A dedicated workspace — even a corner of a room — may qualify",
      options: [
        { label: "Yes, I have a home workspace", value: true, icon: "🏠" },
        { label: "No, I work outside the home", value: false, icon: "🏢" },
      ],
    },
    {
      key: "usePhone",
      q: "Do you use your phone or internet for work?",
      sub: "Business portion of your bill is deductible",
      options: [
        { label: "Yes, regularly", value: true, icon: "📱" },
        { label: "No, personal only", value: false, icon: "🚫" },
      ],
    },
    {
      key: "driveForWork",
      q: "Do you drive for work?",
      sub: "Client visits, errands, deliveries — every business mile counts",
      options: [
        { label: "Yes, I drive for work", value: true, icon: "🚗" },
        { label: "No, I don't drive for work", value: false, icon: "🚶" },
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
              <span style={{ fontSize: 26, flexShrink: 0 }}>{opt.icon}</span>
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
          <span style={{ fontSize: 13 }}>✅</span>
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
                {isChecked && <span style={{ color: C.white, fontSize: 12, fontWeight: 700 }}>✓</span>}
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
  // pages: home | receipt-flow | organizer | check
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
    if (!isSaved) {
      showToast("Your tax-ready file is already prepared — save to keep it");
      setTimeout(() => setShowPaywall(true), 500);
      return;
    }
    doExport();
  };

  const doExport = () => {
    // Build CSV
    const rows = [
      ["Merchant", "Amount", "Category", "Business %", "Business Amount"],
      ...receipts.map(r => {
        const pct = r.businessPct || 100;
        const bizAmt = ((parseFloat(r.amount) || 0) * pct / 100).toFixed(2);
        return [
          `"${r.merchant}"`,
          parseFloat(r.amount).toFixed(2),
          `"${r.category}"`,
          `${pct}%`,
          bizAmt,
        ];
      }),
      ["", "", "", "TOTAL",
        receipts.reduce((s, r) => s + ((parseFloat(r.amount)||0) * ((r.businessPct||100)/100)), 0).toFixed(2)
      ],
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href     = url;
    a.download = "PreFile_Tax_Organizer_2025.csv";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Tax-ready file downloaded ✓");
  };

  const handleUnlock = () => {
    setIsSaved(true);
    setShowPaywall(false);
    setShowSavedConfirm(true);
    setTimeout(() => setShowSavedConfirm(false), 2500);
    showToast("Receipts saved · Your file is ready");
    setTimeout(() => doExport(), 600);
  };

  const handlePaywallDismiss = () => setShowPaywall(false);

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
        onLogoClick={() => { setPage("home"); setReceiptStep("add"); setCheckStep("questions"); }}
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
          <OrganizerScreen receipts={receipts} onAddAnother={handleAddAnother} isSaved={isSaved} onExport={handleExport} showSavedConfirm={showSavedConfirm} />
        )}
        {page === "check" && renderCheckFlow()}
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
            <span style={{ fontSize: 16 }}>⚠️</span>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              Your receipts are not saved yet
            </span>
            <span style={{ fontSize: 12, color: "rgba(255,255,255,0.5)" }}>
              · They will be lost if you close this tab
            </span>
          </div>
          <button
            onClick={() => setShowPaywall(true)}
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
      {showPaywall && (
        <PaywallModal onUnlock={handleUnlock} onDismiss={handlePaywallDismiss} />
      )}
    </>
  );
}
