/* SEVSIX: logika tampilan dan panel admin */
(() => {
  'use strict';

  const DAYS = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

  const ICONS = {
    whatsapp:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.4 8.4 0 0 1-12.3 7.4L3 21l2.1-5.6A8.4 8.4 0 1 1 21 11.5Z"/><path d="M8.8 9c.6 2.3 2.4 4.1 4.7 4.7"/></svg>',
    instagram:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.8"/><circle cx="16.9" cy="7.1" r="1"/></svg>',
    tiktok:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4v9.6a3.6 3.6 0 1 1-3.6-3.6"/><path d="M14 4c.4 2.4 2 4 4.4 4.2"/></svg>',
    youtube:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5.5" width="19" height="13" rx="4"/><path d="M10.4 9.4l5 2.6-5 2.6z"/></svg>',
    globe:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.5 2.4 2.5 14.6 0 17M12 3.5c-2.5 2.4-2.5 14.6 0 17"/></svg>',
  };

  const state = {
    data: { items: { structure: [], gallery: [], duty: [], lesson: [], link: [] }, settings: {}, days: DAYS },
    schedule: 'lesson',
    day: 'all',
    authed: false,
    adminTab: 'home',
    editor: null,
  };

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  const esc = (value) =>
    String(value ?? '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

  const initial = (value) => (String(value || '').trim().charAt(0) || 'S').toUpperCase();

  /* ---------------------------- API ---------------------------- */

  async function api(path, options = {}) {
    const isForm = options.body instanceof FormData;
    const headers = { ...(options.headers || {}) };
    if (options.body && !isForm) headers['content-type'] = 'application/json';
    const response = await fetch(path, { credentials: 'same-origin', ...options, headers });
    let data = {};
    try {
      data = await response.json();
    } catch {
      data = {};
    }
    if (!response.ok) throw new Error(data.error || 'Terjadi kesalahan. Coba lagi ya.');
    return data;
  }

  async function loadContent() {
    const data = await api('/api/content');
    state.data = {
      items: {
        structure: [],
        gallery: [],
        duty: [],
        lesson: [],
        link: [],
        ...(data.items || {}),
      },
      settings: data.settings || {},
      days: Array.isArray(data.days) && data.days.length ? data.days : DAYS,
    };
    renderAll();
  }

  function renderAll() {
    renderHero();
    renderStructure();
    renderGallery();
    renderSchedule();
    renderLinks();
  }

  /* ---------------------------- Beranda ---------------------------- */

  function renderHero() {
    const settings = state.data.settings || {};
    const classLabel = 'Kelas ' + (settings.class_name || '7.6');
    const title = settings.hero_title || 'Sevsix';

    $('#brandTitle').textContent = title;
    $('#brandSub').textContent = classLabel;
    $('#heroTitle').textContent = title;
    $('#heroTagline').textContent =
      settings.hero_tagline || `${classLabel}, ${settings.school || 'SMP Negeri 25 Depok'}`;
    $('#heroDesc').textContent =
      settings.hero_desc ||
      'Arsip kelas VII.6: siapa pengurusnya, kapan pelajaran dan piket, dan foto kegiatan kami.';
    $('#heroSchool').textContent = settings.school || 'SMP Negeri 25 Depok';
    $('#footerClass').textContent = classLabel;
    $('#footerNote').textContent = settings.footer_note || 'Dibuat dan dirawat oleh siswa kelas 7.6.';
    document.title = `${title}, ${classLabel}`;
    applyHeroImage(settings.hero_image);

    const items = state.data.items;
    const stats = [
      { value: (items.lesson || []).length, label: 'pelajaran per minggu' },
      { value: (items.duty || []).length, label: 'petugas piket' },
      { value: (items.structure || []).length, label: 'pengurus dan wali kelas' },
      { value: (items.gallery || []).length, label: 'foto di galeri' },
    ];
    $('#heroStats').innerHTML = stats
      .map(
        (stat) =>
          `<li class="fact"><span class="fact-value">${stat.value}</span><span class="fact-label">${esc(
            stat.label,
          )}</span></li>`,
      )
      .join('');
  }

  function applyHeroImage(url) {
    const media = $('.hero__media');
    if (!media) return;
    const source = media.querySelector('source');
    const img = media.querySelector('img');
    if (!img) return;
    const chosen = String(url || '').trim();
    if (chosen) {
      if (source) source.srcset = chosen;
      img.src = chosen;
      img.removeAttribute('width');
      img.removeAttribute('height');
      media.classList.add('is-custom');
    } else {
      if (source) source.srcset = '/hero-sekolah-hp.jpg';
      img.src = '/hero-sekolah.jpg';
      media.classList.remove('is-custom');
    }
  }

  /* ---------------------------- Struktur ---------------------------- */

  function renderStructure() {
    const list = $('#structureGrid');
    const items = state.data.items.structure || [];
    if (!items.length) {
      list.innerHTML =
        '<li class="empty">Belum ada data pengurus. Pengurus bisa menambahkannya di panel admin, tab Struktur.</li>';
      return;
    }
    list.innerHTML = items
      .map(
        (person, index) => `
      <li class="roster-item ${index === 0 ? 'is-lead' : ''}">
        <span class="roster-no">${String(index + 1).padStart(2, '0')}</span>
        <div class="roster-body">
          ${person.subtitle ? `<span class="roster-role">${esc(person.subtitle)}</span>` : ''}
          <h3>${esc(person.title)}</h3>
          ${person.body ? `<p>${esc(person.body)}</p>` : ''}
          ${
            person.image
              ? `<img class="roster-photo" src="${esc(person.image)}" alt="Foto ${esc(person.title)}" width="72" height="72" loading="lazy" />`
              : ''
          }
        </div>
      </li>`,
      )
      .join('');
  }

  /* ---------------------------- Galeri ---------------------------- */

  const HOME_PHOTOS = 5;

  function renderGallery() {
    const grid = $('#galleryGrid');
    const more = $('#galleryMore');
    const count = $('#galleryCount');
    const items = state.data.items.gallery || [];
    if (count) count.textContent = items.length ? `${items.length} foto` : '';
    if (!items.length) {
      grid.innerHTML =
        '<p class="empty" style="grid-column: 1 / -1">Galeri masih kosong. Foto yang diunggah lewat panel admin akan muncul di sini.</p>';
      if (more) more.hidden = true;
      return;
    }

    const featured = items.filter((photo) => photo.meta && String(photo.meta.featured) === '1');
    const others = items.filter((photo) => featured.indexOf(photo) === -1);
    const shown = [...featured, ...others].slice(0, HOME_PHOTOS);

    grid.innerHTML = shown
      .map(
        (photo, index) => `
      <button class="plate" type="button" data-gallery="${photo.id}">
        <span class="plate-frame">${
          photo.image
            ? `<img src="${esc(photo.image)}" alt="${esc(photo.title)}" width="640" height="480" loading="lazy" />`
            : esc(initial(photo.title))
        }</span>
        <span class="plate-caption">
          <strong>${esc(photo.title)}</strong>
          ${photo.body ? `<span>${esc(photo.body)}</span>` : ''}
        </span>
      </button>`,
      )
      .join('');

    if (more) {
      more.hidden = false;
      more.innerHTML = `<a class="btn btn-line" href="/galeri">Buka halaman galeri (${items.length} foto)</a>`;
    }
  }

  function openLightbox(id) {
    const photo = (state.data.items.gallery || []).find((item) => String(item.id) === String(id));
    if (!photo) return;
    const img = $('#lightboxImg');
    const caption = $('#lightboxCaption');
    const existing = $('.lightbox .no-image');
    if (existing) existing.remove();

    if (photo.image) {
      img.src = photo.image;
      img.alt = photo.title || 'Foto galeri';
      img.hidden = false;
    } else {
      img.hidden = true;
      img.removeAttribute('src');
      const placeholder = document.createElement('div');
      placeholder.className = 'no-image';
      placeholder.textContent = photo.title || 'Foto kelas';
      $('.lightbox figure').prepend(placeholder);
    }
    caption.textContent = [photo.title, photo.body].filter(Boolean).join(' · ');

    const download = $('#lightboxDownload');
    if (download) {
      if (photo.image) {
        download.href = photo.image.startsWith('/api/file/') ? `/api/gallery/${photo.id}/download` : photo.image;
        download.setAttribute('download', '');
        download.hidden = false;
      } else {
        download.hidden = true;
        download.removeAttribute('href');
      }
    }

    $('#lightbox').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function closeLightbox() {
    $('#lightbox').hidden = true;
    document.body.style.overflow = '';
  }

  /* ---------------------------- Jadwal ---------------------------- */

  function dayOf(item, kind) {
    if (item.meta && item.meta.day) return item.meta.day;
    if (kind === 'duty' && DAYS.indexOf(item.subtitle) !== -1) return item.subtitle;
    return '';
  }

  function renderSchedule() {
    const days = state.data.days;
    const chips = [{ key: 'all', label: 'Semua' }].concat(days.map((day) => ({ key: day, label: day })));
    $('#dayChips').innerHTML = chips
      .map(
        (chip) =>
          `<button class="chip ${state.day === chip.key ? 'is-active' : ''}" type="button" data-day="${esc(chip.key)}">${esc(
            chip.label,
          )}</button>`,
      )
      .join('');

    $$('.seg-btn').forEach((button) => {
      const isActive = button.dataset.schedule === state.schedule;
      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-selected', String(isActive));
    });

    const kind = state.schedule;
    const items = state.data.items[kind] || [];
    const visibleDays = state.day === 'all' ? days : [state.day];
    const panel = $('#schedulePanel');

    const blocks = visibleDays
      .map((day) => {
        const dayItems = items.filter((item) => dayOf(item, kind) === day);
        if (!dayItems.length) return '';
        const rows = dayItems
          .map((item, index) => {
            const number = String(index + 1).padStart(2, '0');
            if (kind === 'lesson') {
              return `<div class="sched-row">
                <span class="sched-num">${number}</span>
                <div class="sched-info">
                  <strong>${esc(item.title)}</strong>
                  ${item.body ? `<small>${esc(item.body)}</small>` : ''}
                </div>
                ${item.subtitle ? `<span class="sched-time">${esc(item.subtitle)}</span>` : ''}
              </div>`;
            }
            const note = item.subtitle && item.subtitle !== day ? item.subtitle : '';
            return `<div class="sched-row">
              <span class="sched-num">${number}</span>
              <div class="sched-info"><strong>${esc(item.title)}</strong>${note ? `<small>${esc(note)}</small>` : ''}</div>
            </div>`;
          })
          .join('');
        const label = kind === 'lesson' ? `${dayItems.length} pelajaran` : `${dayItems.length} petugas`;
        return `<div class="day-block">
          <div class="day-title"><h3>${esc(day)}</h3><span>${label}</span></div>
          ${rows}
        </div>`;
      })
      .filter(Boolean);

    panel.innerHTML = blocks.length
      ? blocks.join('')
      : `<p class="empty">${
          kind === 'lesson' ? 'Belum ada jadwal pelajaran' : 'Belum ada jadwal piket'
        } untuk hari ini. Pengurus bisa menambahkannya lewat panel admin.</p>`;
  }

  /* ---------------------------- Link ---------------------------- */

  function renderLinks() {
    const grid = $('#linkGrid');
    const items = state.data.items.link || [];
    if (!items.length) {
      grid.innerHTML =
        '<p class="empty">Belum ada tautan. Pengurus bisa menambahkan saluran WhatsApp atau akun kelas lewat panel admin.</p>';
      return;
    }
    grid.innerHTML = items
      .map((link) => {
        const icon = ICONS[(link.meta && link.meta.icon) || 'globe'] || ICONS.globe;
        const subtitle = link.subtitle || link.body || '';
        const inner = `
          <span class="linkrow-icon" aria-hidden="true">${icon}</span>
          <span>
            <span class="linkrow-title">${esc(link.title)}</span>
            ${subtitle ? `<span class="linkrow-note">${esc(subtitle)}</span>` : ''}
          </span>`;
        if (link.url && /^https?:\/\//i.test(link.url)) {
          return `<a class="linkrow" href="${esc(link.url)}" target="_blank" rel="noopener noreferrer">${inner}</a>`;
        }
        return `<div class="linkrow">${inner}</div>`;
      })
      .join('');
  }


  /* ---------------------------- Toast ---------------------------- */

  let toastTimer = null;

  function toast(message) {
    const el = $('#toast');
    el.textContent = message;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add('is-visible'));
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      el.classList.remove('is-visible');
      setTimeout(() => {
        el.hidden = true;
      }, 260);
    }, 2600);
  }

  /* ---------------------------- Admin ---------------------------- */

  const panes = {
    home: { label: 'Beranda' },
    structure: {
      label: 'Struktur kelas',
      desc: 'Tambahkan wali kelas, ketua, sekretaris, dan pengurus lainnya.',
      addLabel: '+ Tambah pengurus',
      summary: (item) => item.subtitle || 'Pengurus',
      fields: [
        { name: 'title', label: 'Nama lengkap', type: 'text', required: true },
        { name: 'subtitle', label: 'Jabatan', type: 'text', placeholder: 'Contoh: Ketua Kelas' },
        { name: 'body', label: 'Keterangan singkat', type: 'textarea', wide: true },
        { name: 'image', label: 'Foto', type: 'image', wide: true },
      ],
    },
    gallery: {
      label: 'Galeri',
      desc: 'Unggah foto kegiatan kelas. Centang "Tampilkan di beranda" untuk memilih foto yang muncul di beranda (maksimal 5).',
      addLabel: '+ Tambah foto',
      summary: (item) =>
        [(item.meta && item.meta.featured === '1' ? 'Tampil di beranda' : ''), item.body || 'Foto galeri']
          .filter(Boolean)
          .join(' · '),
      fields: [
        { name: 'image', label: 'Foto', type: 'image', wide: true },
        { name: 'title', label: 'Judul foto', type: 'text', required: true },
        { name: 'body', label: 'Keterangan', type: 'textarea', wide: true },
        { name: 'meta.featured', label: 'Tampilkan di beranda', type: 'checkbox' },
      ],
    },
    lesson: {
      label: 'Jadwal pelajaran',
      desc: 'Susun mata pelajaran per hari beserta jam dan catatannya.',
      addLabel: '+ Tambah pelajaran',
      summary: (item) => `${(item.meta && item.meta.day) || 'Hari'} · ${item.subtitle || 'jam belum diisi'}`,
      fields: [
        { name: 'meta.day', label: 'Hari', type: 'day', required: true },
        { name: 'title', label: 'Mata pelajaran', type: 'text', required: true },
        { name: 'subtitle', label: 'Jam', type: 'text', placeholder: 'Contoh: 07.40 - 09.00' },
        { name: 'body', label: 'Guru / catatan', type: 'text' },
      ],
    },
    duty: {
      label: 'Jadwal piket',
      desc: 'Tentukan siapa yang bertugas setiap hari.',
      addLabel: '+ Tambah petugas',
      summary: (item) => `${(item.meta && item.meta.day) || 'Hari'} · ${item.subtitle || 'Piket kelas'}`,
      fields: [
        { name: 'meta.day', label: 'Hari', type: 'day', required: true },
        { name: 'title', label: 'Nama siswa / tugas', type: 'text', required: true },
        { name: 'subtitle', label: 'Tugas', type: 'text', placeholder: 'Contoh: Menyapu & merapikan meja' },
      ],
    },
    link: {
      label: 'Link',
      desc: 'Tempel link saluran WhatsApp, Instagram, TikTok, atau lainnya.',
      addLabel: '+ Tambah link',
      summary: (item) => item.url || item.subtitle || 'Belum ada URL',
      fields: [
        { name: 'title', label: 'Nama link', type: 'text', required: true },
        { name: 'url', label: 'URL lengkap', type: 'text', placeholder: 'https://...', wide: true },
        { name: 'subtitle', label: 'Keterangan singkat', type: 'text' },
        {
          name: 'meta.icon',
          label: 'Ikon',
          type: 'select',
          options: [
            { value: 'whatsapp', label: 'WhatsApp' },
            { value: 'instagram', label: 'Instagram' },
            { value: 'tiktok', label: 'TikTok' },
            { value: 'youtube', label: 'YouTube' },
            { value: 'globe', label: 'Lainnya' },
          ],
        },
        { name: 'body', label: 'Deskripsi', type: 'textarea', wide: true },
      ],
    },
    password: { label: 'Password' },
  };

  async function openAdmin() {
    $('#adminOverlay').hidden = false;
    document.body.style.overflow = 'hidden';
    $('#adminLogin').hidden = false;
    $('#adminPanel').hidden = true;
    $('#loginError').hidden = true;
    try {
      const me = await api('/api/me');
      state.authed = Boolean(me.authenticated);
    } catch {
      state.authed = false;
    }
    if (state.authed) showAdminPanel();
  }

  function closeAdmin() {
    $('#adminOverlay').hidden = true;
    document.body.style.overflow = '';
    state.editor = null;
  }

  function showAdminPanel() {
    $('#adminLogin').hidden = true;
    $('#adminPanel').hidden = false;
    state.adminTab = 'home';
    state.editor = null;
    $$('.admin-tab').forEach((tab) => tab.classList.toggle('is-active', tab.dataset.tab === 'home'));
    renderAdminPane();
  }

  function renderAdminPane() {
    const pane = $('#adminPane');
    const tab = state.adminTab;

    if (tab === 'home') {
      const settings = state.data.settings || {};
      pane.innerHTML = `
        <h3>Beranda</h3>
        <p>Atur nama kelas dan teks sambutan di halaman depan.</p>
        <form id="settingsForm" class="admin-editor">
          <div class="form-grid">
            ${inputField('hero_title', 'Nama website / kelas', settings.hero_title || '')}
            ${inputField('class_name', 'Nomor kelas', settings.class_name || '')}
            ${inputField('hero_tagline', 'Sapaan singkat', settings.hero_tagline || '')}
            ${inputField('school', 'Nama sekolah', settings.school || '')}
            ${textareaField('hero_desc', 'Deskripsi sambutan', settings.hero_desc || '', true)}
            ${inputField('footer_note', 'Teks footer', settings.footer_note || '', true)}
          </div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">Simpan perubahan</button></div>
        </form>`;
      return;
    }

    if (tab === 'password') {
      pane.innerHTML = `
        <h3>Ganti password</h3>
        <p>Gunakan password yang mudah kamu ingat, minimal 6 karakter.</p>
        <form id="passwordForm" class="admin-editor">
          <div class="form-grid">
            ${inputField('current', 'Password saat ini', '', true, 'password')}
            ${inputField('next', 'Password baru', '', false, 'password')}
            ${inputField('confirm', 'Ulangi password baru', '', false, 'password')}
          </div>
          <div class="form-actions"><button class="btn btn-primary" type="submit">Simpan password baru</button></div>
        </form>`;
      return;
    }

    const config = panes[tab];
    const items = state.data.items[tab] || [];
    const editor = state.editor && state.editor.kind === tab ? state.editor : null;
    const editing = editor && editor.id ? items.find((item) => String(item.id) === String(editor.id)) : null;

    pane.innerHTML = `
      <h3>${config.label}</h3>
      <p>${config.desc}</p>
      <div class="admin-toolbar">
        <span style="font-size:.84rem;color:var(--muted)">${items.length} data tersimpan</span>
        <button class="btn btn-primary btn-sm" type="button" data-action="add">${config.addLabel}</button>
      </div>
      ${tab === 'gallery' ? heroPickerHtml() : ''}
      ${importBoxHtml(tab)}
      ${editor ? editorHtml(tab, editing) : ''}
      <div class="admin-list">
        ${
          items.length
            ? items
                .map(
                  (item) => `
          <div class="admin-item">
            <div class="admin-thumb">${
              item.image ? `<img src="${esc(item.image)}" alt="" />` : esc(initial(item.title))
            }</div>
            <div class="admin-item-main">
              <strong>${esc(item.title)}</strong>
              <span>${esc(config.summary(item))}</span>
            </div>
            <div class="admin-item-actions">
              <button class="btn btn-soft" type="button" data-action="edit" data-id="${item.id}">Ubah</button>
              <button class="btn btn-danger" type="button" data-action="delete" data-id="${item.id}">Hapus</button>
            </div>
          </div>`,
                )
                .join('')
            : `<div class="empty">Belum ada data. Klik "${config.addLabel.replace('+ ', '')}" untuk mulai.</div>`
        }
      </div>`;

    bindImageFields(pane);
  }

  function heroPickerHtml() {
    const settings = state.data.settings || {};
    const current = String(settings.hero_image || '').trim();
    const photos = (state.data.items.gallery || []).filter((photo) => photo.image);
    return `
      <section class="hero-picker">
        <div class="hero-picker__head">
          <div>
            <h4>Foto pembuka beranda</h4>
            <p>Pilih satu foto dari galeri untuk dipakai sebagai gambar paling atas di beranda. Foto bawaan adalah halaman sekolah.</p>
          </div>
          ${
            current
              ? '<button class="btn btn-ghost btn-sm" type="button" data-action="hero-reset">Pakai foto sekolah</button>'
              : ''
          }
        </div>
        <div class="hero-picker__current">
          <img src="${esc(current || '/hero-sekolah.jpg')}" alt="Pratinjau foto pembuka" />
          <span>${current ? 'Foto ini sedang dipakai di beranda' : 'Sedang dipakai: foto bawaan sekolah'}</span>
        </div>
        ${
          photos.length
            ? `<div class="hero-picker__grid">${photos
                .map(
                  (photo) => `
              <button class="hero-pick ${current === photo.image ? 'is-active' : ''}" type="button"
                data-action="hero-pick" data-image="${esc(photo.image)}" title="${esc(photo.title)}">
                <img src="${esc(photo.image)}" alt="${esc(photo.title)}" loading="lazy" />
                <span>${esc(photo.title)}</span>
              </button>`,
                )
                .join('')}</div>`
            : '<p class="hero-picker__empty">Belum ada foto di galeri. Unggah foto lebih dulu (tombol Tambah foto atau Unggah banyak foto di bawah), lalu pilih di sini.</p>'
        }
      </section>`;
  }

  async function saveHeroImage(url) {
    try {
      await api('/api/settings', { method: 'PUT', body: JSON.stringify({ hero_image: url }) });
      await loadContent();
      renderAdminPane();
      toast(url ? 'Foto pembuka beranda diganti.' : 'Foto pembuka kembali ke foto sekolah.');
    } catch (error) {
      toast(error.message);
    }
  }

  function editorHtml(tab, item) {
    const config = panes[tab];
    const fields = config.fields
      .map((field) => {
        const value = item ? valueOf(item, field.name) : field.name === 'meta.day' ? state.data.days[0] : '';
        return fieldHtml(field, value);
      })
      .join('');
    return `
      <form id="itemForm" class="admin-editor">
        <h4>${item ? 'Ubah data' : 'Tambah data baru'}</h4>
        <div class="form-grid">${fields}</div>
        <p class="form-error" id="itemError" hidden></p>
        <div class="form-actions">
          <button class="btn btn-primary btn-sm" type="submit">Simpan</button>
          <button class="btn btn-ghost btn-sm" type="button" data-action="cancel">Batal</button>
        </div>
      </form>`;
  }

  function valueOf(item, name) {
    if (name.startsWith('meta.')) {
      const key = name.slice(5);
      return (item.meta && item.meta[key]) || '';
    }
    return item[name] ?? '';
  }

  function inputField(name, label, value, wide, type) {
    return `<label class="field ${wide ? 'is-wide' : ''}">
      <span>${esc(label)}</span>
      <input type="${type || 'text'}" name="${esc(name)}" value="${esc(value)}" />
    </label>`;
  }

  function textareaField(name, label, value, wide) {
    return `<label class="field ${wide ? 'is-wide' : ''}">
      <span>${esc(label)}</span>
      <textarea name="${esc(name)}">${esc(value)}</textarea>
    </label>`;
  }

  function fieldHtml(field, value) {
    if (field.type === 'textarea') return textareaField(field.name, field.label, value, true);
    if (field.type === 'image') {
      return `<div class="field is-wide">
        <span>${esc(field.label)}</span>
        ${imageFieldHtml(value)}
      </div>`;
    }
    if (field.type === 'checkbox') {
      return `<label class="field is-check">
        <input type="checkbox" name="${esc(field.name)}" ${String(value) === '1' ? 'checked' : ''} />
        <span>${esc(field.label)}</span>
      </label>`;
    }
    if (field.type === 'select') {
      return `<label class="field">
        <span>${esc(field.label)}</span>
        <select name="${esc(field.name)}">
          ${field.options
            .map(
              (option) =>
                `<option value="${esc(option.value)}" ${String(value) === option.value ? 'selected' : ''}>${esc(
                  option.label,
                )}</option>`,
            )
            .join('')}
        </select>
      </label>`;
    }
    if (field.type === 'day') {
      return `<label class="field">
        <span>${esc(field.label)}</span>
        <select name="${esc(field.name)}" required>
          ${state.data.days
            .map((day) => `<option value="${esc(day)}" ${value === day ? 'selected' : ''}>${esc(day)}</option>`)
            .join('')}
        </select>
      </label>`;
    }
    return `<label class="field">
      <span>${esc(field.label)}</span>
      <input type="text" name="${esc(field.name)}" value="${esc(value)}"
        ${field.required ? 'required' : ''} placeholder="${esc(field.placeholder || '')}" />
    </label>`;
  }

  function imageFieldHtml(value) {
    return `<div class="image-field" data-image-field>
      <div class="image-preview" data-preview>${
        value ? `<img src="${esc(value)}" alt="Pratinjau foto" />` : 'Belum ada foto'
      }</div>
      <div class="image-actions">
        <label class="btn btn-soft btn-sm">Pilih foto
          <input type="file" accept="image/*" data-image-input hidden />
        </label>
        <button class="btn btn-ghost btn-sm" type="button" data-image-clear>Hapus foto</button>
      </div>
      <input type="hidden" name="image" value="${esc(value)}" />
    </div>`;
  }

  async function uploadPhoto(file) {
    const form = new FormData();
    form.append('file', file);
    return api('/api/upload', { method: 'POST', body: form });
  }

  function bindImageFields(scope) {
    $$('[data-image-field]', scope).forEach((wrapper) => {
      const input = $('[data-image-input]', wrapper);
      const hidden = $('input[name="image"]', wrapper);
      const preview = $('[data-preview]', wrapper);
      const clear = $('[data-image-clear]', wrapper);
      const label = input.closest('label');

      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        const original = label.firstChild.textContent;
        label.firstChild.textContent = 'Mengunggah...';
        try {
          const result = await uploadPhoto(file);
          hidden.value = result.url;
          preview.innerHTML = `<img src="${esc(result.url)}" alt="Pratinjau foto" />`;
          toast('Foto berhasil diunggah.');
        } catch (error) {
          toast(error.message);
        } finally {
          label.firstChild.textContent = original;
          input.value = '';
        }
      });

      clear.addEventListener('click', () => {
        hidden.value = '';
        preview.textContent = 'Belum ada foto';
      });
    });
  }

  function collectPayload(form, kind) {
    const payload = { kind, meta: {} };
    Array.from(form.elements).forEach((element) => {
      if (!element.name) return;
      const value = element.type === 'checkbox' ? (element.checked ? '1' : '') : element.value;
      if (element.name.startsWith('meta.')) payload.meta[element.name.slice(5)] = value;
      else payload[element.name] = value;
    });
    return payload;
  }

  /* ---------------------------- Impor file ---------------------------- */

  const IMPORT_HINTS = {
    lesson: 'Kolom: Hari; Mata Pelajaran; Jam; Catatan (opsional). Contoh: Senin; Matematika; 07.10 - 08.30',
    duty: 'Kolom: Hari; Nama. Contoh: Senin; Siti Raisha',
    gallery: 'Kolom: Judul; Keterangan (opsional); URL Foto (opsional); Cerita (opsional).',
    structure: 'Kolom: Nama; Jabatan; Keterangan (opsional).',
    link: 'Kolom: Nama; URL; Keterangan (opsional); Deskripsi (opsional).',
  };

  const TEMPLATES = {
    lesson: {
      header: ['Hari', 'Mata Pelajaran', 'Jam', 'Catatan'],
      rows: [
        ['Senin', 'Matematika', '07.10 - 08.30', ''],
        ['Senin', 'IPA', '08.30 - 09.10', ''],
      ],
    },
    duty: {
      header: ['Hari', 'Nama'],
      rows: [
        ['Senin', 'Siti Raisha'],
        ['Senin', 'Anjani'],
      ],
    },
    gallery: {
      header: ['Judul', 'Keterangan', 'URL Foto', 'Cerita'],
      rows: [['Upacara Bendera', 'Senin pagi di lapangan sekolah', '', 'Baris rapi sebelum upacara dimulai.']],
    },
    structure: {
      header: ['Nama', 'Jabatan', 'Keterangan'],
      rows: [['Siti Raisha', 'Ketua Kelas', '']],
    },
    link: {
      header: ['Nama', 'URL', 'Keterangan', 'Deskripsi'],
      rows: [['Saluran WhatsApp', 'https://chat.whatsapp.com/xxxx', 'Info kelas & pengumuman', 'Gabung saluran resmi untuk kabar terbaru.']],
    },
  };

  function importBoxHtml(tab) {
    if (!IMPORT_HINTS[tab]) return '';
    return `
      <details class="import-box">
        <summary>Impor dari file (CSV)</summary>
        <div class="import-body">
          <p class="import-hint">
            ${esc(IMPORT_HINTS[tab])}<br />
            File CSV bisa dibuat dari Excel atau Google Sheets (Simpan sebagai CSV). Baris judul otomatis dilewati.
          </p>
          <input type="file" accept=".csv,text/csv,.txt" data-import-file class="import-file" />
          <label class="import-check">
            <input type="checkbox" data-import-replace /> Hapus data lama jenis ini lebih dulu
          </label>
          <div class="form-actions">
            <button class="btn btn-primary btn-sm" type="button" data-action="import-run">Impor sekarang</button>
            <button class="btn btn-ghost btn-sm" type="button" data-action="import-template">Unduh contoh file</button>
          </div>
          <p class="import-status" data-import-status></p>
          ${
            tab === 'gallery'
              ? `<div class="import-bulk">
                  <strong>Atau unggah banyak foto sekaligus</strong>
                  <input type="file" accept="image/*" multiple data-bulk-photos class="import-file" />
                  <div class="form-actions">
                    <button class="btn btn-soft btn-sm" type="button" data-action="gallery-bulk">Unggah &amp; jadikan galeri</button>
                  </div>
                </div>`
              : ''
          }
        </div>
      </details>`;
  }

  function parseCsv(text) {
    const clean = String(text || '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
    const firstLine = clean.split('\n')[0] || '';
    const delimiter = firstLine.split(';').length > firstLine.split(',').length ? ';' : ',';
    const rows = [];
    let row = [];
    let field = '';
    let inQuotes = false;
    for (let i = 0; i < clean.length; i += 1) {
      const char = clean[i];
      if (inQuotes) {
        if (char === '"') {
          if (clean[i + 1] === '"') {
            field += '"';
            i += 1;
          } else {
            inQuotes = false;
          }
        } else {
          field += char;
        }
      } else if (char === '"') {
        inQuotes = true;
      } else if (char === delimiter) {
        row.push(field);
        field = '';
      } else if (char === '\n') {
        row.push(field);
        rows.push(row);
        row = [];
        field = '';
      } else {
        field += char;
      }
    }
    if (field.length || row.length) {
      row.push(field);
      rows.push(row);
    }
    return rows.map((cells) => cells.map((cell) => cell.trim())).filter((cells) => cells.some((cell) => cell !== ''));
  }

  const HEADER_WORDS = ['hari', 'nama', 'nama siswa', 'judul', 'mata pelajaran', 'mapel', 'jam', 'waktu', 'url', 'link', 'foto', 'keterangan', 'jabatan', 'tugas', 'catatan', 'guru'];

  function isHeaderRow(cells) {
    return HEADER_WORDS.includes(String(cells[0] || '').toLowerCase());
  }

  function normalizeDay(value) {
    const key = String(value || '').trim().toLowerCase();
    const map = { senin: 'Senin', selasa: 'Selasa', rabu: 'Rabu', kamis: 'Kamis', jumat: 'Jumat', sabtu: 'Sabtu' };
    return map[key] || '';
  }

  function rowsToPayload(tab, table) {
    const payload = [];
    let skipped = 0;
    table.forEach((cells) => {
      if (isHeaderRow(cells)) return;
      if (tab === 'lesson') {
        const day = normalizeDay(cells[0]);
        const title = cells[1] || '';
        if (!day || !title) {
          skipped += 1;
          return;
        }
        payload.push({ title, subtitle: cells[2] || '', body: cells[3] || '', meta: { day } });
      } else if (tab === 'duty') {
        const day = normalizeDay(cells[0]);
        const title = cells[1] || '';
        if (!day || !title) {
          skipped += 1;
          return;
        }
        payload.push({ title, subtitle: cells[2] || '', meta: { day } });
      } else if (tab === 'gallery') {
        const title = cells[0] || '';
        if (!title) {
          skipped += 1;
          return;
        }
        payload.push({ title, subtitle: cells[1] || '', image: cells[2] || '', body: cells[3] || '' });
      } else if (tab === 'structure') {
        const title = cells[0] || '';
        if (!title) {
          skipped += 1;
          return;
        }
        payload.push({ title, subtitle: cells[1] || '', body: cells[2] || '' });
      } else if (tab === 'link') {
        const title = cells[0] || '';
        if (!title) {
          skipped += 1;
          return;
        }
        payload.push({ title, url: cells[1] || '', subtitle: cells[2] || '', body: cells[3] || '' });
      }
    });
    return { payload, skipped };
  }

  async function importFromFile() {
    const tab = state.adminTab;
    const pane = $('#adminPane');
    const input = $('[data-import-file]', pane);
    const status = $('[data-import-status]', pane);
    const replaceBox = $('[data-import-replace]', pane);
    const file = input && input.files ? input.files[0] : null;
    if (!file) {
      toast('Pilih file CSV dulu ya.');
      return;
    }
    try {
      if (status) status.textContent = 'Membaca file...';
      const table = parseCsv(await file.text());
      const { payload, skipped } = rowsToPayload(tab, table);
      if (!payload.length) throw new Error('Tidak ada baris yang cocok. Cek urutan kolomnya ya.');
      if (replaceBox && replaceBox.checked && !window.confirm(`Hapus semua ${panes[tab].label.toLowerCase()} lama lalu ganti dengan isi file?`)) {
        if (status) status.textContent = 'Dibatalkan.';
        return;
      }
      if (status) status.textContent = `Menyimpan ${payload.length} baris...`;
      const result = await api('/api/items/bulk', {
        method: 'POST',
        body: JSON.stringify({ kind: tab, replace: Boolean(replaceBox && replaceBox.checked), rows: payload }),
      });
      await loadContent();
      renderAdminPane();
      toast(`${result.created} data diimpor${skipped || result.skipped ? `, ${skipped + (result.skipped || 0)} baris dilewati` : ''}.`);
    } catch (error) {
      if (status) status.textContent = error.message;
      else toast(error.message);
    }
  }

  async function importGalleryPhotos() {
    const pane = $('#adminPane');
    const input = $('[data-bulk-photos]', pane);
    const status = $('[data-import-status]', pane);
    const files = input && input.files ? Array.from(input.files) : [];
    if (!files.length) {
      toast('Pilih foto dulu ya.');
      return;
    }
    const rows = [];
    let failed = 0;
    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (status) status.textContent = `Mengunggah ${index + 1}/${files.length}...`;
      try {
        const uploaded = await uploadPhoto(file);
        const title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
        rows.push({ title: title ? title.charAt(0).toUpperCase() + title.slice(1) : `Foto ${index + 1}`, image: uploaded.url, body: '' });
      } catch {
        failed += 1;
      }
    }
    if (!rows.length) {
      if (status) status.textContent = 'Semua foto gagal diunggah.';
      return;
    }
    try {
      if (status) status.textContent = 'Menyimpan ke galeri...';
      const result = await api('/api/items/bulk', {
        method: 'POST',
        body: JSON.stringify({ kind: 'gallery', rows }),
      });
      await loadContent();
      renderAdminPane();
      toast(`${result.created} foto masuk galeri${failed ? `, ${failed} gagal` : ''}.`);
    } catch (error) {
      if (status) status.textContent = error.message;
      else toast(error.message);
    }
  }

  function downloadTemplate() {
    const template = TEMPLATES[state.adminTab];
    if (!template) return;
    const lines = [template.header, ...template.rows].map((cells) =>
      cells.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'),
    );
    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `contoh-${state.adminTab}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function onPaneClick(event) {
    const button = event.target.closest('[data-action]');
    if (!button) return;
    const action = button.dataset.action;
    const tab = state.adminTab;

    if (action === 'import-run') {
      await importFromFile();
      return;
    }

    if (action === 'import-template') {
      downloadTemplate();
      return;
    }

    if (action === 'gallery-bulk') {
      await importGalleryPhotos();
      return;
    }

    if (action === 'hero-pick') {
      await saveHeroImage(button.dataset.image || '');
      return;
    }

    if (action === 'hero-reset') {
      await saveHeroImage('');
      return;
    }

    if (action === 'add') {
      state.editor = { kind: tab, id: null };
      renderAdminPane();
      const form = $('#itemForm');
      if (form) form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    if (action === 'edit') {
      state.editor = { kind: tab, id: Number(button.dataset.id) };
      renderAdminPane();
      const form = $('#itemForm');
      if (form) form.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      return;
    }

    if (action === 'cancel') {
      state.editor = null;
      renderAdminPane();
      return;
    }

    if (action === 'delete') {
      const item = (state.data.items[tab] || []).find((entry) => String(entry.id) === String(button.dataset.id));
      if (!item) return;
      if (!window.confirm(`Hapus "${item.title}" dari ${panes[tab].label.toLowerCase()}?`)) return;
      try {
        await api(`/api/items/${item.id}`, { method: 'DELETE' });
        state.editor = null;
        await loadContent();
        renderAdminPane();
        toast('Data dihapus.');
      } catch (error) {
        toast(error.message);
      }
    }
  }

  async function onPaneSubmit(event) {
    const form = event.target;
    if (!form.id) return;
    event.preventDefault();

    try {
      if (form.id === 'itemForm') {
        const kind = state.adminTab;
        const payload = collectPayload(form, kind);
        const editingId = state.editor && state.editor.id;
        const errorEl = $('#itemError');
        if (errorEl) errorEl.hidden = true;
        await api(editingId ? `/api/items/${editingId}` : '/api/items', {
          method: editingId ? 'PUT' : 'POST',
          body: JSON.stringify(payload),
        });
        state.editor = null;
        await loadContent();
        renderAdminPane();
        toast(editingId ? 'Perubahan disimpan.' : 'Data baru ditambahkan.');
        return;
      }

      if (form.id === 'settingsForm') {
        const data = {};
        ['hero_title', 'class_name', 'hero_tagline', 'school', 'hero_desc', 'footer_note'].forEach((key) => {
          const element = form.elements[key];
          if (element) data[key] = element.value;
        });
        await api('/api/settings', { method: 'PUT', body: JSON.stringify(data) });
        await loadContent();
        renderAdminPane();
        toast('Beranda diperbarui.');
        return;
      }

      if (form.id === 'passwordForm') {
        const current = form.elements.current.value;
        const next = form.elements.next.value;
        const confirm = form.elements.confirm.value;
        if (next !== confirm) throw new Error('Konfirmasi password tidak sama.');
        await api('/api/password', { method: 'POST', body: JSON.stringify({ current, next }) });
        form.reset();
        toast('Password berhasil diganti.');
      }
    } catch (error) {
      const errorEl = form.querySelector('.form-error') || $('#itemError');
      if (errorEl) {
        errorEl.textContent = error.message;
        errorEl.hidden = false;
      } else {
        toast(error.message);
      }
    }
  }

  /* ---------------------------- Event global ---------------------------- */

  function bindGlobal() {
    $('#footerYear').textContent = new Date().getFullYear();

    document.addEventListener('click', (event) => {
      if (event.target.closest('[data-retry]')) location.reload();
    });

    const navToggle = $('#navToggle');
    const nav = $('#mainNav');
    navToggle.addEventListener('click', () => {
      const open = nav.classList.toggle('is-open');
      navToggle.classList.toggle('is-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
    });
    $$('#mainNav a').forEach((link) =>
      link.addEventListener('click', () => {
        nav.classList.remove('is-open');
        navToggle.classList.remove('is-open');
        navToggle.setAttribute('aria-expanded', 'false');
      }),
    );

    window.addEventListener('scroll', () => {
      $('#siteHeader').classList.toggle('is-scrolled', window.scrollY > 8);
    });

    $$('[data-open-admin]').forEach((button) => button.addEventListener('click', openAdmin));
    $$('[data-close-admin]').forEach((button) => button.addEventListener('click', closeAdmin));

    $('#adminOverlay').addEventListener('click', (event) => {
      if (event.target === $('#adminOverlay')) closeAdmin();
    });

    $('#loginForm').addEventListener('submit', async (event) => {
      event.preventDefault();
      const password = event.target.elements.password.value;
      const errorEl = $('#loginError');
      errorEl.hidden = true;
      try {
        await api('/api/login', { method: 'POST', body: JSON.stringify({ password }) });
        state.authed = true;
        event.target.reset();
        showAdminPanel();
        toast('Selamat datang, admin!');
      } catch (error) {
        errorEl.textContent = error.message;
        errorEl.hidden = false;
      }
    });

    $('#logoutBtn').addEventListener('click', async () => {
      try {
        await api('/api/logout', { method: 'POST' });
      } catch {
        /* diabaikan */
      }
      state.authed = false;
      $('#adminPanel').hidden = true;
      $('#adminLogin').hidden = false;
      toast('Kamu sudah keluar.');
    });

    $('#adminTabs').addEventListener('click', (event) => {
      const tab = event.target.closest('.admin-tab');
      if (!tab) return;
      state.adminTab = tab.dataset.tab;
      state.editor = null;
      $$('.admin-tab').forEach((item) => item.classList.toggle('is-active', item === tab));
      renderAdminPane();
    });

    $('#adminPane').addEventListener('click', onPaneClick);
    $('#adminPane').addEventListener('submit', onPaneSubmit);

    $('#dayChips').addEventListener('click', (event) => {
      const chip = event.target.closest('[data-day]');
      if (!chip) return;
      state.day = chip.dataset.day;
      renderSchedule();
    });

    $$('.seg-btn').forEach((button) =>
      button.addEventListener('click', () => {
        state.schedule = button.dataset.schedule;
        renderSchedule();
      }),
    );

    $('#galleryGrid').addEventListener('click', (event) => {
      const card = event.target.closest('[data-gallery]');
      if (card) openLightbox(card.dataset.gallery);
    });

    $$('[data-lightbox-close]').forEach((button) => button.addEventListener('click', closeLightbox));
    $('#lightbox').addEventListener('click', (event) => {
      if (event.target === $('#lightbox')) closeLightbox();
    });

    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      if (!$('#lightbox').hidden) closeLightbox();
      else if (!$('#adminOverlay').hidden) closeAdmin();
    });
  }

  document.addEventListener('DOMContentLoaded', async () => {
    bindGlobal();
    try {
      await loadContent();
    } catch (error) {
      console.error(error);
      const retry =
        '<p class="empty state-error">Data kelas gagal dimuat. Periksa koneksi internet, lalu muat ulang.<button class="btn btn-line btn-sm" type="button" data-retry>Coba lagi</button></p>';
      $('#structureGrid').innerHTML = `<li>${retry}</li>`;
      $('#galleryGrid').innerHTML = retry;
      $('#linkGrid').innerHTML = retry;
      $('#schedulePanel').innerHTML = retry;
      $('#heroStats').innerHTML = '<li class="fact"><span class="fact-label">Data belum tersedia</span></li>';
    }
  });
})();
