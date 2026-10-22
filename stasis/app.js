(() => {
  "use strict";

  const app = document.getElementById("app");
  const toastRegion = document.getElementById("toastRegion");
  const cfg = window.STASIS_CONFIG || {};

  const STATUS_OPTIONS = [
    ["available", "🟢 available"],
    ["working", "💻 working"],
    ["studying", "📚 studying"],
    ["sleeping", "🌙 sleeping"],
    ["eating", "🍜 eating"],
    ["traveling", "✈️ traveling"],
    ["commuting", "🚆 commuting"],
    ["family", "🏡 with family"],
    ["friends", "🫶 with friends"],
    ["exercising", "🏃 exercising"],
    ["resting", "☁️ resting"],
    ["busy", "⏳ busy"],
    ["away", "🌿 away"],
    ["other", "♡ something else"]
  ];

  const MOOD_OPTIONS = [
    ["happy", "😊 happy"],
    ["excited", "✨ excited"],
    ["affectionate", "💗 affectionate"],
    ["calm", "🌷 calm"],
    ["okay", "🙂 okay"],
    ["tired", "😴 tired"],
    ["stressed", "😵‍💫 stressed"],
    ["overwhelmed", "🌧️ overwhelmed"],
    ["sad", "😔 sad"],
    ["upset", "🥺 upset"],
    ["sick", "🤒 sick"],
    ["other", "♡ something else"]
  ];

  const AVAILABILITY_OPTIONS = [
    ["talk_to_me", "💬 talk to me"],
    ["messages_welcome", "💌 messages welcome"],
    ["slow_replies", "🐢 slow replies"],
    ["busy_reachable", "📲 busy but reachable"],
    ["urgent_only", "🔕 urgent only"],
    ["do_not_disturb", "🌙 do not disturb"]
  ];

  const ACCENT_OPTIONS = [
    ["rose", "rose"], ["blush", "blush"], ["lavender", "lavender"],
    ["sky", "sky"], ["mint", "mint"], ["gold", "gold"], ["mono", "mono"]
  ];

  const THEME_OPTIONS = [["system", "follow device"], ["light", "light"], ["dark", "dark"]];

  const state = {
    client: null,
    session: null,
    user: null,
    profile: null,
    dashboard: null,
    currentRoom: null,
    currentSubscription: null,
    authMode: "signin",
    deferredInstallPrompt: null,
    roomReloadTimer: null,
    dashboardReloadTimer: null,
    noteSaveTimers: new Map(),
    globalSaveTimer: null,
    online: navigator.onLine,
    recoveringPassword: false
  };

  const e = escapeHTML;

  function escapeHTML(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function configIsReady() {
    return /^https:\/\/.+\.supabase\.co$/i.test(cfg.supabaseUrl || "") &&
      typeof cfg.supabasePublishableKey === "string" &&
      cfg.supabasePublishableKey.length > 20 &&
      !cfg.supabasePublishableKey.includes("REPLACE_ME");
  }

  function toast(message, type = "") {
    const node = document.createElement("div");
    node.className = `toast ${type}`.trim();
    node.textContent = message;
    toastRegion.appendChild(node);
    window.setTimeout(() => node.remove(), 3600);
  }

  function initials(name) {
    const words = String(name || "?").trim().split(/\s+/).filter(Boolean);
    return (words.slice(0, 2).map(word => word[0]).join("") || "?").toUpperCase();
  }

  function labelFor(options, value) {
    return options.find(([key]) => key === value)?.[1] || value || "—";
  }

  function optionsHTML(options, selected) {
    return options.map(([value, label]) => `<option value="${e(value)}" ${value === selected ? "selected" : ""}>${e(label)}</option>`).join("");
  }

  function cardStatusLabel(card) {
    if (!card) return "—";
    return card.status === "other" && card.custom_status?.trim() ? card.custom_status.trim() : labelFor(STATUS_OPTIONS, card.status);
  }

  function cardMoodLabel(card) {
    if (!card) return "—";
    return card.mood === "other" && card.custom_mood?.trim() ? card.custom_mood.trim() : labelFor(MOOD_OPTIONS, card.mood);
  }

  function untilText(value) {
    if (!value) return "";
    const date = new Date(value);
    const expired = date.getTime() < Date.now();
    return `${expired ? "ended " : "until "}${date.toLocaleString([], { dateStyle: "medium", timeStyle: "short" })}`;
  }

  function applyTheme(theme = state.profile?.theme || localStorage.getItem("stasis-theme") || "system") {
    const resolved = theme === "system" ? (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light") : theme;
    document.documentElement.dataset.theme = resolved;
    const themeMeta = document.querySelector('meta[name="theme-color"]');
    if (themeMeta) themeMeta.setAttribute("content", resolved === "dark" ? "#171216" : "#fff6f8");
    localStorage.setItem("stasis-theme", theme);
  }

  function notificationPermission() {
    return "Notification" in window ? Notification.permission : "unsupported";
  }

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
    const rawData = atob(base64);
    return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
  }

  function relativeTime(value) {
    if (!value) return "not updated yet";
    const date = new Date(value);
    const diff = Math.max(0, Date.now() - date.getTime());
    const sec = Math.round(diff / 1000);
    if (sec < 15) return "updated just now";
    if (sec < 60) return `updated ${sec}s ago`;
    const min = Math.round(sec / 60);
    if (min < 60) return `updated ${min}m ago`;
    const hr = Math.round(min / 60);
    if (hr < 24) return `updated ${hr}h ago`;
    const days = Math.round(hr / 24);
    return `updated ${days}d ago`;
  }

  function toLocalInput(value) {
    if (!value) return "";
    const date = new Date(value);
    const offset = date.getTimezoneOffset() * 60000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
  }

  function fromLocalInput(value) {
    return value ? new Date(value).toISOString() : null;
  }

  function route() {
    const hash = location.hash || "#/dashboard";
    const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
    return { name: parts[0] || "dashboard", id: parts[1] || null, sub: parts[2] || null, item: parts[3] || null, parts };
  }

  function navigate(path) {
    const next = path.startsWith("#") ? path : `#/${path.replace(/^\//, "")}`;
    if (location.hash === next) renderRoute();
    else location.hash = next;
  }

  function inviteURL(code) {
    return `${location.origin}${location.pathname}#/join/${encodeURIComponent(code)}`;
  }

  function stopRoomSubscription() {
    window.StasisGames?.stop?.();
    if (state.currentSubscription && state.client) {
      state.client.removeChannel(state.currentSubscription);
      state.currentSubscription = null;
    }
    if (state.roomReloadTimer) {
      clearTimeout(state.roomReloadTimer);
      state.roomReloadTimer = null;
    }
    if (state.dashboardReloadTimer) {
      clearTimeout(state.dashboardReloadTimer);
      state.dashboardReloadTimer = null;
    }
  }

  function clearRoomSubscription() {
    stopRoomSubscription();
    state.currentRoom = null;
  }

  function renderSetup() {
    clearRoomSubscription();
    app.innerHTML = `
      <main class="setup-page">
        <section class="panel setup-card">
          <div class="big-heart">♡</div>
          <h1>stasis is ready to connect</h1>
          <p>The frontend is installed, but it still needs your Supabase project before accounts and rooms can work.</p>
          <ol class="setup-steps">
            <li>Create a free Supabase project.</li>
            <li>Open <span class="code-inline">stasis/supabase/schema.sql</span> in this repo and run the whole file in Supabase → SQL Editor.</li>
            <li>Open Supabase → Project Settings / API and copy the project URL and <strong>publishable</strong> key.</li>
            <li>Paste those two values into <span class="code-inline">stasis/config.js</span>. Never use a service-role or secret key in GitHub Pages.</li>
            <li>In Supabase Auth URL configuration, add your GitHub Pages Stasis URL to the allowed redirect URLs.</li>
            <li>Commit the config change and reload this page.</li>
          </ol>
          <p>Full setup notes are in <span class="code-inline">stasis/SETUP.md</span>.</p>
          <a class="btn soft" href="../">← back to le</a>
        </section>
      </main>`;
  }

  function renderAuth() {
    clearRoomSubscription();
    const signup = state.authMode === "signup";
    app.innerHTML = `
      <main class="auth-page">
        <section class="auth-art">
          <div class="auth-brand">
            <span class="mini">a tiny shared status space</span>
            <h1>stasis ♡</h1>
          </div>
          <div class="auth-copy">
            <h2>know how your people are doing without needing a whole conversation.</h2>
            <p>Create private rooms, share a status, mood, availability, and a little note. Everyone sees the room; everyone controls only their own card.</p>
          </div>
        </section>
        <section class="auth-form-wrap">
          <div class="panel auth-card">
            <div class="auth-tabs">
              <button class="auth-tab ${signup ? "" : "active"}" data-auth-mode="signin" type="button">sign in</button>
              <button class="auth-tab ${signup ? "active" : ""}" data-auth-mode="signup" type="button">make an account</button>
            </div>
            <h2>${signup ? "make a little space" : "welcome back ♡"}</h2>
            <p>${signup ? "Your rooms stay attached to your account across devices." : "Your people are probably doing something cute."}</p>
            <form id="authForm" class="auth-fields">
              ${signup ? `
                <div class="field">
                  <label for="displayName">display name</label>
                  <input id="displayName" name="displayName" autocomplete="name" maxlength="48" placeholder="what should people call you?" required />
                </div>` : ""}
              <div class="field">
                <label for="email">email</label>
                <input id="email" name="email" type="email" autocomplete="email" placeholder="you@example.com" required />
              </div>
              <div class="field">
                <label for="password">password</label>
                <input id="password" name="password" type="password" autocomplete="${signup ? "new-password" : "current-password"}" minlength="8" placeholder="at least 8 characters" required />
              </div>
              <p id="authError" class="error-text" hidden></p>
              <button class="btn primary auth-submit" type="submit">${signup ? "create account ♡" : "sign in"}</button>
            </form>
            ${signup ? "" : `<button id="forgotPasswordButton" class="text-button" type="button">forgot password?</button>`}
            <p class="auth-footer">Private room access is enforced in the database with Row Level Security. Your publishable browser key cannot bypass it.</p>
            <p class="auth-footer"><a href="../">← back to le</a></p>
          </div>
        </section>
      </main>`;

    app.querySelectorAll("[data-auth-mode]").forEach(button => {
      button.addEventListener("click", () => {
        state.authMode = button.dataset.authMode;
        renderAuth();
      });
    });

    document.getElementById("authForm").addEventListener("submit", handleAuthSubmit);
    document.getElementById("forgotPasswordButton")?.addEventListener("click", openForgotPasswordModal);
  }

  function openForgotPasswordModal() {
    openModal(`
      <div class="modal-head"><div><h2>reset password</h2><p>Enter your account email and we’ll send a recovery link.</p></div><button class="modal-close" data-close-modal type="button">×</button></div>
      <form id="forgotPasswordForm" class="modal-body">
        <div class="field"><label>email</label><input id="forgotEmail" type="email" autocomplete="email" placeholder="you@example.com" required /></div>
        <div class="modal-actions"><button class="btn ghost" data-close-modal type="button">cancel</button><button class="btn primary" type="submit">send reset link</button></div>
      </form>`);
    document.getElementById("forgotPasswordForm").addEventListener("submit", async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      const { error } = await state.client.auth.resetPasswordForEmail(document.getElementById("forgotEmail").value.trim(), { redirectTo: `${location.origin}${location.pathname}` });
      if (error) { button.disabled = false; return toast(error.message, "error"); }
      closeModal(); toast("Password reset email sent ♡", "success");
    });
  }

  async function handleAuthSubmit(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const submit = form.querySelector("button[type=submit]");
    const errorNode = document.getElementById("authError");
    const email = form.email.value.trim();
    const password = form.password.value;
    const displayName = form.displayName?.value.trim();

    submit.disabled = true;
    errorNode.hidden = true;
    try {
      if (state.authMode === "signup") {
        const { data, error } = await state.client.auth.signUp({
          email,
          password,
          options: {
            data: { display_name: displayName },
            emailRedirectTo: `${location.origin}${location.pathname}`
          }
        });
        if (error) throw error;
        if (!data.session) {
          toast("Account created — check your email to confirm it, then sign in.", "success");
          state.authMode = "signin";
          renderAuth();
        }
      } else {
        const { error } = await state.client.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (error) {
      errorNode.textContent = error.message || "Something went wrong.";
      errorNode.hidden = false;
    } finally {
      submit.disabled = false;
    }
  }

  async function ensureProfile() {
    if (!state.user) return;
    const { data, error } = await state.client.from("profiles").select("id,display_name,avatar_url,theme,timezone,created_at,updated_at").eq("id", state.user.id).maybeSingle();
    if (error) throw error;
    if (data) {
      state.profile = data;
      const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
      if (data.timezone !== timezone) {
        const { data: updated } = await state.client.from("profiles").update({ timezone }).eq("id", state.user.id).select().single();
        if (updated) state.profile = updated;
      }
      return;
    }
    const fallback = state.user.user_metadata?.display_name || state.user.email?.split("@")[0] || "someone";
    const { data: created, error: insertError } = await state.client.from("profiles").insert({ id: state.user.id, display_name: fallback }).select().single();
    if (insertError) throw insertError;
    state.profile = created;
  }

  function topbarHTML() {
    const name = state.profile?.display_name || state.user?.email || "you";
    return `
      <header class="topbar">
        <a class="brand" href="#/dashboard">
          <span class="brand-mark">♡</span>
          <span class="brand-copy"><strong>stasis</strong><span>little status rooms</span></span>
        </a>
        <div class="top-actions">
          <span class="connection-pill ${state.online ? "online" : "offline"}">${state.online ? "live" : "offline"}</span>
          <a class="icon-button top-home" href="../" aria-label="Back to le">le ♡</a>
          <button id="settingsButton" class="icon-button" type="button">settings</button>
          <button id="profileButton" class="avatar-button" type="button" title="${e(name)}">${e(initials(name))}</button>
        </div>
      </header>`;
  }

  async function loadDashboard() {
    const { data: rooms, error: roomError } = await state.client
      .from("rooms")
      .select("id,name,room_type,icon,accent,invite_code,joining_enabled,created_by,created_at,updated_at")
      .order("created_at", { ascending: false });
    if (roomError) throw roomError;

    const roomIds = (rooms || []).map(room => room.id);
    let members = [], cards = [], profiles = [];
    if (roomIds.length) {
      const [memberResult, cardResult] = await Promise.all([
        state.client.from("room_members").select("room_id,user_id,role,card_order,pinned,joined_at").in("room_id", roomIds),
        state.client.from("stasis_cards").select("room_id,user_id,status,custom_status,mood,custom_mood,availability,note,until_at,updated_at").in("room_id", roomIds)
      ]);
      if (memberResult.error) throw memberResult.error;
      if (cardResult.error) throw cardResult.error;
      members = memberResult.data || [];
      cards = cardResult.data || [];
      const ids = [...new Set(members.map(member => member.user_id))];
      if (ids.length) {
        const profileResult = await state.client.from("profiles").select("id,display_name,avatar_url").in("id", ids);
        if (profileResult.error) throw profileResult.error;
        profiles = profileResult.data || [];
      }
    }

    const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
    const cardMap = new Map(cards.map(card => [`${card.room_id}:${card.user_id}`, card]));
    const memberMap = new Map();
    for (const member of members) {
      if (!memberMap.has(member.room_id)) memberMap.set(member.room_id, []);
      memberMap.get(member.room_id).push({
        ...member,
        profile: profileMap.get(member.user_id),
        card: cardMap.get(`${member.room_id}:${member.user_id}`)
      });
    }

    state.dashboard = { rooms: rooms || [], members: memberMap };
  }

  function renderDashboardHTML() {
    const name = state.profile?.display_name || "you";
    const roomsRaw = state.dashboard?.rooms || [];
    const rooms = [...roomsRaw].sort((a, b) => {
      const ap = (state.dashboard?.members.get(a.id) || []).find(m => m.user_id === state.user.id)?.pinned ? 1 : 0;
      const bp = (state.dashboard?.members.get(b.id) || []).find(m => m.user_id === state.user.id)?.pinned ? 1 : 0;
      return bp - ap || new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at);
    });
    const ownCards = rooms.map(room => (state.dashboard?.members.get(room.id) || []).find(m => m.user_id === state.user.id)?.card).filter(Boolean).sort((a,b) => new Date(b.updated_at) - new Date(a.updated_at));
    const globalSeed = ownCards[0] || { status:"available", custom_status:"", mood:"okay", custom_mood:"", availability:"messages_welcome", until_at:null };
    return `
      ${topbarHTML()}
      <main class="page">
        <section class="hero">
          <div>
            <h1>where is everyone at? ♡</h1>
            <p>Stasis rooms are quieter than chats: one card per person, always current, always yours to control.</p>
          </div>
          <div class="hero-side">
            <p class="eyebrow">signed in as</p>
            <span class="hero-name">${e(name)}</span>
          </div>
        </section>

        <section class="panel action-panel">
          <div class="action-box">
            <strong>make a room</strong>
            <p>Create a two-person room or a group and invite people with a private code.</p>
            <button id="createRoomButton" class="btn primary" type="button">+ create room</button>
          </div>
          <div class="action-box">
            <strong>join with a code</strong>
            <p>Codes are case-insensitive. Spaces are ignored.</p>
            <form id="joinRoomForm" class="inline-form">
              <input id="joinCode" maxlength="24" autocomplete="off" placeholder="PINKLILY" aria-label="Room code" required />
              <button class="btn soft" type="submit">join →</button>
            </form>
          </div>
        </section>

        ${rooms.length ? `<section class="panel global-panel">
          <div class="global-copy"><span class="eyebrow">set everywhere</span><h2>one update, whichever rooms you choose</h2><p>Useful when you’re sleeping, studying, traveling, or just want everyone to know the same thing.</p></div>
          <form id="globalStatusForm" class="global-form">
            <div class="global-fields">
              <div class="field"><label>status</label><select id="globalStatus">${optionsHTML(STATUS_OPTIONS, globalSeed.status)}</select></div>
              <div class="field"><label>mood</label><select id="globalMood">${optionsHTML(MOOD_OPTIONS, globalSeed.mood)}</select></div>
              <div class="field"><label>availability</label><select id="globalAvailability">${optionsHTML(AVAILABILITY_OPTIONS, globalSeed.availability)}</select></div>
            </div>
            <div class="global-custom" id="globalCustomFields" data-status-value="${e(globalSeed.custom_status || "")}" data-mood-value="${e(globalSeed.custom_mood || "")}"></div>
            <div class="global-room-list">${rooms.map(room => `<label class="room-check"><input type="checkbox" name="globalRoom" value="${e(room.id)}" checked /><span>${e(room.icon || "♡")} ${e(room.name)}</span></label>`).join("")}</div>
            <div class="global-bottom"><div class="field compact"><label>until</label><input id="globalUntil" type="datetime-local" value="${e(toLocalInput(globalSeed.until_at))}" /></div><label class="check-item"><input type="checkbox" id="globalIncludeNote" /> include note</label><input id="globalNote" maxlength="1500" placeholder="optional little note" disabled /><button class="btn primary" type="submit">update selected rooms</button></div>
          </form>
        </section>` : ""}

        <div class="section-head">
          <div><h2>your stasis rooms</h2><p>${rooms.length ? `${rooms.length} saved ${rooms.length === 1 ? "room" : "rooms"}` : "nothing here yet"}</p></div>
        </div>

        ${rooms.length ? `<section class="room-grid">${rooms.map(roomTileHTML).join("")}</section>` : `
          <section class="panel empty-state">
            <div class="empty-heart">♡</div>
            <h3>make your first little room</h3>
            <p>Invite one person, or make a group. Once they join, their card updates here in real time.</p>
          </section>`}
      </main>`;
  }

  function roomTileHTML(room) {
    const members = [...(state.dashboard?.members.get(room.id) || [])].sort((a,b) => a.card_order - b.card_order);
    const others = members.filter(member => member.user_id !== state.user.id);
    const peopleText = room.room_type === "direct" ? (others[0]?.profile?.display_name || "waiting for someone") : `${members.length} ${members.length === 1 ? "person" : "people"}`;
    const me = members.find(member => member.user_id === state.user.id);
    const peek = others.slice(0, 3).map(member => {
      const status = member.card ? cardStatusLabel(member.card) : "status unavailable";
      return `<div class="peek-row"><span class="peek-dot"></span><span>${e(member.profile?.display_name || "member")}: ${e(status)}</span></div>`;
    }).join("");
    return `
      <article class="room-tile accent-${e(room.accent || "rose")}" data-room-id="${e(room.id)}">
        <div class="room-meta"><span>${e(room.room_type)}</span><span>${room.joining_enabled ? "joining on" : "closed"}</span></div>
        <div class="room-title-line"><span class="room-icon">${e(room.icon || "♡")}</span><h3>${e(room.name)}</h3></div>
        <div class="summary">${e(peopleText)}</div>
        <div class="room-peek">${peek || `<div class="peek-row"><span class="peek-dot"></span><span>share ${e(room.invite_code)} to invite someone</span></div>`}</div>
        <div class="tile-actions">
          <button class="open-room" data-open-room="${e(room.id)}" type="button">open room →</button>
          <button class="small-menu" data-pin-room="${e(room.id)}" data-pinned="${me?.pinned ? "true" : "false"}" type="button">${me?.pinned ? "unpin" : "pin"}</button>
          <button class="small-menu" data-copy-code="${e(room.invite_code)}" type="button">copy code</button>
        </div>
      </article>`;
  }

  async function renderDashboard() {
    clearRoomSubscription();
    app.innerHTML = `${topbarHTML()}<main class="page"><section class="panel empty-state"><div class="empty-heart">♡</div><h3>loading rooms…</h3></section></main>`;
    wireTopbar();
    try {
      await loadDashboard();
      app.innerHTML = renderDashboardHTML();
      wireTopbar();
      wireDashboard();
      subscribeDashboard();
    } catch (error) {
      renderFatal(error, "Couldn’t load your rooms.");
    }
  }

  function subscribeDashboard() {
    stopRoomSubscription();
    state.currentSubscription = state.client
      .channel(`stasis-dashboard-${state.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stasis_cards" }, scheduleDashboardReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "room_members" }, scheduleDashboardReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, scheduleDashboardReload)
      .subscribe();
  }

  function scheduleDashboardReload() {
    clearTimeout(state.dashboardReloadTimer);
    state.dashboardReloadTimer = setTimeout(async () => {
      if (route().name !== "dashboard") return;
      try {
        await loadDashboard();
        app.innerHTML = renderDashboardHTML();
        wireTopbar();
        wireDashboard();
      } catch (error) {
        console.error(error);
      }
    }, 260);
  }

  function wireTopbar() {
    document.getElementById("settingsButton")?.addEventListener("click", () => navigate("settings"));
    document.getElementById("profileButton")?.addEventListener("click", () => navigate("settings"));
  }

  function wireDashboard() {
    document.getElementById("createRoomButton")?.addEventListener("click", openCreateRoomModal);
    document.getElementById("joinRoomForm")?.addEventListener("submit", handleJoinRoom);
    document.getElementById("globalStatusForm")?.addEventListener("submit", handleGlobalStatus);
    document.getElementById("globalIncludeNote")?.addEventListener("change", event => { document.getElementById("globalNote").disabled = !event.currentTarget.checked; });
    [document.getElementById("globalStatus"), document.getElementById("globalMood")].filter(Boolean).forEach(node => node.addEventListener("change", renderGlobalCustomFields));
    renderGlobalCustomFields();
    app.querySelectorAll("[data-pin-room]").forEach(button => button.addEventListener("click", () => togglePinnedRoom(button.dataset.pinRoom, button.dataset.pinned !== "true")));
    app.querySelectorAll("[data-open-room]").forEach(button => button.addEventListener("click", () => navigate(`room/${button.dataset.openRoom}`)));
    app.querySelectorAll("[data-copy-code]").forEach(button => button.addEventListener("click", async () => {
      await copyText(button.dataset.copyCode);
      toast("Room code copied ♡", "success");
    }));
  }

  function renderGlobalCustomFields() {
    const holder = document.getElementById("globalCustomFields");
    if (!holder) return;
    const status = document.getElementById("globalStatus")?.value;
    const mood = document.getElementById("globalMood")?.value;
    const oldStatus = document.getElementById("globalCustomStatus")?.value ?? holder.dataset.statusValue ?? "";
    const oldMood = document.getElementById("globalCustomMood")?.value ?? holder.dataset.moodValue ?? "";
    holder.innerHTML = `${status === "other" ? `<div class="field"><label>custom status</label><input id="globalCustomStatus" maxlength="60" value="${e(oldStatus)}" placeholder="what are you doing?" /></div>` : ""}${mood === "other" ? `<div class="field"><label>custom mood</label><input id="globalCustomMood" maxlength="60" value="${e(oldMood)}" placeholder="how are you feeling?" /></div>` : ""}`;
    holder.dataset.statusValue = oldStatus; holder.dataset.moodValue = oldMood;
  }

  async function handleGlobalStatus(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const rooms = [...form.querySelectorAll('input[name="globalRoom"]:checked')].map(input => input.value);
    if (!rooms.length) return toast("Choose at least one room.", "error");
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    const includeNote = document.getElementById("globalIncludeNote").checked;
    const fields = ["status", "mood", "availability", "until_at", ...(includeNote ? ["note"] : [])];
    const { data, error } = await state.client.rpc("set_my_stasis_everywhere", {
      p_target_rooms: rooms,
      p_status: document.getElementById("globalStatus").value,
      p_custom_status: document.getElementById("globalCustomStatus")?.value.trim() || "",
      p_mood: document.getElementById("globalMood").value,
      p_custom_mood: document.getElementById("globalCustomMood")?.value.trim() || "",
      p_availability: document.getElementById("globalAvailability").value,
      p_note: includeNote ? document.getElementById("globalNote").value : null,
      p_until_at: fromLocalInput(document.getElementById("globalUntil").value),
      p_fields: fields
    });
    button.disabled = false;
    if (error) return toast(error.message, "error");
    toast(`Updated ${data} ${data === 1 ? "room" : "rooms"} ♡`, "success");
    await loadDashboard();
    app.innerHTML = renderDashboardHTML();
    wireTopbar(); wireDashboard();
  }

  async function togglePinnedRoom(roomId, pinned) {
    const { error } = await state.client.rpc("set_stasis_room_pinned", { p_room: roomId, p_pinned: pinned });
    if (error) return toast(error.message, "error");
    toast(pinned ? "Room pinned ♡" : "Room unpinned.", "success");
    if (route().name === "room") scheduleRoomReload(); else scheduleDashboardReload();
  }

  async function handleJoinRoom(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const code = form.querySelector("#joinCode").value.trim();
    const button = form.querySelector("button");
    button.disabled = true;
    try {
      const { data, error } = await state.client.rpc("join_stasis_room", { p_code: code });
      if (error) throw error;
      const room = Array.isArray(data) ? data[0] : data;
      toast("Joined the room ♡", "success");
      navigate(`room/${room.id}`);
    } catch (error) {
      toast(error.message || "Couldn’t join that room.", "error");
    } finally {
      button.disabled = false;
    }
  }

  function openCreateRoomModal() {
    openModal(`
      <div class="modal-head">
        <div><h2>make a stasis room ♡</h2><p>Two-person rooms stop accepting members after the second person joins. Groups can keep growing.</p></div>
        <button class="modal-close" data-close-modal type="button">×</button>
      </div>
      <form id="createRoomForm" class="modal-body">
        <div class="field">
          <label for="roomName">room name</label>
          <input id="roomName" maxlength="80" placeholder="us ♡" required />
        </div>
        <div class="field">
          <label for="roomType">type</label>
          <select id="roomType"><option value="direct">two people</option><option value="group">group room</option></select>
        </div>
        <div class="split-fields">
          <div class="field"><label for="roomIcon">room icon</label><input id="roomIcon" maxlength="8" value="♡" /></div>
          <div class="field"><label for="roomAccent">accent</label><select id="roomAccent">${optionsHTML(ACCENT_OPTIONS, "rose")}</select></div>
        </div>
        <div class="field">
          <label for="customCode">custom code (optional)</label>
          <input id="customCode" maxlength="24" autocomplete="off" placeholder="leave blank to generate one" />
          <span id="codeAvailability" class="hint-text">4–24 letters, numbers, hyphens, or underscores. Codes are case-insensitive.</span>
        </div>
        <div class="modal-actions">
          <button class="btn ghost" data-close-modal type="button">cancel</button>
          <button class="btn primary" type="submit">create room</button>
        </div>
      </form>`);

    const custom = document.getElementById("customCode");
    let availabilityTimer = null;
    custom.addEventListener("input", () => {
      clearTimeout(availabilityTimer);
      const value = custom.value.trim();
      const node = document.getElementById("codeAvailability");
      if (!value) {
        node.className = "hint-text";
        node.textContent = "4–24 letters, numbers, hyphens, or underscores. Codes are case-insensitive.";
        return;
      }
      availabilityTimer = setTimeout(async () => {
        const { data, error } = await state.client.rpc("stasis_code_available", { p_code: value });
        if (error) return;
        node.className = data ? "success-text" : "error-text";
        node.textContent = data ? "that code is available ♡" : "that code is already taken";
      }, 320);
    });

    document.getElementById("createRoomForm").addEventListener("submit", async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector("button[type=submit]");
      button.disabled = true;
      try {
        const name = document.getElementById("roomName").value.trim();
        const roomType = document.getElementById("roomType").value;
        const customCode = document.getElementById("customCode").value.trim() || null;
        const { data, error } = await state.client.rpc("create_stasis_room", {
          p_name: name,
          p_room_type: roomType,
          p_custom_code: customCode,
          p_icon: document.getElementById("roomIcon").value.trim() || "♡",
          p_accent: document.getElementById("roomAccent").value
        });
        if (error) throw error;
        const room = Array.isArray(data) ? data[0] : data;
        closeModal();
        toast(`Room created — code ${room.invite_code}`, "success");
        navigate(`room/${room.id}`);
      } catch (error) {
        toast(error.message || "Couldn’t create the room.", "error");
        button.disabled = false;
      }
    });
  }

  async function loadRoom(roomId) {
    const roomResult = await state.client.from("rooms").select("id,name,room_type,icon,accent,invite_code,joining_enabled,created_by,created_at,updated_at").eq("id", roomId).maybeSingle();
    if (roomResult.error) throw roomResult.error;
    if (!roomResult.data) throw new Error("This room doesn’t exist, or you no longer have access to it.");

    const [memberResult, cardResult, blockResult] = await Promise.all([
      state.client.from("room_members").select("room_id,user_id,role,card_order,pinned,joined_at").eq("room_id", roomId).order("card_order"),
      state.client.from("stasis_cards").select("room_id,user_id,status,custom_status,mood,custom_mood,availability,note,until_at,updated_at").eq("room_id", roomId),
      state.client.from("blocks").select("blocked_id").eq("blocker_id", state.user.id)
    ]);
    if (memberResult.error) throw memberResult.error;
    if (cardResult.error) throw cardResult.error;
    if (blockResult.error) throw blockResult.error;

    const members = memberResult.data || [];
    const ids = members.map(member => member.user_id);
    let profiles = [];
    if (ids.length) {
      const profileResult = await state.client.from("profiles").select("id,display_name,avatar_url").in("id", ids);
      if (profileResult.error) throw profileResult.error;
      profiles = profileResult.data || [];
    }
    const profileMap = new Map(profiles.map(profile => [profile.id, profile]));
    const cardMap = new Map((cardResult.data || []).map(card => [card.user_id, card]));
    const blocked = new Set((blockResult.data || []).map(row => row.blocked_id));

    state.currentRoom = {
      room: roomResult.data,
      members: members.map(member => ({ ...member, profile: profileMap.get(member.user_id), card: cardMap.get(member.user_id), blockedByMe: blocked.has(member.user_id) })),
      isOwner: members.some(member => member.user_id === state.user.id && member.role === "owner") || roomResult.data.created_by === state.user.id,
      isManager: members.some(member => member.user_id === state.user.id && ["owner","admin"].includes(member.role)) || roomResult.data.created_by === state.user.id
    };
  }

  function statusCardHTML(member, room) {
    const mine = member.user_id === state.user.id;
    const name = member.profile?.display_name || (mine ? state.profile?.display_name : "member");
    const card = member.card;

    if (!mine && member.blockedByMe) {
      return `
        <article class="status-card">
          <div class="card-head">
            <div class="person"><div class="person-avatar">${e(initials(name))}</div><div class="person-text"><strong>${e(name)}</strong><span>blocked in this account</span></div></div>
          </div>
          <div class="card-body"><div class="note-box empty"><span class="tiny">card hidden</span><p>You blocked this account, so their status is hidden here.</p></div></div>
        </article>`;
    }

    if (!card) {
      return `
        <article class="status-card">
          <div class="card-head">
            <div class="person"><div class="person-avatar">${e(initials(name))}</div><div class="person-text"><strong>${e(name)}</strong><span>card unavailable</span></div></div>
          </div>
          <div class="card-body"><div class="note-box empty"><span class="tiny">private</span><p>This card isn’t available to your account.</p></div></div>
        </article>`;
    }

    if (mine) {
      return `
        <article class="status-card mine" data-user-card="${e(member.user_id)}">
          <div class="card-head">
            <div class="person"><div class="person-avatar">${e(initials(name))}</div><div class="person-text"><strong>${e(name)}</strong><span id="saveState">${e(relativeTime(card.updated_at))}</span></div></div>
            <span class="you-pill">you · ${e(room.room_type === "group" ? member.role : "editable")}</span>
          </div>
          <div class="card-body">
            <div class="triple">
              <div class="field"><label>status</label><select data-card-field="status">${optionsHTML(STATUS_OPTIONS, card.status)}</select>${card.status === "other" ? `<input class="custom-inline" data-card-field="custom_status" maxlength="60" value="${e(card.custom_status || "")}" placeholder="your status" />` : ""}</div>
              <div class="field"><label>mood</label><select data-card-field="mood">${optionsHTML(MOOD_OPTIONS, card.mood)}</select>${card.mood === "other" ? `<input class="custom-inline" data-card-field="custom_mood" maxlength="60" value="${e(card.custom_mood || "")}" placeholder="your mood" />` : ""}</div>
              <div class="field"><label>availability</label><select data-card-field="availability">${optionsHTML(AVAILABILITY_OPTIONS, card.availability)}</select></div>
            </div>
            <div class="field">
              <label>until (optional)</label>
              <input data-card-field="until_at" type="datetime-local" value="${e(toLocalInput(card.until_at))}" />
            </div>
            <div class="field">
              <label>little note</label>
              <textarea data-card-field="note" maxlength="1500" placeholder="leave a tiny note…">${e(card.note || "")}</textarea>
              <span class="hint-text"><span id="noteCount">${(card.note || "").length}</span>/1500 · saves automatically</span>
            </div>
          </div>
          <div class="card-foot">
            <span>${e(relativeTime(card.updated_at))}</span>
            <div class="card-actions"><button class="btn soft" data-copy-card type="button">copy to rooms</button></div>
          </div>
        </article>`;
    }

    const note = card.note?.trim();
    return `
      <article class="status-card" data-user-card="${e(member.user_id)}">
        <div class="card-head">
          <div class="person"><div class="person-avatar">${e(initials(name))}</div><div class="person-text"><strong>${e(name)}</strong><span>${room.room_type === "group" ? `${e(member.role)} · ` : ""}${e(relativeTime(card.updated_at))}</span></div></div>
        </div>
        <div class="card-body">
          <div class="triple">
            <div class="read-status"><span class="tiny">status</span><strong>${e(cardStatusLabel(card))}</strong></div>
            <div class="read-status"><span class="tiny">mood</span><strong>${e(cardMoodLabel(card))}</strong></div>
            <div class="read-status"><span class="tiny">availability</span><strong>${e(labelFor(AVAILABILITY_OPTIONS, card.availability))}</strong></div>
          </div>
          ${card.until_at ? `<div class="read-status ${new Date(card.until_at) < new Date() ? "expired" : ""}"><span class="tiny">time</span><strong>${e(untilText(card.until_at))}</strong></div>` : ""}
          <div class="note-box ${note ? "" : "empty"}"><span class="tiny">little note</span><p>${note ? e(note) : "no note right now ♡"}</p></div>
        </div>
        <div class="card-foot">
          <span>${e(relativeTime(card.updated_at))}</span>
          <div class="card-actions">
            ${state.currentRoom.isOwner && room.room_type === "group" ? `<button class="btn soft" data-role-user="${e(member.user_id)}" data-role-current="${e(member.role)}" type="button">${member.role === "admin" ? "make member" : "make admin"}</button><button class="btn ghost" data-transfer-owner="${e(member.user_id)}" type="button">make owner</button>` : ""}${state.currentRoom.isManager && room.room_type === "group" ? `<button class="btn danger" data-remove-member="${e(member.user_id)}" type="button">remove</button>` : ""}
            <button class="btn ghost" data-block-user="${e(member.user_id)}" data-block-name="${e(name)}" type="button">block</button>
          </div>
        </div>
      </article>`;
  }

  function renderRoomHTML() {
    const { room, members, isOwner, isManager } = state.currentRoom;
    const myMember = members.find(member => member.user_id === state.user.id);
    const displayMembers = [...members].sort((a,b) => (a.user_id === state.user.id ? -1 : b.user_id === state.user.id ? 1 : a.card_order - b.card_order));
    const currentRoute = route();
    const gamesActive = currentRoute.sub === "games";
    return `
      ${topbarHTML()}
      <main class="page room-page accent-${e(room.accent || "rose")}">
        <section class="room-header">
          <div class="room-title-wrap">
            <a class="back" href="#/dashboard">← all rooms</a>
            <h1><span class="header-room-icon">${e(room.icon || "♡")}</span>${e(room.name)}</h1>
            <p>${room.room_type === "direct" ? "two-person stasis room" : `${members.length}-person group stasis room`} · updates live</p>
          </div>
          <div class="panel room-code-box">
            <span class="label">invite code</span>
            <span class="code">${e(room.invite_code)}</span>
            <div class="room-code-actions">
              <button class="btn soft" id="copyRoomCode" type="button">copy code</button>
              <button class="btn soft" id="copyInviteLink" type="button">copy link</button>
              ${isManager ? `<button class="btn ghost" id="regenerateCode" type="button">change</button>` : ""}
            </div>
          </div>
        </section>

        <nav class="room-tabs" aria-label="Room sections">
          <a class="room-tab ${gamesActive ? "" : "active"}" href="#/room/${e(room.id)}">status</a>
          <a class="room-tab ${gamesActive ? "active" : ""}" href="#/room/${e(room.id)}/games">games</a>
        </nav>

        ${gamesActive ? `<section id="stasisGameMount"><div class="panel arcade-empty">opening the arcade…</div></section>` : `
        <section class="cards-grid">${displayMembers.map(member => statusCardHTML(member, room)).join("")}</section>

        <details class="panel room-tools">
          <summary>room controls</summary>
          <div class="room-tools-content">
            <div class="tool-row"><div class="copy"><strong>pin room</strong><span>Keep this room at the top of your dashboard.</span></div><button id="pinCurrentRoom" class="btn soft" type="button">${myMember?.pinned ? "unpin" : "pin"}</button></div>
            <div class="tool-row"><div class="copy"><strong>joining</strong><span>${room.joining_enabled ? "people with the code can join" : "new joins are currently disabled"}</span></div>${isManager ? `<button id="toggleJoining" class="btn soft" type="button">${room.joining_enabled ? "turn off" : "turn on"}</button>` : `<span class="hint-text">manager only</span>`}</div>
            ${isManager ? `<div class="tool-row"><div class="copy"><strong>room appearance</strong><span>Rename the room, change its icon, or choose an accent.</span></div><button id="editRoom" class="btn soft" type="button">edit room</button></div>` : ""}
            <div class="tool-row"><div class="copy"><strong>copy your card</strong><span>send selected parts of your current card to your other rooms</span></div><button id="copyCardTool" class="btn soft" type="button">copy to…</button></div>
            <div class="tool-row"><div class="copy"><strong>notifications</strong><span>choose which changes in this room should alert this account</span></div><button id="roomNotifications" class="btn soft" type="button">preferences</button></div>
            <div class="tool-row"><div class="copy"><strong>leave room</strong><span>Your card is removed from this room. If you own it, ownership moves to another member.</span></div><button id="leaveRoom" class="btn danger" type="button">leave</button></div>
            ${isOwner ? `<div class="tool-row"><div class="copy"><strong>delete room</strong><span>Permanent for everyone in this room.</span></div><button id="deleteRoom" class="btn danger" type="button">delete room</button></div>` : ""}
            <div class="hint-text">your role: ${e(myMember?.role || "member")}</div>
          </div>
        </details>`}
      </main>`;
  }

  async function renderRoom(roomId) {
    clearRoomSubscription();
    app.innerHTML = `${topbarHTML()}<main class="page"><section class="panel empty-state"><div class="empty-heart">♡</div><h3>opening room…</h3></section></main>`;
    wireTopbar();
    try {
      await loadRoom(roomId);
      app.innerHTML = renderRoomHTML();
      wireTopbar();
      wireRoom();
      subscribeRoom(roomId);
      const currentRoute = route();
      if (currentRoute.sub === "games" && window.StasisGames) {
        await window.StasisGames.mount({
          mount: document.getElementById("stasisGameMount"),
          client: state.client,
          user: state.user,
          profileName: state.profile?.display_name,
          roomContext: state.currentRoom,
          gameId: currentRoute.item,
          navigate,
          toast
        });
      }
    } catch (error) {
      renderFatal(error, "Couldn’t open this room.");
    }
  }

  function subscribeRoom(roomId) {
    stopRoomSubscription();
    state.currentSubscription = state.client
      .channel(`stasis-room-${roomId}-${state.user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stasis_cards", filter: `room_id=eq.${roomId}` }, payload => {
        const changedUser = payload?.new?.user_id || payload?.old?.user_id;
        if (payload?.eventType === "UPDATE" && changedUser === state.user.id) return;
        const member = state.currentRoom?.members?.find(item => item.user_id === changedUser);
        if (member?.profile?.display_name) toast(`${member.profile.display_name} updated their card ♡`);
        scheduleRoomReload();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "room_members", filter: `room_id=eq.${roomId}` }, scheduleRoomReload)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, scheduleRoomReload)
      .subscribe();
  }

  function scheduleRoomReload() {
    clearTimeout(state.roomReloadTimer);
    state.roomReloadTimer = setTimeout(async () => {
      const current = route();
      if (current.name !== "room" || !current.id) return;
      const activeField = document.activeElement?.matches?.("[data-card-field]") ? document.activeElement : null;
      if (activeField && activeField.tagName !== "SELECT") {
        scheduleRoomReload();
        return;
      }
      try {
        await loadRoom(current.id);
        app.innerHTML = renderRoomHTML();
        wireTopbar();
        wireRoom();
        if (current.sub === "games" && window.StasisGames) {
          await window.StasisGames.mount({
            mount: document.getElementById("stasisGameMount"), client: state.client, user: state.user,
            profileName: state.profile?.display_name, roomContext: state.currentRoom, gameId: current.item, navigate, toast
          });
        }
      } catch (error) {
        toast(error.message || "Room changed.", "error");
      }
    }, 300);
  }

  function wireRoom() {
    const roomId = state.currentRoom.room.id;
    document.getElementById("copyRoomCode")?.addEventListener("click", async () => {
      await copyText(state.currentRoom.room.invite_code);
      toast("Room code copied ♡", "success");
    });
    document.getElementById("copyInviteLink")?.addEventListener("click", async () => {
      await copyText(inviteURL(state.currentRoom.room.invite_code));
      toast("Invite link copied ♡", "success");
    });
    document.getElementById("regenerateCode")?.addEventListener("click", openRegenerateCodeModal);
    document.getElementById("toggleJoining")?.addEventListener("click", toggleJoining);
    document.getElementById("editRoom")?.addEventListener("click", openEditRoomModal);
    document.getElementById("pinCurrentRoom")?.addEventListener("click", () => togglePinnedRoom(roomId, !state.currentRoom.members.find(m => m.user_id === state.user.id)?.pinned));
    document.getElementById("leaveRoom")?.addEventListener("click", leaveRoom);
    document.getElementById("deleteRoom")?.addEventListener("click", deleteRoom);
    document.getElementById("copyCardTool")?.addEventListener("click", () => openCopyCardModal(roomId));
    document.getElementById("roomNotifications")?.addEventListener("click", () => openRoomNotificationModal(roomId));
    document.querySelector("[data-copy-card]")?.addEventListener("click", () => openCopyCardModal(roomId));

    app.querySelectorAll("[data-card-field]").forEach(input => {
      if (input.dataset.cardField === "note") {
        input.addEventListener("input", () => {
          const count = document.getElementById("noteCount");
          if (count) count.textContent = String(input.value.length);
          setSaveState("saving…");
          clearTimeout(state.noteSaveTimers.get(roomId));
          const timer = setTimeout(() => saveMyCard(roomId, { note: input.value }), 650);
          state.noteSaveTimers.set(roomId, timer);
        });
      } else {
        input.addEventListener("change", async () => {
          const field = input.dataset.cardField;
          const value = field === "until_at" ? fromLocalInput(input.value) : input.value;
          await saveMyCard(roomId, { [field]: value });
          if (["status","mood"].includes(field)) scheduleRoomReload();
        });
      }
    });

    app.querySelectorAll("[data-block-user]").forEach(button => button.addEventListener("click", () => blockUser(button.dataset.blockUser, button.dataset.blockName)));
    app.querySelectorAll("[data-remove-member]").forEach(button => button.addEventListener("click", () => removeMember(button.dataset.removeMember)));
    app.querySelectorAll("[data-role-user]").forEach(button => button.addEventListener("click", () => setMemberRole(button.dataset.roleUser, button.dataset.roleCurrent === "admin" ? "member" : "admin")));
    app.querySelectorAll("[data-transfer-owner]").forEach(button => button.addEventListener("click", () => transferOwnership(button.dataset.transferOwner)));
  }

  function setSaveState(text, className = "") {
    const node = document.getElementById("saveState");
    if (!node) return;
    node.textContent = text;
    node.className = className;
  }

  function pendingWriteKey() {
    return state.user?.id ? `stasis-pending-card-writes-${state.user.id}` : null;
  }

  function pendingCardWrites() {
    const key = pendingWriteKey();
    if (!key) return {};
    try { return JSON.parse(localStorage.getItem(key) || "{}"); }
    catch { return {}; }
  }

  function queueCardWrite(roomId, patch) {
    const key = pendingWriteKey();
    if (!key) return;
    const pending = pendingCardWrites();
    pending[roomId] = { ...(pending[roomId] || {}), ...patch };
    localStorage.setItem(key, JSON.stringify(pending));
  }

  async function flushPendingCardWrites() {
    if (!state.client || !state.user || !navigator.onLine) return;
    const pending = pendingCardWrites();
    const next = { ...pending };
    for (const [roomId, patch] of Object.entries(pending)) {
      const { error } = await state.client.from("stasis_cards").update(patch).eq("room_id", roomId).eq("user_id", state.user.id);
      if (!error) delete next[roomId];
    }
    const key = pendingWriteKey();
    if (key) localStorage.setItem(key, JSON.stringify(next));
    if (Object.keys(pending).length && !Object.keys(next).length) toast("Offline card changes synced ♡", "success");
  }

  async function saveMyCard(roomId, patch) {
    if (!navigator.onLine) {
      queueCardWrite(roomId, patch);
      setSaveState("queued · offline", "saving");
      return;
    }
    setSaveState("saving…", "saving");
    try {
      const { error } = await state.client.from("stasis_cards").update(patch).eq("room_id", roomId).eq("user_id", state.user.id);
      if (error) throw error;
      setSaveState("saved just now");
    } catch (error) {
      setSaveState("save failed", "error-text");
      toast(error.message || "Couldn’t save your card.", "error");
    }
  }

  function openEditRoomModal() {
    const room = state.currentRoom.room;
    openModal(`
      <div class="modal-head"><div><h2>edit room ♡</h2><p>These changes are visible to everyone in the room.</p></div><button class="modal-close" data-close-modal type="button">×</button></div>
      <form id="editRoomForm" class="modal-body">
        <div class="field"><label>room name</label><input id="editRoomName" maxlength="80" value="${e(room.name)}" required /></div>
        <div class="split-fields"><div class="field"><label>icon</label><input id="editRoomIcon" maxlength="8" value="${e(room.icon || "♡")}" /></div><div class="field"><label>accent</label><select id="editRoomAccent">${optionsHTML(ACCENT_OPTIONS, room.accent || "rose")}</select></div></div>
        <div class="modal-actions"><button class="btn ghost" data-close-modal type="button">cancel</button><button class="btn primary" type="submit">save room</button></div>
      </form>`);
    document.getElementById("editRoomForm").addEventListener("submit", async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector('button[type="submit"]');
      button.disabled = true;
      const { error } = await state.client.rpc("update_stasis_room", {
        p_room: room.id,
        p_name: document.getElementById("editRoomName").value.trim(),
        p_icon: document.getElementById("editRoomIcon").value.trim() || "♡",
        p_accent: document.getElementById("editRoomAccent").value
      });
      if (error) { button.disabled = false; return toast(error.message, "error"); }
      closeModal(); toast("Room updated ♡", "success"); scheduleRoomReload();
    });
  }

  async function setMemberRole(userId, role) {
    const member = state.currentRoom.members.find(item => item.user_id === userId);
    const name = member?.profile?.display_name || "this member";
    const { error } = await state.client.rpc("set_stasis_member_role", { p_room: state.currentRoom.room.id, p_user: userId, p_role: role });
    if (error) return toast(error.message, "error");
    toast(`${name} is now ${role === "admin" ? "an admin" : "a member"}.`, "success"); scheduleRoomReload();
  }

  async function transferOwnership(userId) {
    const member = state.currentRoom.members.find(item => item.user_id === userId);
    const name = member?.profile?.display_name || "this member";
    if (!confirm(`Make ${name} the owner? You will become a regular member.`)) return;
    const { error } = await state.client.rpc("transfer_stasis_ownership", { p_room: state.currentRoom.room.id, p_user: userId });
    if (error) return toast(error.message, "error");
    toast(`${name} now owns the room.`, "success"); scheduleRoomReload();
  }

  async function openRoomNotificationModal(roomId) {
    const { data, error } = await state.client.from("notification_preferences").select("status_changes,mood_changes,availability_changes,note_changes,quiet_start,quiet_end").eq("user_id", state.user.id).eq("room_id", roomId).maybeSingle();
    if (error) return toast(error.message, "error");
    const pref = data || { status_changes:false, mood_changes:false, availability_changes:true, note_changes:true, quiet_start:null, quiet_end:null };
    openModal(`
      <div class="modal-head"><div><h2>room notifications</h2><p>Choose which updates may become push notifications once this device is enabled.</p></div><button class="modal-close" data-close-modal type="button">×</button></div>
      <form id="notificationPrefForm" class="modal-body">
        <div class="check-grid">
          <label class="check-item"><input type="checkbox" id="prefStatus" ${pref.status_changes ? "checked" : ""}/> status changes</label>
          <label class="check-item"><input type="checkbox" id="prefMood" ${pref.mood_changes ? "checked" : ""}/> mood changes</label>
          <label class="check-item"><input type="checkbox" id="prefAvailability" ${pref.availability_changes ? "checked" : ""}/> availability changes</label>
          <label class="check-item"><input type="checkbox" id="prefNote" ${pref.note_changes ? "checked" : ""}/> note changes</label>
        </div>
        <div class="split-fields"><div class="field"><label>quiet from</label><input id="quietStart" type="time" value="${e(pref.quiet_start?.slice?.(0,5) || "")}" /></div><div class="field"><label>quiet until</label><input id="quietEnd" type="time" value="${e(pref.quiet_end?.slice?.(0,5) || "")}" /></div></div>
        <div class="modal-actions"><button class="btn ghost" data-close-modal type="button">cancel</button><button class="btn primary" type="submit">save preferences</button></div>
      </form>`);
    document.getElementById("notificationPrefForm").addEventListener("submit", async event => {
      event.preventDefault();
      const payload = {
        user_id: state.user.id, room_id: roomId,
        status_changes: document.getElementById("prefStatus").checked,
        mood_changes: document.getElementById("prefMood").checked,
        availability_changes: document.getElementById("prefAvailability").checked,
        note_changes: document.getElementById("prefNote").checked,
        quiet_start: document.getElementById("quietStart").value || null,
        quiet_end: document.getElementById("quietEnd").value || null
      };
      const { error: saveError } = await state.client.from("notification_preferences").upsert(payload, { onConflict:"user_id,room_id" });
      if (saveError) return toast(saveError.message, "error");
      closeModal(); toast("Notification preferences saved ♡", "success");
    });
  }

  async function toggleJoining() {
    const room = state.currentRoom.room;
    const button = document.getElementById("toggleJoining");
    button.disabled = true;
    const { error } = await state.client.rpc("set_stasis_joining", { p_room: room.id, p_enabled: !room.joining_enabled });
    if (error) {
      toast(error.message, "error");
      button.disabled = false;
    } else {
      toast(!room.joining_enabled ? "Joining enabled." : "Joining disabled.", "success");
      scheduleRoomReload();
    }
  }

  function openRegenerateCodeModal() {
    openModal(`
      <div class="modal-head"><div><h2>change invite code</h2><p>Leave it blank for a new random code, or choose your own available one.</p></div><button class="modal-close" data-close-modal type="button">×</button></div>
      <form id="regenerateForm" class="modal-body">
        <div class="field"><label for="newRoomCode">new custom code (optional)</label><input id="newRoomCode" maxlength="24" autocomplete="off" placeholder="generate one for me" /></div>
        <div class="modal-actions"><button class="btn ghost" data-close-modal type="button">cancel</button><button class="btn primary" type="submit">change code</button></div>
      </form>`);
    document.getElementById("regenerateForm").addEventListener("submit", async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector("button[type=submit]");
      button.disabled = true;
      const custom = document.getElementById("newRoomCode").value.trim() || null;
      const { data, error } = await state.client.rpc("regenerate_stasis_code", { p_room: state.currentRoom.room.id, p_custom_code: custom });
      if (error) {
        toast(error.message, "error");
        button.disabled = false;
      } else {
        closeModal();
        toast(`New code: ${data}`, "success");
        scheduleRoomReload();
      }
    });
  }

  async function openCopyCardModal(sourceRoomId) {
    try {
      if (!state.dashboard) await loadDashboard();
      else await loadDashboard();
      const targets = state.dashboard.rooms.filter(room => room.id !== sourceRoomId);
      if (!targets.length) {
        toast("You need another room before there’s anywhere to copy this card.");
        return;
      }
      openModal(`
        <div class="modal-head"><div><h2>copy your card</h2><p>Choose the rooms and exactly which parts to copy. You can only copy your own card.</p></div><button class="modal-close" data-close-modal type="button">×</button></div>
        <form id="copyCardForm" class="modal-body">
          <div class="field-label">copy to</div>
          <div class="check-grid">${targets.map(room => `<label class="check-item"><input type="checkbox" name="target" value="${e(room.id)}" /> ${e(room.name)}</label>`).join("")}</div>
          <div class="field-label">include</div>
          <div class="check-grid">
            <label class="check-item"><input type="checkbox" name="field" value="status" checked /> status</label>
            <label class="check-item"><input type="checkbox" name="field" value="mood" checked /> mood</label>
            <label class="check-item"><input type="checkbox" name="field" value="availability" checked /> availability</label>
            <label class="check-item"><input type="checkbox" name="field" value="until_at" checked /> until</label>
            <label class="check-item"><input type="checkbox" name="field" value="note" /> note</label>
          </div>
          <div class="modal-actions"><button class="btn ghost" data-close-modal type="button">cancel</button><button class="btn primary" type="submit">copy card</button></div>
        </form>`);
      document.getElementById("copyCardForm").addEventListener("submit", async event => {
        event.preventDefault();
        const targets = [...event.currentTarget.querySelectorAll('input[name="target"]:checked')].map(input => input.value);
        const fields = [...event.currentTarget.querySelectorAll('input[name="field"]:checked')].map(input => input.value);
        if (!targets.length || !fields.length) {
          toast("Choose at least one room and one field.", "error");
          return;
        }
        const button = event.currentTarget.querySelector("button[type=submit]");
        button.disabled = true;
        const { data, error } = await state.client.rpc("copy_my_stasis_card", { p_source_room: sourceRoomId, p_target_rooms: targets, p_fields: fields });
        if (error) {
          toast(error.message, "error");
          button.disabled = false;
        } else {
          closeModal();
          toast(`Copied to ${data} ${data === 1 ? "room" : "rooms"} ♡`, "success");
        }
      });
    } catch (error) {
      toast(error.message || "Couldn’t load your rooms.", "error");
    }
  }

  async function blockUser(userId, name) {
    if (!confirm(`Block ${name}? Direct rooms shared with this account will be removed, and their cards will be hidden in shared group rooms.`)) return;
    const { error } = await state.client.rpc("block_stasis_user", { p_blocked: userId });
    if (error) return toast(error.message, "error");
    toast(`${name} blocked.`, "success");
    if (state.currentRoom.room.room_type === "direct") navigate("dashboard");
    else scheduleRoomReload();
  }

  async function removeMember(userId) {
    const member = state.currentRoom.members.find(item => item.user_id === userId);
    const name = member?.profile?.display_name || "this member";
    if (!confirm(`Remove ${name} from this room?`)) return;
    const { error } = await state.client.rpc("remove_stasis_member", { p_room: state.currentRoom.room.id, p_user: userId });
    if (error) toast(error.message, "error");
    else { toast(`${name} removed.`, "success"); scheduleRoomReload(); }
  }

  async function leaveRoom() {
    if (!confirm("Leave this room? Your status card will be removed from it.")) return;
    const { error } = await state.client.rpc("leave_stasis_room", { p_room: state.currentRoom.room.id });
    if (error) toast(error.message, "error");
    else { toast("You left the room.", "success"); navigate("dashboard"); }
  }

  async function deleteRoom() {
    if (!confirm("Delete this room permanently for everyone? This cannot be undone.")) return;
    const { error } = await state.client.rpc("delete_stasis_room", { p_room: state.currentRoom.room.id });
    if (error) toast(error.message, "error");
    else { toast("Room deleted.", "success"); navigate("dashboard"); }
  }

  function renderInviteJoin(code) {
    clearRoomSubscription();
    app.innerHTML = `
      ${topbarHTML()}
      <main class="setup-page invite-page">
        <section class="panel setup-card invite-card">
          <div class="big-heart">♡</div>
          <p class="eyebrow">room invitation</p>
          <h1>join this stasis room?</h1>
          <p>You’re signed in as <strong>${e(state.profile?.display_name || state.user?.email || "you")}</strong>. The invite code is <span class="code-inline">${e(code)}</span>.</p>
          <div class="modal-actions invite-actions"><a class="btn ghost" href="#/dashboard">not now</a><button id="joinInviteButton" class="btn primary" type="button">join room ♡</button></div>
        </section>
      </main>`;
    wireTopbar();
    document.getElementById("joinInviteButton").addEventListener("click", async event => {
      event.currentTarget.disabled = true;
      const { data, error } = await state.client.rpc("join_stasis_room", { p_code: code });
      if (error) { event.currentTarget.disabled = false; return toast(error.message, "error"); }
      const room = Array.isArray(data) ? data[0] : data;
      toast("Joined the room ♡", "success"); navigate(`room/${room.id}`);
    });
  }

  async function loadSettingsData() {
    const { data, error } = await state.client.rpc("get_my_stasis_blocks");
    if (error) throw error;
    return (data || []).map(row => ({ ...row, profile: { id: row.blocked_id, display_name: row.display_name } }));
  }

  async function renderSettings() {
    clearRoomSubscription();
    app.innerHTML = `${topbarHTML()}<main class="page"><section class="panel empty-state"><div class="empty-heart">♡</div><h3>opening settings…</h3></section></main>`;
    wireTopbar();
    try {
      const blocks = await loadSettingsData();
      app.innerHTML = `
        ${topbarHTML()}
        <main class="page settings-page">
          <section class="room-header"><div class="room-title-wrap"><a class="back" href="#/dashboard">← dashboard</a><h1>settings</h1><p>account, safety, and the app on your phone</p></div></section>
          <section class="settings-grid">
            <article class="panel settings-card">
              <h2>your profile</h2><p>This is the name people see on your cards.</p>
              <form id="profileForm" class="field"><label for="settingsName">display name</label><input id="settingsName" maxlength="48" value="${e(state.profile?.display_name || "")}" required /><label for="themeSelect">appearance</label><select id="themeSelect">${optionsHTML(THEME_OPTIONS, state.profile?.theme || "system")}</select><button class="btn primary" type="submit">save profile</button></form>
              <div class="settings-actions"><button id="resetPasswordButton" class="btn soft" type="button">send password reset</button><button id="signOutButton" class="btn ghost" type="button">sign out</button></div>
            </article>
            <article class="panel settings-card">
              <h2>blocked accounts</h2><p>Blocked accounts cannot join a new direct room with you, and their cards are hidden in shared groups.</p>
              <div class="block-list">${blocks.length ? blocks.map(row => `<div class="block-row"><div><strong>${e(row.profile?.display_name || "blocked account")}</strong><br><span>${e(row.blocked_id.slice(0,8))}…</span></div><button class="btn soft" data-unblock="${e(row.blocked_id)}" type="button">unblock</button></div>`).join("") : `<span class="hint-text">You haven’t blocked anyone.</span>`}</div>
            </article>
            <article class="panel settings-card pwa-card">
              <h2>put stasis on your phone</h2><p>Stasis is an installable PWA: add it to your home screen and it opens like an app. The final folder also includes the optional Web Push Edge Function.</p>
              <button id="installAppButton" class="btn primary" type="button">${state.deferredInstallPrompt ? "install stasis" : "installation help"}</button>
            </article>
            <article class="panel settings-card">
              <h2>notifications</h2><p>In-app realtime updates work immediately. Web Push is already wired for the optional Edge Function once you add a VAPID public key in config.</p>
              <div class="settings-actions"><button id="enablePushButton" class="btn primary" type="button">${notificationPermission() === "granted" ? "refresh this device" : "enable on this device"}</button><button id="disablePushButton" class="btn ghost" type="button">disable on this device</button></div>
              <span class="hint-text">permission: ${e(notificationPermission())}</span>
            </article>
            <article class="panel settings-card danger-zone">
              <h2>delete account</h2><p>Deletes your account, all of your cards, and any empty rooms left behind. This cannot be undone.</p>
              <button id="deleteAccountButton" class="btn danger" type="button">delete my account</button>
            </article>
          </section>
        </main>`;
      wireTopbar();
      document.getElementById("profileForm").addEventListener("submit", updateProfile);
      document.getElementById("signOutButton").addEventListener("click", () => state.client.auth.signOut());
      document.querySelectorAll("[data-unblock]").forEach(button => button.addEventListener("click", () => unblockUser(button.dataset.unblock)));
      document.getElementById("installAppButton").addEventListener("click", installApp);
      document.getElementById("resetPasswordButton").addEventListener("click", sendPasswordReset);
      document.getElementById("enablePushButton").addEventListener("click", enablePushNotifications);
      document.getElementById("disablePushButton").addEventListener("click", disablePushNotifications);
      document.getElementById("deleteAccountButton").addEventListener("click", deleteAccount);
    } catch (error) {
      renderFatal(error, "Couldn’t open settings.");
    }
  }

  async function updateProfile(event) {
    event.preventDefault();
    const name = document.getElementById("settingsName").value.trim();
    const theme = document.getElementById("themeSelect").value;
    const button = event.currentTarget.querySelector("button");
    button.disabled = true;
    const { data, error } = await state.client.from("profiles").update({ display_name: name, theme }).eq("id", state.user.id).select().single();
    button.disabled = false;
    if (error) toast(error.message, "error");
    else { state.profile = data; applyTheme(theme); toast("Profile updated ♡", "success"); renderSettings(); }
  }

  async function unblockUser(userId) {
    const { error } = await state.client.rpc("unblock_stasis_user", { p_blocked: userId });
    if (error) toast(error.message, "error");
    else { toast("Account unblocked.", "success"); renderSettings(); }
  }

  async function sendPasswordReset() {
    const { error } = await state.client.auth.resetPasswordForEmail(state.user.email, { redirectTo: `${location.origin}${location.pathname}` });
    if (error) toast(error.message, "error");
    else toast("Password reset email sent ♡", "success");
  }

  async function enablePushNotifications() {
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return toast("This browser doesn’t support Web Push.", "error");
    if (!cfg.webPushPublicKey || cfg.webPushPublicKey.includes("REPLACE_ME")) return toast("Add the VAPID public key to config.js when you connect the notification sender.");
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return toast("Notification permission wasn’t granted.", "error");
    try {
      const registration = await navigator.serviceWorker.ready;
      let subscription = await registration.pushManager.getSubscription();
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey:urlBase64ToUint8Array(cfg.webPushPublicKey) });
      const json = subscription.toJSON();
      const { error } = await state.client.from("push_subscriptions").upsert({
        user_id: state.user.id,
        endpoint: json.endpoint,
        p256dh: json.keys?.p256dh,
        auth: json.keys?.auth,
        device_name: navigator.userAgent.slice(0,160)
      }, { onConflict:"user_id,endpoint" });
      if (error) throw error;
      toast("This device is ready for Stasis notifications ♡", "success"); renderSettings();
    } catch (error) { toast(error.message || "Couldn’t enable push notifications.", "error"); }
  }

  async function disablePushNotifications() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) return toast("Web Push isn’t available in this browser.");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (!subscription) return toast("This device isn’t subscribed.");
      const endpoint = subscription.endpoint;
      const { error } = await state.client.from("push_subscriptions").delete().eq("user_id", state.user.id).eq("endpoint", endpoint);
      if (error) throw error;
      await subscription.unsubscribe();
      toast("Stasis push disabled on this device.", "success");
    } catch (error) { toast(error.message || "Couldn’t disable notifications.", "error"); }
  }

  async function deleteAccount() {
    const typed = prompt('Type DELETE to permanently delete your Stasis account.');
    if (typed !== "DELETE") return;
    const { error } = await state.client.rpc("delete_my_stasis_account");
    if (error) return toast(error.message, "error");
    toast("Account deleted.");
    await state.client.auth.signOut();
  }

  function renderPasswordReset() {
    clearRoomSubscription();
    app.innerHTML = `${topbarHTML()}<main class="page"><section class="panel setup-card password-card"><div class="big-heart">♡</div><h1>choose a new password</h1><p>Use at least 8 characters.</p><form id="newPasswordForm" class="auth-fields"><div class="field"><label>new password</label><input id="newPassword" type="password" minlength="8" autocomplete="new-password" required /></div><button class="btn primary" type="submit">update password</button></form></section></main>`;
    wireTopbar();
    document.getElementById("newPasswordForm").addEventListener("submit", async event => {
      event.preventDefault();
      const button = event.currentTarget.querySelector("button"); button.disabled = true;
      const { error } = await state.client.auth.updateUser({ password: document.getElementById("newPassword").value });
      button.disabled = false;
      if (error) return toast(error.message, "error");
      state.recoveringPassword = false; toast("Password updated ♡", "success"); navigate("settings");
    });
  }

  async function installApp() {
    if (state.deferredInstallPrompt) {
      state.deferredInstallPrompt.prompt();
      await state.deferredInstallPrompt.userChoice;
      state.deferredInstallPrompt = null;
      toast("Install prompt completed.");
      return;
    }
    openModal(`
      <div class="modal-head"><div><h2>install stasis</h2><p>On iPhone/iPad: Safari → Share → Add to Home Screen. On Android/desktop Chrome: browser menu → Install app / Add to Home Screen.</p></div><button class="modal-close" data-close-modal type="button">×</button></div>
      <div class="modal-actions"><button class="btn primary" data-close-modal type="button">got it ♡</button></div>`);
  }

  function openModal(content) {
    closeModal();
    const backdrop = document.createElement("div");
    backdrop.id = "modalBackdrop";
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `<section class="panel modal" role="dialog" aria-modal="true">${content}</section>`;
    document.body.appendChild(backdrop);
    backdrop.addEventListener("click", event => { if (event.target === backdrop) closeModal(); });
    backdrop.querySelectorAll("[data-close-modal]").forEach(node => node.addEventListener("click", closeModal));
    document.addEventListener("keydown", handleModalEscape);
  }

  function handleModalEscape(event) { if (event.key === "Escape") closeModal(); }

  function closeModal() {
    document.getElementById("modalBackdrop")?.remove();
    document.removeEventListener("keydown", handleModalEscape);
  }

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); }
    catch {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
  }

  function renderFatal(error, heading) {
    console.error(error);
    app.innerHTML = `
      ${state.user ? topbarHTML() : ""}
      <main class="page">
        <section class="panel empty-state">
          <div class="empty-heart">♡</div>
          <h3>${e(heading)}</h3>
          <p>${e(error?.message || "Unknown error")}</p>
          <div style="height:14px"></div>
          <button id="retryButton" class="btn soft" type="button">try again</button>
        </section>
      </main>`;
    wireTopbar();
    document.getElementById("retryButton")?.addEventListener("click", renderRoute);
  }

  async function renderRoute() {
    closeModal();
    if (!state.user) return renderAuth();
    const current = route();
    if (current.name === "room" && current.id) return renderRoom(current.id);
    if (current.name === "join" && current.id) return renderInviteJoin(current.id);
    if (current.name === "settings") return renderSettings();
    if (current.name === "reset-password") return renderPasswordReset();
    return renderDashboard();
  }

  async function handleSession(session) {
    state.session = session;
    state.user = session?.user || null;
    state.dashboard = null;
    clearRoomSubscription();
    if (!state.user) {
      state.profile = null;
      renderAuth();
      return;
    }
    try {
      await ensureProfile();
      await flushPendingCardWrites();
      applyTheme(state.profile?.theme);
      if (!location.hash || location.hash === "#/") location.hash = "#/dashboard";
      await renderRoute();
    } catch (error) {
      renderFatal(error, "Couldn’t finish signing you in.");
    }
  }

  async function init() {
    applyTheme();
    const recoveryHint = /(?:[?#&]|^)type=recovery(?:&|$)/.test(location.href);
    window.addEventListener("online", async () => { state.online = true; toast("Back online ♡", "success"); await flushPendingCardWrites(); if (state.user) renderRoute(); });
    window.addEventListener("offline", () => { state.online = false; toast("You’re offline — saved screens can still open."); if (state.user) renderRoute(); });
    window.addEventListener("beforeinstallprompt", event => {
      event.preventDefault();
      state.deferredInstallPrompt = event;
    });

    if ("serviceWorker" in navigator) {
      window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
    }

    if (!window.supabase || !configIsReady()) {
      renderSetup();
      return;
    }

    state.client = window.supabase.createClient(cfg.supabaseUrl, cfg.supabasePublishableKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    const { data, error } = await state.client.auth.getSession();
    if (error) {
      renderFatal(error, "Couldn’t start Stasis.");
      return;
    }
    if (recoveryHint && data.session) {
      state.recoveringPassword = true;
      location.hash = "#/reset-password";
    }

    state.client.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") { state.recoveringPassword = true; location.hash = "#/reset-password"; }
      window.setTimeout(() => handleSession(session), 0);
    });

    window.addEventListener("hashchange", () => { if (state.user) renderRoute(); });
    await handleSession(data.session);
  }

  init();
})();
