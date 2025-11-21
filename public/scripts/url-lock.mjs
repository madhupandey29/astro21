// Tiny URL lock to prevent silent /slug -> / rewrites during hydration.
(function(){try{
  var initialPath = location.pathname;
  var initialFull = location.pathname + location.search + location.hash;
  var until = Date.now() + 8000; // guard window

  var p = history.pushState, r = history.replaceState;
  function isRoot(url){
    try{ var u = new URL(url, location.href); return u.pathname === "/" && initialPath !== "/"; }
    catch(_e){ return false; }
  }

  history.pushState = function(s,t,u){ if(Date.now()<until && isRoot(u)) return; return p.apply(this, arguments); };
  history.replaceState = function(s,t,u){ if(Date.now()<until && isRoot(u)) return; return r.apply(this, arguments); };

  function restore(){
    if(Date.now()<until && location.pathname === "/" && initialPath !== "/"){
      r.call(history, null, "", initialFull);
    }
  }

  if(initialPath !== "/"){
    queueMicrotask(restore);
    document.addEventListener("DOMContentLoaded", restore, { once: true });
    setTimeout(restore, 0);
    setTimeout(restore, 200);
    setTimeout(restore, 800);
  }
}catch(_e){}})();
