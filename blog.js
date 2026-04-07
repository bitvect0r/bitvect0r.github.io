(function () {
  const listEl = document.getElementById('blogList');
  const articleEl = document.getElementById('blogArticle');
  const titleEl = document.getElementById('pageTitle');
  let posts = [];

  async function loadIndex() {
    try {
      const res = await fetch('blog/posts/index.json');
      posts = await res.json();
    } catch {
      posts = [];
    }
  }

  function renderList() {
    if (!posts.length) {
      listEl.innerHTML = '<p class="muted">No posts yet.</p>';
      return;
    }
    listEl.innerHTML = posts.map(p =>
      `<a href="#${p.slug}" class="post-item">
        <span class="post-title">${p.title}</span>
        <span class="post-date">${p.date}</span>
      </a>`
    ).join('');
  }

  async function showPost(slug) {
    const post = posts.find(p => p.slug === slug);
    if (!post) return showList();

    try {
      const res = await fetch(`blog/posts/${post.file}`);
      const md = await res.text();
      const html = marked.parse(md);

      listEl.hidden = true;
      articleEl.hidden = false;
      titleEl.textContent = post.title;
      articleEl.innerHTML =
        `<a href="#" class="back-link">&larr; back to posts</a>
         <p class="post-meta">${post.date}</p>
         ${html}`;

      articleEl.querySelector('.back-link').addEventListener('click', e => {
        e.preventDefault();
        history.pushState(null, '', 'blog.html');
        showList();
      });
    } catch {
      showList();
    }
  }

  function showList() {
    listEl.hidden = false;
    articleEl.hidden = true;
    titleEl.textContent = 'Blog';
    renderList();
  }

  function handleHash() {
    const hash = window.location.hash.slice(1);
    if (hash) showPost(hash);
    else showList();
  }

  window.addEventListener('hashchange', handleHash);
  loadIndex().then(handleHash);
})();
