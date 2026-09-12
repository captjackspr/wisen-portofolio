"use strict";

let supabaseClient = null;
let currentUser = null;

document.addEventListener("DOMContentLoaded", initAdmin);

async function initAdmin() {
  try {
    if (!window.supabase) {
      throw new Error("Supabase belum berhasil dimuat.");
    }

    if (
      !window.APP_CONFIG ||
      !window.APP_CONFIG.SUPABASE_URL ||
      !window.APP_CONFIG.SUPABASE_ANON_KEY
    ) {
      throw new Error("Konfigurasi Supabase tidak ditemukan.");
    }

    supabaseClient = window.supabase.createClient(
      window.APP_CONFIG.SUPABASE_URL,
      window.APP_CONFIG.SUPABASE_ANON_KEY
    );

    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError) {
      throw userError;
    }

    if (!user) {
      window.location.href = "index.html";
      return;
    }

    currentUser = user;

    const profile = await loadProfile(user.id);

    if (!profile || profile.role !== "admin") {
      alert("Akses ditolak. Akun kamu bukan admin.");
      await supabaseClient.auth.signOut();
      window.location.href = "index.html";
      return;
    }

    showAdminContent(user, profile);
    bindAdminEvents();
    await loadDashboardData();
  } catch (error) {
    console.error("Admin initialization error:", error);
    showError(error.message || "Gagal memuat admin panel.");
  }
}

async function loadProfile(userId) {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, role, full_name")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

function showAdminContent(user, profile) {
  const loading = document.querySelector("#admin-loading");
  const content = document.querySelector("#admin-content");
  const email = document.querySelector("#admin-email");

  loading?.setAttribute("hidden", "");
  content?.removeAttribute("hidden");

  if (email) {
    email.textContent = profile.full_name || user.email || "Admin";
  }
}

function bindAdminEvents() {
  document
    .querySelector("#logout-button")
    ?.addEventListener("click", logoutAdmin);

  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      switchTab(button.dataset.adminTab);
    });
  });

  document.querySelectorAll("[data-go-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      switchTab(button.dataset.goTab);
    });
  });

  document
    .querySelector("#refresh-projects")
    ?.addEventListener("click", loadProjects);

  document
    .querySelector("#refresh-services")
    ?.addEventListener("click", loadServices);

  document
    .querySelector("#refresh-orders")
    ?.addEventListener("click", loadOrders);

  document
    .querySelector("#refresh-messages")
    ?.addEventListener("click", loadMessages);
}

function switchTab(tabName) {
  document.querySelectorAll("[data-admin-tab]").forEach((button) => {
    button.classList.toggle(
      "active",
      button.dataset.adminTab === tabName
    );
  });

  document.querySelectorAll("[data-panel]").forEach((panel) => {
    const isActive = panel.dataset.panel === tabName;

    panel.toggleAttribute("hidden", !isActive);
    panel.classList.toggle("active", isActive);
  });

  if (tabName === "projects") loadProjects();
  if (tabName === "services") loadServices();
  if (tabName === "orders") loadOrders();
  if (tabName === "messages") loadMessages();
}

async function loadDashboardData() {
  await Promise.all([
    loadProjects(),
    loadServices(),
    loadOrders(),
    loadMessages()
  ]);
}

async function loadProjects() {
  const body = document.querySelector("#projects-table-body");

  if (!body) return;

  body.innerHTML = loadingRow(4);

  const { data, error } = await supabaseClient
    .from("projects")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    body.innerHTML = errorRow(4, error.message);
    setStatus(`Projects: ${error.message}`, "error");
    return;
  }

  document.querySelector("#stat-projects").textContent =
    data?.length || 0;

  if (!data?.length) {
    body.innerHTML = emptyRow(4, "Belum ada project.");
    return;
  }

  body.innerHTML = data.map((project) => {
    const title = project.title || project.name || "Tanpa judul";
    const category = project.category || "-";
    const published = project.published !== false;
    const sortOrder = project.sort_order ?? "-";

    return `
      <tr>
        <td><strong>${escapeHtml(title)}</strong></td>
        <td>${escapeHtml(category)}</td>
        <td>
          <span class="admin-badge ${
            published
              ? "admin-badge-success"
              : "admin-badge-muted"
          }">
            ${published ? "Published" : "Draft"}
          </span>
        </td>
        <td>${escapeHtml(String(sortOrder))}</td>
      </tr>
    `;
  }).join("");
}

async function loadServices() {
  const body = document.querySelector("#services-table-body");

  if (!body) return;

  body.innerHTML = loadingRow(3);

  const { data, error } = await supabaseClient
    .from("services")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    body.innerHTML = errorRow(3, error.message);
    setStatus(`Services: ${error.message}`, "error");
    return;
  }

  document.querySelector("#stat-services").textContent =
    data?.length || 0;

  if (!data?.length) {
    body.innerHTML = emptyRow(3, "Belum ada layanan.");
    return;
  }

  body.innerHTML = data.map((service) => {
    const name = service.title || service.name || "Tanpa nama";
    const description = service.description || "-";
    const published = service.published !== false;

    return `
      <tr>
        <td><strong>${escapeHtml(name)}</strong></td>
        <td>${escapeHtml(description)}</td>
        <td>
          <span class="admin-badge ${
            published
              ? "admin-badge-success"
              : "admin-badge-muted"
          }">
            ${published ? "Active" : "Hidden"}
          </span>
        </td>
      </tr>
    `;
  }).join("");
}

async function loadOrders() {
  const body = document.querySelector("#orders-table-body");

  if (!body) return;

  body.innerHTML = loadingRow(5);

  const { data, error } = await supabaseClient
    .from("orders")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    body.innerHTML = errorRow(5, error.message);
    setStatus(`Orders: ${error.message}`, "error");
    return;
  }

  document.querySelector("#stat-orders").textContent =
    data?.length || 0;

  if (!data?.length) {
    body.innerHTML = emptyRow(5, "Belum ada pesanan.");
    return;
  }

  body.innerHTML = data.map((order) => {
    const name = order.name || order.full_name || "-";
    const email = order.email || "-";
    const service = order.service || "-";
    const status = order.status || "pending";
    const date = formatDate(order.created_at);

    return `
      <tr>
        <td><strong>${escapeHtml(name)}</strong></td>
        <td>${escapeHtml(email)}</td>
        <td>${escapeHtml(service)}</td>
        <td>
          <span class="admin-badge admin-badge-muted">
            ${escapeHtml(status)}
          </span>
        </td>
        <td>${escapeHtml(date)}</td>
      </tr>
    `;
  }).join("");
}

async function loadMessages() {
  const body = document.querySelector("#messages-table-body");

  if (!body) return;

  body.innerHTML = loadingRow(3);

  const { data, error } = await supabaseClient
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    body.innerHTML = errorRow(3, error.message);
    setStatus(`Messages: ${error.message}`, "error");
    return;
  }

  document.querySelector("#stat-messages").textContent =
    data?.length || 0;

  if (!data?.length) {
    body.innerHTML = emptyRow(3, "Belum ada pesan.");
    return;
  }

  body.innerHTML = data.map((message) => {
    const sender =
      message.sender_email ||
      message.email ||
      message.user_id ||
      "Pengunjung";

    const content =
      message.content ||
      message.message ||
      "-";

    const date = formatDate(message.created_at);

    return `
      <tr>
        <td>${escapeHtml(String(sender))}</td>
        <td>${escapeHtml(String(content))}</td>
        <td>${escapeHtml(date)}</td>
      </tr>
    `;
  }).join("");
}

async function logoutAdmin() {
  if (!supabaseClient) return;

  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}

function loadingRow(columnCount) {
  return `
    <tr>
      <td colspan="${columnCount}">Memuat data...</td>
    </tr>
  `;
}

function emptyRow(columnCount, message) {
  return `
    <tr>
      <td colspan="${columnCount}">${escapeHtml(message)}</td>
    </tr>
  `;
}

function errorRow(columnCount, message) {
  return `
    <tr>
      <td colspan="${columnCount}">
        Gagal memuat data: ${escapeHtml(message)}
      </td>
    </tr>
  `;
}

function formatDate(value) {
  if (!value) return "-";

  return new Intl.DateTimeFormat("id-ID", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function setStatus(message, type = "") {
  const status = document.querySelector("#admin-status");

  if (!status) return;

  status.textContent = message;
  status.className = `admin-status ${type}`;

  window.setTimeout(() => {
    status.textContent = "";
    status.className = "admin-status";
  }, 5000);
}

function showError(message) {
  const loading = document.querySelector("#admin-loading");

  if (loading) {
    loading.innerHTML = `
      <p style="color: var(--danger);">
        ${escapeHtml(message)}
      </p>
      <a class="button button-secondary" href="index.html">
        Kembali ke website
      </a>
    `;
  }
}
