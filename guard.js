/* bloqueia o CRM dentro de iframe de outro site (clickjacking) */
(function () {
  if (window.top !== window.self) {
    try { window.top.location = window.self.location.href; } catch (e) {}
    document.documentElement.style.display = "none";
    throw new Error("CRM não pode ser aberto dentro de outro site.");
  }
})();
