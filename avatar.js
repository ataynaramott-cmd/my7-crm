/* Avatar MY7 — só a cabeça, sempre sorrindo 😊 */
window.MY7Avatar = (() => {
  const OPT = {
    formato: [["redondo", "Redondo"], ["oval", "Oval"], ["quadrado", "Quadrado"], ["longo", "Alongado"], ["coracao", "Coração"]],
    pele: ["#FFE0C4", "#F5C9A0", "#E8B48A", "#C98E62", "#A86B45", "#7C4A2D", "#5A3420", "#3E2416"],
    cabelo: [["careca", "Careca"], ["curto", "Curto"], ["topete", "Topete"], ["franja", "Franja"], ["cacheado", "Cacheado"], ["blackpower", "Black power"], ["longo", "Longo"], ["coque", "Coque"], ["rabo", "Rabo de cavalo"]],
    corCabelo: [["#1b1b1b", "Preto"], ["#3b2416", "Castanho escuro"], ["#6b4226", "Castanho"], ["#e1b858", "Loiro"], ["#b5462a", "Ruivo"], ["#b9b9b9", "Grisalho"], ["#2f6bd8", "Azul"], ["#e66aa8", "Rosa"], ["#22c55e", "Verde"]],
    olhos: [["#5b3a1e", "Castanho"], ["#1a1a1a", "Preto"], ["#3f8f4f", "Verde"], ["#3a7bd5", "Azul"], ["#b07d2b", "Mel"], ["#7d8a96", "Cinza"]],
  };
  const DEF = { formato: "redondo", pele: "#E8B48A", cabelo: "curto", corCabelo: "#3b2416", olhos: "#5b3a1e" };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const val = (x) => (Array.isArray(x) ? x[0] : x);
  function normalize(a) {
    const o = Object.assign({}, DEF, a || {});
    const ok = (k, v) => OPT[k].some((x) => val(x) === v);
    for (const k of Object.keys(DEF)) if (!ok(k, o[k])) o[k] = DEF[k];
    return o;
  }
  function random() {
    return { formato: val(pick(OPT.formato)), pele: pick(OPT.pele), cabelo: val(pick(OPT.cabelo)), corCabelo: val(pick(OPT.corCabelo)), olhos: val(pick(OPT.olhos)) };
  }
  const GEO = { redondo: [34, 30], oval: [30, 26], quadrado: [34, 28], longo: [30, 22], coracao: [35, 27] };
  function shade(hex, f) {
    const n = parseInt(hex.slice(1), 16);
    const c = (s) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
    return "#" + ((1 << 24) | (c(16) << 16) | (c(8) << 8) | c(0)).toString(16).slice(1);
  }
  function headShape(f, fill, stroke) {
    const s = `fill="${fill}" stroke="${stroke}" stroke-width="1.5"`;
    if (f === "oval") return `<ellipse cx="60" cy="64" rx="30" ry="38" ${s}/>`;
    if (f === "quadrado") return `<rect x="26" y="28" width="68" height="72" rx="20" ${s}/>`;
    if (f === "longo") return `<rect x="30" y="22" width="60" height="82" rx="28" ${s}/>`;
    if (f === "coracao") return `<path d="M25 54 Q25 27 60 27 Q95 27 95 54 Q95 86 60 101 Q25 86 25 54Z" ${s}/>`;
    return `<circle cx="60" cy="64" r="34" ${s}/>`;
  }
  function svg(a, size) {
    const o = normalize(a);
    const [w, t] = GEO[o.formato];
    const L = 60 - w, R = 60 + w, hc = o.corCabelo, hd = shade(hc, 0.78);
    const skinD = shade(o.pele, 0.85);
    const top = `M${L} ${t + 26} Q${L - 1} ${t - 5} 60 ${t - 5} Q${R + 1} ${t - 5} ${R} ${t + 26} Q${R - 9} ${t + 9} 60 ${t + 9} Q${L + 9} ${t + 9} ${L} ${t + 26}Z`;
    let back = "", front = "";
    switch (o.cabelo) {
      case "curto": front = `<path d="${top}" fill="${hc}"/>`; break;
      case "topete": front = `<path d="${top}" fill="${hc}"/><path d="M${L + 12} ${t + 4} Q52 ${t - 22} ${R - 2} ${t - 2} Q72 ${t - 4} 62 ${t + 6}Z" fill="${hc}"/>`; break;
      case "franja": front = `<path d="${top}" fill="${hc}"/><path d="M${L + 4} ${t + 18} Q60 ${t + 4} ${R - 4} ${t + 18} L${R - 6} ${t + 24} Q72 ${t + 16} 66 ${t + 24} Q60 ${t + 14} 52 ${t + 24} Q46 ${t + 16} ${L + 6} ${t + 24}Z" fill="${hc}"/>`; break;
      case "cacheado": {
        let c = "";
        for (let i = 0; i < 9; i++) { const ang = Math.PI * (1 - i / 8); c += `<circle cx="${(60 + Math.cos(ang) * (w + 1)).toFixed(1)}" cy="${(t + 22 - Math.sin(ang) * 26).toFixed(1)}" r="10" fill="${i % 2 ? hc : hd}"/>`; }
        front = c + `<path d="${top}" fill="${hc}"/>`; break;
      }
      case "blackpower": back = `<circle cx="60" cy="${t + 26}" r="${w + 18}" fill="${hc}"/><circle cx="${60 - w / 2}" cy="${t + 8}" r="12" fill="${hd}" opacity=".5"/>`; front = `<path d="${top}" fill="${hc}"/>`; break;
      case "longo": back = `<rect x="${L - 6}" y="${t + 4}" width="${2 * w + 12}" height="${104 - t}" rx="22" fill="${hd}"/>`; front = `<path d="${top}" fill="${hc}"/><path d="M${L} ${t + 26} Q${L - 4} 70 ${L + 2} 96 L${L + 8} 96 Q${L + 4} 66 ${L + 10} ${t + 16}Z M${R} ${t + 26} Q${R + 4} 70 ${R - 2} 96 L${R - 8} 96 Q${R - 4} 66 ${R - 10} ${t + 16}Z" fill="${hc}"/>`; break;
      case "coque": back = `<circle cx="60" cy="${t - 10}" r="14" fill="${hc}"/><circle cx="56" cy="${t - 14}" r="4" fill="${shade(hc, 1.25)}" opacity=".5"/>`; front = `<path d="${top}" fill="${hc}"/>`; break;
      case "rabo": back = `<path d="M${R - 6} ${t + 10} Q${R + 22} ${t + 14} ${R + 14} ${t + 58} Q${R + 6} ${t + 40} ${R - 8} ${t + 30}Z" fill="${hd}"/>`; front = `<path d="${top}" fill="${hc}"/><circle cx="${R - 4}" cy="${t + 12}" r="4" fill="#22c55e"/>`; break;
      default: front = `<ellipse cx="${60 - w / 3}" cy="${t + 8}" rx="8" ry="4" fill="#fff" opacity=".25"/>`;
    }
    const eye = (cx) => `<ellipse cx="${cx}" cy="62" rx="6.5" ry="7" fill="#fff"/><circle cx="${cx}" cy="63" r="4.4" fill="${o.olhos}"/><circle cx="${cx}" cy="63" r="2" fill="#111"/><circle cx="${cx + 1.6}" cy="61.2" r="1.3" fill="#fff"/>`;
    const brow = (x1, x2, up) => `<path d="M${x1} ${up} Q${(x1 + x2) / 2} ${up - 4} ${x2} ${up}" stroke="${o.cabelo === "careca" ? shade(o.pele, 0.55) : hd}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    const sz = size || 40;
    return `<svg class="av" width="${sz}" height="${sz}" viewBox="0 0 120 120" role="img" aria-label="Avatar sorrindo" xmlns="http://www.w3.org/2000/svg">
<circle cx="60" cy="60" r="58" fill="#13201a"/>${back}
<ellipse cx="${L - 1}" cy="66" rx="6" ry="8" fill="${skinD}"/><ellipse cx="${R + 1}" cy="66" rx="6" ry="8" fill="${skinD}"/>
${headShape(o.formato, o.pele, skinD)}${front}
${brow(42, 53, 52)}${brow(67, 78, 52)}${eye(47)}${eye(73)}
<path d="M58 66 Q60 72 62 70" stroke="${skinD}" stroke-width="2" fill="none" stroke-linecap="round"/>
<circle cx="40" cy="76" r="5.5" fill="#ff7b9c" opacity=".35"/><circle cx="80" cy="76" r="5.5" fill="#ff7b9c" opacity=".35"/>
<path d="M46 77 Q60 96 74 77 Z" fill="#7a2230"/><path d="M50 79 Q60 83 70 79 L69 81 Q60 85 51 81Z" fill="#fff"/><path d="M53 87 Q60 92 67 87 Q60 84 53 87Z" fill="#f06a7f"/>
</svg>`;
  }
  return { OPT, DEF, svg, normalize, random, val };
})();
