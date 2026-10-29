(() => {
  const status = document.getElementById("admin-status");
  const loginSection = document.getElementById("login-section");
  const dashboardSection = document.getElementById("dashboard-section");
  const projectList = document.getElementById("admin-project-list");
  const loginForm = document.getElementById("login-form");

  let supabase;

  function setStatus(message) {
    status.textContent = message;
  }

  function showLogin() {
    loginSection.hidden = false;
    dashboardSection.hidden = true;
  }

  function showDashboard(user) {
    loginSection.hidden = true;
    dashboardSection.hidden = false;
    document.getElementById("admin-email").textContent =
      "Signed in as " + user.email;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  async function loadProjects() {
    projectList.textContent = "Loading projects…";

    const { data, error } = await supabase
      .from("projects")
      .select("id,title,slug,category,published,updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      projectList.textContent = "Could not load projects: " + error.message;
      return;
    }

    if (!data || data.length === 0) {
      projectList.textContent = "No projects yet. Create your first project in the next setup step.";
      return;
    }

    projectList.innerHTML = data.map(project => `
      <article class="admin-project">
        <h3>${escapeHTML(project.title)}</h3>
        <p class="admin-muted">
          ${escapeHTML(project.category || "Other")} ·
          ${project.published ? "Published" : "Draft"}
        </p>
        <p class="admin-muted">Slug: ${escapeHTML(project.slug)}</p>
      </article>
    `).join("");
  }

  async function refreshSession() {
    const { data, error } = await supabase.auth.getSession();

    if (error) {
      setStatus("Session error: " + error.message);
      showLogin();
      return;
    }

    if (!data.session) {
      setStatus("Please sign in with your admin account.");
      showLogin();
      return;
    }

    const { data: adminRecord, error: adminError } = await supabase
      .from("portal_admins")
      .select("user_id")
      .eq("user_id", data.session.user.id)
      .maybeSingle();

    if (adminError || !adminRecord) {
      await supabase.auth.signOut();
      setStatus("This account is not registered as a portal admin. Check portal_admins in Supabase.");
      showLogin();
      return;
    }

    showDashboard(data.session.user);
    setStatus("Admin authenticated. Database connection is working.");
    await loadProjects();
  }

  async function start() {
    const config = window.WERYT_CONFIG || {};

    if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY ||
        config.SUPABASE_URL.includes("PASTE_") ||
        config.SUPABASE_PUBLISHABLE_KEY.includes("PASTE_")) {
      setStatus("Supabase settings are missing. Check config.js.");
      return;
    }

    try {
      supabase = window.supabase.createClient(
        config.SUPABASE_URL,
        config.SUPABASE_PUBLISHABLE_KEY
      );
    } catch (error) {
      setStatus("Could not initialize Supabase: " + error.message);
      return;
    }

    loginForm.addEventListener("submit", async event => {
      event.preventDefault();
      const button = loginForm.querySelector('button[type="submit"]');
      button.disabled = true;
      setStatus("Signing in…");

      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: document.getElementById("login-email").value.trim(),
          password: document.getElementById("login-password").value
        });

        if (error) {
          setStatus("Login failed: " + error.message);
          return;
        }

        await refreshSession();
      } finally {
        button.disabled = false;
      }
    });

    document.getElementById("logout-button").addEventListener("click", async () => {
      await supabase.auth.signOut();
      setStatus("You have signed out.");
      showLogin();
    });

    document.getElementById("refresh-projects-button").addEventListener("click", loadProjects);

    document.getElementById("new-project-button").addEventListener("click", () => {
      document.getElementById("project-form-section").hidden = false;
      document.getElementById("project-form-section").scrollIntoView({
        behavior: "smooth",
        block: "start"
      });
    });

    await refreshSession();
  }

  start();
})();
