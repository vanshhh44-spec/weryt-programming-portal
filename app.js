(() => {
  "use strict";

  const config = window.WERYT_CONFIG || {};

  const notice = document.getElementById("notice");
  const grid = document.getElementById("projectGrid");
  const count = document.getElementById("projectCount");
  const searchInput = document.getElementById("searchInput");
  const filters = document.getElementById("categoryFilters");
  const emptyState = document.getElementById("emptyState");
  const dialog = document.getElementById("projectDialog");
  const detail = document.getElementById("projectDetail");
  const closeDialog = document.getElementById("closeDialog");

  let allProjects = [];
  let activeCategory = "All";
  let client = null;

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;"
    })[character]);
  }

  function showNotice(message, isError = false) {
    notice.textContent = message;
    notice.classList.toggle("error", isError);
    notice.hidden = false;
  }

  function hideNotice() {
    notice.hidden = true;
  }

  function normalizeList(value) {
    if (Array.isArray(value)) return value;
    if (typeof value === "string" && value.trim()) {
      return value.split("\n").map(item => item.trim()).filter(Boolean);
    }
    return [];
  }

  function listItemText(item) {
    if (typeof item === "string") return item;
    if (item && typeof item === "object") {
      return item.text || item.name || item.instruction || item.component || JSON.stringify(item);
    }
    return String(item ?? "");
  }

  function getPublicMediaURL(value) {
    if (!value) return "";

    // Allow full URLs for externally hosted images.
    if (/^https:\/\//i.test(value)) return value;

    // Treat relative paths as objects in the public project-media bucket.
    const cleanPath = String(value).replace(/^\/+/, "").replace(/^project-media\//, "");

    const result = client.storage.from("project-media").getPublicUrl(cleanPath);
    return result.data?.publicUrl || "";
  }

  function imageMarkup(value, alt, className = "detail-cover") {
    if (!value) return "";

    const url = getPublicMediaURL(value);
    if (!url) return "";

    return `
      <img
        class="${className}"
        src="${escapeHTML(url)}"
        alt="${escapeHTML(alt)}"
        loading="lazy"
        onerror="this.style.display='none'"
      >
    `;
  }

  function renderProjects() {
    const query = searchInput.value.trim().toLowerCase();

    const filtered = allProjects.filter(project => {
      const category = project.category || "Other";

      const matchesCategory =
        activeCategory === "All" || category === activeCategory;

      const searchable = [
        project.title,
        project.summary,
        project.description,
        project.board,
        project.category,
        ...normalizeList(project.components).map(listItemText)
      ].join(" ").toLowerCase();

      return matchesCategory && searchable.includes(query);
    });

    count.textContent = `${filtered.length} PROJECT${filtered.length === 1 ? "" : "S"}`;
    grid.replaceChildren();

    emptyState.hidden = filtered.length !== 0;

    filtered.forEach(project => {
      const card = document.createElement("article");
      card.className = "project-card";

      const imageURL = getPublicMediaURL(project.cover_image);

      const image = imageURL
        ? `<img class="project-image" src="${escapeHTML(imageURL)}" alt="${escapeHTML(project.title)}" loading="lazy" onerror="this.style.display='none'">`
        : `<div class="project-image placeholder" aria-hidden="true">⌘</div>`;

      const components = normalizeList(project.components)
        .map(listItemText)
        .slice(0, 3);

      card.innerHTML = `
        ${image}

        <div class="project-card-body">
          <div class="project-meta">
            <span class="category-pill">${escapeHTML(project.category || "Other")}</span>
            <span class="difficulty-pill">${escapeHTML(project.difficulty || "Beginner")}</span>
          </div>

          <h3>${escapeHTML(project.title)}</h3>

          <p>${escapeHTML(project.summary || project.description || "Explore this project and follow its instructions.")}</p>

          <div class="component-preview">
            <strong>Board:</strong> ${escapeHTML(project.board || "Not specified")}<br>
            <strong>Components:</strong> ${escapeHTML(components.join(", ") || "See project details")}
          </div>

          <button class="view-project" type="button" data-project-id="${escapeHTML(project.id)}">
            View Project →
          </button>
        </div>
      `;

      grid.appendChild(card);
    });
  }

  function renderSection(title, content) {
    if (!content) return "";

    return `
      <section class="detail-section">
        <h3>${escapeHTML(title)}</h3>
        ${content}
      </section>
    `;
  }

  function renderList(items, emptyMessage = "No details have been added yet.") {
    const list = normalizeList(items);

    if (!list.length) {
      return `<p>${escapeHTML(emptyMessage)}</p>`;
    }

    return `<ol>${list.map(item => `<li>${escapeHTML(listItemText(item))}</li>`).join("")}</ol>`;
  }

  function renderComponents(items) {
    const list = normalizeList(items);

    if (!list.length) return "<p>Components will be added soon.</p>";

    return `<ul>${list.map(item => `<li>${escapeHTML(listItemText(item))}</li>`).join("")}</ul>`;
  }

  function renderConnections(items) {
    const list = normalizeList(items);

    if (!list.length) return "<p>Pin connections will be added soon.</p>";

    const rows = list.map(item => {
      if (typeof item === "string") {
        return `<tr><td>${escapeHTML(item)}</td><td>—</td><td>—</td></tr>`;
      }

      return `
        <tr>
          <td>${escapeHTML(item.component || item.from || item.name || "")}</td>
          <td>${escapeHTML(item.pin || item.board_pin || "")}</td>
          <td>${escapeHTML(item.connection || item.to || "")}</td>
        </tr>
      `;
    }).join("");

    return `
      <div style="overflow-x:auto">
        <table class="connection-table">
          <thead>
            <tr><th>Component</th><th>Board Pin</th><th>Connection</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

  function renderProjectDetail(project) {
    const cover = imageMarkup(project.cover_image, project.title);
    const circuit = imageMarkup(project.circuit_image, `${project.title} circuit diagram`);

    const instructions = renderList(project.instructions, "Instructions will be added soon.");
    const components = renderComponents(project.components);
    const connections = renderConnections(project.connections);
    const troubleshooting = renderList(project.troubleshooting, "No troubleshooting notes yet.");

    detail.innerHTML = `
      <div class="eyebrow blue-eyebrow">${escapeHTML(project.category || "PROJECT")}</div>

      <h2 style="font-size:clamp(27px,5vw,40px);margin:12px 0">
        ${escapeHTML(project.title)}
      </h2>

      <p class="muted">
        ${escapeHTML(project.summary || project.description || "")}
      </p>

      ${cover}

      ${renderSection("About this project", `<p>${escapeHTML(project.description || project.summary || "Project description coming soon.")}</p>`)}

      ${renderSection("Project information", `
        <p><strong>Board:</strong> ${escapeHTML(project.board || "Not specified")}</p>
        <p><strong>Difficulty:</strong> ${escapeHTML(project.difficulty || "Beginner")}</p>
        <p><strong>Estimated time:</strong> ${escapeHTML(project.estimated_minutes || 60)} minutes</p>
        <p><strong>Firmware version:</strong> ${escapeHTML(project.firmware_version || "Not specified")}</p>
      `)}

      ${renderSection("Required components", components)}

      ${renderSection("Circuit diagram", circuit || "<p>Circuit diagram will be added soon.</p>")}

      ${renderSection("Pin connections", connections)}

      ${renderSection("Step-by-step instructions", instructions)}

      ${renderSection("Troubleshooting", troubleshooting)}

      ${renderSection("Code and firmware", `
        <p>Downloads and firmware installation will be available when the files have been configured for this project.</p>
      `)}
    `;

    if (typeof dialog.showModal === "function") {
      dialog.showModal();
    } else {
      alert("Your browser does not support the project details dialog.");
    }
  }

  async function loadProjects() {
    if (!config.SUPABASE_URL || !config.SUPABASE_PUBLISHABLE_KEY ||
        config.SUPABASE_URL.includes("PASTE_") ||
        config.SUPABASE_PUBLISHABLE_KEY.includes("PASTE_")) {
      showNotice("Supabase is not configured yet. Check config.js and add your Project URL and publishable key.", true);
      count.textContent = "CONFIGURATION REQUIRED";
      return;
    }

    try {
      client = window.supabase.createClient(
        config.SUPABASE_URL,
        config.SUPABASE_PUBLISHABLE_KEY
      );

      const { data, error } = await client
        .from("projects")
        .select("*")
        .eq("published", true)
        .order("created_at", { ascending: false });

      if (error) throw error;

      allProjects = data || [];
      hideNotice();

      if (allProjects.length === 0) {
        showNotice("Your website is connected! No published projects yet. Add a project through the admin dashboard once it is ready.");
      }

      renderProjects();

    } catch (error) {
      console.error("Project loading failed:", error);

      showNotice(
        "Could not load projects. Check your Supabase URL/key, database table, and Row Level Security policies. Details: " +
        (error.message || "Unknown error"),
        true
      );

      count.textContent = "CONNECTION ERROR";
    }
  }

  searchInput.addEventListener("input", renderProjects);

  filters.addEventListener("click", event => {
    const button = event.target.closest("[data-category]");
    if (!button) return;

    activeCategory = button.dataset.category;

    filters.querySelectorAll(".filter").forEach(filter => {
      filter.classList.toggle("active", filter === button);
    });

    renderProjects();
  });

  grid.addEventListener("click", event => {
    const button = event.target.closest("[data-project-id]");
    if (!button) return;

    const project = allProjects.find(item => item.id === button.dataset.projectId);
    if (project) renderProjectDetail(project);
  });

  closeDialog.addEventListener("click", () => dialog.close());

  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });

  loadProjects();
})();
