/* rótulos das tabelas no celular */
new MutationObserver(()=>{for(const c of document.querySelectorAll('.stack td:not([data-l])')){let i=0,p=c;while(p=p.previousElementSibling)i+=p.colSpan;const t=c.closest('table');c.dataset.l=(t&&t.rows[0].cells[i]&&t.rows[0].cells[i].textContent)||''}}).observe(document,{childList:true,subtree:true})
