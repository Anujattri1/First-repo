// ---------------------------------------------------------------------------
// Titanium Army — frontend entry (ES module, no build step required).
// Progressive enhancement: the page works fully without JS; with JS it
// fetches live content from /api/public and refreshes cards dynamically.
// ---------------------------------------------------------------------------

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- API helper ------------------------------------------------------
async function api(path) {
  try {
    const res = await fetch(`/api/public${path}`, { headers: { accept: "application/json" } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch {
    return null; // offline/API down → static fallback content stays visible
  }
}

// ---------- Live content binding --------------------------------------------
async function bindContent() {
  const [content, settings] = await Promise.all([api("/content"), api("/settings")]);
  if (content) {
    for (const el of $$("[data-content]")) {
      const value = content[el.dataset.content];
      if (value) el.textContent = value;
    }
    if (content.channelUrl) {
      for (const a of $$("[data-channel]")) a.href = content.channelUrl;
    }
  }
  if (settings?.accent) document.documentElement.style.setProperty("--lime", settings.accent);
  if (settings?.seoDescription) $('meta[name="description"]')?.setAttribute("content", settings.seoDescription);
}

// ---------- Dynamic video grid ------------------------------------------------
async function renderVideos() {
  const videos = await api("/videos");
  if (!videos?.length) return;
  const grid = $("#videoGrid");
  if (!grid) return;
  grid.innerHTML = videos.map((v) => `
    <article class="experiment-card reveal in">
      <a class="card-media-link" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer" aria-label="Watch ${esc(v.title)} on YouTube">
        <img src="${esc(v.thumbnail)}" alt="${esc(v.title)} thumbnail" loading="lazy">
      </a>
      <div class="card-content">
        <span>${esc(v.category)}</span>
        <h3>${esc(v.title)}</h3>
        <p>${esc(v.description)}</p>
        <a class="text-link" href="${esc(v.url)}" target="_blank" rel="noopener noreferrer">Watch on YouTube</a>
      </div>
    </article>`).join("");
  observeReveals();
}

// ---------- Reveal-on-scroll --------------------------------------------------
let io;
function observeReveals() {
  if (!("IntersectionObserver" in window)) { $$(".reveal").forEach((el) => el.classList.add("in")); return; }
  io ??= new IntersectionObserver((entries) => {
    for (const e of entries) if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); }
  }, { threshold: 0.12 });
  $$(".reveal:not(.in)").forEach((el) => io.observe(el));
}

// ---------- Counters -----------------------------------------------------------
function runCounters() {
  const els = $$(".counter");
  if (!els.length) return;
  const co = new IntersectionObserver((entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      co.unobserve(e.target);
      const target = Number(e.target.dataset.target) || 0;
      const suffix = e.target.dataset.suffix || "";
      const t0 = performance.now(), dur = 1400;
      const step = (now) => {
        const p = Math.min(1, (now - t0) / dur);
        e.target.textContent = Math.round(target * (1 - Math.pow(1 - p, 3))) + suffix;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }, { threshold: 0.5 });
  els.forEach((el) => co.observe(el));
}

// ---------- Mobile nav ----------------------------------------------------------
function initNav() {
  const toggle = $("#navToggle"), menu = $("#mobileNav"), header = $("#navbar");
  let scrollY = 0;
  const open = () => {
    scrollY = window.scrollY;
    document.body.style.cssText = `position:fixed;top:-${scrollY}px;width:100%`;
    menu?.classList.add("open"); toggle?.classList.add("active");
    toggle?.setAttribute("aria-expanded", "true");
  };
  const close = () => {
    menu?.classList.remove("open"); toggle?.classList.remove("active");
    toggle?.setAttribute("aria-expanded", "false");
    document.body.style.cssText = "";
    window.scrollTo(0, scrollY);
  };
  toggle?.addEventListener("click", () => menu.classList.contains("open") ? close() : open());
  $$("a", menu).forEach((a) => a.addEventListener("click", close));
  const onScroll = () => header?.classList.toggle("header-active", window.scrollY > 50);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

// ---------- Preloader ------------------------------------------------------------
function initPreloader() {
  const pre = $("#preloader");
  if (!pre) return;
  const hide = () => { pre.classList.add("hidden"); setTimeout(() => (pre.style.display = "none"), 350); };
  window.addEventListener("load", hide, { once: true });
  setTimeout(hide, 900);
}

// ---------- Particles (skips low-power devices / reduced motion) -------------------
function initParticles() {
  const canvas = $("#particles");
  if (!canvas) return;
  if (matchMedia("(prefers-reduced-motion: reduce)").matches || (navigator.hardwareConcurrency ?? 8) <= 4) {
    canvas.remove(); return;
  }
  const ctx = canvas.getContext("2d");
  let w, h, parts, raf;
  const resize = () => {
    w = canvas.width = innerWidth; h = canvas.height = innerHeight;
    const count = Math.min(70, Math.floor(w * h / 26000));
    parts = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.6 + 0.4
    }));
  };
  const tick = () => {
    ctx.clearRect(0, 0, w, h);
    const color = getComputedStyle(document.documentElement).getPropertyValue("--lime").trim() || "#c8ff39";
    ctx.fillStyle = color; ctx.globalAlpha = 0.35;
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy;
      if (p.x < 0) p.x = w; if (p.x > w) p.x = 0;
      if (p.y < 0) p.y = h; if (p.y > h) p.y = 0;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    raf = requestAnimationFrame(tick);
  };
  // Pause when tab hidden — saves battery & CPU under load.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelAnimationFrame(raf); else tick();
  });
  addEventListener("resize", resize);
  resize(); tick();
}

// ---------- Boot ---------------------------------------------------------------------
initPreloader();
initNav();
initParticles();
observeReveals();
runCounters();
bindContent();
renderVideos();
