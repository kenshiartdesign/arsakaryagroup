const CONFIG = {
  GAS_URL: 'https://script.google.com/macros/s/AKfycbypofLYPOd7q_SBKEx7_eYXktqRp9b8cPNO4hO1yUE4BdTInnAuHRHN-LpGCqMzm2RM/exec',
  MAX_ACCURACY: 100
};

let currentUser = JSON.parse(localStorage.getItem('sbu_user') || 'null');
let selectedLokasi = JSON.parse(localStorage.getItem('sbu_lokasi') || 'null');
let gps = null;
let currentCameraAction = '';
let capturedBase64 = null;
let patroliData = { foto1: '', foto2: '' };
let kejadianData = { foto1: '', foto2: '' };
let ijinData = { foto: '' };
let videoStream = null;
let notificationCount = 0;

// ===== TOAST NOTIFICATION =====
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  let bgClass = 'bg-slate-800 text-white';
  let icon = '<i class="fa-solid fa-circle-info"></i>';
  
  if (type === 'success') {
    bgClass = 'bg-green-600 text-white';
    icon = '<i class="fa-solid fa-circle-check"></i>';
  } else if (type === 'error') {
    bgClass = 'bg-red-600 text-white';
    icon = '<i class="fa-solid fa-circle-xmark"></i>';
  } else if (type === 'warning') {
    bgClass = 'bg-amber-500 text-white';
    icon = '<i class="fa-solid fa-triangle-exclamation"></i>';
  }

  toast.className = `${bgClass} px-4 py-3 rounded-xl shadow-2xl flex items-center gap-3 text-sm font-bold transform transition-all duration-300 translate-y-10 opacity-0 pointer-events-auto`;
  toast.innerHTML = `${icon} <span class="flex-1">${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.remove('translate-y-10', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('translate-y-10', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ===== MODAL LOKASI SALAH =====
function showModalLokasiSalah(lokasiBenar) {
  const modal = document.getElementById('modalLokasiSalah');
  const infoEl = document.getElementById('lokasiBenarInfo');
  
  if (infoEl) {
    infoEl.innerText = lokasiBenar || 'Tidak diketahui';
  }
  
  if (modal) {
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  }
}

function closeModalLokasiSalah() {
  const modal = document.getElementById('modalLokasiSalah');
  if (modal) {
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }
}

// ===== VALIDASI LOKASI KERJA =====
function validasiLokasiKerja(lokasiDipilih) {
  // ===== BYPASS UNTUK ADMIN & HRD =====
  const userRole = String(currentUser.role || '').trim().toLowerCase();
  
  if (userRole === 'admin' || userRole === 'hrd') {
    console.log('👑 User adalah ' + userRole.toUpperCase() + ' → Bebas pilih lokasi manapun');
    return true; // Skip validasi, izinkan semua lokasi
  }
  
  // ===== USER BIASA (satpam, dll) =====
  // Jika user tidak punya lokasi_default, izinkan semua lokasi
  if (!currentUser.lokasi_default || currentUser.lokasi_default === '' || currentUser.lokasi_default === '-') {
    console.log('️ User tidak punya lokasi_default, izinkan semua lokasi');
    return true;
  }
  
  // Bandingkan ID lokasi yang dipilih dengan lokasi_default user
  const lokasiDefault = String(currentUser.lokasi_default).trim().toUpperCase();
  const lokasiDipilihId = String(lokasiDipilih.id_lokasi).trim().toUpperCase();
  
  console.log('🔍 Validasi Lokasi:');
  console.log('   Role User:', userRole);
  console.log('   Lokasi Default User:', lokasiDefault);
  console.log('   Lokasi yang Dipilih:', lokasiDipilihId);
  console.log('   Cocok:', lokasiDefault === lokasiDipilihId);
  
  return lokasiDefault === lokasiDipilihId;
}

// ===== GET NAMA LOKASI DEFAULT =====
function getNamaLokasiDefault() {
  if (!currentUser.lokasi_default) return 'Tidak ditentukan';
  
  // Cari nama lokasi dari data yang sudah di-load
  // Kita simpan daftar lokasi di variabel global saat loadLokasi()
  if (window._daftarLokasi && Array.isArray(window._daftarLokasi)) {
    const lokasi = window._daftarLokasi.find(l => 
      String(l.id_lokasi).trim().toUpperCase() === String(currentUser.lokasi_default).trim().toUpperCase()
    );
    if (lokasi) return lokasi.nama_lokasi;
  }
  
  return currentUser.lokasi_default;
}

// ===== LOADING =====
function showLoading(show) {
  let overlay = document.getElementById('loadingOverlay');
  if (show) {
    if (!overlay) {
      overlay = document.createElement('div');
      overlay.id = 'loadingOverlay';
      overlay.className = 'fixed inset-0 z-[200] bg-black/70 flex items-center justify-center';
      overlay.innerHTML = '<div class="bg-white p-4 rounded-xl flex items-center gap-3 shadow-xl"><div class="w-6 h-6 border-4 border-amber-400 border-t-transparent rounded-full animate-spin"></div><span class="font-bold text-slate-900">Memproses...</span></div>';
      document.body.appendChild(overlay);
    }
  } else {
    if (overlay) overlay.remove();
  }
}

// ===== GPS =====
function startGPS() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition(p => {
    gps = { lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy };
    const el = document.getElementById('gpsInfo');
    if (el) el.innerText = 'GPS: ' + gps.lat.toFixed(5) + ', ' + gps.lng.toFixed(5) + ' (Akurasi: ' + Math.round(gps.accuracy) + 'm)';
    updateAbsenUI();
  }, e => { console.error('GPS Error:', e); }, { enableHighAccuracy: true, timeout: 10000 });
}

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371e3;
  const toRad = x => x * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function updateAbsenUI() {
  if (!gps || !selectedLokasi) return;
  const jarak = haversine(gps.lat, gps.lng, selectedLokasi.latitude, selectedLokasi.longitude);
  const el = document.getElementById('absenJarak');
  const isValid = jarak <= selectedLokasi.radius_meter;
  if (el) {
    el.innerHTML = '<span class="' + (isValid ? 'text-green-600' : 'text-red-600') + '">' + jarak.toFixed(0) + 'm</span> <span class="text-slate-500">/ Max: ' + selectedLokasi.radius_meter + 'm</span>';
  }
}

// ===== JAM & TANGGAL =====
function updateJamDigital() {
  const now = new Date();
  const jam = String(now.getHours()).padStart(2, '0');
  const menit = String(now.getMinutes()).padStart(2, '0');
  const detik = String(now.getSeconds()).padStart(2, '0');
  const jamEl = document.getElementById('jamDigital');
  if (jamEl) jamEl.innerText = jam + ':' + menit + ':' + detik;
}

function hitungHariPasaran() {
  const pasaran = ['Legi', 'Pahing', 'Pon', 'Wage', 'Kliwon'];
  const referensi = new Date(1945, 7, 17);
  const sekarang = new Date();
  referensi.setHours(0, 0, 0, 0);
  sekarang.setHours(0, 0, 0, 0);
  const selisihMs = sekarang.getTime() - referensi.getTime();
  const selisihHari = Math.round(selisihMs / (1000 * 60 * 60 * 24));
  const indexPasaran = ((selisihHari % 5) + 5) % 5;
  return pasaran[indexPasaran];
}

function updateTanggalLengkap() {
  const now = new Date();
  const hariMasehi = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const pasaran = hitungHariPasaran();
  const tglEl = document.getElementById('tanggalLengkap');
  if (tglEl) tglEl.innerText = hariMasehi[now.getDay()] + ' ' + pasaran + ', ' + now.getDate() + ' ' + bulan[now.getMonth()] + ' ' + now.getFullYear();
}

function startClock() {
  updateJamDigital();
  updateTanggalLengkap();
  setInterval(() => {
    updateJamDigital();
    const now = new Date();
    if (now.getHours() === 0 && now.getMinutes() === 0 && now.getSeconds() <= 2) updateTanggalLengkap();
  }, 1000);
}

// ===== JAM MINI HEADER ABSEN =====
function updateJamMini() {
  const now = new Date();
  const jam = String(now.getHours()).padStart(2, '0');
  const menit = String(now.getMinutes()).padStart(2, '0');
  const detik = String(now.getSeconds()).padStart(2, '0');
  const jamEl = document.getElementById('jamDigitalMini');
  if (jamEl) jamEl.innerText = jam + ':' + menit + ':' + detik;
  
  const hariMasehi = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const hariNama = hariMasehi[now.getDay()];
  const pasaran = hitungHariPasaran();
  const hariPasaranEl = document.getElementById('hariPasaranMini');
  if (hariPasaranEl) hariPasaranEl.innerText = hariNama + ' ' + pasaran;
  
  const bulan = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const tanggalEl = document.getElementById('tanggalMini');
  if (tanggalEl) tanggalEl.innerText = now.getDate() + ' ' + bulan[now.getMonth()] + ' ' + now.getFullYear();
}

setInterval(updateJamMini, 1000);
updateJamMini();

// ===== DARK MODE =====
function initDarkMode() {
  const saved = localStorage.getItem('sbu_dark_mode');
  if (saved === 'true') {
    document.documentElement.classList.add('dark');
    const icon = document.getElementById('darkModeIcon');
    if (icon) icon.className = 'fa-solid fa-sun text-sm';
  }
}

function toggleDarkMode() {
  const isDark = document.documentElement.classList.toggle('dark');
  localStorage.setItem('sbu_dark_mode', isDark);
  
  const icon = document.getElementById('darkModeIcon');
  if (icon) {
    icon.className = isDark ? 'fa-solid fa-sun text-sm' : 'fa-solid fa-moon text-sm';
  }
  
  showToast(isDark ? '🌙 Dark Mode Aktif' : '☀️ Light Mode Aktif', 'info');
}

// ===== PULL TO REFRESH (SIMPLE - NO SPINNER) =====
// Refresh data di tab yang sedang aktif saja, tidak pindah tab
function initPullToRefresh() {
  const content = document.getElementById('mainContent');
  if (!content) return;
  
  let startY = 0;
  let currentY = 0;
  let isPulling = false;
  let isRefreshing = false;
  const THRESHOLD = 60;
  
  content.addEventListener('touchstart', (e) => {
    // Hanya aktif jika scroll di posisi paling atas
    if (content.scrollTop <= 5 && !isRefreshing) {
      startY = e.touches[0].clientY;
      isPulling = true;
    }
  }, { passive: true });
  
  content.addEventListener('touchmove', (e) => {
    if (!isPulling || isRefreshing) return;
    currentY = e.touches[0].clientY;
  }, { passive: true });
  
  content.addEventListener('touchend', () => {
    if (!isPulling || isRefreshing) {
      isPulling = false;
      return;
    }
    isPulling = false;
    
    const diff = currentY - startY;
    
    // Jika pull cukup jauh, trigger refresh
    if (diff > THRESHOLD) {
      isRefreshing = true;
      
      // Refresh data sesuai tab yang AKTIF saat ini
      refreshCurrentTab().then(() => {
        setTimeout(() => {
          isRefreshing = false;
          showToast('🔄 Data diperbarui', 'success');
        }, 500);
      }).catch(() => {
        isRefreshing = false;
      });
    }
  });
}

// Refresh data di tab yang sedang aktif - TIDAK pindah tab
async function refreshCurrentTab() {
  // Cek tab mana yang sedang aktif (tidak hidden)
  const activeTab = document.querySelector('[id^="tab-"]:not(.hidden)');
  if (!activeTab) return;
  
  const tabId = activeTab.id; // 'tab-absen', 'tab-info', atau 'tab-profil'
  
  // Refresh sesuai tab aktif - TIDAK mengubah tab yang terlihat
  if (tabId === 'tab-absen') {
    await checkAbsenStatus();
    updateAbsenUI();
  } 
  else if (tabId === 'tab-info') {
    // Cek sub-page mana yang aktif di dalam tab Info
    const activeSub = document.querySelector('[id^="info-sub-"]:not(.hidden)');
    if (activeSub) {
      const subName = activeSub.id.replace('info-sub-', '');
      if (subName === 'rekap') loadRekapAbsensi();
      else if (subName === 'patroli') loadRekapPatroli();
      else if (subName === 'kejadian') loadRekapKejadian();
      else if (subName === 'riwayat') loadPengajuanUser();
      else if (subName === 'gaji') loadSlipGaji();
    } else {
      // Jika di menu utama info, refresh pengajuan & gaji
      loadPengajuanUser();
      loadSlipGaji();
    }
  } 
  else if (tabId === 'tab-profil') {
    loadStatistikProfil();
  }
  
  // Refresh notifikasi badge juga
  checkNotifications();
}

// ===== LOGIN & LOKASI =====
async function doLogin() {
  const u = document.getElementById('inpUser').value.trim();
  const p = document.getElementById('inpPass').value.trim();
  if (!u || !p) return;
  showLoading(true);
  try {
    const response = await fetch(CONFIG.GAS_URL + '?action=login&username=' + encodeURIComponent(u) + '&password=' + encodeURIComponent(p));
    const result = await response.json();
    if (result.status === 'success') {
      currentUser = result.user;
      localStorage.setItem('sbu_user', JSON.stringify(currentUser));
      document.getElementById('screen-login').classList.add('hidden');
      await loadLokasi();
    } else {
      showToast(result.message, 'error');
      const err = document.getElementById('loginError');
      err.textContent = result.message;
      err.classList.remove('hidden');
    }
  } catch (e) {
    showToast('Koneksi gagal: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

async function loadLokasi() {
  showLoading(true);
  try {
    const response = await fetch(CONFIG.GAS_URL + '?action=getLokasi');
    const result = await response.json();
    document.getElementById('screen-login').classList.add('hidden');
    const sl = document.getElementById('screen-lokasi');
    sl.classList.remove('hidden');
    sl.classList.add('flex');
    const list = document.getElementById('listLokasi');
    list.innerHTML = '';
    
    // Simpan daftar lokasi di variabel global untuk validasi
    window._daftarLokasi = result.data || [];
    
    console.log('📍 Total lokasi aktif:', window._daftarLokasi.length);
    console.log('👤 User:', currentUser.username, '| Role:', currentUser.role, '| Lokasi Default:', currentUser.lokasi_default);
    
    // ===== TAMPILKAN INFO ROLE DI ATAS DAFTAR LOKASI =====
    const userRole = String(currentUser.role || '').trim().toLowerCase();
    const isPrivileged = (userRole === 'admin' || userRole === 'hrd');
    
    if (isPrivileged) {
      const infoDiv = document.createElement('div');
      infoDiv.className = 'bg-gradient-to-r from-amber-400 to-amber-600 rounded-2xl p-4 shadow-lg mb-3 animate-fade-in';
      infoDiv.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <i class="fa-solid fa-crown text-white text-lg"></i>
          </div>
          <div class="flex-1">
            <p class="text-sm font-bold text-white">Akses Penuh ${userRole.toUpperCase()}</p>
            <p class="text-[10px] text-white/80">Anda dapat memilih lokasi kerja manapun</p>
          </div>
          <i class="fa-solid fa-check-circle text-white text-xl"></i>
        </div>
      `;
      list.appendChild(infoDiv);
    } else if (currentUser.lokasi_default && currentUser.lokasi_default !== '' && currentUser.lokasi_default !== '-') {
      // Tampilkan info lokasi yang diizinkan untuk user biasa
      const lokasiBenar = getNamaLokasiDefault();
      const infoDiv = document.createElement('div');
      infoDiv.className = 'bg-gradient-to-r from-blue-500 to-blue-600 rounded-2xl p-4 shadow-lg mb-3 animate-fade-in';
      infoDiv.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center">
            <i class="fa-solid fa-location-dot text-white text-lg"></i>
          </div>
          <div class="flex-1">
            <p class="text-sm font-bold text-white">Lokasi Kerja Anda</p>
            <p class="text-[10px] text-white/80">${lokasiBenar}</p>
          </div>
          <i class="fa-solid fa-lock text-white/60 text-lg"></i>
        </div>
      `;
      list.appendChild(infoDiv);
    }
    
    // ===== RENDER DAFTAR LOKASI =====
    if (result.data && result.data.length > 0) {
      result.data.forEach(l => {
        const div = document.createElement('div');
        
        // Tandai lokasi yang "direkomendasikan" untuk user biasa
        const isRecommended = !isPrivileged && 
          currentUser.lokasi_default && 
          String(l.id_lokasi).trim().toUpperCase() === String(currentUser.lokasi_default).trim().toUpperCase();
        
        div.className = 'bg-white dark:bg-slate-800 rounded-[20px] p-4 flex justify-between items-center shadow-sm' + 
          (isRecommended ? ' border-2 border-amber-400' : '');
        
        div.innerHTML = `
          <div class="flex items-center gap-3">
            ${isRecommended ? '<div class="w-8 h-8 rounded-lg bg-amber-100 flex items-center justify-center"><i class="fa-solid fa-star text-amber-600 text-sm"></i></div>' : ''}
            <div>
              <p class="font-bold text-sm">${l.nama_lokasi}</p>
              <p class="text-xs text-slate-500">${l.alamat}</p>
            </div>
          </div>
          <button class="bg-slate-900 text-white px-4 h-9 rounded-xl text-xs font-bold active:scale-95 transition">PILIH</button>
        `;
        
        // Validasi lokasi saat user klik PILIH
        div.querySelector('button').onclick = () => {
          console.log('📍 User memilih lokasi:', l.nama_lokasi, '(', l.id_lokasi, ')');
          
          if (validasiLokasiKerja(l)) {
            // Lokasi cocok → lanjut
            selectedLokasi = l;
            localStorage.setItem('sbu_lokasi', JSON.stringify(l));
            showToast('✅ Lokasi: ' + l.nama_lokasi, 'success');
            showMainScreen();
          } else {
            // Lokasi tidak cocok → tampilkan modal error
            const namaLokasiBenar = getNamaLokasiDefault();
            console.log('❌ Lokasi tidak sesuai! Lokasi benar:', namaLokasiBenar);
            showModalLokasiSalah(namaLokasiBenar);
          }
        };
        
        list.appendChild(div);
      });
    } else {
      list.innerHTML = '<p class="text-center text-slate-500 text-sm w-full">Tidak ada lokasi aktif.</p>';
    }
  } catch (e) {
    showToast('Gagal memuat lokasi: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

// ===== UPDATE AVATAR =====
function updateAvatarDisplay(fotoUrl, nama, elementIdImg, elementIdText) {
  const imgEl = document.getElementById(elementIdImg);
  const textEl = document.getElementById(elementIdText);
  
  if (fotoUrl && fotoUrl !== '' && fotoUrl !== 'null') {
    const thumbUrl = getThumbnailUrl(fotoUrl);
    imgEl.src = thumbUrl;
    imgEl.classList.remove('hidden');
    textEl.classList.add('hidden');
    
    imgEl.onerror = function() {
      imgEl.classList.add('hidden');
      textEl.classList.remove('hidden');
      textEl.innerText = String(nama || '-').substring(0, 2).toUpperCase();
    };
  } else {
    imgEl.classList.add('hidden');
    textEl.classList.remove('hidden');
    textEl.innerText = String(nama || '-').substring(0, 2).toUpperCase();
  }
}

async function showMainScreen() {
  document.getElementById('screen-lokasi').classList.add('hidden');
  const sm = document.getElementById('screen-main');
  sm.classList.remove('hidden');
  sm.classList.add('flex');
  
  document.getElementById('namaTop').innerText = currentUser.nama;
  const lokasiTopEl = document.getElementById('lokasiTop');
  if (lokasiTopEl.querySelector) {
    const span = lokasiTopEl.querySelector('span:last-child');
    if (span) span.innerText = selectedLokasi.nama_lokasi;
  } else {
    lokasiTopEl.innerText = selectedLokasi.nama_lokasi;
  }
  document.getElementById('infoLokasiAbsen').innerText = selectedLokasi.nama_lokasi;
  
  updateAvatarDisplay(currentUser.foto_url, currentUser.nama, 'avatarTopImg', 'avatarTopText');
  
  document.getElementById('profilNamaHeader').innerText = currentUser.nama;
  document.getElementById('profilRoleHeader').innerText = currentUser.role.toUpperCase();
  document.getElementById('profilNama').innerText = currentUser.nama;
  document.getElementById('profilUsername').innerText = currentUser.username;
  document.getElementById('profilNik').innerText = currentUser.nik || '-';
  document.getElementById('profilRole').innerText = currentUser.role.toUpperCase();
  document.getElementById('profilAlamat').innerText = currentUser.alamat || '-';
  document.getElementById('profilTlp').innerText = currentUser.no_tlp || '-';
  document.getElementById('profilEmail').innerText = currentUser.email || '-';
  document.getElementById('profilLokasi').innerText = selectedLokasi.nama_lokasi;
  
  updateAvatarDisplay(currentUser.foto_url, currentUser.nama, 'profilFotoImg', 'profilFotoText');
  
  updateAbsenUI();
  
  // ===== PERBAIKAN LOGIKA STATUS ABSEN =====
  const btnMasuk = document.getElementById('btnAbsenMasuk');
  const btnPulang = document.getElementById('btnAbsenPulang');
  const pesanEl = document.getElementById('absenPesan');
  
  // SELALU cek dari server dulu (untuk sinkronisasi antar device)
  // localStorage hanya sebagai fallback jika server error
  try {
    await checkAbsenStatus();
  } catch (e) {
    console.error('Gagal cek status dari server, gunakan localStorage:', e);
    // Fallback ke localStorage
    const savedStatus = JSON.parse(localStorage.getItem('sbu_absen_status') || 'null');
    if (savedStatus && savedStatus.last_action === 'masuk') {
      btnMasuk.disabled = true;
      btnMasuk.className = 'h-20 bg-slate-200 dark:bg-slate-700 text-slate-400 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 cursor-not-allowed';
      btnMasuk.onclick = null;
      btnPulang.disabled = false;
      btnPulang.className = 'h-20 bg-green-500 text-white rounded-2xl font-bold shadow-lg active:scale-95 transition flex flex-col items-center justify-center gap-1 btn-pulse-active';
      btnPulang.onclick = () => openCamera('pulang');
      if (pesanEl) { pesanEl.innerText = 'Anda sudah absen masuk. Silakan absen pulang.'; pesanEl.className = 'text-sm font-bold text-green-600'; }
    } else if (savedStatus && savedStatus.last_action === 'pulang') {
      btnMasuk.disabled = true;
      btnMasuk.className = 'h-20 bg-slate-200 dark:bg-slate-700 text-slate-400 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 cursor-not-allowed';
      btnMasuk.onclick = null;
      btnPulang.disabled = true;
      btnPulang.className = 'h-20 bg-slate-200 dark:bg-slate-700 text-slate-400 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 cursor-not-allowed';
      btnPulang.onclick = null;
      if (pesanEl) { pesanEl.innerText = 'Anda sudah absen pulang. Cooldown 5 jam.'; pesanEl.className = 'text-sm font-bold text-red-600'; }
    }
  }
  
  // Init fitur baru
  initDarkMode();
  initPullToRefresh();
  
  // Load data di background
  loadSlipGaji();
  loadPengajuanUser();
  loadStatistikProfil();
  
  // Load notifikasi setelah 2 detik
  setTimeout(() => checkNotifications(), 2000);
}

async function checkAbsenStatus() {
  if (!currentUser) return;
  const btnMasuk = document.getElementById('btnAbsenMasuk');
  const btnPulang = document.getElementById('btnAbsenPulang');
  const pesanEl = document.getElementById('absenPesan');
  
  try {
    // Tambah cache buster yang lebih kuat
    const url = CONFIG.GAS_URL + '?action=getAbsenStatus&username=' + 
                encodeURIComponent(currentUser.username.trim().toLowerCase()) + 
                '&t=' + Date.now() + '&rand=' + Math.random();
    const res = await fetch(url);
    const result = await res.json();
    
    console.log('📡 Server Response:', result);
    
    if (result.status === 'success') {
      // Update tombol MASUK
      if (result.tombol_masuk === true) {
        btnMasuk.disabled = false;
        btnMasuk.className = 'h-20 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-2xl font-bold shadow-lg active:scale-95 transition flex flex-col items-center justify-center gap-1';
        btnMasuk.onclick = () => openCamera('masuk');
      } else {
        btnMasuk.disabled = true;
        btnMasuk.className = 'h-20 bg-slate-200 dark:bg-slate-700 text-slate-400 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 cursor-not-allowed';
        btnMasuk.onclick = null;
      }
      
      // Update tombol PULANG
      if (result.tombol_pulang === true) {
        btnPulang.disabled = false;
        btnPulang.className = 'h-20 bg-green-500 text-white rounded-2xl font-bold shadow-lg active:scale-95 transition flex flex-col items-center justify-center gap-1 btn-pulse-active';
        btnPulang.onclick = () => openCamera('pulang');
      } else {
        btnPulang.disabled = true;
        btnPulang.className = 'h-20 bg-slate-200 dark:bg-slate-700 text-slate-400 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 cursor-not-allowed';
        btnPulang.onclick = null;
      }
      
      // Update pesan
      if (pesanEl) {
        pesanEl.innerText = result.pesan || '';
        if (result.pesan.includes('sudah absen masuk')) pesanEl.className = 'text-sm font-bold text-green-600';
        else if (result.pesan.toLowerCase().includes('terkunci')) pesanEl.className = 'text-sm font-bold text-red-600';
        else pesanEl.className = 'text-sm font-bold text-amber-600';
      }
      
      // Update localStorage dengan data dari server
      if (result.debug_last_masuk && !result.debug_last_pulang) {
        localStorage.setItem('sbu_absen_status', JSON.stringify({ 
          last_action: 'masuk', 
          timestamp: new Date(result.debug_last_masuk).toISOString() 
        }));
      } else if (result.debug_last_pulang) {
        localStorage.setItem('sbu_absen_status', JSON.stringify({ 
          last_action: 'pulang', 
          timestamp: new Date(result.debug_last_pulang).toISOString() 
        }));
      } else {
        localStorage.removeItem('sbu_absen_status');
      }
    } else {
      console.error('❌ Server error:', result.message);
    }
  } catch (e) {
    console.error('❌ Check status error:', e);
    throw e; // Re-throw agar bisa di-catch di showMainScreen
  }
}

// ===== KAMERA DEPAN (SELFIE) =====
async function openCameraAbsen(action) {
  currentCameraAction = action;
  const modal = document.getElementById('cameraModalAbsen');
  const video = document.getElementById('videoLive');
  try {
    videoStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false
    });
    video.srcObject = videoStream;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
  } catch (err) {
    console.error('openCameraAbsen Error:', err);
    showToast('Gagal mengakses kamera depan', 'error');
  }
}

function closeCameraAbsen() {
  const modal = document.getElementById('cameraModalAbsen');
  const video = document.getElementById('videoLive');
  if (videoStream) {
    videoStream.getTracks().forEach(track => track.stop());
    videoStream = null;
  }
  video.srcObject = null;
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function captureSelfie() {
  const video = document.getElementById('videoLive');
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  
  ctx.translate(canvas.width, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  
  const now = new Date();
  const jam = now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const tanggal = now.toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const pasaran = hitungHariPasaran();
  const statusText = currentCameraAction === 'masuk' ? 'ABSEN MASUK' : 'ABSEN PULANG';
  const lokasiText = selectedLokasi ? selectedLokasi.nama_lokasi : 'Unknown';
  const namaUser = currentUser ? currentUser.nama : 'Unknown';
  
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const watermarkHeight = 130;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.fillRect(0, canvas.height - watermarkHeight, canvas.width, watermarkHeight);
  
  ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 26px Arial'; ctx.textAlign = 'center';
  ctx.fillText(statusText, canvas.width / 2, canvas.height - watermarkHeight + 35);
  
  ctx.fillStyle = '#ffffff'; ctx.font = 'bold 18px Arial';
  ctx.fillText(namaUser, canvas.width / 2, canvas.height - watermarkHeight + 65);
  
  ctx.fillStyle = '#e5e7eb'; ctx.font = '15px Arial';
  ctx.fillText(tanggal + ' (' + pasaran + ')', canvas.width / 2, canvas.height - watermarkHeight + 90);
  
  ctx.fillStyle = '#10b981'; ctx.font = 'bold 16px Arial';
  ctx.fillText('⏰ ' + jam, canvas.width / 2, canvas.height - watermarkHeight + 115);
  
  if (gps) {
    ctx.fillStyle = '#9ca3af'; ctx.font = '13px monospace';
    ctx.fillText('📍 ' + lokasiText + ' | ' + gps.lat.toFixed(5) + ', ' + gps.lng.toFixed(5), canvas.width / 2, canvas.height - watermarkHeight + 140);
  }
  
  capturedBase64 = canvas.toDataURL('image/jpeg', 0.7);
  closeCameraAbsen();
  
  const btnMasuk = document.getElementById('btnAbsenMasuk');
  const btnPulang = document.getElementById('btnAbsenPulang');
  const pesanEl = document.getElementById('absenPesan');
  
  if (currentCameraAction === 'masuk') {
    btnMasuk.disabled = true;
    btnMasuk.className = 'h-20 bg-slate-200 dark:bg-slate-700 text-slate-400 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 cursor-not-allowed';
    btnMasuk.onclick = null;
    btnPulang.disabled = false;
    btnPulang.className = 'h-20 bg-green-500 text-white rounded-2xl font-bold shadow-lg active:scale-95 transition flex flex-col items-center justify-center gap-1 btn-pulse-active';
    btnPulang.onclick = () => openCamera('pulang');
    if (pesanEl) { pesanEl.innerText = 'Anda sudah absen masuk. Silakan absen pulang.'; pesanEl.className = 'text-sm font-bold text-green-600'; }
  } else if (currentCameraAction === 'pulang') {
    btnMasuk.disabled = true;
    btnMasuk.className = 'h-20 bg-slate-200 dark:bg-slate-700 text-slate-400 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 cursor-not-allowed';
    btnMasuk.onclick = null;
    btnPulang.disabled = true;
    btnPulang.className = 'h-20 bg-slate-200 dark:bg-slate-700 text-slate-400 rounded-2xl font-bold flex flex-col items-center justify-center gap-1 cursor-not-allowed';
    btnPulang.onclick = null;
    if (pesanEl) { pesanEl.innerText = 'Anda sudah absen pulang. Cooldown 5 jam.'; pesanEl.className = 'text-sm font-bold text-red-600'; }
  }
  
  localStorage.setItem('sbu_absen_status', JSON.stringify({ last_action: currentCameraAction, timestamp: now.toISOString() }));

  showLoading(true);
  try {
    const jarak = haversine(gps.lat, gps.lng, selectedLokasi.latitude, selectedLokasi.longitude);
    const payload = {
      action: currentCameraAction === 'masuk' ? 'absenMasuk' : 'absenPulang',
      username: currentUser.username,
      nama: currentUser.nama,
      id_lokasi: selectedLokasi.id_lokasi,
      nama_lokasi: selectedLokasi.nama_lokasi,
      jenis: currentCameraAction.toUpperCase(),
      latitude: gps.lat,
      longitude: gps.lng,
      accuracy: Math.round(gps.accuracy),
      is_mock: 'NO',
      timemark: now.toLocaleDateString('id-ID') + ' ' + now.toLocaleTimeString('id-ID') + ' | ' + selectedLokasi.nama_lokasi,
      foto_base64: capturedBase64
    };
    
    const response = await fetch(CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
    const result = await response.json();
    
    if (result.status === 'success') {
      showToast('Absen ' + currentCameraAction.toUpperCase() + ' berhasil! (' + result.jarak + 'm)', 'success');
    } else {
      showToast('Gagal: ' + result.message, 'error');
      await checkAbsenStatus();
    }
  } catch (e) {
    console.error('Error kirim absen:', e);
    showToast('Koneksi gagal: ' + e.message, 'error');
    await checkAbsenStatus();
  } finally {
    showLoading(false);
  }
}

// ===== URL HELPERS =====
function getThumbnailUrl(url) {
  if (!url) return '';
  if (url.includes('lh3.googleusercontent.com')) return url;
  const match = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) return 'https://lh3.googleusercontent.com/d/' + match[1];
  return url;
}

function getZoomFormats(url) {
  if (!url) return null;
  if (url.includes('lh3.googleusercontent.com')) return [url];
  let fileId = '';
  const match1 = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match1) fileId = match1[1];
  const match2 = url.match(/open\?id=([a-zA-Z0-9_-]+)/);
  if (match2) fileId = match2[1];
  const match3 = url.match(/uc\?id=([a-zA-Z0-9_-]+)/);
  if (match3) fileId = match3[1];
  if (!fileId) return [url];
  return [
    'https://lh3.googleusercontent.com/d/' + fileId,
    'https://drive.google.com/uc?export=view&id=' + fileId,
    'https://drive.google.com/uc?id=' + fileId
  ];
}

// ===== MODAL ZOOM =====
function openZoomModal(imageUrl, caption) {
  const modal = document.getElementById('zoomModal');
  const img = document.getElementById('zoomImage');
  const loading = document.getElementById('zoomLoading');
  const cap = document.getElementById('zoomCaption');
  
  const formats = getZoomFormats(imageUrl);
  if (!formats || formats.length === 0) {
    showToast('URL foto tidak valid', 'error');
    return;
  }
  
  if (loading) loading.classList.remove('hidden');
  img.style.display = 'none';
  cap.innerText = '';
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  
  let formatIndex = 0;
  
  function tryNextFormat() {
    if (formatIndex >= formats.length) {
      if (loading) loading.classList.add('hidden');
      cap.innerText = '❌ Gagal memuat foto';
      return;
    }
    
    const testUrl = formats[formatIndex];
    
    img.onload = function() {
      if (loading) loading.classList.add('hidden');
      img.style.display = 'block';
      cap.innerText = caption || '';
    };
    
    img.onerror = function() {
      formatIndex++;
      tryNextFormat();
    };
    
    img.src = testUrl;
  }
  
  tryNextFormat();
}

function closeZoomModal() {
  const modal = document.getElementById('zoomModal');
  const img = document.getElementById('zoomImage');
  
  modal.classList.add('hidden');
  modal.classList.remove('flex');
  img.src = '';
  img.style.display = 'none';
}

// ===== KAMERA MODAL (PATROLI/KEJADIAN/IJIN) =====
function compressImage(file, maxWidth, quality) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target.result;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
    };
  });
}

document.getElementById('cameraInput').addEventListener('change', async function(e) {
  if (e.target.files && e.target.files[0]) {
    showLoading(true);
    capturedBase64 = await compressImage(e.target.files[0], 800, 0.7);
    const preview = document.getElementById('previewImage');
    preview.src = capturedBase64;
    preview.classList.remove('hidden');
    document.getElementById('btnSendPhoto').classList.remove('hidden');
    document.getElementById('cameraHint').classList.add('hidden');
    showLoading(false);
  }
});

function openCamera(action) {
  currentCameraAction = action;
  if (action === 'masuk' || action === 'pulang') {
    openCameraAbsen(action);
    return;
  }
  capturedBase64 = null;
  const modal = document.getElementById('cameraModal');
  const preview = document.getElementById('previewImage');
  const btnSend = document.getElementById('btnSendPhoto');
  const hint = document.getElementById('cameraHint');
  const cameraInput = document.getElementById('cameraInput');
  const title = document.getElementById('cameraTitle');
  const timemark = document.getElementById('cameraTimemark');
  
  preview.classList.add('hidden');
  btnSend.classList.add('hidden');
  hint.classList.remove('hidden');
  cameraInput.value = '';
  
  const titles = {
    'patroli1': 'Foto Patroli 1',
    'patroli2': 'Foto Patroli 2',
    'kejadian1': 'Bukti Kejadian 1',
    'kejadian2': 'Bukti Kejadian 2',
    'ijin': 'Bukti Surat/Undangan'
  };
  if (title) title.innerText = titles[action] || 'Ambil Foto';
  if (timemark) {
    const now = new Date();
    const pasaran = hitungHariPasaran();
    timemark.innerText = '📍 ' + (selectedLokasi ? selectedLokasi.nama_lokasi : '-') + ' | ⏰ ' + now.toLocaleDateString('id-ID') + ' (' + pasaran + ') ' + now.toLocaleTimeString('id-ID');
  }
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeCamera() {
  document.getElementById('cameraModal').classList.add('hidden');
  document.getElementById('cameraModal').classList.remove('flex');
}

async function sendPhoto() {
  if (!capturedBase64) {
    showToast('Tidak ada foto!', 'error');
    return;
  }
  
  // Tambahkan watermark timestamp pada foto
  showToast('Menambahkan watermark...', 'info');
  let watermarkedPhoto = capturedBase64;
  
  try {
    let label = '';
    if (currentCameraAction === 'patroli1' || currentCameraAction === 'patroli2') {
      label = '📍 PATROLI';
    } else if (currentCameraAction === 'kejadian1' || currentCameraAction === 'kejadian2') {
      label = '⚠️ KEJADIAN';
    } else if (currentCameraAction === 'ijin') {
      label = '📄 IJIN/SAKIT';
    }
    
    if (label) {
      watermarkedPhoto = await addTimestampWatermark(capturedBase64, label);
    }
  } catch (e) {
    console.error('Error adding watermark:', e);
    watermarkedPhoto = capturedBase64; // Fallback: gunakan foto tanpa watermark
  }
  
  closeCamera();
  
  if (currentCameraAction === 'patroli1') {
    patroliData.foto1 = watermarkedPhoto;
    updateBtn('btnPatroli1', '✅ Foto 1');
  } else if (currentCameraAction === 'patroli2') {
    patroliData.foto2 = watermarkedPhoto;
    updateBtn('btnPatroli2', '✅ Foto 2');
  } else if (currentCameraAction === 'kejadian1') {
    kejadianData.foto1 = watermarkedPhoto;
    updateBtn('btnKejadian1', '✅ Bukti 1');
  } else if (currentCameraAction === 'kejadian2') {
    kejadianData.foto2 = watermarkedPhoto;
    updateBtn('btnKejadian2', '✅ Bukti 2');
  } else if (currentCameraAction === 'ijin') {
    ijinData.foto = watermarkedPhoto;
    updateBtn('btnIjin', '✅ Bukti Terlampir');
  }
}

function updateBtn(id, text) {
  const btn = document.getElementById(id);
  btn.innerText = text;
  btn.classList.add('bg-green-100', 'border-green-400', 'text-green-700');
}

function resetBtn(id, text) {
  const btn = document.getElementById(id);
  btn.innerText = text;
  btn.classList.remove('bg-green-100', 'border-green-400', 'text-green-700');
}

// ===== WATERMARK TIMESTAMP YANG LEBIH PROFESIONAL =====
async function addTimestampWatermark(imageDataUrl, label) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = function() {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        const now = new Date();
        const tanggal = now.toLocaleDateString('id-ID', { 
          weekday: 'long', 
          day: '2-digit', 
          month: 'long', 
          year: 'numeric' 
        });
        const waktu = now.toLocaleTimeString('id-ID', { 
          hour: '2-digit', 
          minute: '2-digit', 
          second: '2-digit' 
        });
        const hariPasaran = hitungHariPasaranUser();
        
        // ===== PERHITUNGAN UKURAN FONT RESPONSIF =====
        const baseFontSize = Math.max(20, Math.floor(img.width * 0.04));
        const smallFontSize = Math.max(14, Math.floor(img.width * 0.028));
        const tinyFontSize = Math.max(11, Math.floor(img.width * 0.022));
        
        // ===== HITUNG TINGGI AREA WATERMARK =====
        const padding = Math.floor(img.width * 0.03);
        const lineHeight = baseFontSize * 1.4;
        const watermarkHeight = (lineHeight * 4) + (padding * 2);
        
        // ===== DRAW BACKGROUND WATERMARK =====
        // Gradient background untuk efek profesional
        const gradient = ctx.createLinearGradient(0, canvas.height - watermarkHeight, 0, canvas.height);
        gradient.addColorStop(0, 'rgba(0, 0, 0, 0.85)');
        gradient.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
        ctx.fillStyle = gradient;
        ctx.fillRect(0, canvas.height - watermarkHeight, canvas.width, watermarkHeight);
        
        // Garis aksen kuning di atas (seperti foto Anda)
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(0, canvas.height - watermarkHeight, canvas.width, 4);
        
        // ===== ICON & LABEL (PATROLI/KEJADIAN) =====
        ctx.fillStyle = '#fbbf24'; // Warna kuning/amber
        ctx.font = `bold ${baseFontSize}px Arial, sans-serif`;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        
        const iconText = label.includes('PATROLI') ? '📍' : '️';
        ctx.fillText(`${iconText} ${label}`, padding, canvas.height - watermarkHeight + padding);
        
        // ===== TANGGAL LENGKAP =====
        ctx.fillStyle = '#ffffff';
        ctx.font = `bold ${smallFontSize}px Arial, sans-serif`;
        ctx.fillText(tanggal, padding, canvas.height - watermarkHeight + padding + lineHeight);
        
        // ===== WAKTU & HARI PASARAN =====
        ctx.fillStyle = '#e5e7eb'; // Abu-abu terang
        ctx.font = `${smallFontSize}px Arial, sans-serif`;
        ctx.fillText(`${hariPasaran} • ${waktu}`, padding, canvas.height - watermarkHeight + padding + (lineHeight * 2));
        
        // ===== INFO GPS (jika ada) =====
        if (gps) {
          ctx.fillStyle = '#9ca3af'; // Abu-abu
          ctx.font = `${tinyFontSize}px Arial, sans-serif`;
          ctx.fillText(
            `📍 ${gps.lat.toFixed(5)}, ${gps.lng.toFixed(5)} (±${Math.round(gps.accuracy)}m)`,
            padding,
            canvas.height - watermarkHeight + padding + (lineHeight * 3)
          );
        }
        
        // ===== WATERMARK KANAN BAWAH (Timestamp kecil) =====
        const timestampText = now.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + waktu;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = `${tinyFontSize}px Arial, sans-serif`;
        ctx.textAlign = 'right';
        ctx.fillText(timestampText, canvas.width - padding, canvas.height - padding - tinyFontSize);
        
        resolve(canvas.toDataURL('image/jpeg', 0.92));
      } catch (e) {
        console.error('Watermark error:', e);
        resolve(imageDataUrl); // Fallback: kembalikan foto asli
      }
    };
    img.onerror = function() { resolve(imageDataUrl); };
    img.src = imageDataUrl;
  });
}

function hitungHariPasaranUser() {
  const pasaran = ['Legi', 'Pahing', 'Pon', 'Wage', 'Kliwon'];
  const referensi = new Date(1945, 7, 17);
  const sekarang = new Date();
  referensi.setHours(0, 0, 0, 0);
  sekarang.setHours(0, 0, 0, 0);
  const selisihHari = Math.round((sekarang.getTime() - referensi.getTime()) / (1000 * 60 * 60 * 24));
  return pasaran[((selisihHari % 5) + 5) % 5];
}

// ===== SUBMIT PATROLI =====
async function submitPatroliFinal() {
  const lokasi = document.getElementById('patroliLokasi').value.trim();
  const catatan = document.getElementById('patroliCatatan').value.trim();
  
  if (!lokasi || !catatan) {
    showToast('Lokasi dan keterangan wajib diisi!', 'warning');
    return;
  }
  
  if (!patroliData.foto1 && !patroliData.foto2) {
    showToast('Minimal 1 foto wajib diupload!', 'warning');
    return;
  }
  
  if (!currentUser || !currentUser.username) {
    showToast('Sesi login habis. Silakan login ulang.', 'error');
    return;
  }
  
  showToast('Mengirim laporan patroli...', 'info');
  showLoading(true);
  
  try {
    const payload = {
      action: 'patroli',
      username: currentUser.username,
      nama: currentUser.nama,
      id_lokasi: selectedLokasi ? selectedLokasi.id_lokasi : (currentUser.lokasi_default || 'LOK000'),
      nama_lokasi: selectedLokasi ? selectedLokasi.nama_lokasi : 'Lokasi Bebas',
      lokasi_patroli: lokasi,
      keterangan: catatan,
      latitude: gps ? gps.lat : 0,
      longitude: gps ? gps.lng : 0,
      foto1_base64: patroliData.foto1 || '',
      foto2_base64: patroliData.foto2 || '',
      timemark: new Date().toISOString()
    };
    
    console.log(" Mengirim Payload Patroli:", payload);
    
    const response = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    console.log(" Response Server:", result);
    
    if (result.status === 'success') {
      showToast('Laporan patroli berhasil dikirim!', 'success');
      backToAbsenMenu();
      
      // Reset Form
      document.getElementById('patroliLokasi').value = '';
      document.getElementById('patroliCatatan').value = '';
      patroliData.foto1 = '';
      patroliData.foto2 = '';
      const btn1 = document.getElementById('btnPatroli1');
      const btn2 = document.getElementById('btnPatroli2');
      btn1.innerHTML = ' Foto 1'; btn2.innerHTML = ' Foto 2';
      btn1.classList.remove('bg-green-100', 'border-green-400', 'text-green-700');
      btn2.classList.remove('bg-green-100', 'border-green-400', 'text-green-700');
    } else {
      showToast('Gagal: ' + result.message, 'error');
    }
  } catch (e) {
    console.error('❌ Error submit patroli:', e);
    showToast('Gagal koneksi: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

// ===== SUBMIT KEJADIAN =====
async function submitKejadianFinal() {
  const jenis = document.getElementById('kejadianJenis').value;
  const lokasi = document.getElementById('kejadianLokasi').value.trim();
  const kronologi = document.getElementById('kejadianKronologi').value.trim();
  
  if (!jenis || !lokasi || !kronologi) {
    showToast('Jenis, lokasi, dan kronologi wajib diisi!', 'warning');
    return;
  }
  
  if (!kejadianData.foto1 && !kejadianData.foto2) {
    showToast('Minimal 1 foto bukti wajib diupload!', 'warning');
    return;
  }
  
  if (!currentUser || !currentUser.username) {
    showToast('Sesi login habis. Silakan login ulang.', 'error');
    return;
  }
  
  showToast('Mengirim laporan kejadian...', 'info');
  showLoading(true);
  
  try {
    const payload = {
      action: 'kejadian',
      username: currentUser.username,
      nama: currentUser.nama,
      jenis_kejadian: jenis,
      lokasi_kejadian: lokasi,
      kronologi: kronologi,
      latitude: gps ? gps.lat : 0,
      longitude: gps ? gps.lng : 0,
      foto1_base64: kejadianData.foto1 || '',
      foto2_base64: kejadianData.foto2 || '',
      timemark: new Date().toISOString()
    };
    
    console.log("📤 Mengirim Payload Kejadian:", payload);
    
    const response = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    console.log("📥 Response Server:", result);
    
    if (result.status === 'success') {
      showToast('Laporan kejadian berhasil dikirim!', 'success');
      backToAbsenMenu();
      
      // Reset Form
      document.getElementById('kejadianJenis').value = '';
      document.getElementById('kejadianLokasi').value = '';
      document.getElementById('kejadianKronologi').value = '';
      kejadianData.foto1 = '';
      kejadianData.foto2 = '';
      const btn1 = document.getElementById('btnKejadian1');
      const btn2 = document.getElementById('btnKejadian2');
      btn1.innerHTML = '📷 Bukti 1'; btn2.innerHTML = '📷 Bukti 2';
      btn1.classList.remove('bg-green-100', 'border-green-400', 'text-green-700');
      btn2.classList.remove('bg-green-100', 'border-green-400', 'text-green-700');
    } else {
      showToast('Gagal: ' + result.message, 'error');
    }
  } catch (e) {
    console.error('❌ Error submit kejadian:', e);
    showToast('Gagal koneksi: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

// ===== SUBMIT IJIN =====
async function submitIjinFinal() {
  const jenis = document.getElementById('ijinJenis').value;
  const mulai = document.getElementById('ijinMulai').value;
  const selesai = document.getElementById('ijinSelesai').value;
  const keterangan = document.getElementById('ijinKet').value.trim();
  
  if (!jenis || !mulai || !selesai || !keterangan) {
    showToast('⚠️ Semua field wajib diisi!', 'warning');
    return;
  }
  
  if (!fotoIjin) {
    showToast('⚠️ Foto bukti wajib diupload!', 'warning');
    return;
  }
  
  // ===== NOTIFIKASI PROGRESS =====
  showToast('📸 Memproses watermark foto...', 'info');
  
  try {
    let fotoBase64 = await addTimestampWatermark(fotoIjin, '📄 ' + jenis);
    showToast('✅ Foto berhasil diproses!', 'success');
    
    showToast(' Mengajukan ' + jenis.toLowerCase() + '...', 'info');
    
    const res = await fetchGAS('ijinSakit', {
      action: 'ijinSakit',
      username: currentUser.username,
      nama: currentUser.nama,
      jenis: jenis,
      tanggal_mulai: mulai,
      tanggal_selesai: selesai,
      keterangan: keterangan,
      foto_base64: fotoBase64,
      timemark: new Date().toISOString()
    });
    
    if (res.status === 'success') {
      showToast(`✅ Pengajuan ${jenis.toLowerCase()} berhasil dikirim!`, 'success');
      
      // Reset form
      backToInfoMenu();
      document.getElementById('ijinJenis').value = 'SAKIT';
      document.getElementById('ijinMulai').value = '';
      document.getElementById('ijinSelesai').value = '';
      document.getElementById('ijinKet').value = '';
      fotoIjin = null;
      document.getElementById('btnIjin').innerHTML = '📷 Upload Bukti';
    } else {
      showToast(' Gagal: ' + res.message, 'error');
    }
  } catch (e) {
    console.error('Error submit ijin:', e);
    showToast('❌ Terjadi kesalahan: ' + e.message, 'error');
  }
}

// ===== SUBMIT TUKAR SHIFT =====
async function submitShiftFinal() {
  const tanggal = document.getElementById('shiftTanggal').value;
  const shiftLama = document.getElementById('shiftLama').value;
  const shiftBaru = document.getElementById('shiftBaru').value;
  const penggantiUser = document.getElementById('shiftPenggantiUser').value.trim();
  const penggantiNama = document.getElementById('shiftPenggantiNama').value.trim();
  const alasan = document.getElementById('shiftAlasan').value.trim();
  if (!tanggal || !penggantiUser || !penggantiNama || !alasan) return showToast('Harap lengkapi semua data!', 'warning');
  if (shiftLama === shiftBaru) return showToast('Shift lama dan baru tidak boleh sama!', 'warning');
  showLoading(true);
  const payload = {
    action: 'tukarShift',
    username_pemohon: currentUser.username,
    nama_pemohon: currentUser.nama,
    tanggal_tukar: tanggal,
    shift_lama: shiftLama,
    shift_baru: shiftBaru,
    username_pengganti: penggantiUser,
    nama_pengganti: penggantiNama,
    alasan: alasan
  };
  const res = await fetch(CONFIG.GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
  const result = await res.json();
  if (result.status === 'success') {
    showToast('Pengajuan tukar shift berhasil! Menunggu approval admin.', 'success');
    document.getElementById('shiftTanggal').value = '';
    document.getElementById('shiftPenggantiUser').value = '';
    document.getElementById('shiftPenggantiNama').value = '';
    document.getElementById('shiftAlasan').value = '';
    loadPengajuanUser();
  } else {
    showToast('Gagal: ' + result.message, 'error');
  }
  showLoading(false);
}

// ===== HANDLE FOTO PROFIL =====
async function handleFotoProfilChange(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  showLoading(true);
  
  try {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = async function(e) {
      const img = new Image();
      img.src = e.target.result;
      img.onload = async function() {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        const maxSize = 400;
        
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round((height * maxSize) / width);
            width = maxSize;
          } else {
            width = Math.round((width * maxSize) / height);
            height = maxSize;
          }
        }
        
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.8);
        
        const payload = {
          action: 'uploadFotoProfil',
          username: currentUser.username,
          foto_base64: compressedBase64
        };
        
        const response = await fetch(CONFIG.GAS_URL, {
          method: 'POST',
          body: JSON.stringify(payload)
        });
        
        const result = await response.json();
        
        if (result.status === 'success') {
          currentUser.foto_url = result.foto_url;
          localStorage.setItem('sbu_user', JSON.stringify(currentUser));
          updateAvatarDisplay(currentUser.foto_url, currentUser.nama, 'avatarTopImg', 'avatarTopText');
          updateAvatarDisplay(currentUser.foto_url, currentUser.nama, 'profilFotoImg', 'profilFotoText');
          showToast('Foto profil berhasil diupdate!', 'success');
        } else {
          showToast('Gagal: ' + result.message, 'error');
        }
        
        showLoading(false);
      };
    };
  } catch (err) {
    console.error('Error upload foto profil:', err);
    showToast('Gagal upload foto: ' + err.message, 'error');
    showLoading(false);
  }
  
  event.target.value = '';
}

// ===== MODAL EDIT PROFIL =====
function openModalEditProfil() {
  // Isi form dengan data saat ini
  document.getElementById('editNama').value = currentUser.nama || '';
  document.getElementById('editNik').value = currentUser.nik || '';
  document.getElementById('editRole').value = currentUser.role || 'satpam';
  
  const modal = document.getElementById('modalEditProfil');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeModalEditProfil() {
  const modal = document.getElementById('modalEditProfil');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function saveEditProfil() {
  const namaBaru = document.getElementById('editNama').value.trim();
  const nikBaru = document.getElementById('editNik').value.trim();
  const roleBaru = document.getElementById('editRole').value;
  
  if (!namaBaru) {
    showToast('Nama lengkap harus diisi!', 'warning');
    return;
  }
  
  if (!nikBaru) {
    showToast('NIK harus diisi!', 'warning');
    return;
  }
  
  showLoading(true);
  
  try {
    const payload = {
      action: 'updateProfilUser',
      username: currentUser.username,
      nama_lengkap: namaBaru,
      nik: nikBaru,
      role: roleBaru
    };
    
    const response = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (result.status === 'success') {
      // Update data user di localStorage dan variabel
      currentUser.nama = namaBaru;
      currentUser.nik = nikBaru;
      currentUser.role = roleBaru;
      currentUser.avatar = String(namaBaru).substring(0, 2).toUpperCase();
      localStorage.setItem('sbu_user', JSON.stringify(currentUser));
      
      // Update tampilan
      document.getElementById('profilNama').innerText = namaBaru;
      document.getElementById('profilNamaHeader').innerText = namaBaru;
      document.getElementById('profilNik').innerText = nikBaru;
      document.getElementById('profilRole').innerText = roleBaru.toUpperCase();
      document.getElementById('profilRoleHeader').innerText = roleBaru.toUpperCase();
      document.getElementById('namaTop').innerText = namaBaru;
      
      // Update avatar text jika tidak ada foto
      const avatarText = document.getElementById('avatarTopText');
      const profilText = document.getElementById('profilFotoText');
      if (avatarText && !document.getElementById('avatarTopImg').classList.contains('hidden') === false) {
        avatarText.innerText = currentUser.avatar;
      }
      if (profilText && !document.getElementById('profilFotoImg').classList.contains('hidden') === false) {
        profilText.innerText = currentUser.avatar;
      }
      
      closeModalEditProfil();
      showToast('✅ Info pribadi berhasil diupdate!', 'success');
    } else {
      showToast('❌ Gagal: ' + result.message, 'error');
    }
  } catch (e) {
    console.error('Error update profil:', e);
    showToast('❌ Koneksi gagal: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

// ===== MODAL EDIT KONTAK =====
function openModalEditKontak() {
  document.getElementById('editAlamat').value = currentUser.alamat || '';
  document.getElementById('editTlp').value = currentUser.no_tlp || '';
  document.getElementById('editEmail').value = currentUser.email || '';
  
  const modal = document.getElementById('modalEditKontak');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeModalEditKontak() {
  const modal = document.getElementById('modalEditKontak');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

async function saveEditKontak() {
  const alamatBaru = document.getElementById('editAlamat').value.trim();
  const tlpBaru = document.getElementById('editTlp').value.trim();
  const emailBaru = document.getElementById('editEmail').value.trim();
  
  if (!alamatBaru) {
    showToast('Alamat harus diisi!', 'warning');
    return;
  }
  
  if (!tlpBaru) {
    showToast('No. Telepon harus diisi!', 'warning');
    return;
  }
  
  // Validasi email sederhana
  if (emailBaru && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailBaru)) {
    showToast('Format email tidak valid!', 'warning');
    return;
  }
  
  showLoading(true);
  
  try {
    const payload = {
      action: 'updateProfilUser',
      username: currentUser.username,
      alamat: alamatBaru,
      no_tlp: tlpBaru,
      email: emailBaru
    };
    
    const response = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (result.status === 'success') {
      // Update data user
      currentUser.alamat = alamatBaru;
      currentUser.no_tlp = tlpBaru;
      currentUser.email = emailBaru;
      localStorage.setItem('sbu_user', JSON.stringify(currentUser));
      
      // Update tampilan
      document.getElementById('profilAlamat').innerText = alamatBaru;
      document.getElementById('profilTlp').innerText = tlpBaru;
      document.getElementById('profilEmail').innerText = emailBaru;
      
      closeModalEditKontak();
      showToast('✅ Info kontak berhasil diupdate!', 'success');
    } else {
      showToast(' Gagal: ' + result.message, 'error');
    }
  } catch (e) {
    console.error('Error update kontak:', e);
    showToast('❌ Koneksi gagal: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

// ===== MODAL GANTI PASSWORD =====
function openModalGantiPassword() {
  document.getElementById('passLama').value = '';
  document.getElementById('passBaru').value = '';
  document.getElementById('passKonfirmasi').value = '';
  
  // Reset icon mata ke kondisi tertutup
  document.getElementById('eyePassLama').className = 'fa-solid fa-eye text-sm';
  document.getElementById('eyePassBaru').className = 'fa-solid fa-eye text-sm';
  document.getElementById('eyePassKonfirmasi').className = 'fa-solid fa-eye text-sm';
  
  // Reset type ke password
  document.getElementById('passLama').type = 'password';
  document.getElementById('passBaru').type = 'password';
  document.getElementById('passKonfirmasi').type = 'password';
  
  const modal = document.getElementById('modalGantiPassword');
  modal.classList.remove('hidden');
  modal.classList.add('flex');
}

function closeModalGantiPassword() {
  const modal = document.getElementById('modalGantiPassword');
  modal.classList.add('hidden');
  modal.classList.remove('flex');
}

// Toggle password visibility di modal
function toggleModalPassword(inputId, iconId) {
  const input = document.getElementById(inputId);
  const icon = document.getElementById(iconId);
  
  if (input.type === 'password') {
    input.type = 'text';
    icon.className = 'fa-solid fa-eye-slash text-sm';
  } else {
    input.type = 'password';
    icon.className = 'fa-solid fa-eye text-sm';
  }
}

async function saveGantiPassword() {
  const passLama = document.getElementById('passLama').value;
  const passBaru = document.getElementById('passBaru').value;
  const passKonfirmasi = document.getElementById('passKonfirmasi').value;
  
  // Validasi
  if (!passLama) {
    showToast('Password lama harus diisi!', 'warning');
    return;
  }
  
  if (!passBaru) {
    showToast('Password baru harus diisi!', 'warning');
    return;
  }
  
  if (passBaru.length < 6) {
    showToast('Password baru minimal 6 karakter!', 'warning');
    return;
  }
  
  if (passBaru !== passKonfirmasi) {
    showToast('Konfirmasi password tidak cocok!', 'warning');
    return;
  }
  
  if (passLama === passBaru) {
    showToast('Password baru harus berbeda dengan password lama!', 'warning');
    return;
  }
  
  showLoading(true);
  
  try {
    const payload = {
      action: 'gantiPassword',
      username: currentUser.username,
      password_lama: passLama,
      password_baru: passBaru
    };
    
    const response = await fetch(CONFIG.GAS_URL, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    
    const result = await response.json();
    
    if (result.status === 'success') {
      closeModalGantiPassword();
      showToast('✅ Password berhasil diganti!', 'success');
    } else {
      showToast('❌ ' + result.message, 'error');
    }
  } catch (e) {
    console.error('Error ganti password:', e);
    showToast('❌ Koneksi gagal: ' + e.message, 'error');
  } finally {
    showLoading(false);
  }
}

// ===== RIWAYAT PENGAJUAN =====
async function loadPengajuanUser() {
  if (!currentUser) return;
  try {
    const res = await fetch(CONFIG.GAS_URL + '?action=getPengajuanUser&username=' + currentUser.username);
    const result = await res.json();
    if (result.status !== 'success') return;
    const data = result.data;
    const listEl = document.getElementById('listPengajuan');
    const allPengajuan = [];
    if (data.ijin && data.ijin.length > 0) data.ijin.forEach(p => allPengajuan.push({ type: 'IJIN', ...p }));
    if (data.shift && data.shift.length > 0) data.shift.forEach(p => allPengajuan.push({ type: 'SHIFT', ...p }));
    allPengajuan.reverse();
    if (allPengajuan.length === 0) {
      showEmptyState('listPengajuan', 'fa-solid fa-inbox', 'Belum Ada Pengajuan', 'Pengajuan Anda akan muncul di sini');
    } else {
      listEl.innerHTML = allPengajuan.map(p => {
        let statusColor = p.status === 'PENDING' ? 'bg-amber-100 text-amber-700' : p.status === 'APPROVED' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700';
        let statusIcon = p.status === 'PENDING' ? '⏳' : p.status === 'APPROVED' ? '✅' : '❌';
        if (p.type === 'IJIN') {
          return '<div class="bg-slate-50 dark:bg-slate-700 p-3 rounded-xl border border-slate-200 dark:border-slate-600"><div class="flex justify-between items-start mb-1"><p class="font-bold text-xs text-blue-600"><i class="fa-solid fa-file-medical"></i> ' + p.jenis + '</p><span class="px-2 py-0.5 rounded-full text-[9px] font-bold ' + statusColor + '">' + statusIcon + ' ' + p.status + '</span></div><p class="text-[10px] text-slate-600 dark:text-slate-300">📅 ' + p.tanggal_mulai + ' s/d ' + p.tanggal_selesai + '</p><p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">💬 ' + (p.keterangan || '-') + '</p></div>';
        } else {
          return '<div class="bg-slate-50 dark:bg-slate-700 p-3 rounded-xl border border-slate-200 dark:border-slate-600"><div class="flex justify-between items-start mb-1"><p class="font-bold text-xs text-purple-600"><i class="fa-solid fa-right-left"></i> Tukar Shift</p><span class="px-2 py-0.5 rounded-full text-[9px] font-bold ' + statusColor + '">' + statusIcon + ' ' + p.status + '</span></div><p class="text-[10px] text-slate-600 dark:text-slate-300">📅 ' + p.tanggal + ' | ' + p.shift_lama + ' → ' + p.shift_baru + '</p><p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">👤 Pengganti: ' + p.pengganti + '</p></div>';
        }
      }).join('');
    }
  } catch (e) {
    console.error('Gagal load pengajuan:', e);
  }
}

// ===== SLIP GAJI =====
async function loadSlipGaji() {
  try {
    const res = await fetch(CONFIG.GAS_URL + '?action=getSlipGaji&username=' + currentUser.username);
    const result = await res.json();
    const list = document.getElementById('listSlipGaji');
    if (result.status === 'success' && result.data.length > 0) {
      list.innerHTML = result.data.map(s => '<div class="flex justify-between items-center bg-slate-50 dark:bg-slate-700 p-3 rounded-xl border border-slate-200 dark:border-slate-600"><div><p class="font-bold text-sm">' + s.periode + '</p><p class="text-[10px] text-slate-500 dark:text-slate-400">Total: Rp ' + Number(s.total).toLocaleString('id-ID') + '</p></div><a href="' + s.file_url + '" target="_blank" class="bg-blue-600 text-white px-3 py-1.5 rounded-lg text-[10px] font-bold">LIHAT</a></div>').join('');
    } else {
      showEmptyState('listSlipGaji', 'fa-solid fa-money-bill-wave', 'Belum Ada Slip Gaji', 'Slip gaji Anda akan muncul di sini');
    }
  } catch (e) {
    console.error(e);
  }
}

// ===== STATISTIK PROFIL =====
async function loadStatistikProfil() {
  if (!currentUser || !currentUser.username) return;
  
  try {
    const url = CONFIG.GAS_URL + '?action=getStatistik&username=' + encodeURIComponent(currentUser.username.trim().toLowerCase()) + '&t=' + Date.now();
    const res = await fetch(url);
    const result = await res.json();
    
    if (result.status === 'success' && result.data) {
      document.getElementById('statAbsenBulan').innerText = result.data.totalAbsen || 0;
      document.getElementById('statPatroliBulan').innerText = result.data.totalPatroli || 0;
      document.getElementById('statKejadianBulan').innerText = result.data.totalKejadian || 0;
    }
  } catch (e) {
    console.error('Error load statistik:', e);
  }
}

// ===== SKELETON LOADING =====
function showSkeleton(containerId, rows = 3) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  let skeleton = '';
  for (let i = 0; i < rows; i++) {
    skeleton += `
      <div class="bg-slate-50 dark:bg-slate-700 p-3 rounded-xl border border-slate-200 dark:border-slate-600 animate-pulse">
        <div class="flex items-center gap-3 mb-2">
          <div class="w-10 h-10 rounded-lg skeleton"></div>
          <div class="flex-1">
            <div class="h-3 skeleton rounded w-3/4 mb-1"></div>
            <div class="h-2 skeleton rounded w-1/2"></div>
          </div>
        </div>
        <div class="h-2 skeleton rounded w-full mb-1"></div>
        <div class="h-2 skeleton rounded w-2/3"></div>
      </div>
    `;
  }
  container.innerHTML = skeleton;
}

// ===== EMPTY STATE =====
function showEmptyState(containerId, icon, title, message) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = `
    <div class="flex flex-col items-center justify-center py-10 text-center">
      <div class="w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mb-3">
        <i class="${icon} text-3xl text-slate-400"></i>
      </div>
      <p class="font-bold text-slate-700 dark:text-slate-200 text-sm mb-1">${title}</p>
      <p class="text-xs text-slate-500 dark:text-slate-400 max-w-[200px]">${message}</p>
    </div>
  `;
}

// ===== REKAP ABSENSI =====
let rekapDataGlobal = {};

async function loadRekapAbsensi() {
  if (!currentUser) return;
  const bulan = document.getElementById('rekapBulan').value;
  const bulanAktif = bulan || (() => {
    const now = new Date();
    return now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0');
  })();
  if (!bulan) document.getElementById('rekapBulan').value = bulanAktif;
  const [tahun, bln] = bulanAktif.split('-').map(Number);
  const now = new Date();
  const bulanSudahLewat = (tahun < now.getFullYear()) || (tahun === now.getFullYear() && bln < now.getMonth() + 1);
  
  showSkeleton('tabelDetailHarian', 3);
  
  try {
    const resAbsen = await fetch(CONFIG.GAS_URL + '?action=getRekap&username=' + currentUser.username + '&bulan=' + bulanAktif);
    const resultAbsen = await resAbsen.json();
    const resIjin = await fetch(CONFIG.GAS_URL + '?action=getPengajuanUser&username=' + currentUser.username);
    const resultIjin = await resIjin.json();
    const absenList = (resultAbsen.status === 'success' && resultAbsen.data) ? resultAbsen.data : [];
    const ijinList = (resultIjin.status === 'success' && resultIjin.data && resultIjin.data.ijin) ? resultIjin.data.ijin.filter(i => {
      if (i.status !== 'APPROVED') return false;
      const t = new Date(i.tanggal_mulai);
      return t.getFullYear() === tahun && (t.getMonth() + 1) === bln;
    }) : [];
    const grouped = {};
    absenList.forEach(a => {
      const tgl = new Date(a.timestamp);
      const key = tgl.getFullYear() + '-' + String(tgl.getMonth() + 1).padStart(2, '0') + '-' + String(tgl.getDate()).padStart(2, '0');
      if (!grouped[key]) grouped[key] = { masuk: null, pulang: null, lokasi: a.lokasi, timestamp: a.timestamp };
      if (a.jenis === 'MASUK' && !grouped[key].masuk) grouped[key].masuk = { jam: tgl.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), foto: a.foto };
      if (a.jenis === 'PULANG' && !grouped[key].pulang) grouped[key].pulang = { jam: tgl.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }), foto: a.foto };
    });
    rekapDataGlobal = { grouped, ijinList, tahun, bln, bulanSudahLewat };
    const hariKerja = getHariKerjaBulan(tahun, bln);
    const hariDenganAbsen = Object.keys(grouped).length;
    const hariIjin = ijinList.length;
    let alphaCount = '-';
    let infoAlphaText = '* Alpha dihitung otomatis di akhir bulan';
    if (bulanSudahLewat) {
      alphaCount = Math.max(0, hariKerja - hariDenganAbsen - hariIjin);
      infoAlphaText = '✓ Alpha bulan ' + ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Ags','Sep','Okt','Nov','Des'][bln-1] + ' ' + tahun + ': ' + alphaCount + ' hari';
    } else if (tahun === now.getFullYear() && bln === now.getMonth() + 1) {
      infoAlphaText = '⏳ Bulan berjalan - Alpha akan dihitung di akhir bulan';
    }
    document.getElementById('statHadir').innerText = hariDenganAbsen;
    document.getElementById('statIjin').innerText = hariIjin;
    document.getElementById('statSakit').innerText = '0';
    document.getElementById('statAlpha').innerText = alphaCount;
    document.getElementById('infoAlpha').innerText = infoAlphaText;
    renderKalender(tahun, bln, grouped, ijinList);
    renderDetailHarian(grouped, ijinList, null);
  } catch (e) {
    console.error('Gagal load rekap:', e);
  }
}

function renderKalender(tahun, bln, grouped, ijinList) {
  const gridEl = document.getElementById('kalenderGrid');
  const firstDay = new Date(tahun, bln - 1, 1);
  const daysInMonth = new Date(tahun, bln, 0).getDate();
  let offset = firstDay.getDay() - 1;
  if (offset < 0) offset = 6;
  const todayStr = new Date().getFullYear() + '-' + String(new Date().getMonth() + 1).padStart(2, '0') + '-' + String(new Date().getDate()).padStart(2, '0');
  let html = '';
  for (let i = 0; i < offset; i++) html += '<div class="h-11"></div>';
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = tahun + '-' + String(bln).padStart(2, '0') + '-' + String(d).padStart(2, '0');
    const data = grouped[dateStr];
    const adaIjin = ijinList.some(i => {
      const mulai = new Date(i.tanggal_mulai);
      const selesai = new Date(i.tanggal_selesai);
      const cur = new Date(tahun, bln - 1, d);
      return cur >= mulai && cur <= selesai;
    });
    let bgClass = 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200';
    let borderClass = '';
    if (adaIjin) bgClass = 'bg-orange-200 dark:bg-orange-900/50 text-orange-800 dark:text-orange-200';
    else if (data) {
      if (data.masuk && data.pulang) bgClass = 'bg-green-200 dark:bg-green-900/50 text-green-800 dark:text-green-200';
      else bgClass = 'bg-yellow-200 dark:bg-yellow-900/50 text-yellow-800 dark:text-yellow-200';
    }
    if (dateStr === todayStr) borderClass = 'border-2 border-blue-500';
    html += '<div onclick="pilihTanggalKalender(\'' + dateStr + '\')" class="h-11 rounded-lg flex items-center justify-center text-sm font-bold cursor-pointer hover:scale-105 transition active:scale-95 ' + bgClass + ' ' + borderClass + '">' + d + '</div>';
  }
  gridEl.innerHTML = html;
}

function pilihTanggalKalender(dateStr) {
  renderDetailHarian(rekapDataGlobal.grouped, rekapDataGlobal.ijinList, dateStr);
}

function renderDetailHarian(grouped, ijinList, filterTanggal) {
  const tabelEl = document.getElementById('tabelDetailHarian');
  const sortedKeys = Object.keys(grouped).sort((a, b) => b.localeCompare(a));
  const displayKeys = filterTanggal ? [filterTanggal] : sortedKeys;
  if (displayKeys.length === 0) {
    showEmptyState('tabelDetailHarian', 'fa-solid fa-calendar-xmark', 'Tidak Ada Data', 'Pilih tanggal di kalender untuk melihat detail');
    return;
  }
  tabelEl.innerHTML = displayKeys.map(key => {
    const d = new Date(key);
    const tglStr = String(d.getDate()).padStart(2, '0') + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + d.getFullYear();
    const data = grouped[key];
    const adaIjin = ijinList.some(i => {
      const mulai = new Date(i.tanggal_mulai);
      const selesai = new Date(i.tanggal_selesai);
      return d >= mulai && d <= selesai;
    });
    let statusBadge = '';
    if (adaIjin) statusBadge = '<span class="bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-200 px-2.5 py-1 rounded-full text-xs font-bold">Izin</span>';
    else if (data && data.masuk && data.pulang) statusBadge = '<span class="bg-green-100 dark:bg-green-900/50 text-green-700 dark:text-green-200 px-2.5 py-1 rounded-full text-xs font-bold">Lengkap</span>';
    else if (data && (data.masuk || data.pulang)) statusBadge = '<span class="bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-200 px-2.5 py-1 rounded-full text-xs font-bold">Tdk Lengkap</span>';
    else statusBadge = '<span class="bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-200 px-2.5 py-1 rounded-full text-xs font-bold">Alpha</span>';
    const masukCell = data && data.masuk ? '<a href="' + (data.masuk.foto || '#') + '" target="_blank" class="inline-flex items-center gap-1 text-green-600 font-bold text-xs"><i class="fa-solid fa-arrow-right-to-bracket text-xs"></i> ' + data.masuk.jam + '</a>' : '<span class="text-slate-300">-</span>';
    const pulangCell = data && data.pulang ? '<a href="' + (data.pulang.foto || '#') + '" target="_blank" class="inline-flex items-center gap-1 text-red-600 font-bold text-xs"><i class="fa-solid fa-arrow-right-from-bracket text-xs"></i> ' + data.pulang.jam + '</a>' : '<span class="text-slate-300">-</span>';
    return '<tr class="border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 transition"><td class="py-2 px-2 font-bold text-slate-700 dark:text-slate-200 text-xs">' + tglStr + '</td><td class="py-2 px-2 text-center">' + masukCell + '</td><td class="py-2 px-2 text-center">' + pulangCell + '</td><td class="py-2 px-2 text-center">' + statusBadge + '</td></tr>';
  }).join('');
}

function getHariKerjaBulan(tahun, bulan) {
  let count = 0;
  const daysInMonth = new Date(tahun, bulan, 0).getDate();
  for (let d = 1; d <= daysInMonth; d++) {
    if (new Date(tahun, bulan - 1, d).getDay() !== 0) count++;
  }
  return count;
}

// ===== REKAP PATROLI =====
async function loadRekapPatroli() {
  const filterBulan = document.getElementById('filterBulanPatroli').value;
  const listEl = document.getElementById('listRekapPatroli');
  
  showSkeleton('listRekapPatroli', 3);
  
  try {
    const res = await fetch(CONFIG.GAS_URL + '?action=getRekapPatroli&bulan=' + filterBulan + '&t=' + Date.now());
    const result = await res.json();
    
    if (result.status !== 'success') {
      listEl.innerHTML = '<p class="text-center text-slate-400 text-xs py-4">Gagal memuat data.</p>';
      return;
    }
    
    const data = result.data || [];
    const total = result.total || 0;
    const bulanIni = result.bulanIni || 0;
    
    document.getElementById('statTotalPatroli').innerText = total;
    document.getElementById('statPatroliBulanIni').innerText = bulanIni;
    
    if (data.length === 0) {
      showEmptyState('listRekapPatroli', 'fa-solid fa-route', 'Belum Ada Patroli', 'Mulai catat patroli pertamamu hari ini!');
      return;
    }
    
    listEl.innerHTML = data.map(p => {
      const tgl = new Date(p.timestamp);
      const tglStr = tgl.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
      const jamStr = tgl.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      
      const foto1ThumbUrl = getThumbnailUrl(p.foto1);
      const foto2ThumbUrl = getThumbnailUrl(p.foto2);
      
      const foto1Html = foto1ThumbUrl ? 
        `<img src="${foto1ThumbUrl}" onerror="this.parentElement.style.display='none'" onclick="openZoomModal('${p.foto1}', 'Foto 1 - ${p.lokasi_patroli || ''}')" class="w-16 h-16 rounded-lg object-cover border-2 border-slate-200 dark:border-slate-600 cursor-pointer active:scale-95 transition">` : '';
      
      const foto2Html = foto2ThumbUrl ? 
        `<img src="${foto2ThumbUrl}" onerror="this.parentElement.style.display='none'" onclick="openZoomModal('${p.foto2}', 'Foto 2 - ${p.lokasi_patroli || ''}')" class="w-16 h-16 rounded-lg object-cover border-2 border-slate-200 dark:border-slate-600 cursor-pointer active:scale-95 transition">` : '';
      
      return `
        <div class="bg-slate-50 dark:bg-slate-700 p-3 rounded-xl border border-slate-200 dark:border-slate-600">
          <div class="flex justify-between items-start mb-2">
            <div class="flex-1">
              <p class="font-bold text-xs text-amber-600"><i class="fa-solid fa-route"></i> ${p.lokasi_patroli || '-'}</p>
              <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">👤 <b>${p.nama_user || p.username}</b> •  ${tglStr} • ⏰ ${jamStr}</p>
            </div>
          </div>
          <p class="text-[10px] text-slate-600 dark:text-slate-300 mb-1"> ${p.nama_lokasi || '-'}</p>
          <p class="text-[10px] text-slate-500 dark:text-slate-400 mb-2">💬 ${p.keterangan || 'Tidak ada keterangan'}</p>
          ${(foto1Html || foto2Html) ? '<div class="flex gap-2">' + foto1Html + foto2Html + '</div>' : ''}
        </div>
      `;
    }).join('');
    
  } catch (e) {
    console.error('Gagal load rekap patroli:', e);
    listEl.innerHTML = '<p class="text-center text-red-400 text-xs py-4">Error: ' + e.message + '</p>';
  }
}

// ===== REKAP KEJADIAN =====
async function loadRekapKejadian() {
  const filterBulan = document.getElementById('filterBulanKejadian').value;
  const listEl = document.getElementById('listRekapKejadian');
  
  showSkeleton('listRekapKejadian', 3);
  
  try {
    const res = await fetch(CONFIG.GAS_URL + '?action=getRekapKejadian&bulan=' + filterBulan + '&t=' + Date.now());
    const result = await res.json();
    
    if (result.status !== 'success') {
      listEl.innerHTML = '<p class="text-center text-slate-400 text-xs py-4">Gagal memuat data.</p>';
      return;
    }
    
    const data = result.data || [];
    const total = result.total || 0;
    const bulanIni = result.bulanIni || 0;
    
    document.getElementById('statTotalKejadian').innerText = total;
    document.getElementById('statKejadianBulanIni').innerText = bulanIni;
    
    if (data.length === 0) {
      showEmptyState('listRekapKejadian', 'fa-solid fa-triangle-exclamation', 'Belum Ada Kejadian', 'Tidak ada kejadian yang dilaporkan');
      return;
    }
    
    listEl.innerHTML = data.map(k => {
      const tgl = new Date(k.timestamp);
      const tglStr = tgl.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
      const jamStr = tgl.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      
      const statusColor = k.status === 'OPEN' ? 'bg-amber-100 text-amber-700' : 
                          k.status === 'CLOSED' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700';
      
      const foto1ThumbUrl = getThumbnailUrl(k.foto1);
      const foto2ThumbUrl = getThumbnailUrl(k.foto2);
      
      const foto1Html = foto1ThumbUrl ? 
        `<img src="${foto1ThumbUrl}" onerror="this.parentElement.style.display='none'" onclick="openZoomModal('${k.foto1}', 'Bukti 1 - ${k.jenis_kejadian || ''}')" class="w-16 h-16 rounded-lg object-cover border-2 border-red-200 dark:border-red-800 cursor-pointer active:scale-95 transition">` : '';
      
      const foto2Html = foto2ThumbUrl ? 
        `<img src="${foto2ThumbUrl}" onerror="this.parentElement.style.display='none'" onclick="openZoomModal('${k.foto2}', 'Bukti 2 - ${k.jenis_kejadian || ''}')" class="w-16 h-16 rounded-lg object-cover border-2 border-red-200 dark:border-red-800 cursor-pointer active:scale-95 transition">` : '';
      
      return `
        <div class="bg-slate-50 dark:bg-slate-700 p-3 rounded-xl border border-slate-200 dark:border-slate-600">
          <div class="flex justify-between items-start mb-2">
            <div class="flex-1">
              <p class="font-bold text-xs text-red-600"><i class="fa-solid fa-triangle-exclamation"></i> ${k.jenis_kejadian || '-'}</p>
              <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">👤 <b>${k.nama_user || k.username}</b> • 📅 ${tglStr} • ⏰ ${jamStr}</p>
            </div>
            <span class="px-2 py-0.5 rounded-full text-[9px] font-bold ${statusColor}">${k.status || 'OPEN'}</span>
          </div>
          <p class="text-[10px] text-slate-600 dark:text-slate-300 mb-1">📍 ${k.lokasi_kejadian || '-'}</p>
          <p class="text-[10px] text-slate-500 dark:text-slate-400 mb-2"> ${k.kronologi || 'Tidak ada kronologi'}</p>
          ${(foto1Html || foto2Html) ? '<div class="flex gap-2">' + foto1Html + foto2Html + '</div>' : ''}
        </div>
      `;
    }).join('');
    
  } catch (e) {
    console.error('Gagal load rekap kejadian:', e);
    listEl.innerHTML = '<p class="text-center text-red-400 text-xs py-4">Error: ' + e.message + '</p>';
  }
}

// ===== NAVIGASI INFO =====
function showInfoSub(subName) {
  document.getElementById('info-menu-utama').classList.add('hidden');
  document.querySelectorAll('[id^="info-sub-"]').forEach(el => el.classList.add('hidden'));
  const subEl = document.getElementById('info-sub-' + subName);
  if (subEl) subEl.classList.remove('hidden');
  
  if (subName === 'rekap') loadRekapAbsensi();
  if (subName === 'patroli') loadRekapPatroli();
  if (subName === 'kejadian') loadRekapKejadian();
  if (subName === 'riwayat') loadPengajuanUser();
  if (subName === 'gaji') loadSlipGaji();
}

function backToInfoMenu() {
  document.querySelectorAll('[id^="info-sub-"]').forEach(el => el.classList.add('hidden'));
  document.getElementById('info-menu-utama').classList.remove('hidden');
}

// ===== NAVIGASI SUB-PAGE PATROLI & KEJADIAN =====
function openSubPatroli() {
  document.querySelectorAll('#tab-absen > div:not(#sub-patroli):not(#sub-kejadian)').forEach(el => {
    if (el.id !== 'sub-patroli' && el.id !== 'sub-kejadian') {
      el.classList.add('hidden');
    }
  });
  document.getElementById('sub-patroli').classList.remove('hidden');
}

function openSubKejadian() {
  document.querySelectorAll('#tab-absen > div:not(#sub-patroli):not(#sub-kejadian)').forEach(el => {
    if (el.id !== 'sub-patroli' && el.id !== 'sub-kejadian') {
      el.classList.add('hidden');
    }
  });
  document.getElementById('sub-kejadian').classList.remove('hidden');
}

function backToAbsenMenu() {
  document.getElementById('sub-patroli').classList.add('hidden');
  document.getElementById('sub-kejadian').classList.add('hidden');
  
  document.querySelectorAll('#tab-absen > div').forEach(el => {
    if (el.id !== 'sub-patroli' && el.id !== 'sub-kejadian') {
      el.classList.remove('hidden');
    }
  });
}

// ===== BADGE NOTIFIKASI =====
async function checkNotifications() {
  if (!currentUser) return;
  
  try {
    const res = await fetch(CONFIG.GAS_URL + '?action=getPengajuanUser&username=' + currentUser.username + '&t=' + Date.now());
    const result = await res.json();
    
    if (result.status !== 'success') return;
    
    let newCount = 0;
    const allPengajuan = [];
    if (result.data.ijin) allPengajuan.push(...result.data.ijin);
    if (result.data.shift) allPengajuan.push(...result.data.shift);
    
    allPengajuan.forEach(p => {
      if (p.status === 'APPROVED' || p.status === 'REJECTED') {
        newCount++;
      }
    });
    
    const badge = document.getElementById('infoBadge');
    if (badge) {
      if (newCount > 0) {
        badge.innerText = newCount > 99 ? '99+' : newCount;
        badge.classList.remove('hidden');
        badge.classList.add('badge-bounce');
      } else {
        badge.classList.add('hidden');
      }
    }
    
    notificationCount = newCount;
    
  } catch (e) {
    console.error('Error check notifications:', e);
  }
}

function clearNotificationBadge() {
  const badge = document.getElementById('infoBadge');
  if (badge) {
    badge.classList.add('hidden');
  }
  notificationCount = 0;
  localStorage.setItem('sbu_last_notif_check', Date.now().toString());
}

// ===== TOGGLE PASSWORD VISIBILITY =====
function togglePassword() {
  const passInput = document.getElementById('inpPass');
  const eyeIcon = document.getElementById('eyeIcon');
  
  if (passInput.type === 'password') {
    passInput.type = 'text';
    eyeIcon.className = 'fa-solid fa-eye-slash text-sm';
  } else {
    passInput.type = 'password';
    eyeIcon.className = 'fa-solid fa-eye text-sm';
  }
}

// ===== NAVIGASI TAB =====
function setTab(t, btnElement) {
  document.querySelectorAll('[id^="tab-"]').forEach(e => e.classList.add('hidden'));
  document.getElementById('tab-' + t).classList.remove('hidden');
  
  document.querySelectorAll('.navBtn').forEach(btn => {
    btn.className = 'navBtn flex-1 h-14 bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 rounded-2xl text-[10px] font-bold transition-all duration-200 flex flex-col items-center justify-center gap-1';
  });
  
  if (btnElement) {
    btnElement.className = 'navBtn flex-1 h-14 bg-slate-900 dark:bg-slate-700 text-white rounded-2xl text-[10px] font-bold transition-all duration-200 flex flex-col items-center justify-center gap-1 shadow-lg -translate-y-1';
  }
  
  if (t === 'info') {
    backToInfoMenu();
    clearNotificationBadge();
  }
  if (t === 'profil') {
    document.getElementById('profilNamaHeader').innerText = currentUser.nama;
    document.getElementById('profilRoleHeader').innerText = currentUser.role.toUpperCase();
    document.getElementById('profilNama').innerText = currentUser.nama;
    document.getElementById('profilUsername').innerText = currentUser.username;
    document.getElementById('profilNik').innerText = currentUser.nik || '-';
    document.getElementById('profilRole').innerText = currentUser.role.toUpperCase();
    document.getElementById('profilAlamat').innerText = currentUser.alamat || '-';
    document.getElementById('profilTlp').innerText = currentUser.no_tlp || '-';
    document.getElementById('profilEmail').innerText = currentUser.email || '-';
    document.getElementById('profilLokasi').innerText = selectedLokasi ? selectedLokasi.nama_lokasi : '-';
    updateAvatarDisplay(currentUser.foto_url, currentUser.nama, 'profilFotoImg', 'profilFotoText');
    loadStatistikProfil();
  }
}

function kembaliKePilihLokasi() {
  showCustomConfirm(
    'Ganti Lokasi Kerja',
    'Yakin ingin mengganti lokasi kerja?',
    'Anda akan kembali ke halaman pilih lokasi.',
    function() {
      console.log('✅ User konfirmasi ganti lokasi');
      
      // Hapus data lokasi & status absen
      localStorage.removeItem('sbu_lokasi');
      localStorage.removeItem('sbu_absen_status');
      
      // Reset variabel global
      selectedLokasi = null;
      
      // Sembunyikan screen utama
      const screenMain = document.getElementById('screen-main');
      if (screenMain) {
        screenMain.classList.add('hidden');
        screenMain.classList.remove('flex');
      }
      
      // Tampilkan screen pilih lokasi
      const screenLokasi = document.getElementById('screen-lokasi');
      if (screenLokasi) {
        screenLokasi.classList.remove('hidden');
        screenLokasi.classList.add('flex');
      }
      
      // Reset daftar lokasi
      const listLokasi = document.getElementById('listLokasi');
      if (listLokasi) {
        listLokasi.innerHTML = '<p class="text-center text-slate-500 text-sm w-full">Memuat lokasi...</p>';
      }
      
      // Load ulang daftar lokasi
      loadLokasi();
      
      showToast('Silakan pilih lokasi kerja baru', 'info');
    }
  );
}

function doLogout() {
  showCustomConfirm(
    'Keluar Aplikasi',
    'Yakin ingin keluar dari aplikasi?',
    'Anda harus login kembali untuk mengakses fitur.',
    function() {
      // Hapus data user & lokasi
      localStorage.removeItem('sbu_user');
      localStorage.removeItem('sbu_lokasi');
      localStorage.removeItem('sbu_absen_status');
      
      // Reset variabel global
      currentUser = null;
      selectedLokasi = null;
      
      // Sembunyikan semua screen
      const screenMain = document.getElementById('screen-main');
      const screenLokasi = document.getElementById('screen-lokasi');
      
      if (screenMain) {
        screenMain.classList.add('hidden');
        screenMain.classList.remove('flex');
      }
      if (screenLokasi) {
        screenLokasi.classList.add('hidden');
        screenLokasi.classList.remove('flex');
      }
      
      // Tampilkan screen login
      const screenLogin = document.getElementById('screen-login');
      if (screenLogin) {
        screenLogin.classList.remove('hidden');
        screenLogin.classList.add('flex');
      }
      
      // Reset form login
      const inpUser = document.getElementById('inpUser');
      const inpPass = document.getElementById('inpPass');
      const loginError = document.getElementById('loginError');
      
      if (inpUser) inpUser.value = '';
      if (inpPass) inpPass.value = '';
      if (loginError) {
        loginError.textContent = '';
        loginError.classList.add('hidden');
      }
      
      // Paksa reload halaman setelah 500ms (untuk PWA)
      setTimeout(() => {
        window.location.href = window.location.href;
      }, 500);
      
      showToast('Berhasil keluar dari aplikasi', 'success');
    }
  );
}

// ===== CUSTOM CONFIRMATION MODAL FUNCTIONS (SIMPLE & WORKS) =====

function closeCustomConfirm() {
  const modal = document.getElementById('customConfirmModal');
  if (modal) {
    modal.classList.add('hidden');
    document.body.style.overflow = '';
  }
}

function showCustomConfirm(title, message, subtext, callback) {
  const modal = document.getElementById('customConfirmModal');
  const titleEl = document.getElementById('customConfirmTitle');
  const messageEl = document.getElementById('customConfirmMessage');
  const subtextEl = document.getElementById('customConfirmSubtext');
  
  if (titleEl) titleEl.textContent = title || 'Konfirmasi';
  if (messageEl) messageEl.textContent = message || 'Apakah Anda yakin?';
  if (subtextEl) {
    if (subtext) {
      subtextEl.textContent = subtext;
      subtextEl.style.display = 'block';
    } else {
      subtextEl.style.display = 'none';
    }
  }
  
  if (!modal) {
    // Fallback ke confirm browser jika modal tidak ada
    if (confirm(title + '\n\n' + message)) {
      if (callback) callback();
    }
    return;
  }
  
  modal.classList.remove('hidden');
  
  // Setup tombol OK
  const okBtn = document.getElementById('customConfirmOkBtn');
  if (okBtn) {
    // Hapus semua event listener lama
    const newOkBtn = okBtn.cloneNode(true);
    okBtn.parentNode.replaceChild(newOkBtn, okBtn);
    
    // Tambah event listener baru
    newOkBtn.addEventListener('click', function() {
      // Tutup modal dulu
      const modalEl = document.getElementById('customConfirmModal');
      if (modalEl) {
        modalEl.classList.add('hidden');
        document.body.style.overflow = '';
      }
      
      // Jalankan callback
      if (callback) {
        setTimeout(function() {
          try {
            callback();
          } catch (e) {
            console.error('Error di callback:', e);
            showToast('Error: ' + e.message, 'error');
          }
        }, 100);
      }
    });
  }
}

// ===== FUNGSI YANG MENGGUNAKAN MODAL =====

function kembaliKePilihLokasi() {
  showCustomConfirm(
    'Ganti Lokasi Kerja',
    'Yakin ingin mengganti lokasi kerja?',
    'Anda akan kembali ke halaman pilih lokasi.',
    function() {
      localStorage.removeItem('sbu_lokasi');
      localStorage.removeItem('sbu_absen_status');
      selectedLokasi = null;
      
      const screenMain = document.getElementById('screen-main');
      if (screenMain) {
        screenMain.classList.add('hidden');
        screenMain.classList.remove('flex');
      }
      
      const screenLokasi = document.getElementById('screen-lokasi');
      if (screenLokasi) {
        screenLokasi.classList.remove('hidden');
        screenLokasi.classList.add('flex');
      }
      
      const listLokasi = document.getElementById('listLokasi');
      if (listLokasi) {
        listLokasi.innerHTML = '<p class="text-center text-slate-500 text-sm w-full">Memuat lokasi...</p>';
      }
      
      loadLokasi();
      showToast('Silakan pilih lokasi kerja baru', 'info');
    }
  );
}

function doLogout() {
  showCustomConfirm(
    'Keluar Aplikasi',
    'Yakin ingin keluar dari aplikasi?',
    'Anda harus login kembali untuk mengakses fitur.',
    function() {
      localStorage.removeItem('sbu_user');
      localStorage.removeItem('sbu_lokasi');
      localStorage.removeItem('sbu_absen_status');
      
      currentUser = null;
      selectedLokasi = null;
      
      const screenMain = document.getElementById('screen-main');
      const screenLokasi = document.getElementById('screen-lokasi');
      const screenLogin = document.getElementById('screen-login');
      
      if (screenMain) {
        screenMain.classList.add('hidden');
        screenMain.classList.remove('flex');
      }
      if (screenLokasi) {
        screenLokasi.classList.add('hidden');
        screenLokasi.classList.remove('flex');
      }
      if (screenLogin) {
        screenLogin.classList.remove('hidden');
        screenLogin.classList.add('flex');
      }
      
      const inpUser = document.getElementById('inpUser');
      const inpPass = document.getElementById('inpPass');
      const loginError = document.getElementById('loginError');
      
      if (inpUser) inpUser.value = '';
      if (inpPass) inpPass.value = '';
      if (loginError) {
        loginError.textContent = '';
        loginError.classList.add('hidden');
      }
      
      showToast('Berhasil keluar dari aplikasi', 'success');
      
      setTimeout(function() {
        window.location.href = window.location.href;
      }, 500);
    }
  );
}

// ===== AUTO UPDATE CHECKER (SETUP SEKALI, BERLAKU SELAMANYA) =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.ready.then(registration => {
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing;
      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('🔄 Update tersedia! Memuat ulang...');
          showToast('🔄 Aplikasi diperbarui ke versi terbaru...', 'info');
          
          // Auto reload setelah 1.5 detik
          setTimeout(() => {
            window.location.reload(true);
          }, 1500);
        }
      });
    });
  });
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  // ... (kode init yang sudah ada) ...
});

// ===== INIT =====
document.addEventListener('DOMContentLoaded', () => {
  startGPS();
  startClock();
  if (currentUser && selectedLokasi) {
    document.getElementById('screen-login').classList.add('hidden');
    showMainScreen();
  } else if (currentUser) {
    document.getElementById('screen-login').classList.add('hidden');
    loadLokasi();
  }
});
