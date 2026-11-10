export const THEME_KEY = "mp-theme";

/**
 * Runs in <head> before the first paint, so the page never flashes the wrong theme.
 * With no stored choice it follows the OS. Kept tiny and dependency-free on purpose.
 * (A plain module, not a client component, so the server layout can inline it.)
 */
export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem("${THEME_KEY}")||"system";var d=c==="dark"||(c==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var h=document.documentElement;h.dataset.theme=d?"dark":"light";h.classList.toggle("dark",d);}catch(e){}})();`;
