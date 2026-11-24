/* css/library.css — estilos de la pestaña My library.
   Usa las variables de style.css (--a, --mut, --line, --ink). */

/* Mostrar solo My library cuando la pestaña está activa */
#view-library{display:none}
.main.lib-open #view-library{display:block}
.main.lib-open > :not(.top):not(#view-library){display:none}
#view-library [hidden]{display:none!important}

/* Filtros */
.lib-filters{display:flex;gap:8px;overflow-x:auto;scrollbar-width:none;margin-bottom:14px}
.lib-filters::-webkit-scrollbar{display:none}
.lib-chip{display:inline-flex;align-items:center;white-space:nowrap;height:38px;padding:0 18px;border-radius:20px;
  font-weight:800;color:var(--mut);background:rgba(255,255,255,.1);transition:background .2s,color .2s}
.lib-chip:hover{background:rgba(255,255,255,.16);color:#fff}
.lib-chip.on{background:var(--a);color:var(--ink)}
.lib-toolbar{margin-bottom:14px}

/* Rejilla */
.lib-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:16px}
.lib-card{min-width:0;cursor:pointer;transition:transform .2s}
.lib-card:hover{transform:translateY(-4px)}
.lib-card p{font-size:14px;font-weight:700;margin-top:8px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.lib-card > span{display:block;font-size:12.5px;color:var(--mut);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}

/* Portada (si no hay imagen, muestra la inicial sobre un degradado) */
.lib-cover{position:relative;aspect-ratio:1;border-radius:14px;overflow:hidden;
  display:grid;place-items:center;
  background:linear-gradient(135deg,hsl(var(--h) 70% 45%),hsl(calc(var(--h) + 40) 70% 28%))}
.lib-cover span{font-size:64px;font-weight:900;color:rgba(255,255,255,.88)}
.lib-cover img{position:absolute;inset:0;width:100%;height:100%}

/* Botones sobre la portada */
.lib-btn{position:absolute;top:8px;width:34px;height:34px;border-radius:50%;display:grid;place-items:center;
  font-size:16px;line-height:1;background:rgba(0,0,0,.55);color:#fff;transition:background .2s,color .2s}
.lib-btn.left{left:8px}
.lib-btn.right{right:8px}
.lib-btn:hover{background:rgba(0,0,0,.8)}
.lib-btn.fav[aria-pressed=true]{color:#ffd54a}

/* Tarjeta de playlist */
.lib-pl{position:relative;aspect-ratio:1;border-radius:14px;padding:14px;display:flex;flex-direction:column;justify-content:flex-end;
  background:linear-gradient(135deg,hsl(var(--h) 55% 32%),hsl(calc(var(--h) + 40) 55% 16%));border:1px solid var(--line)}
.lib-pl h4{font-size:16px;overflow-wrap:anywhere}
.lib-pl small{color:var(--mut)}

.lib-empty{color:var(--mut);text-align:center;margin:48px 12px}

@media (max-width:480px){
  .lib-grid{grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:12px}
  .lib-cover span{font-size:52px}
}