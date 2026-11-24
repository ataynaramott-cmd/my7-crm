{
/* ================= CONFIG ================= */
const SB_URL = "https://c--742e4128-e066-4310-b34c-9afa77cd1aac-prod.lovable.cloud";
const SB_KEY = "sb_publishable_mPlY7UIO58pkvCrlMpX3-Q_uPEVzP1e";
const TZ = "America/Sao_Paulo";
const H = 3600e3, D = 86400e3;

const sbFetch = (input, init = {}) => {
  const h = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
  if (h.get("Authorization") === `Bearer ${SB_KEY}`) h.delete("Authorization");
  h.set("apikey", SB_KEY);
  return fetch(input, { ...init, headers: h });
};
const sb = supabase.createClient(SB_URL, SB_KEY, {
  global: { fetch: sbFetch },
  auth: { persistSession: true, autoRefreshToken: true, storageKey: "my7crm-auth" },
});
const AV = window.MY7Avatar;

/* ================= DOMÍNIO ================= */
const STATUS = [
  ["novo", "Novo"], ["em_contato", "Em contato"], ["reuniao", "Reunião agendada"],
  ["proposta", "Proposta enviada"], ["fechado", "Fechado"], ["perdido", "Perdido"],
];
const STATUS_ALL = [...STATUS, ["lista_fria", "Lista fria"]];
const stLabel = (s) => (STATUS_ALL.find((x) => x[0] === s) || [s, s])[1];
const TIPOS = {
  ligacao: { lb: "Ligação", ic: "📞", res: [["atendeu", "Atendeu"], ["nao_atendeu", "Não atendeu"], ["caixa_postal", "Caixa postal"], ["numero_errado", "Número errado"]] },
  whatsapp: { lb: "WhatsApp", ic: "💬", res: [["enviada", "Mensagem enviada"], ["visualizada_sem_resposta", "Visualizou e não respondeu"]] },
  resposta_lead: { lb: "Lead respondeu", ic: "✅", res: [["interessado", "Interessado"], ["pediu_mais_info", "Pediu mais informações"], ["pediu_retorno_depois", "Pediu retorno depois"], ["sem_interesse", "Sem interesse"]] },
  reuniao_agendada: { lb: "Reunião agendada", ic: "📅", res: [] },
  email: { lb: "E-mail", ic: "✉️", res: [] },
  nota: { lb: "Nota", ic: "📝", res: [] },
};
const resLabel = (t, r) => ((TIPOS[t] && TIPOS[t].res.find((x) => x[0] === r)) || [r, r || ""])[1];
const CAD = {
  1: [["ligacao", "Ligação"], ["whatsapp", "WhatsApp de apresentação"]],
  2: [["whatsapp", "WhatsApp de follow-up"]],
  3: [["ligacao", "Ligação"], ["whatsapp", "WhatsApp"]],
  4: [["whatsapp", "WhatsApp com case/conteúdo"]],
  5: [["ligacao", "Ligação"], ["whatsapp", "WhatsApp de última tentativa"]],
};
const CLASSE_TXT = { A: "Prioridade máxima", B: "Boa oportunidade", C: "Nutrir", D: "Baixa prioridade" };

/* ================= ESTADO ================= */
const S = {
  session: null, me: null, profile: null, role: null, active: false,
  leads: [], atv: [], profiles: [], team: [],
  period: "7d", view: "painel", drawer: null, known: new Set(), loaded: false,
  filters: { q: "", classe: "", status: "", comp: "", resp: "", sort: "recentes" },
  boardMine: false, boardClasse: "", unseen: 0,
  alerts: (() => { try { return localStorage.getItem("my7crm-alerts") === "1"; } catch { return false; } })(),
};

/* ================= UTIL ================= */
const $ = (s, r = document) => r.querySelector(s);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const ts = (d) => (d ? new Date(d).getTime() : 0);
const first = (n) => String(n || "").trim().split(/\s+/)[0] || "";
function dur(ms) {
  if (ms < 0) ms = 0;
  const m = Math.floor(ms / 60000);
  if (m < 1) return "agora";
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h${m % 60 ? " " + (m % 60) + "min" : ""}`;
  const d = Math.floor(h / 24);
  return `${d}d${h % 24 ? " " + (h % 24) + "h" : ""}`;
}
const fmt = (d) => (d ? new Date(d).toLocaleString("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");
const spHour = () => Number(new Intl.DateTimeFormat("pt-BR", { hour: "numeric", hour12: false, timeZone: TZ }).format(new Date())) % 24;
function greeting() { const h = spHour(); return h >= 5 && h < 12 ? "Bom dia" : h >= 12 && h < 18 ? "Boa tarde" : "Boa noite"; }
function startOfDaySP(t = Date.now()) { const sp = new Date(t - 3 * H); return Date.UTC(sp.getUTCFullYear(), sp.getUTCMonth(), sp.getUTCDate()) + 3 * H; }
function periodStart(p = S.period) { const s = startOfDaySP(); return p === "hoje" ? s : p === "7d" ? s - 6 * D : p === "30d" ? s - 29 * D : 0; }
const PERIODS = [["hoje", "Hoje"], ["7d", "7 dias"], ["30d", "30 dias"], ["tudo", "Tudo"]];
const isAdmin = () => S.role === "admin";
const prof = (id) => S.profiles.find((p) => p.id === id);
const profName = (id) => (prof(id) && prof(id).nome) || "—";
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
const waLink = (num, text) => `https://wa.me/${encodeURIComponent(String(num || "").replace(/\D/g, ""))}${text ? "?text=" + encodeURIComponent(text) : ""}`;
const phoneFmt = (w) => { const d = String(w || "").replace(/^55/, ""); return d.length >= 10 ? `(${d.slice(0, 2)}) ${d.slice(2, d.length - 4)}-${d.slice(-4)}` : w; };
const clBadge = (l) => `<span class="cl ${esc(l.classe || "D")}" title="${esc(CLASSE_TXT[l.classe] || "")}">${esc(l.classe || "D")} · ${Number(l.score) || 0}</span>`;

function toast(title, body) {
  const t = document.createElement("div");
  t.className = "toast";
  const b = document.createElement("b"); b.textContent = title; t.appendChild(b);
  if (body) { const s = document.createElement("span"); s.className = "small muted"; s.textContent = body; t.appendChild(s); }
  $("#toasts").appendChild(t);
  setTimeout(() => t.remove(), 7000);
}
let actx = null;
function beep() {
  if (!S.alerts) return;
  try {
    actx = actx || new (window.AudioContext || window.webkitAudioContext)();
    const notes = [880, 1175];
    notes.forEach((f, i) => {
      const o = actx.createOscillator(), g = actx.createGain();
      o.frequency.value = f; o.type = "sine"; o.connect(g); g.connect(actx.destination);
      const t0 = actx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.25, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.15);
      o.start(t0); o.stop(t0 + 0.16);
    });
  } catch {}
}
function notify(title, body) {
  toast(title, body); beep();
  S.unseen++; updateTitle();
  try { if (S.alerts && "Notification" in window && Notification.permission === "granted" && document.hidden) new Notification(title, { body }); } catch {}
}
function updateTitle() { document.title = (S.unseen ? `(${S.unseen}) ` : "") + "MY7. CRM"; }
document.addEventListener("visibilitychange", () => { if (!document.hidden) { S.unseen = 0; updateTitle(); } });

/* ================= LÓGICA DE LEAD ================= */
const atvOf = (id) => S.atv.filter((a) => a.lead_id === id);
const cadBase = (l) => Math.max(ts(l.created_at), ts(l.reativado_em));
const cadDay = (l) => Math.floor((Date.now() - cadBase(l)) / D) + 1;
function hadContact(l, acts = atvOf(l.id)) { return acts.some((a) => a.tipo === "resposta_lead" || (a.tipo === "ligacao" && a.resultado === "atendeu")); }
function cadActive(l, acts) { return ["novo", "em_contato"].includes(l.status) && !hadContact(l, acts); }
function cadDone(l, acts, day, tipo) { const b = cadBase(l); return acts.some((a) => a.dia_cadencia === day && a.tipo === tipo && ts(a.created_at) >= b - 60e3); }
function cadToday(l) {
  const acts = atvOf(l.id);
  if (!cadActive(l, acts)) return null;
  const d = cadDay(l);
  if (d > 5) return null;
  const pend = CAD[d].filter(([t]) => !cadDone(l, acts, d, t));
  return { d, pend };
}
const isLate = (l) => l.status === "novo" && !l.primeiro_contato_em && Date.now() - ts(l.created_at) > 15 * 60e3;
const counts = (acts) => ({ lig: acts.filter((a) => a.tipo === "ligacao").length, wpp: acts.filter((a) => a.tipo === "whatsapp").length, tot: acts.filter((a) => a.tipo !== "nota").length });
const classRank = { A: 0, B: 1, C: 2, D: 3 };

/* ================= DADOS ================= */
async function loadAll(silent) {
  const qs = [
    sb.from("leads").select("*").order("created_at", { ascending: false }).limit(3000),
    sb.from("atividades").select("*").order("created_at", { ascending: false }).limit(10000),
    sb.from("profiles").select("id,nome,avatar,ativo,email"),
  ];
  if (isAdmin()) qs.push(sb.rpc("listar_equipe"));
  const [l, a, p, t] = await Promise.all(qs);
  if (l.error) { if (!silent) toast("Não consegui carregar os leads", l.error.message); return; }
  const newOnes = S.loaded ? (l.data || []).filter((x) => !S.known.has(x.id)) : [];
  S.leads = l.data || []; S.atv = (a && a.data) || []; S.profiles = (p && p.data) || [];
  if (t && !t.error) S.team = t.data || [];
  S.leads.forEach((x) => S.known.add(x.id));
  newOnes.forEach((x) => notify(`🔔 Novo lead: ${x.nome}`, `Classe ${x.classe} · ${x.segmento || "respondendo o quiz…"}`));
  S.loaded = true;
  render();
}

let rtChannel = null;
function subscribe() {
  if (rtChannel) sb.removeChannel(rtChannel);
  rtChannel = sb.channel("my7crm")
    .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (pl) => {
      if (pl.eventType === "DELETE") { S.leads = S.leads.filter((x) => x.id !== (pl.old && pl.old.id)); render(); return; }
      const n = pl.new; if (!n || !n.id) return;
      const old = S.leads.find((x) => x.id === n.id);
      if (!old) {
        S.leads.unshift(n); S.known.add(n.id);
        notify(`🔔 Novo lead: ${n.nome}`, `Classe ${n.classe} · ${n.completo ? "quiz completo" : "ainda respondendo o quiz…"}`);
      } else {
        if (!old.completo && n.completo) notify(`✅ ${n.nome} completou o quiz`, `Classe ${n.classe} · score ${n.score} · ${n.faturamento || ""}`);
        Object.assign(old, n);
      }
      render();
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "atividades" }, (pl) => {
      if (pl.new && !S.atv.some((a) => a.id === pl.new.id)) { S.atv.unshift(pl.new); render(); }
    })
    .subscribe();
}

/* ================= AUTH ================= */
async function boot() {
  const { data } = await sb.auth.getSession();
  S.session = data.session;
  sb.auth.onAuthStateChange((ev, session) => {
    const changed = (session && session.user && session.user.id) !== (S.session && S.session.user && S.session.user.id);
    S.session = session;
    if (changed) start();
  });
  start();
}
async function start() {
  if (!S.session) { renderAuth(); return; }
  S.me = S.session.user;
  const [pr, ro] = await Promise.all([
    sb.from("profiles").select("*").eq("id", S.me.id).maybeSingle(),
    sb.from("user_roles").select("role").eq("user_id", S.me.id),
  ]);
  S.profile = pr.data || { id: S.me.id, nome: (S.me.user_metadata && S.me.user_metadata.nome) || first(S.me.email), ativo: true };
  const roles = (ro.data || []).map((r) => r.role);
  S.role = roles.includes("admin") ? "admin" : roles.includes("sdr") ? "sdr" : null;
  S.active = S.role === "admin" || (S.role === "sdr" && S.profile.ativo !== false);
  if (!S.active) { renderPending(); return; }
  S.loaded = false; S.known = new Set();
  sb.rpc("mover_para_lista_fria").then(() => {}, () => {});
  window.onhashchange = route; route(true);
  await loadAll();
  subscribe();
  clearInterval(S.poll); S.poll = setInterval(() => loadAll(true), 60e3);
  clearInterval(S.tick); S.tick = setInterval(() => { if (!$("#drawer").hidden || !$("#modal").hidden) return; render(); }, 30e3);
}
function renderAuth(mode = "entrar", msg = "") {
  $("#app").innerHTML = `<div class="auth"><form class="box" id="af">
    <div class="logo">MY7<span>.</span> CRM</div>
    <p class="muted small" style="margin:6px 0 0">${esc(greeting())}! 😊 Entre para ver seus leads.</p>
    <div class="tabs"><button type="button" data-m="entrar" class="${mode === "entrar" ? "on" : ""}">Entrar</button><button type="button" data-m="criar" class="${mode === "criar" ? "on" : ""}">Criar conta</button></div>
    ${mode === "criar" ? `<label for="nm">Seu nome</label><input id="nm" autocomplete="name" required maxlength="120">` : ""}
    <label for="em">E-mail</label><input id="em" type="email" autocomplete="email" required>
    <label for="pw">Senha</label><input id="pw" type="password" autocomplete="${mode === "criar" ? "new-password" : "current-password"}" minlength="6" required>
    <button class="btn pri" style="width:100%;margin-top:16px" id="ab">${mode === "criar" ? "Criar minha conta" : "Entrar"}</button>
    <div id="am" class="${msg.startsWith("✅") ? "ok" : "err"}">${esc(msg)}</div>
    ${mode === "criar" ? `<p class="tiny dim" style="margin-top:12px">Depois de criar, o administrador precisa aprovar seu acesso.</p>` : ""}
  </form></div>`;
  document.querySelectorAll(".tabs button").forEach((b) => (b.onclick = () => renderAuth(b.dataset.m)));
  $("#af").onsubmit = async (e) => {
    e.preventDefault();
    const em = $("#em").value.trim(), pw = $("#pw").value;
    $("#ab").disabled = true; $("#am").textContent = "";
    if (mode === "criar") {
      const nome = $("#nm").value.trim();
      const { data, error } = await sb.auth.signUp({ email: em, password: pw, options: { data: { nome } } });
      if (error) { renderAuth(mode, traduz(error.message)); return; }
      if (!data.session) renderAuth("entrar", "✅ Conta criada! Confirme pelo link no seu e-mail e depois entre aqui.");
    } else {
      const { error } = await sb.auth.signInWithPassword({ email: em, password: pw });
      if (error) renderAuth(mode, traduz(error.message));
    }
  };
}
function traduz(m) {
  if (/invalid login/i.test(m)) return "E-mail ou senha incorretos.";
  if (/already registered|already exists/i.test(m)) return "Esse e-mail já tem conta. Use a aba Entrar.";
  if (/email not confirmed/i.test(m)) return "Confirme seu e-mail pelo link que enviamos e tente de novo.";
  if (/password/i.test(m)) return "A senha precisa ter pelo menos 6 caracteres.";
  return m;
}
function renderPending() {
  const off = S.role === "sdr";
  $("#app").innerHTML = `<div class="auth"><div class="box" style="text-align:center">
    <div style="display:grid;place-items:center">${AV.svg(S.profile && S.profile.avatar, 96)}</div>
    <h1 style="margin-top:14px;font-size:24px">${esc(greeting())}, ${esc(first(S.profile && S.profile.nome))}! 😊</h1>
    <p class="muted">${off ? "Seu acesso está desativado no momento. Fale com o administrador." : "Seu acesso está aguardando aprovação do administrador 😊"}</p>
    <div class="row" style="justify-content:center;margin-top:16px"><button class="btn" id="rl">Verificar de novo</button><button class="btn ghost" id="lo">Sair</button></div>
  </div></div>`;
  $("#rl").onclick = start; $("#lo").onclick = () => sb.auth.signOut();
}

/* ================= ROTAS & SHELL ================= */
const VIEWS = [["painel", "Painel"], ["funil", "Funil"], ["fria", "🧊 Lista fria"], ["leads", "Leads"], ["equipe", "Equipe"], ["avatar", "Meu avatar"]];
function route(noRender) {
  const h = (location.hash || "#painel").slice(1);
  S.view = VIEWS.some((v) => v[0] === h) ? h : "painel";
  if (S.view === "equipe" && !isAdmin()) S.view = "painel";
  if (!noRender) render();
}
function shell(inner) {
  const pendentes = isAdmin() ? S.team.filter((t) => t.papel === "pendente").length : 0;
  const late = S.leads.filter(isLate).length;
  const nav = VIEWS.filter((v) => v[0] !== "equipe" || isAdmin()).map(([k, lb]) => {
    const b = k === "equipe" && pendentes ? `<span class="badge">${pendentes}</span>` : k === "funil" && late ? `<span class="badge">${late}</span>` : "";
    return `<a href="#${k}" class="${S.view === k ? "on" : ""}">${lb}${b}</a>`;
  }).join("");
  return `<header class="top"><div class="in">
    <div class="logo">MY7<span>.</span></div>
    <nav class="nav">${nav}</nav><div class="spacer"></div>
    <button class="btn sm ghost" id="alt" title="Som e notificações de novos leads">${S.alerts ? "🔔 Alertas ligados" : "🔕 Ativar alertas"}</button>
    <a href="#avatar" class="me" title="Meu avatar">${AV.svg(S.profile.avatar, 36)}</a>
    <button class="btn sm ghost" id="lo">Sair</button>
  </div></header><main>${inner}</main>`;
}
function render() {
  if (!S.me || !S.active) return;
  const keep = window.scrollY;
  const views = { painel: vPainel, funil: vFunil, fria: vFria, leads: vLeads, equipe: vEquipe, avatar: vAvatar };
  const focused = document.activeElement && document.activeElement.id;
  $("#app").innerHTML = shell(views[S.view]());
  bindShell(); (binders[S.view] || (() => {}))();
  if (focused && $("#" + focused) && /^f-/.test(focused)) { const el = $("#" + focused); el.focus(); if (el.setSelectionRange && el.value) el.setSelectionRange(el.value.length, el.value.length); }
  window.scrollTo(0, keep);
  if (S.drawer && !$("#drawer").hidden) renderDrawer();
}
function bindShell() {
  $("#lo").onclick = () => { clearInterval(S.poll); clearInterval(S.tick); sb.auth.signOut(); };
  $("#alt").onclick = async () => {
    S.alerts = !S.alerts;
    try { localStorage.setItem("my7crm-alerts", S.alerts ? "1" : "0"); } catch {}
    if (S.alerts) {
      try { if ("Notification" in window && Notification.permission === "default") await Notification.requestPermission(); } catch {}
      beep(); toast("🔔 Alertas ligados", "Você vai ouvir um som e ver um aviso a cada lead novo.");
    }
    render();
  };
  document.querySelectorAll("[data-lead]").forEach((el) => el.addEventListener("click", (e) => { if (e.target.closest("[data-stop]")) return; openLead(el.dataset.lead); }));
  document.querySelectorAll("[data-period]").forEach((b) => (b.onclick = () => { S.period = b.dataset.period; render(); }));
  document.querySelectorAll("[data-assume]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); assume(b.dataset.assume); }));
}
const binders = {};

/* ================= PAINEL ================= */
function hello(sub) {
  return `<div class="hello">${AV.svg(S.profile.avatar, 64)}<div><h1>${esc(greeting())}, ${esc(first(S.profile.nome))}! 😊</h1><p class="muted">${sub}</p></div></div>`;
}
function periodChips() { return `<div class="chips">${PERIODS.map(([k, lb]) => `<button class="chip ${S.period === k ? "on" : ""}" data-period="${k}">${lb}</button>`).join("")}</div>`; }
function metrics(leads, acts, p0) {
  const L = leads.filter((l) => ts(l.created_at) >= p0);
  const A = acts.filter((a) => ts(a.created_at) >= p0);
  const contacted = L.filter((l) => l.primeiro_contato_em);
  const stl = contacted.map((l) => ts(l.primeiro_contato_em) - ts(l.created_at)).sort((a, b) => a - b);
  const worked = new Set(A.filter((a) => a.tipo !== "nota").map((a) => a.lead_id));
  const reached = new Set(A.filter((a) => a.tipo === "resposta_lead" || (a.tipo === "ligacao" && a.resultado === "atendeu")).map((a) => a.lead_id));
  return {
    L, A, total: L.length, comp: L.filter((l) => l.completo).length,
    ab: L.filter((l) => l.classe === "A" || l.classe === "B").length,
    stlMed: stl.length ? stl[Math.floor(stl.length / 2)] : null,
    worked: worked.size, reached: reached.size,
    lig: A.filter((a) => a.tipo === "ligacao").length, wpp: A.filter((a) => a.tipo === "whatsapp").length,
    acoes: A.filter((a) => a.tipo !== "nota").length,
    reun: A.filter((a) => a.tipo === "reuniao_agendada").length,
    fech: leads.filter((l) => l.status === "fechado" && ts(l.status_alterado_em) >= p0).length,
    fria: leads.filter((l) => l.status === "lista_fria" && ts(l.status_alterado_em) >= p0).length,
  };
}
function kpi(lbl, num, sub) { return `<div class="card kpi"><div class="lbl">${lbl}</div><div class="num">${num}</div>${sub ? `<div class="sub">${sub}</div>` : ""}</div>`; }
function vPainel() {
  const p0 = periodStart();
  const mine = isAdmin() ? S.atv : S.atv.filter((a) => a.user_id === S.me.id);
  const m = metrics(S.leads, mine, p0);
  const late = S.leads.filter(isLate).sort((a, b) => classRank[a.classe] - classRank[b.classe] || ts(a.created_at) - ts(b.created_at));
  const today = S.leads.map((l) => ({ l, c: cadToday(l) })).filter((x) => x.c && x.c.pend.length && !isLate(x.l)).sort((a, b) => classRank[a.l.classe] - classRank[b.l.classe]);
  const todayN = S.leads.filter((l) => ts(l.created_at) >= startOfDaySP()).length;
  const sub = `${todayN ? `${todayN} ${todayN === 1 ? "lead novo" : "leads novos"} hoje` : "Nenhum lead novo hoje ainda"} · ${today.length + late.length} ${today.length + late.length === 1 ? "lead pede" : "leads pedem"} ação agora`;

  const cls = ["A", "B", "C", "D"].map((c) => [c, m.L.filter((l) => l.classe === c).length]);
  const maxC = Math.max(1, ...cls.map((x) => x[1]));
  const funnel = STATUS_ALL.map(([k, lb]) => [lb, S.leads.filter((l) => l.status === k).length]);
  const maxF = Math.max(1, ...funnel.map((x) => x[1]));
  const days = Array.from({ length: 14 }, (_, i) => { const s = startOfDaySP() - (13 - i) * D; return [s, S.leads.filter((l) => ts(l.created_at) >= s && ts(l.created_at) < s + D).length]; });
  const maxD = Math.max(1, ...days.map((x) => x[1]));
  const src = {};
  m.L.forEach((l) => { const k = [l.utm_source || "direto / orgânico", l.utm_campaign || ""].filter(Boolean).join(" · "); src[k] = src[k] || { n: 0, a: 0 }; src[k].n++; if (l.classe === "A" || l.classe === "B") src[k].a++; });
  const srcRows = Object.entries(src).sort((a, b) => b[1].n - a[1].n).slice(0, 8);
  const feed = S.atv.slice(0, 8);

  return `${hello(sub)}
  <div class="row" style="justify-content:space-between;margin-bottom:12px"><h2 style="margin:0">${isAdmin() ? "Visão geral" : "Seus números"}</h2>${periodChips()}</div>
  <div class="grid kpis">
    ${kpi("Leads no período", m.total, `${m.comp} completaram o quiz`)}
    ${kpi("Leads A + B", m.ab, `${pct(m.ab, m.total)}% do total`)}
    ${kpi("Conclusão do quiz", pct(m.comp, m.total) + "%", "completos ÷ iniciados")}
    ${kpi("Speed to lead", m.stlMed == null ? "—" : dur(m.stlMed), "mediana até o 1º contato")}
    ${kpi(isAdmin() ? "Ações da equipe" : "Suas ações", m.acoes, `📞 ${m.lig} · 💬 ${m.wpp}`)}
    ${kpi("Taxa de contato", pct(m.reached, m.worked) + "%", `${m.reached} de ${m.worked} leads trabalhados`)}
    ${kpi("Reuniões agendadas", m.reun, "")}
    ${kpi("Fechados", m.fech, `🧊 ${m.fria} foram para a lista fria`)}
  </div>
  <div class="grid two" style="margin-top:14px">
    <section class="card"><h2>⚡ Precisam de atenção agora</h2><p class="tiny dim" style="margin:-8px 0 10px">Leads novos sem nenhum contato há mais de 15 minutos.</p>
      <div class="list">${late.length ? late.slice(0, 8).map((l) => `<button class="item" data-lead="${esc(l.id)}">${clBadge(l)}<span class="grow"><b>${esc(l.nome)}</b><br><span class="tiny muted">${esc(l.segmento || "quiz incompleto")} · ${esc(l.faturamento || "")}</span></span><span class="tag red">esperando ${dur(Date.now() - ts(l.created_at))}</span></button>`).join("") : `<div class="empty">Tudo em dia por aqui 😊</div>`}</div></section>
    <section class="card"><h2>📅 Cadência de hoje</h2><p class="tiny dim" style="margin:-8px 0 10px">O que falta fazer hoje em cada lead (cadência de 5 dias).</p>
      <div class="list">${today.length ? today.slice(0, 10).map(({ l, c }) => `<button class="item" data-lead="${esc(l.id)}">${clBadge(l)}<span class="grow"><b>${esc(l.nome)}</b><br><span class="tiny muted">D${c.d}/5 · falta: ${esc(c.pend.map((x) => x[1]).join(" + "))}</span></span><span class="tag">${esc(profName(l.responsavel_id) === "—" ? "sem responsável" : first(profName(l.responsavel_id)))}</span></button>`).join("") : `<div class="empty">Nenhuma tarefa de cadência pendente hoje 🎉</div>`}</div></section>
  </div>
  <div class="grid two" style="margin-top:14px">
    <section class="card bars"><h2>Qualificação (A · B · C · D)</h2>${cls.map(([c, n]) => `<div class="r"><span><span class="cl ${c}">${c}</span> <span class="tiny muted">${CLASSE_TXT[c]}</span></span><span class="t"><i style="width:${(n / maxC) * 100}%;background:var(--${c})"></i></span><span class="v">${n}</span></div>`).join("")}
      <p class="tiny dim">Score = faturamento (até 35) + 10 por informação preenchida (até 60) + 5 se for dono/sócio. A ≥ 75 · B 55–74 · C 35–54 · D &lt; 35.</p></section>
    <section class="card bars"><h2>Funil agora</h2>${funnel.map(([lb, n]) => `<div class="r"><span class="small">${esc(lb)}</span><span class="t"><i style="width:${(n / maxF) * 100}%"></i></span><span class="v">${n}</span></div>`).join("")}</section>
  </div>
  <div class="grid two" style="margin-top:14px">
    <section class="card"><h2>Leads por dia</h2><div class="cols">${days.map(([s, n]) => `<div title="${n} leads"><em>${n || ""}</em><b style="height:${(n / maxD) * 100}%"></b><span>${new Date(s).toLocaleDateString("pt-BR", { timeZone: TZ, day: "2-digit" })}</span></div>`).join("")}</div><p class="tiny dim">Últimos 14 dias</p></section>
    <section class="card"><h2>De onde vêm os leads</h2>${srcRows.length ? `<div class="scroll"><table class="stack"><thead><tr><th>Origem · campanha</th><th class="n">Leads</th><th class="n">A+B</th></tr></thead><tbody>${srcRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v.n}</td><td class="n">${v.a}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Sem leads no período.</div>`}<p class="tiny dim">Usa os UTMs dos anúncios (utm_source e utm_campaign).</p></section>
  </div>
  ${isAdmin() ? `<section class="card" style="margin-top:14px"><h2>🏆 Equipe no período</h2>${teamTable(p0)}</section>` : ""}
  <section class="card" style="margin-top:14px"><h2>Últimas atividades</h2>${feed.length ? `<ul class="tl">${feed.map(atvLi).join("")}</ul>` : `<div class="empty">Nenhuma atividade registrada ainda.</div>`}</section>`;
}
function atvLi(a) {
  const l = S.leads.find((x) => x.id === a.lead_id);
  const t = TIPOS[a.tipo] || { ic: "•", lb: a.tipo };
  return `<li>${AV.svg(prof(a.user_id) && prof(a.user_id).avatar, 30)}<div class="grow"><b>${esc(first(profName(a.user_id)))}</b> <span class="muted">${t.ic} ${esc(t.lb)}${a.resultado ? " · " + esc(resLabel(a.tipo, a.resultado)) : ""}</span>${l ? ` <span class="muted">em</span> <a href="javascript:void 0" data-lead="${esc(l.id)}">${esc(l.nome)}</a>` : ""}<div class="tiny dim">${fmt(a.created_at)} · D${a.dia_cadencia}${a.descricao ? " · " + esc(a.descricao) : ""}</div></div></li>`;
}
function teamTable(p0) {
  const members = S.profiles.filter((p) => S.team.length ? S.team.some((t) => t.id === p.id && t.papel !== "pendente") : true);
  if (!members.length) return `<div class="empty">Ninguém na equipe ainda.</div>`;
  const rows = members.map((p) => {
    const A = S.atv.filter((a) => a.user_id === p.id && ts(a.created_at) >= p0);
    const myLeads = S.leads.filter((l) => l.responsavel_id === p.id);
    const worked = new Set(A.filter((a) => a.tipo !== "nota").map((a) => a.lead_id));
    const reached = new Set(A.filter((a) => a.tipo === "resposta_lead" || (a.tipo === "ligacao" && a.resultado === "atendeu")).map((a) => a.lead_id));
    const stl = myLeads.filter((l) => l.primeiro_contato_em && ts(l.created_at) >= p0).map((l) => ts(l.primeiro_contato_em) - ts(l.created_at)).sort((a, b) => a - b);
    return { p, acoes: A.filter((a) => a.tipo !== "nota").length, lig: A.filter((a) => a.tipo === "ligacao").length, wpp: A.filter((a) => a.tipo === "whatsapp").length, notas: A.filter((a) => a.tipo === "nota").length, worked: worked.size, reached: reached.size, reun: A.filter((a) => a.tipo === "reuniao_agendada").length, fech: myLeads.filter((l) => l.status === "fechado").length, fria: myLeads.filter((l) => l.status === "lista_fria").length, stl: stl.length ? stl[Math.floor(stl.length / 2)] : null, carteira: myLeads.filter((l) => !["fechado", "perdido", "lista_fria"].includes(l.status)).length };
  }).sort((a, b) => b.acoes - a.acoes);
  return `<div class="scroll"><table class="stack"><thead><tr><th>Pessoa</th><th class="n">Ações</th><th class="n">📞 Ligações</th><th class="n">💬 Mensagens</th><th class="n">📝 Notas</th><th class="n">Leads trabalhados</th><th class="n">Contato</th><th class="n">Reuniões</th><th class="n">Speed to lead</th><th class="n">Em carteira</th><th class="n">Fechados</th><th class="n">🧊 Fria</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td><span class="row" style="flex-wrap:nowrap">${AV.svg(r.p.avatar, 28)}<b>${i === 0 && r.acoes ? "🥇 " : ""}${esc(r.p.nome)}</b></span></td><td class="n"><b>${r.acoes}</b></td><td class="n">${r.lig}</td><td class="n">${r.wpp}</td><td class="n">${r.notas}</td><td class="n">${r.worked}</td><td class="n">${pct(r.reached, r.worked)}%</td><td class="n">${r.reun}</td><td class="n">${r.stl == null ? "—" : dur(r.stl)}</td><td class="n">${r.carteira}</td><td class="n">${r.fech}</td><td class="n">${r.fria}</td></tr>`).join("")}</tbody></table></div>`;
}

/* ================= FUNIL ================= */
function leadCard(l) {
  const acts = atvOf(l.id), c = counts(acts), cad = cadActive(l, acts) ? Math.min(cadDay(l), 6) : null;
  const resp = l.responsavel_id ? `${AV.svg(prof(l.responsavel_id) && prof(l.responsavel_id).avatar, 20)} ${esc(first(profName(l.responsavel_id)))}` : `<button class="btn sm" data-stop data-assume="${esc(l.id)}">Assumir lead</button>`;
  return `<div class="lc ${isLate(l) ? "late" : ""}" draggable="true" data-drag="${esc(l.id)}" data-lead="${esc(l.id)}" role="button" tabindex="0">
    <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><span class="nm">${esc(l.nome)}</span>${clBadge(l)}</div>
    <div class="meta"><span>${esc(l.segmento || "—")}</span><span>${esc(l.faturamento || "")}</span>${l.completo ? "" : `<span class="tag">Incompleto · P${l.ultima_etapa}</span>`}</div>
    <div class="meta"><span>⏱ No funil há ${dur(Date.now() - ts(l.created_at))}</span><span>Nesta etapa há ${dur(Date.now() - ts(l.status_alterado_em || l.created_at))}</span></div>
    <div class="foot">${resp}<span class="spacer"></span>${cad ? `<span class="tag ${cad > 5 ? "red" : "g"}">Cadência ${cad > 5 ? "vencida" : "D" + cad + "/5"}</span>` : ""}<span style="white-space:nowrap">📞 ${c.lig} · 💬 ${c.wpp}</span></div>
  </div>`;
}
function boardLeads() {
  return S.leads.filter((l) => (!S.boardMine || l.responsavel_id === S.me.id) && (!S.boardClasse || l.classe === S.boardClasse));
}
function vFunil() {
  const L = boardLeads();
  return `<div class="row" style="justify-content:space-between;margin-bottom:12px"><h1>Funil</h1>
    <div class="chips"><button class="chip ${!S.boardMine ? "on" : ""}" id="bm0">Todos</button><button class="chip ${S.boardMine ? "on" : ""}" id="bm1">Meus leads</button>
    ${["", "A", "B", "C", "D"].map((c) => `<button class="chip ${S.boardClasse === c ? "on" : ""}" data-bc="${c}">${c || "Todas as classes"}</button>`).join("")}</div></div>
    <p class="tiny dim" style="margin:-6px 0 12px">Arraste os cards entre as colunas ou abra o lead para mudar a etapa. Borda vermelha = lead novo sem contato há mais de 15 min.</p>
    <div class="board">${STATUS.map(([k, lb]) => {
      const items = L.filter((l) => l.status === k).sort((a, b) => (k === "novo" ? classRank[a.classe] - classRank[b.classe] || ts(a.created_at) - ts(b.created_at) : ts(b.status_alterado_em) - ts(a.status_alterado_em)));
      return `<section class="col" data-drop="${k}"><h3><span>${lb}</span><span class="muted">${items.length}</span></h3>${items.map(leadCard).join("") || `<div class="empty">Vazio</div>`}</section>`;
    }).join("")}</div>`;
}
binders.funil = () => {
  $("#bm0").onclick = () => { S.boardMine = false; render(); };
  $("#bm1").onclick = () => { S.boardMine = true; render(); };
  document.querySelectorAll("[data-bc]").forEach((b) => (b.onclick = () => { S.boardClasse = b.dataset.bc; render(); }));
  document.querySelectorAll("[data-drag]").forEach((c) => {
    c.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", c.dataset.drag); e.dataTransfer.effectAllowed = "move"; });
    c.addEventListener("keydown", (e) => { if (e.key === "Enter") openLead(c.dataset.lead); });
  });
  document.querySelectorAll("[data-drop]").forEach((col) => {
    col.addEventListener("dragover", (e) => { e.preventDefault(); col.classList.add("over"); });
    col.addEventListener("dragleave", () => col.classList.remove("over"));
    col.addEventListener("drop", (e) => { e.preventDefault(); col.classList.remove("over"); const id = e.dataTransfer.getData("text/plain"); if (id) setStatus(id, col.dataset.drop); });
  });
};

/* ================= LISTA FRIA ================= */
function vFria() {
  const L = S.leads.filter((l) => l.status === "lista_fria").sort((a, b) => classRank[a.classe] - classRank[b.classe] || ts(b.status_alterado_em) - ts(a.status_alterado_em));
  return `<h1>🧊 Lista fria</h1><p class="muted">Leads que passaram pelos 5 dias de cadência sem nenhum contato (sem ligação atendida nem resposta). Reative quando quiser tentar de novo.</p>
  <section class="card">${L.length ? `<div class="scroll"><table class="stack"><thead><tr><th>Lead</th><th>Classe</th><th>Segmento</th><th>Faturamento</th><th class="n">Tentativas</th><th>Responsável</th><th>Na lista desde</th><th></th></tr></thead><tbody>${L.map((l) => { const c = counts(atvOf(l.id)); return `<tr class="click" data-lead="${esc(l.id)}"><td><b>${esc(l.nome)}</b></td><td>${clBadge(l)}</td><td>${esc(l.segmento || "—")}</td><td>${esc(l.faturamento || "—")}</td><td class="n">📞 ${c.lig} · 💬 ${c.wpp}</td><td>${esc(profName(l.responsavel_id))}</td><td>${fmt(l.status_alterado_em)}</td><td><button class="btn sm" data-stop data-react="${esc(l.id)}">Reativar</button></td></tr>`; }).join("")}</tbody></table></div>` : `<div class="empty">A lista fria está vazia 😊</div>`}</section>`;
}
binders.fria = () => document.querySelectorAll("[data-react]").forEach((b) => (b.onclick = (e) => { e.stopPropagation(); reactivate(b.dataset.react); }));

/* ================= LEADS (LISTA) ================= */
function filteredLeads() {
  const f = S.filters, q = f.q.trim().toLowerCase();
  let L = S.leads.filter((l) => (!q || [l.nome, l.whatsapp, l.instagram, l.segmento].some((v) => String(v || "").toLowerCase().includes(q)))
    && (!f.classe || l.classe === f.classe) && (!f.status || l.status === f.status)
    && (!f.comp || String(!!l.completo) === f.comp) && (!f.resp || (f.resp === "sem" ? !l.responsavel_id : l.responsavel_id === f.resp)));
  const s = { recentes: (a, b) => ts(b.created_at) - ts(a.created_at), antigos: (a, b) => ts(a.created_at) - ts(b.created_at), score: (a, b) => b.score - a.score };
  return L.sort(s[f.sort]);
}
function vLeads() {
  const L = filteredLeads(), f = S.filters;
  const opt = (arr, v) => arr.map(([k, lb]) => `<option value="${esc(k)}" ${v === k ? "selected" : ""}>${esc(lb)}</option>`).join("");
  return `<div class="row" style="justify-content:space-between;margin-bottom:12px"><h1>Leads <span class="muted" style="font-size:18px">${L.length}</span></h1><button class="btn" id="csv">⬇ Exportar CSV</button></div>
  <div class="filters">
    <input id="f-q" placeholder="Buscar nome, WhatsApp, @ ou segmento" value="${esc(f.q)}">
    <select id="f-classe">${opt([["", "Todas as classes"], ["A", "Classe A"], ["B", "Classe B"], ["C", "Classe C"], ["D", "Classe D"]], f.classe)}</select>
    <select id="f-status">${opt([["", "Todas as etapas"], ...STATUS_ALL], f.status)}</select>
    <select id="f-comp">${opt([["", "Completos e incompletos"], ["true", "Só completos"], ["false", "Só incompletos"]], f.comp)}</select>
    <select id="f-resp">${opt([["", "Todos os responsáveis"], ["sem", "Sem responsável"], ...S.profiles.map((p) => [p.id, p.nome || p.email])], f.resp)}</select>
    <select id="f-sort">${opt([["recentes", "Mais recentes"], ["antigos", "Mais antigos"], ["score", "Maior score"]], f.sort)}</select>
  </div>
  <section class="card">${L.length ? `<div class="scroll"><table class="stack"><thead><tr><th>Lead</th><th>Classe</th><th>Cargo</th><th>Segmento</th><th>Faturamento</th><th>Etapa</th><th>Responsável</th><th>No funil há</th></tr></thead><tbody>${L.map((l) => `<tr class="click" data-lead="${esc(l.id)}"><td><b>${esc(l.nome)}</b>${l.completo ? "" : ` <span class="tag">Incompleto · P${l.ultima_etapa}</span>`}<div class="tiny dim">${esc(phoneFmt(l.whatsapp))}</div></td><td>${clBadge(l)}</td><td>${esc(l.cargo || "—")}</td><td>${esc(l.segmento || "—")}</td><td>${esc(l.faturamento || "—")}</td><td>${esc(stLabel(l.status))}</td><td>${esc(profName(l.responsavel_id))}</td><td>${dur(Date.now() - ts(l.created_at))}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Nenhum lead com esses filtros.</div>`}</section>`;
}
binders.leads = () => {
  ["q", "classe", "status", "comp", "resp", "sort"].forEach((k) => {
    const el = $("#f-" + k);
    el.addEventListener(k === "q" ? "input" : "change", () => { S.filters[k] = el.value; render(); });
  });
  $("#csv").onclick = () => {
    const cols = ["created_at", "nome", "whatsapp", "cargo", "segmento", "faturamento", "instagram", "score", "classe", "status", "completo", "ultima_etapa", "origem", "utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term", "primeiro_contato_em", "notas"];
    const q = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = filteredLeads().map((l) => [...cols.map((c) => q(l[c])), q(profName(l.responsavel_id))].join(";"));
    const blob = new Blob(["﻿" + [[...cols, "responsavel"].join(";"), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `leads-my7-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };
};

/* ================= EQUIPE (ADMIN) ================= */
function vEquipe() {
  const p0 = periodStart();
  const T = S.team;
  return `<div class="row" style="justify-content:space-between;margin-bottom:12px"><h1>Equipe</h1>${periodChips()}</div>
  <section class="card"><h2>Acessos</h2><p class="tiny dim" style="margin:-8px 0 10px">Cada SDR cria a própria conta (aba "Criar conta" na tela de login). Depois você aprova aqui.</p>
  ${T.length ? `<div class="scroll"><table class="stack"><thead><tr><th>Pessoa</th><th>E-mail</th><th>Papel</th><th>Status</th><th>Desde</th><th></th></tr></thead><tbody>${T.map((t) => {
    const pr = prof(t.id);
    const papel = t.papel === "admin" ? "Mestre (admin)" : t.papel === "sdr" ? "SDR" : "Aguardando aprovação";
    const btns = t.papel === "pendente" ? `<button class="btn sm pri" data-aprova="${esc(t.id)}">Aprovar como SDR</button>` : t.papel === "sdr" ? `<button class="btn sm" data-ativo="${esc(t.id)}" data-v="${t.ativo ? "0" : "1"}">${t.ativo ? "Desativar" : "Reativar"}</button>` : "";
    return `<tr><td><span class="row" style="flex-wrap:nowrap">${AV.svg(pr && pr.avatar, 28)}<b>${esc(t.nome)}</b></span></td><td>${esc(t.email)}</td><td>${papel}</td><td>${t.papel === "pendente" ? `<span class="tag red">pendente</span>` : t.ativo ? `<span class="tag g">ativo</span>` : `<span class="tag">desativado</span>`}</td><td>${fmt(t.created_at)}</td><td>${btns}</td></tr>`;
  }).join("")}</tbody></table></div>` : `<div class="empty">Carregando…</div>`}</section>
  <section class="card" style="margin-top:14px"><h2>Desempenho no período</h2>${teamTable(p0)}
  <p class="tiny dim">Ações = ligações + mensagens + respostas + reuniões + e-mails (notas contam à parte). Contato = leads com ligação atendida ou resposta ÷ leads trabalhados. Speed to lead = mediana do tempo entre o lead chegar e o 1º contato.</p></section>`;
}
binders.equipe = () => {
  document.querySelectorAll("[data-aprova]").forEach((b) => (b.onclick = async () => { b.disabled = true; const { error } = await sb.rpc("aprovar_sdr", { p_user: b.dataset.aprova }); if (error) toast("Não deu certo", error.message); else toast("✅ Acesso aprovado", "A pessoa já pode entrar no CRM."); loadAll(true); }));
  document.querySelectorAll("[data-ativo]").forEach((b) => (b.onclick = async () => { b.disabled = true; const { error } = await sb.rpc("definir_ativo", { p_user: b.dataset.ativo, p_ativo: b.dataset.v === "1" }); if (error) toast("Não deu certo", error.message); loadAll(true); }));
};

/* ================= AVATAR ================= */
let draftAv = null;
function vAvatar() {
  draftAv = draftAv || AV.normalize(S.profile.avatar);
  const a = draftAv, O = AV.OPT;
  const pills = (k, arr) => `<div class="pills">${arr.map(([v, lb]) => `<button data-k="${k}" data-v="${esc(v)}" class="${a[k] === v ? "on" : ""}">${esc(lb)}</button>`).join("")}</div>`;
  const sw = (k, arr) => `<div class="sw">${arr.map((x) => { const v = AV.val(x), lb = Array.isArray(x) ? x[1] : v; return `<button data-k="${k}" data-v="${esc(v)}" class="${a[k] === v ? "on" : ""}" style="background:${esc(v)}" title="${esc(lb)}" aria-label="${esc(lb)}"></button>`; }).join("")}</div>`;
  return `<h1>Meu avatar</h1><p class="muted">Monte a cabecinha que aparece no CRM — sempre sorrindo 😊</p>
  <div class="aved"><div class="prev"><div id="avp">${AV.svg(a, 200)}</div><h2 style="margin:12px 0 4px">${esc(greeting())}, ${esc(first(S.profile.nome))}! 😊</h2>
    <div class="row" style="justify-content:center;margin-top:10px"><button class="btn" id="avr">🎲 Aleatório</button><button class="btn pri" id="avs">Salvar avatar</button></div></div>
    <div class="card">
      <label>Seu nome no CRM</label><input id="f-nome" maxlength="120" value="${esc(S.profile.nome || "")}">
      <label>Formato da cabeça</label>${pills("formato", O.formato)}
      <label>Cor da pele</label>${sw("pele", O.pele)}
      <label>Cabelo</label>${pills("cabelo", O.cabelo)}
      <label>Cor do cabelo</label>${sw("corCabelo", O.corCabelo)}
      <label>Cor dos olhos</label>${sw("olhos", O.olhos)}
    </div></div>`;
}
binders.avatar = () => {
  document.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => { draftAv[b.dataset.k] = b.dataset.v; render(); }));
  $("#avr").onclick = () => { draftAv = AV.random(); render(); };
  $("#avs").onclick = async () => {
    const nome = $("#f-nome").value.trim() || S.profile.nome;
    $("#avs").disabled = true;
    const { error } = await sb.from("profiles").update({ avatar: draftAv, nome }).eq("id", S.me.id);
    if (error) { toast("Não consegui salvar", error.message); $("#avs").disabled = false; return; }
    S.profile.avatar = draftAv; S.profile.nome = nome;
    const p = prof(S.me.id); if (p) { p.avatar = draftAv; p.nome = nome; }
    toast("😊 Avatar salvo!", "Ficou ótimo.");
    render();
  };
};

/* ================= AÇÕES ================= */
async function setStatus(id, status) {
  const l = S.leads.find((x) => x.id === id); if (!l || l.status === status) return;
  const prev = l.status; l.status = status; l.status_alterado_em = new Date().toISOString(); render();
  const { error } = await sb.from("leads").update({ status }).eq("id", id);
  if (error) { l.status = prev; render(); toast("Não consegui mover o lead", error.message); }
}
async function assume(id) {
  const { error } = await sb.from("leads").update({ responsavel_id: S.me.id }).eq("id", id);
  if (error) toast("Não consegui assumir", error.message); else { const l = S.leads.find((x) => x.id === id); if (l) l.responsavel_id = S.me.id; toast("👍 Lead assumido", "Agora ele é seu."); render(); }
}
async function addAtv(lead_id, tipo, resultado, descricao) {
  const row = { lead_id, user_id: S.me.id, tipo, resultado: resultado || null, descricao: descricao ? descricao.slice(0, 2000) : null };
  const { data, error } = await sb.from("atividades").insert(row).select().single();
  if (error) { toast("Não consegui registrar", error.message); return false; }
  if (data && !S.atv.some((a) => a.id === data.id)) S.atv.unshift(data);
  const fresh = await sb.from("leads").select("*").eq("id", lead_id).maybeSingle();
  if (fresh.data) { const i = S.leads.findIndex((x) => x.id === lead_id); if (i >= 0) S.leads[i] = fresh.data; else S.leads.unshift(fresh.data); }
  render(); return true;
}
async function reactivate(id) {
  const { error } = await sb.from("leads").update({ status: "novo" }).eq("id", id);
  if (error) { toast("Não consegui reativar", error.message); return; }
  await addAtv(id, "nota", null, `Reativado por ${S.profile.nome || "equipe"}`);
  toast("♻️ Lead reativado", "Ele volta para Novo com uma nova cadência de 5 dias.");
  loadAll(true);
}

/* ================= DRAWER DO LEAD ================= */
function openLead(id) { S.drawer = id; $("#drawer").hidden = false; renderDrawer(); document.body.style.overflow = "hidden"; }
function closeLead() { S.drawer = null; $("#drawer").hidden = true; document.body.style.overflow = ""; render(); }
function renderDrawer() {
  const l = S.leads.find((x) => x.id === S.drawer); if (!l) { closeLead(); return; }
  const acts = atvOf(l.id), c = counts(acts), active = cadActive(l, acts), day = cadDay(l);
  const notesFocus = document.activeElement && document.activeElement.id === "d-notas";
  if (notesFocus) return;
  const team = S.profiles.filter((p) => p.ativo !== false);
  const cadHtml = `<div class="cad">${[1, 2, 3, 4, 5].map((d) => `<div class="${active && d === day ? "today" : d < day ? "past" : ""}"><b>D${d}${active && d === day ? " · hoje" : ""}</b>${CAD[d].map(([t, lb]) => `${cadDone(l, acts, d, t) ? "✅" : active && d < day ? "⚠️" : "⬜"} ${esc(lb)}`).join("<br>")}</div>`).join("")}</div>`;
  $("#drawer").innerHTML = `<div class="pane" role="dialog" aria-modal="true" aria-label="Lead ${esc(l.nome)}">
    <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div><h1 style="font-size:26px">${esc(l.nome)}</h1><div class="row" style="margin-top:6px">${clBadge(l)}<span class="tag">${esc(CLASSE_TXT[l.classe] || "")}</span>${l.completo ? "" : `<span class="tag">Incompleto — parou na pergunta ${l.ultima_etapa}</span>`}</div></div><button class="btn sm ghost" id="dx" aria-label="Fechar">✕</button></div>
    <div class="row" style="margin-top:14px"><a class="btn wa" href="${esc(waLink(l.whatsapp))}" target="_blank" rel="noopener">💬 ${esc(phoneFmt(l.whatsapp))}</a>${l.instagram ? `<a class="btn" href="https://instagram.com/${encodeURIComponent(l.instagram)}" target="_blank" rel="noopener">📸 @${esc(l.instagram)}</a>` : ""}</div>
    <div class="counters" style="margin-top:14px"><span><b>${dur(Date.now() - ts(l.created_at))}</b><br>no funil</span><span><b>${dur(Date.now() - ts(l.status_alterado_em || l.created_at))}</b><br>nesta etapa</span><span><b>${c.lig}</b><br>ligações</span><span><b>${c.wpp}</b><br>mensagens</span><span><b>${c.tot}</b><br>tentativas</span></div>
    <div class="sec"><div class="row"><div style="flex:1;min-width:160px"><label for="d-st">Etapa</label><select id="d-st">${STATUS_ALL.map(([k, lb]) => `<option value="${k}" ${l.status === k ? "selected" : ""}>${lb}</option>`).join("")}</select></div>
      <div style="flex:1;min-width:160px"><label for="d-resp">Responsável</label>${isAdmin() ? `<select id="d-resp"><option value="">Sem responsável</option>${team.map((p) => `<option value="${esc(p.id)}" ${l.responsavel_id === p.id ? "selected" : ""}>${esc(p.nome || p.email)}</option>`).join("")}</select>` : l.responsavel_id ? `<div style="padding:10px 0">${esc(profName(l.responsavel_id))}</div>` : `<button class="btn" id="d-assume" style="width:100%">Assumir lead</button>`}</div></div></div>
    <div class="sec"><h2>Registrar ação</h2><div class="acts">
      <button class="btn" data-act="ligacao">📞 Registrar ligação</button><button class="btn" data-act="whatsapp">💬 Registrar WhatsApp</button>
      <button class="btn" data-act="resposta_lead">✅ Lead respondeu</button><button class="btn" data-act="reuniao_agendada">📅 Reunião agendada</button>
      <button class="btn" data-act="nota">📝 Nota</button><button class="btn" data-act="email">✉️ E-mail</button></div></div>
    ${l.mensagem_sugerida ? `<div class="sec"><h2>💡 Mensagem sugerida</h2><div class="msg" id="d-msg">${esc(l.mensagem_sugerida)}</div><div class="row" style="margin-top:8px"><button class="btn sm" id="d-copy">Copiar</button><a class="btn sm wa" id="d-send" href="${esc(waLink(l.whatsapp, l.mensagem_sugerida))}" target="_blank" rel="noopener">Enviar no WhatsApp</a><span class="tiny dim">Gerada em ${fmt(l.mensagem_gerada_em)}</span></div><div id="d-after"></div></div>` : ""}
    <div class="sec"><h2>Cadência de 5 dias</h2>${active ? (day > 5 ? `<p class="small" style="color:#fca5a5">Cadência vencida sem contato — o lead vai para a lista fria automaticamente.</p>` : "") : `<p class="small muted">${hadContact(l, acts) ? "✅ Cadência encerrada: o lead já respondeu." : "Cadência pausada nesta etapa."}</p>`}${cadHtml}</div>
    <div class="sec"><h2>Anotações</h2><textarea id="d-notas" maxlength="5000" placeholder="Contexto do lead, dores, objeções…">${esc(l.notas || "")}</textarea><div class="tiny dim" id="d-nst">Salva automaticamente ao sair do campo.</div></div>
    <div class="sec"><h2>Histórico</h2>${acts.length ? `<ul class="tl">${acts.map(atvLi).join("")}</ul>` : `<div class="empty">Nenhuma ação registrada ainda.</div>`}</div>
    <div class="sec"><h2>Respostas do quiz</h2><dl class="kv"><dt>Cargo</dt><dd>${esc(l.cargo || "—")}</dd><dt>Segmento</dt><dd>${esc(l.segmento || "—")}</dd><dt>Faturamento</dt><dd>${esc(l.faturamento || "—")}</dd><dt>Instagram</dt><dd>${l.instagram ? "@" + esc(l.instagram) : "—"}</dd><dt>Chegou em</dt><dd>${fmt(l.created_at)}</dd><dt>1º contato</dt><dd>${l.primeiro_contato_em ? `${fmt(l.primeiro_contato_em)} (${dur(ts(l.primeiro_contato_em) - ts(l.created_at))} depois)` : "—"}</dd><dt>Botão clicado</dt><dd>${esc(l.origem || "—")}</dd><dt>UTM source</dt><dd>${esc(l.utm_source || "—")}</dd><dt>UTM medium</dt><dd>${esc(l.utm_medium || "—")}</dd><dt>UTM campaign</dt><dd>${esc(l.utm_campaign || "—")}</dd><dt>UTM content</dt><dd>${esc(l.utm_content || "—")}</dd><dt>UTM term</dt><dd>${esc(l.utm_term || "—")}</dd></dl></div>
  </div>`;
  $("#dx").onclick = closeLead;
  $("#drawer").onclick = (e) => { if (e.target.id === "drawer") closeLead(); };
  $("#d-st").onchange = (e) => setStatus(l.id, e.target.value);
  if ($("#d-resp")) $("#d-resp").onchange = async (e) => { const v = e.target.value || null; const { error } = await sb.from("leads").update({ responsavel_id: v }).eq("id", l.id); if (error) toast("Não consegui trocar", error.message); else { l.responsavel_id = v; render(); } };
  if ($("#d-assume")) $("#d-assume").onclick = () => assume(l.id);
  document.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => actModal(l, b.dataset.act)));
  const n = $("#d-notas");
  n.onblur = async () => { if ((l.notas || "") === n.value) return; const { error } = await sb.from("leads").update({ notas: n.value }).eq("id", l.id); $("#d-nst").textContent = error ? "Não consegui salvar: " + error.message : "✓ Salvo"; if (!error) l.notas = n.value; };
  if ($("#d-copy")) $("#d-copy").onclick = async () => { try { await navigator.clipboard.writeText(l.mensagem_sugerida); toast("📋 Mensagem copiada"); } catch { toast("Não consegui copiar", "Selecione o texto e copie manualmente."); } };
  if ($("#d-send")) $("#d-send").addEventListener("click", () => { setTimeout(() => { const box = $("#d-after"); if (box) box.innerHTML = `<div class="row" style="margin-top:8px"><span class="small">Enviou a mensagem?</span><button class="btn sm pri" id="d-reg">Registrar WhatsApp enviado</button></div>`; const r = $("#d-reg"); if (r) r.onclick = () => addAtv(l.id, "whatsapp", "enviada", "Mensagem sugerida enviada"); }, 300); });
}
document.addEventListener("keydown", (e) => { if (e.key === "Escape") { if (!$("#modal").hidden) $("#modal").hidden = true; else if (!$("#drawer").hidden) closeLead(); } });

function actModal(l, tipo) {
  const t = TIPOS[tipo];
  let res = t.res.length ? t.res[0][0] : null;
  const m = $("#modal");
  const placeholder = tipo === "reuniao_agendada" ? "Data e horário da reunião, ex.: 28/11 às 15h" : tipo === "resposta_lead" ? "O que o lead respondeu?" : "Observação (opcional)";
  m.innerHTML = `<form class="box" id="mf"><h2>${t.ic} ${esc(t.lb)} — ${esc(l.nome)}</h2>
    ${t.res.length ? `<div class="opts">${t.res.map(([k, lb], i) => `<button type="button" class="opt ${i === 0 ? "on" : ""}" data-r="${k}">${esc(lb)}</button>`).join("")}</div>` : ""}
    <label for="m-d">${tipo === "reuniao_agendada" ? "Quando?" : "Observação"}</label><textarea id="m-d" maxlength="2000" placeholder="${esc(placeholder)}" ${tipo === "reuniao_agendada" || tipo === "nota" ? "required" : ""}></textarea>
    <p class="tiny dim">Dia da cadência: D${Math.max(1, cadDay(l))} · fica registrado com seu nome e horário.</p>
    <div class="row" style="justify-content:flex-end;margin-top:10px"><button type="button" class="btn ghost" id="m-x">Cancelar</button><button class="btn pri" id="m-ok">Registrar</button></div></form>`;
  m.hidden = false;
  m.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => { res = b.dataset.r; m.querySelectorAll("[data-r]").forEach((x) => x.classList.toggle("on", x === b)); }));
  $("#m-x").onclick = () => (m.hidden = true);
  m.onclick = (e) => { if (e.target === m) m.hidden = true; };
  $("#m-d").focus();
  $("#mf").onsubmit = async (e) => {
    e.preventDefault(); $("#m-ok").disabled = true;
    const ok = await addAtv(l.id, tipo, res, $("#m-d").value.trim());
    if (ok) { m.hidden = true; toast(`${t.ic} ${t.lb} registrada`, l.nome); renderDrawer(); } else $("#m-ok").disabled = false;
  };
}

boot();
}
