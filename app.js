const config = window.APP_CONFIG;

if (!config?.SUPABASE_URL || !config?.SUPABASE_ANON_KEY) {
  throw new Error(
    "Konfigurasi Supabase tidak ditemukan. Pastikan config.js sudah dibuat dan dimuat sebelum app.js."
  );
}

const { SUPABASE_URL, SUPABASE_ANON_KEY } = config;

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_ANON_KEY
);


const state = {
  user: null,
  profile: null,
  projects: [],
  services: [],
  authMode: "login",
  conversationId: null,
  realtimeChannel: null
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
}

function formatPrice(value) {
  if (!value) return "Hubungi untuk harga";
  return `Mulai Rp${Number(value).toLocaleString("id-ID")}`;
}

function toast(message, type = "success") {
  const element = document.createElement("div");
  element.className = `toast ${type}`;
  element.textContent = message;

  $("#toastContainer").appendChild(element);
  setTimeout(() => element.remove(), 3500);
}

async function initialize() {
  $("#currentYear").textContent = new Date().getFullYear();

  const {
    data: { session }
  } = await supabaseClient.auth.getSession();

  state.user = session?.user || null;

  await Promise.all([
    loadProjects(),
    loadServices()
  ]);

  if (state.user) {
    await loadProfile();
  }

  updateAccountUI();
  bindEvents();
}

async function loadProfile() {
  if (!state.user) return;

  const { data, error } = await supabaseClient
    .from("profiles")
    .select("*")
    .eq("id", state.user.id)
    .single();

  if (error) {
    console.error(error);
    return;
  }

  state.profile = data;
}

async function loadProjects() {
  const { data, error } = await supabaseClient
    .from("projects")
    .select("*")
    .order("sort_order")
    .order("created_at", { ascending: false });

  if (error) {
    $("#projectGrid").innerHTML =
      `<p class="empty-state">Portofolio belum dapat dimuat.</p>`;
    return;
  }

  state.projects = data || [];
  $("#projectCount").textContent = `${state.projects.length}+`;
  renderProjects(state.projects);
}

function renderProjects(projects) {
  if (!projects.length) {
    $("#projectGrid").innerHTML =
      `<p class="empty-state">Belum ada portofolio.</p>`;
    return;
  }

  $("#projectGrid").innerHTML = projects.map((project) => `
    <article class="project-card">
      <div class="project-image">
        ${
          project.image_url
            ? `<img src="${escapeHTML(project.image_url)}"
                    alt="${escapeHTML(project.title)}">`
            : `<div class="image-placeholder">WISEN / WORK</div>`
        }
        ${project.featured ? `<span class="featured">Unggulan</span>` : ""}
      </div>

      <div class="project-body">
        <span class="project-category">
          ${escapeHTML(project.category)}
        </span>

        <h3>${escapeHTML(project.title)}</h3>
        <p>${escapeHTML(project.description || "")}</p>

        <div class="tool-list">
          ${(project.tools || []).map((tool) =>
            `<span>${escapeHTML(tool)}</span>`
          ).join("")}
        </div>

        ${
          project.project_url
            ? `
              <button
                class="text-link"
                data-preview-url="${escapeHTML(project.project_url)}"
                data-preview-title="${escapeHTML(project.title)}"
              >
                Preview proyek →
              </button>
            `
            : `<span class="muted">Studi kasus internal</span>`
        }
      </div>
    </article>
  `).join("");
}

async function loadServices() {
  const { data, error } = await supabaseClient
    .from("services")
    .select("*")
    .order("sort_order");

  if (error) {
    console.error(error);
    return;
  }

  state.services = data || [];

  $("#serviceGrid").innerHTML = state.services.map((service, index) => `
    <article class="service-card">
      <span class="service-number">
        ${String(index + 1).padStart(2, "0")}
      </span>

      <h3>${escapeHTML(service.title)}</h3>
      <p>${escapeHTML(service.description || "")}</p>

      <div class="service-meta">
        <strong>${formatPrice(service.price_start)}</strong>
        <span>± ${service.delivery_days || "-"} hari</span>
      </div>

      <button
        class="button button-secondary full choose-service"
        data-service="${service.id}"
      >
        Pilih jasa
      </button>
    </article>
  `).join("");

  $("#orderService").innerHTML = `
    <option value="">Pilih jasa</option>
    ${state.services.map((service) => `
      <option value="${service.id}">
        ${escapeHTML(service.title)}
      </option>
    `).join("")}
  `;
}

function bindEvents() {
  $("#menuButton").addEventListener("click", () => {
    $("#mainNav").classList.toggle("open");
  });

  $("#loginButton").addEventListener("click", () => {
    $("#authDialog").showModal();
  });

  $("#googleLogin").addEventListener("click", loginWithGoogle);
  $("#authForm").addEventListener("submit", handleEmailAuth);

  $("#toggleAuthMode").addEventListener("click", () => {
    state.authMode = state.authMode === "login" ? "register" : "login";

    $("#emailLogin").textContent =
      state.authMode === "login" ? "Masuk" : "Buat akun";

    $("#toggleAuthMode").textContent =
      state.authMode === "login"
        ? "Belum punya akun? Daftar"
        : "Sudah punya akun? Masuk";
  });

  $$("[data-close-dialog]").forEach((button) => {
    button.addEventListener("click", () => {
      button.closest("dialog").close();
    });
  });

  $$("[data-open-order]").forEach((button) => {
    button.addEventListener("click", openOrderDrawer);
  });

  $("#closeOrder").addEventListener("click", closeOrderDrawer);
  $("#orderOverlay").addEventListener("click", closeOrderDrawer);
  $("#orderForm").addEventListener("submit", submitOrder);

  $("#openChatButton").addEventListener("click", openChat);
  $("#closeChat").addEventListener("click", closeChat);
  $("#chatForm").addEventListener("submit", sendMessage);

  $("#projectGrid").addEventListener("click", handleProjectGridClick);
  $("#serviceGrid").addEventListener("click", handleServiceClick);
  $("#projectFilters").addEventListener("click", filterProjects);

  $("#accountButton").addEventListener("click", handleAccountButton);
  $("#newProjectButton").addEventListener("click", openProjectDialog);
  $("#projectForm").addEventListener("submit", saveProject);
  $("#closeAdmin").addEventListener("click", closeAdmin);

  $$(".admin-nav[data-admin-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      openAdminTab(button.dataset.adminTab);
    });
  });

  supabaseClient.auth.onAuthStateChange(async (_event, session) => {
    state.user = session?.user || null;
    state.profile = null;

    if (state.user) await loadProfile();
    updateAccountUI();
  });
}

async function loginWithGoogle() {
  const { error } = await supabaseClient.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin
    }
  });

  if (error) toast(error.message, "error");
}

async function handleEmailAuth(event) {
  event.preventDefault();

  const email = $("#authEmail").value.trim();
  const password = $("#authPassword").value;
  const fullName = $("#authName").value.trim();

  let result;

  if (state.authMode === "register") {
    result = await supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName }
      }
    });
  } else {
    result = await supabaseClient.auth.signInWithPassword({
      email,
      password
    });
  }

  if (result.error) {
    toast(result.error.message, "error");
    return;
  }

  $("#authDialog").close();

  toast(
    state.authMode === "register"
      ? "Akun dibuat. Periksa email apabila verifikasi diaktifkan."
      : "Berhasil masuk."
  );
}

function updateAccountUI() {
  if (!state.user) {
    $("#loginButton").classList.remove("hidden");
    $("#accountButton").classList.add("hidden");
    return;
  }

  $("#loginButton").classList.add("hidden");
  $("#accountButton").classList.remove("hidden");

  const name = state.profile?.full_name || state.user.email;
  $("#accountButton").textContent = name.charAt(0).toUpperCase();

  $("#customerName").value = state.profile?.full_name || "";
  $("#customerEmail").value = state.user.email || "";
}

async function handleAccountButton() {
  if (state.profile?.role === "admin") {
    openAdmin();
    return;
  }

  const shouldLogout = confirm("Keluar dari akun?");
  if (shouldLogout) await supabaseClient.auth.signOut();
}

function openOrderDrawer() {
  $("#orderDrawer").classList.add("open");
  $("#orderOverlay").classList.add("open");
}

function closeOrderDrawer() {
  $("#orderDrawer").classList.remove("open");
  $("#orderOverlay").classList.remove("open");
}

function handleServiceClick(event) {
  const button = event.target.closest(".choose-service");
  if (!button) return;

  $("#orderService").value = button.dataset.service;
  openOrderDrawer();
}

async function submitOrder(event) {
  event.preventDefault();

  let attachmentUrl = null;
  const attachment = $("#orderAttachment").files[0];

  if (attachment) {
    if (!state.user) {
      toast("Masuk terlebih dahulu untuk mengunggah lampiran.", "error");
      return;
    }

    const safeName = attachment.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${state.user.id}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabaseClient.storage
      .from("attachments")
      .upload(path, attachment);

    if (uploadError) {
      toast(uploadError.message, "error");
      return;
    }

    attachmentUrl = path;
  }

  const payload = {
    user_id: state.user?.id || null,
    service_id: $("#orderService").value || null,
    customer_name: $("#customerName").value.trim(),
    customer_email: $("#customerEmail").value.trim(),
    whatsapp: $("#customerWhatsapp").value.trim() || null,
    budget: $("#customerBudget").value,
    deadline: $("#customerDeadline").value || null,
    description: $("#orderDescription").value.trim(),
    attachment_url: attachmentUrl
  };

  const { error } = await supabaseClient
    .from("orders")
    .insert(payload);

  if (error) {
    toast(error.message, "error");
    return;
  }

  event.target.reset();
  closeOrderDrawer();
  toast("Permintaan berhasil dikirim.");
}

function filterProjects(event) {
  const button = event.target.closest("[data-category]");
  if (!button) return;

  $$(".filter").forEach((item) => item.classList.remove("active"));
  button.classList.add("active");

  const category = button.dataset.category;

  renderProjects(
    category === "all"
      ? state.projects
      : state.projects.filter((project) => project.category === category)
  );
}

function handleProjectGridClick(event) {
  const button = event.target.closest("[data-preview-url]");
  if (!button) return;

  const url = button.dataset.previewUrl;
  $("#previewTitle").textContent = button.dataset.previewTitle;
  $("#projectFrame").src = url;
  $("#openProjectLink").href = url;
  $("#previewDialog").showModal();
}

async function openChat() {
  if (!state.user) {
    $("#authDialog").showModal();
    toast("Silakan masuk untuk menggunakan chat.", "error");
    return;
  }

  $("#chatPanel").classList.add("open");
  await getOrCreateConversation();
}

function closeChat() {
  $("#chatPanel").classList.remove("open");
}

async function getOrCreateConversation() {
  let { data: conversation } = await supabaseClient
    .from("conversations")
    .select("*")
    .eq("user_id", state.user.id)
    .maybeSingle();

  if (!conversation) {
    const { data, error } = await supabaseClient
      .from("conversations")
      .insert({
        user_id: state.user.id,
        subject: "Konsultasi website"
      })
      .select()
      .single();

    if (error) {
      toast(error.message, "error");
      return;
    }

    conversation = data;
  }

  state.conversationId = conversation.id;
  await loadMessages();
  subscribeMessages();
}

async function loadMessages() {
  const { data, error } = await supabaseClient
    .from("messages")
    .select("*")
    .eq("conversation_id", state.conversationId)
    .order("created_at");

  if (error) return;
  renderMessages(data || []);
}

function renderMessages(messages) {
  $("#chatMessages").innerHTML = messages.length
    ? messages.map((message) => `
        <div class="message ${
          message.sender_id === state.user.id ? "mine" : "theirs"
        }">
          ${escapeHTML(message.message)}
          <small>
            ${new Date(message.created_at).toLocaleTimeString("id-ID", {
              hour: "2-digit",
              minute: "2-digit"
            })}
          </small>
        </div>
      `).join("")
    : `<p class="chat-information">
         Halo! Silakan ceritakan kebutuhan proyekmu.
       </p>`;

  $("#chatMessages").scrollTop = $("#chatMessages").scrollHeight;
}

function subscribeMessages() {
  if (state.realtimeChannel) {
    supabaseClient.removeChannel(state.realtimeChannel);
  }

  state.realtimeChannel = supabaseClient
    .channel(`chat-${state.conversationId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "messages",
        filter: `conversation_id=eq.${state.conversationId}`
      },
      loadMessages
    )
    .subscribe();
}

async function sendMessage(event) {
  event.preventDefault();

  const message = $("#chatInput").value.trim();
  if (!message || !state.conversationId) return;

  const { error } = await supabaseClient
    .from("messages")
    .insert({
      conversation_id: state.conversationId,
      sender_id: state.user.id,
      message
    });

  if (error) {
    toast(error.message, "error");
    return;
  }

  $("#chatInput").value = "";
}

function openAdmin() {
  if (state.profile?.role !== "admin") return;

  $("#adminPanel").classList.remove("hidden");
  document.body.classList.add("admin-open");
  openAdminTab("projects");
}

function closeAdmin() {
  $("#adminPanel").classList.add("hidden");
  document.body.classList.remove("admin-open");
}

async function openAdminTab(tab) {
  $$(".admin-nav").forEach((button) => button.classList.remove("active"));
  $(`[data-admin-tab="${tab}"]`)?.classList.add("active");

  $("#adminProjects").classList.toggle("hidden", tab !== "projects");
  $("#adminOrders").classList.toggle("hidden", tab !== "orders");
  $("#adminChats").classList.toggle("hidden", tab !== "chats");
  $("#newProjectButton").classList.toggle("hidden", tab !== "projects");

  if (tab === "projects") await renderAdminProjects();
  if (tab === "orders") await renderAdminOrders();
  if (tab === "chats") await renderAdminChats();
}

async function renderAdminProjects() {
  const { data, error } = await supabaseClient
    .from("projects")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) return;

  $("#adminProjects").innerHTML = `
    <div class="admin-list">
      ${data.map((project) => `
        <article>
          <div>
            <span>${escapeHTML(project.category)}</span>
            <h3>${escapeHTML(project.title)}</h3>
            <small>${project.published ? "Dipublikasikan" : "Draft"}</small>
          </div>

          <button
            class="button button-secondary"
            onclick="editProject('${project.id}')"
          >
            Edit
          </button>

          <button
            class="danger-button"
            onclick="deleteProject('${project.id}')"
          >
            Hapus
          </button>
        </article>
      `).join("")}
    </div>
  `;
}

function openProjectDialog() {
  $("#projectForm").reset();
  $("#projectId").value = "";
  $("#projectPublished").checked = true;
  $("#projectDialog").showModal();
}

window.editProject = async function (id) {
  const { data, error } = await supabaseClient
    .from("projects")
    .select("*")
    .eq("id", id)
    .single();

  if (error) return;

  $("#projectId").value = data.id;
  $("#projectTitle").value = data.title;
  $("#projectCategory").value = data.category;
  $("#projectDescription").value = data.description || "";
  $("#projectTools").value = (data.tools || []).join(", ");
  $("#projectUrl").value = data.project_url || "";
  $("#projectFeatured").checked = data.featured;
  $("#projectPublished").checked = data.published;
  $("#projectDialog").showModal();
};

async function saveProject(event) {
  event.preventDefault();

  const id = $("#projectId").value;
  const image = $("#projectImage").files[0];
  let imageUrl;

  if (image) {
    const safeName = image.name.replace(/[^a-zA-Z0-9._-]/g, "-");
    const path = `${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await supabaseClient.storage
      .from("portfolio")
      .upload(path, image);

    if (uploadError) {
      toast(uploadError.message, "error");
      return;
    }

    const { data } = supabaseClient.storage
      .from("portfolio")
      .getPublicUrl(path);

    imageUrl = data.publicUrl;
  }

  const title = $("#projectTitle").value.trim();

  const payload = {
    title,
    slug: `${title.toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")}-${Date.now()}`,
    category: $("#projectCategory").value.trim(),
    description: $("#projectDescription").value.trim(),
    tools: $("#projectTools").value
      .split(",")
      .map((tool) => tool.trim())
      .filter(Boolean),
    project_url: $("#projectUrl").value.trim() || null,
    featured: $("#projectFeatured").checked,
    published: $("#projectPublished").checked,
    created_by: state.user.id
  };

  if (imageUrl) payload.image_url = imageUrl;

  const query = id
    ? supabaseClient.from("projects").update(payload).eq("id", id)
    : supabaseClient.from("projects").insert(payload);

  const { error } = await query;

  if (error) {
    toast(error.message, "error");
    return;
  }

  $("#projectDialog").close();
  toast("Portofolio berhasil disimpan.");
  await loadProjects();
  await renderAdminProjects();
}

window.deleteProject = async function (id) {
  if (!confirm("Hapus portofolio ini?")) return;

  const { error } = await supabaseClient
    .from("projects")
    .delete()
    .eq("id", id);

  if (error) {
    toast(error.message, "error");
    return;
  }

  toast("Portofolio dihapus.");
  await loadProjects();
  await renderAdminProjects();
};

async function renderAdminOrders() {
  const { data, error } = await supabaseClient
    .from("orders")
    .select("*, services(title)")
    .order("created_at", { ascending: false });

  if (error) return;

  $("#adminOrders").innerHTML = `
    <div class="admin-list">
      ${data.map((order) => `
        <article>
          <div>
            <span>${escapeHTML(order.services?.title || "Jasa lainnya")}</span>
            <h3>${escapeHTML(order.customer_name)}</h3>
            <p>${escapeHTML(order.description)}</p>
            <small>
              ${escapeHTML(order.customer_email)} •
              ${escapeHTML(order.status)}
            </small>
          </div>
        </article>
      `).join("") || "<p>Belum ada pesanan.</p>"}
    </div>
  `;
}

async function renderAdminChats() {
  const { data, error } = await supabaseClient
    .from("conversations")
    .select("*, profiles(full_name)")
    .order("updated_at", { ascending: false });

  if (error) return;

  $("#adminChats").innerHTML = `
    <div class="admin-list">
      ${data.map((chat) => `
        <article>
          <div>
            <span>Percakapan</span>
            <h3>${escapeHTML(chat.profiles?.full_name || "Pengguna")}</h3>
            <small>${escapeHTML(chat.status)}</small>
          </div>

          <button
            class="button button-secondary"
            onclick="openAdminConversation('${chat.id}')"
          >
            Buka chat
          </button>
        </article>
      `).join("") || "<p>Belum ada percakapan.</p>"}
    </div>
  `;
}

window.openAdminConversation = async function (conversationId) {
  state.conversationId = conversationId;
  $("#chatPanel").classList.add("open");
  await loadMessages();
  subscribeMessages();
};

initialize();
