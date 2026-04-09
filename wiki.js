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
    const lines = yaml.split('\n');
    let i = 0;
    while (i < lines.length) {
      const m = lines[i].match(/^(\w[\w_]*)\s*:\s*(.*)$/);
      if (!m) { i++; continue; }
      const key = m[1];
      let val = m[2].trim();
      // Inline array: [a, b, c]
      if (val.startsWith('[') && val.endsWith(']')) {
        const inner = val.slice(1, -1).trim();
        meta[key] = inner === '' ? [] : inner.split(',').map(s => s.trim().replace(/^["']|["']$/g, ''));
        i++;
      // Multiline array (next lines start with "  - ")
      } else if (val === '' && i + 1 < lines.length && lines[i + 1].match(/^\s+-\s/)) {
        const arr = [];
        i++;
        while (i < lines.length && lines[i].match(/^\s+-\s/)) {
          const itemLine = lines[i].replace(/^\s+-\s*/, '');
          const kvMatch = itemLine.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
          if (kvMatch) {
            // Structured object — collect key:value pairs
            const obj = {};
            obj[kvMatch[1]] = kvMatch[2].trim().replace(/^["']|["']$/g, '');
            i++;
            while (i < lines.length && lines[i].match(/^\s+\w[\w_]*\s*:/) && !lines[i].match(/^\s+-\s/)) {
              const sub = lines[i].match(/^\s+(\w[\w_]*)\s*:\s*(.*)$/);
              if (sub) obj[sub[1]] = sub[2].trim().replace(/^["']|["']$/g, '');
              i++;
            }
            arr.push(obj);
          } else {
            arr.push(itemLine.replace(/^["']|["']$/g, ''));
            i++;
          }
        }
        meta[key] = arr;
      } else if (val) {
        meta[key] = val.replace(/^["']|["']$/g, '');
        i++;
      } else {
        i++;
      }
    }
    return { meta, body };
  }

  function renderMeta(meta) {
    if (!meta || !meta.written_by) return '';
    return `<p class="article-author">${meta.written_by}</p>`;
  }

  function renderSources(meta) {
    if (!meta || !meta.sources || !Array.isArray(meta.sources) || meta.sources.length === 0) return '';
    const items = meta.sources.map(s => {
      if (typeof s === 'string') return `<li>${s}</li>`;
      let text = '';
      if (s.title) text += s.url ? `<a href="${s.url}" target="_blank" rel="noopener">${s.title}</a>` : s.title;
      if (s.author) text += ` — ${s.author}`;
      if (s.year) text += ` (${s.year})`;
      return `<li>${text}</li>`;
    }).join('');
    return `<div class="article-sources"><h2>Sources</h2><ul>${items}</ul></div>`;
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
      const sourcesHtml = renderSources(meta);
      let html = marked.parse(preprocessMarkdown(body));
      // Insert author after the first h1
      if (authorHtml) html = html.replace(/<\/h1>/, `</h1>${authorHtml}`);
      // Append sources at the end
      if (sourcesHtml) html += sourcesHtml;
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

  const sidebarEl = searchEl.closest('.wiki-sidebar');

  searchEl.addEventListener('input', () => renderSidebar(searchEl.value));
  searchEl.addEventListener('focus', () => sidebarEl.classList.add('show-list'));
  searchEl.addEventListener('blur', () => {
    // Delay so clicking a list item registers before hiding
    setTimeout(() => {
      if (!searchEl.value) sidebarEl.classList.remove('show-list');
    }, 150);
  });

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
