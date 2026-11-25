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
  leads: [], atv: [], profiles: [], team: [], closers: [], ganhos: [], contratos: [], ads: [], integ: null, alertas: [],
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
const since = (t) => `<span data-since="${t}">${dur(Date.now() - t)}</span>`;
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
const cacheKey = () => "my7crm-cache-" + (S.me && S.me.id);
function applyData(d, fromCache) {
  const leads = d.leads || [];
  const newOnes = S.loaded && !fromCache ? leads.filter((x) => !S.known.has(x.id)) : [];
  S.leads = leads; S.atv = d.atividades || []; S.profiles = d.profiles || [];
  if (d.team) S.team = d.team;
  S.alertas = d.alertas || []; S.closers = d.closers || []; S.ganhos = d.ganhos || []; S.contratos = d.contratos || []; S.ads = d.ads || []; S.integ = d.integracao || null;
  if (d.profile) S.profile = d.profile;
  S.role = d.role || null; S.active = !!d.active;
  S.leads.forEach((x) => S.known.add(x.id));
  newOnes.forEach((x) => notify(`🔔 Novo lead: ${x.nome}`, `Classe ${x.classe} · ${x.segmento || "respondendo o quiz…"}`));
}
let loading = null;
async function loadAll(silent) {
  if (loading) return loading;
  loading = (async () => {
    const t0 = performance.now();
    const { data, error } = await sb.rpc("crm_bootstrap");
    S.lastLoad = Date.now(); S.loadMs = Math.round(performance.now() - t0);
    if (error) { if (!silent) toast("Não consegui carregar os leads", error.message); return false; }
    applyData(data, false);
    try { sessionStorage.setItem(cacheKey(), JSON.stringify(data)); } catch {}
    S.loaded = true;
    return true;
  })();
  try { return await loading; } finally { loading = null; }
}

let rtChannel = null;
function subscribe() {
  if (rtChannel) sb.removeChannel(rtChannel);
  rtChannel = sb.channel("my7crm")
    .on("postgres_changes", { event: "*", schema: "public", table: "leads" }, (pl) => {
      if (pl.eventType === "DELETE") { S.leads = S.leads.filter((x) => x.id !== (pl.old && pl.old.id)); schedule(); return; }
      const n = pl.new; if (!n || !n.id) return;
      const old = S.leads.find((x) => x.id === n.id);
      if (!old) {
        S.leads.unshift(n); S.known.add(n.id);
        notify(`🔔 Novo lead: ${n.nome}`, `Classe ${n.classe} · ${n.completo ? "quiz completo" : "ainda respondendo o quiz…"}`);
      } else {
        if (!old.completo && n.completo) notify(`✅ ${n.nome} completou o quiz`, `Classe ${n.classe} · score ${n.score} · ${n.faturamento || ""}`);
        Object.assign(old, n);
      }
      schedule();
    })
    .on("postgres_changes", { event: "*", schema: "public", table: "alertas" }, (pl) => {
      const n = pl.new; if (!n || !n.id) return;
      const old = S.alertas.find((a) => a.id === n.id);
      if (old) Object.assign(old, n);
      else { S.alertas.unshift(n); if (n.status === "aberto") notifyWA(n); }
      schedule();
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "ganhos" }, (pl) => {
      if (pl.new && isAdmin() && !S.ganhos.some((g) => g.id === pl.new.id)) { S.ganhos.unshift(pl.new); notify(`🏆 Novo ganho: ${pl.new.cliente_nome}`, brl(pl.new.valor)); schedule(); }
    })
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "atividades" }, (pl) => {
      if (pl.new && !S.atv.some((a) => a.id === pl.new.id)) { S.atv.unshift(pl.new); schedule(); }
    })
    .subscribe((st) => {
      const was = S.rt; S.rt = st;
      if (st === "SUBSCRIBED" && was && was !== "SUBSCRIBED") loadAll(true).then(schedule);
    });
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
  S.loaded = false; S.known = new Set();
  window.onhashchange = () => route(); route(true);
  let cached = null;
  try { cached = JSON.parse(sessionStorage.getItem(cacheKey()) || "null"); } catch {}
  if (cached && cached.active) { applyData(cached, true); S.loaded = true; route(true); render(); }
  const ok = await loadAll(!!cached);
  if (!ok && !cached) { renderPending("erro"); return; }
  if (!S.profile) S.profile = { id: S.me.id, nome: (S.me.user_metadata && S.me.user_metadata.nome) || first(S.me.email), ativo: true };
  if (!S.active) { renderPending(); return; }
  route(true); render();
  subscribe();
  clearInterval(S.poll); S.poll = setInterval(() => { if (S.rt !== "SUBSCRIBED" && !document.hidden) loadAll(true).then(schedule); }, 90e3);
  clearInterval(S.tick); S.tick = setInterval(tick, 30e3);
}
let lastFull = Date.now();
function tick() {
  document.querySelectorAll("[data-since]").forEach((el) => { el.textContent = dur(Date.now() - Number(el.dataset.since)); });
  const busy = !$("#drawer").hidden || !$("#modal").hidden || (document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName));
  const openAl = (S.alertas || []).some((a) => a.status === "aberto");
  if (!busy && (openAl || Date.now() - lastFull > 5 * 60e3)) render();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden && S.active && Date.now() - (S.lastLoad || 0) > 60e3) loadAll(true).then(schedule); });
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
function renderPending(kind) {
  const off = S.role === "sdr";
  if (kind === "erro") { $("#app").innerHTML = `<div class="auth"><div class="box" style="text-align:center"><h1 style="font-size:24px">Ops! 😊</h1><p class="muted">Não consegui falar com o banco de dados agora. Confira sua internet e tente de novo.</p><div class="row" style="justify-content:center;margin-top:16px"><button class="btn pri" id="rl">Tentar de novo</button><button class="btn ghost" id="lo">Sair</button></div></div></div>`; $("#rl").onclick = start; $("#lo").onclick = () => sb.auth.signOut(); return; }
  $("#app").innerHTML = `<div class="auth"><div class="box" style="text-align:center">
    <div style="display:grid;place-items:center">${AV.svg((S.profile && S.profile.avatar), 96)}</div>
    <h1 style="margin-top:14px;font-size:24px">${esc(greeting())}, ${esc(first(S.profile && S.profile.nome))}! 😊</h1>
    <p class="muted">${off ? "Seu acesso está desativado no momento. Fale com o administrador." : "Seu acesso está aguardando aprovação do administrador 😊"}</p>
    <div class="row" style="justify-content:center;margin-top:16px"><button class="btn" id="rl">Verificar de novo</button><button class="btn ghost" id="lo">Sair</button></div>
  </div></div>`;
  $("#rl").onclick = start; $("#lo").onclick = () => sb.auth.signOut();
}

/* ================= ROTAS & SHELL ================= */
const VIEWS = [["painel", "Painel"], ["funil", "Funil"], ["fria", "🧊 Lista fria"], ["leads", "Leads"], ["ganhos", "🏆 Ganhos"], ["contratos", "📄 Contratos"], ["anuncios", "📊 Anúncios"], ["equipe", "Equipe"], ["avatar", "Meu avatar"]];
const ADMIN_VIEWS = new Set(["ganhos", "contratos", "anuncios", "equipe"]);
function route(noRender) {
  const h = (location.hash || "#painel").slice(1);
  S.view = VIEWS.some((v) => v[0] === h) ? h : "painel";
  if (ADMIN_VIEWS.has(S.view) && !isAdmin()) S.view = "painel";
  if (!noRender) render();
}
function shell(inner) {
  const pendentes = isAdmin() ? S.team.filter((t) => t.papel === "pendente").length : 0;
  const late = S.leads.filter(isLate).length;
  const nav = VIEWS.filter((v) => v[0] !== "avatar" && (!ADMIN_VIEWS.has(v[0]) || isAdmin())).map(([k, lb]) => {
    const b = k === "equipe" && pendentes ? `<span class="badge">${pendentes}</span>` : k === "funil" && late ? `<span class="badge">${late}</span>` : "";
    return `<a href="#${k}" class="${S.view === k ? "on" : ""}">${lb}${b}</a>`;
  }).join("");
  return `<header class="top"><div class="in">
    <div class="logo">MY7<span>.</span></div>
    <nav class="nav">${nav}</nav><div class="spacer"></div>
    <button class="btn sm ghost" id="alt" title="Som e notificações de novos leads">${S.alerts ? "🔔 Alertas ligados" : "🔕 Ativar alertas"}</button>
    <a href="#avatar" class="me" title="Meu avatar">${AV.svg(S.profile.avatar, 36)}</a>
    <button class="btn sm ghost" id="lo">Sair</button>
  </div></header><main>${alertBanner()}${inner}</main>`;
}
let rafId = 0;
function schedule() { if (rafId) return; rafId = requestAnimationFrame(() => { rafId = 0; render(); }); }
function render() {
  if (!S.me || !S.active) return;
  lastFull = Date.now();
  const keep = window.scrollY;
  const board = $(".board"), boardX = board ? board.scrollLeft : 0;
  const views = { painel: vPainel, funil: vFunil, fria: vFria, leads: vLeads, ganhos: vGanhos, contratos: vContratos, anuncios: vAnuncios, equipe: vEquipe, avatar: vAvatar };
  const focused = document.activeElement && document.activeElement.id;
  $("#app").innerHTML = shell(views[S.view]());
  bindShell(); (binders[S.view] || (() => {}))();
  if (focused && $("#" + focused) && /^f-/.test(focused)) { const el = $("#" + focused); el.focus(); if (el.setSelectionRange && el.value) el.setSelectionRange(el.value.length, el.value.length); }
  window.scrollTo(0, keep);
  const nb = $(".board"); if (nb && boardX) nb.scrollLeft = boardX;
  if (S.drawer && !$("#drawer").hidden) renderDrawer();
}
function bindShell() {
  $("#lo").onclick = () => { clearInterval(S.poll); clearInterval(S.tick); try { sessionStorage.removeItem(cacheKey()); } catch {} sb.auth.signOut(); };
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
  document.querySelectorAll("[data-alreg]").forEach((b) => (b.onclick = () => novoLeadModal(S.alertas.find((a) => a.id === b.dataset.alreg) || null)));
  document.querySelectorAll("[data-aldis]").forEach((b) => (b.onclick = async () => {
    const a = S.alertas.find((x) => x.id === b.dataset.aldis); if (!a) return;
    a.status = "dispensado"; render();
    const { error } = await sb.rpc("fechar_alerta", { p_alerta: a.id, p_status: "dispensado" });
    if (error) { a.status = "aberto"; render(); toast("Não consegui dispensar", error.message); }
  }));
  document.querySelectorAll("[data-novolead]").forEach((b) => (b.onclick = () => novoLeadModal(null)));
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
      <div class="list">${late.length ? late.slice(0, 8).map((l) => `<button class="item" data-lead="${esc(l.id)}">${clBadge(l)}<span class="grow"><b>${esc(l.nome)}</b><br><span class="tiny muted">${esc(l.segmento || "quiz incompleto")} · ${esc(l.faturamento || "")}</span></span><span class="tag red">esperando ${since(ts(l.created_at))}</span></button>`).join("") : `<div class="empty">Tudo em dia por aqui 😊</div>`}</div></section>
    <section class="card"><h2>📅 Cadência de hoje</h2><p class="tiny dim" style="margin:-8px 0 10px">O que falta fazer hoje em cada lead (cadência de 5 dias).</p>
      <div class="list">${today.length ? today.slice(0, 10).map(({ l, c }) => `<button class="item" data-lead="${esc(l.id)}">${clBadge(l)}<span class="grow"><b>${esc(l.nome)}</b><br><span class="tiny muted">D${c.d}/5 · falta: ${esc(c.pend.map((x) => x[1]).join(" + "))}</span></span><span class="tag">${esc(profName(l.responsavel_id) === "—" ? "sem responsável" : first(profName(l.responsavel_id)))}</span></button>`).join("") : `<div class="empty">Nenhuma tarefa de cadência pendente hoje 🎉</div>`}</div></section>
  </div>
  ${(() => { const R = S.leads.filter((l) => l.status === "reuniao" && l.reuniao_em && ts(l.reuniao_em) > Date.now() - 2 * H).sort((a, b) => ts(a.reuniao_em) - ts(b.reuniao_em)); return R.length ? `<section class="card" style="margin-top:14px"><h2>📅 Próximas reuniões</h2><div class="list">${R.slice(0, 8).map((l) => `<button class="item" data-lead="${esc(l.id)}">${clBadge(l)}<span class="grow"><b>${esc(l.nome)}</b><br><span class="tiny muted">${esc(fmt(l.reuniao_em))} · closer ${esc(first(profName(l.closer_id)))}${l.sdr_id ? " · agendou " + esc(first(profName(l.sdr_id))) : ""}</span></span><span class="tag g">${ts(l.reuniao_em) > Date.now() ? "em " + dur(ts(l.reuniao_em) - Date.now()) : "agora"}</span></button>`).join("")}</div></section>` : ""; })()}
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
    return { p, acoes: A.filter((a) => a.tipo !== "nota").length, lig: A.filter((a) => a.tipo === "ligacao").length, wpp: A.filter((a) => a.tipo === "whatsapp").length, notas: A.filter((a) => a.tipo === "nota").length, worked: worked.size, reached: reached.size, reun: A.filter((a) => a.tipo === "reuniao_agendada").length, fech: myLeads.filter((l) => l.status === "fechado").length, fria: myLeads.filter((l) => l.status === "lista_fria").length, stl: stl.length ? stl[Math.floor(stl.length / 2)] : null, carteira: myLeads.filter((l) => !["fechado", "perdido", "lista_fria"].includes(l.status)).length, recebidas: S.leads.filter((l) => l.closer_id === p.id && ts(l.passado_closer_em) >= p0).length, vendido: (S.ganhos || []).filter((g) => g.vendedor_id === p.id && ts(g.data_fechamento + "T12:00:00Z") >= p0).reduce((s, g) => s + Number(g.valor), 0) };
  }).sort((a, b) => b.acoes - a.acoes);
  return `<div class="scroll"><table class="stack"><thead><tr><th>Pessoa</th><th class="n">Ações</th><th class="n">📞 Ligações</th><th class="n">💬 Mensagens</th><th class="n">📝 Notas</th><th class="n">Leads trabalhados</th><th class="n">Contato</th><th class="n">Reuniões</th><th class="n">Speed to lead</th><th class="n">Em carteira</th><th class="n">Fechados</th><th class="n">Reuniões recebidas</th><th class="n">Vendido</th><th class="n">🧊 Fria</th></tr></thead><tbody>${rows.map((r, i) => `<tr><td><span class="row" style="flex-wrap:nowrap">${AV.svg(r.p.avatar, 28)}<b>${i === 0 && r.acoes ? "🥇 " : ""}${esc(r.p.nome)}</b></span></td><td class="n"><b>${r.acoes}</b></td><td class="n">${r.lig}</td><td class="n">${r.wpp}</td><td class="n">${r.notas}</td><td class="n">${r.worked}</td><td class="n">${pct(r.reached, r.worked)}%</td><td class="n">${r.reun}</td><td class="n">${r.stl == null ? "—" : dur(r.stl)}</td><td class="n">${r.carteira}</td><td class="n">${r.fech}</td><td class="n">${r.recebidas}</td><td class="n">${r.vendido ? esc(brl0(r.vendido)) : "—"}</td><td class="n">${r.fria}</td></tr>`).join("")}</tbody></table></div>`;
}

/* ================= FUNIL ================= */
function leadCard(l) {
  const acts = atvOf(l.id), c = counts(acts), cad = cadActive(l, acts) ? Math.min(cadDay(l), 6) : null;
  const resp = l.responsavel_id ? `${AV.svg(prof(l.responsavel_id) && prof(l.responsavel_id).avatar, 20)} ${esc(first(profName(l.responsavel_id)))}` : `<button class="btn sm" data-stop data-assume="${esc(l.id)}">Assumir lead</button>`;
  return `<div class="lc ${isLate(l) ? "late" : ""}" draggable="true" data-drag="${esc(l.id)}" data-lead="${esc(l.id)}" role="button" tabindex="0">
    <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><span class="nm">${esc(l.nome)}</span>${clBadge(l)}</div>${l.origem === "whatsapp" ? `<span class="tag wa">LEAD WHATSAPP</span>` : ""}
    <div class="meta"><span>${esc(l.segmento || "—")}</span><span>${esc(l.faturamento || "")}</span>${l.completo ? "" : `<span class="tag">Incompleto · P${l.ultima_etapa}</span>`}</div>
    <div class="meta"><span>⏱ No funil há ${since(ts(l.created_at))}</span><span>Nesta etapa há ${since(ts(l.status_alterado_em || l.created_at))}</span></div>
    ${l.status === "reuniao" && l.reuniao_em ? `<div class="meta"><span class="tag g">📅 ${esc(fmt(l.reuniao_em))}</span>${l.sdr_id ? `<span>SDR: ${esc(first(profName(l.sdr_id)))}</span>` : ""}</div>` : ""}
    ${l.status === "fechado" && l.valor_fechado ? `<div class="meta"><span class="tag g">🏆 ${esc(brl(l.valor_fechado))}</span></div>` : ""}
    <div class="foot">${resp}<span class="spacer"></span>${cad ? `<span class="tag ${cad > 5 ? "red" : "g"}">Cadência ${cad > 5 ? "vencida" : "D" + cad + "/5"}</span>` : ""}<span style="white-space:nowrap">📞 ${c.lig} · 💬 ${c.wpp}</span></div>
  </div>`;
}
function boardLeads() {
  return S.leads.filter((l) => (!S.boardMine || l.responsavel_id === S.me.id) && (!S.boardClasse || l.classe === S.boardClasse));
}
function vFunil() {
  const L = boardLeads();
  return `<div class="row" style="justify-content:space-between;margin-bottom:12px"><div class="row"><h1>Funil</h1><button class="btn sm pri" data-novolead>+ Novo lead</button></div>
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
  <section class="card">${L.length ? `<div class="scroll"><table class="stack"><thead><tr><th>Lead</th><th>Classe</th><th>Cargo</th><th>Segmento</th><th>Faturamento</th><th>Etapa</th><th>Responsável</th><th>No funil há</th></tr></thead><tbody>${L.map((l) => `<tr class="click" data-lead="${esc(l.id)}"><td><b>${esc(l.nome)}</b>${l.completo ? "" : ` <span class="tag">Incompleto · P${l.ultima_etapa}</span>`}<div class="tiny dim">${esc(phoneFmt(l.whatsapp))}</div></td><td>${clBadge(l)}</td><td>${esc(l.cargo || "—")}</td><td>${esc(l.segmento || "—")}</td><td>${esc(l.faturamento || "—")}</td><td>${esc(stLabel(l.status))}</td><td>${esc(profName(l.responsavel_id))}</td><td>${since(ts(l.created_at))}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Nenhum lead com esses filtros.</div>`}</section>`;
}
binders.leads = () => {
  ["q", "classe", "status", "comp", "resp", "sort"].forEach((k) => {
    const el = $("#f-" + k);
    let tmr = 0;
    el.addEventListener(k === "q" ? "input" : "change", () => { S.filters[k] = el.value; clearTimeout(tmr); tmr = setTimeout(render, k === "q" ? 180 : 0); });
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
  <section class="card"><h2>Acessos</h2><p class="tiny dim" style="margin:-8px 0 10px">Cada pessoa cria a própria conta (aba "Criar conta" na tela de login). Depois você aprova aqui como SDR ou Closer. SDR prospecta e agenda; Closer recebe a reunião e fecha.</p>
  ${T.length ? `<div class="scroll"><table class="stack"><thead><tr><th>Pessoa</th><th>E-mail</th><th>Papel</th><th>Status</th><th>Desde</th><th></th></tr></thead><tbody>${T.map((t) => {
    const pr = prof(t.id);
    const papel = t.papel === "admin" ? "Mestre (admin)" : t.papel === "sdr" ? "SDR" : t.papel === "closer" ? "Closer" : "Aguardando aprovação";
    const btns = t.papel === "pendente" ? `<span class="row" style="flex-wrap:nowrap"><button class="btn sm pri" data-papel="${esc(t.id)}" data-p="sdr">Aprovar como SDR</button><button class="btn sm pri" data-papel="${esc(t.id)}" data-p="closer">Aprovar como Closer</button></span>`
      : t.papel === "admin" ? "" : `<span class="row" style="flex-wrap:nowrap"><button class="btn sm" data-papel="${esc(t.id)}" data-p="${t.papel === "sdr" ? "closer" : "sdr"}">Virar ${t.papel === "sdr" ? "Closer" : "SDR"}</button><button class="btn sm" data-ativo="${esc(t.id)}" data-v="${t.ativo ? "0" : "1"}">${t.ativo ? "Desativar" : "Reativar"}</button></span>`;
    return `<tr><td><span class="row" style="flex-wrap:nowrap">${AV.svg(pr && pr.avatar, 28)}<b>${esc(t.nome)}</b></span></td><td>${esc(t.email)}</td><td>${papel}</td><td>${t.papel === "pendente" ? `<span class="tag red">pendente</span>` : t.ativo ? `<span class="tag g">ativo</span>` : `<span class="tag">desativado</span>`}</td><td>${fmt(t.created_at)}</td><td>${btns}</td></tr>`;
  }).join("")}</tbody></table></div>` : `<div class="empty">Carregando…</div>`}</section>
  <section class="card" style="margin-top:14px"><h2>Desempenho no período</h2>${teamTable(p0)}
  <p class="tiny dim">Ações = ligações + mensagens + respostas + reuniões + e-mails (notas contam à parte). Contato = leads com ligação atendida ou resposta ÷ leads trabalhados. Speed to lead = mediana do tempo entre o lead chegar e o 1º contato.</p></section>`;
}
binders.equipe = () => {
  document.querySelectorAll("[data-papel]").forEach((b) => (b.onclick = async () => { const t = S.team.find((x) => x.id === b.dataset.papel), was = t && t.papel; if (t) { t.papel = b.dataset.p; t.ativo = true; } render(); const { error } = await sb.rpc("definir_papel", { p_user: b.dataset.papel, p_papel: b.dataset.p }); if (error) { toast("Não deu certo", error.message); loadAll(true).then(schedule); } else { toast(was === "pendente" ? "✅ Acesso aprovado" : "✅ Papel alterado", `${t ? t.nome : ""} agora é ${b.dataset.p === "sdr" ? "SDR" : "Closer"}.`); loadAll(true).then(schedule); } }));
  document.querySelectorAll("[data-ativo]").forEach((b) => (b.onclick = async () => { const v = b.dataset.v === "1", t = S.team.find((x) => x.id === b.dataset.ativo); if (t) t.ativo = v; const p = prof(b.dataset.ativo); if (p) p.ativo = v; render(); const { error } = await sb.rpc("definir_ativo", { p_user: b.dataset.ativo, p_ativo: v }); if (error) { toast("Não deu certo", error.message); loadAll(true).then(schedule); } }));
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
  const refresh = () => {
    $("#avp").innerHTML = AV.svg(draftAv, 200);
    document.querySelectorAll("[data-k]").forEach((x) => x.classList.toggle("on", draftAv[x.dataset.k] === x.dataset.v));
  };
  document.querySelectorAll("[data-k]").forEach((b) => (b.onclick = () => { draftAv[b.dataset.k] = b.dataset.v; refresh(); }));
  $("#avr").onclick = () => { draftAv = AV.random(); refresh(); };
  $("#avs").onclick = async () => {
    const nome = $("#f-nome").value.trim() || S.profile.nome;
    const before = { avatar: S.profile.avatar, nome: S.profile.nome };
    const av = Object.assign({}, draftAv);
    S.profile.avatar = av; S.profile.nome = nome;
    const p = prof(S.me.id); if (p) { p.avatar = av; p.nome = nome; }
    toast("😊 Avatar salvo!", "Ficou ótimo.");
    render();
    const { error } = await sb.from("profiles").update({ avatar: av, nome }).eq("id", S.me.id);
    if (error) { Object.assign(S.profile, before); if (p) Object.assign(p, before); toast("Não consegui salvar o avatar", error.message); render(); }
  };
};

/* ================= AÇÕES ================= */
async function setStatus(id, status) {
  const l = S.leads.find((x) => x.id === id); if (!l || l.status === status) return;
  if (status === "reuniao") { closerModal(l); return; }
  if (status === "fechado") { ganhoModal(l); return; }
  const prev = l.status; l.status = status; l.status_alterado_em = new Date().toISOString(); render();
  const { error } = await sb.from("leads").update({ status }).eq("id", id);
  if (error) { l.status = prev; render(); toast("Não consegui mover o lead", error.message); }
}
async function assume(id) {
  const l = S.leads.find((x) => x.id === id); if (!l) return;
  const prev = { responsavel_id: l.responsavel_id, assumido_em: l.assumido_em };
  l.responsavel_id = S.me.id; l.assumido_em = new Date().toISOString();
  toast("👍 Lead assumido", "Agora ele é seu."); render();
  const { error } = await sb.from("leads").update({ responsavel_id: S.me.id }).eq("id", id);
  if (error) { Object.assign(l, prev); render(); toast("Não consegui assumir", error.message); }
}
function addAtv(lead_id, tipo, resultado, descricao) {
  const l = S.leads.find((x) => x.id === lead_id);
  const now = new Date().toISOString();
  const row = { id: crypto.randomUUID(), lead_id, user_id: S.me.id, tipo, resultado: resultado || null, descricao: descricao ? descricao.slice(0, 2000) : null };
  const local = Object.assign({ created_at: now, dia_cadencia: l ? Math.max(1, cadDay(l)) : 1 }, row);
  S.atv.unshift(local);
  let prev = null;
  if (l) {
    prev = { responsavel_id: l.responsavel_id, primeiro_contato_em: l.primeiro_contato_em, status: l.status, status_alterado_em: l.status_alterado_em };
    if (!l.responsavel_id) { l.responsavel_id = S.me.id; l.assumido_em = now; }
    if (!l.primeiro_contato_em && tipo !== "nota") l.primeiro_contato_em = now;
    const ns = tipo === "resposta_lead" && resultado === "sem_interesse" ? "perdido" : tipo === "reuniao_agendada" ? "reuniao" : ((tipo === "ligacao" && resultado === "atendeu") || tipo === "resposta_lead") && l.status === "novo" ? "em_contato" : l.status;
    if (ns !== l.status) { l.status = ns; l.status_alterado_em = now; }
  }
  render();
  sb.from("atividades").insert(row).then(({ error }) => {
    if (!error) return;
    S.atv = S.atv.filter((a) => a.id !== row.id);
    if (l && prev) Object.assign(l, prev);
    render(); toast("Não consegui registrar a ação", error.message);
  });
  return true;
}
async function reactivate(id) {
  const l = S.leads.find((x) => x.id === id); if (!l) return;
  const prev = { status: l.status, status_alterado_em: l.status_alterado_em, reativado_em: l.reativado_em };
  const now = new Date().toISOString();
  l.status = "novo"; l.status_alterado_em = now; l.reativado_em = now;
  toast("♻️ Lead reativado", "Ele volta para Novo com uma nova cadência de 5 dias."); render();
  const { error } = await sb.from("leads").update({ status: "novo" }).eq("id", id);
  if (error) { Object.assign(l, prev); render(); toast("Não consegui reativar", error.message); return; }
  addAtv(id, "nota", null, `Reativado por ${S.profile.nome || "equipe"}`);
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
  const oldPane = $("#drawer .pane"), paneY = oldPane && oldPane.dataset.lead === l.id ? oldPane.scrollTop : 0;
  const cadHtml = `<div class="cad">${[1, 2, 3, 4, 5].map((d) => `<div class="${active && d === day ? "today" : d < day ? "past" : ""}"><b>D${d}${active && d === day ? " · hoje" : ""}</b>${CAD[d].map(([t, lb]) => `${cadDone(l, acts, d, t) ? "✅" : active && d < day ? "⚠️" : "⬜"} ${esc(lb)}`).join("<br>")}</div>`).join("")}</div>`;
  $("#drawer").innerHTML = `<div class="pane" data-lead-pane="1" data-lead="${esc(l.id)}" role="dialog" aria-modal="true" aria-label="Lead ${esc(l.nome)}">
    <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div><h1 style="font-size:26px">${esc(l.nome)}</h1><div class="row" style="margin-top:6px">${clBadge(l)}${l.origem === "whatsapp" ? `<span class="tag wa">LEAD WHATSAPP</span>` : ""}<span class="tag">${esc(CLASSE_TXT[l.classe] || "")}</span>${l.completo ? "" : `<span class="tag">Incompleto — parou na pergunta ${l.ultima_etapa}</span>`}</div></div><button class="btn sm ghost" id="dx" aria-label="Fechar">✕</button></div>
    <div class="row" style="margin-top:14px"><a class="btn wa" href="${esc(waLink(l.whatsapp))}" target="_blank" rel="noopener">💬 ${esc(phoneFmt(l.whatsapp))}</a>${l.instagram ? `<a class="btn" href="https://instagram.com/${encodeURIComponent(l.instagram)}" target="_blank" rel="noopener">📸 @${esc(l.instagram)}</a>` : ""}</div>
    <div class="counters" style="margin-top:14px"><span><b>${since(ts(l.created_at))}</b><br>no funil</span><span><b>${since(ts(l.status_alterado_em || l.created_at))}</b><br>nesta etapa</span><span><b>${c.lig}</b><br>ligações</span><span><b>${c.wpp}</b><br>mensagens</span><span><b>${c.tot}</b><br>tentativas</span></div>
    <div class="sec"><div class="row"><div style="flex:1;min-width:160px"><label for="d-st">Etapa</label><select id="d-st">${STATUS_ALL.map(([k, lb]) => `<option value="${k}" ${l.status === k ? "selected" : ""}>${lb}</option>`).join("")}</select></div>
      <div style="flex:1;min-width:160px"><label for="d-resp">Responsável</label>${isAdmin() ? `<select id="d-resp"><option value="">Sem responsável</option>${team.map((p) => `<option value="${esc(p.id)}" ${l.responsavel_id === p.id ? "selected" : ""}>${esc(p.nome || p.email)}</option>`).join("")}</select>` : l.responsavel_id ? `<div style="padding:10px 0">${esc(profName(l.responsavel_id))}</div>` : `<button class="btn" id="d-assume" style="width:100%">Assumir lead</button>`}</div></div></div>
    <div class="sec"><h2>Registrar ação</h2><div class="acts">
      <button class="btn" data-act="ligacao">📞 Registrar ligação</button><button class="btn" data-act="whatsapp">💬 Registrar WhatsApp</button>
      <button class="btn" data-act="resposta_lead">✅ Lead respondeu</button><button class="btn" data-act="reuniao_agendada">📅 Reunião agendada → closer</button>
      <button class="btn" data-act="nota">📝 Nota</button><button class="btn" data-act="email">✉️ E-mail</button></div></div>
    ${l.mensagem_sugerida ? `<div class="sec"><h2>💡 Mensagem sugerida</h2><div class="msg" id="d-msg">${esc(l.mensagem_sugerida)}</div><div class="row" style="margin-top:8px"><button class="btn sm" id="d-copy">Copiar</button><a class="btn sm wa" id="d-send" href="${esc(waLink(l.whatsapp, l.mensagem_sugerida))}" target="_blank" rel="noopener">Enviar no WhatsApp</a><span class="tiny dim">Gerada em ${fmt(l.mensagem_gerada_em)}</span></div><div id="d-after"></div></div>` : ""}
    <div class="sec"><h2>Cadência de 5 dias</h2>${active ? (day > 5 ? `<p class="small" style="color:#fca5a5">Cadência vencida sem contato — o lead vai para a lista fria automaticamente.</p>` : "") : `<p class="small muted">${hadContact(l, acts) ? "✅ Cadência encerrada: o lead já respondeu." : "Cadência pausada nesta etapa."}</p>`}${cadHtml}</div>
    <div class="sec"><h2>Anotações</h2><textarea id="d-notas" maxlength="5000" placeholder="Contexto do lead, dores, objeções…">${esc(l.notas || "")}</textarea><div class="tiny dim" id="d-nst">Salva automaticamente ao sair do campo.</div></div>
    <div class="sec"><h2>Histórico</h2>${acts.length ? `<ul class="tl">${acts.map(atvLi).join("")}</ul>` : `<div class="empty">Nenhuma ação registrada ainda.</div>`}</div>
    <div class="sec"><h2>Respostas do quiz</h2><dl class="kv">${l.sdr_id ? `<dt>SDR</dt><dd>${esc(profName(l.sdr_id))}</dd>` : ""}${l.closer_id ? `<dt>Closer</dt><dd>${esc(profName(l.closer_id))}</dd>` : ""}${l.reuniao_em ? `<dt>Reunião</dt><dd>${esc(fmt(l.reuniao_em))}</dd>` : ""}${l.valor_fechado ? `<dt>Valor fechado</dt><dd><b>${esc(brl(l.valor_fechado))}</b></dd>` : ""}<dt>Cargo</dt><dd>${esc(l.cargo || "—")}</dd><dt>Segmento</dt><dd>${esc(l.segmento || "—")}</dd><dt>Faturamento</dt><dd>${esc(l.faturamento || "—")}</dd><dt>Instagram</dt><dd>${l.instagram ? "@" + esc(l.instagram) : "—"}</dd><dt>Chegou em</dt><dd>${fmt(l.created_at)}</dd><dt>1º contato</dt><dd>${l.primeiro_contato_em ? `${fmt(l.primeiro_contato_em)} (${dur(ts(l.primeiro_contato_em) - ts(l.created_at))} depois)` : "—"}</dd><dt>Botão clicado</dt><dd>${esc(l.origem || "—")}</dd><dt>UTM source</dt><dd>${esc(l.utm_source || "—")}</dd><dt>UTM medium</dt><dd>${esc(l.utm_medium || "—")}</dd><dt>UTM campaign</dt><dd>${esc(l.utm_campaign || "—")}</dd><dt>UTM content</dt><dd>${esc(l.utm_content || "—")}</dd><dt>UTM term</dt><dd>${esc(l.utm_term || "—")}</dd></dl></div>
  </div>`;
  const np = $("#drawer .pane"); if (np && paneY) np.scrollTop = paneY;
  $("#dx").onclick = closeLead;
  $("#drawer").onclick = (e) => { if (e.target.id === "drawer") closeLead(); };
  $("#d-st").onchange = (e) => { setStatus(l.id, e.target.value); e.target.value = l.status; };
  if ($("#d-resp")) $("#d-resp").onchange = async (e) => { const v = e.target.value || null, pv = l.responsavel_id; l.responsavel_id = v; render(); const { error } = await sb.from("leads").update({ responsavel_id: v }).eq("id", l.id); if (error) { l.responsavel_id = pv; render(); toast("Não consegui trocar", error.message); } };
  if ($("#d-assume")) $("#d-assume").onclick = () => assume(l.id);
  document.querySelectorAll("[data-act]").forEach((b) => (b.onclick = () => (b.dataset.act === "reuniao_agendada" ? closerModal(l) : actModal(l, b.dataset.act))));
  const n = $("#d-notas");
  n.onblur = async () => { if ((l.notas || "") === n.value) return; const pv = l.notas, v = n.value; l.notas = v; $("#d-nst").textContent = "Salvando…"; const { error } = await sb.from("leads").update({ notas: v }).eq("id", l.id); if (error) l.notas = pv; const st = $("#d-nst"); if (st) st.textContent = error ? "Não consegui salvar: " + error.message : "✓ Salvo"; };
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
    e.preventDefault();
    const txt = $("#m-d").value.trim();
    m.hidden = true;
    addAtv(l.id, tipo, res, txt);
    toast(`${t.ic} ${t.lb} registrada`, l.nome);
  };
}

/* ================= DINHEIRO & DATAS ================= */
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const brl = (v) => BRL.format(Number(v) || 0);
const brl0 = (v) => BRL.format(Math.round(Number(v) || 0)).replace(/,00$/, "");
const parseMoney = (s) => { const t = String(s || "").replace(/[^\d,.-]/g, ""); const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t); return isFinite(n) ? n : NaN; };
const todaySP = () => new Date(Date.now() - 3 * H).toISOString().slice(0, 10);
const monthKey = (d) => String(d || "").slice(0, 7);
const curMonth = () => todaySP().slice(0, 7);
const monthLabel = (k) => { const [y, m] = k.split("-").map(Number); return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" }); };
const shiftMonth = (k, n) => { const [y, m] = k.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
const fmtDay = (d) => (d ? new Date(String(d).slice(0, 10) + "T12:00:00Z").toLocaleDateString("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "2-digit" }) : "—");
const isPaid = (l) => /^(facebook|fb|instagram|ig|meta|an|messenger)$/i.test(String(l.utm_source || "").trim()) || /paid|cpc|social_paid|paid_social/i.test(String(l.utm_medium || ""));

/* ================= MODAL GENÉRICO ================= */
function openModal(html, bind) {
  const m = $("#modal");
  m.innerHTML = `<div class="box" role="dialog" aria-modal="true">${html}</div>`;
  m.hidden = false;
  m.onclick = (e) => { if (e.target === m) m.hidden = true; };
  m.querySelectorAll("[data-close]").forEach((b) => (b.onclick = () => (m.hidden = true)));
  bind && bind(m);
}
const closeModal = () => ($("#modal").hidden = true);

/* ================= REUNIÃO → CLOSER ================= */
function closerModal(l) {
  const list = S.closers || [];
  if (!list.length) {
    openModal(`<h2>📅 Reunião agendada</h2><p class="muted">Ainda não há nenhum closer cadastrado. ${isAdmin() ? "Aprove alguém como <b>Closer</b> na aba Equipe." : "Peça ao administrador para aprovar um closer na aba Equipe."}</p><div class="row" style="justify-content:flex-end"><button class="btn" data-close>Entendi</button></div>`);
    return;
  }
  let pick = list.length === 1 ? list[0].id : null;
  const now = new Date(Date.now() - 3 * H + D);
  const def = now.toISOString().slice(0, 11) + "14:00";
  openModal(`<form id="cf"><h2>📅 Reunião agendada — ${esc(l.nome)}</h2>
    <p class="small muted" style="margin-top:-6px">Quem vai conduzir a reunião? O card sai das suas mãos e vai para o closer escolhido.</p>
    <div class="opts">${list.map((c) => `<button type="button" class="opt ${pick === c.id ? "on" : ""}" data-c="${esc(c.id)}">${AV.svg(prof(c.id) && prof(c.id).avatar, 34)}<span class="grow"><b>${esc(c.nome || "—")}</b><br><span class="tiny muted">${c.papel === "admin" ? "Administrador" : "Closer"}</span></span></button>`).join("")}</div>
    <label for="c-q">Data e horário da reunião</label><input id="c-q" type="datetime-local" required value="${def}">
    <label for="c-o">Observação para o closer (opcional)</label><textarea id="c-o" maxlength="800" placeholder="Ex.: quer começar em dezembro, decisor é o sócio…"></textarea>
    <div id="c-err" class="err"></div>
    <div class="row" style="justify-content:flex-end;margin-top:10px"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn pri" id="c-ok">Enviar para o closer</button></div></form>`, (m) => {
    m.querySelectorAll("[data-c]").forEach((b) => (b.onclick = () => { pick = b.dataset.c; m.querySelectorAll("[data-c]").forEach((x) => x.classList.toggle("on", x === b)); }));
    $("#cf").onsubmit = async (e) => {
      e.preventDefault();
      if (!pick) { $("#c-err").textContent = "Escolha quem é o closer responsável."; return; }
      const q = $("#c-q").value; const when = q ? new Date(q + ":00-03:00").toISOString() : null;
      const obs = $("#c-o").value.trim();
      closeModal();
      const prev = { status: l.status, responsavel_id: l.responsavel_id, closer_id: l.closer_id, sdr_id: l.sdr_id, reuniao_em: l.reuniao_em, status_alterado_em: l.status_alterado_em };
      const nowIso = new Date().toISOString();
      Object.assign(l, { status: "reuniao", closer_id: pick, sdr_id: l.sdr_id || (S.role === "sdr" ? S.me.id : l.responsavel_id || S.me.id), responsavel_id: pick, reuniao_em: when, passado_closer_em: nowIso, status_alterado_em: nowIso });
      const leaves = !isAdmin() && pick !== S.me.id;
      const idx = S.leads.indexOf(l);
      if (leaves) { S.leads.splice(idx, 1); if (S.drawer === l.id) closeLead(); }
      const cn = (list.find((c) => c.id === pick) || {}).nome || "closer";
      toast("📅 Reunião agendada", `${l.nome} foi para ${first(cn)}${when ? " · " + fmt(when) : ""}`);
      render();
      const { error } = await sb.rpc("passar_para_closer", { p_lead: l.id, p_closer: pick, p_quando: when, p_obs: obs || null });
      if (error) {
        Object.assign(l, prev);
        if (leaves && !S.leads.includes(l)) S.leads.splice(Math.max(0, idx), 0, l);
        render(); toast("Não consegui passar para o closer", error.message);
      } else { loadAll(true).then(schedule); }
    };
  });
}

/* ================= FECHADO → GANHO ================= */
function ganhoModal(l) {
  let rec = "mensal";
  openModal(`<form id="gf"><h2>🏆 Fechou! — ${esc(l.nome)}</h2>
    <p class="small muted" style="margin-top:-6px">Por quanto foi fechado? Vai para a aba Ganhos e já cria o contrato pendente.</p>
    <label for="g-v">Valor fechado (R$)</label><input id="g-v" inputmode="decimal" placeholder="Ex.: 1.500,00" required autocomplete="off">
    <label>Tipo</label><div class="pills" id="g-r"><button type="button" class="on" data-r="mensal">Mensal (recorrente)</button><button type="button" data-r="unico">Pagamento único</button></div>
    <div class="row"><div style="flex:1;min-width:130px"><label for="g-m">Duração (meses)</label><input id="g-m" type="number" min="1" max="120" placeholder="Ex.: 12"></div>
    <div style="flex:1;min-width:150px"><label for="g-d">Data do fechamento</label><input id="g-d" type="date" value="${todaySP()}" required></div></div>
    <label for="g-s">Plano / serviço (opcional)</label><input id="g-s" maxlength="300" placeholder="Ex.: Gestão de tráfego Meta + Google">
    <div id="g-err" class="err"></div>
    <div class="row" style="justify-content:flex-end;margin-top:10px"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn pri">Registrar ganho</button></div></form>`, (m) => {
    $("#g-v").focus();
    m.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => { rec = b.dataset.r; m.querySelectorAll("[data-r]").forEach((x) => x.classList.toggle("on", x === b)); }));
    $("#gf").onsubmit = async (e) => {
      e.preventDefault();
      const v = parseMoney($("#g-v").value);
      if (!(v > 0)) { $("#g-err").textContent = "Digite o valor, por exemplo 1.500,00"; return; }
      const meses = $("#g-m").value ? Math.max(1, Math.min(120, Number($("#g-m").value))) : null;
      const data = $("#g-d").value || todaySP(), desc = $("#g-s").value.trim();
      closeModal();
      const prev = { status: l.status, valor_fechado: l.valor_fechado, fechado_em: l.fechado_em, status_alterado_em: l.status_alterado_em };
      Object.assign(l, { status: "fechado", valor_fechado: v, fechado_em: data + "T12:00:00Z", status_alterado_em: new Date().toISOString() });
      toast("🏆 Ganho registrado!", `${l.nome} · ${brl(v)}${rec === "mensal" ? "/mês" : ""}`);
      render();
      const { error } = await sb.rpc("registrar_ganho", { p_lead: l.id, p_valor: v, p_recorrencia: rec, p_meses: meses, p_data: data, p_desc: desc || null });
      if (error) { Object.assign(l, prev); render(); toast("Não consegui registrar o ganho", error.message); }
      else loadAll(true).then(schedule);
    };
  });
}

/* ================= ABA GANHOS ================= */
S.gMonth = curMonth();
function vGanhos() {
  const G = S.ganhos || [], mk = S.gMonth;
  const M = G.filter((g) => monthKey(g.data_fechamento) === mk);
  const tot = M.reduce((a, g) => a + Number(g.valor), 0);
  const mrr = M.filter((g) => g.recorrencia === "mensal").reduce((a, g) => a + Number(g.valor), 0);
  const uni = tot - mrr;
  const yearTot = G.filter((g) => String(g.data_fechamento).slice(0, 4) === mk.slice(0, 4)).reduce((a, g) => a + Number(g.valor), 0);
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(mk, i - 11)).map((k) => [k, G.filter((g) => monthKey(g.data_fechamento) === k).reduce((a, g) => a + Number(g.valor), 0)]);
  const maxM = Math.max(1, ...months.map((x) => x[1]));
  const byV = {};
  M.forEach((g) => { const k = g.vendedor_id || "—"; byV[k] = byV[k] || { n: 0, v: 0 }; byV[k].n++; byV[k].v += Number(g.valor); });
  const rank = Object.entries(byV).sort((a, b) => b[1].v - a[1].v);
  return `<div class="row" style="justify-content:space-between;margin-bottom:12px"><h1>🏆 Ganhos</h1>
    <div class="row"><button class="btn sm" id="gm-p" aria-label="Mês anterior">←</button><b style="min-width:150px;text-align:center">${esc(monthLabel(mk).replace(/^./, (c) => c.toUpperCase()))}</b><button class="btn sm" id="gm-n" aria-label="Próximo mês">→</button><button class="btn sm pri" id="g-add">+ Lançar ganho</button></div></div>
  <div class="grid kpis">
    ${kpi("Fechado no mês", brl0(tot), `${M.length} ${M.length === 1 ? "fechamento" : "fechamentos"}`)}
    ${kpi("Recorrente novo (MRR)", brl0(mrr), "soma dos planos mensais")}
    ${kpi("Vendas únicas", brl0(uni), "setup, projetos, avulsos")}
    ${kpi("Ticket médio", M.length ? brl0(tot / M.length) : "—", `No ano: ${brl0(yearTot)}`)}
  </div>
  <div class="grid two" style="margin-top:14px">
    <section class="card"><h2>Últimos 12 meses</h2><div class="cols">${months.map(([k, v]) => `<div title="${esc(monthLabel(k))}: ${esc(brl(v))}"><em>${v ? esc(brl0(v).replace("R$", "").trim()) : ""}</em><b style="height:${(v / maxM) * 100}%;${k === mk ? "" : "opacity:.55"}"></b><span>${k.slice(5)}</span></div>`).join("")}</div></section>
    <section class="card"><h2>Quem mais fechou no mês</h2>${rank.length ? `<div class="list">${rank.map(([id, r], i) => `<div class="item">${AV.svg(prof(id) && prof(id).avatar, 30)}<span class="grow"><b>${i === 0 ? "🥇 " : ""}${esc(profName(id))}</b><br><span class="tiny muted">${r.n} ${r.n === 1 ? "fechamento" : "fechamentos"}</span></span><b>${esc(brl0(r.v))}</b></div>`).join("")}</div>` : `<div class="empty">Nenhum fechamento neste mês ainda.</div>`}</section>
  </div>
  <section class="card" style="margin-top:14px"><h2>Fechamentos de ${esc(monthLabel(mk))}</h2>
  ${M.length ? `<div class="scroll"><table class="stack"><thead><tr><th>Data</th><th>Cliente</th><th class="n">Valor</th><th>Tipo</th><th>Fechou</th><th>SDR</th><th>Plano / serviço</th><th></th></tr></thead><tbody>${M.map((g) => `<tr><td>${fmtDay(g.data_fechamento)}</td><td>${g.lead_id && S.leads.some((x) => x.id === g.lead_id) ? `<a href="javascript:void 0" data-lead="${esc(g.lead_id)}">${esc(g.cliente_nome)}</a>` : esc(g.cliente_nome)}</td><td class="n"><b>${esc(brl(g.valor))}</b></td><td>${g.recorrencia === "mensal" ? `Mensal${g.meses ? " · " + g.meses + "m" : ""}` : "Único"}</td><td>${esc(profName(g.vendedor_id))}</td><td>${esc(profName(g.sdr_id))}</td><td>${esc(g.descricao || "—")}</td><td><button class="btn sm ghost" data-gdel="${esc(g.id)}" aria-label="Excluir">🗑</button></td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Quando alguém mover um lead para "Fechado", ele aparece aqui com o valor.</div>`}</section>`;
}
binders.ganhos = () => {
  $("#gm-p").onclick = () => { S.gMonth = shiftMonth(S.gMonth, -1); render(); };
  $("#gm-n").onclick = () => { S.gMonth = shiftMonth(S.gMonth, 1); render(); };
  $("#g-add").onclick = manualGanho;
  document.querySelectorAll("[data-gdel]").forEach((b) => (b.onclick = () => {
    const g = S.ganhos.find((x) => x.id === b.dataset.gdel); if (!g) return;
    openModal(`<h2>Excluir ganho?</h2><p class="muted">${esc(g.cliente_nome)} · ${esc(brl(g.valor))}. O lançamento sai das somas. Isso não pode ser desfeito.</p><div class="row" style="justify-content:flex-end"><button class="btn ghost" data-close>Cancelar</button><button class="btn pri" id="gd-ok">Excluir</button></div>`, () => {
      $("#gd-ok").onclick = async () => { closeModal(); const i = S.ganhos.indexOf(g); S.ganhos.splice(i, 1); render(); const { error } = await sb.from("ganhos").delete().eq("id", g.id); if (error) { S.ganhos.splice(i, 0, g); render(); toast("Não consegui excluir", error.message); } };
    });
  }));
};
function manualGanho() {
  let rec = "mensal";
  openModal(`<form id="mg"><h2>+ Lançar ganho</h2><p class="small muted" style="margin-top:-6px">Para vendas que não passaram pelo funil (indicação, cliente antigo…).</p>
    <label for="mg-c">Cliente</label><input id="mg-c" required maxlength="160">
    <label for="mg-v">Valor (R$)</label><input id="mg-v" inputmode="decimal" placeholder="Ex.: 2.000,00" required>
    <label>Tipo</label><div class="pills"><button type="button" class="on" data-r="mensal">Mensal</button><button type="button" data-r="unico">Único</button></div>
    <div class="row"><div style="flex:1;min-width:130px"><label for="mg-m">Duração (meses)</label><input id="mg-m" type="number" min="1" max="120"></div><div style="flex:1;min-width:150px"><label for="mg-d">Data</label><input id="mg-d" type="date" value="${todaySP()}" required></div></div>
    <label for="mg-s">Plano / serviço</label><input id="mg-s" maxlength="300">
    <div id="mg-e" class="err"></div><div class="row" style="justify-content:flex-end;margin-top:10px"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn pri">Salvar</button></div></form>`, (m) => {
    m.querySelectorAll("[data-r]").forEach((b) => (b.onclick = () => { rec = b.dataset.r; m.querySelectorAll("[data-r]").forEach((x) => x.classList.toggle("on", x === b)); }));
    $("#mg").onsubmit = async (e) => {
      e.preventDefault();
      const v = parseMoney($("#mg-v").value); if (!(v > 0)) { $("#mg-e").textContent = "Digite um valor válido."; return; }
      const row = { cliente_nome: $("#mg-c").value.trim(), valor: Math.round(v * 100) / 100, recorrencia: rec, meses: $("#mg-m").value ? Number($("#mg-m").value) : null, data_fechamento: $("#mg-d").value, vendedor_id: S.me.id, descricao: $("#mg-s").value.trim() || null };
      const { data, error } = await sb.from("ganhos").insert(row).select().single();
      if (error) { $("#mg-e").textContent = error.message; return; }
      closeModal(); S.ganhos.unshift(data); S.gMonth = monthKey(data.data_fechamento); render(); toast("🏆 Ganho lançado", `${data.cliente_nome} · ${brl(data.valor)}`);
    };
  });
}

/* ================= ABA CONTRATOS ================= */
const CT_ST = [["pendente", "Pendente"], ["enviado", "Enviado p/ assinatura"], ["assinado", "Assinado"], ["ativo", "Ativo"], ["encerrado", "Encerrado"], ["cancelado", "Cancelado"]];
const ctLabel = (s) => (CT_ST.find((x) => x[0] === s) || [s, s])[1];
const ctFim = (c) => { if (!c.data_inicio || !c.duracao_meses) return null; const d = new Date(c.data_inicio + "T12:00:00Z"); d.setUTCMonth(d.getUTCMonth() + Number(c.duracao_meses)); return d.toISOString().slice(0, 10); };
S.ctFilter = "";
function vContratos() {
  const C = S.contratos || [];
  const ativos = C.filter((c) => c.status === "ativo" || c.status === "assinado");
  const mrr = ativos.reduce((a, c) => a + Number(c.valor_mensal || 0), 0);
  const hoje = todaySP(), em30 = new Date(Date.now() + 30 * D).toISOString().slice(0, 10);
  const vencendo = ativos.filter((c) => { const f = ctFim(c); return f && f >= hoje && f <= em30; });
  const pend = C.filter((c) => c.status === "pendente" || c.status === "enviado");
  const L = C.filter((c) => !S.ctFilter || c.status === S.ctFilter);
  const tagCls = (s) => (s === "ativo" || s === "assinado" ? "g" : s === "cancelado" ? "red" : "");
  return `<div class="row" style="justify-content:space-between;margin-bottom:12px"><h1>📄 Contratos</h1><button class="btn pri" id="ct-add">+ Novo contrato</button></div>
  <div class="grid kpis">
    ${kpi("Contratos ativos", ativos.length, "assinados ou em vigor")}
    ${kpi("Receita recorrente", brl0(mrr), "soma mensal dos ativos")}
    ${kpi("Pendentes", pend.length, "aguardando envio ou assinatura")}
    ${kpi("Vencem em 30 dias", vencendo.length, vencendo.length ? "hora de renovar 😊" : "nenhum por enquanto")}
  </div>
  <div class="chips" style="margin:14px 0">${[["", "Todos"], ...CT_ST].map(([k, lb]) => `<button class="chip ${S.ctFilter === k ? "on" : ""}" data-ctf="${k}">${lb}</button>`).join("")}</div>
  <section class="card">${L.length ? `<div class="scroll"><table class="stack"><thead><tr><th>Cliente</th><th>Status</th><th class="n">Mensal</th><th class="n">Setup</th><th>Início</th><th>Fim</th><th>Vencimento</th><th>Contrato</th></tr></thead><tbody>${L.map((c) => `<tr class="click" data-ct="${esc(c.id)}"><td><b>${esc(c.cliente_nome)}</b>${c.servicos ? `<div class="tiny dim">${esc(c.servicos.slice(0, 80))}</div>` : ""}</td><td><span class="tag ${tagCls(c.status)}">${esc(ctLabel(c.status))}</span></td><td class="n">${c.valor_mensal != null ? esc(brl(c.valor_mensal)) : "—"}</td><td class="n">${c.valor_setup != null ? esc(brl(c.valor_setup)) : "—"}</td><td>${fmtDay(c.data_inicio)}</td><td>${fmtDay(ctFim(c))}</td><td>${c.dia_vencimento ? "dia " + c.dia_vencimento : "—"}</td><td>${c.link_contrato && /^https:\/\//.test(c.link_contrato) ? `<a href="${esc(c.link_contrato)}" target="_blank" rel="noopener" data-stop>Abrir ↗</a>` : "—"}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Nenhum contrato ${S.ctFilter ? "com esse status" : "ainda"}. Todo lead fechado cria um contrato pendente aqui automaticamente.</div>`}</section>`;
}
binders.contratos = () => {
  $("#ct-add").onclick = () => contratoModal(null);
  document.querySelectorAll("[data-ctf]").forEach((b) => (b.onclick = () => { S.ctFilter = b.dataset.ctf; render(); }));
  document.querySelectorAll("[data-ct]").forEach((r) => r.addEventListener("click", (e) => { if (e.target.closest("[data-stop]")) return; contratoModal(S.contratos.find((c) => c.id === r.dataset.ct)); }));
};
function contratoModal(c) {
  const v = c || { status: "pendente" };
  const f = (id, lb, val, attrs = "") => `<div style="flex:1;min-width:150px"><label for="${id}">${lb}</label><input id="${id}" value="${esc(val ?? "")}" ${attrs}></div>`;
  const money = (x) => (x == null || x === "" ? "" : String(Number(x).toFixed(2)).replace(".", ","));
  openModal(`<form id="ctf" style="max-height:80vh;overflow:auto"><h2>${c ? "Editar contrato" : "Novo contrato"}</h2>
    <div class="row">${f("ct-cli", "Cliente *", v.cliente_nome, 'required maxlength="160"')}${f("ct-doc", "CPF / CNPJ", v.documento, 'maxlength="40"')}</div>
    <div class="row">${f("ct-ctt", "Responsável no cliente", v.contato_nome, 'maxlength="160"')}${f("ct-tel", "Telefone", v.telefone, 'maxlength="40"')}</div>
    <div class="row">${f("ct-em", "E-mail", v.email, 'type="email" maxlength="200"')}<div style="flex:1;min-width:150px"><label for="ct-st">Status</label><select id="ct-st">${CT_ST.map(([k, lb]) => `<option value="${k}" ${v.status === k ? "selected" : ""}>${lb}</option>`).join("")}</select></div></div>
    <label for="ct-sv">Serviços contratados</label><textarea id="ct-sv" maxlength="2000">${esc(v.servicos || "")}</textarea>
    <div class="row">${f("ct-vm", "Valor mensal (R$)", money(v.valor_mensal), 'inputmode="decimal"')}${f("ct-vs", "Setup / único (R$)", money(v.valor_setup), 'inputmode="decimal"')}</div>
    <div class="row">${f("ct-di", "Início", v.data_inicio, 'type="date"')}${f("ct-du", "Duração (meses)", v.duracao_meses, 'type="number" min="1" max="120"')}${f("ct-dv", "Dia do vencimento", v.dia_vencimento, 'type="number" min="1" max="31"')}</div>
    <div class="row">${f("ct-fp", "Forma de pagamento", v.forma_pagamento, 'maxlength="60" placeholder="Pix, boleto, cartão…"')}${f("ct-ln", "Link do contrato (https://…)", v.link_contrato, 'type="url" maxlength="1000" placeholder="Google Drive, Autentique, ZapSign…"')}</div>
    <label for="ct-ob">Observações</label><textarea id="ct-ob" maxlength="5000">${esc(v.observacoes || "")}</textarea>
    <div id="ct-e" class="err"></div>
    <div class="row" style="justify-content:space-between;margin-top:10px">${c ? `<button type="button" class="btn ghost" id="ct-del">🗑 Excluir</button>` : "<span></span>"}<div class="row"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn pri">Salvar</button></div></div></form>`, () => {
    $("#ctf").onsubmit = async (e) => {
      e.preventDefault();
      const num = (id) => { const x = $(id).value.trim(); if (!x) return null; const n = parseMoney(x); return isFinite(n) ? Math.round(n * 100) / 100 : null; };
      const int = (id) => ($(id).value ? Number($(id).value) : null);
      const txt = (id) => $(id).value.trim() || null;
      const link = txt("#ct-ln");
      if (link && !/^https:\/\//.test(link)) { $("#ct-e").textContent = "O link precisa começar com https://"; return; }
      const row = { cliente_nome: $("#ct-cli").value.trim(), documento: txt("#ct-doc"), contato_nome: txt("#ct-ctt"), telefone: txt("#ct-tel"), email: txt("#ct-em"), status: $("#ct-st").value, servicos: txt("#ct-sv"), valor_mensal: num("#ct-vm"), valor_setup: num("#ct-vs"), data_inicio: txt("#ct-di"), duracao_meses: int("#ct-du"), dia_vencimento: int("#ct-dv"), forma_pagamento: txt("#ct-fp"), link_contrato: link, observacoes: txt("#ct-ob") };
      const q = c ? sb.from("contratos").update(row).eq("id", c.id).select().single() : sb.from("contratos").insert(row).select().single();
      const { data, error } = await q;
      if (error) { $("#ct-e").textContent = error.message; return; }
      closeModal();
      if (c) Object.assign(c, data); else S.contratos.unshift(data);
      toast("📄 Contrato salvo", data.cliente_nome); render();
    };
    if (c) $("#ct-del").onclick = async () => {
      if ($("#ct-del").dataset.sure !== "1") { $("#ct-del").dataset.sure = "1"; $("#ct-del").textContent = "Clique de novo para excluir"; return; }
      const { error } = await sb.from("contratos").delete().eq("id", c.id);
      if (error) { $("#ct-e").textContent = error.message; return; }
      closeModal(); S.contratos = S.contratos.filter((x) => x.id !== c.id); render();
    };
  });
}

/* ================= ABA ANÚNCIOS ================= */
function vAnuncios() {
  const p0 = periodStart(), d0 = p0 ? new Date(p0 - 3 * H).toISOString().slice(0, 10) : "0000";
  const A = (S.ads || []).filter((a) => a.data >= d0);
  const spend = A.reduce((s, a) => s + Number(a.spend), 0);
  const leadsMeta = A.reduce((s, a) => s + Number(a.leads_plataforma), 0);
  const conv = A.reduce((s, a) => s + Number(a.conversas), 0);
  const imp = A.reduce((s, a) => s + Number(a.impressions), 0), clk = A.reduce((s, a) => s + Number(a.clicks), 0);
  const L = S.leads.filter((l) => ts(l.created_at) >= p0);
  const paid = L.filter(isPaid);
  const paidAB = paid.filter((l) => l.classe === "A" || l.classe === "B");
  const reun = paid.filter((l) => l.passado_closer_em || ["reuniao", "proposta", "fechado"].includes(l.status));
  const G = (S.ganhos || []).filter((g) => g.data_fechamento >= d0);
  const paidIds = new Set(S.leads.filter(isPaid).map((l) => l.id));
  const Gpaid = G.filter((g) => g.lead_id && paidIds.has(g.lead_id));
  const receita = Gpaid.reduce((s, g) => s + Number(g.valor), 0);
  const div = (a, b) => (b ? a / b : null);
  const money = (v) => (v == null ? "—" : brl(v));
  // por campanha
  const camp = {};
  A.forEach((a) => { const k = a.campaign_id || a.campaign_name || "—"; camp[k] = camp[k] || { nome: a.campaign_name || k, id: a.campaign_id, spend: 0, imp: 0, clk: 0, leads: 0, conv: 0 }; const c = camp[k]; c.spend += Number(a.spend); c.imp += Number(a.impressions); c.clk += Number(a.clicks); c.leads += Number(a.leads_plataforma); c.conv += Number(a.conversas); if (a.campaign_name) c.nome = a.campaign_name; });
  const norm = (s) => String(s || "").trim().toLowerCase();
  const rows = Object.values(camp).map((c) => {
    const cl = paid.filter((l) => norm(l.utm_campaign) && (norm(l.utm_campaign) === norm(c.nome) || norm(l.utm_campaign) === norm(c.id)));
    const ids = new Set(cl.map((l) => l.id));
    const vend = G.filter((g) => ids.has(g.lead_id));
    return { ...c, crm: cl.length, ab: cl.filter((l) => l.classe === "A" || l.classe === "B").length, reun: cl.filter((l) => l.passado_closer_em || ["reuniao", "proposta", "fechado"].includes(l.status)).length, vendas: vend.length, receita: vend.reduce((s, g) => s + Number(g.valor), 0) };
  }).sort((a, b) => b.spend - a.spend);
  const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(startOfDaySP() - (13 - i) * D - 3 * H + 12 * H).toISOString().slice(0, 10); return [d, (S.ads || []).filter((a) => a.data === d).reduce((s, a) => s + Number(a.spend), 0)]; });
  const maxD = Math.max(1, ...days.map((x) => x[1]));
  const I = S.integ || {};
  const stTxt = !I.tem_token ? `<span class="tag">Não conectado</span>` : I.ultimo_status === "erro" ? `<span class="tag red">Erro na última sincronização</span>` : I.ultimo_status === "buscando" ? `<span class="tag">Sincronizando…</span>` : `<span class="tag g">Conectado</span>`;
  return `<div class="row" style="justify-content:space-between;margin-bottom:12px"><h1>📊 Anúncios</h1>${periodChips()}</div>
  <div class="grid kpis">
    ${kpi("Investimento", brl0(spend), `${imp.toLocaleString("pt-BR")} impressões · CTR ${imp ? ((clk / imp) * 100).toFixed(2).replace(".", ",") : "0"}%`)}
    ${kpi("CPL na Meta", money(div(spend, leadsMeta)), `${leadsMeta} leads registrados pela Meta${conv ? ` · ${conv} conversas` : ""}`)}
    ${kpi("CPL real (CRM)", money(div(spend, paid.length)), `${paid.length} leads pagos chegaram no CRM`)}
    ${kpi("Custo por lead A/B", money(div(spend, paidAB.length)), `${paidAB.length} leads bem qualificados`)}
    ${kpi("Custo por reunião", money(div(spend, reun.length)), `${reun.length} reuniões de leads pagos`)}
    ${kpi("Custo por venda (CAC)", money(div(spend, Gpaid.length)), `${Gpaid.length} vendas de leads pagos`)}
    ${kpi("Receita dessas vendas", brl0(receita), "valor fechado (1º mês nos planos mensais)")}
    ${kpi("ROAS", spend ? (receita / spend).toFixed(2).replace(".", ",") + "x" : "—", "receita ÷ investimento")}
  </div>
  <div class="grid two" style="margin-top:14px">
    <section class="card"><h2>Investimento por dia</h2><div class="cols">${days.map(([d, v]) => `<div title="${esc(fmtDay(d))}: ${esc(brl(v))}"><em>${v ? Math.round(v) : ""}</em><b style="height:${(v / maxD) * 100}%"></b><span>${d.slice(8)}</span></div>`).join("")}</div><p class="tiny dim">Últimos 14 dias, em R$</p></section>
    <section class="card"><h2>Conexão com a Meta</h2><div class="row" style="margin-bottom:8px">${stTxt}${I.ultima_sync ? `<span class="tiny dim">Última sincronização: ${fmt(I.ultima_sync)}</span>` : ""}</div>
      ${I.ultimo_erro ? `<p class="small" style="color:#fca5a5">${esc(I.ultimo_erro)}</p>` : ""}
      <form id="mf-cfg"><div class="row"><div style="flex:1;min-width:160px"><label for="mc-acc">ID da conta de anúncios</label><input id="mc-acc" inputmode="numeric" placeholder="Ex.: 123456789012345" value="${esc(I.conta_id || "")}"></div>
      <div style="flex:2;min-width:200px"><label for="mc-tok">Token de acesso</label><input id="mc-tok" type="password" autocomplete="off" placeholder="${I.tem_token ? "•••••• (salvo) — deixe vazio para manter" : "Cole o token aqui"}"></div></div>
      <div class="row" style="margin-top:10px"><button class="btn pri" id="mc-save">Salvar conexão</button><button type="button" class="btn" id="mc-sync" ${I.tem_token ? "" : "disabled"}>🔄 Sincronizar agora</button><button type="button" class="btn ghost" id="mc-man">+ Lançar investimento manual</button></div>
      <div id="mc-msg" class="small muted" style="margin-top:8px"></div></form>
      <details style="margin-top:10px"><summary class="small">Como pegar o ID da conta e o token</summary><ol class="small muted">
        <li>No Gerenciador de Negócios (business.facebook.com) → Configurações → Usuários → <b>Usuários do sistema</b> → Adicionar (função Administrador).</li>
        <li>Em "Atribuir ativos", dê acesso à sua <b>conta de anúncios</b>.</li>
        <li>Clique em <b>Gerar novo token</b>, escolha seu app, marque <b>ads_read</b> e gere com validade "Nunca expira".</li>
        <li>O ID da conta aparece no Gerenciador de Anúncios (número depois de "act=" na barra de endereço).</li>
        <li>Cole os dois aqui. O token fica guardado criptografado no banco e nunca aparece de novo na tela.</li>
        <li>Para cruzar campanha × lead, use nos anúncios os parâmetros de URL: <code>utm_source=facebook&amp;utm_medium=paid&amp;utm_campaign={{campaign.name}}&amp;utm_content={{ad.name}}</code></li>
      </ol></details>
      <p class="tiny dim">Sincroniza sozinho de hora em hora (últimos 30 dias).</p></section>
  </div>
  <section class="card" style="margin-top:14px"><h2>Campanhas no período</h2>${rows.length ? `<div class="scroll"><table class="stack"><thead><tr><th>Campanha</th><th class="n">Invest.</th><th class="n">Cliques</th><th class="n">CTR</th><th class="n">Leads Meta</th><th class="n">CPL Meta</th><th class="n">Leads CRM</th><th class="n">A+B</th><th class="n">Reuniões</th><th class="n">Vendas</th><th class="n">CAC</th><th class="n">Receita</th></tr></thead><tbody>${rows.map((r) => `<tr><td><b>${esc(r.nome)}</b></td><td class="n">${esc(brl(r.spend))}</td><td class="n">${r.clk}</td><td class="n">${r.imp ? ((r.clk / r.imp) * 100).toFixed(2).replace(".", ",") + "%" : "—"}</td><td class="n">${r.leads}</td><td class="n">${esc(money(div(r.spend, r.leads)))}</td><td class="n">${r.crm}</td><td class="n">${r.ab}</td><td class="n">${r.reun}</td><td class="n">${r.vendas}</td><td class="n">${esc(money(div(r.spend, r.vendas)))}</td><td class="n">${esc(brl0(r.receita))}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty">Sem dados de anúncios no período. Conecte a Meta ao lado ou lance o investimento manualmente.</div>`}
  <p class="tiny dim">Leads CRM/A+B/Reuniões/Vendas usam o utm_campaign do lead, que precisa ser igual ao nome (ou ID) da campanha. "Leads pagos" = utm_source facebook/instagram/meta ou utm_medium paid/cpc.</p></section>`;
}
binders.anuncios = () => {
  $("#mf-cfg").onsubmit = async (e) => {
    e.preventDefault();
    const acc = $("#mc-acc").value.trim(), tok = $("#mc-tok").value.trim();
    $("#mc-save").disabled = true; $("#mc-msg").textContent = "Salvando…";
    const { error } = await sb.rpc("salvar_meta_config", { p_conta: acc, p_token: tok || null, p_ativo: true });
    $("#mc-tok").value = "";
    if (error) { $("#mc-msg").textContent = "Não consegui salvar: " + error.message; $("#mc-save").disabled = false; return; }
    const r = await sb.rpc("meta_sync_agora");
    $("#mc-msg").textContent = r.data === "ok" ? "✅ Conexão salva! Buscando os dados na Meta… isso leva até 5 minutos." : (r.data || (r.error && r.error.message) || "");
    S.metaPoll = 6; pollMeta(); loadAll(true).then(schedule);
  };
  $("#mc-sync").onclick = async () => {
    const r = await sb.rpc("meta_sync_agora");
    $("#mc-msg").textContent = r.error ? r.error.message : r.data === "ok" ? "🔄 Buscando os dados na Meta… em até 5 minutos aparecem aqui." : r.data;
    S.metaPoll = 6; pollMeta();
  };
  $("#mc-man").onclick = manualAds;
};
function pollMeta() {
  clearTimeout(S.metaT);
  if (!(S.metaPoll > 0)) return;
  S.metaPoll--;
  S.metaT = setTimeout(async () => { await loadAll(true); schedule(); if ((S.integ || {}).ultimo_status === "buscando") pollMeta(); }, 60e3);
}
function manualAds() {
  openModal(`<form id="ma"><h2>+ Lançar investimento</h2><p class="small muted" style="margin-top:-6px">Para Google Ads, outra conta ou um dia que a Meta não trouxe.</p>
    <div class="row"><div style="flex:1;min-width:140px"><label for="ma-d">Data</label><input id="ma-d" type="date" value="${todaySP()}" required></div><div style="flex:1;min-width:140px"><label for="ma-p">Plataforma</label><select id="ma-p"><option value="meta">Meta</option><option value="google">Google</option><option value="outro">Outro</option></select></div></div>
    <label for="ma-c">Campanha</label><input id="ma-c" required maxlength="200" placeholder="Igual ao utm_campaign usado no link">
    <div class="row"><div style="flex:1;min-width:140px"><label for="ma-v">Investimento (R$)</label><input id="ma-v" inputmode="decimal" required></div><div style="flex:1;min-width:140px"><label for="ma-l">Leads da plataforma</label><input id="ma-l" type="number" min="0" value="0"></div></div>
    <div id="ma-e" class="err"></div><div class="row" style="justify-content:flex-end;margin-top:10px"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn pri">Salvar</button></div></form>`, () => {
    $("#ma").onsubmit = async (e) => {
      e.preventDefault();
      const v = parseMoney($("#ma-v").value); if (!(v >= 0)) { $("#ma-e").textContent = "Valor inválido."; return; }
      const nome = $("#ma-c").value.trim();
      const row = { data: $("#ma-d").value, plataforma: $("#ma-p").value, conta_id: "manual", campaign_id: "manual:" + nome.toLowerCase(), campaign_name: nome, spend: Math.round(v * 100) / 100, leads_plataforma: Number($("#ma-l").value) || 0, origem: "manual" };
      const { data, error } = await sb.from("ads_metricas").upsert(row, { onConflict: "plataforma,conta_id,campaign_id,data" }).select().single();
      if (error) { $("#ma-e").textContent = error.message; return; }
      closeModal(); S.ads = (S.ads || []).filter((a) => a.id !== data.id); S.ads.unshift(data); render(); toast("📊 Investimento lançado", `${nome} · ${brl(v)}`);
    };
  });
}


/* ================= LEAD WHATSAPP ================= */
const CARGOS_Q = ["Dono / Sócio", "Diretor / Gerente", "Responsável pelo marketing", "Funcionário / Outro"];
const SEGS_Q = ["Prestador de serviços", "Saúde / Clínica / Estética", "Alimentação / Delivery", "Varejo / Loja", "Automotivo", "Outro"];
const FATS_Q = ["Até R$ 20 mil", "R$ 20 mil a R$ 50 mil", "R$ 50 mil a R$ 100 mil", "R$ 100 mil a R$ 300 mil", "Acima de R$ 300 mil"];
function notifyWA(a) {
  notify(`💬 LEAD WHATSAPP`, `${a.quantidade} ${a.quantidade === 1 ? "nova conversa" : "novas conversas"} · ${a.campanha_nome || "anúncio"} — responda em até 5 min!`);
  setTimeout(beep, 450); setTimeout(beep, 900);
}
function alertBanner() {
  const A = (S.alertas || []).filter((a) => a.status === "aberto");
  if (!A.length) return "";
  return `<section class="card" style="border-color:#25D366;background:#0d1f14;margin-bottom:14px"><h2 style="margin-bottom:6px">💬 LEAD WHATSAPP — responda em até 5 minutos</h2>
  <p class="tiny dim" style="margin:0 0 10px">Novas conversas iniciadas pelos anúncios. Responda no WhatsApp e registre o lead para ele entrar no funil.</p>
  <div class="list">${A.map((a) => { const late = Date.now() - ts(a.criado_em) > 5 * 60e3; return `<div class="item" style="${late ? "border-color:var(--red)" : ""}"><span class="tag wa">LEAD WHATSAPP</span><span class="grow"><b>${a.quantidade} ${a.quantidade === 1 ? "nova conversa" : "novas conversas"}</b> · ${esc(a.campanha_nome || "campanha")}<br><span class="tiny ${late ? "" : "muted"}" style="${late ? "color:#fca5a5" : ""}">${late ? "⚠️ passou dos 5 min · " : ""}chegou há <span data-since="${ts(a.criado_em)}">${dur(Date.now() - ts(a.criado_em))}</span></span></span><button class="btn sm pri" data-alreg="${esc(a.id)}">Registrar lead</button><button class="btn sm ghost" data-aldis="${esc(a.id)}">Dispensar</button></div>`; }).join("")}</div></section>`;
}
function novoLeadModal(alerta) {
  const wa = !!alerta;
  const sel = (id, arr) => `<select id="${id}"><option value="">—</option>${arr.map((x) => `<option>${esc(x)}</option>`).join("")}</select>`;
  openModal(`<form id="nl"><h2>${wa ? "💬 Registrar LEAD WHATSAPP" : "+ Novo lead"}</h2>
    ${wa ? `<p class="small muted" style="margin-top:-6px">Campanha: <b>${esc(alerta.campanha_nome || "—")}</b>. Ele entra no funil já como "Em contato", com a etiqueta LEAD WHATSAPP.</p>` : `<p class="small muted" style="margin-top:-6px">Para leads que chegaram por indicação, telefone ou outro canal.</p>`}
    <div class="row"><div style="flex:1;min-width:160px"><label for="nl-n">Nome *</label><input id="nl-n" required maxlength="120"></div>
    <div style="flex:1;min-width:160px"><label for="nl-w">WhatsApp com DDD *</label><input id="nl-w" required inputmode="tel" placeholder="(44) 99999-9999"></div></div>
    <div class="row"><div style="flex:1;min-width:160px"><label for="nl-c">Cargo</label>${sel("nl-c", CARGOS_Q)}</div><div style="flex:1;min-width:160px"><label for="nl-s">Segmento</label>${sel("nl-s", SEGS_Q)}</div></div>
    <div class="row"><div style="flex:1;min-width:160px"><label for="nl-f">Faturamento mensal</label>${sel("nl-f", FATS_Q)}</div><div style="flex:1;min-width:160px"><label for="nl-i">Instagram</label><input id="nl-i" maxlength="60" placeholder="@marca"></div></div>
    ${wa ? "" : `<label><input type="checkbox" id="nl-wa" style="width:auto;margin-right:6px">Veio de anúncio pelo WhatsApp (etiqueta LEAD WHATSAPP)</label>`}
    <label for="nl-o">Observação</label><textarea id="nl-o" maxlength="1000" placeholder="O que ele perguntou, interesse, melhor horário…"></textarea>
    <p class="tiny dim">Score e classe são calculados na hora: quanto mais campos preencher, melhor a classificação.</p>
    <div id="nl-e" class="err"></div><div class="row" style="justify-content:flex-end;margin-top:8px"><button type="button" class="btn ghost" data-close>Cancelar</button><button class="btn pri" id="nl-ok">Registrar</button></div></form>`, () => {
    $("#nl-n").focus();
    $("#nl").onsubmit = async (e) => {
      e.preventDefault(); $("#nl-ok").disabled = true;
      const origem = wa || ($("#nl-wa") && $("#nl-wa").checked) ? "whatsapp" : "manual";
      const { error } = await sb.rpc("criar_lead_manual", { p_nome: $("#nl-n").value.trim(), p_whatsapp: $("#nl-w").value, p_cargo: $("#nl-c").value || null, p_segmento: $("#nl-s").value || null, p_faturamento: $("#nl-f").value || null, p_instagram: $("#nl-i").value || null, p_origem: origem, p_campanha: wa ? alerta.campanha_nome : null, p_alerta: wa ? alerta.id : null, p_obs: $("#nl-o").value.trim() || null });
      if (error) { $("#nl-e").textContent = error.message; $("#nl-ok").disabled = false; return; }
      const nome = $("#nl-n").value.trim();
      closeModal(); if (alerta) alerta.status = "atendido";
      toast(origem === "whatsapp" ? "💬 LEAD WHATSAPP registrado" : "✅ Lead registrado", nome);
      loadAll(true).then(schedule);
    };
  });
}

boot();
}
