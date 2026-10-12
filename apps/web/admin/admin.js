// ---------------------------------------------------------------------------
// Titanium Army admin dashboard — talks to the real backend API.
// Session = JWT kept in sessionStorage (cleared when the tab closes).
// ---------------------------------------------------------------------------
const $ = (s) => document.querySelector(s);
const esc = (x) => String(x ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

const TOKEN_KEY = "ta.jwt";
const getToken = () => sessionStorage.getItem(TOKEN_KEY);
const setToken = (t) => sessionStorage.setItem(TOKEN_KEY, t);
const clearToken = () => sessionStorage.removeItem(TOKEN_KEY);
let me = null;
let editingVideoId = null;

// ---------- API client -------------------------------------------------------
async function call(path, { method = "GET", body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      "content-type": "application/json",
      ...(getToken() ? { authorization: `Bearer ${getToken()}` } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try { data = await res.json(); } catch {}
  if (!res.ok) {
    if (res.status === 401 && $("#app").hidden === false) logout("Session expired — please sign in again.");
    const err = new Error(data?.message || `Request failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return data;
}

// ---------- Notice ------------------------------------------------------------
let noticeTimer;
function notify(text, isError = false) {
  const n = $("#notice");
  n.textContent = text;
  n.classList.toggle("error", isError);
  n.classList.add("show");
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => n.classList.remove("show"), 2600);
}

// ---------- Auth flows ---------------------------------------------------------
function setSession(token, user) {
  setToken(token);
  me = user;
}
function logout(msg) {
  clearToken();
  me = null;
  $("#app").hidden = true;
  $("#login").hidden = false;
  if (msg) notify(msg, true);
}

$("#loginForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  $("#error").style.display = "none";
  try {
    const { token, user } = await call("/auth/login", { method: "POST", body: { email: $("#email").value, password: $("#password").value } });
    setSession(token, user);
    await enterApp();
  } catch (err) {
    $("#error").textContent = err.message;
    $("#error").style.display = "block";
  }
});

$("#logout").addEventListener("click", () => logout("Signed out."));

async function enterApp() {
  $("#login").hidden = true;
  $("#app").hidden = false;
  $("#currentUser").textContent = `${me.name} · ${me.role}`;
  $("#roleBadge").textContent = `${me.role.toUpperCase()} MODE`;
  // Members cannot manage anything; hide write sections for them.
  $("#navUsers").hidden = me.role !== "admin";
  await refreshAll();
}

// ---------- Data loading ----------------------------------------------------------
const state = { videos: [], users: [], content: {}, settings: {}, overview: null };

async function refreshAll() {
  try {
    const [videos, content, settings, overview] = await Promise.all([
      call("/admin/videos"), call("/admin/content"), call("/admin/settings"), call("/admin/overview")
    ]);
    Object.assign(state, { videos, content, settings, overview });
    if (me.role === "admin") state.users = await call("/admin/users");
    render();
  } catch (err) { notify(err.message, true); }
}

// ---------- Renderers ---------------------------------------------------------------
function badge(status) { return `<span class="tag ${status === "draft" ? "draft" : ""}">${esc(status)}</span>`; }

function render() {
  document.documentElement.style.setProperty("--lime", state.settings.accent || "#c8ff39");
  const o = state.overview ?? {};
  $("#published").textContent = o.publishedVideos ?? 0;
  $("#drafts").textContent = o.draftVideos ?? 0;
  $("#userTotal").textContent = o.users ?? 0;
  $("#videoTotalCard").textContent = o.totalVideos ?? 0;

  $("#latestRows").innerHTML = state.videos.slice(0, 5).map((v) =>
    `<tr><td><b>${esc(v.title)}</b></td><td>${badge(v.status)}</td><td>${esc(v.viewsLabel)}</td></tr>`).join("");

  $("#activityList").innerHTML = (o.recentActivity ?? []).map((a) =>
    `<p>Video “${esc(a.title)}” updated<br><small>${esc(a.at)}</small></p>`).join("") || `<p class="muted">No activity yet.</p>`;

  $("#videoTotal").textContent = `${state.videos.length} total`;
  $("#videoRows").innerHTML = state.videos.map((v) => `
    <tr>
      <td><b>${esc(v.title)}</b><br><span class="muted">${esc(v.description || "No description")}</span></td>
      <td>${esc(v.category)}</td><td>${badge(v.status)}</td>
      <td style="white-space:nowrap">
        <button class="secondary" style="padding:6px 8px;font-size:12px" data-edit="${v.id}">Edit</button>
        <button class="remove" data-del-video="${v.id}">Remove</button>
      </td>
    </tr>`).join("");

  if (me.role === "admin") {
    $("#peopleTotal").textContent = `${state.users.length} total`;
    $("#userRows").innerHTML = state.users.map((u) => `
      <tr>
        <td><b>${esc(u.name)}</b></td><td>${esc(u.email)}</td><td>${esc(u.role)}</td>
        <td>${u.active ? badge("published") : badge("draft")}</td>
        <td style="white-space:nowrap">
          ${u.active
            ? `<button class="secondary" style="padding:6px 8px;font-size:12px" data-deactivate="${u.id}">Deactivate</button>`
            : `<button class="secondary" style="padding:6px 8px;font-size:12px" data-activate="${u.id}">Activate</button>`}
          ${u.id !== me.id ? `<button class="remove" data-del-user="${u.id}">Remove</button>` : "You"}
        </td>
      </tr>`).join("");
  }

  for (const k of ["heroTitle", "heroText", "channelUrl", "footerLabel", "aboutText"]) $("#"+k).value = state.content[k] ?? "";
  for (const k of ["siteName", "accent", "notificationEmail", "seoDescription"]) $("#"+k).value = state.settings[k] ?? "";
  preview();
}

function preview() {
  $("#previewTitle").textContent = $("#heroTitle").value;
  $("#previewText").textContent = $("#heroText").value;
}
$("#heroTitle").addEventListener("input", preview);
$("#heroText").addEventListener("input", preview);

// ---------- Video CRUD -----------------------------------------------------------
function resetVideoForm() {
  editingVideoId = null;
  $("#videoForm").reset();
  $("#videoFormTitle").textContent = "Add a video";
  $("#videoSubmit").textContent = "Add video";
}

$("#videoForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const payload = {
    title: $("#vTitle").value.trim(),
    category: $("#vCategory").value,
    description: $("#vDescription").value.trim(),
    url: $("#vUrl").value.trim(),
    thumbnail: $("#vThumb").value.trim(),
    status: $("#vStatus").value,
    viewsLabel: $("#vViews").value.trim() || "—"
  };
  try {
    if (editingVideoId) { await call(`/admin/videos/${editingVideoId}`, { method: "PUT", body: payload }); notify("Video updated."); }
    else { await call("/admin/videos", { method: "POST", body: payload }); notify("Video added."); }
    await call("/cache/purge", { method: "POST" }).catch(()=>{});
    resetVideoForm();
    await refreshAll();
  } catch (err) { notify(err.message, true); }
});
$("#videoReset").addEventListener("click", resetVideoForm);

// ---------- Content / Settings ------------------------------------------------------
$("#contentForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {};
  for (const k of ["heroTitle", "heroText", "channelUrl", "footerLabel", "aboutText"]) body[k] = $("#"+k).value.trim();
  try { await call("/admin/content", { method: "PUT", body }); await call("/cache/purge", { method: "POST" }).catch(()=>{}); notify("Website content saved & cache purged — live immediately."); await refreshAll(); }
  catch (err) { notify(err.message, true); }
});

$("#settingsForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const body = {};
  for (const k of ["siteName", "accent", "notificationEmail", "seoDescription"]) body[k] = $("#"+k).value;
  try { await call("/admin/settings", { method: "PUT", body }); await call("/cache/purge", { method: "POST" }).catch(()=>{}); notify("Settings saved & cache purged."); await refreshAll(); }
  catch (err) { notify(err.message, true); }
});

$("#passwordForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await call("/auth/change-password", { method: "POST", body: { currentPassword: $("#curPass").value, newPassword: $("#newPass").value } });
    notify("Password updated.");
    e.target.reset();
  } catch (err) { notify(err.message, true); }
});

// ---------- Users --------------------------------------------------------------
$("#userForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  try {
    await call("/admin/users", { method: "POST", body: { name: $("#uName").value.trim(), email: $("#uEmail").value.trim(), password: $("#uPassword").value, role: $("#uRole").value } });
    notify("User created.");
    e.target.reset();
    await refreshAll();
  } catch (err) { notify(err.message, true); }
});

// ---------- Delegated table actions ----------------------------------------------
document.addEventListener("click", async (e) => {
  const btn = e.target.closest("button");
  if (!btn) return;
  const id = btn.dataset.delVideo ?? btn.dataset.edit ?? btn.dataset.delUser ?? btn.dataset.activate ?? btn.dataset.deactivate;
  if (!id) return;
  try {
    if (btn.dataset.delVideo) {
      if (!confirm("Delete this video?")) return;
      await call(`/admin/videos/${id}`, { method: "DELETE" }); await call("/cache/purge", { method: "POST" }).catch(()=>{}); notify("Video removed.");
    } else if (btn.dataset.edit) {
      const v = state.videos.find((x) => x.id === Number(id));
      editingVideoId = v.id;
      $("#videoFormTitle").textContent = `Edit: ${v.title}`;
      $("#videoSubmit").textContent = "Save changes";
      $("#vTitle").value = v.title; $("#vCategory").value = v.category; $("#vDescription").value = v.description;
      $("#vUrl").value = v.url; $("#vThumb").value = v.thumbnail; $("#vStatus").value = v.status; $("#vViews").value = v.viewsLabel;
      document.querySelector('[data-page="videos"]').click();
      return;
    } else if (btn.dataset.delUser) {
      if (!confirm("Delete this user permanently?")) return;
      await call(`/admin/users/${id}`, { method: "DELETE" }); notify("User deleted.");
    } else if (btn.dataset.activate) {
      await call(`/admin/users/${id}`, { method: "PUT", body: { active: true } }); notify("User activated.");
    } else if (btn.dataset.deactivate) {
      await call(`/admin/users/${id}`, { method: "PUT", body: { active: false } }); notify("User deactivated.");
    }
    await refreshAll();
  } catch (err) { notify(err.message, true); }
});

// ---------- Page navigation -----------------------------------------------------
document.querySelectorAll("[data-page]").forEach((b) => b.addEventListener("click", () => {
  document.querySelectorAll("[data-page]").forEach((x) => x.classList.remove("active"));
  document.querySelectorAll(".view").forEach((x) => x.classList.remove("active"));
  b.classList.add("active");
  $("#" + b.dataset.page).classList.add("active");
  $("#title").textContent = b.textContent.trim();
}));

$("#date").textContent = new Intl.DateTimeFormat("en", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(new Date());

// ---------- Boot: restore session if present ----------------------------------------
(async () => {
  if (!getToken()) return;
  try {
    const { user } = await call("/auth/me");
    me = user;
    await enterApp();
  } catch { clearToken(); }
})();
