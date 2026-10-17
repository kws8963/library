/**
 * ==============================================================
 * 학급문고 스마트 대여장 (Classroom Smart Library) - script.js
 * Google Apps Script Web App 연동 및 GitHub Pages 호환 클라이언트 로직
 * ==============================================================
 */

// 로컬 스토리지 키
const STORAGE_KEY_GAS_URL = "smart_library_gas_url";
const STORAGE_KEY_STUDENTS = "smart_library_students";
const STORAGE_KEY_SELECTED_STUDENT = "smart_library_selected_student";
const STORAGE_KEY_LOCAL_BOOKS = "smart_library_local_books";
const STORAGE_KEY_LOCAL_HISTORY = "smart_library_local_history";

// 기본 예시 데이터 (구글 시트 연동 전 데모 모드 및 초기 상태용)
const DEFAULT_STUDENTS = [
  "김민준", "이서아", "박도윤", "정하윤", "최시우",
  "강지호", "윤수아", "임지유", "한예준", "오채원",
  "신은우", "송다은", "조유준", "백서연", "권태양"
];

const DEFAULT_BOOKS = [
  { id: "B-001", title: "어린 왕자", status: "대출가능", displayStatus: "대출가능", borrower: "", updatedAt: "" },
  { id: "B-002", title: "마법천자문 1권 (바람풍편)", status: "대출가능", displayStatus: "대출가능", borrower: "", updatedAt: "" },
  { id: "B-003", title: "불편한 편의점 (청소년판)", status: "대출중", displayStatus: "대출중(김민준)", borrower: "김민준", updatedAt: "2026-10-15 09:30:00" },
  { id: "B-004", title: "이상한 과자 가게 전천당 1", status: "대출가능", displayStatus: "대출가능", borrower: "", updatedAt: "" },
  { id: "B-005", title: "지구용사 어린이 환경 백과", status: "대출가능", displayStatus: "대출가능", borrower: "", updatedAt: "" },
  { id: "B-006", title: "흔한남매 1", status: "대출중", displayStatus: "대출중(이서아)", borrower: "이서아", updatedAt: "2026-10-16 11:20:00" },
  { id: "B-007", title: "초등 글쓰기 비밀 수첩", status: "대출가능", displayStatus: "대출가능", borrower: "", updatedAt: "" },
  { id: "B-008", title: "만화 그리스 로마 신화 1", status: "대출가능", displayStatus: "대출가능", borrower: "", updatedAt: "" },
  { id: "B-009", title: "아홉 살 마음 사전", status: "대출가능", displayStatus: "대출가능", borrower: "", updatedAt: "" },
  { id: "B-010", title: "수학특성화중학교 1", status: "대출가능", displayStatus: "대출가능", borrower: "", updatedAt: "" }
];

const DEFAULT_HISTORY = [
  { timestamp: "2026-10-15 09:30:00", studentName: "김민준", bookTitle: "불편한 편의점 (청소년판)", action: "대출", bookId: "B-003" },
  { timestamp: "2026-10-16 11:20:00", studentName: "이서아", bookTitle: "흔한남매 1", action: "대출", bookId: "B-006" }
];

// 전역 상태
let appState = {
  gasUrl: localStorage.getItem(STORAGE_KEY_GAS_URL) || "",
  students: JSON.parse(localStorage.getItem(STORAGE_KEY_STUDENTS) || "null") || DEFAULT_STUDENTS,
  selectedStudent: localStorage.getItem(STORAGE_KEY_SELECTED_STUDENT) || "",
  books: [],
  history: [],
  currentFilter: "all", // 'all' | 'available' | 'borrowed'
  searchQuery: "",
  isLoading: false,
  pendingBook: null // 대출/반납 모달 대상 도서
};

// DOM 로드 시 초기화
document.addEventListener("DOMContentLoaded", () => {
  initElements();
  loadInitialData();
  renderStudentSelector();
  bindEvents();
});

/**
 * 초기 데이터 로드
 */
async function loadInitialData() {
  updateConnectionBadge();
  
  if (appState.gasUrl) {
    // 구글 시트 URL이 설정되어 있으면 실시간 데이터 요청
    await fetchFromGoogleSheets();
  } else {
    // 로컬 스토리지에 저장된 책이 있으면 불러오고, 없으면 기본 예시 로드
    const cachedBooks = localStorage.getItem(STORAGE_KEY_LOCAL_BOOKS);
    const cachedHistory = localStorage.getItem(STORAGE_KEY_LOCAL_HISTORY);
    
    appState.books = cachedBooks ? JSON.parse(cachedBooks) : DEFAULT_BOOKS;
    appState.history = cachedHistory ? JSON.parse(cachedHistory) : DEFAULT_HISTORY;
    renderBooks();
    renderStats();
  }
}

/**
 * 구글 앱스크립트와 통신하는 핵심 fetch 함수
 * (GitHub Pages CORS 방지를 위해 POST 요청 시 Content-Type을 text/plain;charset=utf-8로 지정)
 */
async function callAppsScript(payload) {
  if (!appState.gasUrl) {
    throw new Error("구글 시트 연동 URL이 설정되지 않았습니다.");
  }

  showLoading(true, "구글 시트와 통신 중입니다...");
  try {
    const response = await fetch(appState.gasUrl, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8" // 🌟 GitHub Pages CORS Simple Request 핵심
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP 오류: ${response.status}`);
    }

    const data = await response.json();
    return data;
  } finally {
    showLoading(false);
  }
}

/**
 * 구글 시트에서 전체 데이터 동기화 가져오기
 */
async function fetchFromGoogleSheets() {
  if (!appState.gasUrl) return;

  try {
    showLoading(true, "구글 시트에서 최신 도서 목록을 불러오는 중...");
    // GET 요청 또는 POST action: getBooks 모두 지원
    const response = await fetch(appState.gasUrl + (appState.gasUrl.includes("?") ? "&" : "?") + "action=getBooks&t=" + Date.now());
    const data = await response.json();

    if (data && data.success) {
      appState.books = data.books || [];
      appState.history = data.history || [];
      saveLocalBackup();
      showToast("구글 시트와 실시간 동기화되었습니다! 🟢", "success");
    } else {
      throw new Error(data.error || "데이터를 불러오지 못했습니다.");
    }
  } catch (error) {
    console.warn("구글 시트 직접 GET 실패, POST로 재시도:", error);
    try {
      const postData = await callAppsScript({ action: "getBooks" });
      if (postData && postData.success) {
        appState.books = postData.books || [];
        appState.history = postData.history || [];
        saveLocalBackup();
        showToast("구글 시트와 연결되었습니다! 🟢", "success");
      }
    } catch (postError) {
      console.error("구글 시트 통신 오류:", postError);
      showToast("구글 시트 연결 실패. URL 및 배포 권한('모든 사용자')을 확인해 주세요.", "error");
      // 백업 로컬 데이터 로드
      const cachedBooks = localStorage.getItem(STORAGE_KEY_LOCAL_BOOKS);
      appState.books = cachedBooks ? JSON.parse(cachedBooks) : DEFAULT_BOOKS;
    }
  } finally {
    showLoading(false);
    renderBooks();
    renderStats();
    updateConnectionBadge();
  }
}

/**
 * 대출 처리 함수 (구글 시트 실시간 기록)
 */
async function executeBorrow(bookId, studentName) {
  if (!studentName) {
    showToast("대출할 학생 이름을 먼저 선택하거나 입력해 주세요! 👤", "error");
    document.getElementById("studentInput")?.focus();
    return;
  }

  const book = appState.books.find(b => b.id === bookId);
  if (!book) return;

  if (book.status === "대출중") {
    showToast(`이미 대출 중인 책입니다! (${book.borrower || "다른 학생"})`, "error");
    return;
  }

  if (appState.gasUrl) {
    // 🌟 구글 시트 연동 모드: POST 요청 전송
    try {
      const res = await callAppsScript({
        action: "borrow",
        bookId: book.id,
        bookTitle: book.title,
        studentName: studentName
      });

      if (res && res.success) {
        if (res.books) appState.books = res.books;
        if (res.history) appState.history = res.history;
        saveLocalBackup();
        showToast(`📖 '${book.title}' 대출 완료! (${studentName} 학생)`, "success");
      } else {
        throw new Error(res.error || "대출 처리에 실패했습니다.");
      }
    } catch (error) {
      showToast(`대출 오류: ${error.message}`, "error");
      return;
    }
  } else {
    // 🟡 로컬 데모 모드
    const now = formatNow();
    book.status = "대출중";
    book.borrower = studentName;
    book.displayStatus = `대출중(${studentName})`;
    book.updatedAt = now;

    appState.history.unshift({
      timestamp: now,
      studentName: studentName,
      bookTitle: book.title,
      action: "대출",
      bookId: book.id
    });

    saveLocalBackup();
    showToast(`📖 [데모] '${book.title}' 대출 완료! (${studentName} 학생)`, "success");
  }

  closeModal("borrowModal");
  renderBooks();
  renderStats();
}

/**
 * 반납 처리 함수 (구글 시트 실시간 기록)
 */
async function executeReturn(bookId, returnerName) {
  const book = appState.books.find(b => b.id === bookId);
  if (!book) return;

  const actualStudent = returnerName || book.borrower || appState.selectedStudent || "학생";

  if (appState.gasUrl) {
    // 🌟 구글 시트 연동 모드: POST 요청 전송
    try {
      const res = await callAppsScript({
        action: "return",
        bookId: book.id,
        bookTitle: book.title,
        studentName: actualStudent
      });

      if (res && res.success) {
        if (res.books) appState.books = res.books;
        if (res.history) appState.history = res.history;
        saveLocalBackup();
        showToast(`✅ '${book.title}' 반납 완료! 감사합니다.`, "success");
      } else {
        throw new Error(res.error || "반납 처리에 실패했습니다.");
      }
    } catch (error) {
      showToast(`반납 오류: ${error.message}`, "error");
      return;
    }
  } else {
    // 🟡 로컬 데모 모드
    const now = formatNow();
    book.status = "대출가능";
    book.borrower = "";
    book.displayStatus = "대출가능";
    book.updatedAt = now;

    appState.history.unshift({
      timestamp: now,
      studentName: actualStudent,
      bookTitle: book.title,
      action: "반납",
      bookId: book.id
    });

    saveLocalBackup();
    showToast(`✅ [데모] '${book.title}' 반납 완료! 감사합니다.`, "success");
  }

  closeModal("returnModal");
  renderBooks();
  renderStats();
}

/**
 * 로컬 스토리지에 캐시 백업
 */
function saveLocalBackup() {
  localStorage.setItem(STORAGE_KEY_LOCAL_BOOKS, JSON.stringify(appState.books));
  localStorage.setItem(STORAGE_KEY_LOCAL_HISTORY, JSON.stringify(appState.history));
}

/**
 * 학생 선택 렌더링
 */
function renderStudentSelector() {
  const container = document.getElementById("studentChipsContainer");
  const selectedDisplay = document.getElementById("selectedStudentDisplay");
  const selectedName = document.getElementById("selectedStudentName");
  const clearBtn = document.getElementById("clearStudentBtn");

  if (!container) return;

  container.innerHTML = "";

  appState.students.forEach((name, idx) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = `student-chip ${appState.selectedStudent === name ? "active" : ""}`;
    chip.innerHTML = `<span>${idx + 1}.</span> <strong>${name}</strong>`;
    chip.onclick = () => selectStudent(name);
    container.appendChild(chip);
  });

  if (appState.selectedStudent) {
    if (selectedName) selectedName.textContent = appState.selectedStudent;
    if (selectedDisplay) selectedDisplay.style.display = "flex";
  } else {
    if (selectedDisplay) selectedDisplay.style.display = "none";
  }
}

/**
 * 학생 선택 액션
 */
function selectStudent(name) {
  appState.selectedStudent = name.trim();
  localStorage.setItem(STORAGE_KEY_SELECTED_STUDENT, appState.selectedStudent);
  renderStudentSelector();
  showToast(`👤 학생 '${appState.selectedStudent}' 선택됨`, "success");
}

/**
 * 학생 선택 해제
 */
function clearSelectedStudent() {
  appState.selectedStudent = "";
  localStorage.removeItem(STORAGE_KEY_SELECTED_STUDENT);
  renderStudentSelector();
}

/**
 * 도서 목록 렌더링
 */
function renderBooks() {
  const grid = document.getElementById("booksGrid");
  const emptyState = document.getElementById("emptyState");
  if (!grid) return;

  grid.innerHTML = "";

  // 필터 및 검색 적용
  let filtered = appState.books.filter(book => {
    // 탭 필터
    if (appState.currentFilter === "available" && book.status === "대출중") return false;
    if (appState.currentFilter === "borrowed" && book.status !== "대출중") return false;

    // 검색어 필터
    if (appState.searchQuery) {
      const q = appState.searchQuery.toLowerCase();
      const matchTitle = book.title.toLowerCase().includes(q);
      const matchId = book.id.toLowerCase().includes(q);
      const matchBorrower = (book.borrower || "").toLowerCase().includes(q);
      if (!matchTitle && !matchId && !matchBorrower) return false;
    }

    return true;
  });

  if (filtered.length === 0) {
    if (emptyState) emptyState.style.display = "block";
    return;
  } else {
    if (emptyState) emptyState.style.display = "none";
  }

  filtered.forEach(book => {
    const isBorrowed = book.status === "대출중";
    const borrowerName = book.borrower || (book.displayStatus.match(/\((.+)\)/)?.[1] || "");

    const card = document.createElement("div");
    card.className = `book-card ${isBorrowed ? "is-borrowed" : ""}`;

    // 상태 배지: 대출중인 경우 '대출중(이름)'을 선명하게 표시
    const statusBadgeHtml = isBorrowed
      ? `<span class="book-status-badge borrowed">⚠️ 대출중(${borrowerName || "대출자"})</span>`
      : `<span class="book-status-badge available">🟢 대출가능</span>`;

    card.innerHTML = `
      <div>
        <div class="book-card-top">
          <span class="book-id-badge">${escapeHtml(book.id)}</span>
          ${statusBadgeHtml}
        </div>
        <div class="book-card-body" style="margin-top: 12px;">
          <div class="book-cover-icon">${isBorrowed ? "📕" : "📗"}</div>
          <div>
            <h4 class="book-title" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</h4>
            ${isBorrowed ? `<div class="book-borrower-hint">👤 대출자: <strong>${escapeHtml(borrowerName)}</strong></div>` : ""}
          </div>
        </div>
      </div>
      <div class="book-card-actions">
        ${isBorrowed ? `
          <button type="button" class="btn btn-success btn-return" data-id="${escapeHtml(book.id)}">
            ✅ 반납하기
          </button>
        ` : `
          <button type="button" class="btn btn-primary btn-borrow" data-id="${escapeHtml(book.id)}">
            📖 대출하기
          </button>
        `}
        <button type="button" class="btn btn-outline btn-sm btn-info" data-id="${escapeHtml(book.id)}" title="이 책의 대여 이력 보기">
          📜 기록
        </button>
      </div>
    `;

    // 이벤트 리스너 연결
    const borrowBtn = card.querySelector(".btn-borrow");
    if (borrowBtn) {
      borrowBtn.addEventListener("click", () => openBorrowModal(book));
    }

    const returnBtn = card.querySelector(".btn-return");
    if (returnBtn) {
      returnBtn.addEventListener("click", () => openReturnModal(book));
    }

    const infoBtn = card.querySelector(".btn-info");
    if (infoBtn) {
      infoBtn.addEventListener("click", () => openBookHistoryModal(book));
    }

    grid.appendChild(card);
  });
}

/**
 * 통계 상단 바 렌더링
 */
function renderStats() {
  const totalEl = document.getElementById("statTotal");
  const availableEl = document.getElementById("statAvailable");
  const borrowedEl = document.getElementById("statBorrowed");
  const todayEl = document.getElementById("statTodayActivity");

  const total = appState.books.length;
  const borrowed = appState.books.filter(b => b.status === "대출중").length;
  const available = total - borrowed;

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCount = appState.history.filter(h => (h.timestamp || "").startsWith(todayStr)).length;

  if (totalEl) totalEl.textContent = total;
  if (availableEl) availableEl.textContent = available;
  if (borrowedEl) borrowedEl.textContent = borrowed;
  if (todayEl) todayEl.textContent = todayCount;
}

/**
 * 대출 확인 모달 열기
 */
function openBorrowModal(book) {
  appState.pendingBook = book;
  
  const modal = document.getElementById("borrowModal");
  const bookTitleEl = document.getElementById("borrowBookTitle");
  const bookIdEl = document.getElementById("borrowBookId");
  const studentInputEl = document.getElementById("borrowStudentInput");
  const studentHintEl = document.getElementById("borrowStudentHint");

  if (!modal) return;

  if (bookTitleEl) bookTitleEl.textContent = book.title;
  if (bookIdEl) bookIdEl.textContent = book.id;
  
  if (studentInputEl) {
    studentInputEl.value = appState.selectedStudent || "";
    if (!appState.selectedStudent) {
      studentInputEl.focus();
    }
  }

  if (studentHintEl) {
    if (appState.selectedStudent) {
      studentHintEl.textContent = `현재 선택된 학생 [${appState.selectedStudent}] 명의로 대출됩니다.`;
    } else {
      studentHintEl.textContent = "아래에 이름을 입력하거나 1단계에서 학생을 선택해 주세요.";
    }
  }

  openModal("borrowModal");
}

/**
 * 반납 확인 모달 열기
 */
function openReturnModal(book) {
  appState.pendingBook = book;

  const modal = document.getElementById("returnModal");
  const bookTitleEl = document.getElementById("returnBookTitle");
  const bookIdEl = document.getElementById("returnBookId");
  const borrowerEl = document.getElementById("returnBorrowerName");
  const returnerInputEl = document.getElementById("returnerStudentInput");

  if (!modal) return;

  const borrower = book.borrower || (book.displayStatus.match(/\((.+)\)/)?.[1] || "학생");
  if (bookTitleEl) bookTitleEl.textContent = book.title;
  if (bookIdEl) bookIdEl.textContent = book.id;
  if (borrowerEl) borrowerEl.textContent = borrower;

  if (returnerInputEl) {
    returnerInputEl.value = appState.selectedStudent || borrower;
  }

  openModal("returnModal");
}

/**
 * 특정 도서의 대여 이력 팝업
 */
function openBookHistoryModal(book) {
  openHistoryModal();
  // 도서별 탭으로 전환 후 해당 도서 필터링
  switchHistoryTab("book");
  const bookFilterSelect = document.getElementById("historyBookFilter");
  if (bookFilterSelect) {
    bookFilterSelect.value = book.id;
    renderBookFilteredHistory(book.id);
  }
}

/**
 * 전체 대여기록 모달 열기
 */
function openHistoryModal() {
  populateHistoryBookFilter();
  populateHistoryStudentFilter();
  renderAllHistory();
  openModal("historyModal");
}

/**
 * 기록 모달 내 탭 전환
 */
function switchHistoryTab(tabName) {
  document.querySelectorAll(".history-tab-btn").forEach(btn => {
    btn.classList.toggle("active", btn.dataset.tab === tabName);
  });

  const allPanel = document.getElementById("historyTabAll");
  const bookPanel = document.getElementById("historyTabBook");
  const studentPanel = document.getElementById("historyTabStudent");

  if (allPanel) allPanel.style.display = tabName === "all" ? "block" : "none";
  if (bookPanel) bookPanel.style.display = tabName === "book" ? "block" : "none";
  if (studentPanel) studentPanel.style.display = tabName === "student" ? "block" : "none";

  if (tabName === "all") renderAllHistory();
  if (tabName === "book") renderBookFilteredHistory();
  if (tabName === "student") renderStudentFilteredHistory();
}

/**
 * 전체 대여기록 타임라인 렌더링
 */
function renderAllHistory() {
  const container = document.getElementById("allHistoryList");
  if (!container) return;

  container.innerHTML = "";

  if (appState.history.length === 0) {
    container.innerHTML = `<div class="empty-desc" style="text-align:center; padding:20px;">대출 및 반납 기록이 아직 없습니다.</div>`;
    return;
  }

  appState.history.forEach(log => {
    const item = document.createElement("div");
    item.className = "log-item";
    item.innerHTML = `
      <div class="log-item-left">
        <span class="log-badge ${escapeHtml(log.action)}">${escapeHtml(log.action)}</span>
        <div class="log-text">
          <span class="log-student">${escapeHtml(log.studentName)}</span> 학생이 
          <span class="log-book">『${escapeHtml(log.bookTitle)}』</span>을(를) ${escapeHtml(log.action)}했습니다.
        </div>
      </div>
      <div class="log-time">${escapeHtml(log.timestamp)}</div>
    `;
    container.appendChild(item);
  });
}

/**
 * 도서별 대여기록 필터 및 렌더링
 */
function populateHistoryBookFilter() {
  const select = document.getElementById("historyBookFilter");
  if (!select) return;

  select.innerHTML = `<option value="">-- 책을 선택해 주세요 --</option>`;
  appState.books.forEach(b => {
    const opt = document.createElement("option");
    opt.value = b.id;
    opt.textContent = `[${b.id}] ${b.title}`;
    select.appendChild(opt);
  });
}

function renderBookFilteredHistory(targetBookId) {
  const select = document.getElementById("historyBookFilter");
  const container = document.getElementById("bookHistoryList");
  const summaryEl = document.getElementById("bookHistorySummary");
  if (!container) return;

  const bookId = targetBookId || select?.value;
  if (!bookId) {
    container.innerHTML = `<div class="empty-desc" style="text-align:center; padding:20px;">위 목록에서 도서를 선택해 주세요.</div>`;
    if (summaryEl) summaryEl.textContent = "";
    return;
  }

  const book = appState.books.find(b => b.id === bookId);
  const logs = appState.history.filter(h => h.bookId === bookId || (book && h.bookTitle === book.title));

  if (summaryEl && book) {
    summaryEl.textContent = `『${book.title}』 총 대여 횟수: ${logs.filter(l => l.action === "대출").length}회`;
  }

  container.innerHTML = "";
  if (logs.length === 0) {
    container.innerHTML = `<div class="empty-desc" style="text-align:center; padding:20px;">이 책의 대여기록이 없습니다.</div>`;
    return;
  }

  logs.forEach(log => {
    const item = document.createElement("div");
    item.className = "log-item";
    item.innerHTML = `
      <div class="log-item-left">
        <span class="log-badge ${escapeHtml(log.action)}">${escapeHtml(log.action)}</span>
        <div class="log-text">
          <span class="log-student">${escapeHtml(log.studentName)}</span> (${escapeHtml(log.timestamp)})
        </div>
      </div>
      <div class="log-time">${escapeHtml(log.action)}</div>
    `;
    container.appendChild(item);
  });
}

/**
 * 학생별 대여기록 필터 및 렌더링 (독서 통계)
 */
function populateHistoryStudentFilter() {
  const select = document.getElementById("historyStudentFilter");
  if (!select) return;

  select.innerHTML = `<option value="">-- 학생을 선택해 주세요 --</option>`;
  appState.students.forEach(st => {
    const opt = document.createElement("option");
    opt.value = st;
    opt.textContent = st;
    select.appendChild(opt);
  });
}

function renderStudentFilteredHistory(targetStudent) {
  const select = document.getElementById("historyStudentFilter");
  const container = document.getElementById("studentHistoryList");
  const summaryEl = document.getElementById("studentHistorySummary");
  if (!container) return;

  const student = targetStudent || select?.value || appState.selectedStudent;
  if (select && student) select.value = student;

  if (!student) {
    container.innerHTML = `<div class="empty-desc" style="text-align:center; padding:20px;">위 목록에서 학생을 선택해 주세요.</div>`;
    if (summaryEl) summaryEl.textContent = "";
    return;
  }

  const logs = appState.history.filter(h => h.studentName === student);
  const borrowCount = logs.filter(l => l.action === "대출").length;

  if (summaryEl) {
    summaryEl.textContent = `👤 [${student}] 학생의 총 대출 권수: ${borrowCount}권`;
  }

  container.innerHTML = "";
  if (logs.length === 0) {
    container.innerHTML = `<div class="empty-desc" style="text-align:center; padding:20px;">대여한 기록이 없습니다.</div>`;
    return;
  }

  logs.forEach(log => {
    const item = document.createElement("div");
    item.className = "log-item";
    item.innerHTML = `
      <div class="log-item-left">
        <span class="log-badge ${escapeHtml(log.action)}">${escapeHtml(log.action)}</span>
        <div class="log-text">
          <span class="log-book">『${escapeHtml(log.bookTitle)}』</span>
        </div>
      </div>
      <div class="log-time">${escapeHtml(log.timestamp)}</div>
    `;
    container.appendChild(item);
  });
}

/**
 * 새 도서 등록
 */
function handleAddBook(e) {
  e.preventDefault();
  const idInput = document.getElementById("newBookId");
  const titleInput = document.getElementById("newBookTitle");

  const id = idInput?.value.trim();
  const title = titleInput?.value.trim();

  if (!id || !title) {
    showToast("도서 번호와 제목을 모두 입력해 주세요.", "error");
    return;
  }

  if (appState.books.some(b => b.id === id)) {
    showToast("이미 등록된 도서 번호입니다.", "error");
    return;
  }

  const newBook = {
    id: id,
    title: title,
    status: "대출가능",
    displayStatus: "대출가능",
    borrower: "",
    updatedAt: formatNow()
  };

  appState.books.unshift(newBook);
  saveLocalBackup();
  renderBooks();
  renderStats();
  closeModal("addBookModal");

  idInput.value = "";
  titleInput.value = "";
  showToast(`📚 새 도서 『${title}』이(가) 추가되었습니다!`, "success");
}

/**
 * 모달 열기/닫기 헬퍼
 */
function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add("open");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove("open");
}

/**
 * 연동 상태 배지 갱신
 */
function updateConnectionBadge() {
  const badge = document.getElementById("connectionBadge");
  if (!badge) return;

  if (appState.gasUrl) {
    badge.className = "status-pill connected";
    badge.innerHTML = `<span class="status-dot"></span> 구글 시트 연동됨 🟢`;
    badge.title = `연동 주소: ${appState.gasUrl} (클릭하여 변경)`;
  } else {
    badge.className = "status-pill demo";
    badge.innerHTML = `<span class="status-dot"></span> 체험 모드 (시트 미연동) 🟡`;
    badge.title = "클릭하여 구글 스프레드시트 앱스크립트 URL을 연결하세요.";
  }
}

/**
 * 로딩 인디케이터
 */
function showLoading(show, message = "처리 중...") {
  const overlay = document.getElementById("loadingOverlay");
  const textEl = document.getElementById("loadingText");
  if (!overlay) return;

  if (show) {
    if (textEl) textEl.textContent = message;
    overlay.style.display = "flex";
  } else {
    overlay.style.display = "none";
  }
}

/**
 * 토스트 알림
 */
function showToast(message, type = "info") {
  const container = document.getElementById("toastContainer");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    toast.style.transition = "all 0.3s";
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

/**
 * 현재 시각 문자열
 */
function formatNow() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  const hh = String(now.getHours()).padStart(2, "0");
  const mm = String(now.getMinutes()).padStart(2, "0");
  const ss = String(now.getSeconds()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}:${ss}`;
}

/**
 * XSS 방지 이스케이프
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * DOM 엘리먼트 캐시 및 이벤트 바인딩
 */
function initElements() {
  // 모달 닫기 버튼 공통
  document.querySelectorAll(".modal-close, .btn-modal-cancel").forEach(btn => {
    btn.addEventListener("click", () => {
      const modal = btn.closest(".modal-overlay");
      if (modal) modal.classList.remove("open");
    });
  });

  // 모달 바깥 배경 클릭 시 닫기
  document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("open");
    });
  });
}

function bindEvents() {
  // 연동 설정 버튼 클릭
  document.getElementById("openSettingsBtn")?.addEventListener("click", () => {
    const urlInput = document.getElementById("gasUrlInput");
    if (urlInput) urlInput.value = appState.gasUrl;
    openModal("settingsModal");
  });

  document.getElementById("connectionBadge")?.addEventListener("click", () => {
    const urlInput = document.getElementById("gasUrlInput");
    if (urlInput) urlInput.value = appState.gasUrl;
    openModal("settingsModal");
  });

  // 연동 설정 저장
  document.getElementById("saveSettingsBtn")?.addEventListener("click", async () => {
    const urlInput = document.getElementById("gasUrlInput");
    const newUrl = urlInput?.value.trim() || "";
    
    appState.gasUrl = newUrl;
    if (newUrl) {
      localStorage.setItem(STORAGE_KEY_GAS_URL, newUrl);
      showToast("구글 시트 연동 URL이 저장되었습니다! 동기화를 시작합니다.", "success");
      closeModal("settingsModal");
      await fetchFromGoogleSheets();
    } else {
      localStorage.removeItem(STORAGE_KEY_GAS_URL);
      showToast("연동이 해제되었습니다. 로컬 데모 모드로 전환합니다.", "info");
      closeModal("settingsModal");
      updateConnectionBadge();
    }
  });

  // 데이터 새로고침 버튼
  document.getElementById("refreshBtn")?.addEventListener("click", () => {
    if (appState.gasUrl) {
      fetchFromGoogleSheets();
    } else {
      showToast("최신 상태를 새로고침했습니다.", "success");
      renderBooks();
      renderStats();
    }
  });

  // 전체 기록 모달 열기 버튼
  document.getElementById("openHistoryBtn")?.addEventListener("click", openHistoryModal);

  // 새 도서 등록 버튼
  document.getElementById("openAddBookBtn")?.addEventListener("click", () => {
    const nextNum = appState.books.length + 1;
    const nextId = "B-" + String(nextNum).padStart(3, "0");
    const idInput = document.getElementById("newBookId");
    if (idInput) idInput.value = nextId;
    openModal("addBookModal");
  });

  document.getElementById("addBookForm")?.addEventListener("submit", handleAddBook);

  // 검색 입력
  document.getElementById("searchInput")?.addEventListener("input", (e) => {
    appState.searchQuery = e.target.value.trim();
    renderBooks();
  });

  // 필터 버튼 클릭
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      appState.currentFilter = btn.dataset.filter;
      renderBooks();
    });
  });

  // 학생 직접 입력 및 추가
  document.getElementById("addCustomStudentBtn")?.addEventListener("click", () => {
    const input = document.getElementById("customStudentInput");
    const name = input?.value.trim();
    if (!name) return;

    if (!appState.students.includes(name)) {
      appState.students.push(name);
      localStorage.setItem(STORAGE_KEY_STUDENTS, JSON.stringify(appState.students));
    }
    selectStudent(name);
    input.value = "";
  });

  document.getElementById("customStudentInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      document.getElementById("addCustomStudentBtn")?.click();
    }
  });

  // 선택된 학생 변경/지우기
  document.getElementById("clearStudentBtn")?.addEventListener("click", clearSelectedStudent);

  // 대출 모달 확인 버튼
  document.getElementById("confirmBorrowBtn")?.addEventListener("click", () => {
    if (!appState.pendingBook) return;
    const studentInput = document.getElementById("borrowStudentInput");
    const studentName = studentInput?.value.trim() || appState.selectedStudent;

    if (!studentName) {
      showToast("학생 이름을 입력해 주세요!", "error");
      studentInput?.focus();
      return;
    }

    // 선택 학생 업데이트
    selectStudent(studentName);
    executeBorrow(appState.pendingBook.id, studentName);
  });

  // 반납 모달 확인 버튼
  document.getElementById("confirmReturnBtn")?.addEventListener("click", () => {
    if (!appState.pendingBook) return;
    const returnerInput = document.getElementById("returnerStudentInput");
    const returnerName = returnerInput?.value.trim();
    executeReturn(appState.pendingBook.id, returnerName);
  });

  // 기록 모달 탭 버튼
  document.querySelectorAll(".history-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      switchHistoryTab(btn.dataset.tab);
    });
  });

  // 기록 모달 도서/학생 필터 변경 시
  document.getElementById("historyBookFilter")?.addEventListener("change", (e) => {
    renderBookFilteredHistory(e.target.value);
  });

  document.getElementById("historyStudentFilter")?.addEventListener("change", (e) => {
    renderStudentFilteredHistory(e.target.value);
  });

  // 초기 예시 데이터 복원 버튼
  document.getElementById("resetDataBtn")?.addEventListener("click", () => {
    if (confirm("기본 예시 도서와 학생 목록으로 초기화하시겠습니까?")) {
      appState.books = [...DEFAULT_BOOKS];
      appState.history = [...DEFAULT_HISTORY];
      appState.students = [...DEFAULT_STUDENTS];
      localStorage.removeItem(STORAGE_KEY_GAS_URL);
      appState.gasUrl = "";
      saveLocalBackup();
      localStorage.setItem(STORAGE_KEY_STUDENTS, JSON.stringify(appState.students));
      updateConnectionBadge();
      renderStudentSelector();
      renderBooks();
      renderStats();
      closeModal("settingsModal");
      showToast("기본 예시 데이터로 초기화되었습니다.", "info");
    }
  });
}
