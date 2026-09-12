"use strict";

let supabaseClient = null;
let currentUser = null;

document.addEventListener("DOMContentLoaded", initAdmin);

async function initAdmin() {
  try {
    showLoading();

    // Pastikan library Supabase tersedia
    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error(
        "Library Supabase belum termuat. Periksa koneksi internet atau CDN."
      );
    }

    // Ambil konfigurasi secara aman
    const config = window.APP_CONFIG;

    if (!config) {
      throw new Error(
        "APP_CONFIG tidak ditemukan. Pastikan file config.js dimuat."
      );
    }

    const supabaseUrl =
      config.SUPABASE_URL || config.supabaseUrl;

    const supabaseAnonKey =
      config.SUPABASE_ANON_KEY || config.supabaseAnonKey;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        "SUPABASE_URL atau SUPABASE_ANON_KEY belum diisi di config.js."
      );
    }

    supabaseClient = window.supabase.createClient(
      supabaseUrl,
      supabaseAnonKey
    );

    const {
      data: { user },
      error: userError
    } = await supabaseClient.auth.getUser();

    if (userError) throw userError;

    if (!user) {
      window.location.href = "index.html";
      return;
    }

    currentUser = user;

    const { data: profile, error: profileError } =
      await supabaseClient
        .from("profiles")
        .select("id, full_name, role")
        .eq("id", user.id)
        .maybeSingle();

    if (profileError) throw profileError;

    if (!profile || profile.role !== "admin") {
      throw new Error(
        "Akses ditolak. Role akun kamu belum diset sebagai admin."
      );
    }

    showAdminContent(profile);
    bindEvents();
    await loadDashboard();

  } catch (error) {
    console.error("Admin initialization error:", error);
    showError(error.message || "Terjadi kesalahan.");
  }
}

function bindEvents() {
  document
    .getElementById("logoutButton")
    ?.addEventListener("click", logout);

  document
    .getElementById("retryButton")
    ?.addEventListener("click", initAdmin);

  document
    .getElementById("refreshButton")
    ?.addEventListener("click", loadDashboard);
}

async function loadDashboard() {
  setText("statProjects", await countRows("projects"));
  setText("statServices", await countRows("services"));
  setText("statOrders", await countRows("orders"));
  setText("statMessages", await countRows("messages"));

  await loadOrders();
}

async function countRows(table) {
  const { count, error } = await supabaseClient
    .from(table)
    .select("*", { count: "exact", head: true });

  if (error) {
    console.warn(`Gagal menghitung ${table}:`, error.message);
    return 0;
  }

  return count || 0;
}

async function loadOrders() {
  const tbody = document.getElementById("ordersTableBody");

  if (!tbody) return;

  tbody.innerHTML = `
    <tr>
      <td colspan="5">Memuat data...</td>
    </tr>
  `;

  const { data, error } = await supabaseClient
    .from("orders")
    .select(`
      id,
      customer_name,
      customer_email,
      status,
      created_at,
      services (
        title
      )
    `)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">Gagal memuat orders: ${escapeHtml(error.message)}</td>
      </tr>
    `;
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5">Belum ada pesanan.</td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = data.map((order) => {
    const serviceName = order.services?.title || "-";

    return `
      <tr>
        <td>${escapeHtml(order.customer_name || "-")}</td>
        <td>${escapeHtml(order.customer_email || "-")}</td>
        <td>${escapeHtml(serviceName)}</td>
        <td>
          <span class="status">
            ${escapeHtml(order.status || "pending")}
          </span>
        </td>
        <td>${formatDate(order.created_at)}</td>
      </tr>
    `;
  }).join("");
}

async function logout() {
  if (!supabaseClient) return;

  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}

function showLoading() {
  document.getElementById("loadingState")?.classList.remove("hidden");
  document.getElementById("errorState")?.classList.add("hidden");
  document.getElementById("adminContent")?.classList.add("hidden");
}

function showAdminContent(profile) {
  document.getElementById("loadingState")?.classList.add("hidden");
  document.getElementById("errorState")?.classList.add("hidden");
  document.getElementById("adminContent")?.classList.remove("hidden");

  setText(
    "adminName",
    profile.full_name || currentUser?.email || "Admin"
  );

  setText("adminEmail", currentUser?.email || "");
}

function showError(message) {
  document.getElementById("loadingState")?.classList.add("hidden");
  document.getElementById("adminContent")?.classList.add("hidden");
  document.getElementById("errorState")?.classList.remove("hidden");
  setText("errorMessage", message);
}

function setText(id, value) {
  const element = document.getElementById(id);
  if (element) element.textContent = value;
}

function formatDate(value) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
