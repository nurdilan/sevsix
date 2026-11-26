(function () {
  'use strict';

  const $ = (selector, root = document) => root.querySelector(selector);
  const esc = (value) =>
    String(value ?? '').replace(
      /[&<>"']/g,
      (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch],
    );
  const initial = (text) => (String(text || '?').trim().charAt(0) || '?').toUpperCase();

  let photos = [];
  let index = 0;
  let touchStartX = 0;

  function render() {
    const grid = $('#gpGrid');
    const counter = $('#gpCount');
    const zip = $('#gpZip');

    counter.textContent = photos.length ? `${photos.length} foto tersimpan` : 'Belum ada foto di galeri.';
    const year = $('#gpYear');
    if (year) year.textContent = new Date().getFullYear();
    if (zip) zip.hidden = !photos.some((photo) => photo.image);

    if (!photos.length) {
      grid.innerHTML =
        '<p class="empty" style="grid-column: 1 / -1">Belum ada foto. Pengurus kelas bisa menambahkan foto lewat panel admin di beranda.</p>';
      return;
    }

    grid.innerHTML = photos
      .map(
        (photo, i) => `
      <button class="plate" type="button" data-index="${i}">
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
  }

  function show(i) {
    if (!photos.length) return;
    index = (i + photos.length) % photos.length;
    const photo = photos[index];
    const img = $('#lbImg');

    if (photo.image) {
      img.src = photo.image;
      img.alt = photo.title || 'Foto galeri';
      img.hidden = false;
    } else {
      img.hidden = true;
      img.removeAttribute('src');
    }

    $('#lbCaption').textContent = [photo.title, photo.body].filter(Boolean).join(' · ');

    const download = $('#lbDownload');
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

    $('#lbCounter').textContent = `${index + 1} / ${photos.length}`;
    $('#lightbox').hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function hide() {
    $('#lightbox').hidden = true;
    document.body.style.overflow = '';
  }

  function wire() {
    $('#gpGrid').addEventListener('click', (event) => {
      const card = event.target.closest('[data-index]');
      if (card) show(Number(card.dataset.index));
    });

    document.querySelectorAll('[data-lb-close]').forEach((button) => button.addEventListener('click', hide));
    document.querySelector('[data-lb-prev]').addEventListener('click', (event) => {
      event.stopPropagation();
      show(index - 1);
    });
    document.querySelector('[data-lb-next]').addEventListener('click', (event) => {
      event.stopPropagation();
      show(index + 1);
    });

    $('#lightbox').addEventListener('click', (event) => {
      if (event.target === $('#lightbox')) hide();
    });

    document.addEventListener('keydown', (event) => {
      if ($('#lightbox').hidden) return;
      if (event.key === 'Escape') hide();
      if (event.key === 'ArrowLeft') show(index - 1);
      if (event.key === 'ArrowRight') show(index + 1);
    });

    $('#lightbox').addEventListener(
      'touchstart',
      (event) => {
        touchStartX = event.changedTouches[0].clientX;
      },
      { passive: true },
    );
    $('#lightbox').addEventListener(
      'touchend',
      (event) => {
        const delta = event.changedTouches[0].clientX - touchStartX;
        if (Math.abs(delta) < 50) return;
        show(delta < 0 ? index + 1 : index - 1);
      },
      { passive: true },
    );
  }

  async function load() {
    try {
      const response = await fetch('/api/content');
      const data = await response.json();
      photos = (data.items && data.items.gallery) || [];
    } catch (error) {
      $('#gpCount').textContent = 'Galeri gagal dimuat. Periksa koneksi lalu muat ulang halaman.';
      $('#gpGrid').innerHTML =
        '<p class="empty state-error" style="grid-column: 1 / -1">Galeri gagal dimuat.<button class="btn btn-line btn-sm" type="button" data-retry>Coba lagi</button></p>';
      return;
    }
    render();
  }

  document.addEventListener('click', (event) => {
    if (event.target.closest('[data-retry]')) location.reload();
  });

  wire();
  load();
})();
