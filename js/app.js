// Definisi Kategori
const categories = {
    pengeluaran: ['Makan', 'Transport', 'Tagihan', 'Hiburan', 'Belanja', 'Lainnya'],
    pemasukan: ['Gaji', 'Lainnya']
};
const allValidCategories = [...new Set([...categories.pengeluaran, ...categories.pemasukan])];

// State Aplikasi
let transactions = [];
let currentType = 'pengeluaran';
let selectedCategory = categories.pengeluaran[0];
let editingId = null;

// State Anggaran Mingguan
let budgetConfig = {
    totalLimit: 0,
    categoryLimits: {}
};

// Elemen DOM
const expenseForm = document.getElementById('expenseForm');
const editIdInput = document.getElementById('editId');
const amountInput = document.getElementById('amount');
const dateInput = document.getElementById('date');
const noteInput = document.getElementById('note');
const typeSwitch = document.getElementById('typeSwitch');
const categoryGrid = document.getElementById('categoryGrid');
const txList = document.getElementById('txList');
const todayTotalEl = document.getElementById('todayTotal');
const submitBtn = document.getElementById('submitBtn');
const cancelBtn = document.getElementById('cancelBtn');
const backupReminder = document.getElementById('backupReminder');
const backupReminderText = document.getElementById('backupReminderText');
const backupReminderBtn = document.getElementById('backupReminderBtn');

const periodFilter = document.getElementById('periodFilter');
const catFilter = document.getElementById('catFilter');
const summaryIncomeEl = document.getElementById('summaryIncome');
const summaryExpenseEl = document.getElementById('summaryExpense');
const summaryNetEl = document.getElementById('summaryNet');

const totalBudgetLimitInput = document.getElementById('totalBudgetLimit');
const categoryBudgetInputs = document.getElementById('categoryBudgetInputs');
const saveBudgetBtn = document.getElementById('saveBudgetBtn');
const progressFill = document.getElementById('progressFill');
const budgetRemaining = document.getElementById('budgetRemaining');
const budgetPercentage = document.getElementById('budgetPercentage');
const budgetWarning = document.getElementById('budgetWarning');
const budgetStatusText = document.getElementById('budgetStatusText');

// Navigasi & View
const navBtns = document.querySelectorAll('.nav-btn');
const views = document.querySelectorAll('.app-view');
const headerTitle = document.getElementById('headerTitle');

const titles = {
    'view-home': 'Beranda',
    'view-history': 'Riwayat Transaksi',
    'view-budget': 'Anggaran & Cadangan Data',
    'view-summary': 'Ringkasan Bulanan'
};

navBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        const targetView = btn.getAttribute('data-view');
        
        navBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        views.forEach(v => {
            if (v.id === targetView) {
                v.classList.add('active');
            } else {
                v.classList.remove('active');
            }
        });

        headerTitle.textContent = titles[targetView];

        if (targetView === 'view-summary') {
            renderCategoryChart();
        }
    });
});

// Format Tanggal & Rupiah
const getTodayDateString = () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};
dateInput.value = getTodayDateString();

const formatRupiah = (num) => {
    return 'Rp ' + Number(num).toLocaleString('id-ID');
};

const isValidDate = (dateStr) => {
    if (typeof dateStr !== 'string') return false;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const d = new Date(dateStr);
    return !isNaN(d.getTime()) && dateStr === d.toISOString().slice(0, 10);
};

// Sanitasi & Validasi Data Impor / Storage
// Deteksi kunci berbahaya yang benar-benar dimiliki objek (hasil JSON.parse)
const hasDangerousKey = (o) =>
    ['__proto__', 'constructor', 'prototype']
        .some(k => Object.prototype.hasOwnProperty.call(o, k));

// Konversi ke angka hingga hanya menerima angka sungguhan (null, '', boolean ditolak)
const toFiniteNumber = (v) => {
    if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
    if (typeof v === 'string' && v.trim() !== '') {
        const n = Number(v);
        return Number.isFinite(n) ? n : NaN;
    }
    return NaN;
};

const sanitizeTransaction = (tx) => {
    if (!tx || typeof tx !== 'object' || Array.isArray(tx)) return null;
    if (hasDangerousKey(tx)) return null;
    
    const id = toFiniteNumber(tx.id);
    if (isNaN(id)) return null;

    const type = tx.type === 'pemasukan' ? 'pemasukan' : (tx.type === 'pengeluaran' ? 'pengeluaran' : null);
    if (!type) return null;

    const amount = toFiniteNumber(tx.amount);
    if (isNaN(amount) || amount <= 0 || amount > 1e12) return null;

    const category = allValidCategories.includes(tx.category) ? tx.category : 'Lainnya';
    const date = isValidDate(tx.date) ? tx.date : getTodayDateString();
    
    let note = typeof tx.note === 'string' ? tx.note.trim() : '';
    if (note.length > 200) note = note.slice(0, 200);

    return { id, type, amount, category, date, note };
};

const sanitizeBudgetConfig = (config) => {
    if (!config || typeof config !== 'object' || Array.isArray(config)) return { totalLimit: 0, categoryLimits: {} };
    if (hasDangerousKey(config)) return { totalLimit: 0, categoryLimits: {} };

    const totalLimit = toFiniteNumber(config.totalLimit);
    const safeTotal = !isNaN(totalLimit) && totalLimit >= 0 ? totalLimit : 0;

    const categoryLimits = {};
    if (config.categoryLimits && typeof config.categoryLimits === 'object') {
        for (const [cat, limit] of Object.entries(config.categoryLimits)) {
            if (cat === '__proto__' || cat === 'constructor' || cat === 'prototype') continue;
            if (categories.pengeluaran.includes(cat)) {
                const numLimit = toFiniteNumber(limit);
                if (!isNaN(numLimit) && numLimit > 0) {
                    categoryLimits[cat] = numLimit;
                }
            }
        }
    }

    return { totalLimit: safeTotal, categoryLimits };
};

// Migrasi Otomatis & LocalStorage
const migrateStorage = () => {
    try {
        if (!localStorage.getItem('expenses_v1') && localStorage.getItem('expenses_matt')) {
            const oldData = localStorage.getItem('expenses_matt');
            if (oldData) localStorage.setItem('expenses_v1', oldData);
        }
        if (!localStorage.getItem('budget_v1') && localStorage.getItem('budget_settings_matt')) {
            const oldBudget = localStorage.getItem('budget_settings_matt');
            if (oldBudget) localStorage.setItem('budget_v1', oldBudget);
        }
    } catch (e) {
        console.error("Migrasi gagal:", e);
    }
};

const loadTransactions = () => {
    migrateStorage();
    try {
        const saved = localStorage.getItem('expenses_v1');
        if (saved) {
            const parsed = JSON.parse(saved);
            if (Array.isArray(parsed)) {
                transactions = parsed.map(tx => sanitizeTransaction(tx)).filter(tx => tx !== null);
            }
        }
    } catch (e) {
        console.error("Gagal membaca transaksi:", e);
        transactions = [];
    }
};

const saveTransactions = () => {
    try {
        localStorage.setItem('expenses_v1', JSON.stringify(transactions));
    } catch (e) {
        console.error("Gagal menyimpan transaksi:", e);
    }
};

const loadBudgetConfig = () => {
    try {
        const saved = localStorage.getItem('budget_v1');
        if (saved) {
            const parsed = JSON.parse(saved);
            budgetConfig = sanitizeBudgetConfig(parsed);
        }
    } catch (e) {
        console.error("Gagal membaca anggaran:", e);
    }
};

const saveBudgetConfig = () => {
    try {
        localStorage.setItem('budget_v1', JSON.stringify(budgetConfig));
    } catch (e) {
        console.error("Gagal menyimpan anggaran:", e);
    }
};

// Render Pengaturan Anggaran
const renderCategoryBudgetSettingsInputs = () => {
    categoryBudgetInputs.replaceChildren();
    categories.pengeluaran.forEach(cat => {
        const row = document.createElement('div');
        row.className = 'cat-budget-row';
        
        const span = document.createElement('span');
        span.textContent = cat;

        const input = document.createElement('input');
        input.type = 'number';
        input.inputMode = 'numeric';
        input.placeholder = 'Batas Rp';
        input.dataset.category = cat;
        input.value = budgetConfig.categoryLimits[cat] || '';
        input.min = '0';

        row.append(span, input);
        categoryBudgetInputs.appendChild(row);
    });
};

const initBudgetSettingsUI = () => {
    totalBudgetLimitInput.value = budgetConfig.totalLimit || '';
    renderCategoryBudgetSettingsInputs();
};

saveBudgetBtn.addEventListener('click', () => {
    const totalVal = parseFloat(totalBudgetLimitInput.value);
    budgetConfig.totalLimit = isNaN(totalVal) || totalVal < 0 ? 0 : totalVal;

    const newCategoryLimits = {};
    const inputs = categoryBudgetInputs.querySelectorAll('input');
    inputs.forEach(input => {
        const cat = input.dataset.category;
        const val = parseFloat(input.value);
        if (!isNaN(val) && val > 0 && categories.pengeluaran.includes(cat)) {
            newCategoryLimits[cat] = val;
        }
    });

    budgetConfig.categoryLimits = newCategoryLimits;
    saveBudgetConfig();
    updateBudgetProgress();
    alert('Pengaturan anggaran berhasil disimpan!');
});

// Render Tombol Kategori
const renderCategoryGrid = () => {
    categoryGrid.replaceChildren();
    const list = categories[currentType];
    
    if (!list.includes(selectedCategory)) {
        selectedCategory = list[0];
    }

    list.forEach(cat => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = `cat-btn ${cat === selectedCategory ? 'active' : ''}`;
        btn.textContent = cat;
        btn.dataset.category = cat;
        categoryGrid.appendChild(btn);
    });
};

const updateCatFilterDropdown = () => {
    const currentVal = catFilter.value;
    const allCategoriesSet = new Set();
    transactions.forEach(tx => allCategoriesSet.add(tx.category));

    catFilter.replaceChildren();
    const defaultOpt = document.createElement('option');
    defaultOpt.value = 'all';
    defaultOpt.textContent = 'Semua Kategori';
    catFilter.appendChild(defaultOpt);

    allCategoriesSet.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat;
        opt.textContent = cat;
        catFilter.appendChild(opt);
    });

    if ([...allCategoriesSet, 'all'].includes(currentVal)) {
        catFilter.value = currentVal;
    }
};

typeSwitch.addEventListener('click', (e) => {
    const target = e.target.closest('.type-btn');
    if (target) {
        document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        target.classList.add('active');
        currentType = target.dataset.type;
        renderCategoryGrid();
    }
});

categoryGrid.addEventListener('click', (e) => {
    const target = e.target.closest('.cat-btn');
    if (target) {
        document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
        target.classList.add('active');
        selectedCategory = target.dataset.category;
    }
});

// Helper Tanggal
const isDateInCurrentWeek = (dateStr) => {
    const currDate = new Date(dateStr);
    const now = new Date();
    
    const firstDayOfWeek = new Date(now);
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    firstDayOfWeek.setDate(diff);
    firstDayOfWeek.setHours(0, 0, 0, 0);

    const lastDayOfWeek = new Date(firstDayOfWeek);
    lastDayOfWeek.setDate(lastDayOfWeek.getDate() + 6);
    lastDayOfWeek.setHours(23, 59, 59, 999);

    return currDate >= firstDayOfWeek && currDate <= lastDayOfWeek;
};

const isDateInCurrentMonth = (dateStr) => {
    const currDate = new Date(dateStr);
    const now = new Date();
    return currDate.getFullYear() === now.getFullYear() && currDate.getMonth() === now.getMonth();
};

const getFilteredTransactions = () => {
    const period = periodFilter.value;
    const cat = catFilter.value;

    return transactions.filter(tx => {
        if (cat !== 'all' && tx.category !== cat) return false;
        if (period === 'week') return isDateInCurrentWeek(tx.date);
        if (period === 'month') return isDateInCurrentMonth(tx.date);
        return true;
    });
};

const updateBudgetProgress = () => {
    const weekExpenses = transactions.filter(tx => tx.type === 'pengeluaran' && isDateInCurrentWeek(tx.date));
    const totalSpent = weekExpenses.reduce((sum, tx) => sum + Number(tx.amount), 0);
    const limit = budgetConfig.totalLimit;

    if (!limit || limit <= 0) {
        budgetStatusText.textContent = 'Belum diatur';
        progressFill.style.width = '0%';
        progressFill.className = 'progress-fill green';
        budgetRemaining.textContent = 'Batas belum diatur';
        budgetPercentage.textContent = 'Terpakai 0%';
        budgetWarning.style.display = 'none';
        return;
    }

    const percentage = Math.round((totalSpent / limit) * 100);
    const remaining = limit - totalSpent;

    budgetStatusText.textContent = `${formatRupiah(totalSpent)} / ${formatRupiah(limit)}`;
    budgetRemaining.textContent = `Sisa: ${formatRupiah(remaining >= 0 ? remaining : 0)}`;
    budgetPercentage.textContent = `Terpakai ${percentage}%`;

    const clampedWidth = Math.min(percentage, 100);
    progressFill.style.width = `${clampedWidth}%`;

    if (totalSpent > limit) {
        progressFill.className = 'progress-fill red';
        budgetWarning.className = 'budget-warning red';
        budgetWarning.textContent = `⚠️ Peringatan: Anggaran minggu ini telah melebihi batas sebesar ${formatRupiah(Math.abs(remaining))}!`;
        budgetWarning.style.display = 'block';
    } else if (percentage >= 80) {
        progressFill.className = 'progress-fill yellow';
        budgetWarning.className = 'budget-warning yellow';
        budgetWarning.textContent = `⚠️ Perhatian: Pengeluaran minggu ini sudah mencapai ${percentage}% dari batas anggaran.`;
        budgetWarning.style.display = 'block';
    } else {
        progressFill.className = 'progress-fill green';
        budgetWarning.style.display = 'none';
    }
};

// Pengingat Cadangan Data
// Ubah angka ini untuk mengatur jarak hari antar pengingat.
const BACKUP_REMINDER_DAYS = 7;
const LAST_EXPORT_KEY = 'last_export_v1';
const FIRST_RUN_KEY = 'first_run_v1';
const DAY_MS = 24 * 60 * 60 * 1000;

const readTimestamp = (key) => {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const n = Number(raw);
        // Tolak nilai tidak valid atau tanggal di masa depan
        if (!Number.isFinite(n) || n <= 0 || n > Date.now() + DAY_MS) return null;
        return n;
    } catch (e) {
        return null;
    }
};

const writeTimestamp = (key, value) => {
    try {
        localStorage.setItem(key, String(value));
    } catch (e) {
        console.error("Gagal menyimpan penanda waktu:", e);
    }
};

const updateBackupReminder = () => {
    if (readTimestamp(FIRST_RUN_KEY) === null) {
        writeTimestamp(FIRST_RUN_KEY, Date.now());
    }

    // Tidak ada data = tidak ada yang perlu dicadangkan
    if (transactions.length === 0) {
        backupReminder.hidden = true;
        return;
    }

    const lastExport = readTimestamp(LAST_EXPORT_KEY);
    const reference = lastExport !== null ? lastExport : readTimestamp(FIRST_RUN_KEY);
    const days = reference === null ? 0 : Math.floor((Date.now() - reference) / DAY_MS);

    if (days < BACKUP_REMINDER_DAYS) {
        backupReminder.hidden = true;
        return;
    }

    backupReminderText.textContent = lastExport !== null
        ? `Data terakhir dicadangkan ${days} hari lalu. Ekspor JSON agar data aman.`
        : 'Data Anda belum pernah dicadangkan. Ekspor JSON agar data aman.';
    backupReminder.hidden = false;
};

const updateSummary = () => {
    const todayStr = getTodayDateString();
    const todayExpense = transactions
        .filter(tx => tx.type === 'pengeluaran' && tx.date === todayStr)
        .reduce((sum, tx) => sum + Number(tx.amount), 0);
    todayTotalEl.textContent = formatRupiah(todayExpense);

    const filtered = getFilteredTransactions();
    const totalIncome = filtered
        .filter(tx => tx.type === 'pemasukan')
        .reduce((sum, tx) => sum + Number(tx.amount), 0);
    
    const totalExpense = filtered
        .filter(tx => tx.type === 'pengeluaran')
        .reduce((sum, tx) => sum + Number(tx.amount), 0);

    const net = totalIncome - totalExpense;

    summaryIncomeEl.textContent = formatRupiah(totalIncome);
    summaryExpenseEl.textContent = formatRupiah(totalExpense);
    summaryNetEl.textContent = formatRupiah(net);
    summaryNetEl.className = `summary-value ${net >= 0 ? 'income' : 'expense'}`;

    updateBudgetProgress();
    updateBackupReminder();
};

// Render Transaksi secara Aman tanpa innerHTML
const renderTransactions = () => {
    updateCatFilterDropdown();
    const filtered = getFilteredTransactions();
    txList.replaceChildren();

    if (filtered.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        emptyDiv.textContent = 'Tidak ada catatan transaksi untuk filter ini.';
        txList.appendChild(emptyDiv);
        updateSummary();
        return;
    }

    filtered.forEach(tx => {
        const item = document.createElement('div');
        item.className = 'tx-item';

        const infoDiv = document.createElement('div');
        infoDiv.className = 'tx-info';

        const catSpan = document.createElement('span');
        catSpan.className = 'tx-category';
        catSpan.textContent = tx.category;

        const noteSpan = document.createElement('span');
        noteSpan.className = 'tx-note';
        noteSpan.textContent = tx.note ? tx.note : 'Tanpa catatan';

        const dateSpan = document.createElement('span');
        dateSpan.className = 'tx-date';
        dateSpan.textContent = tx.date;

        infoDiv.append(catSpan, noteSpan, dateSpan);

        const rightDiv = document.createElement('div');
        rightDiv.className = 'tx-right';

        const amountDiv = document.createElement('div');
        amountDiv.className = `tx-amount ${tx.type}`;
        const sign = tx.type === 'pemasukan' ? '+' : '-';
        amountDiv.textContent = `${sign} ${formatRupiah(tx.amount)}`;

        const actionsDiv = document.createElement('div');
        actionsDiv.className = 'tx-actions';

        const editBtn = document.createElement('button');
        editBtn.className = 'tx-action-btn edit';
        editBtn.textContent = 'Edit';
        editBtn.dataset.id = tx.id;
        editBtn.addEventListener('click', () => editTransactionById(tx.id));

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'tx-action-btn delete';
        deleteBtn.textContent = 'Hapus';
        deleteBtn.dataset.id = tx.id;
        deleteBtn.addEventListener('click', () => deleteTransactionById(tx.id));

        actionsDiv.append(editBtn, deleteBtn);
        rightDiv.append(amountDiv, actionsDiv);
        item.append(infoDiv, rightDiv);
        txList.appendChild(item);
    });

    updateSummary();
};

// Grafik SVG Ringkasan Bulanan (Menggunakan createElementNS & Atribut Aman)
const renderCategoryChart = () => {
    const chartContainer = document.getElementById('chartContainer');
    const breakdownList = document.getElementById('categoryBreakdownList');
    chartContainer.replaceChildren();
    breakdownList.replaceChildren();

    const monthExpenses = transactions.filter(tx => tx.type === 'pengeluaran' && isDateInCurrentMonth(tx.date));
    
    if (monthExpenses.length === 0) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'empty-state';
        emptyDiv.textContent = 'Belum ada pengeluaran bulan ini untuk grafik.';
        chartContainer.appendChild(emptyDiv);
        return;
    }

    const catTotals = {};
    let totalMonth = 0;
    monthExpenses.forEach(tx => {
        catTotals[tx.category] = (catTotals[tx.category] || 0) + Number(tx.amount);
        totalMonth += Number(tx.amount);
    });

    const sortedCategories = Object.entries(catTotals).sort((a, b) => b[1] - a[1]);
    const fixedColors = ['#2563eb', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

    const svgNS = "http://www.w3.org/2000/svg";
    const svgHeight = sortedCategories.length * 36 + 20;
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('viewBox', `0 0 300 ${svgHeight}`);
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', String(svgHeight));

    let y = 10;
    sortedCategories.forEach(([cat, amount], index) => {
        const percentage = totalMonth > 0 ? (amount / totalMonth) * 100 : 0;
        const barWidth = totalMonth > 0 ? (amount / totalMonth) * 180 : 0;
        const color = fixedColors[index % fixedColors.length];

        const textCat = document.createElementNS(svgNS, 'text');
        textCat.setAttribute('x', '0');
        textCat.setAttribute('y', String(y + 12));
        textCat.setAttribute('fill', 'currentColor');
        textCat.setAttribute('font-size', '11');
        textCat.setAttribute('font-weight', '600');
        textCat.textContent = cat;

        const textPct = document.createElementNS(svgNS, 'text');
        textPct.setAttribute('x', '295');
        textPct.setAttribute('y', String(y + 12));
        textPct.setAttribute('fill', 'currentColor');
        textPct.setAttribute('font-size', '11');
        textPct.setAttribute('text-anchor', 'end');
        textPct.setAttribute('font-weight', '600');
        textPct.textContent = `${percentage.toFixed(1)}%`;

        const bgRect = document.createElementNS(svgNS, 'rect');
        bgRect.setAttribute('x', '0');
        bgRect.setAttribute('y', String(y + 18));
        bgRect.setAttribute('width', '295');
        bgRect.setAttribute('height', '10');
        bgRect.setAttribute('rx', '5');
        bgRect.setAttribute('fill', 'var(--btn-bg)');

        const fgRect = document.createElementNS(svgNS, 'rect');
        fgRect.setAttribute('x', '0');
        fgRect.setAttribute('y', String(y + 18));
        fgRect.setAttribute('width', String(Math.max(barWidth, 4)));
        fgRect.setAttribute('height', '10');
        fgRect.setAttribute('rx', '5');
        fgRect.setAttribute('fill', color);

        svg.append(textCat, textPct, bgRect, fgRect);
        y += 36;

        const itemEl = document.createElement('div');
        itemEl.className = 'breakdown-item';

        const leftDiv = document.createElement('div');
        leftDiv.className = 'breakdown-left';

        const dot = document.createElement('div');
        dot.className = 'color-dot';
        dot.style.setProperty('background-color', color);

        const spanCat = document.createElement('span');
        spanCat.textContent = cat;
        leftDiv.append(dot, spanCat);

        const rightDiv = document.createElement('div');
        rightDiv.className = 'breakdown-right';
        rightDiv.textContent = `${formatRupiah(amount)} (${percentage.toFixed(1)}%)`;

        itemEl.append(leftDiv, rightDiv);
        breakdownList.appendChild(itemEl);
    });

    chartContainer.appendChild(svg);
};

// Form Submit
expenseForm.addEventListener('submit', (e) => {
    e.preventDefault();

    const amountVal = parseFloat(amountInput.value);
    if (isNaN(amountVal) || amountVal <= 0) {
        alert('Nominal wajib diisi dan harus lebih besar dari 0.');
        amountInput.focus();
        return;
    }

    const cleanNote = noteInput.value.trim().slice(0, 200);

    if (editingId) {
        transactions = transactions.map(tx => {
            if (tx.id === editingId) {
                return {
                    ...tx,
                    type: currentType,
                    amount: amountVal,
                    category: selectedCategory,
                    date: isValidDate(dateInput.value) ? dateInput.value : getTodayDateString(),
                    note: cleanNote
                };
            }
            return tx;
        });
        resetForm();
    } else {
        const newTx = {
            id: Date.now(),
            type: currentType,
            amount: amountVal,
            category: selectedCategory,
            date: isValidDate(dateInput.value) ? dateInput.value : getTodayDateString(),
            note: cleanNote
        };
        transactions.unshift(newTx);
    }

    saveTransactions();
    renderTransactions();
    if (!editingId) {
        amountInput.value = '';
        noteInput.value = '';
        amountInput.focus();
    }
});

// Validasi ID Transaksi
const validateAndParseId = (rawId) => {
    const id = Number(rawId);
    return !isNaN(id) ? id : null;
};

window.editTransactionById = (rawId) => {
    const id = validateAndParseId(rawId);
    if (id === null) return;

    const tx = transactions.find(t => t.id === id);
    if (!tx) return;

    editingId = tx.id;
    currentType = tx.type;
    
    document.querySelectorAll('.type-btn').forEach(b => {
        if (b.dataset.type === tx.type) b.classList.add('active');
        else b.classList.remove('active');
    });

    renderCategoryGrid();
    selectedCategory = tx.category;
    document.querySelectorAll('.cat-btn').forEach(b => {
        if (b.dataset.category === tx.category) b.classList.add('active');
        else b.classList.remove('active');
    });

    amountInput.value = tx.amount;
    dateInput.value = tx.date;
    noteInput.value = tx.note || '';

    submitBtn.textContent = 'Simpan Perubahan';
    cancelBtn.style.display = 'block';
    amountInput.focus();
    
    document.querySelector('.nav-btn[data-view="view-home"]').click();
};

window.deleteTransactionById = (rawId) => {
    const id = validateAndParseId(rawId);
    if (id === null) return;

    if (confirm('Apakah Anda yakin ingin menghapus transaksi ini?')) {
        transactions = transactions.filter(t => t.id !== id);
        saveTransactions();
        renderTransactions();
        if (editingId === id) resetForm();
    }
};

const resetForm = () => {
    editingId = null;
    expenseForm.reset();
    dateInput.value = getTodayDateString();
    currentType = 'pengeluaran';
    document.querySelectorAll('.type-btn').forEach((b, idx) => {
        if (idx === 0) b.classList.add('active');
        else b.classList.remove('active');
    });
    renderCategoryGrid();
    submitBtn.textContent = 'Tambah Transaksi';
    cancelBtn.style.display = 'none';
};

cancelBtn.addEventListener('click', resetForm);

periodFilter.addEventListener('change', renderTransactions);
catFilter.addEventListener('change', renderTransactions);

// Ekspor & Impor Data yang Aman
const exportJsonBtn = document.getElementById('exportJsonBtn');
const exportCsvBtn = document.getElementById('exportCsvBtn');
const importJsonFile = document.getElementById('importJsonFile');

exportJsonBtn.addEventListener('click', () => {
    const data = {
        version: 3,
        exportDate: new Date().toISOString(),
        transactions,
        budgetConfig
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pencatatan_keuangan_${getTodayDateString()}.json`;
    a.click();
    URL.revokeObjectURL(url);

    // Catat waktu cadangan terakhir, lalu perbarui pengingat
    writeTimestamp(LAST_EXPORT_KEY, Date.now());
    updateBackupReminder();
});

backupReminderBtn.addEventListener('click', () => exportJsonBtn.click());

const escapeCsvCell = (val) => {
    if (val === null || val === undefined) return '""';
    let str = String(val);
    // Mencegah CSV Injection formula
    if (/^[=+\-@\t\r]/.test(str)) {
        str = "'" + str;
    }
    // Escape double quotes
    str = str.replace(/"/g, '""');
    return `"${str}"`;
};

exportCsvBtn.addEventListener('click', () => {
    let csvContent = "ID,Tipe,Tanggal,Kategori,Nominal,Catatan\r\n";
    transactions.forEach(tx => {
        const row = [
            tx.id,
            escapeCsvCell(tx.type),
            escapeCsvCell(tx.date),
            escapeCsvCell(tx.category),
            tx.amount,
            escapeCsvCell(tx.note || '')
        ];
        csvContent += row.join(",") + "\r\n";
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pencatatan_keuangan_${getTodayDateString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
});

importJsonFile.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
        alert('Ukuran file terlalu besar (maksimal 5 MB).');
        e.target.value = '';
        return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
        try {
            const parsed = JSON.parse(event.target.result);
            if (!parsed || typeof parsed !== 'object' || (!Array.isArray(parsed) && hasDangerousKey(parsed))) {
                throw new Error("Struktur file tidak valid.");
            }

            let rawTransactions = [];
            let rawBudget = null;

            if (Array.isArray(parsed)) {
                rawTransactions = parsed;
            } else if (typeof parsed === 'object') {
                if (Array.isArray(parsed.transactions)) {
                    rawTransactions = parsed.transactions;
                }
                if (parsed.budgetConfig && typeof parsed.budgetConfig === 'object') {
                    rawBudget = parsed.budgetConfig;
                }
            } else {
                throw new Error("Format file JSON tidak valid.");
            }

            const sanitizedTxList = rawTransactions
                .map(tx => sanitizeTransaction(tx))
                .filter(tx => tx !== null);

            const sanitizedBudget = rawBudget ? sanitizeBudgetConfig(rawBudget) : null;

            if (confirm("Apakah Anda yakin ingin mengimpor data ini? Data yang ada saat ini akan ditimpa.")) {
                transactions = sanitizedTxList;
                if (sanitizedBudget) {
                    budgetConfig = sanitizedBudget;
                    saveBudgetConfig();
                    initBudgetSettingsUI();
                }
                saveTransactions();
                renderTransactions();
                alert("Data berhasil diimpor!");
            }
        } catch (err) {
            alert("Gagal mengimpor: File JSON rusak atau format salah. Data Anda aman.");
            console.error(err);
        } finally {
            e.target.value = '';
        }
    };
    reader.readAsText(file);
});

// Inisialisasi Awal
// Minta penyimpanan persisten agar data lebih kecil kemungkinannya dihapus browser
try {
    if (navigator.storage && typeof navigator.storage.persist === 'function') {
        navigator.storage.persist().catch(() => {});
    }
} catch (e) {
    console.error("Penyimpanan persisten tidak tersedia:", e);
}

loadTransactions();
loadBudgetConfig();
initBudgetSettingsUI();
renderCategoryGrid();
renderTransactions();
