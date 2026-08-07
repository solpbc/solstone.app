// source:
// (function () {
//   On ordinary support-form submission, disable submit controls and announce
//   progress. Native form submission remains the authorization path.
// })();

export const SUPPORT_FORMS_JS = `(function(){function r(){for(var e=document.querySelectorAll("form[data-support-form] button[type=submit]"),t=0;t<e.length;t++)e[t].disabled=!1}document.addEventListener("submit",function(e){var t=e.target;if(!(t instanceof HTMLFormElement)||!t.matches("form[data-support-form]"))return;var n=t.querySelector("[data-support-progress]"),o=t.querySelectorAll('button[type="submit"]');for(var r=0;r<o.length;r++)o[r].disabled=!0;n&&(n.hidden=!1,n.textContent="working…")}),window.addEventListener("pageshow",r)})();`;
