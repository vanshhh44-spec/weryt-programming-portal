(() => {
  const $ = id => document.getElementById(id);
  const status = $("admin-status");
  const loginSection = $("login-section");
  const dashboardSection = $("dashboard-section");
  const formSection = $("project-form-section");
  const projectList = $("admin-project-list");
  const form = $("project-form");

  let supabase;
  let editingId = null;
  let slugWasManuallyEdited = false;

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
    $("admin-email").textContent = "Signed in as " + user.email;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[ch]);
  }

  function slugify(value) {
    return value.toLowerCase().trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 170);
  }

  function parseArray(fieldId, label) {
    let value;
    try {
      value = JSON.parse($(fieldId).value);
    } catch {
      throw new Error(label + " must be valid JSON. Check commas, quotation marks and brackets.");
    }
    if (!Array.isArray(value)) {
      throw new Error(label + " must be a JSON array starting with [ and ending with ].");
    }
    return value;
  }

  function resetForm() {
    editingId = null;
    slugWasManuallyEdited = false;
    form.reset();
    $("p-minutes").value = 60;
    $("p-components").value = '[\n  {"name":"ESP8266 development board","quantity":"1","notes":"Main controller"}\n]';
    $("p-instructions").value = '[\n  {"title":"Prepare the components","content":"Collect all the listed components."},\n  {"title":"Make the connections","content":"Follow the pin connection table before powering the circuit."}\n]';
    $("p-connections").value = '[\n  {"component":"LED","pin":"Anode","board_pin":"D1","notes":"Use an appropriate current-limiting resistor"}\n]';
    $("p-troubleshooting").value = '[\n  {"problem":"Circuit does not turn on","solution":"Check the power supply, wiring and common ground."}\n]';
    $("p-published").value = "false";
    $("project-form-heading").textContent = "Create Project";
    $("save-project-button").textContent = "Save Project";
  }

  function openNewProject() {
    resetForm();
    formSection.hidden = false;
    formSection.scrollIntoView({ behavior: "smooth", block: "start" });
    $("p-title").focus();
  }

  function fillForm(project) {
    editingId = project.id;
    slugWasManuallyEdited = true;
    $("p-title").value = project.title || "";
    $("p-slug").value = project.slug || "";
    $("p-category").value = project.category || "Other";
    $("p-difficulty").value = project.difficulty || "Beginner";
    $("p-board").value = project.board || "";
    $("p-minutes").value = project.estimated_minutes || 60;
    $("p-summary").value = project.summary || "";
    $("p-description").value = project.description || "";
    $("p-components").value = JSON.stringify(project.components || [], null, 2);
    $("p-instructions").value = JSON.stringify(project.instructions || [], null, 2);
    $("p-connections").value = JSON.stringify(project.connections || [], null, 2);
    $("p-troubleshooting").value = JSON.stringify(project.troubleshooting || [], null, 2);
    $("p-cover").value = project.cover_image || "";
    $("p-circuit").value = project.circuit_image || "";
    $("p-published").value = String(Boolean(project.published));
    $("project-form-heading").textContent = "Edit Project";
    $("save-project-button").textContent = "Update Project";
    formSection.hidden = false;
    formSection.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function loadProjects() {
    projectList.textContent = "Loading projects…";

    const { data, error } = await supabase
      .from("projects")
      .select("id,slug,title,summary,category,difficulty,board,estimated_minutes,components,instructions,connections,troubleshooting,cover_image,circuit_image,published,updated_at")
      .order("updated_at", { ascending: false });

    if (error) {
      projectList.textContent = "Could not load projects: " + error.message;
      setStatus("Dashboard is open, but loading projects failed.");
      return;
    }

    if (!data || data.length === 0) {
      projectList.textContent = "No projects yet. Click “New Project” to create your first one.";
      return;
    }

    projectList.innerHTML = data.map(project => `
      <article class="admin-project">
        <h3>${escapeHTML(project.title)}</h3>
        <p class="muted">${escapeHTML(project.category || "Other")} · ${escapeHTML(project.board || "Board not specified")}</p>
        <p><span class="badge">${project.published ? "Published" : "Draft"}</span></p>
        <p class="muted">Slug: ${escapeHTML(project.slug)}</p>
        <div class="admin-actions">
          <button type="button" class="admin-button secondary" data-edit="${escapeHTML(project.id)}">Edit</button>
          <button type="button" class="admin-button secondary" data-toggle="${escapeHTML(project.id)}" data-published="${project.published ? "true" : "false"}">${project.published ? "Unpublish" : "Publish"}</button>
          <button type="button" class="admin-button danger" data-delete="${escapeHTML(project.id)}">Delete</button>
        </div>
      </article>
    `).join("");

    projectList.querySelectorAll("[data-edit]").forEach(button => {
      button.addEventListener("click", () => {
        const project = data.find(item => item.id === button.dataset.edit);
        if (project) fillForm(project);
      });
    });

    projectList.querySelectorAll("[data-toggle]").forEach(button => {
      button.addEventListener("click", async () => {
        const nextValue = button.dataset.published !== "true";
        const action = nextValue ? "publish" : "unpublish";
        if (!confirm(`Are you sure you want to ${action} this project?`)) return;

        button.disabled = true;
        const { error } = await supabase
          .from("projects")
          .update({ published: nextValue, updated_at: new Date().toISOString() })
          .eq("id", button.dataset.toggle);

        if (error) {
          setStatus("Could not change publication status: " + error.message);
          button.disabled = false;
          return;
        }

        setStatus(`Project ${nextValue ? "published" : "unpublished"} successfully.`);
        await loadProjects();
      });
    });

    projectList.querySelectorAll("[data-delete]").forEach(button => {
      button.addEventListener("click", async () => {
        if (!confirm("Delete this project permanently? This cannot be undone.")) return;

        button.disabled = true;
        const { error } = await supabase
          .from("projects")
          .delete()
          .eq("id", button.dataset.delete);

        if (error) {
          setStatus("Could not delete project: " + error.message);
          button.disabled = false;
          return;
        }

        setStatus("Project deleted.");
        if (editingId === button.dataset.delete) {
          formSection.hidden = true;
          resetForm();
        }
        await loadProjects();
      });
    });
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

  async function saveProject(event) {
    event.preventDefault();

    const saveButton = $("save-project-button");
    saveButton.disabled = true;
    setStatus("Saving project…");

    try {
      const title = $("p-title").value.trim();
      const slug = $("p-slug").value.trim();

      if (!title || !slug) {
        throw new Error("Project title and slug are required.");
      }

      if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
        throw new Error("Slug must use lowercase letters, numbers and single hyphens only.");
      }

      const minutes = Number($("p-minutes").value || 60);
      if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10000) {
        throw new Error("Estimated time must be a whole number between 1 and 10000 minutes.");
      }

      const payload = {
        title,
        slug,
        category: $("p-category").value,
        difficulty: $("p-difficulty").value,
        board: $("p-board").value.trim() || "Not specified",
        estimated_minutes: minutes,
        summary: $("p-summary").value.trim(),
        description: $("p-description").value.trim(),
        components: parseArray("p-components", "Components"),
        instructions: parseArray("p-instructions", "Instructions"),
        connections: parseArray("p-connections", "Pin Connections"),
        troubleshooting: parseArray("p-troubleshooting", "Troubleshooting"),
        cover_image: $("p-cover").value.trim() || null,
        circuit_image: $("p-circuit").value.trim() || null,
        published: $("p-published").value === "true",
        updated_at: new Date().toISOString()
      };

      if (editingId) {
        const { error } = await supabase
          .from("projects")
          .update(payload)
          .eq("id", editingId);

        if (error) throw error;
        setStatus("Project updated successfully.");
      } else {
        const { error } = await supabase
          .from("projects")
          .insert(payload);

        if (error) throw error;
        setStatus(payload.published
          ? "Project created and published."
          : "Project saved as a draft.");
      }

      formSection.hidden = true;
      resetForm();
      await loadProjects();
    } catch (error) {
      setStatus("Could not save project: " + (error.message || String(error)));
    } finally {
      saveButton.disabled = false;
    }
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
          email: $("login-email").value.trim(),
          password: $("login-password").value
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

    $("new-project-button").addEventListener("click", openNewProject);
    $("refresh-projects-button").addEventListener("click", loadProjects);

    $("logout-button").addEventListener("click", async () => {
      await supabase.auth.signOut();
      formSection.hidden = true;
      setStatus("You have signed out.");
      showLogin();
    });

    $("cancel-project-button").addEventListener("click", () => {
      formSection.hidden = true;
      resetForm();
    });

    $("p-title").addEventListener("input", () => {
      if (!slugWasManuallyEdited) $("p-slug").value = slugify($("p-title").value);
    });

    $("p-slug").addEventListener("input", () => {
      slugWasManuallyEdited = true;
    });

    form.addEventListener("submit", saveProject);

    await refreshSession();
  }

  start();
})();
