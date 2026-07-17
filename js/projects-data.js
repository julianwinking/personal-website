// Render portfolio projects from data/projects.md.
;(function () {
  const PROJECTS_FILE = 'data/projects.md';

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function parseList(value) {
    if (!value) return [];
    return value.split(',').map((item) => item.trim()).filter(Boolean);
  }

  function parseProjects(markdown) {
    const projects = { selected: [], other: [] };
    let section = null;
    let currentProject = null;
    let descriptionLines = [];

    function finishProject() {
      if (!currentProject || !section) return;
      currentProject.description = descriptionLines.join(' ').replace(/\s+/g, ' ').trim();
      projects[section].push(currentProject);
      currentProject = null;
      descriptionLines = [];
    }

    markdown.split(/\r?\n/).forEach((line) => {
      const trimmed = line.trim();

      if (trimmed === '## Selected' || trimmed === '## Other') {
        finishProject();
        section = trimmed === '## Selected' ? 'selected' : 'other';
        return;
      }

      if (trimmed.startsWith('### ')) {
        finishProject();
        currentProject = { title: trimmed.slice(4).trim() };
        return;
      }

      if (!currentProject || !section) return;

      const fieldMatch = trimmed.match(/^([a-z]+):\s*(.*)$/i);
      if (fieldMatch) {
        const key = fieldMatch[1].toLowerCase();
        currentProject[key] = fieldMatch[2].trim();
        return;
      }

      if (trimmed) descriptionLines.push(trimmed);
    });

    finishProject();
    return projects;
  }

  function renderTags(tags) {
    return parseList(tags).map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('');
  }

  function renderSelectedProject(project) {
    const tagMarkup = renderTags(project.tags);
    const hasAward = Boolean(project.award);
    const containerClass = hasAward ? 'project-container with-award' : 'project-container';
    const badges = hasAward
      ? `<div class="badges-container">
          <div class="award-badge">${escapeHtml(project.award)}</div>
          <div class="subject-badge">${escapeHtml(project.category || '')}</div>
        </div>`
      : `<div class="subject-badge">${escapeHtml(project.category || '')}</div>`;
    const action = project.url && project.action
      ? `<div class="project-link-indicator">
          <span>&rarr;</span>
          <span>${escapeHtml(project.action)}</span>
        </div>`
      : '';
    const card = `<div class="${containerClass}">
        ${badges}
        <h3>${escapeHtml(project.title)}</h3>
        <div class="project-title-spacer" aria-hidden="true">${escapeHtml(project.title)}</div>
        <div class="project-details">
          <div class="project-details-inner">
            <p>${escapeHtml(project.description || '')}</p>
            ${action}
            ${tagMarkup ? `<div class="project-tags">${tagMarkup}</div>` : ''}
          </div>
        </div>
      </div>`;

    if (!project.url) return `<div class="project-link">${card}</div>`;
    return `<a href="${escapeHtml(project.url)}" target="_blank" class="project-link">${card}</a>`;
  }

  function renderOtherProject(project) {
    const card = `<div class="other-project-card">
        <h3>${escapeHtml(project.title)}</h3>
        <p>${escapeHtml(project.description || '')}</p>
      </div>`;

    if (!project.url) return `<div class="other-project-link">${card}</div>`;
    return `<a href="${escapeHtml(project.url)}" target="_blank" class="other-project-link">${card}</a>`;
  }

  function renderProjects(projects) {
    const selectedContainer = document.querySelector('[data-project-section="selected"]');
    const otherContainer = document.querySelector('[data-project-section="other"]');

    if (selectedContainer) {
      selectedContainer.innerHTML = projects.selected.map(renderSelectedProject).join('');
    }

    if (otherContainer) {
      otherContainer.innerHTML = projects.other.map(renderOtherProject).join('');
    }

    document.dispatchEvent(new CustomEvent('projects:rendered'));
    requestAnimationFrame(() => {
      if (window.initProjectScroll) window.initProjectScroll();
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const response = await fetch(PROJECTS_FILE, { cache: 'no-cache' });
      if (!response.ok) throw new Error(`Could not load ${PROJECTS_FILE}`);
      renderProjects(parseProjects(await response.text()));
    } catch (error) {
      console.error(error);
      document.dispatchEvent(new CustomEvent('projects:rendered'));
    }
  });
})();
