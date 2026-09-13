"use strict";

/* =========================================================
   SUPABASE INITIALIZATION
========================================================= */

const APP_CONFIG = window.APP_CONFIG;

if (!APP_CONFIG?.SUPABASE_URL || !APP_CONFIG?.SUPABASE_ANON_KEY) {
  throw new Error(
    "Konfigurasi Supabase tidak ditemukan. Periksa file config.js."
  );
}

if (!window.supabase?.createClient) {
  throw new Error(
    "Library Supabase belum dimuat. Periksa urutan script HTML."
  );
}

const supabaseClient = window.supabase.createClient(
  APP_CONFIG.SUPABASE_URL,
  APP_CONFIG.SUPABASE_ANON_KEY
);

/* =========================================================
   APPLICATION STATE
========================================================= */

const state = {
  user: null,
  profile: null,
  projects: [],
  services: [],
  conversationId: null,
  realtimeChannel: null
};

/* =========================================================
   DOM HELPERS
========================================================= */

const $ = (selector) => document.querySelector(selector);

const $$ = (selector) => {
  return Array.from(document.querySelectorAll(selector));
};

function setText(selector, value) {
  const element = $(selector);

  if (element) {
    element.textContent = value ?? "";
  }
}

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => {
    const characters = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    };

    return characters[character];
  });
}

function normalizeTools(value) {
  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function formatPrice(value) {
  if (
    value === null ||
    value === undefined ||
    value === "" ||
    Number.isNaN(Number(value))
  ) {
    return "Diskusikan";
  }

  return `Mulai Rp${Number(value).toLocaleString("id-ID")}`;
}

function formatTime(value) {
  if (!value) return "";

  return new Date(value).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function getInitials(name = "") {
  const cleanName = String(name).trim();

  if (!cleanName) {
    return "U";
  }

  return cleanName
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join("")
    .toUpperCase();
}

function getCurrentProfileName() {
  return (
    state.profile?.full_name ||
    state.user?.user_metadata?.full_name ||
    state.user?.user_metadata?.name ||
    state.user?.email?.split("@")[0] ||
    "Pengguna"
  );
}

function resizeMessageInput(input) {
  if (!input) {
    return;
  }

  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
}

function updateChatCharacterCount() {
  const input = $("#chat-input");
  const counter = $("#chat-character-count");

  if (!input || !counter) {
    return;
  }

  const length = input.value.length;

  counter.textContent = `${length}/3000`;
  counter.classList.toggle("is-near-limit", length >= 2700);
}

function bindChatComposer() {
  const input = $("#chat-input");
  const form = $("#chat-form");

  if (!input || !form) {
    return;
  }

  input.addEventListener("input", () => {
    resizeMessageInput(input);
    updateChatCharacterCount();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) {
      return;
    }

    /*
     * Enter dan Numpad Enter mengirim pesan.
     * Ctrl + Enter membuat baris/paragraf baru.
     */
    if (event.ctrlKey) {
      event.preventDefault();

      const start = input.selectionStart;
      const end = input.selectionEnd;
      const currentValue = input.value;

      input.value =
        currentValue.slice(0, start) +
        "\n" +
        currentValue.slice(end);

      input.selectionStart = start + 1;
      input.selectionEnd = start + 1;

      resizeMessageInput(input);
      updateChatCharacterCount();
      return;
    }

    if (event.shiftKey || event.altKey || event.metaKey) {
      return;
    }

    event.preventDefault();

    if (!input.value.trim()) {
      return;
    }

    form.requestSubmit();
  });

  updateChatCharacterCount();
}


/* =========================================================
   TOAST
========================================================= */

function showToast(message, type = "success") {
  let container = $("#toastContainer");

  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;

  container.appendChild(toast);

  window.setTimeout(() => {
    toast.remove();
  }, 4000);
}

/* =========================================================
   INITIALIZATION
========================================================= */

async function initializeApp() {
  setText("#currentYear", new Date().getFullYear());

  bindUIEvents();
  bindMobileMenu();
  bindChatComposer();


  await restoreSession();
  await loadInitialData();

  updateAccountUI();

  supabaseClient.auth.onAuthStateChange(handleAuthStateChange);
}

async function restoreSession() {
  const { data, error } = await supabaseClient.auth.getSession();

  if (error) {
    console.error("Gagal mengambil session:", error);
    return;
  }

  state.user = data?.session?.user || null;

  if (state.user) {
    await loadProfile();
  }
}

async function loadInitialData() {
  await Promise.all([
    loadProjects(),
    loadServices()
  ]);
}

async function handleAuthStateChange(_event, session) {
  state.user = session?.user || null;
  state.profile = null;

  if (state.user) {
    await loadProfile();
  }

  updateAccountUI();
}

/* =========================================================
   PROJECTS
========================================================= */

async function loadProjects() {
  const projectGrid = $("#project-grid");

  if (!projectGrid) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("projects")
    .select("*")
    .eq("published", true)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Gagal memuat project:", error);

    projectGrid.innerHTML = `
      <p class="empty-state">
        Portofolio belum dapat dimuat.
      </p>
    `;

    return;
  }

  state.projects = data || [];

  setText("#projectCount", `${state.projects.length}+`);

  renderProjects(state.projects);
}

function renderProjects(projects = []) {
  const projectGrid = $("#project-grid");

  if (!projectGrid) {
    return;
  }

  if (!projects.length) {
    projectGrid.innerHTML = `
      <p class="empty-state">
        Belum ada portofolio.
      </p>
    `;

    return;
  }

  projectGrid.innerHTML = projects.map((project, index) => {
    const tools = normalizeTools(project.tools);

    const imageHTML = project.image_url
      ? `
        <img
          src="${escapeHTML(project.image_url)}"
          alt="${escapeHTML(project.title || "Project")}"
          loading="lazy"
        >
      `
      : `
        <div class="image-placeholder">
          WISEN / WORK
        </div>
      `;

    const previewHTML = project.project_url
      ? `
        <button
          class="project-open"
          type="button"
          data-preview-url="${escapeHTML(project.project_url)}"
          data-preview-title="${escapeHTML(project.title || "Project")}"
        >
          <span>Lihat</span> ↗
        </button>
      `
      : "";

    const toolsHTML = tools.length
      ? tools.map((tool) => `
          <span>${escapeHTML(tool)}</span>
        `).join("")
      : "";

    return `
      <article
        class="project-card"
        data-category="${escapeHTML(project.category || "")}"
      >
        <div class="project-media">
          ${imageHTML}

          <span class="project-number">
            ${String(index + 1).padStart(2, "0")}
          </span>

          ${previewHTML}
        </div>

        <div class="project-info">
          <div>
            <p class="project-type">
              ${escapeHTML(project.category || "Project")}
            </p>

            <h3>
              ${escapeHTML(project.title || "Tanpa judul")}
            </h3>

            <p>
              ${escapeHTML(project.description || "")}
            </p>
          </div>

          <div class="project-tags">
            ${toolsHTML}
          </div>
        </div>
      </article>
    `;
  }).join("");
}

function filterProjects(category) {
  if (!category || category === "all") {
    renderProjects(state.projects);
    return;
  }

  const filteredProjects = state.projects.filter((project) => {
    return String(project.category || "").toLowerCase() ===
      String(category).toLowerCase();
  });

  renderProjects(filteredProjects);
}

/* =========================================================
   SERVICES
========================================================= */

async function loadServices() {
  const serviceList = $("#service-list");

  if (!serviceList) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("services")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error("Gagal memuat layanan:", error);

    serviceList.innerHTML = `
      <p class="empty-state">
        Layanan belum dapat dimuat.
      </p>
    `;

    return;
  }

  state.services = data || [];

  renderServices();
  populateServiceSelect();
}

function renderServices() {
  const serviceList = $("#service-list");

  if (!serviceList) {
    return;
  }

  if (!state.services.length) {
    serviceList.innerHTML = `
      <p class="empty-state">
        Belum ada layanan.
      </p>
    `;

    return;
  }

  serviceList.innerHTML = state.services.map((service, index) => {
    const title = service.title || "Layanan";

    return `
      <article class="service-card">
        <div class="service-number">
          ${String(index + 1).padStart(2, "0")}
        </div>

        <div class="service-main">
          <div>
            <h3>${escapeHTML(title)}</h3>

            <p>
              ${escapeHTML(service.description || "")}
            </p>
          </div>
        </div>

        <div class="service-meta">
          <span>Mulai dari</span>
          <strong>${formatPrice(service.price_start)}</strong>
        </div>

        <button
          class="service-select"
          type="button"
          data-service="${escapeHTML(title)}"
          aria-label="Pilih ${escapeHTML(title)}"
        >
          ↗
        </button>
      </article>
    `;
  }).join("");
}

function populateServiceSelect() {
  const select = $("#order-service");

  if (!select) {
    return;
  }

  select.innerHTML = `
    <option value="">Pilih layanan</option>

    ${state.services.map((service) => `
      <option value="${escapeHTML(service.title || "")}">
        ${escapeHTML(service.title || "")}
      </option>
    `).join("")}
  `;
}

/* =========================================================
   UI EVENTS
========================================================= */

function bindUIEvents() {
  [
    "#open-order-button",
    "#hero-order-button",
    "#contact-order-button"
  ].forEach((selector) => {
    $(selector)?.addEventListener("click", () => {
      openLayer("#order-panel");
    });
  });

  $("#close-order-button")?.addEventListener("click", closeLayers);
  $("#close-auth-button")?.addEventListener("click", closeLayers);
  $("#close-chat-button")?.addEventListener("click", closeLayers);

  [
    "#open-chat-button",
    "#contact-chat-button"
  ].forEach((selector) => {
    $(selector)?.addEventListener("click", openChat);
  });

  $("#page-overlay")?.addEventListener("click", closeLayers);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeLayers();
    }
  });

  bindProjectFilters();
  bindServiceSelection();
  bindProjectPreview();

  $("#order-form")?.addEventListener("submit", submitOrder);
  $("#email-login-form")?.addEventListener("submit", handleEmailLogin);
  $("#google-login-button")?.addEventListener("click", loginWithGoogle);
  $("#chat-form")?.addEventListener("submit", sendMessage);

  $("#register-button")?.addEventListener("click", handleRegister);
}

function bindProjectFilters() {
  $$(".filter-button").forEach((button) => {
    button.addEventListener("click", () => {
      $$(".filter-button").forEach((item) => {
        item.classList.remove("active");
      });

      button.classList.add("active");

      filterProjects(button.dataset.filter || "all");
    });
  });
}

function bindServiceSelection() {
  $("#service-list")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-service]");

    if (!button) {
      return;
    }

    const select = $("#order-service");

    if (select) {
      select.value = button.dataset.service || "";
    }

    openLayer("#order-panel");
  });
}

function bindProjectPreview() {
  $("#project-grid")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-preview-url]");

    if (!button) {
      return;
    }

    const url = button.dataset.previewUrl;
    const title = button.dataset.previewTitle || "Preview Project";

    if (!url) {
      return;
    }

    const dialog = $("#preview-dialog");
    const titleElement = $("#preview-title");
    const frame = $("#project-frame");
    const link = $("#open-project-link");

    if (titleElement) {
      titleElement.textContent = title;
    }

    if (frame) {
      frame.src = url;
    }

    if (link) {
      link.href = url;
    }

    if (dialog?.showModal) {
      dialog.showModal();
    } else {
      window.open(url, "_blank", "noopener,noreferrer");
    }
  });

  $("#close-preview-button")?.addEventListener("click", () => {
    const dialog = $("#preview-dialog");

    if (dialog?.open) {
      dialog.close();
    }
  });
}

/* =========================================================
   LAYERS / MODALS
========================================================= */

function openLayer(selectorOrElement) {
  const element = typeof selectorOrElement === "string"
    ? $(selectorOrElement)
    : selectorOrElement;

  if (!element) {
    return;
  }

  const overlay = $("#page-overlay");

  element.classList.add("is-open");
  element.setAttribute("aria-hidden", "false");

  if (overlay) {
    overlay.hidden = false;

    requestAnimationFrame(() => {
      overlay.classList.add("is-visible");
    });
  }

  document.body.classList.add("no-scroll");
}

function closeLayers() {
  [
    "#order-panel",
    "#auth-modal",
    "#chat-panel"
  ].forEach((selector) => {
    const element = $(selector);

    if (!element) {
      return;
    }

    element.classList.remove("is-open");
    element.setAttribute("aria-hidden", "true");
  });

  const overlay = $("#page-overlay");

  if (overlay) {
    overlay.classList.remove("is-visible");

    window.setTimeout(() => {
      overlay.hidden = true;
    }, 250);
  }

  document.body.classList.remove("no-scroll");
}

/* =========================================================
   MOBILE MENU
========================================================= */

function bindMobileMenu() {
  const menuButton = $("#menu-button");
  const mobileMenu = $("#mobile-menu");

  if (!menuButton || !mobileMenu) {
    return;
  }

  menuButton.addEventListener("click", () => {
    const isOpen =
      menuButton.getAttribute("aria-expanded") === "true";

    menuButton.setAttribute("aria-expanded", String(!isOpen));
    mobileMenu.hidden = isOpen;
    mobileMenu.classList.toggle("is-open", !isOpen);
  });

  $$("#mobile-menu a").forEach((link) => {
    link.addEventListener("click", closeMobileMenu);
  });

  $(".mobile-order-button")?.addEventListener("click", () => {
    closeMobileMenu();
    openLayer("#order-panel");
  });
}

function closeMobileMenu() {
  const menuButton = $("#menu-button");
  const mobileMenu = $("#mobile-menu");

  if (!menuButton || !mobileMenu) {
    return;
  }

  menuButton.setAttribute("aria-expanded", "false");
  mobileMenu.hidden = true;
  mobileMenu.classList.remove("is-open");
}

/* =========================================================
   AUTHENTICATION
========================================================= */

async function handleEmailLogin(event) {
  event.preventDefault();

  const email = $("#auth-email")?.value.trim();
  const password = $("#auth-password")?.value;

  if (!email || !password) {
    showToast("Email dan password wajib diisi.", "error");
    return;
  }

  const { error } = await supabaseClient.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    showToast(error.message, "error");
    return;
  }

  closeLayers();
  showToast("Berhasil masuk.");
}

async function loginWithGoogle() {
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin
    }
  });

  if (error) {
    showToast(error.message, "error");
  }
}

async function handleRegister() {
  const email = $("#auth-email")?.value.trim();
  const password = $("#auth-password")?.value;

  if (!email || !password) {
    showToast(
      "Isi email dan password terlebih dahulu untuk mendaftar.",
      "error"
    );

    return;
  }

  const { error } = await supabaseClient.auth.signUp({
    email,
    password
  });

  if (error) {
    showToast(error.message, "error");
    return;
  }

  showToast(
    "Pendaftaran berhasil. Periksa email untuk konfirmasi akun."
  );
}

async function logoutUser() {
  const confirmed = window.confirm("Keluar dari akun?");

  if (!confirmed) {
    return;
  }

  const { error } = await supabaseClient.auth.signOut();

  if (error) {
    showToast(error.message, "error");
    return;
  }

  state.user = null;
  state.profile = null;
  state.conversationId = null;

  if (state.realtimeChannel) {
    await supabaseClient.removeChannel(state.realtimeChannel);
    state.realtimeChannel = null;
  }

  closeLayers();
  updateAccountUI();

  showToast("Berhasil keluar.");
}

async function loadProfile() {
  if (!state.user) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", state.user.id)
    .maybeSingle();

  if (error) {
    console.error("Gagal memuat profile:", error);
    return;
  }

  state.profile = data || null;
}

function updateAccountUI() {
  const loginButton = $("#open-auth-button");
  const footerLoginButton = $("#footer-login-button");

  const isAdmin = state.profile?.role === "admin";

  document.querySelectorAll(".admin-nav-link").forEach((link) => {
    link.hidden = !isAdmin;
  });

  if (state.user) {
    if (loginButton) {
      loginButton.innerHTML = `
        <span>Keluar</span>
      `;

      loginButton.onclick = logoutUser;
    }

    if (footerLoginButton) {
      footerLoginButton.textContent = "Keluar";
      footerLoginButton.onclick = logoutUser;
    }

    return;
  }

  if (loginButton) {
    loginButton.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm7 8a7 7 0 0 0-14 0"/>
      </svg>

      <span>Masuk</span>
    `;

    loginButton.onclick = () => {
      openLayer("#auth-modal");
    };
  }

  if (footerLoginButton) {
    footerLoginButton.textContent = "Masuk";

    footerLoginButton.onclick = () => {
      openLayer("#auth-modal");
    };
  }
}

/* =========================================================
   ORDER
========================================================= */

async function submitOrder(event) {
  event.preventDefault();

  const name = $("#order-name")?.value.trim();
  const email = $("#order-email")?.value.trim();
  const service = $("#order-service")?.value;
  const budget = $("#order-budget")?.value;
  const deadline = $("#order-deadline")?.value || null;
  const message = $("#order-message")?.value.trim();

  if (!name || !email || !service || !budget || !message) {
    showToast("Lengkapi semua data yang wajib diisi.", "error");
    return;
  }

  const serviceData = state.services.find((item) => {
    return item.title === service;
  });

  const payload = {
    user_id: state.user?.id || null,
    service_id: serviceData?.id || null,
    customer_name: name,
    customer_email: email,
    budget,
    deadline,
    description: message,
    status: "new"
  };

  const { error } = await supabaseClient
    .from("orders")
    .insert(payload);

  if (error) {
    console.error("Gagal mengirim order:", error);
    showToast(error.message, "error");
    return;
  }

  $("#order-form")?.reset();

  closeLayers();

  showToast("Permintaan proyek berhasil dikirim.");
}

/* =========================================================
   CHAT
========================================================= */

async function openChat() {
  if (!state.user) {
    openLayer("#auth-modal");
    showToast("Silakan masuk terlebih dahulu.", "error");
    return;
  }

  openLayer("#chat-panel");

  await getOrCreateConversation();
}

async function getOrCreateConversation() {
  if (!state.user) {
    return;
  }

  let { data: conversation, error } = await supabaseClient
    .from("conversations")
    .select("*")
    .eq("user_id", state.user.id)
    .maybeSingle();

  if (error) {
    console.error("Gagal mengambil conversation:", error);
    showToast(error.message, "error");
    return;
  }

  if (!conversation) {
    const result = await supabaseClient
      .from("conversations")
      .insert({
        user_id: state.user.id,
        subject: "Konsultasi website",
        status: "open"
      })
      .select()
      .single();

    if (result.error) {
      console.error(
        "Gagal membuat conversation:",
        result.error
      );

      showToast(result.error.message, "error");
      return;
    }

    conversation = result.data;
  }

  state.conversationId = conversation.id;

  await loadMessages();
  subscribeToMessages();
}

async function loadMessages() {
  if (!state.conversationId) {
    return;
  }

  const { data, error } = await supabaseClient
    .from("messages")
    .select("*")
    .eq("conversation_id", state.conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Gagal memuat pesan:", error);
    return;
  }

  renderMessages(data || []);
}

function renderMessages(messages = []) {
  const container = $("#chat-messages");

  if (!container) {
    return;
  }

  if (!messages.length) {
    container.innerHTML = `
      <div class="chat-empty">
        Belum ada pesan. Mulai percakapan dengan menuliskan kebutuhanmu.
      </div>
    `;

    return;
  }

  const userName = getCurrentProfileName();
  const userInitials = getInitials(userName);

  container.innerHTML = messages.map((message) => {
    const isSent = message.sender_id === state.user?.id;

    const profileName = isSent ? userName : "Wisen";
    const profileRole = isSent ? "Kamu" : "Admin";
    const profileInitials = isSent ? userInitials : "W";

    return `
      <div class="chat-message-row ${
        isSent ? "is-sent" : "is-received"
      }">
        <div
          class="message-avatar"
          aria-hidden="true"
          title="${escapeHTML(profileName)}"
        >
          ${escapeHTML(profileInitials)}
        </div>

        <div class="message-content">
          <div class="message-profile">
            <strong>${escapeHTML(profileName)}</strong>
            <span>${escapeHTML(profileRole)}</span>
          </div>

          <div class="message ${
            isSent ? "message-sent" : "message-received"
          }">
            <p>${escapeHTML(message.message || "")}</p>

            <div class="message-meta">
              <time datetime="${escapeHTML(message.created_at || "")}">
                ${formatTime(message.created_at)}
              </time>

              ${
                isSent
                  ? `<span class="message-delivery" aria-label="Terkirim">✓</span>`
                  : ""
              }
            </div>
          </div>
        </div>
      </div>
    `;
  }).join("");

  requestAnimationFrame(() => {
    container.scrollTop = container.scrollHeight;
  });
}


async function subscribeToMessages() {
  if (!state.conversationId) {
    return;
  }

  if (state.realtimeChannel) {
    await supabaseClient.removeChannel(state.realtimeChannel);
    state.realtimeChannel = null;
  }

  const conversationId = state.conversationId;

  state.realtimeChannel = supabaseClient
    .channel(`conversation-${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`
      },
      async (payload) => {
        if (
          state.conversationId !== conversationId ||
          !payload.new
        ) {
          return;
        }

        await loadMessages();
      }
    )
    .subscribe();
}


async function sendMessage(event) {
  event.preventDefault();

  if (!state.user) {
    showToast("Silakan masuk terlebih dahulu.", "error");
    return;
  }

  const input = $("#chat-input");
  const sendButton = $("#chat-send-button");
  const message = input?.value.trim();

  if (!message) {
    return;
  }

  if (sendButton?.disabled) {
    return;
  }

  if (!state.conversationId) {
    await getOrCreateConversation();
  }

  if (!state.conversationId) {
    showToast("Percakapan belum tersedia.", "error");
    return;
  }

  if (sendButton) {
    sendButton.disabled = true;
    sendButton.classList.add("is-sending");
  }

  try {
    const { error } = await supabaseClient
      .from("messages")
      .insert({
        conversation_id: state.conversationId,
        sender_id: state.user.id,
        message
      });

    if (error) {
      throw error;
    }

    input.value = "";
    input.style.height = "auto";
    updateChatCharacterCount();

    await loadMessages();

    input.focus();

  } catch (error) {
    console.error("Gagal mengirim pesan:", error);
    showToast(error.message || "Pesan gagal dikirim.", "error");

  } finally {
    if (sendButton) {
      sendButton.disabled = false;
      sendButton.classList.remove("is-sending");
    }
  }
}


/* =========================================================
   START APPLICATION
========================================================= */

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeApp);
} else {
  initializeApp();
}