"use strict";

/* =========================================================
   SUPABASE INITIALIZATION
========================================================= */

let supabaseClient = null;
let currentUser = null;
let currentAdminProfile = null;

const state = {
  projects: [],
  services: [],
  orders: [],
  conversations: [],
  activeConversationId: null,
  messagesChannel: null
};

document.addEventListener("DOMContentLoaded", initAdmin);

async function initAdmin() {
  try {
    showLoading();

    if (!window.supabase || typeof window.supabase.createClient !== "function") {
      throw new Error(
        "Library Supabase belum termuat. Periksa koneksi internet atau CDN."
      );
    }

    const config = window.APP_CONFIG;

    if (!config) {
      throw new Error(
        "APP_CONFIG tidak ditemukan. Pastikan file config.js dimuat."
      );
    }

    const supabaseUrl = config.SUPABASE_URL || config.supabaseUrl;
    const supabaseAnonKey = config.SUPABASE_ANON_KEY || config.supabaseAnonKey;

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error(
        "SUPABASE_URL atau SUPABASE_ANON_KEY belum diisi di config.js."
      );
    }

    supabaseClient = window.supabase.createClient(supabaseUrl, supabaseAnonKey);

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

    const { data: profile, error: profileError } = await supabaseClient
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

    currentAdminProfile = profile;
    showAdminContent(profile);
    bindEvents();

    await loadDashboard();

  } catch (error) {
    console.error("Admin initialization error:", error);
    showError(error.message || "Terjadi kesalahan.");
  }
}

/* =========================================================
   BINDINGS
========================================================= */

function bindEvents() {
  $("#logoutButton")?.addEventListener("click", logout);
  $("#retryButton")?.addEventListener("click", initAdmin);
  $("#refreshDashboardButton")?.addEventListener("click", loadDashboard);
  $("#refreshOrdersButton")?.addEventListener("click", loadOrders);

  $("#adminTabs")?.addEventListener("click", (event) => {
    const button = event.target.closest("[data-tab]");
    if (button) switchTab(button.dataset.tab);
  });

  document.querySelectorAll("[data-close-panel]").forEach((button) => {
    button.addEventListener("click", () => {
      closePanel(button.dataset.closePanel);
    });
  });

  document.querySelectorAll("[data-close-modal]").forEach((button) => {
    button.addEventListener("click", () => {
      closeModal(button.dataset.closeModal);
    });
  });

  $("#adminOverlay")?.addEventListener("click", closeAllLayers);

  $("#addProjectButton")?.addEventListener("click", () => openProjectPanel());
  $("#projectForm")?.addEventListener("submit", submitProjectForm);
  $("#projectImage")?.addEventListener("change", previewProjectImage);

  $("#addServiceButton")?.addEventListener("click", () => openServicePanel());
  $("#serviceForm")?.addEventListener("submit", submitServiceForm);

  $("#threadForm")?.addEventListener("submit", sendAdminMessage);

  bindAdminChatComposer();
}

function switchTab(tab) {
  document.querySelectorAll("[data-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tab === tab);
  });

  document.querySelectorAll("[data-tab-panel]").forEach((panel) => {
    panel.hidden = panel.dataset.tabPanel !== tab;
  });

  if (tab === "projects" && !state.projects.length) loadProjects();
  if (tab === "services" && !state.services.length) loadServices();
  if (tab === "orders" && !state.orders.length) loadOrders();
  if (tab === "messages" && !state.conversations.length) loadConversations();
}

/* =========================================================
   DASHBOARD
========================================================= */

async function loadDashboard() {
  setText("#statProjects", await countRows("projects"));
  setText("#statServices", await countRows("services"));
  setText("#statOrders", await countRows("orders"));
  setText("#statMessages", await countRows("messages"));

  await loadRecentOrders();
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

async function loadRecentOrders() {
  const tbody = $("#recentOrdersBody");
  if (!tbody) return;

  tbody.innerHTML = `<tr class="empty-row"><td colspan="4">Memuat data...</td></tr>`;

  const { data, error } = await supabaseClient
    .from("orders")
    .select("id, customer_name, status, created_at, services(title)")
    .order("created_at", { ascending: false })
    .limit(8);

  if (error) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">Gagal memuat: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  if (!data?.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="4">Belum ada pesanan.</td></tr>`;
    return;
  }

  tbody.innerHTML = data.map((order) => `
    <tr>
      <td>${escapeHtml(order.customer_name || "-")}</td>
      <td>${escapeHtml(order.services?.title || "-")}</td>
      <td>${statusBadge(order.status)}</td>
      <td>${formatDate(order.created_at)}</td>
    </tr>
  `).join("");
}

/* =========================================================
   PROJECTS (CRUD)
========================================================= */

async function loadProjects() {
  const tbody = $("#projectsTableBody");
  if (!tbody) return;

  tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Memuat data...</td></tr>`;

  const { data, error } = await supabaseClient
    .from("projects")
    .select("*")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Gagal memuat: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  state.projects = data || [];
  renderProjectsTable();
}

function renderProjectsTable() {
  const tbody = $("#projectsTableBody");
  if (!tbody) return;

  if (!state.projects.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Belum ada proyek. Klik "Tambah Proyek" untuk mulai.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.projects.map((project) => `
    <tr>
      <td>
        ${project.image_url
          ? `<img class="row-thumb" src="${escapeHtml(project.image_url)}" alt="">`
          : `<div class="row-thumb"></div>`}
      </td>
      <td>${escapeHtml(project.title)}</td>
      <td>${escapeHtml(project.category || "-")}</td>
      <td>
        <button
          class="badge badge-button ${project.published ? "badge-success" : "badge-muted"}"
          data-toggle-published="${project.id}"
          type="button"
        >
          ${project.published ? "Terbit" : "Draf"}
        </button>
      </td>
      <td>
        <button
          class="badge badge-button ${project.featured ? "badge-primary" : "badge-muted"}"
          data-toggle-featured="${project.id}"
          type="button"
        >
          ${project.featured ? "Ya" : "Tidak"}
        </button>
      </td>
      <td>${project.sort_order ?? 0}</td>
      <td>
        <div class="row-actions">
          <button class="button button-secondary" data-edit-project="${project.id}" type="button">Edit</button>
          <button class="button button-danger" data-delete-project="${project.id}" type="button">Hapus</button>
        </div>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-edit-project]").forEach((button) => {
    button.addEventListener("click", () => {
      openProjectPanel(findById(state.projects, button.dataset.editProject));
    });
  });

  tbody.querySelectorAll("[data-delete-project]").forEach((button) => {
    button.addEventListener("click", () => deleteProject(button.dataset.deleteProject));
  });

  tbody.querySelectorAll("[data-toggle-published]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleProjectFlag(button.dataset.togglePublished, "published");
    });
  });

  tbody.querySelectorAll("[data-toggle-featured]").forEach((button) => {
    button.addEventListener("click", () => {
      toggleProjectFlag(button.dataset.toggleFeatured, "featured");
    });
  });
}

async function toggleProjectFlag(id, field) {
  const project = findById(state.projects, id);
  if (!project) return;

  const { error } = await supabaseClient
    .from("projects")
    .update({ [field]: !project[field] })
    .eq("id", id);

  if (error) {
    showToast(error.message, "error");
    return;
  }

  await loadProjects();
}

function openProjectPanel(project = null) {
  const form = $("#projectForm");
  form.reset();

  $("#projectId").value = project?.id || "";
  $("#projectPanelTitle").textContent = project ? "Edit Proyek" : "Tambah Proyek";
  $("#projectTitle").value = project?.title || "";
  $("#projectCategory").value = project?.category || "Data Entry";
  $("#projectSortOrder").value = project?.sort_order ?? 0;
  $("#projectClient").value = project?.client_name || "";
  $("#projectUrl").value = project?.project_url || "";
  $("#projectDescription").value = project?.description || "";
  $("#projectTools").value = (project?.tools || []).join(", ");
  $("#projectFeatured").checked = Boolean(project?.featured);
  $("#projectPublished").checked = project ? Boolean(project.published) : true;
  setText("#projectFormStatus", "");

  const preview = $("#projectImagePreview");
  const previewImg = $("#projectImagePreviewImg");

  if (project?.image_url) {
    previewImg.src = project.image_url;
    preview.hidden = false;
  } else {
    preview.hidden = true;
  }

  openPanel("project-panel");
}

function previewProjectImage(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const preview = $("#projectImagePreview");
  const previewImg = $("#projectImagePreviewImg");

  previewImg.src = URL.createObjectURL(file);
  preview.hidden = false;
}

async function submitProjectForm(event) {
  event.preventDefault();

  const submitButton = $("#projectSubmitButton");
  const id = $("#projectId").value || null;
  const title = $("#projectTitle").value.trim();

  if (!title) {
    setText("#projectFormStatus", "Judul proyek wajib diisi.");
    return;
  }

  submitButton.disabled = true;
  setText("#projectFormStatus", "Menyimpan...");

  try {
    const payload = {
      title,
      category: $("#projectCategory").value.trim() || "Data Entry",
      description: $("#projectDescription").value.trim() || null,
      client_name: $("#projectClient").value.trim() || null,
      project_url: $("#projectUrl").value.trim() || null,
      tools: $("#projectTools").value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
      featured: $("#projectFeatured").checked,
      published: $("#projectPublished").checked,
      sort_order: Number($("#projectSortOrder").value) || 0
    };

    const imageFile = $("#projectImage").files?.[0];

    if (imageFile) {
      payload.image_url = await uploadToPortfolio(imageFile, "images");
    }

    if (id) {
      const { error } = await supabaseClient
        .from("projects")
        .update(payload)
        .eq("id", id);

      if (error) throw error;
    } else {
      payload.slug = buildSlug(title);
      payload.created_by = currentUser.id;

      const { error } = await supabaseClient
        .from("projects")
        .insert(payload);

      if (error) throw error;
    }

    closePanel("project-panel");
    showToast(id ? "Proyek berhasil diperbarui." : "Proyek berhasil ditambahkan.");
    await loadProjects();
    countRows("projects").then((count) => setText("#statProjects", count));

  } catch (error) {
    console.error("Gagal menyimpan proyek:", error);
    setText("#projectFormStatus", error.message || "Gagal menyimpan proyek.");
  } finally {
    submitButton.disabled = false;
  }
}

async function deleteProject(id) {
  if (!window.confirm("Hapus proyek ini? Tindakan ini tidak bisa dibatalkan.")) return;

  const { error } = await supabaseClient.from("projects").delete().eq("id", id);

  if (error) {
    showToast(error.message, "error");
    return;
  }

  showToast("Proyek dihapus.");
  await loadProjects();
  countRows("projects").then((count) => setText("#statProjects", count));
}

/* =========================================================
   SERVICES (CRUD)
========================================================= */

async function loadServices() {
  const tbody = $("#servicesTableBody");
  if (!tbody) return;

  tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Memuat data...</td></tr>`;

  const { data, error } = await supabaseClient
    .from("services")
    .select("*")
    .order("sort_order", { ascending: true });

  if (error) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Gagal memuat: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  state.services = data || [];
  renderServicesTable();
}

function renderServicesTable() {
  const tbody = $("#servicesTableBody");
  if (!tbody) return;

  if (!state.services.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="6">Belum ada jasa. Klik "Tambah Jasa" untuk mulai.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.services.map((service) => `
    <tr>
      <td>${escapeHtml(service.title)}</td>
      <td>${service.price_start != null ? formatCurrency(service.price_start) : "-"}</td>
      <td>${service.delivery_days != null ? `${service.delivery_days} hari` : "-"}</td>
      <td>
        <button
          class="badge badge-button ${service.active ? "badge-success" : "badge-muted"}"
          data-toggle-active="${service.id}"
          type="button"
        >
          ${service.active ? "Aktif" : "Nonaktif"}
        </button>
      </td>
      <td>${service.sort_order ?? 0}</td>
      <td>
        <div class="row-actions">
          <button class="button button-secondary" data-edit-service="${service.id}" type="button">Edit</button>
          <button class="button button-danger" data-delete-service="${service.id}" type="button">Hapus</button>
        </div>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-edit-service]").forEach((button) => {
    button.addEventListener("click", () => {
      openServicePanel(findById(state.services, button.dataset.editService));
    });
  });

  tbody.querySelectorAll("[data-delete-service]").forEach((button) => {
    button.addEventListener("click", () => deleteService(button.dataset.deleteService));
  });

  tbody.querySelectorAll("[data-toggle-active]").forEach((button) => {
    button.addEventListener("click", () => toggleServiceActive(button.dataset.toggleActive));
  });
}

async function toggleServiceActive(id) {
  const service = findById(state.services, id);
  if (!service) return;

  const { error } = await supabaseClient
    .from("services")
    .update({ active: !service.active })
    .eq("id", id);

  if (error) {
    showToast(error.message, "error");
    return;
  }

  await loadServices();
}

function openServicePanel(service = null) {
  const form = $("#serviceForm");
  form.reset();

  $("#serviceId").value = service?.id || "";
  $("#servicePanelTitle").textContent = service ? "Edit Jasa" : "Tambah Jasa";
  $("#serviceTitle").value = service?.title || "";
  $("#serviceDescription").value = service?.description || "";
  $("#servicePrice").value = service?.price_start ?? "";
  $("#serviceDelivery").value = service?.delivery_days ?? "";
  $("#serviceIcon").value = service?.icon || "briefcase";
  $("#serviceSortOrder").value = service?.sort_order ?? 0;
  $("#serviceActive").checked = service ? Boolean(service.active) : true;
  setText("#serviceFormStatus", "");

  openPanel("service-panel");
}

async function submitServiceForm(event) {
  event.preventDefault();

  const submitButton = $("#serviceSubmitButton");
  const id = $("#serviceId").value || null;
  const title = $("#serviceTitle").value.trim();

  if (!title) {
    setText("#serviceFormStatus", "Nama jasa wajib diisi.");
    return;
  }

  submitButton.disabled = true;
  setText("#serviceFormStatus", "Menyimpan...");

  try {
    const payload = {
      title,
      description: $("#serviceDescription").value.trim() || null,
      price_start: $("#servicePrice").value ? Number($("#servicePrice").value) : null,
      delivery_days: $("#serviceDelivery").value ? Number($("#serviceDelivery").value) : null,
      icon: $("#serviceIcon").value.trim() || "briefcase",
      sort_order: Number($("#serviceSortOrder").value) || 0,
      active: $("#serviceActive").checked
    };

    const { error } = id
      ? await supabaseClient.from("services").update(payload).eq("id", id)
      : await supabaseClient.from("services").insert(payload);

    if (error) throw error;

    closePanel("service-panel");
    showToast(id ? "Jasa berhasil diperbarui." : "Jasa berhasil ditambahkan.");
    await loadServices();
    countRows("services").then((count) => setText("#statServices", count));

  } catch (error) {
    console.error("Gagal menyimpan jasa:", error);
    setText("#serviceFormStatus", error.message || "Gagal menyimpan jasa.");
  } finally {
    submitButton.disabled = false;
  }
}

async function deleteService(id) {
  if (!window.confirm("Hapus jasa ini? Tindakan ini tidak bisa dibatalkan.")) return;

  const { error } = await supabaseClient.from("services").delete().eq("id", id);

  if (error) {
    showToast(error.message, "error");
    return;
  }

  showToast("Jasa dihapus.");
  await loadServices();
  countRows("services").then((count) => setText("#statServices", count));
}

/* =========================================================
   ORDERS
========================================================= */

const ORDER_STATUSES = [
  { value: "new", label: "Baru" },
  { value: "review", label: "Ditinjau" },
  { value: "accepted", label: "Diterima" },
  { value: "working", label: "Dikerjakan" },
  { value: "completed", label: "Selesai" },
  { value: "rejected", label: "Ditolak" }
];

async function loadOrders() {
  const tbody = $("#ordersTableBody");
  if (!tbody) return;

  tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Memuat data...</td></tr>`;

  const { data, error } = await supabaseClient
    .from("orders")
    .select("*, services(title)")
    .order("created_at", { ascending: false });

  if (error) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Gagal memuat: ${escapeHtml(error.message)}</td></tr>`;
    return;
  }

  state.orders = data || [];
  renderOrdersTable();
}

function renderOrdersTable() {
  const tbody = $("#ordersTableBody");
  if (!tbody) return;

  if (!state.orders.length) {
    tbody.innerHTML = `<tr class="empty-row"><td colspan="7">Belum ada pesanan.</td></tr>`;
    return;
  }

  tbody.innerHTML = state.orders.map((order) => `
    <tr>
      <td>${escapeHtml(order.customer_name || "-")}</td>
      <td>${escapeHtml(order.services?.title || "-")}</td>
      <td>${escapeHtml(order.budget || "-")}</td>
      <td>${order.deadline ? formatDate(order.deadline) : "-"}</td>
      <td>
        <select class="status-select" data-order-status="${order.id}">
          ${ORDER_STATUSES.map((status) => `
            <option value="${status.value}" ${status.value === order.status ? "selected" : ""}>
              ${status.label}
            </option>
          `).join("")}
        </select>
      </td>
      <td>${formatDate(order.created_at)}</td>
      <td>
        <button class="button button-secondary" data-view-order="${order.id}" type="button">
          Lihat
        </button>
      </td>
    </tr>
  `).join("");

  tbody.querySelectorAll("[data-order-status]").forEach((select) => {
    select.addEventListener("change", () => {
      updateOrderStatus(select.dataset.orderStatus, select.value);
    });
  });

  tbody.querySelectorAll("[data-view-order]").forEach((button) => {
    button.addEventListener("click", () => {
      openOrderModal(findById(state.orders, button.dataset.viewOrder));
    });
  });
}

async function updateOrderStatus(id, status) {
  const { error } = await supabaseClient
    .from("orders")
    .update({ status })
    .eq("id", id);

  if (error) {
    showToast(error.message, "error");
    await loadOrders();
    return;
  }

  showToast("Status pesanan diperbarui.");
  loadRecentOrders();
}

function openOrderModal(order) {
  if (!order) return;

  setText("#orderModalName", order.customer_name || "Detail Pesanan");

  const rows = [
    ["Email", order.customer_email],
    ["WhatsApp", order.whatsapp],
    ["Perusahaan", order.company],
    ["Layanan", order.services?.title],
    ["Budget", order.budget],
    ["Deadline", order.deadline ? formatDate(order.deadline) : null],
    ["Deskripsi", order.description],
    ["Lampiran", order.attachment_url
      ? `<a href="${escapeHtml(order.attachment_url)}" target="_blank" rel="noopener">Buka lampiran</a>`
      : null],
    ["Dikirim", formatDate(order.created_at)]
  ];

  $("#orderModalBody").innerHTML = rows
    .filter(([, value]) => value)
    .map(([label, value]) => `
      <div class="order-detail-row">
        <strong>${escapeHtml(label)}</strong>
        <span>${label === "Lampiran" ? value : escapeHtml(String(value))}</span>
      </div>
    `).join("");

  openModal("order-modal");
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

function getActiveConversation() {
  return state.conversations.find((conversation) => {
    return String(conversation.id) === String(state.activeConversationId);
  }) || null;
}

function resizeThreadInput(input) {
  if (!input) return;

  input.style.height = "auto";
  input.style.height = `${Math.min(input.scrollHeight, 140)}px`;
}

function updateThreadCharacterCount() {
  const input = $("#threadInput");
  const counter = $("#threadCharacterCount");

  if (!input || !counter) return;

  const length = input.value.length;

  counter.textContent = `${length}/3000`;
  counter.classList.toggle("is-near-limit", length >= 2700);
}

function bindAdminChatComposer() {
  const input = $("#threadInput");
  const form = $("#threadForm");

  if (!input || !form || input.dataset.composerBound === "true") {
    return;
  }

  input.dataset.composerBound = "true";

  input.addEventListener("input", () => {
    resizeThreadInput(input);
    updateThreadCharacterCount();
  });

  input.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || event.isComposing) {
      return;
    }

    if (event.ctrlKey) {
      event.preventDefault();

      const start = input.selectionStart;
      const end = input.selectionEnd;
      const value = input.value;

      input.value =
        value.slice(0, start) +
        "\n" +
        value.slice(end);

      input.selectionStart = start + 1;
      input.selectionEnd = start + 1;

      resizeThreadInput(input);
      updateThreadCharacterCount();
      return;
    }

    if (event.shiftKey || event.altKey || event.metaKey) {
      return;
    }

    event.preventDefault();

    if (input.value.trim()) {
      form.requestSubmit();
    }
  });

  updateThreadCharacterCount();
}

/* =========================================================
   MESSAGES
========================================================= */

async function loadConversations() {
  const list = $("#conversationList");
  if (!list) return;

  list.innerHTML = `<p style="padding:20px; color: var(--muted); font-size:0.8rem;">Memuat percakapan...</p>`;

  const { data, error } = await supabaseClient
    .from("conversations")
    .select("*, profiles(full_name)")
    .order("updated_at", { ascending: false });

  if (error) {
    list.innerHTML = `<p style="padding:20px; color: var(--danger); font-size:0.8rem;">Gagal memuat: ${escapeHtml(error.message)}</p>`;
    return;
  }

  state.conversations = data || [];
  renderConversationList();
}

function renderConversationList() {
  const list = $("#conversationList");
  if (!list) return;

  if (!state.conversations.length) {
    list.innerHTML = `<p style="padding:20px; color: var(--muted); font-size:0.8rem;">Belum ada percakapan.</p>`;
    return;
  }

  list.innerHTML = state.conversations.map((conversation) => `
    <button
      class="conversation-item ${conversation.id === state.activeConversationId ? "is-active" : ""}"
      data-conversation="${conversation.id}"
      type="button"
    >
      <strong>${escapeHtml(conversation.profiles?.full_name || "Pengguna")}</strong>
      <span>${escapeHtml(conversation.subject || "Konsultasi")} · ${formatDate(conversation.updated_at)}</span>
    </button>
  `).join("");

  list.querySelectorAll("[data-conversation]").forEach((button) => {
    button.addEventListener("click", () => openConversation(button.dataset.conversation));
  });
}

async function openConversation(conversationId) {
  state.activeConversationId = conversationId;
  renderConversationList();

  $("#threadForm").hidden = false;
  $("#threadMessages").innerHTML = `<div class="thread-empty">Memuat pesan...</div>`;

  const { data, error } = await supabaseClient
    .from("messages")
    .select("*")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true });

  if (error) {
    $("#threadMessages").innerHTML = `<div class="thread-empty">Gagal memuat pesan.</div>`;
    return;
  }

  renderThread(data || []);
  subscribeToThread(conversationId);
}

function renderThread(messages) {
  const container = $("#threadMessages");

  if (!container) return;

  if (!messages.length) {
    container.innerHTML = `
      <div class="thread-empty">
        Belum ada pesan di percakapan ini.
      </div>
    `;

    return;
  }

  const conversation = getActiveConversation();

  const customerName =
    conversation?.profiles?.full_name ||
    "Pengguna";

  const adminName =
    currentAdminProfile?.full_name ||
    currentUser?.email?.split("@")[0] ||
    "Admin";

  container.innerHTML = messages.map((message) => {
    const isMine = message.sender_id === currentUser?.id;

    const senderName = isMine ? adminName : customerName;
    const senderRole = isMine ? "Admin" : "Pengguna";
    const initials = getInitials(senderName);

    return `
      <div class="thread-message-row ${
        isMine ? "is-sent" : "is-received"
      }">
        <div
          class="message-avatar"
          aria-hidden="true"
          title="${escapeHtml(senderName)}"
        >
          ${escapeHtml(initials)}
        </div>

        <div class="thread-message-content">
          <div class="thread-message-profile">
            <strong>${escapeHtml(senderName)}</strong>
            <span>${escapeHtml(senderRole)}</span>
          </div>

          <div class="message ${
            isMine ? "message-sent" : "message-received"
          }">
            <p>${escapeHtml(message.message || "")}</p>

            <div class="thread-message-meta">
              <time datetime="${escapeHtml(message.created_at || "")}">
                ${formatTime(message.created_at)}
              </time>
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


async function subscribeToThread(conversationId) {
  if (state.messagesChannel) {
    await supabaseClient.removeChannel(state.messagesChannel);
    state.messagesChannel = null;
  }

  state.messagesChannel = supabaseClient
    .channel(`admin-conversation-${conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${conversationId}`
      },
      async () => {
        if (
          String(state.activeConversationId) !==
          String(conversationId)
        ) {
          return;
        }

        const { data, error } = await supabaseClient
          .from("messages")
          .select("*")
          .eq("conversation_id", conversationId)
          .order("created_at", { ascending: true });

        if (!error) {
          renderThread(data || []);
        }
      }
    )
    .subscribe();
}


async function sendAdminMessage(event) {
  event.preventDefault();

  const input = $("#threadInput");
  const sendButton = $("#threadSendButton");
  const message = input?.value.trim();

  if (!message || !state.activeConversationId) {
    return;
  }

  if (sendButton?.disabled) {
    return;
  }

  if (sendButton) {
    sendButton.disabled = true;
    sendButton.classList.add("is-sending");
    sendButton.textContent = "Mengirim...";
  }

  try {
    const { error } = await supabaseClient
      .from("messages")
      .insert({
        conversation_id: state.activeConversationId,
        sender_id: currentUser.id,
        message
      });

    if (error) {
      throw error;
    }

    input.value = "";
    input.style.height = "auto";
    updateThreadCharacterCount();
    input.focus();

    const { data, error: loadError } = await supabaseClient
      .from("messages")
      .select("*")
      .eq("conversation_id", state.activeConversationId)
      .order("created_at", { ascending: true });

    if (!loadError) {
      renderThread(data || []);
    }

  } catch (error) {
    console.error("Gagal mengirim balasan:", error);
    showToast(error.message || "Pesan gagal dikirim.", "error");

  } finally {
    if (sendButton) {
      sendButton.disabled = false;
      sendButton.classList.remove("is-sending");
      sendButton.textContent = "Kirim";
    }
  }
}


/* =========================================================
   STORAGE
========================================================= */

async function uploadToPortfolio(file, folder = "images") {
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-]/g, "-");
  const path = `${folder}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabaseClient.storage
    .from("portfolio")
    .upload(path, file, { upsert: true });

  if (uploadError) throw uploadError;

  const { data } = supabaseClient.storage.from("portfolio").getPublicUrl(path);
  return data.publicUrl;
}

/* =========================================================
   LAYERS (side-panel / modal / overlay)
========================================================= */

function openPanel(id) {
  $(`#${id}`)?.classList.add("is-open");
  $("#adminOverlay")?.classList.add("is-visible");
  document.body.classList.add("no-scroll");
}

function closePanel(id) {
  $(`#${id}`)?.classList.remove("is-open");
  closeOverlayIfIdle();
}

function openModal(id) {
  $(`#${id}`)?.classList.add("is-open");
  $("#adminOverlay")?.classList.add("is-visible");
  document.body.classList.add("no-scroll");
}

function closeModal(id) {
  $(`#${id}`)?.classList.remove("is-open");
  closeOverlayIfIdle();
}

function closeAllLayers() {
  document.querySelectorAll(".side-panel.is-open, .modal.is-open").forEach((el) => {
    el.classList.remove("is-open");
  });

  closeOverlayIfIdle();
}

function closeOverlayIfIdle() {
  const anyOpen = document.querySelector(".side-panel.is-open, .modal.is-open");

  if (!anyOpen) {
    $("#adminOverlay")?.classList.remove("is-visible");
    document.body.classList.remove("no-scroll");
  }
}

/* =========================================================
   AUTH / STATE HELPERS
========================================================= */

async function logout() {
  if (!supabaseClient) return;

  await supabaseClient.auth.signOut();
  window.location.href = "index.html";
}

function showLoading() {
  $("#loadingState")?.removeAttribute("hidden");
  $("#errorState")?.setAttribute("hidden", "");
  $("#adminContent")?.setAttribute("hidden", "");
}

function showAdminContent(profile) {
  $("#loadingState")?.setAttribute("hidden", "");
  $("#errorState")?.setAttribute("hidden", "");
  $("#adminContent")?.removeAttribute("hidden");

  setText("#adminName", profile.full_name || currentUser?.email || "Admin");
  setText("#adminEmail", currentUser?.email || "");
}

function showError(message) {
  $("#loadingState")?.setAttribute("hidden", "");
  $("#adminContent")?.setAttribute("hidden", "");
  $("#errorState")?.removeAttribute("hidden");
  setText("#errorMessage", message);
}

/* =========================================================
   UTILITIES
========================================================= */

function $(selector) {
  return document.querySelector(selector);
}

function setText(selector, value) {
  const element = typeof selector === "string" ? $(selector) : selector;
  if (element) element.textContent = value;
}

function findById(list, id) {
  return list.find((item) => String(item.id) === String(id));
}

function buildSlug(title) {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  return `${base}-${Date.now().toString(36)}`;
}

function statusBadge(status) {
  const map = {
    new: "badge-info",
    review: "badge-muted",
    accepted: "badge-primary",
    working: "badge-primary",
    completed: "badge-success",
    rejected: "badge-danger"
  };

  const labelMap = {
    new: "Baru",
    review: "Ditinjau",
    accepted: "Diterima",
    working: "Dikerjakan",
    completed: "Selesai",
    rejected: "Ditolak"
  };

  const cls = map[status] || "badge-muted";
  const label = labelMap[status] || status || "-";

  return `<span class="badge ${cls}">${escapeHtml(label)}</span>`;
}

function formatDate(value) {
  if (!value) return "-";

  return new Date(value).toLocaleDateString("id-ID", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function formatTime(value) {
  if (!value) return "";

  return new Date(value).toLocaleTimeString("id-ID", {
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatCurrency(value) {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0
  }).format(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

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

  window.setTimeout(() => toast.remove(), 4000);
}