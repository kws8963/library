/**
 * ==============================================================
 * 학급문고 스마트 서가 (Classroom Smart Library) - script.js
 * Google Apps Script Web App 연동 및 GitHub Pages 호환 클라이언트 로직
 * ==============================================================
 */

// 로컬 스토리지 키
const STORAGE_KEY_GAS_URL = "smart_library_gas_url";
const STORAGE_KEY_STUDENTS = "smart_library_students";
const STORAGE_KEY_SELECTED_STUDENT = "smart_library_selected_student";
const STORAGE_KEY_LOCAL_BOOKS = "smart_library_local_books";
const STORAGE_KEY_LOCAL_HISTORY = "smart_library_local_history";

// 기본 예시 데이터
const DEFAULT_STUDENTS = [
  "강민준", "김서연", "박도윤", "이하윤", "최시우",
  "정지호", "윤수아", "임지유", "한예준", "오채원",
  "신은우", "송다은", "조유준", "백서아", "권태양"
];

const DEFAULT_BOOKS = [
  { id: "B-001", title: "어린 왕자", status: "대출가능", displayStatus: "대출가능", borrower: "", updatedAt: "" },
  { id: "B-002", title: "마법천자문 1권 (바람풍편)", status: "대출가능", displayStatus: "대출가능", borrower: "", updatedAt: "" },
  { id: "B-003", title: "불편한 편의점 (청소년판)", status: "대출중", displayStatus: "대출중(강민준)", borrower: "강민준", updatedAt: "2026-10-15 09:30:00" },
  { id: "B-004", title: "이상한 과자 가게 전천당 1", status: "대출가능", displayStatus: "대출가능", borrower: "", updatedAt: "" },
  { id: "B-005", title: "지구용사 어린이 환경 백과", status: "대출가능", displayStatus: "대출가능", borrower: "", updatedAt: "" },
  { id: "B-006", title: "흔한남매 1", status: "대출중", displayStatus: "대출중(김서연)", borrower: "김서연", updatedAt: "2026-10-16 11:20:00" },
  { id: "B-007", title: "초등 글쓰기 비밀 수첩", status: "대출가능", displayStatus: "대출가능", borrower: "", updatedAt: "" },
  { id: "B-008", title: "만화 그리스 로마 신화 1", status: "대출가능", displayStatus: "대출가능", borrower: "", updatedAt: "" },
  { id: "B-009", title: "아홉 살 마음 사전", status: "대출가능", displayStatus: "대출가능", borrower: "", updatedAt: "" },
  { id: "B-010", title: "수학특성화중학교 1", status: "대출가능", displayStatus: "대출가능", borrower: "", updatedAt: "" }
];

const DEFAULT_HISTORY = [
  { timestamp: "2026-10-15 09:30:00", studentName: "강민준", bookTitle: "불편한 편의점 (청소년판)", action: "대출", bookId: "B-003" },
  { timestamp: "2026-10-16 11:20:00", studentName: "김서연", bookTitle: "흔한남매 1", action: "대출", bookId: "B-006" }
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
  isDeleteMode: false,
  pendingBook: null // 대출/반납 대상 도서
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
    await fetchFromGoogleSheets();
  } else {
    const cachedBooks = localStorage.getItem(STORAGE_KEY_LOCAL_BOOKS);
    const cachedHistory = localStorage.getItem(STORAGE_KEY_LOCAL_HISTORY);

    appState.books = cachedBooks ? JSON.parse(cachedBooks) : DEFAULT_BOOKS;
    appState.history = cachedHistory ? JSON.parse(cachedHistory) : DEFAULT_HISTORY;
    renderBooks();
    renderStats();
  }
}

/**
 * 구글 앱스크립트 통신 (CORS 방지 Content-Type: text/plain;charset=utf-8)
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
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`HTTP 상태 코드 오류: ${response.status}`);
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
    const response = await fetch(appState.gasUrl + (appState.gasUrl.includes("?") ? "&" : "?") + "action=getBooks&t=" + Date.now());
    const data = await response.json();

    if (data && data.success) {
      appState.books = data.books || [];
      appState.history = data.history || [];
      saveLocalBackup();
      showToast("구글 시트와 최신 상태가 동기화되었습니다. 🟢", "success");
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
        showToast("구글 시트와 연결되었습니다. 🟢", "success");
      }
    } catch (postError) {
      console.error("구글 시트 통신 오류:", postError);
      showToast("구글 시트 연결 실패. URL 및 배포 권한('모든 사용자')을 확인해 주세요.", "error");
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
    showToast("대출할 학생을 선택해 주세요! 👤", "error");
    return;
  }

  const book = appState.books.find(b => b.id === bookId);
  if (!book) return;

  if (book.status === "대출중") {
    showToast(`이미 대출 중인 책입니다. (${book.borrower || "다른 학생"})`, "error");
    return;
  }

  const now = formatNow();

  if (appState.gasUrl) {
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
        showToast(`📖 『${book.title}』 대출 완료! (${studentName} 학생)`, "success");
      } else {
        throw new Error(res.error || "대출 처리에 실패했습니다.");
      }
    } catch (error) {
      showToast(`대출 오류: ${error.message}`, "error");
      return;
    }
  } else {
    // 로컬 데모 모드
    book.status = "대출중";
    book.borrower = studentName;
    book.displayStatus = `대출중(${studentName})`;
    book.updatedAt = now; // 대출 시간 기록

    appState.history.unshift({
      timestamp: now,
      studentName: studentName,
      bookTitle: book.title,
      action: "대출",
      bookId: book.id
    });

    saveLocalBackup();
    showToast(`📖 [체험모드] 『${book.title}』 대출 완료! (${studentName} 학생)`, "success");
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
  const now = formatNow();

  if (appState.gasUrl) {
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
        showToast(`✅ 『${book.title}』 반납 완료! 소중히 읽어주셔서 감사합니다.`, "success");
      } else {
        throw new Error(res.error || "반납 처리에 실패했습니다.");
      }
    } catch (error) {
      showToast(`반납 오류: ${error.message}`, "error");
      return;
    }
  } else {
    // 로컬 데모 모드
    book.status = "대출가능";
    book.borrower = "";
    book.displayStatus = "대출가능";
    book.updatedAt = "";

    appState.history.unshift({
      timestamp: now,
      studentName: actualStudent,
      bookTitle: book.title,
      action: "반납",
      bookId: book.id
    });

    saveLocalBackup();
    showToast(`✅ [체험모드] 『${book.title}』 반납 완료!`, "success");
  }

  closeModal("returnModal");
  renderBooks();
  renderStats();
}

/**
 * 특정 도서의 '대출 시간' 가져오기 (반납 시기는 제외)
 */
function getBookBorrowTime(book) {
  if (book.status !== "대출중") return "";

  // 1. 책 데이터의 updatedAt 확인
  if (book.updatedAt && String(book.updatedAt).trim() !== "") {
    return String(book.updatedAt).trim();
  }

  // 2. 대여기록에서 해당 도서의 가장 최근 '대출' 일시 찾기
  const latestBorrowLog = appState.history.find(h => 
    (h.bookId === book.id || h.bookTitle === book.title) && h.action === "대출"
  );

  if (latestBorrowLog && latestBorrowLog.timestamp) {
    return latestBorrowLog.timestamp;
  }

  return "시간 정보 없음";
}

/**
 * 로컬 스토리지에 캐시 백업
 */
function saveLocalBackup() {
  localStorage.setItem(STORAGE_KEY_LOCAL_BOOKS, JSON.stringify(appState.books));
  localStorage.setItem(STORAGE_KEY_LOCAL_HISTORY, JSON.stringify(appState.history));
  localStorage.setItem(STORAGE_KEY_STUDENTS, JSON.stringify(appState.students));
}

/**
 * 1단계 학생 선택 및 삭제 렌더링
 */
function renderStudentSelector() {
  const container = document.getElementById("studentChipsContainer");
  const selectedDisplay = document.getElementById("selectedStudentDisplay");
  const selectedName = document.getElementById("selectedStudentName");
  const banner = document.getElementById("deleteModeBanner");
  const toggleBtn = document.getElementById("toggleDeleteModeBtn");

  if (!container) return;

  if (banner) banner.style.display = appState.isDeleteMode ? "flex" : "none";
  if (toggleBtn) {
    toggleBtn.textContent = appState.isDeleteMode ? "✕ 삭제 모드 종료" : "🗑️ 빠른 삭제 모드";
    toggleBtn.classList.toggle("btn-danger-outline", appState.isDeleteMode);
  }

  container.innerHTML = "";

  if (appState.students.length === 0) {
    container.innerHTML = `<div style="font-size: 0.85rem; color: var(--ink-500); padding: 8px;">등록된 학생이 없습니다. 아래 입력창에서 학생을 등록해 주세요.</div>`;
  } else {
    appState.students.forEach((name, idx) => {
      const isSelected = appState.selectedStudent === name;

      const wrap = document.createElement("div");
      wrap.className = `student-chip-wrap ${isSelected ? "active" : ""}`;

      // 선택 버튼
      const chipBtn = document.createElement("button");
      chipBtn.type = "button";
      chipBtn.className = "student-chip-btn";
      chipBtn.innerHTML = `<span class="student-chip-num">${idx + 1}.</span> <strong>${escapeHtml(name)}</strong>`;
      chipBtn.onclick = () => selectStudent(name);

      wrap.appendChild(chipBtn);

      // 개별 삭제 버튼 (상시 노출 또는 삭제 모드 시 더욱 명확히 동작)
      const delBtn = document.createElement("button");
      delBtn.type = "button";
      delBtn.className = "student-chip-del";
      delBtn.title = `${name} 학생을 명단에서 삭제`;
      delBtn.innerHTML = `✕`;
      delBtn.onclick = (e) => {
        e.stopPropagation();
        deleteStudent(name);
      };

      wrap.appendChild(delBtn);
      container.appendChild(wrap);
    });
  }

  if (appState.selectedStudent && appState.students.includes(appState.selectedStudent)) {
    if (selectedName) selectedName.textContent = appState.selectedStudent;
    if (selectedDisplay) selectedDisplay.style.display = "flex";
  } else {
    if (selectedDisplay) selectedDisplay.style.display = "none";
  }

  renderManageStudentsModalList();
}

/**
 * 학생 명단 관리 모달 내 리스트 렌더링
 */
function renderManageStudentsModalList() {
  const listEl = document.getElementById("studentManageList");
  if (!listEl) return;

  listEl.innerHTML = "";

  if (appState.students.length === 0) {
    listEl.innerHTML = `<div style="text-align: center; color: var(--ink-500); padding: 20px;">등록된 학생이 없습니다.</div>`;
    return;
  }

  appState.students.forEach((name, idx) => {
    const row = document.createElement("div");
    row.className = "student-manage-row";
    row.innerHTML = `
      <div style="display:flex; align-items:center; gap:8px;">
        <span style="font-size:0.8rem; color:var(--ink-400); width:24px;">${idx + 1}.</span>
        <strong style="color:var(--ink-900);">${escapeHtml(name)}</strong>
      </div>
      <button type="button" class="btn btn-sm btn-danger-outline btn-del-student" data-name="${escapeHtml(name)}">
        삭제
      </button>
    `;

    row.querySelector(".btn-del-student").addEventListener("click", () => {
      deleteStudent(name);
    });

    listEl.appendChild(row);
  });
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
 * 학생 삭제 액션 (목록에서 삭제)
 */
function deleteStudent(studentName) {
  if (!confirm(`'${studentName}' 학생을 명단에서 삭제하시겠습니까?`)) {
    return;
  }

  appState.students = appState.students.filter(s => s !== studentName);
  localStorage.setItem(STORAGE_KEY_STUDENTS, JSON.stringify(appState.students));

  if (appState.selectedStudent === studentName) {
    appState.selectedStudent = "";
    localStorage.removeItem(STORAGE_KEY_SELECTED_STUDENT);
  }

  renderStudentSelector();
  showToast(`'${studentName}' 학생이 명단에서 삭제되었습니다.`, "info");
}

/**
 * 학생 신규 추가
 */
function addStudent(name) {
  const trimmed = (name || "").trim();
  if (!trimmed) {
    showToast("학생 이름을 입력해 주세요.", "error");
    return false;
  }

  if (appState.students.includes(trimmed)) {
    showToast("이미 명단에 등록된 학생입니다.", "error");
    selectStudent(trimmed);
    return false;
  }

  appState.students.push(trimmed);
  localStorage.setItem(STORAGE_KEY_STUDENTS, JSON.stringify(appState.students));
  selectStudent(trimmed);
  showToast(`'${trimmed}' 학생이 명단에 등록되었습니다.`, "success");
  return true;
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
 * (2단계: 대출한 시간 노출, 반납 시기는 노출 금지)
 */
function renderBooks() {
  const grid = document.getElementById("booksGrid");
  const emptyState = document.getElementById("emptyState");
  if (!grid) return;

  grid.innerHTML = "";

  let filtered = appState.books.filter(book => {
    if (appState.currentFilter === "available" && book.status === "대출중") return false;
    if (appState.currentFilter === "borrowed" && book.status !== "대출중") return false;

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
    const borrowTime = getBookBorrowTime(book);

    const card = document.createElement("div");
    card.className = `book-card ${isBorrowed ? "is-borrowed" : ""}`;

    // 상태 배지 (대표 서점의 정갈한 서가 스타일)
    const statusBadgeHtml = isBorrowed
      ? `<span class="book-status-badge borrowed">대출중 · ${escapeHtml(borrowerName || "학생")}</span>`
      : `<span class="book-status-badge available">대출가능</span>`;

    // 🌟 대출 시간 노출 (반납 시기는 절대 노출하지 않음)
    const borrowTimeHtml = isBorrowed && borrowTime
      ? `<div class="book-borrow-time">
          <span class="time-icon">🕒</span>
          <span>대출 일시: <strong>${escapeHtml(borrowTime)}</strong></span>
        </div>`
      : "";

    card.innerHTML = `
      <div>
        <div class="book-card-top">
          <span class="book-id-badge">${escapeHtml(book.id)}</span>
          ${statusBadgeHtml}
        </div>
        <div class="book-card-body" style="margin-top: 14px;">
          <div class="book-cover-frame">${isBorrowed ? "📕" : "📗"}</div>
          <div class="book-meta">
            <h4 class="book-title" title="${escapeHtml(book.title)}">${escapeHtml(book.title)}</h4>
            ${isBorrowed ? `<div class="book-borrower-hint">👤 대출자: <strong>${escapeHtml(borrowerName)}</strong></div>` : ""}
            ${borrowTimeHtml}
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
 * 대출 확인 모달 열기
 * (텍스트 입력 대신 위에 등록된 학생 목록 드롭다운으로 선택하도록 구현)
 */
function openBorrowModal(book) {
  appState.pendingBook = book;

  const bookTitleEl = document.getElementById("borrowBookTitle");
  const bookIdEl = document.getElementById("borrowBookId");
  const studentSelectEl = document.getElementById("borrowStudentSelect");

  if (bookTitleEl) bookTitleEl.textContent = book.title;
  if (bookIdEl) bookIdEl.textContent = book.id;

  // 학생 명단 옵션 동적 채우기
  if (studentSelectEl) {
    studentSelectEl.innerHTML = "";

    if (appState.students.length === 0) {
      const opt = document.createElement("option");
      opt.value = "";
      opt.textContent = "-- 등록된 학생이 없습니다 (1단계에서 등록 필요) --";
      studentSelectEl.appendChild(opt);
    } else {
      const defaultOpt = document.createElement("option");
      defaultOpt.value = "";
      defaultOpt.textContent = "-- 대출할 학생을 선택하세요 --";
      studentSelectEl.appendChild(defaultOpt);

      appState.students.forEach((st, idx) => {
        const opt = document.createElement("option");
        opt.value = st;
        opt.textContent = `${idx + 1}번 ${st}`;
        if (appState.selectedStudent && appState.selectedStudent === st) {
          opt.selected = true;
        }
        studentSelectEl.appendChild(opt);
      });
    }
  }

  openModal("borrowModal");
}

/**
 * 반납 확인 모달 열기
 */
function openReturnModal(book) {
  appState.pendingBook = book;

  const bookTitleEl = document.getElementById("returnBookTitle");
  const bookIdEl = document.getElementById("returnBookId");
  const borrowerEl = document.getElementById("returnBorrowerName");
  const borrowTimeEl = document.getElementById("returnBorrowTime");
  const returnerSelectEl = document.getElementById("returnerStudentSelect");

  const borrower = book.borrower || (book.displayStatus.match(/\((.+)\)/)?.[1] || "학생");
  const borrowTime = getBookBorrowTime(book);

  if (bookTitleEl) bookTitleEl.textContent = book.title;
  if (bookIdEl) bookIdEl.textContent = book.id;
  if (borrowerEl) borrowerEl.textContent = borrower;
  if (borrowTimeEl) borrowTimeEl.textContent = borrowTime || "기록 없음";

  if (returnerSelectEl) {
    returnerSelectEl.innerHTML = "";
    
    // 대출자 본인 옵션
    const defaultOpt = document.createElement("option");
    defaultOpt.value = borrower;
    defaultOpt.textContent = `대출자 본인 (${borrower})`;
    returnerSelectEl.appendChild(defaultOpt);

    // 전체 학생 옵션
    appState.students.forEach(st => {
      if (st !== borrower) {
        const opt = document.createElement("option");
        opt.value = st;
        opt.textContent = `${st}`;
        if (appState.selectedStudent === st) opt.selected = true;
        returnerSelectEl.appendChild(opt);
      }
    });
  }

  openModal("returnModal");
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
 * 특정 도서의 대여 이력 팝업
 */
function openBookHistoryModal(book) {
  openHistoryModal();
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
      <div style="display:flex; align-items:center; gap:10px; min-width:0;">
        <span class="log-badge ${escapeHtml(log.action)}">${escapeHtml(log.action)}</span>
        <div style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          <span class="log-student">${escapeHtml(log.studentName)}</span> 학생이 
          <span class="log-book">『${escapeHtml(log.bookTitle)}』</span>을(를) ${escapeHtml(log.action)}했습니다.
        </div>
      </div>
      <div class="log-time">${escapeHtml(log.timestamp)}</div>
    `;
    container.appendChild(item);
  });
}

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
      <div style="display:flex; align-items:center; gap:10px;">
        <span class="log-badge ${escapeHtml(log.action)}">${escapeHtml(log.action)}</span>
        <div>
          <span class="log-student">${escapeHtml(log.studentName)}</span> (${escapeHtml(log.timestamp)})
        </div>
      </div>
      <div class="log-time">${escapeHtml(log.action)}</div>
    `;
    container.appendChild(item);
  });
}

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
      <div style="display:flex; align-items:center; gap:10px;">
        <span class="log-badge ${escapeHtml(log.action)}">${escapeHtml(log.action)}</span>
        <div>
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
    updatedAt: ""
  };

  appState.books.unshift(newBook);
  saveLocalBackup();
  renderBooks();
  renderStats();
  closeModal("addBookModal");

  idInput.value = "";
  titleInput.value = "";
  showToast(`📚 새 도서 『${title}』이(가) 등록되었습니다!`, "success");
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.add("open");
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (modal) modal.classList.remove("open");
}

function updateConnectionBadge() {
  const badge = document.getElementById("connectionBadge");
  if (!badge) return;

  if (appState.gasUrl) {
    badge.className = "status-pill connected";
    badge.innerHTML = `<span class="status-dot"></span> 구글 시트 연동됨 🟢`;
    badge.title = `연동 주소: ${appState.gasUrl}`;
  } else {
    badge.className = "status-pill demo";
    badge.innerHTML = `<span class="status-dot"></span> 체험 모드 (미연동) 🟡`;
    badge.title = "클릭하여 구글 시트 웹 앱 URL을 연결하세요.";
  }
}

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

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function initElements() {
  document.querySelectorAll(".modal-close, .btn-modal-cancel").forEach(btn => {
    btn.addEventListener("click", () => {
      const modal = btn.closest(".modal-overlay");
      if (modal) modal.classList.remove("open");
    });
  });

  document.querySelectorAll(".modal-overlay").forEach(overlay => {
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.classList.remove("open");
    });
  });
}

function bindEvents() {
  // 빠른 삭제 모드 토글
  document.getElementById("toggleDeleteModeBtn")?.addEventListener("click", () => {
    appState.isDeleteMode = !appState.isDeleteMode;
    renderStudentSelector();
  });

  document.getElementById("closeDeleteModeBtn")?.addEventListener("click", () => {
    appState.isDeleteMode = false;
    renderStudentSelector();
  });

  // 학생 명단 관리 모달 열기
  document.getElementById("openManageStudentsBtn")?.addEventListener("click", () => {
    renderManageStudentsModalList();
    openModal("manageStudentsModal");
  });

  // 학생 명단 관리 모달 내 추가
  document.getElementById("modalAddStudentBtn")?.addEventListener("click", () => {
    const input = document.getElementById("modalNewStudentInput");
    if (input && addStudent(input.value)) {
      input.value = "";
    }
  });

  document.getElementById("modalNewStudentInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      document.getElementById("modalAddStudentBtn")?.click();
    }
  });

  // 메인 화면 학생 추가
  document.getElementById("addCustomStudentBtn")?.addEventListener("click", () => {
    const input = document.getElementById("customStudentInput");
    if (input && addStudent(input.value)) {
      input.value = "";
    }
  });

  document.getElementById("customStudentInput")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      document.getElementById("addCustomStudentBtn")?.click();
    }
  });

  document.getElementById("clearStudentBtn")?.addEventListener("click", clearSelectedStudent);

  // 연동 설정
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

  document.getElementById("saveSettingsBtn")?.addEventListener("click", async () => {
    const urlInput = document.getElementById("gasUrlInput");
    const newUrl = urlInput?.value.trim() || "";

    appState.gasUrl = newUrl;
    if (newUrl) {
      localStorage.setItem(STORAGE_KEY_GAS_URL, newUrl);
      showToast("구글 시트 연동 URL이 저장되었습니다. 동기화를 진행합니다.", "success");
      closeModal("settingsModal");
      await fetchFromGoogleSheets();
    } else {
      localStorage.removeItem(STORAGE_KEY_GAS_URL);
      showToast("연동이 해제되었습니다. 체험 모드로 전환합니다.", "info");
      closeModal("settingsModal");
      updateConnectionBadge();
    }
  });

  // 새로고침
  document.getElementById("refreshBtn")?.addEventListener("click", () => {
    if (appState.gasUrl) {
      fetchFromGoogleSheets();
    } else {
      showToast("도서 및 학생 상태를 새로고침했습니다.", "success");
      renderBooks();
      renderStats();
    }
  });

  // 기록 모달 열기
  document.getElementById("openHistoryBtn")?.addEventListener("click", openHistoryModal);

  // 새 도서 등록
  document.getElementById("openAddBookBtn")?.addEventListener("click", () => {
    const nextNum = appState.books.length + 1;
    const nextId = "B-" + String(nextNum).padStart(3, "0");
    const idInput = document.getElementById("newBookId");
    if (idInput) idInput.value = nextId;
    openModal("addBookModal");
  });

  document.getElementById("addBookForm")?.addEventListener("submit", handleAddBook);

  // 검색
  document.getElementById("searchInput")?.addEventListener("input", (e) => {
    appState.searchQuery = e.target.value.trim();
    renderBooks();
  });

  // 필터
  document.querySelectorAll(".filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      appState.currentFilter = btn.dataset.filter;
      renderBooks();
    });
  });

  // 대출 완료 버튼 (드롭다운 선택 학생 사용)
  document.getElementById("confirmBorrowBtn")?.addEventListener("click", () => {
    if (!appState.pendingBook) return;
    const studentSelect = document.getElementById("borrowStudentSelect");
    const studentName = studentSelect?.value;

    if (!studentName) {
      showToast("대출할 학생을 선택해 주세요!", "error");
      studentSelect?.focus();
      return;
    }

    selectStudent(studentName);
    executeBorrow(appState.pendingBook.id, studentName);
  });

  // 반납 완료 버튼
  document.getElementById("confirmReturnBtn")?.addEventListener("click", () => {
    if (!appState.pendingBook) return;
    const returnerSelect = document.getElementById("returnerStudentSelect");
    const returnerName = returnerSelect?.value;
    executeReturn(appState.pendingBook.id, returnerName);
  });

  // 기록 탭 전환
  document.querySelectorAll(".history-tab-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      switchHistoryTab(btn.dataset.tab);
    });
  });

  document.getElementById("historyBookFilter")?.addEventListener("change", (e) => {
    renderBookFilteredHistory(e.target.value);
  });

  document.getElementById("historyStudentFilter")?.addEventListener("change", (e) => {
    renderStudentFilteredHistory(e.target.value);
  });

  // 초기 예시 데이터 복원
  document.getElementById("resetDataBtn")?.addEventListener("click", () => {
    if (confirm("기본 예시 도서와 학생 목록으로 초기화하시겠습니까?")) {
      appState.books = [...DEFAULT_BOOKS];
      appState.history = [...DEFAULT_HISTORY];
      appState.students = [...DEFAULT_STUDENTS];
      localStorage.removeItem(STORAGE_KEY_GAS_URL);
      appState.gasUrl = "";
      saveLocalBackup();
      updateConnectionBadge();
      renderStudentSelector();
      renderBooks();
      renderStats();
      closeModal("settingsModal");
      showToast("기본 예시 데이터로 초기화되었습니다.", "info");
    }
  });
}
