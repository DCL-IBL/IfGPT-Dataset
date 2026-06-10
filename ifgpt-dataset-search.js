/* ============================================================================
 * IfGPT Dataset — Neo4j search & extraction logic
 * Extracted and cleaned from the IfGPT WordPress widget.
 *
 * Requires neo4j-driver (browser build):
 *   https://cdn.jsdelivr.net/npm/neo4j-driver@5.14.0/lib/browser/neo4j-web.min.js
 *
 * Public API (window.IfGPTSearch):
 *   - search()        : run a filtered search using current form state
 *   - downloadJSON()  : export the full result set as JSON (batched 200/page)
 *   - clearForm()     : reset all filters
 *   - selectAll(p)    : tick every checkbox whose id starts with `p`
 *   - clearAll(p)     : untick every checkbox whose id starts with `p`
 * ========================================================================== */

(function () {
  if (window.IfGPTSearch) return;
  window.IfGPTSearch = {};

  // --- Config ---------------------------------------------------------------
  const cfg = {
    uri:      'neo4j+s://8fab59d8.databases.neo4j.io',
    user:     'neo4j',
    password: 'HPa7HpbVTKwadDVkSZbbjvb5-5gxJPaAgWIP68xbcbk',
  };

  // --- State ----------------------------------------------------------------
  let driver = null;
  let currentPage = 1;
  const pageSize = 20;
  let totalRecords = 0;
  let totalWords = 0;

  // --- DOM helpers ----------------------------------------------------------
  const el  = (id) => document.getElementById(id);
  const txt = (id, t) => { const e = el(id); if (e) e.textContent = t; };
  const status = (msg, type) => {
    const s = el('ifgpt-status');
    if (!s) return;
    s.className = 'status status-' + type;
    s.textContent = msg;
    s.style.display = 'block';
  };

  // --- Checkbox utilities ---------------------------------------------------
  IfGPTSearch.selectAll = (prefix) => {
    document.querySelectorAll('input[id^="' + prefix + '"]')
      .forEach((cb) => { cb.checked = true; });
  };
  IfGPTSearch.clearAll = (prefix) => {
    document.querySelectorAll('input[id^="' + prefix + '"]')
      .forEach((cb) => { cb.checked = false; });
  };
  const getSelected = (prefix) =>
    Array.from(document.querySelectorAll('input[id^="' + prefix + '"]:checked'))
      .map((cb) => cb.value);

  // --- Connect & bootstrap --------------------------------------------------
  async function connect() {
    try {
      status('Свързване...', 'info');
      driver = neo4j.driver(cfg.uri, neo4j.auth.basic(cfg.user, cfg.password));
      await driver.verifyConnectivity();
      status('Свързано!', 'success');

      await loadTotal();
      await Promise.all([loadLicences(), loadDomains()]);

      status('Готово', 'success');
      setTimeout(() => { el('ifgpt-status').style.display = 'none'; }, 2000);
    } catch (e) {
      status('Грешка: ' + e.message, 'error');
      console.error(e);
    }
  }

  async function loadTotal() {
    const s = driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      const r = await s.run('MATCH (m:Document) RETURN count(m) AS total');
      const t = r.records[0].get('total').toNumber();
      txt('ifgpt-subtitle', 'Търсене в ' + t.toLocaleString() + ' документа');
    } finally {
      await s.close();
    }
  }

  async function loadLicences() {
    const s = driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      const r = await s.run(
        'MATCH (l:Licence) RETURN l.Type AS licence ORDER BY l.Type'
      );
      renderCheckboxes(
        el('ifgpt-licenseCheckboxes'),
        r.records.map((rec) => rec.get('licence')),
        'lic-'
      );
    } finally {
      await s.close();
    }
  }

  async function loadDomains() {
    const s = driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      const r = await s.run(
        'MATCH (dom:Domain) ' +
        'WHERE NOT (dom)-[:SUBCATEGORY_OF]->(:Domain) ' +
        'RETURN dom.Name AS domain ORDER BY domain'
      );
      renderCheckboxes(
        el('ifgpt-domainCheckboxes'),
        r.records.map((rec) => rec.get('domain')),
        'dom-'
      );
    } finally {
      await s.close();
    }
  }

  function renderCheckboxes(container, values, idPrefix) {
    container.innerHTML = '';
    values.forEach((val, i) => {
      const d   = document.createElement('div');
      d.className = 'checkbox-item';
      const cb  = document.createElement('input');
      cb.type   = 'checkbox';
      cb.id     = idPrefix + i;
      cb.value  = val;
      const lbl = document.createElement('label');
      lbl.setAttribute('for', idPrefix + i);
      lbl.textContent = val;
      d.appendChild(cb);
      d.appendChild(lbl);
      container.appendChild(d);
    });
  }

  // --- Dynamic query builder ------------------------------------------------
  //
  // Returns { matchClause, whereClause, params } based on the current state
  // of the filter form.
  //
  function buildQuery() {
    const cats  = getSelected('cat-');
    const lics  = getSelected('lic-');
    const doms  = getSelected('dom-');
    const yFrom = el('ifgpt-yearFrom').value;
    const yTo   = el('ifgpt-yearTo').value;
    const kw    = el('ifgpt-keywords').value.trim();

    let matchClause = 'MATCH (d:Document)';
    const where = [];
    const params = {};

    if (cats.length > 0) {
      matchClause +=
        ' MATCH (d)-[:LICENSED_WITH]->(licCatNode:Licence)' +
        '-[:HAS_LICENCE_CATEGORY]->(catNode:LicenceCategory)';
      where.push('catNode.Name IN $categories');
      params.categories = cats;
    }
    if (lics.length > 0) {
      matchClause += ' MATCH (d)-[:LICENSED_WITH]->(licNode:Licence)';
      where.push('licNode.Type IN $licences');
      params.licences = lics;
    }
    if (doms.length > 0) {
      matchClause += ' MATCH (d)-[:BELONGS_TO]->(domNode:Domain)';
      where.push('domNode.Name IN $domains');
      params.domains = doms;
    }
    if (yFrom) {
      where.push('d.PublicationDate >= $dateFrom');
      params.dateFrom = yFrom + '-01-01';
    }
    if (yTo) {
      where.push('d.PublicationDate <= $dateTo');
      params.dateTo = yTo + '-12-31';
    }
    if (kw) {
      const list = kw.split(',').map((k) => k.trim()).filter(Boolean);
      if (list.length > 0) {
        const cond = list
          .map((_, i) => 'toLower(d.DocumentTitle) CONTAINS toLower($kw' + i + ')')
          .join(' OR ');
        where.push('(' + cond + ')');
        list.forEach((k, i) => { params['kw' + i] = k; });
      }
    }

    const whereClause = where.length > 0 ? ' WHERE ' + where.join(' AND ') : '';
    return { mc: matchClause, wc: whereClause, p: params };
  }

  // --- Stats (count + sum of words) ----------------------------------------
  async function getStats() {
    const q = buildQuery();
    const s = driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      const cr = await s.run(
        q.mc + q.wc + ' RETURN count(DISTINCT d) AS total',
        q.p
      );
      totalRecords = cr.records[0].get('total').toNumber();

      const wr = await s.run(
        q.mc + q.wc +
        (q.wc ? ' AND ' : ' WHERE ') +
        'd.NumberWords IS NOT NULL RETURN sum(d.NumberWords) AS total',
        q.p
      );
      const wv = wr.records[0].get('total');
      totalWords = wv ? wv.toNumber() : 0;

      txt('ifgpt-totalDocs',  totalRecords.toLocaleString());
      txt('ifgpt-totalWords', totalWords.toLocaleString());
    } catch (e) {
      console.error('Stats error:', e);
      txt('ifgpt-totalDocs',  'Грешка');
      txt('ifgpt-totalWords', 'Грешка');
    } finally {
      await s.close();
    }
  }

  // --- Paginated page query -------------------------------------------------
  //
  // The big query: 20 documents, with all related entities (Author, Domain,
  // Licence, Style, Type, Medium) collected into arrays.
  //
  const PAGE_RETURN_TAIL =
    ' WITH DISTINCT d ' +
    'ORDER BY d.DocumentTitle SKIP $skip LIMIT $limit ' +
    'OPTIONAL MATCH (d)-[:WRITTEN_BY]->(aN:Author) ' +
    'OPTIONAL MATCH (d)-[:BELONGS_TO]->(dN:Domain) ' +
    'OPTIONAL MATCH (d)-[:LICENSED_WITH]->(lN:Licence) ' +
    'OPTIONAL MATCH (d)-[:HAS_STYLE]->(sN:Style) ' +
    'OPTIONAL MATCH (d)-[:HAS_TYPE]->(tN:Type) ' +
    'OPTIONAL MATCH (d)-[:HAS_MEDIUM]->(mN:Medium) ' +
    'WITH d, ' +
    '  collect(DISTINCT aN.Name) AS authors, ' +
    '  collect(DISTINCT dN.Name) AS domains, ' +
    '  collect(DISTINCT lN.Type) AS licences, ' +
    '  collect(DISTINCT sN.Name) AS styles, ' +
    '  collect(DISTINCT tN.Name) AS types, ' +
    '  collect(DISTINCT mN.Name) AS mediums ' +
    'RETURN d.Identifier AS id, d.DocumentTitle AS title, ' +
    '  authors, domains, licences, styles, types, ' +
    '  d.PublicationDate AS pubDate, d.URL AS url, ' +
    '  d.NumberParagraphs AS paragraphs, d.NumberSentences AS sentences, ' +
    '  d.NumberWords AS words, mediums';

  async function loadPage(pg) {
    const q = buildQuery();
    q.p.skip  = neo4j.int((pg - 1) * pageSize);
    q.p.limit = neo4j.int(pageSize);

    const s = driver.session({ defaultAccessMode: neo4j.session.READ });
    try {
      const r = await s.run(q.mc + q.wc + PAGE_RETURN_TAIL, q.p);
      currentPage = pg;
      txt('ifgpt-currentPage', pg);
      showResults(r.records);
      makePagination();
    } catch (e) {
      console.error('Page load error:', e);
      txt('ifgpt-resultsList', 'Грешка при зареждане: ' + e.message);
    } finally {
      await s.close();
    }
  }

  // --- Result rendering -----------------------------------------------------
  function showResults(recs) {
    const c = el('ifgpt-resultsList');
    if (recs.length === 0) { c.innerHTML = 'Няма резултати'; return; }
    c.innerHTML = '';

    recs.forEach((rec) => {
      const card = document.createElement('div');
      card.className = 'result-item';

      const t = document.createElement('div');
      t.className = 'result-title';
      t.textContent = rec.get('title') || 'Без заглавие';
      card.appendChild(t);

      // Tag row: arrays of related-entity names + publication date
      const m = document.createElement('div');
      m.className = 'result-meta';
      ['authors', 'domains', 'licences', 'styles', 'types', 'mediums'].forEach((f) => {
        try {
          const v = rec.get(f);
          if (Array.isArray(v)) {
            v.forEach((vv) => {
              if (vv) {
                const tg = document.createElement('span');
                tg.className = 'result-tag';
                tg.textContent = vv;
                m.appendChild(tg);
              }
            });
          }
        } catch (err) { console.log('Field ' + f + ' error:', err); }
      });

      try {
        const pd = rec.get('pubDate');
        if (pd && pd !== 'N/A') {
          const dateStr = formatDate(pd);
          if (dateStr) {
            const tg = document.createElement('span');
            tg.className = 'result-tag';
            tg.textContent = dateStr;
            m.appendChild(tg);
          }
        }
      } catch (err) { console.log('Date error:', err); }
      card.appendChild(m);

      // Detail row: id, url, paragraphs, sentences, words
      const det = document.createElement('div');
      det.className = 'result-details';
      const add = (lbl, val) => {
        if (val === null || val === undefined) return;
        const itm = document.createElement('div');
        itm.className = 'detail-item';
        const ls = document.createElement('span');
        ls.className = 'detail-label';
        ls.textContent = lbl + ': ';
        itm.appendChild(ls);
        if (typeof val === 'object') {
          if (val.href) {
            const lnk = document.createElement('a');
            lnk.href = val.href;
            lnk.target = '_blank';
            lnk.textContent = val.text;
            itm.appendChild(lnk);
          } else {
            const dv = val.toNumber ? val.toNumber() : val;
            itm.appendChild(document.createTextNode(String(dv)));
          }
        } else {
          itm.appendChild(document.createTextNode(String(val)));
        }
        det.appendChild(itm);
      };

      add('ID', rec.get('id'));
      try {
        const u = rec.get('url');
        if (u) {
          const cu = u.startsWith('file://') ? u.substring(u.indexOf('http')) : u;
          if (cu && cu.startsWith('http')) add('URL', { href: cu, text: 'Виж' });
        }
      } catch (err) { /* ignore */ }
      ['paragraphs', 'sentences', 'words'].forEach((f, i) => {
        try {
          const v = rec.get(f);
          if (v !== null && v !== undefined) {
            const label = ['Абзаци', 'Изречения', 'Думи'][i];
            add(label, typeof v === 'object' ? (v.toNumber ? v.toNumber() : v) : v);
          }
        } catch (err) { /* ignore */ }
      });

      card.appendChild(det);
      c.appendChild(card);
    });
  }

  function formatDate(pd) {
    let y, mo, d;
    if (typeof pd === 'string') {
      const parts = pd.split('-');
      y  = parseInt(parts[0]) || null;
      mo = parseInt(parts[1]) || 1;
      d  = parseInt(parts[2]) || 1;
    } else if (pd && pd.year) {
      y  = pd.year.toNumber  ? pd.year.toNumber()  : pd.year;
      mo = pd.month ? (pd.month.toNumber ? pd.month.toNumber() : pd.month) : 1;
      d  = pd.day   ? (pd.day.toNumber   ? pd.day.toNumber()   : pd.day)   : 1;
    }
    if (!y) return null;
    return y + '-' + String(mo).padStart(2, '0') + '-' + String(d).padStart(2, '0');
  }

  // --- Pagination -----------------------------------------------------------
  function makePagination() {
    const tp = Math.ceil(totalRecords / pageSize);
    const top = el('ifgpt-topPagination');
    const bot = el('ifgpt-bottomPagination');
    top.innerHTML = '';
    bot.innerHTML = '';
    if (tp <= 1) return;

    const build = (container) => {
      const prev = document.createElement('button');
      prev.className = 'page-btn';
      prev.textContent = '← Пред.';
      prev.disabled = currentPage === 1;
      prev.onclick = () => { if (currentPage > 1) loadPage(currentPage - 1); };
      container.appendChild(prev);

      const start = Math.max(1, currentPage - 2);
      const end   = Math.min(tp, currentPage + 2);

      if (start > 1) {
        const fb = document.createElement('button');
        fb.className = 'page-btn';
        fb.textContent = '1';
        fb.onclick = () => loadPage(1);
        container.appendChild(fb);
        if (start > 2) {
          const sp = document.createElement('span');
          sp.textContent = '...';
          sp.style.padding = '8px';
          container.appendChild(sp);
        }
      }
      for (let i = start; i <= end; i++) {
        ((n) => {
          const btn = document.createElement('button');
          btn.className = 'page-btn' + (n === currentPage ? ' active' : '');
          btn.textContent = n;
          btn.onclick = () => loadPage(n);
          container.appendChild(btn);
        })(i);
      }
      if (end < tp) {
        if (end < tp - 1) {
          const sp = document.createElement('span');
          sp.textContent = '...';
          sp.style.padding = '8px';
          container.appendChild(sp);
        }
        const lb = document.createElement('button');
        lb.className = 'page-btn';
        lb.textContent = tp;
        lb.onclick = () => loadPage(tp);
        container.appendChild(lb);
      }
      const next = document.createElement('button');
      next.className = 'page-btn';
      next.textContent = 'След. →';
      next.disabled = currentPage === tp;
      next.onclick = () => { if (currentPage < tp) loadPage(currentPage + 1); };
      container.appendChild(next);
    };

    build(top);
    build(bot);
  }

  // --- Public actions -------------------------------------------------------

  IfGPTSearch.search = async function () {
    if (!driver) { alert('Няма връзка'); return; }
    el('ifgpt-results').classList.remove('hidden');
    txt('ifgpt-resultsList', 'Зареждане...');
    const dlBtn  = el('ifgpt-downloadBtn');
    const dlInfo = el('ifgpt-downloadInfo');
    if (dlBtn)  dlBtn.disabled = true;
    if (dlInfo) dlInfo.textContent = '';
    try {
      await getStats();
      await loadPage(1);
      if (dlBtn)  dlBtn.disabled = false;
      if (dlInfo) dlInfo.textContent = totalRecords.toLocaleString() + ' документа';
    } catch (e) {
      console.error(e);
      txt('ifgpt-resultsList', 'Грешка: ' + e.message);
    }
  };

  IfGPTSearch.downloadJSON = async function () {
    if (!driver) { alert('Няма връзка'); return; }
    const dlBtn  = el('ifgpt-downloadBtn');
    const dlInfo = el('ifgpt-downloadInfo');
    dlBtn.disabled = true;
    dlBtn.textContent = 'Зареждане...';
    if (dlInfo) dlInfo.textContent =
      'Извличане на всички ' + totalRecords.toLocaleString() + ' записа...';

    try {
      const q = buildQuery();
      const all = [];
      const batchSize = 200;

      for (let skip = 0; skip < totalRecords; skip += batchSize) {
        const bp = Object.assign({}, q.p);
        bp.skip  = neo4j.int(skip);
        bp.limit = neo4j.int(batchSize);

        const s = driver.session({ defaultAccessMode: neo4j.session.READ });
        let r;
        try {
          r = await s.run(q.mc + q.wc + PAGE_RETURN_TAIL, bp);
        } finally {
          await s.close();
        }

        r.records.forEach((rec) => {
          const fv = (f) => {
            try {
              const v = rec.get(f);
              if (v === null || v === undefined) return null;
              if (typeof v === 'object' && v.toNumber) return v.toNumber();
              return v;
            } catch (e) { return null; }
          };
          let pd = null;
          try {
            const raw = rec.get('pubDate');
            if (raw && raw !== 'N/A') pd = formatDate(raw);
          } catch (e) { /* ignore */ }
          let url = null;
          try {
            const u = fv('url');
            if (u) url = u.startsWith('file://')
              ? u.substring(u.indexOf('http'))
              : u;
          } catch (e) { /* ignore */ }
          all.push({
            id:              fv('id'),
            title:           fv('title'),
            authors:         rec.get('authors'),
            domains:         rec.get('domains'),
            licences:        rec.get('licences'),
            styles:          rec.get('styles'),
            types:           rec.get('types'),
            publicationDate: pd,
            url:             url,
            paragraphs:      fv('paragraphs'),
            sentences:       fv('sentences'),
            words:           fv('words'),
            mediums:         rec.get('mediums'),
          });
        });
      }

      const output = {
        exportedAt:     new Date().toISOString(),
        totalDocuments: totalRecords,
        totalWords:     totalWords,
        documents:      all,
      };
      const blob = new Blob([JSON.stringify(output, null, 2)],
                            { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'metadata-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
      if (dlInfo) dlInfo.textContent = totalRecords.toLocaleString() + ' документа';
    } catch (e) {
      console.error('Download error:', e);
      alert('Грешка при изтегляне: ' + e.message);
    } finally {
      dlBtn.disabled = false;
      dlBtn.textContent = 'МЕТАДАННИ (json)';
    }
  };

  IfGPTSearch.clearForm = function () {
    document.querySelectorAll('input[type="checkbox"]')
      .forEach((cb) => { cb.checked = false; });
    el('ifgpt-yearFrom').value = '';
    el('ifgpt-yearTo').value   = '';
    el('ifgpt-keywords').value = '';
    el('ifgpt-results').classList.add('hidden');
    const dlBtn  = el('ifgpt-downloadBtn');
    const dlInfo = el('ifgpt-downloadInfo');
    if (dlBtn)  dlBtn.disabled = true;
    if (dlInfo) dlInfo.textContent = '';
  };

  // --- Bootstrap ------------------------------------------------------------
  function loadNeo4j() {
    if (window.neo4j) { connect(); return; }
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/neo4j-driver@5.14.0/lib/browser/neo4j-web.min.js';
    s.onload  = connect;
    s.onerror = () => {
      const st = el('ifgpt-status');
      if (st) st.textContent = 'Грешка при зареждане';
    };
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadNeo4j);
  } else {
    loadNeo4j();
  }
})();
