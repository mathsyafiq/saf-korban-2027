(function () {
  'use strict';

  const API = window.APP_CONFIG.API_URL;
  const $app = document.getElementById('app');
  const $modal = document.getElementById('modal');
  const $toast = document.getElementById('toast');

  let INFO = null;
  let ME = null;          // { phone, people[] }
  let ADMIN = null;       // adminData payload
  let adminTab = 'bayaran';
  let payFilter = 'Menunggu';

  /* ---------- helpers ---------- */
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const rm = (n) => 'RM' + Number(n || 0).toLocaleString('en-MY', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const today = () => { const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 10); };
  const fmtDate = (s) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? `${m[3]}/${m[2]}/${m[1]}` : (s || ''); };
  const pct = (a, b) => (b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0);
  const store = {
    get: (k) => { try { return sessionStorage.getItem(k); } catch (e) { return null; } },
    set: (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch (e) { /* ignore */ } }
  };

  function toast(msg) {
    $toast.textContent = msg; $toast.classList.add('show');
    setTimeout(() => $toast.classList.remove('show'), 3200);
  }

  async function api(action, payload) {
    if (!API || API.indexOf('PASTE_') === 0) throw new Error('API_URL belum ditetapkan dalam config.js');
    let res;
    try {
      res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action }, payload || {}))
      });
    } catch (e) { throw new Error('Tidak dapat menghubungi pelayan. Semak sambungan internet.'); }
    let j;
    try { j = await res.json(); } catch (e) { throw new Error('Respons pelayan tidak sah.'); }
    if (!j.ok) {
      if (j.error === 'SESSION') { store.set('tok', null); ADMIN = null; location.hash = '#/admin'; render(); throw new Error('Sesi tamat. Sila log masuk semula.'); }
      throw new Error(j.error);
    }
    return j.data;
  }

  function openModal(html) { $modal.innerHTML = html; if (!$modal.open) $modal.showModal(); }
  function closeModal() { if ($modal.open) $modal.close(); }
  $modal.addEventListener('click', (e) => { if (e.target === $modal) closeModal(); });

  function busy(btn, on, label) { btn.disabled = on; if (label) btn.textContent = label; }

  /* ---------- routing ---------- */
  window.addEventListener('hashchange', render);
  function render() {
    closeModal();
    const route = location.hash.replace(/^#/, '') || '/';
    if (route === '/admin') return store.get('tok') ? renderAdmin() : renderAdminLogin();
    if (route === '/me' && ME) return renderMe();
    return renderHome();
  }

  /* ---------- home ---------- */
  async function renderHome() {
    $app.innerHTML = `<div class="card muted">Memuatkan...</div>`;
    try { INFO = INFO || await api('info'); } catch (e) { $app.innerHTML = `<div class="card"><div class="err">${esc(e.message)}</div></div>`; return; }
    const p = pct(INFO.totalCollected, INFO.totalTarget);
    $app.innerHTML = `
      <div class="card">
        <h1>Penyertaan Ibadah Korban 2027</h1>
        <p class="muted">Hari Raya Aidiladha 1448H (2027) &middot; Surau Al-Falah, Prima Residensi Utama<br>
        14 bahagian (2 ekor lembu) &middot; <b>${rm(INFO.price)}</b> sebahagian</p>
        <div class="bar" aria-label="Kutipan keseluruhan"><i style="width:${p}%"></i></div>
        <div class="small muted">Kutipan keseluruhan: ${p}% &middot; Tarikh akhir bayaran penuh: <b>${fmtDate(INFO.deadline)}</b></div>
      </div>
      <div class="card">
        <h2>Cara bayaran</h2>
        <div class="acct">
          <div class="small muted">${esc(INFO.bank)} &middot; ${esc(INFO.accountName)}</div>
          <div class="row"><span class="no">${esc(INFO.accountNo)}</span>
            <button class="ghost sm" id="copy">Salin</button></div>
        </div>
        <ol>
          <li>Bank-in ke akaun di atas (boleh ansur bila-bila masa, sebarang jumlah).</li>
          <li>Nyatakan rujukan: <b>Bayaran Korban + nama peserta</b>.</li>
          <li>Semak baki anda di bawah dan muat naik bukti bayaran.</li>
        </ol>
      </div>
      <div class="card">
        <h2>Semak baki &amp; hantar bukti bayaran</h2>
        <form id="lk" novalidate>
          <label for="ph">Nombor telefon (seperti didaftarkan kepada bendahari)</label>
          <input id="ph" type="tel" inputmode="tel" autocomplete="tel" placeholder="cth: 0123456789" required>
          <div id="lkerr"></div>
          <p><button type="submit">Semak</button></p>
        </form>
      </div>`;
    document.getElementById('copy').onclick = async () => {
      try { await navigator.clipboard.writeText(INFO.accountNo); toast('No. akaun disalin'); } catch (e) { toast(INFO.accountNo); }
    };
    document.getElementById('lk').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button'); const box = document.getElementById('lkerr');
      box.innerHTML = ''; busy(btn, true, 'Menyemak...');
      try {
        const phone = document.getElementById('ph').value;
        const r = await api('lookup', { phone });
        ME = { phone, people: r.people };
        location.hash = '#/me'; render();
      } catch (err) { box.innerHTML = `<div class="err">${esc(err.message)}</div>`; busy(btn, false, 'Semak'); }
    };
  }

  /* ---------- participant ---------- */
  function monthsLeft() {
    const days = Math.ceil((new Date(INFO.deadline + 'T23:59:59') - new Date()) / 86400000);
    return { days, months: Math.max(1, Math.ceil(days / 30.4)) };
  }

  function renderMe() {
    const { days, months } = monthsLeft();
    const cards = ME.people.map((p) => {
      const suggest = p.balance > 0 ? Math.ceil(p.balance / months) : 0;
      const rows = p.payments.length ? p.payments.map((b) => `
        <tr><td>${fmtDate(b.date)}</td><td class="num">${rm(b.amount)}</td>
        <td><span class="badge b-${esc(b.status)}">${esc(b.status)}</span>${b.note ? `<div class="small muted">${esc(b.note)}</div>` : ''}</td></tr>`).join('')
        : `<tr><td colspan="3" class="muted">Belum ada bayaran direkodkan.</td></tr>`;
      return `
      <div class="card">
        <h1>${esc(p.nama)}</h1>
        <div class="muted small">Lembu ${p.lembu} &middot; ${p.bahagian} bahagian</div>
        <div class="bar"><i style="width:${pct(p.paid, p.target)}%"></i></div>
        <div class="grid g4">
          <div class="stat"><b>${rm(p.target)}</b><span>Sasaran</span></div>
          <div class="stat"><b>${rm(p.paid)}</b><span>Disahkan</span></div>
          <div class="stat"><b>${rm(p.pending)}</b><span>Menunggu semakan</span></div>
          <div class="stat"><b>${rm(p.balance)}</b><span>Baki</span></div>
        </div>
        <p class="small muted">${p.balance <= 0 ? 'Alhamdulillah, bayaran anda telah lengkap.' :
          days > 0 ? `Baki perlu dilunaskan sebelum <b>${fmtDate(INFO.deadline)}</b> (${days} hari lagi). Cadangan ansuran: kira-kira <b>${rm(suggest)}</b> sebulan. Anda boleh bayar sebarang jumlah.`
            : `Tarikh akhir telah berlalu. Sila hubungi bendahari.`}</p>
        <p><button data-pay="${esc(p.id)}">Hantar bukti bayaran</button></p>
        <h2>Sejarah bayaran</h2>
        <div class="scroll"><table class="tbl"><thead><tr><th>Tarikh</th><th class="num">Jumlah</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
      </div>`;
    }).join('');
    $app.innerHTML = `<p><button class="ghost sm" id="back">&larr; Keluar</button></p>${cards}
      <p class="small muted">Bayaran akan dikira selepas disahkan oleh bendahari berdasarkan penyata bank.</p>`;
    document.getElementById('back').onclick = () => { ME = null; location.hash = '#/'; render(); };
    $app.querySelectorAll('[data-pay]').forEach((b) => b.onclick = () => payForm(ME.people.find((p) => p.id === b.dataset.pay)));
  }

  function payForm(p) {
    openModal(`
      <h2>Bukti bayaran - ${esc(p.nama)}</h2>
      <form id="pf">
        <label for="amt">Jumlah dibayar (RM)</label>
        <input id="amt" type="number" min="1" step="0.01" inputmode="decimal" required>
        <label for="dt">Tarikh bayaran</label>
        <input id="dt" type="date" value="${today()}" max="${today()}" required>
        <label for="fl">Bukti bayaran (gambar atau PDF)</label>
        <input id="fl" type="file" accept="image/*,application/pdf" required>
        <img id="pv" class="preview" alt="" hidden>
        <div id="pferr"></div>
        <div class="row" style="margin-top:14px">
          <button type="submit">Hantar</button><button type="button" class="ghost" id="cx">Batal</button>
        </div>
      </form>`);
    let prepared = null;
    const fl = document.getElementById('fl'); const pv = document.getElementById('pv'); const errBox = document.getElementById('pferr');
    document.getElementById('cx').onclick = closeModal;
    fl.onchange = async () => {
      prepared = null; pv.hidden = true; errBox.innerHTML = '';
      if (!fl.files[0]) return;
      try {
        prepared = await prepareFile(fl.files[0], INFO.maxFileMB * 1024 * 1024);
        if (prepared.mime !== 'application/pdf') { pv.src = 'data:' + prepared.mime + ';base64,' + prepared.data; pv.hidden = false; }
      } catch (e) { errBox.innerHTML = `<div class="err">${esc(e.message)}</div>`; fl.value = ''; }
    };
    document.getElementById('pf').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button[type=submit]'); errBox.innerHTML = '';
      if (!prepared) { errBox.innerHTML = '<div class="err">Sila pilih bukti bayaran.</div>'; return; }
      busy(btn, true, 'Menghantar...');
      try {
        const updated = await api('submitPayment', {
          phone: ME.phone, pesertaId: p.id, amount: document.getElementById('amt').value,
          date: document.getElementById('dt').value, mime: prepared.mime, data: prepared.data
        });
        ME.people = ME.people.map((x) => (x.id === updated.id ? updated : x));
        closeModal(); renderMe(); toast('Bukti dihantar. Menunggu pengesahan bendahari.');
      } catch (err) { errBox.innerHTML = `<div class="err">${esc(err.message)}</div>`; busy(btn, false, 'Hantar'); }
    };
  }

  // Images are downscaled to JPEG in the browser; PDFs are sent as-is.
  function prepareFile(file, maxBytes) {
    return new Promise((resolve, reject) => {
      if (file.type === 'application/pdf') {
        if (file.size > maxBytes * 0.7) return reject(new Error('PDF terlalu besar (maksimum ~3.5MB).'));
        const r = new FileReader();
        r.onload = () => resolve({ mime: 'application/pdf', data: String(r.result).split(',')[1] });
        r.onerror = () => reject(new Error('Gagal membaca fail.'));
        return r.readAsDataURL(file);
      }
      if (!/^image\//.test(file.type)) return reject(new Error('Hanya gambar atau PDF dibenarkan.'));
      const url = URL.createObjectURL(file); const img = new Image();
      img.onload = () => {
        const max = 1600; const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve({ mime: 'image/jpeg', data: c.toDataURL('image/jpeg', 0.82).split(',')[1] });
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Gambar tidak dapat dibaca. Cuba format JPG/PNG.')); };
      img.src = url;
    });
  }

  /* ---------- admin ---------- */
  function renderAdminLogin() {
    $app.innerHTML = `
      <div class="card" style="max-width:420px;margin:auto">
        <h1>Log masuk bendahari</h1>
        <form id="al"><label for="pw">Kata laluan</label>
          <input id="pw" type="password" autocomplete="current-password" required>
          <div id="alerr"></div><p><button type="submit">Log masuk</button></p></form>
      </div>`;
    document.getElementById('al').onsubmit = async (e) => {
      e.preventDefault();
      const btn = e.target.querySelector('button'); const box = document.getElementById('alerr');
      box.innerHTML = ''; busy(btn, true, 'Sila tunggu...');
      try {
        const r = await api('adminLogin', { password: document.getElementById('pw').value });
        store.set('tok', r.token); renderAdmin();
      } catch (err) { box.innerHTML = `<div class="err">${esc(err.message)}</div>`; busy(btn, false, 'Log masuk'); }
    };
  }

  const adm = (action, payload) => api(action, Object.assign({ token: store.get('tok') }, payload || {}));

  async function renderAdmin() {
    if (!ADMIN) {
      $app.innerHTML = `<div class="card muted">Memuatkan...</div>`;
      try { ADMIN = await adm('adminData'); } catch (e) { if (store.get('tok')) $app.innerHTML = `<div class="card"><div class="err">${esc(e.message)}</div></div>`; return; }
    }
    const d = ADMIN; const i = d.info;
    const verified = d.people.reduce((s, p) => s + p.paid, 0);
    const pending = d.payments.filter((b) => b.status === 'Menunggu');
    const target = d.people.reduce((s, p) => s + p.target, 0);
    const full = d.people.filter((p) => p.balance <= 0).length;
    $app.innerHTML = `
      <div class="row" style="justify-content:space-between"><h1>Panel Bendahari</h1>
        <button class="ghost sm" id="lo">Log keluar</button></div>
      <div class="grid g4" style="margin-bottom:16px">
        <div class="stat"><b>${rm(verified)}</b><span>Disahkan (${pct(verified, target)}% daripada ${rm(target)})</span></div>
        <div class="stat"><b>${rm(Math.max(0, target - verified))}</b><span>Baki keseluruhan</span></div>
        <div class="stat"><b>${pending.length}</b><span>Menunggu semakan (${rm(pending.reduce((s, b) => s + b.amount, 0))})</span></div>
        <div class="stat"><b>${full}/${d.people.length}</b><span>Peserta lunas</span></div>
      </div>
      <div class="tabs">
        <button data-t="bayaran" class="${adminTab === 'bayaran' ? 'on' : ''}">Bayaran</button>
        <button data-t="peserta" class="${adminTab === 'peserta' ? 'on' : ''}">Peserta</button>
      </div>
      <div id="tab"></div>`;
    document.getElementById('lo').onclick = () => { store.set('tok', null); ADMIN = null; location.hash = '#/'; render(); };
    $app.querySelectorAll('[data-t]').forEach((b) => b.onclick = () => { adminTab = b.dataset.t; renderAdmin(); });
    if (adminTab === 'bayaran') adminPayments(); else adminPeople();
    void i;
  }

  function adminPayments() {
    const list = ADMIN.payments.filter((b) => payFilter === 'Semua' || b.status === payFilter);
    const rows = list.map((b) => `
      <tr><td>${fmtDate(b.date)}</td><td>${esc(b.nama)}</td><td class="num">${rm(b.amount)}</td>
      <td><span class="badge b-${esc(b.status)}">${esc(b.status)}</span>${b.note ? `<div class="small muted">${esc(b.note)}</div>` : ''}</td>
      <td class="row">
        ${b.hasProof ? `<button class="ghost sm" data-proof="${esc(b.id)}">Bukti</button>` : `<span class="small muted">${esc(b.method)}</span>`}
        ${b.status !== 'Disahkan' ? `<button class="sm" data-st="Disahkan" data-id="${esc(b.id)}">Sahkan</button>` : ''}
        ${b.status !== 'Ditolak' ? `<button class="ghost sm" data-st="Ditolak" data-id="${esc(b.id)}">Tolak</button>` : ''}
        <button class="bad sm" data-del="${esc(b.id)}">Padam</button>
      </td></tr>`).join('') || `<tr><td colspan="5" class="muted">Tiada rekod.</td></tr>`;
    document.getElementById('tab').innerHTML = `
      <div class="card">
        <div class="row" style="justify-content:space-between;margin-bottom:8px">
          <select id="flt" style="width:auto">${['Menunggu', 'Disahkan', 'Ditolak', 'Semua'].map((s) => `<option ${s === payFilter ? 'selected' : ''}>${s}</option>`).join('')}</select>
          <button class="sm" id="addpay">+ Rekod bayaran</button>
        </div>
        <div class="scroll"><table class="tbl"><thead><tr><th>Tarikh</th><th>Peserta</th><th class="num">Jumlah</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="small muted">Semak penyata bank sebelum menekan Sahkan. Hanya bayaran berstatus Disahkan dikira dalam baki.</p>
      </div>`;
    document.getElementById('flt').onchange = (e) => { payFilter = e.target.value; adminPayments(); };
    document.getElementById('addpay').onclick = () => addPaymentForm();
    document.querySelectorAll('[data-proof]').forEach((b) => b.onclick = () => viewProof(b.dataset.proof, b));
    document.querySelectorAll('[data-st]').forEach((b) => b.onclick = () => setStatus(b.dataset.id, b.dataset.st, b));
    document.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
      if (!confirm('Padam rekod bayaran ini (termasuk fail bukti)?')) return;
      await mutate(b, () => adm('deletePayment', { id: b.dataset.del }));
    });
  }

  async function mutate(btn, fn) {
    btn.disabled = true;
    try { ADMIN = await fn(); renderAdmin(); } catch (e) { toast(e.message); btn.disabled = false; }
  }

  function setStatus(id, status, btn) {
    if (status === 'Ditolak') {
      openModal(`<h2>Tolak bayaran</h2><form id="rj"><label for="nt">Sebab (dipaparkan kepada peserta)</label>
        <input id="nt" maxlength="150" placeholder="cth: Tiada dalam penyata bank"><div class="row" style="margin-top:14px">
        <button type="submit" class="bad">Tolak</button><button type="button" class="ghost" id="cx">Batal</button></div></form>`);
      document.getElementById('cx').onclick = closeModal;
      document.getElementById('rj').onsubmit = async (e) => {
        e.preventDefault();
        try { ADMIN = await adm('setStatus', { id, status, note: document.getElementById('nt').value }); closeModal(); renderAdmin(); }
        catch (err) { toast(err.message); }
      };
      return;
    }
    mutate(btn, () => adm('setStatus', { id, status }));
  }

  async function viewProof(id, btn) {
    btn.disabled = true;
    try {
      const r = await adm('getProof', { id });
      if (r.mime === 'application/pdf') {
        const bin = atob(r.data); const arr = new Uint8Array(bin.length);
        for (let k = 0; k < bin.length; k++) arr[k] = bin.charCodeAt(k);
        window.open(URL.createObjectURL(new Blob([arr], { type: 'application/pdf' })), '_blank');
      } else {
        openModal(`<img alt="Bukti bayaran" src="data:${esc(r.mime)};base64,${r.data}"><p><button class="ghost" id="cx">Tutup</button></p>`);
        document.getElementById('cx').onclick = closeModal;
      }
    } catch (e) { toast(e.message); }
    btn.disabled = false;
  }

  function addPaymentForm(preId) {
    const opts = ADMIN.people.map((p) => `<option value="${esc(p.id)}" ${p.id === preId ? 'selected' : ''}>L${p.lembu} - ${esc(p.nama)}</option>`).join('');
    openModal(`<h2>Rekod bayaran (terus disahkan)</h2><form id="ap">
      <label>Peserta</label><select id="apid">${opts}</select>
      <label>Jumlah (RM)</label><input id="apamt" type="number" min="1" step="0.01" required>
      <label>Tarikh</label><input id="apdt" type="date" value="${today()}" required>
      <label>Kaedah</label><input id="apm" value="Bank-in" maxlength="30">
      <label>Catatan</label><input id="apn" maxlength="150">
      <div class="row" style="margin-top:14px"><button type="submit">Simpan</button><button type="button" class="ghost" id="cx">Batal</button></div></form>`);
    document.getElementById('cx').onclick = closeModal;
    document.getElementById('ap').onsubmit = async (e) => {
      e.preventDefault();
      try {
        ADMIN = await adm('addPayment', { pesertaId: document.getElementById('apid').value, amount: document.getElementById('apamt').value,
          date: document.getElementById('apdt').value, method: document.getElementById('apm').value, note: document.getElementById('apn').value });
        closeModal(); renderAdmin(); toast('Disimpan');
      } catch (err) { toast(err.message); }
    };
  }

  function adminPeople() {
    const rows = ADMIN.people.slice().sort((a, b) => a.lembu - b.lembu).map((p) => `
      <tr><td>L${p.lembu}</td><td>${esc(p.nama)}${p.telefon ? '' : ' <span class="badge b-Menunggu">tiada no. tel</span>'}
        <div class="small muted">${esc(p.telefon)}</div></td>
        <td class="num">${rm(p.paid)} / ${rm(p.target)}<div class="bar"><i style="width:${pct(p.paid, p.target)}%"></i></div></td>
        <td class="row"><button class="ghost sm" data-pay="${esc(p.id)}">+ Bayaran</button><button class="ghost sm" data-ed="${esc(p.id)}">Edit</button></td></tr>`).join('');
    document.getElementById('tab').innerHTML = `
      <div class="card">
        <div class="row" style="justify-content:flex-end;margin-bottom:8px"><button class="sm" id="addp">+ Peserta</button></div>
        <div class="scroll"><table class="tbl"><thead><tr><th>Lembu</th><th>Nama</th><th class="num">Bayaran</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
        <p class="small muted">Peserta menyemak baki menggunakan nombor telefon. Pastikan nombor diisi dan unik bagi setiap orang (kongsi nombor akan memaparkan kedua-dua nama).</p>
      </div>`;
    document.getElementById('addp').onclick = () => personForm();
    document.querySelectorAll('[data-ed]').forEach((b) => b.onclick = () => personForm(ADMIN.people.find((p) => p.id === b.dataset.ed)));
    document.querySelectorAll('[data-pay]').forEach((b) => b.onclick = () => addPaymentForm(b.dataset.pay));
  }

  function personForm(p) {
    p = p || { lembu: 1, bahagian: 1, nama: '', telefon: '' };
    openModal(`<h2>${p.id ? 'Edit' : 'Tambah'} peserta</h2><form id="pp">
      <label>Nama</label><input id="ppn" value="${esc(p.nama)}" maxlength="100" required>
      <label>No. telefon</label><input id="ppt" type="tel" value="${esc(p.telefon)}" placeholder="cth: 0123456789">
      <label>Lembu</label><select id="ppl"><option value="1" ${p.lembu === 1 ? 'selected' : ''}>Lembu 1</option><option value="2" ${p.lembu === 2 ? 'selected' : ''}>Lembu 2</option></select>
      <label>Bilangan bahagian</label><input id="ppb" type="number" min="1" max="14" value="${p.bahagian}" required>
      <div class="row" style="margin-top:14px"><button type="submit">Simpan</button>
        ${p.id ? '<button type="button" class="bad" id="pdel">Padam</button>' : ''}<button type="button" class="ghost" id="cx">Batal</button></div></form>`);
    document.getElementById('cx').onclick = closeModal;
    if (p.id) document.getElementById('pdel').onclick = async () => {
      if (!confirm('Padam peserta ini?')) return;
      try { ADMIN = await adm('deletePeserta', { id: p.id }); closeModal(); renderAdmin(); } catch (e) { toast(e.message); }
    };
    document.getElementById('pp').onsubmit = async (e) => {
      e.preventDefault();
      try {
        ADMIN = await adm('savePeserta', { id: p.id, nama: document.getElementById('ppn').value, telefon: document.getElementById('ppt').value,
          lembu: document.getElementById('ppl').value, bahagian: document.getElementById('ppb').value });
        closeModal(); renderAdmin(); toast('Disimpan');
      } catch (err) { toast(err.message); }
    };
  }

  render();
})();
