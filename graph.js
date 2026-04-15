(function () {
  const WIKI_DIR = 'wiki/articles';
  let nodes = [];
  let edges = [];
  let canvas, ctx;
  let animId = null;
  let hoveredNode = null;
  let dragNode = null;
  let didDrag = false;
  let scale = 1;
  let panX = 0, panY = 0;
  let isPanning = false;
  let panStartX = 0, panStartY = 0;
  let graphBuilt = false;
  let resizeObserver = null;

  function getColors() {
    const style = getComputedStyle(document.documentElement);
    return {
      bg: style.getPropertyValue('--bg').trim(),
      text: style.getPropertyValue('--text').trim(),
      textSecondary: style.getPropertyValue('--text-secondary').trim(),
      textMuted: style.getPropertyValue('--text-muted').trim(),
      link: style.getPropertyValue('--link').trim(),
      accent: style.getPropertyValue('--accent').trim(),
      border: style.getPropertyValue('--border').trim(),
    };
  }

  function slugify(name) {
    return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  }

  async function buildGraph() {
    if (graphBuilt) return;
    const res = await fetch(`${WIKI_DIR}/index.json`);
    const files = await res.json();

    const pages = files.map(fn => ({
      slug: slugify(fn.replace(/\.md$/, '')),
      filename: fn,
      title: fn.replace(/\.md$/, '').replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
    }));

    const slugSet = new Set(pages.map(p => p.slug));
    const linkMap = {};

    const texts = await Promise.all(
      pages.map(p => fetch(`${WIKI_DIR}/${p.filename}`).then(r => r.text()).catch(() => ''))
    );

    pages.forEach((page, i) => {
      const links = [];
      const re = /\[\[([^\]]+)\]\]/g;
      let m;
      while ((m = re.exec(texts[i])) !== null) {
        const targetSlug = slugify(m[1]);
        if (slugSet.has(targetSlug) && targetSlug !== page.slug) {
          links.push(targetSlug);
        }
      }
      linkMap[page.slug] = [...new Set(links)];
    });

    nodes = pages.map(p => {
      const outbound = linkMap[p.slug].length;
      const inbound = pages.filter(other => linkMap[other.slug]?.includes(p.slug)).length;
      const total = outbound + inbound;
      return {
        slug: p.slug,
        title: p.title,
        x: 0, y: 0,
        vx: 0, vy: 0,
        radius: Math.max(4, Math.min(14, 4 + total * 1.5)),
        connections: total,
      };
    });

    const edgeSet = new Set();
    edges = [];
    for (const page of pages) {
      for (const target of linkMap[page.slug]) {
        const key = [page.slug, target].sort().join('|');
        if (!edgeSet.has(key)) {
          edgeSet.add(key);
          edges.push({ source: page.slug, target });
        }
      }
    }

    const r = Math.max(200, nodes.length * 12);
    nodes.forEach((n, i) => {
      const angle = (2 * Math.PI * i) / nodes.length;
      n.x = r * Math.cos(angle) + (Math.random() - 0.5) * 40;
      n.y = r * Math.sin(angle) + (Math.random() - 0.5) * 40;
    });

    graphBuilt = true;
  }

  function getNodeBySlug(slug) {
    return nodes.find(n => n.slug === slug);
  }

  function simulate() {
    const repulsion = 1200;
    const attraction = 0.008;
    const damping = 0.85;
    const idealLength = 120;

    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i], b = nodes[j];
        let dx = a.x - b.x;
        let dy = a.y - b.y;
        let dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = repulsion / (dist * dist);
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        a.vx += fx; a.vy += fy;
        b.vx -= fx; b.vy -= fy;
      }
    }

    for (const e of edges) {
      const a = getNodeBySlug(e.source);
      const b = getNodeBySlug(e.target);
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const force = (dist - idealLength) * attraction;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      a.vx += fx; a.vy += fy;
      b.vx -= fx; b.vy -= fy;
    }

    for (const n of nodes) {
      n.vx -= n.x * 0.001;
      n.vy -= n.y * 0.001;
    }

    for (const n of nodes) {
      if (n === dragNode) continue;
      n.vx *= damping;
      n.vy *= damping;
      n.x += n.vx;
      n.y += n.vy;
    }
  }

  function draw() {
    if (!canvas || !ctx) return;
    const colors = getColors();
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2 + panX, h / 2 + panY);
    ctx.scale(scale, scale);

    for (const e of edges) {
      const a = getNodeBySlug(e.source);
      const b = getNodeBySlug(e.target);
      if (!a || !b) continue;
      const isHighlighted = hoveredNode && (hoveredNode === a || hoveredNode === b);
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.strokeStyle = isHighlighted ? colors.accent : colors.textSecondary;
      ctx.lineWidth = isHighlighted ? 2 : 1;
      ctx.globalAlpha = isHighlighted ? 1 : 0.2;
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    for (const n of nodes) {
      const isHovered = n === hoveredNode;
      const isConnected = hoveredNode && edges.some(e =>
        (e.source === hoveredNode.slug && e.target === n.slug) ||
        (e.target === hoveredNode.slug && e.source === n.slug)
      );
      const dimmed = hoveredNode && !isHovered && !isConnected;

      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius, 0, 2 * Math.PI);
      ctx.fillStyle = isHovered ? colors.accent : (dimmed ? colors.textMuted : colors.link);
      ctx.globalAlpha = dimmed ? 0.2 : (isHovered ? 1 : 0.8);
      ctx.fill();
      ctx.globalAlpha = 1;

      if (isHovered || isConnected || (!hoveredNode && n.connections >= 3)) {
        const font = getComputedStyle(document.documentElement).getPropertyValue('--font').trim();
        ctx.font = `${isHovered ? 'bold ' : ''}11px ${font}`;
        ctx.fillStyle = isHovered ? colors.text : (dimmed ? colors.textMuted : colors.textSecondary);
        ctx.globalAlpha = dimmed ? 0.3 : 1;
        ctx.textAlign = 'center';
        ctx.fillText(n.title, n.x, n.y - n.radius - 6);
        ctx.globalAlpha = 1;
      }
    }

    ctx.restore();

    const font = getComputedStyle(document.documentElement).getPropertyValue('--font').trim();
    ctx.font = `11px ${font}`;
    ctx.fillStyle = colors.textMuted;
    ctx.textAlign = 'left';
    ctx.fillText(`${nodes.length} articles \u00b7 ${edges.length} connections`, 16, h - 16);
  }

  function loop() {
    simulate();
    draw();
    animId = requestAnimationFrame(loop);
  }

  function screenToWorld(sx, sy) {
    return {
      x: (sx - canvas.width / 2 - panX) / scale,
      y: (sy - canvas.height / 2 - panY) / scale,
    };
  }

  function canvasCoords(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const dpr = canvas.width / rect.width;
    return {
      sx: (clientX - rect.left) * dpr,
      sy: (clientY - rect.top) * dpr,
    };
  }

  function isTouchDevice() {
    return 'ontouchstart' in window;
  }

  function hitRadius() {
    return isTouchDevice() ? 16 : 4;
  }

  function nodeAt(wx, wy) {
    const extra = hitRadius();
    for (let i = nodes.length - 1; i >= 0; i--) {
      const n = nodes[i];
      const dx = n.x - wx;
      const dy = n.y - wy;
      const r = n.radius + extra;
      if (dx * dx + dy * dy <= r * r) return n;
    }
    return null;
  }

  // ── Mouse handlers ──

  function onMouseMove(e) {
    const { sx, sy } = canvasCoords(e.clientX, e.clientY);
    const { x: wx, y: wy } = screenToWorld(sx, sy);

    if (dragNode) {
      didDrag = true;
      dragNode.x = wx;
      dragNode.y = wy;
      dragNode.vx = 0;
      dragNode.vy = 0;
      return;
    }

    if (isPanning) {
      const rect = canvas.getBoundingClientRect();
      const dpr = canvas.width / rect.width;
      panX += (e.clientX - panStartX) * dpr;
      panY += (e.clientY - panStartY) * dpr;
      panStartX = e.clientX;
      panStartY = e.clientY;
      didDrag = true;
      return;
    }

    const node = nodeAt(wx, wy);
    hoveredNode = node;
    canvas.style.cursor = node ? 'pointer' : 'grab';
  }

  function onMouseDown(e) {
    const { sx, sy } = canvasCoords(e.clientX, e.clientY);
    const { x: wx, y: wy } = screenToWorld(sx, sy);
    didDrag = false;

    const node = nodeAt(wx, wy);
    if (node) {
      dragNode = node;
      canvas.style.cursor = 'grabbing';
    } else {
      isPanning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      canvas.style.cursor = 'grabbing';
    }
  }

  function onMouseUp(e) {
    const wasDrag = didDrag;
    const clickedNode = dragNode;

    if (clickedNode && !wasDrag) {
      window.location.hash = clickedNode.slug;
    }

    dragNode = null;
    isPanning = false;
    didDrag = false;
    canvas.style.cursor = hoveredNode ? 'pointer' : 'grab';
  }

  function onWheel(e) {
    e.preventDefault();
    const zoomFactor = e.deltaY > 0 ? 0.92 : 1.08;
    scale = Math.max(0.2, Math.min(4, scale * zoomFactor));
  }

  // ── Touch handlers ──

  let lastPinchDist = 0;

  function touchCoords(touch) {
    return canvasCoords(touch.clientX, touch.clientY);
  }

  function onTouchStart(e) {
    e.preventDefault();
    didDrag = false;

    if (e.touches.length === 1) {
      const t = e.touches[0];
      const { sx, sy } = touchCoords(t);
      const { x: wx, y: wy } = screenToWorld(sx, sy);
      const node = nodeAt(wx, wy);
      if (node) {
        dragNode = node;
        hoveredNode = node;
      } else {
        isPanning = true;
        panStartX = t.clientX;
        panStartY = t.clientY;
      }
    } else if (e.touches.length === 2) {
      // Start pinch — cancel any drag/pan
      dragNode = null;
      isPanning = false;
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      lastPinchDist = Math.sqrt(dx * dx + dy * dy);
    }
  }

  function onTouchMove(e) {
    e.preventDefault();
    didDrag = true;

    if (e.touches.length === 1) {
      const t = e.touches[0];
      const { sx, sy } = touchCoords(t);
      const { x: wx, y: wy } = screenToWorld(sx, sy);

      if (dragNode) {
        dragNode.x = wx;
        dragNode.y = wy;
        dragNode.vx = 0;
        dragNode.vy = 0;
      } else if (isPanning) {
        const rect = canvas.getBoundingClientRect();
        const dpr = canvas.width / rect.width;
        panX += (t.clientX - panStartX) * dpr;
        panY += (t.clientY - panStartY) * dpr;
        panStartX = t.clientX;
        panStartY = t.clientY;
      }
    } else if (e.touches.length === 2) {
      const dx = e.touches[0].clientX - e.touches[1].clientX;
      const dy = e.touches[0].clientY - e.touches[1].clientY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (lastPinchDist > 0) {
        const ratio = dist / lastPinchDist;
        scale = Math.max(0.2, Math.min(4, scale * ratio));
      }
      lastPinchDist = dist;
    }
  }

  function onTouchEnd(e) {
    e.preventDefault();
    const wasDrag = didDrag;
    const clickedNode = dragNode;

    if (clickedNode && !wasDrag) {
      window.location.hash = clickedNode.slug;
    }

    dragNode = null;
    isPanning = false;
    hoveredNode = null;
    didDrag = false;
    lastPinchDist = 0;
  }

  function sizeCanvas() {
    if (!canvas) return;
    const container = canvas.parentElement;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const dpr = devicePixelRatio;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = rect.width + 'px';
    canvas.style.height = rect.height + 'px';
  }

  // Public API — called by wiki.js
  window.wikiGraph = {
    async show(containerEl) {
      // Insert canvas into the wiki-content area
      containerEl.innerHTML = '<canvas id="graphCanvas"></canvas>';
      canvas = document.getElementById('graphCanvas');
      ctx = canvas.getContext('2d');

      sizeCanvas();

      canvas.addEventListener('mousemove', onMouseMove);
      canvas.addEventListener('mousedown', onMouseDown);
      canvas.addEventListener('mouseup', onMouseUp);
      canvas.addEventListener('wheel', onWheel, { passive: false });
      canvas.addEventListener('touchstart', onTouchStart, { passive: false });
      canvas.addEventListener('touchmove', onTouchMove, { passive: false });
      canvas.addEventListener('touchend', onTouchEnd, { passive: false });

      // Resize when container changes size
      resizeObserver = new ResizeObserver(() => sizeCanvas());
      resizeObserver.observe(containerEl);

      scale = 1;
      panX = 0;
      panY = 0;
      hoveredNode = null;
      dragNode = null;
      didDrag = false;

      await buildGraph();
      if (!animId) loop();
    },

    hide() {
      if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
        resizeObserver = null;
      }
      canvas = null;
      ctx = null;
    },
  };
})();
