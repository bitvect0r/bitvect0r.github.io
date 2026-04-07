(function () {
  const WIKI_DIR = 'wiki/articles';
  const pageCache = {};
  let allPages = [];
  let currentSlug = null;

  const articleEl = document.getElementById('wikiArticle');
  const listEl = document.getElementById('wikiList');
  const searchEl = document.getElementById('wikiSearch');

  function slugify(name) {
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  function titleFromFilename(fn) {
    return fn.replace(/\.md$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function findPageByName(name) {
    const slug = slugify(name);
    return allPages.find(p => p.slug === slug) ||
           allPages.find(p => p.title.toLowerCase() === name.trim().toLowerCase());
  }

  // Parse YAML frontmatter
  function parseFrontmatter(raw) {
    if (!raw.startsWith('---\n')) return { meta: null, body: raw };
    const end = raw.indexOf('\n---\n', 4);
    if (end === -1) return { meta: null, body: raw };
    const yaml = raw.slice(4, end);
    const body = raw.slice(end + 5).replace(/^\n+/, '');
    const meta = {};
    yaml.split('\n').forEach(line => {
      const m = line.match(/^(\w[\w_]*)\s*:\s*(.+)$/);
      if (!m) return;
      let val = m[2].trim();
      // Parse arrays: [a, b, c]
      if (val.startsWith('[') && val.endsWith(']')) {
        val = val.slice(1, -1).split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
      } else {
        val = val.replace(/^["']|["']$/g, '');
      }
      meta[m[1]] = val;
    });
    return { meta, body };
  }

  function renderMeta(meta) {
    if (!meta || !meta.written_by) return '';
    return `<p class="article-author">${meta.written_by}</p>`;
  }

  // Preprocess wiki links: [[Page Name]]
  function preprocessMarkdown(raw) {
    return raw.replace(/\[\[([^\]]+)\]\]/g, (_, name) => {
      const page = findPageByName(name);
      const slug = page ? page.slug : slugify(name);
      const broken = page ? '' : ' broken';
      return `<a class="wiki-link${broken}" data-slug="${slug}" href="#${slug}">${name.trim()}</a>`;
    });
  }

  async function loadIndex() {
    try {
      const res = await fetch(`${WIKI_DIR}/index.json`);
      const files = await res.json();
      allPages = files.map(fn => ({
        title: titleFromFilename(fn),
        slug: slugify(fn.replace(/\.md$/, '')),
        filename: fn
      }));
    } catch {
      allPages = [];
    }
    renderSidebar();
  }

  async function loadPage(slug) {
    if (pageCache[slug]) return pageCache[slug];
    const page = allPages.find(p => p.slug === slug);
    if (!page) return null;
    try {
      const res = await fetch(`${WIKI_DIR}/${page.filename}`);
      const raw = await res.text();
      const { meta, body } = parseFrontmatter(raw);
      const authorHtml = renderMeta(meta);
      let html = marked.parse(preprocessMarkdown(body));
      // Insert author after the first h1
      if (authorHtml) html = html.replace(/<\/h1>/, `</h1>${authorHtml}`);
      const data = { ...page, raw: body, meta, html };
      pageCache[slug] = data;
      return data;
    } catch {
      return null;
    }
  }

  function renderSidebar(filter = '') {
    const lf = filter.toLowerCase();
    const filtered = lf ? allPages.filter(p => p.title.toLowerCase().includes(lf)) : allPages;
    listEl.innerHTML = filtered.map(p =>
      `<li><a href="#${p.slug}" class="${p.slug === currentSlug ? 'active' : ''}">${p.title}</a></li>`
    ).join('');
  }

  searchEl.addEventListener('input', () => renderSidebar(searchEl.value));

  async function navigate(slug) {
    const page = await loadPage(slug);
    if (!page) {
      articleEl.innerHTML = `<div class="empty-state"><h2>Not found</h2><p>No article with that name exists yet.</p></div>`;
      return;
    }
    currentSlug = slug;
    articleEl.innerHTML = page.html;
    renderSidebar(searchEl.value);

    // Bind wiki link clicks
    articleEl.querySelectorAll('.wiki-link').forEach(el => {
      el.addEventListener('click', e => {
        e.preventDefault();
        window.location.hash = el.dataset.slug;
      });
    });
  }

  function handleHash() {
    const hash = window.location.hash.slice(1);
    if (hash) navigate(hash);
    else if (allPages.length) window.location.hash = allPages[0].slug;
  }

  window.addEventListener('hashchange', handleHash);
  loadIndex().then(handleHash);
})();
