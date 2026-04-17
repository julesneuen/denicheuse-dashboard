import { useState, useEffect, useMemo, useRef } from "react";

const STORAGE_KEY = "denicheuse_popups_v3";
const CAL_KEY = "denicheuse_calendar_v1";

const fmt = n => "€" + Math.round(n).toLocaleString();
const totalFixed = e => (e.venueCost || 0) + (e.travelCost || 0) + (e.otherCost || 0);
const totalVariable = e => {
  const pct = parseFloat(e.variablePct) || 0;
  return ((e.revenue || 0) * pct) / 100;
};
const totalCost = e => totalFixed(e) + totalVariable(e) + (e.billsCost || 0);
const profit = e => (e.revenue || 0) - totalCost(e);

const EMPTY = { name: "", location: "", date: "", days: 1, venueCost: "", travelCost: "", otherCost: "", variablePct: "", revenue: "", notes: "", bills: [], billsCost: 0 };
const EMPTY_CAL = { name: "", location: "", dateStart: "", dateEnd: "", notes: "" };

const pink = "#e8445a";
const cream = "#f5f0e8";
const beige = "#ede8df";
const dark = "#1a1a1a";
const muted = "#7a7267";
const green = "#3a9e6f";
const amber = "#c97c2a";
const purple = "#7c5cbf";
const border = "1px solid rgba(26,26,26,0.12)";

const MONTHS = ["Janvier","Février","Mars","Avril","Mai","Juin","Juillet","Août","Septembre","Octobre","Novembre","Décembre"];
const DAYS_SHORT = ["Lun","Mar","Mer","Jeu","Ven","Sam","Dim"];

// localStorage helpers (replacing Claude artifact window.storage)
const storage = {
  get: (key) => ({ value: localStorage.getItem(key) }),
  set: (key, value) => localStorage.setItem(key, value),
};

async function analyzeImage(base64, mimeType) {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.warn("VITE_ANTHROPIC_API_KEY not set — bill analysis disabled.");
    return { amount: null, description: "clé API manquante" };
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "anthropic-dangerous-allow-browser": "true",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        max_tokens: 300,
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: mimeType, data: base64 } },
          { type: "text", text: `Extract the total amount from this receipt/bill. Return ONLY valid JSON: {"amount": 45.50, "description": "brief description"}. If unreadable: {"amount": null, "description": "unreadable"}. No markdown.` }
        ]}]
      })
    });
    const data = await res.json();
    const text = (data.content || []).find(b => b.type === "text")?.text || "{}";
    return JSON.parse(text.trim());
  } catch { return { amount: null, description: "erreur" }; }
}

function BillUploader({ bills, onChange }) {
  const [loading, setLoading] = useState(false);
  const ref = useRef();

  const handleFiles = async (files) => {
    if (!files.length) return;
    setLoading(true);
    const added = [];
    for (const file of Array.from(files)) {
      const base64 = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result.split(",")[1]); r.readAsDataURL(file); });
      const mime = file.type || "image/jpeg";
      const result = await analyzeImage(base64, mime);
      added.push({ id: Date.now() + Math.random(), preview: `data:${mime};base64,${base64}`, amount: result.amount, description: result.description || file.name, manual: "" });
    }
    onChange([...bills, ...added]);
    setLoading(false);
  };

  const update = (id, val) => onChange(bills.map(b => b.id === id ? { ...b, manual: val } : b));
  const remove = (id) => onChange(bills.filter(b => b.id !== id));
  const eff = b => b.manual !== "" ? parseFloat(b.manual) || 0 : b.amount || 0;

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, color: muted, marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.06em", fontFamily: "sans-serif" }}>Photos de factures (IA)</div>
      <div onClick={() => ref.current.click()} style={{ border: "2px dashed rgba(26,26,26,0.15)", borderRadius: 10, padding: 14, textAlign: "center", cursor: "pointer", background: "#fff", marginBottom: 8 }}>
        <input ref={ref} type="file" accept="image/*" multiple hidden onChange={e => handleFiles(e.target.files)} />
        <div style={{ fontSize: 13, color: muted, fontFamily: "sans-serif" }}>{loading ? "⏳ Analyse en cours…" : "📎 Cliquez pour ajouter des photos de factures"}</div>
      </div>
      {bills.map(b => (
        <div key={b.id} style={{ display: "flex", gap: 8, background: "#fff", borderRadius: 8, padding: 8, border, marginBottom: 6, alignItems: "flex-start" }}>
          <img src={b.preview} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 6, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 11, color: muted, marginBottom: 4, fontFamily: "sans-serif" }}>{b.description}</div>
            <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {b.amount !== null
                ? <span style={{ fontSize: 11, background: "#fce8eb", color: pink, borderRadius: 4, padding: "2px 6px", fontFamily: "sans-serif" }}>IA : €{b.amount?.toFixed(2)}</span>
                : <span style={{ fontSize: 11, background: beige, color: muted, borderRadius: 4, padding: "2px 6px", fontFamily: "sans-serif" }}>non détecté</span>}
              <input type="number" placeholder="Corriger €" value={b.manual} onChange={e => update(b.id, e.target.value)} style={{ width: 110, fontSize: 12, padding: "3px 7px", borderRadius: 6, border, background: cream, color: dark, fontFamily: "sans-serif" }} />
            </div>
            <div style={{ fontSize: 11, color: green, marginTop: 3, fontWeight: 600, fontFamily: "sans-serif" }}>Retenu : €{eff(b).toFixed(2)}</div>
          </div>
          <button onClick={() => remove(b.id)} style={{ background: "#fce8eb", border: "none", borderRadius: 6, color: pink, cursor: "pointer", padding: "3px 7px", fontSize: 12 }}>✕</button>
        </div>
      ))}
      {bills.length > 0 && <div style={{ fontSize: 13, color: amber, fontWeight: 600, marginTop: 2, fontFamily: "sans-serif" }}>Total factures : €{bills.reduce((s, b) => s + eff(b), 0).toFixed(2)}</div>}
    </div>
  );
}

function CalendarTab({ calEvents, onSave }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY_CAL);
  const [editId, setEditId] = useState(null);

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const openAdd = (dateStr) => { setForm({ ...EMPTY_CAL, dateStart: dateStr || "", dateEnd: dateStr || "" }); setEditId(null); setShowForm(true); };
  const openEdit = ev => { setForm({ ...ev }); setEditId(ev.id); setShowForm(true); };
  const del = id => onSave(calEvents.filter(e => e.id !== id));

  const submit = () => {
    if (!form.name || !form.dateStart) return alert("Nom et date de début requis.");
    const e = { ...form, id: editId || Date.now() };
    onSave(editId ? calEvents.map(ev => ev.id === editId ? e : ev) : [...calEvents, e]);
    setShowForm(false);
  };

  const yearEvents = calEvents.filter(e => e.dateStart?.startsWith(year));

  const months = Array.from({ length: 12 }, (_, mi) => {
    const firstDay = new Date(year, mi, 1);
    const daysInMonth = new Date(year, mi + 1, 0).getDate();
    let offset = firstDay.getDay() - 1;
    if (offset < 0) offset = 6;
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);
    const dateStr = (d) => `${year}-${String(mi + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const eventsOnDay = (d) => calEvents.filter(e => {
      const ds = e.dateStart; const de = e.dateEnd || e.dateStart;
      return ds <= dateStr(d) && dateStr(d) <= de;
    });
    return { mi, cells, offset, daysInMonth, dateStr, eventsOnDay };
  });

  const inputS = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(26,26,26,0.15)", background: "#fff", color: dark, fontSize: 14, boxSizing: "border-box", fontFamily: "sans-serif" };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <button onClick={() => setYear(y => y - 1)} style={{ background: "#fff", border, borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: dark, fontSize: 14 }}>‹</button>
        <span style={{ fontSize: 18, color: dark }}>{year}</span>
        <button onClick={() => setYear(y => y + 1)} style={{ background: "#fff", border, borderRadius: 8, padding: "6px 12px", cursor: "pointer", color: dark, fontSize: 14 }}>›</button>
        <button onClick={() => openAdd("")} style={{ marginLeft: "auto", background: purple, color: "#fff", border: "none", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "sans-serif" }}>+ Ajouter un potentiel</button>
      </div>

      {yearEvents.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontSize: 13, color: muted, fontFamily: "sans-serif", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Événements potentiels {year}</div>
          {yearEvents.sort((a, b) => a.dateStart > b.dateStart ? 1 : -1).map(e => (
            <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, background: "#fff", borderRadius: 10, padding: "10px 14px", border: `1px solid ${purple}22`, marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: purple, flexShrink: 0 }} />
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: dark }}>{e.name}</div>
                <div style={{ fontSize: 11, color: muted, fontFamily: "sans-serif" }}>
                  {e.dateStart}{e.dateEnd && e.dateEnd !== e.dateStart ? ` → ${e.dateEnd}` : ""}{e.location ? ` · ${e.location}` : ""}
                </div>
                {e.notes && <div style={{ fontSize: 11, color: muted, fontFamily: "sans-serif", fontStyle: "italic" }}>"{e.notes}"</div>}
              </div>
              <div style={{ display: "flex", gap: 4 }}>
                <button onClick={() => openEdit(e)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border, background: "transparent", cursor: "pointer", color: muted, fontFamily: "sans-serif" }}>Modifier</button>
                <button onClick={() => del(e.id)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "none", background: "#fce8eb", cursor: "pointer", color: pink, fontFamily: "sans-serif" }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
        {months.map(({ mi, cells, dateStr, eventsOnDay }) => (
          <div key={mi} style={{ background: "#fff", borderRadius: 12, padding: 14, border }}>
            <div style={{ fontSize: 13, color: dark, marginBottom: 10, fontFamily: "Georgia, serif" }}>{MONTHS[mi]}</div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, marginBottom: 4 }}>
              {DAYS_SHORT.map(d => <div key={d} style={{ fontSize: 9, color: muted, textAlign: "center", fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.04em" }}>{d}</div>)}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2 }}>
              {cells.map((d, i) => {
                if (!d) return <div key={`e${i}`} />;
                const evs = eventsOnDay(d);
                const isToday = d === today.getDate() && mi === today.getMonth() && year === today.getFullYear();
                return (
                  <div key={d} onClick={() => openAdd(dateStr(d))} title={evs.map(e => e.name).join(", ")} style={{ aspectRatio: "1", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, borderRadius: 6, cursor: "pointer", position: "relative", background: evs.length ? `${purple}18` : isToday ? `${pink}15` : "transparent", color: isToday ? pink : dark, fontWeight: isToday ? 700 : 400, fontFamily: "sans-serif", border: evs.length ? `1px solid ${purple}44` : "1px solid transparent" }}>
                    {d}
                    {evs.length > 0 && <div style={{ position: "absolute", bottom: 2, left: "50%", transform: "translateX(-50%)", width: 4, height: 4, borderRadius: "50%", background: purple }} />}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 }}>
          <div style={{ background: cream, borderRadius: 14, padding: 22, width: "100%", maxWidth: 420 }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 400, color: dark, fontFamily: "Georgia, serif" }}>{editId ? "Modifier" : "Ajouter"} un événement potentiel</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {[["name","Nom de l'événement","text"],["location","Lieu","text"],["dateStart","Date de début","date"],["dateEnd","Date de fin","date"]].map(([k, l, t]) => (
                <div key={k}>
                  <label style={{ fontSize: 11, color: muted, display: "block", marginBottom: 3, fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>{l}</label>
                  <input type={t} value={form[k]} onChange={e => f(k, e.target.value)} style={inputS} />
                </div>
              ))}
              <div>
                <label style={{ fontSize: 11, color: muted, display: "block", marginBottom: 3, fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>Notes</label>
                <textarea value={form.notes} onChange={e => f("notes", e.target.value)} rows={2} style={{ ...inputS, resize: "vertical" }} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => setShowForm(false)} style={{ padding: "9px 16px", borderRadius: 8, border, background: "#fff", cursor: "pointer", color: muted, fontSize: 13, fontFamily: "sans-serif" }}>Annuler</button>
              <button onClick={submit} style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: purple, color: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "sans-serif", fontWeight: 600 }}>{editId ? "Enregistrer" : "Ajouter"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  const [events, setEvents] = useState([]);
  const [calEvents, setCalEvents] = useState([]);
  const [tab, setTab] = useState("overview");
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [filterYear, setFilterYear] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [editId, setEditId] = useState(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const r = storage.get(STORAGE_KEY);
      setEvents(r?.value ? JSON.parse(r.value) : []);
    } catch { setEvents([]); }
    try {
      const r = storage.get(CAL_KEY);
      setCalEvents(r?.value ? JSON.parse(r.value) : []);
    } catch { setCalEvents([]); }
    setLoaded(true);
  }, []);

  const save = data => { setEvents(data); try { storage.set(STORAGE_KEY, JSON.stringify(data)); } catch {} };
  const saveCal = data => { setCalEvents(data); try { storage.set(CAL_KEY, JSON.stringify(data)); } catch {} };

  const years = useMemo(() => [...new Set(events.map(e => e.date?.slice(0, 4)).filter(Boolean))].sort(), [events]);
  const filtered = useMemo(() => {
    const list = filterYear === "all" ? [...events] : events.filter(e => e.date?.startsWith(filterYear));
    const fns = { date: e => e.date || "", revenue: e => e.revenue || 0, profit: e => profit(e), cost: e => totalCost(e) };
    const fn = fns[sortBy] || (e => e[sortBy] || "");
    return list.sort((a, b) => sortDir === "asc" ? (fn(a) > fn(b) ? 1 : -1) : (fn(a) < fn(b) ? 1 : -1));
  }, [events, filterYear, sortBy, sortDir]);

  const stats = useMemo(() => {
    let totalRevenue = 0, totalCostSum = 0, totalProfit = 0;
    filtered.forEach(e => { totalRevenue += e.revenue || 0; totalCostSum += totalCost(e); totalProfit += profit(e); });
    return { totalRevenue, totalCost: totalCostSum, totalProfit, count: filtered.length };
  }, [filtered]);

  const billsEff = (bills = []) => bills.reduce((s, b) => s + (b.manual !== "" ? parseFloat(b.manual) || 0 : b.amount || 0), 0);

  const f = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const openAdd = () => { setForm(EMPTY); setEditId(null); setShowForm(true); };
  const openEdit = e => { setForm({ ...e, bills: e.bills || [] }); setEditId(e.id); setShowForm(true); };
  const del = id => { if (window.confirm("Supprimer cet événement ?")) save(events.filter(e => e.id !== id)); };

  const submit = () => {
    if (!form.name || !form.date) return alert("Nom et date requis.");
    const bills = form.bills || [];
    const bc = billsEff(bills);
    const e = { ...form, id: editId || Date.now(), days: +form.days || 1, venueCost: +form.venueCost || 0, travelCost: +form.travelCost || 0, otherCost: +form.otherCost || 0, variablePct: +form.variablePct || 0, revenue: +form.revenue || 0, bills, billsCost: bc };
    save(editId ? events.map(ev => ev.id === editId ? e : ev) : [...events, e]);
    setShowForm(false);
  };

  const toggleSort = col => { if (sortBy === col) setSortDir(d => d === "asc" ? "desc" : "asc"); else { setSortBy(col); setSortDir("desc"); } };

  const previewRevenue = +form.revenue || 0;
  const previewFixed = (+form.venueCost || 0) + (+form.travelCost || 0) + (+form.otherCost || 0) + billsEff(form.bills || []);
  const previewVariable = (previewRevenue * (+form.variablePct || 0)) / 100;
  const previewCost = previewFixed + previewVariable;
  const previewProfit = previewRevenue - previewCost;

  const inputS = { width: "100%", padding: "8px 10px", borderRadius: 8, border: "1px solid rgba(26,26,26,0.15)", background: "#fff", color: dark, fontSize: 14, boxSizing: "border-box", fontFamily: "sans-serif" };
  const lbl = (t) => <label style={{ fontSize: 11, color: muted, display: "block", marginBottom: 3, fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.05em" }}>{t}</label>;

  if (!loaded) return <div style={{ padding: 32, color: muted, fontFamily: "sans-serif" }}>Chargement…</div>;

  return (
    <div style={{ background: cream, minHeight: "100vh", paddingBottom: 40, fontFamily: "Georgia, serif" }}>
      <div style={{ background: pink, padding: "12px 20px", color: "#fff", fontSize: 12, letterSpacing: "0.1em", fontFamily: "sans-serif" }}>★ POPUP DENICHEUSE ★</div>

      <div style={{ padding: "20px 18px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 20, flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ fontSize: 24, color: dark }}>denicheuse<span style={{ color: pink }}>.com</span></div>
            <div style={{ fontSize: 12, color: muted, fontFamily: "sans-serif", marginTop: 2 }}>pop-up stores · tableau de bord</div>
          </div>
          <button onClick={openAdd} style={{ background: pink, color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontSize: 13, cursor: "pointer", fontFamily: "sans-serif" }}>+ Ajouter un événement</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8, marginBottom: 18 }}>
          {[
            ["Événements", stats.count, dark],
            ["Chiffre d'affaires", fmt(stats.totalRevenue), dark],
            ["Coûts totaux", fmt(stats.totalCost), amber],
            ["Bénéfice", fmt(stats.totalProfit), stats.totalProfit >= 0 ? green : pink],
          ].map(([label, value, color]) => (
            <div key={label} style={{ background: "#fff", borderRadius: 12, padding: "13px 15px", border }}>
              <div style={{ fontSize: 10, color: muted, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.07em", fontFamily: "sans-serif" }}>{label}</div>
              <div style={{ fontSize: 20, color }}>{value}</div>
            </div>
          ))}
        </div>

        {years.length > 0 && (
          <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" }}>
            {["all", ...years].map(y => (
              <button key={y} onClick={() => setFilterYear(y)} style={{ padding: "4px 12px", borderRadius: 20, fontSize: 12, cursor: "pointer", fontFamily: "sans-serif", border: `1px solid ${filterYear === y ? pink : "rgba(26,26,26,0.15)"}`, background: filterYear === y ? pink : "#fff", color: filterYear === y ? "#fff" : muted }}>
                {y === "all" ? "Toutes les années" : y}
              </button>
            ))}
          </div>
        )}

        <div style={{ display: "flex", borderBottom: "2px solid rgba(26,26,26,0.1)", marginBottom: 20, flexWrap: "wrap" }}>
          {[["overview","Vue d'ensemble"],["table","Événements"],["compare","Comparer"],["calendar","📅 Calendrier"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ background: "none", border: "none", borderBottom: tab === k ? `2px solid ${k === "calendar" ? purple : pink}` : "2px solid transparent", padding: "8px 14px", cursor: "pointer", fontSize: 13, color: tab === k ? (k === "calendar" ? purple : pink) : muted, marginBottom: -2, fontFamily: "Georgia, serif" }}>{l}</button>
          ))}
        </div>

        {events.length === 0 && tab !== "calendar" && (
          <div style={{ textAlign: "center", padding: "60px 20px", color: muted, fontFamily: "sans-serif" }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>★</div>
            <div style={{ marginBottom: 16, fontSize: 15 }}>Aucun événement pour l'instant.</div>
            <button onClick={openAdd} style={{ background: pink, color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", cursor: "pointer", fontSize: 14, fontFamily: "sans-serif" }}>Ajouter votre premier pop-up</button>
          </div>
        )}

        {tab === "overview" && events.length > 0 && (() => {
          const map = {};
          filtered.forEach(e => {
            if (!map[e.name]) map[e.name] = { name: e.name, revenue: 0, cost: 0, profit: 0, count: 0 };
            map[e.name].revenue += e.revenue || 0;
            map[e.name].cost += totalCost(e);
            map[e.name].profit += profit(e);
            map[e.name].count++;
          });
          const chart = Object.values(map).sort((a, b) => b.profit - a.profit);
          const maxV = Math.max(...chart.map(d => d.revenue), 1);
          const ranked = [...filtered].sort((a, b) => profit(b) - profit(a));
          return (
            <div>
              {chart.map(d => (
                <div key={d.name} style={{ background: "#fff", borderRadius: 12, padding: 14, border, marginBottom: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <span style={{ fontSize: 14, color: dark }}>{d.name} <span style={{ fontSize: 11, color: muted, fontFamily: "sans-serif" }}>({d.count}×)</span></span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: d.profit >= 0 ? green : pink, fontFamily: "sans-serif" }}>{fmt(d.profit)}</span>
                  </div>
                  {[["CA", d.revenue, dark], ["Coûts", d.cost, amber]].map(([l, v, c]) => (
                    <div key={l} style={{ marginBottom: 6 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: muted, fontFamily: "sans-serif", marginBottom: 2 }}><span>{l}</span><span>{fmt(v)}</span></div>
                      <div style={{ background: beige, borderRadius: 4, height: 7 }}><div style={{ height: 7, width: (v / maxV * 100) + "%", background: c, borderRadius: 4 }} /></div>
                    </div>
                  ))}
                </div>
              ))}
              <div style={{ fontSize: 15, color: dark, margin: "20px 0 12px" }}>Classement — du meilleur au moins bon</div>
              {ranked.map((e, i) => {
                const p = profit(e);
                const isTop = i === 0, isLast = i === ranked.length - 1 && ranked.length > 1;
                const rankColor = i === 0 ? "#c9960a" : i === 1 ? "#888" : i === 2 ? "#a0633a" : muted;
                return (
                  <div key={e.id} style={{ display: "flex", alignItems: "center", gap: 10, background: isTop ? "#fffbea" : isLast ? "#fff5f6" : "#fff", borderRadius: 12, padding: "12px 14px", border: `1px solid ${isTop ? "#f5d87a" : isLast ? "#fcd0d6" : "rgba(26,26,26,0.1)"}`, marginBottom: 8 }}>
                    <div style={{ width: 28, height: 28, borderRadius: "50%", background: rankColor, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontFamily: "sans-serif", fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, color: dark, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {e.name}
                        {isTop && <span style={{ fontSize: 10, background: "#fef3c7", color: "#92400e", borderRadius: 4, padding: "1px 6px", fontFamily: "sans-serif" }}>meilleur</span>}
                        {isLast && <span style={{ fontSize: 10, background: "#fce8eb", color: pink, borderRadius: 4, padding: "1px 6px", fontFamily: "sans-serif" }}>à améliorer</span>}
                      </div>
                      <div style={{ fontSize: 11, color: muted, fontFamily: "sans-serif" }}>{e.location} · {e.date?.slice(0, 4)} · {e.days}j</div>
                      {e.notes && <div style={{ fontSize: 11, color: muted, fontFamily: "sans-serif", fontStyle: "italic" }}>"{e.notes}"</div>}
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ color: p >= 0 ? green : pink, fontFamily: "sans-serif", fontWeight: 700, fontSize: 15 }}>{fmt(p)}</div>
                      <div style={{ fontSize: 11, color: muted, fontFamily: "sans-serif" }}>{fmt(e.revenue || 0)} CA</div>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}

        {tab === "table" && events.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, background: "#fff", borderRadius: 12, overflow: "hidden", border }}>
              <thead>
                <tr style={{ background: beige }}>
                  {[["name","Événement"],["date","Date"],["revenue","CA"],["cost","Coûts"],["profit","Bénéfice"]].map(([col, label]) => (
                    <th key={col} onClick={() => toggleSort(col)} style={{ padding: "9px 11px", textAlign: "left", fontSize: 10, color: sortBy === col ? pink : muted, fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.06em", cursor: "pointer", borderBottom: "2px solid rgba(26,26,26,0.1)", whiteSpace: "nowrap", userSelect: "none" }}>
                      {label}{sortBy === col ? (sortDir === "desc" ? " ↓" : " ↑") : ""}
                    </th>
                  ))}
                  <th style={{ padding: "9px 11px", borderBottom: "2px solid rgba(26,26,26,0.1)" }}></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e, idx) => {
                  const p = profit(e);
                  return (
                    <tr key={e.id} style={{ borderBottom: "1px solid rgba(26,26,26,0.07)", background: idx % 2 === 0 ? "#fff" : cream }}>
                      <td style={{ padding: "10px 11px" }}>
                        <div style={{ color: dark, fontSize: 13 }}>{e.name}</div>
                        <div style={{ fontSize: 10, color: muted, fontFamily: "sans-serif" }}>{e.location} · {e.days}j{e.bills?.length ? ` · ${e.bills.length} facture(s)` : ""}</div>
                      </td>
                      <td style={{ padding: "10px 11px", color: muted, fontFamily: "sans-serif", fontSize: 12 }}>{e.date}</td>
                      <td style={{ padding: "10px 11px", fontFamily: "sans-serif", color: dark, fontWeight: 600 }}>{fmt(e.revenue || 0)}</td>
                      <td style={{ padding: "10px 11px", fontFamily: "sans-serif", color: amber }}>
                        <div>{fmt(totalCost(e))}</div>
                        {e.variablePct > 0 && <div style={{ fontSize: 10, color: muted }}>dont {e.variablePct}% variable</div>}
                      </td>
                      <td style={{ padding: "10px 11px", fontFamily: "sans-serif", fontWeight: 600, color: p >= 0 ? green : pink }}>{fmt(p)}</td>
                      <td style={{ padding: "10px 11px" }}>
                        <div style={{ display: "flex", gap: 4 }}>
                          <button onClick={() => openEdit(e)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border, background: "transparent", cursor: "pointer", color: muted, fontFamily: "sans-serif" }}>Modifier</button>
                          <button onClick={() => del(e.id)} style={{ fontSize: 11, padding: "3px 8px", borderRadius: 6, border: "none", background: "#fce8eb", cursor: "pointer", color: pink, fontFamily: "sans-serif" }}>✕</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === "compare" && events.length > 0 && (() => {
          const byName = {};
          events.forEach(e => { const y = e.date?.slice(0, 4); if (y) { if (!byName[e.name]) byName[e.name] = {}; byName[e.name][y] = e; } });
          const recurring = Object.entries(byName).filter(([, ym]) => Object.keys(ym).length > 1);
          if (!recurring.length) return <p style={{ color: muted, fontFamily: "sans-serif", fontSize: 13 }}>Pas encore assez d'événements récurrents.</p>;
          return recurring.map(([name, ym]) => {
            const ys = Object.keys(ym).sort();
            return (
              <div key={name} style={{ background: "#fff", borderRadius: 12, padding: 16, border, marginBottom: 16 }}>
                <div style={{ fontSize: 15, color: dark, marginBottom: 12 }}>★ {name}</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {ys.map((y, i) => {
                    const e = ym[y]; const p = profit(e);
                    const delta = i > 0 ? p - profit(ym[ys[i - 1]]) : null;
                    return (
                      <div key={y} style={{ flex: 1, minWidth: 110, background: cream, borderRadius: 8, padding: "10px 12px", border }}>
                        <div style={{ fontSize: 10, color: muted, fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 3 }}>{y}</div>
                        <div style={{ fontSize: 18, color: green }}>{fmt(p)}</div>
                        <div style={{ fontSize: 10, color: muted, fontFamily: "sans-serif", marginTop: 2 }}>{fmt(e.revenue || 0)} CA · {fmt(totalCost(e))} coûts</div>
                        {delta !== null && <div style={{ fontSize: 11, marginTop: 4, color: delta >= 0 ? green : pink, fontFamily: "sans-serif" }}>{delta >= 0 ? "▲" : "▼"} {fmt(Math.abs(delta))} vs {ys[i - 1]}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          });
        })()}

        {tab === "calendar" && <CalendarTab calEvents={calEvents} onSave={saveCal} />}
      </div>

      {showForm && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 999, padding: 16 }}>
          <div style={{ background: cream, borderRadius: 14, padding: 22, width: "100%", maxWidth: 480, maxHeight: "88vh", overflowY: "auto" }}>
            <h2 style={{ margin: "0 0 16px", fontSize: 17, fontWeight: 400, color: dark }}>{editId ? "Modifier" : "Nouveau pop-up"}</h2>
            <div style={{ display: "grid", gap: 10 }}>
              {[["name","Nom de l'événement","text"],["location","Lieu","text"],["date","Date","date"],["days","Durée (jours)","number"]].map(([k, l, t]) => (
                <div key={k}>{lbl(l)}<input type={t} value={form[k]} onChange={e => f(k, e.target.value)} style={inputS} /></div>
              ))}

              <div style={{ borderTop: "1px solid rgba(26,26,26,0.1)", paddingTop: 10 }}>
                <div style={{ fontSize: 11, color: pink, fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8, fontWeight: 600 }}>Revenus</div>
                {lbl("Chiffre d'affaires (€)")}
                <input type="number" value={form.revenue} onChange={e => f("revenue", e.target.value)} placeholder="Total des ventes" style={inputS} />
              </div>

              <div style={{ borderTop: "1px solid rgba(26,26,26,0.1)", paddingTop: 10 }}>
                <div style={{ fontSize: 11, color: amber, fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontWeight: 600 }}>Coûts fixes</div>
                <div style={{ fontSize: 11, color: muted, fontFamily: "sans-serif", marginBottom: 10 }}>Montants définis à l'avance, indépendants des ventes</div>
                {[["venueCost","Stand / location (€)"],["travelCost","Déplacements (€)"],["otherCost","Autres coûts fixes (€)"]].map(([k, l]) => (
                  <div key={k} style={{ marginBottom: 8 }}>{lbl(l)}<input type="number" value={form[k]} onChange={e => f(k, e.target.value)} style={inputS} /></div>
                ))}
              </div>

              <div style={{ borderTop: "1px solid rgba(26,26,26,0.1)", paddingTop: 10 }}>
                <div style={{ fontSize: 11, color: amber, fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontWeight: 600 }}>Coûts variables</div>
                <div style={{ fontSize: 11, color: muted, fontFamily: "sans-serif", marginBottom: 10 }}>Pourcentage prélevé sur votre chiffre d'affaires (ex: commission organisateur)</div>
                {lbl("% du chiffre d'affaires")}
                <input type="number" value={form.variablePct} onChange={e => f("variablePct", e.target.value)} placeholder="ex: 30" min="0" max="100" style={inputS} />
                {form.variablePct > 0 && form.revenue > 0 && (
                  <div style={{ fontSize: 12, color: amber, marginTop: 5, fontFamily: "sans-serif" }}>
                    = €{((+form.revenue * +form.variablePct) / 100).toFixed(2)} sur ce CA
                  </div>
                )}
              </div>

              <div>{lbl("Notes")}<textarea value={form.notes} onChange={e => f("notes", e.target.value)} rows={2} style={{ ...inputS, resize: "vertical" }} /></div>

              <div style={{ borderTop: "1px solid rgba(26,26,26,0.1)", paddingTop: 10 }}>
                <div style={{ fontSize: 11, color: muted, fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4, fontWeight: 600 }}>Factures & justificatifs</div>
                <div style={{ fontSize: 11, color: muted, fontFamily: "sans-serif", marginBottom: 10 }}>Joignez toutes vos factures liées à cet événement — l'IA détecte les montants automatiquement</div>
                <BillUploader bills={form.bills || []} onChange={v => f("bills", v)} />
              </div>

              <div style={{ background: "#fff", borderRadius: 10, padding: "12px 14px", border }}>
                <div style={{ fontSize: 10, color: muted, fontFamily: "sans-serif", textTransform: "uppercase", letterSpacing: "0.07em", marginBottom: 8 }}>Aperçu</div>
                <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 6 }}>
                  {[["CA", fmt(previewRevenue), dark],["Coûts fixes", fmt(previewFixed), amber],["Coûts variables", fmt(previewVariable), amber],["Bénéfice", fmt(previewProfit), previewProfit >= 0 ? green : pink]].map(([l, v, c]) => (
                    <div key={l}><div style={{ fontSize: 10, color: muted, fontFamily: "sans-serif" }}>{l}</div><div style={{ fontSize: 15, color: c }}>{v}</div></div>
                  ))}
                </div>
                <div style={{ borderTop: "1px solid rgba(26,26,26,0.08)", paddingTop: 6, fontSize: 12, color: muted, fontFamily: "sans-serif" }}>
                  Total coûts : {fmt(previewCost)}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
              <button onClick={() => setShowForm(false)} style={{ padding: "9px 16px", borderRadius: 8, border, background: "#fff", cursor: "pointer", color: muted, fontSize: 13, fontFamily: "sans-serif" }}>Annuler</button>
              <button onClick={submit} style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: pink, color: "#fff", cursor: "pointer", fontSize: 13, fontFamily: "sans-serif", fontWeight: 600 }}>{editId ? "Enregistrer" : "Ajouter"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
