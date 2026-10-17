/**
 * ==============================================================
 * [학급문고 스마트 대여장] Google Apps Script (code.gs)
 * ==============================================================
 * 
 * 구글 스프레드시트와 학급문고 웹앱(GitHub Pages)을 실시간으로 연결하는 백엔드 스크립트입니다.
 * 
 * [스프레드시트 탭 구성]
 * 1. '도서목록' 탭 : [도서번호, 제목, 상태, 현재대출자, 수정일시]
 * 2. '대여기록' 탭 : [일시, 학생이름, 도서제목, 구분(대출/반납), 도서번호]
 */

// 시트 이름 상수
var SHEET_BOOKS = "도서목록";
var SHEET_LOGS = "대여기록";

/**
 * GET 요청 처리 (웹앱에서 도서 목록 및 대여기록 불러오기)
 */
function doGet(e) {
  try {
    ensureSheetsInitialized();
    var data = getAllData();
    return createJsonResponse({
      success: true,
      message: "데이터를 성공적으로 불러왔습니다.",
      books: data.books,
      history: data.history
    });
  } catch (error) {
    return createJsonResponse({
      success: false,
      error: error.toString()
    });
  }
}

/**
 * POST 요청 처리 (도서 대출, 반납, 초기화 등)
 * GitHub Pages CORS 방지를 위해 클라이언트에서 text/plain;charset=utf-8 로 전송합니다.
 */
function doPost(e) {
  try {
    ensureSheetsInitialized();

    var postData = {};
    if (e && e.postData && e.postData.contents) {
      postData = JSON.parse(e.postData.contents);
    }

    var action = postData.action;

    if (action === "borrow") {
      return handleBorrow(postData);
    } else if (action === "return") {
      return handleReturn(postData);
    } else if (action === "initSheet") {
      resetAndSeedSampleData();
      var data = getAllData();
      return createJsonResponse({
        success: true,
        message: "시트가 성공적으로 초기화되었습니다.",
        books: data.books,
        history: data.history
      });
    } else if (action === "getBooks") {
      var allData = getAllData();
      return createJsonResponse({
        success: true,
        books: allData.books,
        history: allData.history
      });
    } else {
      return createJsonResponse({
        success: false,
        error: "지원하지 않는 요청(action)입니다: " + action
      });
    }
  } catch (error) {
    return createJsonResponse({
      success: false,
      error: error.toString()
    });
  }
}

/**
 * 도서 대출 처리
 */
function handleBorrow(data) {
  var bookId = String(data.bookId || "").trim();
  var studentName = String(data.studentName || "").trim();

  if (!bookId || !studentName) {
    return createJsonResponse({
      success: false,
      error: "도서번호와 학생이름이 모두 필요합니다."
    });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var bookSheet = ss.getSheetByName(SHEET_BOOKS);
  var logSheet = ss.getSheetByName(SHEET_LOGS);

  var bookData = bookSheet.getDataRange().getValues();
  var targetRow = -1;
  var bookTitle = "";
  var currentStatus = "";

  for (var i = 1; i < bookData.length; i++) {
    if (String(bookData[i][0]).trim() === bookId) {
      targetRow = i + 1; // 1-indexed row number
      bookTitle = bookData[i][1];
      currentStatus = String(bookData[i][2]);
      break;
    }
  }

  if (targetRow === -1) {
    return createJsonResponse({
      success: false,
      error: "해당 도서번호(" + bookId + ")를 찾을 수 없습니다."
    });
  }

  // 이미 대출 중인지 확인
  if (currentStatus.indexOf("대출중") !== -1) {
    return createJsonResponse({
      success: false,
      error: "이미 대출 중인 도서입니다: " + bookTitle
    });
  }

  var nowStr = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");

  // 1. 도서목록 갱신: 상태(대출중(학생이름)), 현재대출자, 수정일시
  var statusText = "대출중(" + studentName + ")";
  bookSheet.getRange(targetRow, 3).setValue(statusText); // 상태 컬럼
  bookSheet.getRange(targetRow, 4).setValue(studentName); // 현재대출자 컬럼
  bookSheet.getRange(targetRow, 5).setValue(nowStr);      // 수정일시

  // 2. 대여기록 시트에 추가: [일시, 학생이름, 도서제목, 구분, 도서번호]
  logSheet.appendRow([nowStr, studentName, bookTitle, "대출", bookId]);

  var updatedData = getAllData();
  return createJsonResponse({
    success: true,
    message: "[" + bookTitle + "] 대출이 완료되었습니다! (" + studentName + ")",
    books: updatedData.books,
    history: updatedData.history
  });
}

/**
 * 도서 반납 처리
 */
function handleReturn(data) {
  var bookId = String(data.bookId || "").trim();
  var studentName = String(data.studentName || "").trim();

  if (!bookId) {
    return createJsonResponse({
      success: false,
      error: "반납할 도서번호가 필요합니다."
    });
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var bookSheet = ss.getSheetByName(SHEET_BOOKS);
  var logSheet = ss.getSheetByName(SHEET_LOGS);

  var bookData = bookSheet.getDataRange().getValues();
  var targetRow = -1;
  var bookTitle = "";
  var borrower = "";

  for (var i = 1; i < bookData.length; i++) {
    if (String(bookData[i][0]).trim() === bookId) {
      targetRow = i + 1;
      bookTitle = bookData[i][1];
      borrower = bookData[i][3] || "";
      break;
    }
  }

  if (targetRow === -1) {
    return createJsonResponse({
      success: false,
      error: "해당 도서번호(" + bookId + ")를 찾을 수 없습니다."
    });
  }

  var nowStr = Utilities.formatDate(new Date(), "Asia/Seoul", "yyyy-MM-dd HH:mm:ss");
  var actualStudent = studentName || borrower || "학생";

  // 1. 도서목록 갱신: 상태('대출가능'), 현재대출자(''), 수정일시
  bookSheet.getRange(targetRow, 3).setValue("대출가능");
  bookSheet.getRange(targetRow, 4).setValue("");
  bookSheet.getRange(targetRow, 5).setValue(nowStr);

  // 2. 대여기록 시트에 추가: [일시, 학생이름, 도서제목, 구분, 도서번호]
  logSheet.appendRow([nowStr, actualStudent, bookTitle, "반납", bookId]);

  var updatedData = getAllData();
  return createJsonResponse({
    success: true,
    message: "[" + bookTitle + "] 반납이 완료되었습니다. 고맙습니다!",
    books: updatedData.books,
    history: updatedData.history
  });
}

/**
 * 전체 도서 목록 및 대여 기록 조회
 */
function getAllData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var bookSheet = ss.getSheetByName(SHEET_BOOKS);
  var logSheet = ss.getSheetByName(SHEET_LOGS);

  var books = [];
  var bookRows = bookSheet.getDataRange().getValues();
  for (var i = 1; i < bookRows.length; i++) {
    var row = bookRows[i];
    if (!row[0] && !row[1]) continue;

    var rawStatus = String(row[2] || "대출가능").trim();
    var borrower = String(row[3] || "").trim();

    // 상태 텍스트에서 학생 이름 추출 지원 (예: '대출중(김민준)')
    if (!borrower && rawStatus.indexOf("대출중(") === 0) {
      var match = rawStatus.match(/대출중\((.+)\)/);
      if (match && match[1]) {
        borrower = match[1];
      }
    }

    var isBorrowed = rawStatus.indexOf("대출중") !== -1;

    books.push({
      id: String(row[0]).trim(),
      title: String(row[1]).trim(),
      status: isBorrowed ? "대출중" : "대출가능",
      displayStatus: isBorrowed ? (borrower ? "대출중(" + borrower + ")" : "대출중") : "대출가능",
      borrower: borrower,
      updatedAt: row[4] ? String(row[4]) : ""
    });
  }

  var history = [];
  var logRows = logSheet.getDataRange().getValues();
  // 역순 정렬 (최신순)
  for (var j = logRows.length - 1; j >= 1; j--) {
    var lrow = logRows[j];
    if (!lrow[0] && !lrow[1] && !lrow[2]) continue;

    history.push({
      timestamp: String(lrow[0] || ""),
      studentName: String(lrow[1] || ""),
      bookTitle: String(lrow[2] || ""),
      action: String(lrow[3] || ""),
      bookId: String(lrow[4] || "")
    });
  }

  return {
    books: books,
    history: history
  };
}

/**
 * 시트가 없을 경우 자동 생성 및 기본 헤더 구성
 */
function ensureSheetsInitialized() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var bookSheet = ss.getSheetByName(SHEET_BOOKS);
  if (!bookSheet) {
    bookSheet = ss.insertSheet(SHEET_BOOKS);
    bookSheet.getRange(1, 1, 1, 5).setValues([["도서번호", "제목", "상태", "현재대출자", "수정일시"]]);
    bookSheet.getRange(1, 1, 1, 5).setBackground("#e8f0fe").setFontWeight("bold");
    bookSheet.setFrozenRows(1);

    // 기본 예시 도서 등록
    var sampleBooks = [
      ["B-001", "어린 왕자", "대출가능", "", ""],
      ["B-002", "마법천자문 1권", "대출가능", "", ""],
      ["B-003", "불편한 편의점", "대출중(김민준)", "김민준", "2026-10-15 09:30:00"],
      ["B-004", "이상한 과자 가게 전천당 1", "대출가능", "", ""],
      ["B-005", "지구용사 어린이 환경 사전", "대출가능", "", ""],
      ["B-006", "흔한남매 1", "대출중(이서아)", "이서아", "2026-10-16 11:20:00"],
      ["B-007", "초등 글쓰기 비밀 수첩", "대출가능", "", ""],
      ["B-008", "만화 그리스 로마 신화 1", "대출가능", "", ""]
    ];
    bookSheet.getRange(2, 1, sampleBooks.length, 5).setValues(sampleBooks);
  }

  var logSheet = ss.getSheetByName(SHEET_LOGS);
  if (!logSheet) {
    logSheet = ss.insertSheet(SHEET_LOGS);
    logSheet.getRange(1, 1, 1, 5).setValues([["일시", "학생이름", "도서제목", "구분", "도서번호"]]);
    logSheet.getRange(1, 1, 1, 5).setBackground("#fce8e6").setFontWeight("bold");
    logSheet.setFrozenRows(1);

    // 기본 예시 대여기록 등록
    var sampleLogs = [
      ["2026-10-15 09:30:00", "김민준", "불편한 편의점", "대출", "B-003"],
      ["2026-10-16 11:20:00", "이서아", "흔한남매 1", "대출", "B-006"]
    ];
    logSheet.getRange(2, 1, sampleLogs.length, 5).setValues(sampleLogs);
  }
}

/**
 * 초기 예시 데이터로 리셋 (테스트용)
 */
function resetAndSeedSampleData() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  
  var bookSheet = ss.getSheetByName(SHEET_BOOKS);
  if (bookSheet) ss.deleteSheet(bookSheet);
  
  var logSheet = ss.getSheetByName(SHEET_LOGS);
  if (logSheet) ss.deleteSheet(logSheet);
  
  ensureSheetsInitialized();
}

/**
 * JSON 응답 생성 헬퍼
 */
function createJsonResponse(data) {
  var output = ContentService.createTextOutput(JSON.stringify(data));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
