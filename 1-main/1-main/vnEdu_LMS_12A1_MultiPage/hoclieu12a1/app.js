import { initializeApp } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-app.js";
import { getAnalytics, isSupported as isAnalyticsSupported } from "https://www.gstatic.com/firebasejs/10.9.0/firebase-analytics.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  signOut,
  updateProfile
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  addDoc,
  deleteDoc,
  query,
  orderBy,
  limit,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.9.0/firebase-firestore.js";

import {
  QUESTION_TYPES,
  PART_TITLES,
  MCQ_LETTERS,
  TF_STATEMENT_KEYS,
  TRUE_FALSE_PROGRESSIVE_TABLE,
  readExamFileAsText,
  parseExamDocument,
  parseAnswerKeyDocument,
  applyAnswerKeyToQuestions,
  gradeExam,
  gradeQuestion,
  createBlankQuestion,
  convertQuestionType,
  describeCorrectAnswer,
  formatOptionLabel,
  normalizeQuestionSchema,
  buildSampleExamText,
  buildSampleAnswerKeyText,
  escapeHtml
} from "./exam-engine.js";

/* ==========================================================================
   1. CẤU HÌNH FIREBASE & RBAC CONSTANTS
   ========================================================================== */
const firebaseConfig = {
  apiKey: "AIzaSyB9WlPDTDFxhTLCnxGft2bq-hHEDgHk9e8",
  authDomain: "a11hoclieu.firebaseapp.com",
  databaseURL: "https://a11hoclieu-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "a11hoclieu",
  storageBucket: "a11hoclieu.firebasestorage.app",
  messagingSenderId: "9776763429",
  appId: "1:9776763429:web:5a5d18050411f1b8c3e5cc",
  measurementId: "G-0K7JQDLTYW"
};

const app = initializeApp(firebaseConfig);
isAnalyticsSupported()
  .then((supported) => {
    if (supported) getAnalytics(app);
  })
  .catch(() => {});

const auth = getAuth(app);
const db = getFirestore(app);

// MODULE 4: Email Admin tối cao duy nhất có quyền role: "admin" và đổi hình nền
const SUPER_ADMIN_EMAIL = "le733833@gmail.com";

export function resolveUserRole(email) {
  if (!email || typeof email !== "string") return "member";
  return email.trim().toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase() ? "admin" : "member";
}

export function isSuperAdminUser(user) {
  if (!user || !user.email) return false;
  return resolveUserRole(user.email) === "admin";
}

/* ==========================================================================
   2. QUẢN LÝ BỘ NHỚ & DỌN DẸP TÀI NGUYÊN (CLEANUP REGISTRY)
   ========================================================================== */
const cleanupRegistry = {
  threeAnimFrameId: null,
  threeCleanupFn: null,
  unsubLeaderboard: null,
  unsubBugReports: null,
  examTimerInterval: null,
  audioObjectUrls: [],
  windowListeners: []
};

function registerWindowListener(event, handler, options) {
  window.addEventListener(event, handler, options);
  cleanupRegistry.windowListeners.push({ event, handler, options });
}

function cleanupAllResources() {
  if (cleanupRegistry.threeAnimFrameId) {
    cancelAnimationFrame(cleanupRegistry.threeAnimFrameId);
    cleanupRegistry.threeAnimFrameId = null;
  }
  if (typeof cleanupRegistry.threeCleanupFn === "function") {
    cleanupRegistry.threeCleanupFn();
    cleanupRegistry.threeCleanupFn = null;
  }
  if (typeof cleanupRegistry.unsubLeaderboard === "function") {
    cleanupRegistry.unsubLeaderboard();
    cleanupRegistry.unsubLeaderboard = null;
  }
  if (typeof cleanupRegistry.unsubBugReports === "function") {
    cleanupRegistry.unsubBugReports();
    cleanupRegistry.unsubBugReports = null;
  }
  if (typeof cleanupRegistry.unsubGlobalBackground === "function") {
    cleanupRegistry.unsubGlobalBackground();
    cleanupRegistry.unsubGlobalBackground = null;
  }
  if (typeof cleanupRegistry.unsubMarqueeImages === "function") {
    cleanupRegistry.unsubMarqueeImages();
    cleanupRegistry.unsubMarqueeImages = null;
  }
  if (cleanupRegistry.examTimerInterval) {
    clearInterval(cleanupRegistry.examTimerInterval);
    cleanupRegistry.examTimerInterval = null;
  }
  cleanupRegistry.audioObjectUrls.forEach((objUrl) => {
    try {
      URL.revokeObjectURL(objUrl);
    } catch (_) {}
  });
  cleanupRegistry.audioObjectUrls = [];
  cleanupRegistry.windowListeners.forEach(({ event, handler, options }) => {
    window.removeEventListener(event, handler, options);
  });
  cleanupRegistry.windowListeners = [];
}

window.addEventListener("beforeunload", cleanupAllResources);

/* ==========================================================================
   3. KHO DỮ LIỆU ĐỀ THI MẪU 9 MÔN HỌC (PHỤC VỤ LUYỆN TẬP & CHATBOT ANH BA)
   ========================================================================== */
const SUBJECT_QUESTION_BANK = {
  "Toán": [
    {
      id: 1,
      part: 1,
      type: "mcq",
      text: "Câu 1: Cho hàm số y = f(x) có đạo hàm f'(x) = (x - 1)(x + 2)² với mọi x ∈ ℝ. Số điểm cực trị của hàm số đã cho là:",
      options: ["A. 1", "B. 2", "C. 3", "D. 0"],
      correct: "A",
      points: 0.25,
      explanation: "Đạo hàm f'(x) chỉ đổi dấu khi đi qua nghiệm đơn x = 1 (nghiệm x = -2 là nghiệm bậc chẵn nên không đổi dấu). Vậy hàm số có đúng 1 điểm cực trị."
    },
    {
      id: 2,
      part: 1,
      type: "mcq",
      text: "Câu 2: Nguyên hàm của hàm số f(x) = 3x² + cos(x) là:",
      options: ["A. x³ + sin(x) + C", "B. x³ - sin(x) + C", "C. 6x + sin(x) + C", "D. 3x³ + sin(x) + C"],
      correct: "A",
      points: 0.25,
      explanation: "Áp dụng công thức nguyên hàm cơ bản: ∫3x²dx = x³ và ∫cos(x)dx = sin(x) + C."
    },
    {
      id: 3,
      part: 1,
      type: "mcq",
      text: "Câu 3: Trong không gian Oxyz, mặt phẳng (P): 2x - y + 3z - 5 = 0 có một vectơ pháp tuyến là:",
      options: ["A. n = (2; -1; 3)", "B. n = (2; 1; 3)", "C. n = (-1; 3; -5)", "D. n = (2; -1; -5)"],
      correct: "A",
      points: 0.25,
      explanation: "Mặt phẳng Ax + By + Cz + D = 0 nhận vectơ n = (A; B; C) = (2; -1; 3) làm một vectơ pháp tuyến."
    },
    {
      id: 4,
      part: 2,
      type: "true_false",
      text: "Câu 4: Cho hàm số y = f(x) = x³ - 3x + 2.",
      statements: [
        { key: "a", text: "Hàm số đồng biến trên khoảng (1; +∞)." },
        { key: "b", text: "Hàm số đạt cực đại tại x = 1." },
        { key: "c", text: "Giá trị cực tiểu của hàm số bằng 0." },
        { key: "d", text: "Đồ thị hàm số cắt trục tung tại điểm có tung độ bằng 2." }
      ],
      correct: { a: true, b: false, c: true, d: true },
      points: 1.0,
      explanation: "Ta có f'(x) = 3x² - 3 = 0 ⇔ x = ±1. Hàm số đồng biến trên (-∞; -1) và (1; +∞). Đạt cực đại tại x = -1, cực tiểu tại x = 1 với f(1) = 0. Đồ thị cắt Oy tại (0; 2)."
    },
    {
      id: 5,
      part: 2,
      type: "true_false",
      text: "Câu 5: Trong không gian Oxyz, cho hai điểm A(1; 2; 3) và B(3; 0; 1).",
      statements: [
        { key: "a", text: "Vectơ AB có tọa độ là (2; -2; -2)." },
        { key: "b", text: "Độ dài đoạn thẳng AB bằng 2√3." },
        { key: "c", text: "Trung điểm của đoạn AB có tọa độ là (2; 1; 2)." },
        { key: "d", text: "Mặt cầu đường kính AB có bán kính R = 3." }
      ],
      correct: { a: true, b: true, c: true, d: false },
      points: 1.0,
      explanation: "AB = (2; -2; -2), |AB| = √(4 + 4 + 4) = 2√3. Trung điểm M = ((1+3)/2; (2+0)/2; (3+1)/2) = (2; 1; 2). Bán kính R = AB/2 = √3 nên ý d là Sai."
    },
    {
      id: 6,
      part: 3,
      type: "short_answer",
      text: "Câu 6: Tính giá trị của biểu thức P = log₂8 + 9,5.",
      options: [],
      statements: [],
      correct: "12.5",
      points: 0.5,
      explanation: "Ta có log₂8 = 3. Vậy P = 3 + 9,5 = 12,5 (hệ thống chấp nhận cả 12.5 và 12,5)."
    },
    {
      id: 7,
      part: 3,
      type: "short_answer",
      text: "Câu 7: Một vật chuyển động thẳng với vận tốc v(t) = 3t² (m/s). Tính quãng đường vật đi được trong 2 giây đầu (đơn vị: mét).",
      options: [],
      statements: [],
      correct: "8",
      points: 0.5,
      explanation: "Quãng đường vật đi được: S = ∫₀² 3t² dt = t³ |₀² = 8 (m)."
    }
  ],
  "Lí": [
    {
      id: 1,
      type: "mcq",
      text: "Câu 1: Một vật dao động điều hòa theo phương trình x = 5cos(4πt) (cm). Biên độ dao động của vật là:",
      options: ["A. 5 cm", "B. 4π cm", "C. 10 cm", "D. 2,5 cm"],
      correct: "A",
      points: 2.5,
      explanation: "Phương trình dao động điều hòa x = Acos(ωt + φ) có biên độ A = 5 cm."
    },
    {
      id: 2,
      type: "mcq",
      text: "Câu 2: Sóng cơ không truyền được trong môi trường nào sau đây?",
      options: ["A. Chân không", "B. Chất rắn", "C. Chất lỏng", "D. Chất khí"],
      correct: "A",
      points: 2.5,
      explanation: "Sóng cơ cần môi trường đàn hồi vật chất để truyền đi nên không truyền được trong chân không."
    },
    {
      id: 3,
      type: "mcq",
      text: "Câu 3: Đặt điện áp xoay chiều u = U₀cos(ωt) vào hai đầu đoạn mạch chỉ có tụ điện có điện dung C. Dung kháng của tụ điện là:",
      options: ["A. Zc = 1 / (ωC)", "B. Zc = ωC", "C. Zc = ω / C", "D. Zc = C / ω"],
      correct: "A",
      points: 2.5,
      explanation: "Công thức tính dung kháng của tụ điện là Zc = 1 / (ωC)."
    },
    {
      id: 4,
      type: "mcq",
      text: "Câu 4: Hạt nhân nguyên tử được cấu tạo từ các hạt nào?",
      options: ["A. Proton và Nơtron", "B. Proton và Electron", "C. Nơtron và Electron", "D. Chỉ có Proton"],
      correct: "A",
      points: 2.5,
      explanation: "Hạt nhân nguyên tử gồm các hạt nuclôn: proton mang điện dương và nơtron không mang điện."
    }
  ],
  "Hóa": [
    {
      id: 1,
      type: "mcq",
      text: "Câu 1: Chất nào sau đây thuộc loại este?",
      options: ["A. CH₃COOC₂H₅", "B. CH₃COOH", "C. C₂H₅OH", "D. CH₃CHO"],
      correct: "A",
      points: 2.5,
      explanation: "CH₃COOC₂H₅ (etyl axetat) có nhóm chức -COO- đặc trưng của este."
    },
    {
      id: 2,
      type: "mcq",
      text: "Câu 2: Kim loại nào sau đây có tính dẫn điện tốt nhất trong tất cả các kim loại?",
      options: ["A. Bạc (Ag)", "B. Đồng (Cu)", "C. Vàng (Au)", "D. Nhôm (Al)"],
      correct: "A",
      points: 2.5,
      explanation: "Dãy kim loại dẫn điện giảm dần: Ag > Cu > Au > Al > Fe."
    },
    {
      id: 3,
      type: "mcq",
      text: "Câu 3: Dung dịch nào sau đây làm quỳ tím chuyển sang màu xanh?",
      options: ["A. Metylamin (CH₃NH₂)", "B. Anilin (C₆H₅NH₂)", "C. Axit axetic", "D. Glucozơ"],
      correct: "A",
      points: 2.5,
      explanation: "Metylamin là amin mạch hở có tính bazơ mạnh hơn NH₃ nên làm quỳ tím hóa xanh."
    },
    {
      id: 4,
      type: "mcq",
      text: "Câu 4: Polime nào sau đây được điều chế bằng phản ứng trùng ngưng?",
      options: ["A. Nilon-6,6", "B. Polietilen (PE)", "C. Poli(vinyl clorua) (PVC)", "D. Polistiren (PS)"],
      correct: "A",
      points: 2.5,
      explanation: "Nilon-6,6 được điều chế bằng phản ứng trùng ngưng giữa hexametylenđiamin và axit ađipic."
    }
  ],
  "Văn": [
    {
      id: 1,
      type: "mcq",
      text: "Câu 1: Tác phẩm 'Tuyên ngôn Độc lập' của Chủ tịch Hồ Chí Minh được đọc tại Quảng trường Ba Đình vào ngày tháng năm nào?",
      options: ["A. 02/09/1945", "B. 19/08/1945", "C. 03/02/1930", "D. 07/05/1954"],
      correct: "A",
      points: 2.5,
      explanation: "Ngày 02/09/1945 tại Quảng trường Ba Đình, Chủ tịch Hồ Chí Minh đọc bản Tuyên ngôn Độc lập khai sinh nước Việt Nam Dân chủ Cộng hòa."
    },
    {
      id: 2,
      type: "mcq",
      text: "Câu 2: Bài thơ 'Tây Tiến' của nhà thơ Quang Dũng được viết theo thể thơ nào?",
      options: ["A. Thơ 7 chữ (thất ngôn)", "B. Thơ lục bát", "C. Thơ tự do", "D. Thơ 5 chữ"],
      correct: "A",
      points: 2.5,
      explanation: "Tây Tiến được viết theo thể thơ 7 chữ mang âm hưởng hào hùng, lãng mạn."
    }
  ],
  "Địa": [
    {
      id: 1,
      type: "mcq",
      text: "Câu 1: Nước ta nằm hoàn toàn trong vùng nội chí tuyến bán cầu Bắc nên có đặc điểm khí hậu nào?",
      options: ["A. Nhiệt đới ẩm gió mùa, tổng bức xạ lớn", "B. Ôn đới hải dương mát mẻ quanh năm", "C. Hàn đới lạnh giá", "D. Cận nhiệt đới khô hạn"],
      correct: "A",
      points: 2.5,
      explanation: "Vị trí nội chí tuyến bán cầu Bắc kết hợp biển Đông và hoàn lưu gió mùa tạo nên khí hậu nhiệt đới ẩm gió mùa."
    },
    {
      id: 2,
      type: "mcq",
      text: "Câu 2: Vùng nào có diện tích trồng cây công nghiệp lâu năm lớn nhất nước ta?",
      options: ["A. Tây Nguyên và Đông Nam Bộ", "B. Đồng bằng sông Hồng", "C. Bắc Trung Bộ", "D. Duyên hải Nam Trung Bộ"],
      correct: "A",
      points: 2.5,
      explanation: "Đông Nam Bộ và Tây Nguyên có diện tích đất badan và đất xám rộng lớn, thích hợp nhất cho cây công nghiệp lâu năm."
    },
    {
      id: 7,
      type: "mcq",
      text: "Câu 7 (NB): Đường biên giới trên đất liền giữa Việt Nam và Lào dài khoảng",
      options: ["A. 1.400 km.", "B. 1.100 km.", "C. 2.100 km.", "D. 3.260 km."],
      correct: "C",
      points: 2.5,
      explanation: "Theo SGK Địa lí 12 (Bài Vị trí địa lí và phạm vi lãnh thổ), đường biên giới trên đất liền giữa Việt Nam và Lào dài khoảng 2.100 km (Việt Nam - Trung Quốc khoảng 1.400 km, Việt Nam - Campuchia khoảng 1.100 km, bờ biển dài 3.260 km)."
    }
  ],
  "Sử": [
    {
      id: 1,
      type: "mcq",
      text: "Câu 1: Sự kiện nào đánh dấu bước ngoặt chấm dứt khủng hoảng về đường lối cứu nước đầu thế kỷ XX ở Việt Nam?",
      options: ["A. Đảng Cộng sản Việt Nam ra đời (đầu năm 1930)", "B. Khởi nghĩa Yên Bái (1930)", "C. Phong trào Đông Du (1905)", "D. Cuộc vận động Duy Tân (1906)"],
      correct: "A",
      points: 5.0,
      explanation: "Sự ra đời của Đảng Cộng sản Việt Nam đầu năm 1930 đã chấm dứt khủng hoảng về đường lối và giai cấp lãnh đạo cách mạng."
    },
    {
      id: 2,
      type: "mcq",
      text: "Câu 2: Chiến dịch mở màn trong cuộc Tổng tiến công và nổi dậy Xuân 1975 là chiến dịch nào?",
      options: ["A. Chiến dịch Tây Nguyên", "B. Chiến dịch Huế - Đà Nẵng", "C. Chiến dịch Hồ Chí Minh", "D. Chiến dịch Biên giới"],
      correct: "A",
      points: 5.0,
      explanation: "Chiến dịch Tây Nguyên (04/03 đến 24/03/1975) là chiến dịch mở màn thắng lợi cho Tổng tiến công Xuân 1975."
    }
  ],
  "ANQP": [
    {
      id: 1,
      type: "mcq",
      text: "Câu 1: Lực lượng vũ trang nhân dân Việt Nam bao gồm mấy thứ quân?",
      options: ["A. 3 thứ quân: Bộ đội chủ lực, Bộ đội địa phương, Dân quân tự vệ", "B. 2 thứ quân", "C. 1 thứ quân duy nhất", "D. 4 thứ quân"],
      correct: "A",
      points: 5.0,
      explanation: "Lực lượng vũ trang nhân dân gồm 3 thứ quân: Bộ đội chủ lực, Bộ đội địa phương và Dân quân tự vệ."
    },
    {
      id: 2,
      type: "mcq",
      text: "Câu 2: Bảo vệ Tổ quốc Việt Nam xã hội chủ nghĩa là sự nghiệp của ai?",
      options: ["A. Của toàn dân, do Đảng lãnh đạo, Nhà nước quản lý", "B. Chỉ riêng quân đội", "C. Chỉ riêng công an", "D. Chỉ của thanh niên"],
      correct: "A",
      points: 5.0,
      explanation: "Bảo vệ Tổ quốc là sự nghiệp của toàn dân dưới sự lãnh đạo của Đảng và sự quản lý thống nhất của Nhà nước."
    }
  ],
  "Tin": [
    {
      id: 1,
      type: "mcq",
      text: "Câu 1: Trong ngôn ngữ HTML, thẻ nào được sử dụng để tạo siêu liên kết (hyperlink)?",
      options: ["A. Thẻ <a>", "B. Thẻ <p>", "C. Thẻ <img>", "D. Thẻ <div>"],
      correct: "A",
      points: 5.0,
      explanation: "Thẻ <a href='...'> dùng để tạo siêu liên kết trong tài liệu HTML."
    },
    {
      id: 2,
      type: "mcq",
      text: "Câu 2: Trong hệ quản trị cơ sở dữ liệu quan hệ, khóa chính (Primary Key) có đặc điểm gì?",
      options: ["A. Giá trị duy nhất (Unique) và không được rỗng (NOT NULL)", "B. Có thể trùng lặp tùy ý", "C. Luôn chứa văn bản", "D. Có thể để trống (NULL)"],
      correct: "A",
      points: 5.0,
      explanation: "Khóa chính xác định duy nhất một bản ghi trong bảng nên bắt buộc Unique và NOT NULL."
    }
  ],
  "Anh": [
    {
      id: 1,
      type: "mcq",
      text: "Câu 1: Mark the letter A, B, C, or D to indicate the correct answer: If I _____ you, I would spend more time practicing past exam papers.",
      options: ["A. were", "B. am", "C. have been", "D. had been"],
      correct: "A",
      points: 5.0,
      explanation: "Câu điều kiện loại 2 diễn tả giả định trái với hiện tại: If + S + were/V2-ed, S + would + V_inf."
    },
    {
      id: 2,
      type: "mcq",
      text: "Câu 2: She is very keen _____ learning artificial intelligence and software engineering.",
      options: ["A. on", "B. in", "C. at", "D. with"],
      correct: "A",
      points: 5.0,
      explanation: "Cấu trúc 'be keen on + V-ing / Noun' mang nghĩa yêu thích, say mê."
    }
  ]
};

/* ==========================================================================
   4. STATE TOÀN CỤC & KHO TRI THỨC NỘI BỘ CHO CHATBOT ANH BA
   ========================================================================== */
let currentUser = null;
let currentSelectedSubject = "Toán";
let builderQuestionsState = [];
let allLoadedExamsKnowledgeBase = [];

const DEFAULT_USER_AVATAR = "https://api.dicebear.com/7.x/adventurer/svg?seed=Student12A1";
const DEFAULT_ANHBA_AVATAR = "https://api.dicebear.com/7.x/bottts/svg?seed=AnhBa12A1";

/**
 * Lưu và đồng bộ các đề thi đã tải lên vào LocalStorage để Chatbot Anh Ba tra cứu tức thì
 */
function saveExamToLocalKnowledgeBase(examObj) {
  try {
    const raw = localStorage.getItem("hoclieu12a1_local_exams_kb");
    const list = raw ? JSON.parse(raw) : [];
    const filtered = list.filter((e) => e.title !== examObj.title);
    filtered.unshift(examObj);
    localStorage.setItem("hoclieu12a1_local_exams_kb", JSON.stringify(filtered.slice(0, 30)));
    refreshKnowledgeBaseBadge();
  } catch (err) {
    console.warn("Không thể lưu bộ nhớ đệm đề thi:", err.message);
  }
}

/**
 * Thu thập toàn bộ câu hỏi, đáp án và lời giải từ mọi nguồn trên web cho Chatbot Anh Ba
 */
function getAllQuestionsInKnowledgeBase() {
  const mapByKey = new Map();

  const addQuestionList = (questions, sourceTitle = "Kho Đề 12A1.1", subjectName = "") => {
    if (!Array.isArray(questions)) return;
    questions.forEach((q, idx) => {
      if (!q || !q.text) return;
      const key = `${subjectName}_${q.text.trim().slice(0, 80)}`;
      mapByKey.set(key, {
        ...q,
        number: q.id || idx + 1,
        sourceTitle,
        subject: subjectName || q.subject || currentSelectedSubject
      });
    });
  };

  // 1. Ngân hàng câu hỏi gốc 9 môn
  Object.entries(SUBJECT_QUESTION_BANK).forEach(([subj, qs]) => {
    addQuestionList(qs, `Đề Chuẩn Môn ${subj}`, subj);
  });

  // 2. Các đề thi đã tải từ Firestore
  allLoadedExamsKnowledgeBase.forEach((exam) => {
    addQuestionList(exam.questions, exam.title || "Đề Ôn Tập", exam.subject || "");
  });

  // 3. Các đề thi lưu trong LocalStorage
  try {
    const rawKb = localStorage.getItem("hoclieu12a1_local_exams_kb");
    if (rawKb) {
      const savedExams = JSON.parse(rawKb);
      savedExams.forEach((exam) => {
        addQuestionList(exam.questions, exam.title || "Đề Tải Lên", exam.subject || "");
      });
    }
  } catch (_) {}

  // 4. Đề thi đang mở trong phòng thi hiện tại
  try {
    const rawActive = localStorage.getItem("activeExamData");
    if (rawActive) {
      const activeExam = JSON.parse(rawActive);
      addQuestionList(activeExam.questions, activeExam.title || "Đề Đang Thi", activeExam.subject || "");
    }
  } catch (_) {}

  // 5. Các câu hỏi đang soạn trong luồng tạo bài thi hợp nhất
  if (builderQuestionsState.length > 0) {
    const formattedBuilder = collectFormattedQuestionsFromBuilder();
    addQuestionList(formattedBuilder, "Đề Vừa Tải Lên", currentSelectedSubject);
  }

  return Array.from(mapByKey.values());
}

function refreshKnowledgeBaseBadge() {
  const badge = document.getElementById("anhBaKbCountBadge");
  if (!badge) return;
  const totalQuestions = getAllQuestionsInKnowledgeBase().length;
  badge.textContent = `Đã nạp ${totalQuestions} câu hỏi & đáp án nội bộ`;
}

/* ==========================================================================
   5. QUẢN LÝ GIAO DIỆN HÌNH NỀN TOÀN CỤC REAL-TIME & RBAC (MODULE 1)
   ========================================================================== */

/**
 * Cập nhật hình nền trực tiếp lên thẻ <body>
 */
export function applyGlobalBackgroundToDOM(bgValue) {
  if (document.body.classList.contains("auth-page-body")) {
    return; // Trang đăng nhập giữ nguyên nền 3D Three.js
  }
  if (bgValue && bgValue.trim() !== "") {
    document.body.style.backgroundImage = `url("${bgValue}")`;
    document.body.classList.add("has-custom-bg");
  } else {
    document.body.style.backgroundImage = "";
    document.body.classList.remove("has-custom-bg");
  }
}

/**
 * Lắng nghe thay đổi hình nền toàn cục thời gian thực từ Firestore (system_settings/global_ui)
 * Hoạt động ngay khi mở web cho mọi đối tượng (Admin, Member, Khách chưa đăng nhập)
 */
export function initGlobalBackgroundSync() {
  if (typeof cleanupRegistry.unsubGlobalBackground === "function") {
    cleanupRegistry.unsubGlobalBackground();
  }

  const globalUiDocRef = doc(db, "system_settings", "global_ui");
  cleanupRegistry.unsubGlobalBackground = onSnapshot(
    globalUiDocRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        const bgUrl = (data?.backgroundUrl || "").trim();
        applyGlobalBackgroundToDOM(bgUrl);
        const editBgUrl = document.getElementById("editBgUrl");
        if (editBgUrl && document.activeElement !== editBgUrl) {
          editBgUrl.value = bgUrl;
        }
      } else {
        applyGlobalBackgroundToDOM("");
      }
    },
    (err) => {
      console.warn("Lắng nghe hình nền toàn cục Firestore (onSnapshot):", err.message);
    }
  );
}

/**
 * Lưu hình nền toàn cục lên Firestore (system_settings/global_ui) - Chỉ dành riêng cho Admin le733833@gmail.com
 */
export async function saveGlobalBackgroundToFirestore(newBgValue) {
  if (!isSuperAdminUser(currentUser)) {
    alert("⛔ Truy cập bị từ chối: Chỉ tài khoản Admin tối cao (le733833@gmail.com) mới có quyền thay đổi hình nền toàn cục!");
    return false;
  }

  try {
    const cleanUrl = (newBgValue || "").trim();
    await setDoc(
      doc(db, "system_settings", "global_ui"),
      {
        backgroundUrl: cleanUrl,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.email || SUPER_ADMIN_EMAIL
      },
      { merge: true }
    );
    return true;
  } catch (err) {
    alert("Lỗi khi lưu hình nền toàn cục lên Cloud Firestore: " + err.message);
    return false;
  }
}

function updateRbacUiElements(user) {
  const role = resolveUserRole(user?.email);
  const isAdmin = role === "admin";

  const navRoleBadge = document.getElementById("navRoleBadge");
  const modalRoleBadge = document.getElementById("modalRoleBadge");
  const modalRolePermissionText = document.getElementById("modalRolePermissionText");
  const bgLockedNotice = document.getElementById("bgCustomizerLockedNotice");
  const bgAdminControls = document.getElementById("bgCustomizerAdminControls");
  const editBgUrl = document.getElementById("editBgUrl");
  const editBgFile = document.getElementById("editBgFile");
  const btnResetBg = document.getElementById("btnResetBg");
  const btnSaveGlobalBgOnly = document.getElementById("btnSaveGlobalBgOnly");

  [navRoleBadge, modalRoleBadge].forEach((badge) => {
    if (!badge) return;
    badge.textContent = isAdmin ? "ADMIN" : "MEMBER";
    badge.className = `role-badge ${isAdmin ? "role-admin" : "role-member"}`;
  });

  if (modalRolePermissionText) {
    modalRolePermissionText.textContent = isAdmin
      ? "Quản trị viên tối cao (Toàn quyền hệ thống & Đổi hình nền toàn cục)"
      : "Thành viên (Member - Đã khóa quyền đổi hình nền toàn cục)";
  }

  // Ẩn/khóa toàn bộ công cụ chỉnh sửa hình nền đối với tài khoản không phải le733833@gmail.com
  if (bgLockedNotice && bgAdminControls) {
    if (isAdmin) {
      bgLockedNotice.classList.add("hidden");
      bgAdminControls.classList.remove("hidden");
      if (editBgUrl) editBgUrl.disabled = false;
      if (editBgFile) editBgFile.disabled = false;
      if (btnResetBg) btnResetBg.disabled = false;
      if (btnSaveGlobalBgOnly) btnSaveGlobalBgOnly.disabled = false;
    } else {
      bgLockedNotice.classList.remove("hidden");
      bgAdminControls.classList.add("hidden");
      if (editBgUrl) editBgUrl.disabled = true;
      if (editBgFile) editBgFile.disabled = true;
      if (btnResetBg) btnResetBg.disabled = true;
      if (btnSaveGlobalBgOnly) btnSaveGlobalBgOnly.disabled = true;
    }
  }

  // Ẩn / hiện các nút quản lý dành riêng cho Admin (Băng chuyền ảnh & Nút quản trị)
  document.querySelectorAll(".admin-only-pill").forEach((el) => {
    if (isAdmin) {
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  });

  // PHÂN QUYỀN ADMIN CHO CHATBOT "ANH BA - CHỦ NHIỆM 12A1.1"
  const btnAdminEditAnhBaAvatar = document.getElementById("btnAdminEditAnhBaAvatar");
  const btnToggleChatSettings = document.getElementById("btnToggleChatSettings");
  if (btnAdminEditAnhBaAvatar) {
    btnAdminEditAnhBaAvatar.style.display = isAdmin ? "flex" : "none";
  }
  if (btnToggleChatSettings) {
    btnToggleChatSettings.style.display = isAdmin ? "inline-flex" : "none";
  }
  if (!isAdmin) {
    const chatSettingsPanel = document.getElementById("chatSettingsPanel");
    if (chatSettingsPanel) chatSettingsPanel.classList.add("hidden");
  }
}

function applyUserAvatarToDOM(avatarUrl, displayName, email) {
  const finalAvatar = avatarUrl || localStorage.getItem("hoclieu12a1_userAvatar") || DEFAULT_USER_AVATAR;
  if (avatarUrl) localStorage.setItem("hoclieu12a1_userAvatar", avatarUrl);

  const navAvatar = document.getElementById("navUserAvatar");
  const commentAvatar = document.getElementById("commentComposeAvatar");
  const previewAvatar = document.getElementById("previewProfileAvatar");
  if (navAvatar) navAvatar.src = finalAvatar;
  if (commentAvatar) commentAvatar.src = finalAvatar;
  if (previewAvatar) previewAvatar.src = finalAvatar;

  const greetingEl = document.getElementById("userGreetingName");
  const previewNameEl = document.getElementById("previewProfileName");
  const previewEmailEl = document.getElementById("previewProfileEmail");
  const resolvedName = displayName || currentUser?.displayName || (email ? email.split("@")[0] : "Học sinh 12A1");

  if (greetingEl) greetingEl.textContent = resolvedName;
  if (previewNameEl) previewNameEl.textContent = resolvedName;
  if (previewEmailEl && email) previewEmailEl.textContent = email;
}

// Khởi tạo đồng bộ hình nền toàn cục thời gian thực từ Cloud Firestore
initGlobalBackgroundSync();

/* ==========================================================================
   6. THREE.JS 3D FULL-SCREEN INTERACTIVE GALAXY (LOGIN / REGISTER)
   ========================================================================== */
function initThreeJsBackground() {
  const canvas = document.getElementById("threeBgCanvas");
  if (!canvas || typeof window.THREE === "undefined") return;

  const THREE = window.THREE;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.z = 32;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

  const particleCount = 2200;
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);
  const palette = [
    new THREE.Color("#6366f1"),
    new THREE.Color("#ec4899"),
    new THREE.Color("#06b6d4"),
    new THREE.Color("#a855f7"),
    new THREE.Color("#ffffff")
  ];

  for (let i = 0; i < particleCount; i++) {
    const i3 = i * 3;
    const radius = Math.random() * 48 + 2;
    const spinAngle = radius * 0.25;
    const branchAngle = ((i % 4) / 4) * Math.PI * 2;

    positions[i3] = Math.cos(branchAngle + spinAngle) * radius + (Math.random() - 0.5) * 6;
    positions[i3 + 1] = (Math.random() - 0.5) * 28;
    positions[i3 + 2] = Math.sin(branchAngle + spinAngle) * radius + (Math.random() - 0.5) * 6;

    const pickedColor = palette[i % palette.length];
    colors[i3] = pickedColor.r;
    colors[i3 + 1] = pickedColor.g;
    colors[i3 + 2] = pickedColor.b;
  }

  const particleGeo = new THREE.BufferGeometry();
  particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));

  const particleMat = new THREE.PointsMaterial({
    size: 0.22,
    vertexColors: true,
    transparent: true,
    opacity: 0.88,
    blending: THREE.AdditiveBlending
  });

  const particleSystem = new THREE.Points(particleGeo, particleMat);
  scene.add(particleSystem);

  const polyGroup = new THREE.Group();
  const geo1 = new THREE.IcosahedronGeometry(4.2, 1);
  const mat1 = new THREE.MeshBasicMaterial({ color: 0x6366f1, wireframe: true, transparent: true, opacity: 0.22 });
  const mesh1 = new THREE.Mesh(geo1, mat1);
  mesh1.position.set(-16, 8, -8);

  const geo2 = new THREE.OctahedronGeometry(3.5, 0);
  const mat2 = new THREE.MeshBasicMaterial({ color: 0xec4899, wireframe: true, transparent: true, opacity: 0.24 });
  const mesh2 = new THREE.Mesh(geo2, mat2);
  mesh2.position.set(17, -7, -6);

  const geo3 = new THREE.TorusKnotGeometry(2.6, 0.6, 64, 8);
  const mat3 = new THREE.MeshBasicMaterial({ color: 0x06b6d4, wireframe: true, transparent: true, opacity: 0.18 });
  const mesh3 = new THREE.Mesh(geo3, mat3);
  mesh3.position.set(14, 10, -12);

  polyGroup.add(mesh1, mesh2, mesh3);
  scene.add(polyGroup);

  let mouseX = 0;
  let mouseY = 0;

  const onMouseMove = (e) => {
    mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
    mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
  };

  const onWindowResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };

  registerWindowListener("mousemove", onMouseMove);
  registerWindowListener("resize", onWindowResize);

  const animate = () => {
    cleanupRegistry.threeAnimFrameId = requestAnimationFrame(animate);
    particleSystem.rotation.y += 0.0012;
    particleSystem.rotation.x += 0.0004;

    mesh1.rotation.x += 0.004;
    mesh1.rotation.y += 0.005;
    mesh2.rotation.y -= 0.006;
    mesh2.rotation.z += 0.003;
    mesh3.rotation.x += 0.005;
    mesh3.rotation.z -= 0.004;

    camera.position.x += (mouseX * 4.5 - camera.position.x) * 0.04;
    camera.position.y += (-mouseY * 4.5 - camera.position.y) * 0.04;
    camera.lookAt(scene.position);

    renderer.render(scene, camera);
  };

  animate();

  cleanupRegistry.threeCleanupFn = () => {
    particleGeo.dispose();
    particleMat.dispose();
    geo1.dispose();
    mat1.dispose();
    geo2.dispose();
    mat2.dispose();
    geo3.dispose();
    mat3.dispose();
    renderer.dispose();
  };
}

initThreeJsBackground();

/* ==========================================================================
   7. ĐỒNG BỘ TÀI KHOẢN & PHÂN QUYỀN RBAC LÊN FIRESTORE
   ========================================================================== */
function saveRbacUserToLocalRegistry(userEntry) {
  try {
    const raw = localStorage.getItem("hoclieu12a1_rbac_users");
    const list = raw ? JSON.parse(raw) : [];
    // Luôn đảm bảo có mặt tài khoản Admin tối cao le733833@gmail.com
    const adminBase = {
      email: SUPER_ADMIN_EMAIL,
      displayName: "Admin Tối Cao (Chủ nhiệm / Quản trị)",
      role: "admin"
    };
    const mergedMap = new Map();
    mergedMap.set(SUPER_ADMIN_EMAIL.toLowerCase(), adminBase);
    list.forEach((item) => {
      if (item && item.email) {
        const emailLower = item.email.trim().toLowerCase();
        mergedMap.set(emailLower, {
          ...item,
          role: resolveUserRole(emailLower)
        });
      }
    });
    if (userEntry && userEntry.email) {
      const emailLower = userEntry.email.trim().toLowerCase();
      mergedMap.set(emailLower, {
        ...userEntry,
        role: resolveUserRole(emailLower)
      });
    }
    localStorage.setItem("hoclieu12a1_rbac_users", JSON.stringify(Array.from(mergedMap.values())));
  } catch (err) {
    console.warn("Lưu RBAC local:", err.message);
  }
}

async function syncUserToFirestore(user, extraFields = {}) {
  if (!user) return;
  const enforcedRole = resolveUserRole(user.email);
  const resolvedName =
    extraFields.displayName ||
    user.displayName ||
    (user.email ? user.email.split("@")[0] : "Học sinh 12A1");

  const resolvedAvatar =
    extraFields.avatarUrl ||
    localStorage.getItem("hoclieu12a1_userAvatar") ||
    DEFAULT_USER_AVATAR;

  updateRbacUiElements(user);
  applyUserAvatarToDOM(resolvedAvatar, resolvedName, user.email);
  saveRbacUserToLocalRegistry({
    uid: user.uid,
    email: user.email || "",
    displayName: resolvedName,
    role: enforcedRole
  });

  try {
    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);
    const existingData = snap.exists() ? snap.data() : {};

    // Chỉ lấy customBackground mới nếu user là Admin le733833@gmail.com
    const resolvedBg = isSuperAdminUser(user) && extraFields.customBackground !== undefined
      ? extraFields.customBackground
      : existingData.customBackground || "";

    const payload = {
      uid: user.uid,
      displayName: resolvedName,
      email: user.email || "",
      avatarUrl: resolvedAvatar,
      customBackground: resolvedBg,
      role: enforcedRole,
      highestScore: existingData.highestScore ?? 0,
      bestSubject: existingData.bestSubject || "Chưa thi",
      createdAt: existingData.createdAt || new Date().toISOString(),
      lastLogin: new Date().toISOString(),
      ...extraFields,
      role: enforcedRole // Luôn khóa chặt role theo email
    };

    await setDoc(userRef, payload, { merge: true });

    if (isSuperAdminUser(user) && extraFields.customBackground !== undefined) {
      await setDoc(
        doc(db, "system_settings", "global_ui"),
        {
          backgroundUrl: resolvedBg,
          updatedBy: user.email,
          updatedAt: serverTimestamp()
        },
        { merge: true }
      );
    }
  } catch (err) {
    console.warn("Đồng bộ hồ sơ Firestore (chế độ dự phòng local đã kích hoạt):", err.message);
  }
}

async function renderRbacUsersTable() {
  const tbody = document.getElementById("rbacUsersTableBody");
  if (!tbody) return;

  const userMap = new Map();
  userMap.set(SUPER_ADMIN_EMAIL.toLowerCase(), {
    email: SUPER_ADMIN_EMAIL,
    displayName: "Quản Trị Viên Tối Cao",
    role: "admin"
  });

  // Đọc danh sách từ localStorage
  try {
    const raw = localStorage.getItem("hoclieu12a1_rbac_users");
    if (raw) {
      JSON.parse(raw).forEach((u) => {
        if (u && u.email) {
          userMap.set(u.email.toLowerCase(), {
            email: u.email,
            displayName: u.displayName || u.email.split("@")[0],
            role: resolveUserRole(u.email)
          });
        }
      });
    }
  } catch (_) {}

  // Bổ sung danh sách từ Firestore collection "users"
  try {
    const snap = await getDocs(collection(db, "users"));
    snap.forEach((d) => {
      const data = d.data();
      if (data && data.email) {
        userMap.set(data.email.toLowerCase(), {
          email: data.email,
          displayName: data.displayName || data.email.split("@")[0],
          role: resolveUserRole(data.email)
        });
      }
    });
  } catch (_) {}

  const rows = Array.from(userMap.values()).sort((a, b) => (a.role === "admin" ? -1 : b.role === "admin" ? 1 : 0));

  tbody.innerHTML = rows
    .map((u) => {
      const isAdmin = u.role === "admin";
      return `
        <tr>
          <td class="font-mono text-xs font-semibold">${u.email}</td>
          <td>${u.displayName}</td>
          <td>
            <span class="role-badge ${isAdmin ? "role-admin" : "!bg-slate-200 !text-slate-700"}">
              ${isAdmin ? "👑 ADMIN" : "MEMBER"}
            </span>
          </td>
          <td class="text-xs font-bold ${isAdmin ? "text-emerald-600" : "text-rose-500"}">
            ${isAdmin ? "✅ Toàn quyền đổi nền" : "🔒 Bị khóa (Disabled)"}
          </td>
        </tr>
      `;
    })
    .join("");
}

const path = window.location.pathname;

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    await syncUserToFirestore(user);
    refreshKnowledgeBaseBadge();

    if (path.includes("index.html") || path === "/" || path.endsWith("/")) {
      window.location.href = "dashboard.html";
      return;
    }
    if (path.includes("dashboard.html")) {
      loadExams(currentSelectedSubject);
      initRealtimeLeaderboardMarquee();
      initRealtimeBugReports();
      renderRbacUsersTable();
    }
    if (path.includes("leaderboard.html")) {
      loadLeaderboardTable();
    }
    if (path.includes("report.html")) {
      initRealtimeBugReports();
    }
    if (path.includes("exam-room.html")) {
      initExamRoom();
    }
  } else {
    currentUser = null;
    if (!path.includes("index.html") && path !== "/" && !path.endsWith("/")) {
      window.location.href = "index.html";
    }
  }
});

/* ==========================================================================
   FORM ĐĂNG NHẬP / ĐĂNG KÝ (AUTH SYSTEM + RBAC + WINDOW BINDING)
   ========================================================================== */
let isRegisterMode = false;

export function switchAuthTab(mode) {
  isRegisterMode = mode === "register";
  window._isRegisterMode = isRegisterMode;

  const tabLoginBtn = document.getElementById("tabLoginBtn");
  const tabRegisterBtn = document.getElementById("tabRegisterBtn");
  const displayNameGroup = document.getElementById("displayNameGroup");
  const authActionBtn = document.getElementById("authActionBtn");
  const authMsg = document.getElementById("authMsg");

  if (isRegisterMode) {
    tabRegisterBtn?.classList.add("active");
    tabLoginBtn?.classList.remove("active");
    if (authActionBtn) authActionBtn.innerHTML = `<i class="fa-solid fa-user-plus mr-1"></i> Tạo Tài Khoản Mới`;
    if (displayNameGroup) displayNameGroup.style.display = "flex";
  } else {
    tabLoginBtn?.classList.add("active");
    tabRegisterBtn?.classList.remove("active");
    if (authActionBtn) authActionBtn.innerHTML = `<i class="fa-solid fa-bolt mr-1"></i> Đăng Nhập Hệ Thống`;
    if (displayNameGroup) displayNameGroup.style.display = "none";
  }
  if (authMsg) authMsg.textContent = "";
}
window.switchAuthTab = switchAuthTab;

export async function handleAuthSubmit() {
  const authEmail = document.getElementById("authEmail");
  const authPassword = document.getElementById("authPassword");
  const authDisplayName = document.getElementById("authDisplayName");
  const authActionBtn = document.getElementById("authActionBtn");
  const authMsg = document.getElementById("authMsg");

  const email = (authEmail?.value || "").trim();
  const pass = (authPassword?.value || "").trim();
  const name = (authDisplayName?.value || "").trim();
  const isRegister = isRegisterMode || window._isRegisterMode || false;

  if (!email || !pass || (isRegister && !name)) {
    if (authMsg) {
      authMsg.style.color = "#fda4af";
      authMsg.textContent = "⚠️ Vui lòng điền đầy đủ email, mật khẩu" + (isRegister ? " và họ tên hiển thị!" : "!");
    }
    return;
  }

  if (authActionBtn) {
    authActionBtn.disabled = true;
    authActionBtn.style.opacity = "0.7";
  }
  if (authMsg) {
    authMsg.style.color = "#a5b4fc";
    authMsg.textContent = "⏳ Đang kết nối Firebase và xác thực tài khoản...";
  }

  try {
    if (isRegister) {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      if (name) {
        await updateProfile(cred.user, { displayName: name });
      }
      await syncUserToFirestore(cred.user, {
        displayName: name || email.split("@")[0],
        email: email,
        role: resolveUserRole(email),
        createdAt: new Date().toISOString()
      });
      if (authMsg) {
        authMsg.style.color = "#86efac";
        authMsg.textContent = "✅ Đăng ký thành công! Đang chuyển hướng vào hệ thống...";
      }
    } else {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      await syncUserToFirestore(cred.user);
      if (authMsg) {
        authMsg.style.color = "#86efac";
        authMsg.textContent = "✅ Đăng nhập thành công! Đang chuyển hướng...";
      }
    }
    setTimeout(() => {
      window.location.href = "dashboard.html";
    }, 350);
  } catch (err) {
    console.error("Lỗi xác thực:", err);
    let friendlyMsg = err.message || "Lỗi xác thực";
    const code = err.code || "";
    if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
      friendlyMsg = "Email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại!";
    } else if (code.includes("email-already-in-use")) {
      friendlyMsg = "Email này đã được sử dụng. Vui lòng chuyển sang tab Đăng Nhập!";
    } else if (code.includes("weak-password")) {
      friendlyMsg = "Mật khẩu quá ngắn, vui lòng nhập tối thiểu 6 ký tự!";
    } else if (code.includes("invalid-email")) {
      friendlyMsg = "Địa chỉ email không đúng định dạng!";
    } else if (code.includes("network-request-failed")) {
      friendlyMsg = "Lỗi kết nối mạng tới Firebase! Vui lòng kiểm tra lại kết nối internet.";
    }

    if (authMsg) {
      authMsg.style.color = "#fda4af";
      authMsg.textContent = `❌ ${friendlyMsg}`;
    }
    if (authActionBtn) {
      authActionBtn.disabled = false;
      authActionBtn.style.opacity = "1";
    }
  }
}
window._moduleAuthSubmit = handleAuthSubmit;
window.handleAuthSubmit = handleAuthSubmit;
window.login = handleAuthSubmit;
window.register = handleAuthSubmit;

// Gắn sự kiện addEventListener chống sập cho form auth
const tabLoginBtn = document.getElementById("tabLoginBtn");
const tabRegisterBtn = document.getElementById("tabRegisterBtn");
const authActionBtn = document.getElementById("authActionBtn");
const authPassword = document.getElementById("authPassword");
const authEmail = document.getElementById("authEmail");
const authDisplayName = document.getElementById("authDisplayName");

if (tabLoginBtn) tabLoginBtn.addEventListener("click", () => switchAuthTab("login"));
if (tabRegisterBtn) tabRegisterBtn.addEventListener("click", () => switchAuthTab("register"));
if (authActionBtn) authActionBtn.addEventListener("click", handleAuthSubmit);

[authPassword, authEmail, authDisplayName].forEach((inp) => {
  if (inp) {
    inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleAuthSubmit();
    });
  }
});

/* ==========================================================================
   8. NAVBAR ACTIONS, PROFILE EDIT & RBAC BACKGROUND GUARD (MODULE 4)
   ========================================================================== */
export async function logoutUser() {
  try {
    cleanupAllResources();
    await signOut(auth);
    window.location.href = "index.html";
  } catch (err) {
    console.error("Lỗi đăng xuất:", err);
  }
}
window.logout = logoutUser;
window.signOut = logoutUser;

const btnLogout = document.getElementById("btnLogout");
if (btnLogout) {
  btnLogout.addEventListener("click", logoutUser);
}

// Chuông thông báo trên Navbar
const notifBtn = document.getElementById("notifBtn");
const notifDropdown = document.getElementById("notifDropdown");
const notifBadge = document.getElementById("notifBadge");
const btnMarkReadNotif = document.getElementById("btnMarkReadNotif");

if (notifBtn && notifDropdown) {
  notifBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    notifDropdown.classList.toggle("show");
  });
  document.addEventListener("click", (e) => {
    if (!notifDropdown.contains(e.target) && e.target !== notifBtn) {
      notifDropdown.classList.remove("show");
    }
  });
}
if (btnMarkReadNotif && notifBadge) {
  btnMarkReadNotif.addEventListener("click", () => {
    notifBadge.style.display = "none";
    notifDropdown.classList.remove("show");
  });
}

// Các nút điều hướng trên Navbar
export function scrollToSubjects() {
  document.getElementById("subjectsSection")?.scrollIntoView({ behavior: "smooth" });
}
window.scrollToSubjects = scrollToSubjects;

export function scrollToBugReports() {
  document.getElementById("bugReportSection")?.scrollIntoView({ behavior: "smooth" });
}
window.scrollToBugReports = scrollToBugReports;

export function openAnhBaChat() {
  const chatWin = document.getElementById("chatbotWindow");
  if (chatWin) chatWin.classList.remove("hidden");
  document.getElementById("chatInput")?.focus();
}
window.openAnhBaChat = openAnhBaChat;

const navSubjectsBtn = document.getElementById("navSubjectsBtn");
const navUnifiedCreatorBtn = document.getElementById("navUnifiedCreatorBtn");
const navRbacModalBtn = document.getElementById("navRbacModalBtn");
const navBugReportBtn = document.getElementById("navBugReportBtn");
const navAnhBaBtn = document.getElementById("navAnhBaBtn");

if (navSubjectsBtn) navSubjectsBtn.addEventListener("click", scrollToSubjects);
if (navUnifiedCreatorBtn) navUnifiedCreatorBtn.addEventListener("click", () => openUnifiedExamCreatorModal());
if (navRbacModalBtn) navRbacModalBtn.addEventListener("click", () => openProfileAndRbacModal());
if (navBugReportBtn) navBugReportBtn.addEventListener("click", scrollToBugReports);
if (navAnhBaBtn) navAnhBaBtn.addEventListener("click", openAnhBaChat);

/**
 * Đọc, cắt vuông tâm (square-center crop) và nén ảnh đại diện qua HTML5 Canvas
 * Chống tràn dung lượng LocalStorage (QuotaExceededError) và giới hạn 1MB của Cloud Firestore
 * @param {File} file - File ảnh đầu vào từ thẻ <input type="file">
 * @param {number} maxWidth - Kích thước vuông tối đa (mặc định 512px)
 * @param {number} quality - Chất lượng nén ảnh (mặc định 0.8)
 * @returns {Promise<string>} - Chuỗi Base64 Data URL (image/webp hoặc image/jpeg)
 */
export async function readImageFileCompressed(file, maxWidth = 512, quality = 0.8) {
  return new Promise((resolve, reject) => {
    try {
      if (!file) {
        return reject(new Error("Không tìm thấy file ảnh tải lên!"));
      }
      if (!file.type || !file.type.startsWith("image/")) {
        return reject(new Error("File đã chọn không phải định dạng hình ảnh hợp lệ (chỉ chấp nhận image/*)!"));
      }

      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Lỗi khi đọc file ảnh từ thiết bị cá nhân!"));
      reader.onload = (e) => {
        try {
          const img = new Image();
          img.onerror = () => reject(new Error("Không thể xử lý hoặc nạp nội dung file ảnh!"));
          img.onload = () => {
            try {
              // Cắt vuông tâm (Square Center Crop 1:1) để avatar luôn đẹp, không méo hình
              const originalW = img.naturalWidth || img.width;
              const originalH = img.naturalHeight || img.height;
              const minSide = Math.min(originalW, originalH);
              const startX = (originalW - minSide) / 2;
              const startY = (originalH - minSide) / 2;
              const targetSize = Math.min(minSide, maxWidth);

              const canvas = document.createElement("canvas");
              canvas.width = targetSize;
              canvas.height = targetSize;
              const ctx = canvas.getContext("2d");
              if (!ctx) {
                return reject(new Error("Trình duyệt không hỗ trợ Canvas 2D Context!"));
              }

              ctx.imageSmoothingEnabled = true;
              ctx.imageSmoothingQuality = "high";
              ctx.drawImage(img, startX, startY, minSide, minSide, 0, 0, targetSize, targetSize);

              let dataUrl = "";
              try {
                dataUrl = canvas.toDataURL("image/webp", quality);
                if (!dataUrl.startsWith("data:image/webp")) {
                  dataUrl = canvas.toDataURL("image/jpeg", quality);
                }
              } catch (_) {
                dataUrl = canvas.toDataURL("image/jpeg", quality);
              }

              // Kiểm tra dung lượng: Đảm bảo chuỗi base64 luôn < 400KB an toàn tuyệt đối
              if (dataUrl.length > 400 * 1024) {
                const safeCanvas = document.createElement("canvas");
                const safeSize = Math.round(targetSize * 0.7);
                safeCanvas.width = safeSize;
                safeCanvas.height = safeSize;
                const safeCtx = safeCanvas.getContext("2d");
                if (safeCtx) {
                  safeCtx.imageSmoothingEnabled = true;
                  safeCtx.drawImage(canvas, 0, 0, safeSize, safeSize);
                  dataUrl = safeCanvas.toDataURL("image/jpeg", 0.7);
                }
              }

              resolve(dataUrl);
            } catch (canvasErr) {
              reject(new Error("Lỗi khi nén ảnh qua Canvas: " + canvasErr.message));
            }
          };
          img.src = e.target.result;
        } catch (imgErr) {
          reject(new Error("Lỗi khởi tạo ảnh: " + imgErr.message));
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      reject(new Error("Lỗi đọc file: " + err.message));
    }
  });
}
window.readImageFileCompressed = readImageFileCompressed;

/**
 * Tối ưu hóa dung lượng ảnh bằng HTML5 Canvas:
 * Nén về định dạng image/webp (fallback image/jpeg), chất lượng 0.7,
 * maxWidth: 1280px cho background và 600px cho ảnh băng chuyền.
 * Đảm bảo dung lượng Base64 luôn an toàn dưới 1MB/doc của Firestore.
 */
export async function compressImageWithCanvas(file, maxWidth = 1280, quality = 0.7) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) {
      return reject(new Error("File tải lên không phải định dạng hình ảnh hợp lệ!"));
    }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Lỗi khi đọc file ảnh từ thiết bị"));
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = () => reject(new Error("Không thể nạp nội dung hình ảnh"));
      img.onload = () => {
        let width = img.naturalWidth || img.width;
        let height = img.naturalHeight || img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Không thể khởi tạo Canvas 2D"));

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        let dataUrl = "";
        try {
          dataUrl = canvas.toDataURL("image/webp", quality);
          if (!dataUrl.startsWith("data:image/webp")) {
            dataUrl = canvas.toDataURL("image/jpeg", quality);
          }
        } catch (_) {
          dataUrl = canvas.toDataURL("image/jpeg", quality);
        }

        // Tự động kiểm tra: Nếu kích thước chuỗi base64 vẫn > 800KB, giảm tiếp kích thước để không bao giờ chạm trần 1MB của Firestore
        if (dataUrl.length > 800 * 1024) {
          const secondCanvas = document.createElement("canvas");
          const safeW = Math.round(width * 0.7);
          const safeH = Math.round(height * 0.7);
          secondCanvas.width = safeW;
          secondCanvas.height = safeH;
          const sCtx = secondCanvas.getContext("2d");
          sCtx.imageSmoothingEnabled = true;
          sCtx.drawImage(canvas, 0, 0, safeW, safeH);
          dataUrl = secondCanvas.toDataURL("image/jpeg", 0.6);
        }

        resolve(dataUrl);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// Modal Hồ sơ, Phân quyền RBAC & Đổi Background (Chỉ cho Admin le733833@gmail.com)
const profileModal = document.getElementById("profileModal");
const btnEditProfile = document.getElementById("btnEditProfile");
const btnCloseProfile = document.getElementById("btnCloseProfile");
const btnCloseProfileTop = document.getElementById("btnCloseProfileTop");
const btnSaveProfile = document.getElementById("btnSaveProfile");
const editDisplayName = document.getElementById("editDisplayName");
const editAvatarUrl = document.getElementById("editAvatarUrl");
const editAvatarFile = document.getElementById("editAvatarFile");
const editBgUrl = document.getElementById("editBgUrl");
const editBgFile = document.getElementById("editBgFile");
const btnResetBg = document.getElementById("btnResetBg");
const btnSaveGlobalBgOnly = document.getElementById("btnSaveGlobalBgOnly");
const previewProfileAvatar = document.getElementById("previewProfileAvatar");
const rbacNewEmailInput = document.getElementById("rbacNewEmailInput");
const btnAddRbacEmail = document.getElementById("btnAddRbacEmail");

function openProfileAndRbacModal() {
  if (!profileModal) return;
  updateRbacUiElements(currentUser);
  renderRbacUsersTable();

  if (editDisplayName) {
    editDisplayName.value = currentUser?.displayName || document.getElementById("userGreetingName")?.textContent || "";
  }
  if (editAvatarUrl) {
    editAvatarUrl.value = localStorage.getItem("hoclieu12a1_userAvatar") || "";
  }
  profileModal.classList.remove("hidden");
}
window.openProfileAndRbacModal = openProfileAndRbacModal;

if (profileModal) {
  if (btnEditProfile) btnEditProfile.addEventListener("click", openProfileAndRbacModal);
  if (navRbacModalBtn) navRbacModalBtn.addEventListener("click", openProfileAndRbacModal);

  const closeProfileModal = () => profileModal.classList.add("hidden");
  if (btnCloseProfile) btnCloseProfile.addEventListener("click", closeProfileModal);
  if (btnCloseProfileTop) btnCloseProfileTop.addEventListener("click", closeProfileModal);

  // Đổi ảnh đại diện Avatar người dùng
  if (editAvatarFile) {
    editAvatarFile.addEventListener("change", async (e) => {
      try {
        const file = e.target.files?.[0];
        if (!file) return;
        const dataUrl = await compressImageWithCanvas(file, 300, 0.85);
        if (editAvatarUrl) editAvatarUrl.value = dataUrl;
        if (previewProfileAvatar) previewProfileAvatar.src = dataUrl;
      } catch (err) {
        alert("Lỗi đọc file ảnh Avatar: " + err.message);
      }
    });
  }

  // Tải file ảnh nền từ máy (Tự động nén Canvas 1280px, chất lượng 0.7 và lưu Cloud Firestore)
  if (editBgFile) {
    editBgFile.addEventListener("change", async (e) => {
      try {
        if (!isSuperAdminUser(currentUser)) {
          e.target.value = "";
          alert("⛔ Chỉ tài khoản Admin tối cao (le733833@gmail.com) mới được phép tải ảnh nền hệ thống!");
          return;
        }
        const file = e.target.files?.[0];
        if (!file) return;
        const dataUrl = await compressImageWithCanvas(file, 1280, 0.7);
        if (editBgUrl) editBgUrl.value = dataUrl;
        const saved = await saveGlobalBackgroundToFirestore(dataUrl);
        if (saved) {
          alert("✅ Đã nén ảnh qua Canvas và đồng bộ hình nền toàn cục lên Cloud Firestore thành công!");
        }
      } catch (err) {
        alert("Lỗi xử lý ảnh nền: " + err.message);
      }
    });
  }

  // Nút Lưu & Đồng Bộ Hình Nền Toàn Cục riêng biệt
  if (btnSaveGlobalBgOnly) {
    btnSaveGlobalBgOnly.addEventListener("click", async () => {
      const url = editBgUrl ? editBgUrl.value.trim() : "";
      const saved = await saveGlobalBackgroundToFirestore(url);
      if (saved) {
        alert("✅ Đã cập nhật và phát sóng hình nền toàn cục tới mọi thiết bị đang online!");
      }
    });
  }

  // Các nút chọn hình nền mẫu có sẵn
  document.querySelectorAll(".bg-preset-btn").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (!isSuperAdminUser(currentUser)) {
        alert("⛔ Chỉ tài khoản Admin tối cao (le733833@gmail.com) mới được phép đổi hình nền hệ thống!");
        return;
      }
      const url = btn.getAttribute("data-bg");
      if (editBgUrl) editBgUrl.value = url;
      await saveGlobalBackgroundToFirestore(url);
    });
  });

  // Nút khôi phục nền mặc định
  if (btnResetBg) {
    btnResetBg.addEventListener("click", async () => {
      if (!isSuperAdminUser(currentUser)) {
        alert("⛔ Chỉ tài khoản Admin tối cao (le733833@gmail.com) mới được phép khôi phục hình nền hệ thống!");
        return;
      }
      if (editBgUrl) editBgUrl.value = "";
      const saved = await saveGlobalBackgroundToFirestore("");
      if (saved) {
        alert("✅ Đã khôi phục hình nền toàn cục mặc định cho toàn bộ người dùng!");
      }
    });
  }

  // Thêm email vào bảng quản lý phân quyền RBAC
  if (btnAddRbacEmail && rbacNewEmailInput) {
    btnAddRbacEmail.addEventListener("click", async () => {
      const email = rbacNewEmailInput.value.trim().toLowerCase();
      if (!email || !email.includes("@")) {
        alert("Vui lòng nhập địa chỉ email hợp lệ!");
        return;
      }
      const assignedRole = resolveUserRole(email);
      const entry = {
        email,
        displayName: email.split("@")[0],
        role: assignedRole,
        addedAt: new Date().toISOString()
      };
      saveRbacUserToLocalRegistry(entry);
      rbacNewEmailInput.value = "";
      await renderRbacUsersTable();
      alert(`Đã thêm email "${email}" với vai trò mặc định: ${assignedRole.toUpperCase()}`);
    });
  }

  if (btnSaveProfile) {
    btnSaveProfile.addEventListener("click", async () => {
      try {
        const newName = editDisplayName?.value.trim() || currentUser?.displayName || "Học sinh 12A1";
        const newAvatar = editAvatarUrl?.value.trim() || DEFAULT_USER_AVATAR;

        applyUserAvatarToDOM(newAvatar, newName, currentUser?.email);

        const updatePayload = {
          displayName: newName,
          avatarUrl: newAvatar
        };

        // Chặn tầng JS: Chỉ lưu customBackground nếu đúng là Admin le733833@gmail.com
        if (isSuperAdminUser(currentUser)) {
          const newBg = editBgUrl?.value.trim() || "";
          await saveGlobalBackgroundToFirestore(newBg);
          updatePayload.customBackground = newBg;
        }

        if (currentUser) {
          try {
            await updateProfile(currentUser, { displayName: newName });
          } catch (_) {}
          await syncUserToFirestore(currentUser, updatePayload);
        }
        profileModal.classList.add("hidden");
      } catch (err) {
        alert("Lỗi lưu hồ sơ: " + err.message);
      }
    });
  }
}

/* ==========================================================================
   MODULE 2: BĂNG CHUYỀN ẢNH CHẠY LIÊN TỤC (INFINITE HORIZONTAL MARQUEE 4:3 & 16:9)
   ĐỒNG BỘ REAL-TIME CLOUD FIRESTORE
   ========================================================================== */

const DEFAULT_MARQUEE_IMAGES_43 = [
  {
    id: "def_43_1",
    url: "https://images.unsplash.com/photo-1523240795612-9a054b0db644?auto=format&fit=crop&w=600&q=80",
    ratio: "4:3",
    title: "Nhóm bạn học tập 12A1.1"
  },
  {
    id: "def_43_2",
    url: "https://images.unsplash.com/photo-1509062522246-3755977927d7?auto=format&fit=crop&w=600&q=80",
    ratio: "4:3",
    title: "Giờ giải bài tập cùng thầy cô"
  },
  {
    id: "def_43_3",
    url: "https://images.unsplash.com/photo-1427504494785-3a9ca7044f45?auto=format&fit=crop&w=600&q=80",
    ratio: "4:3",
    title: "Thảo luận nhóm phòng học hiện đại"
  },
  {
    id: "def_43_4",
    url: "https://images.unsplash.com/photo-1498243691581-b145c3f54a5a?auto=format&fit=crop&w=600&q=80",
    ratio: "4:3",
    title: "Thư viện tri thức 12A1.1"
  },
  {
    id: "def_43_5",
    url: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?auto=format&fit=crop&w=600&q=80",
    ratio: "4:3",
    title: "Lớp học ôn thi THPT Quốc Gia"
  }
];

const DEFAULT_MARQUEE_IMAGES_169 = [
  {
    id: "def_169_1",
    url: "https://images.unsplash.com/photo-1517486808906-6ca8b3f04846?auto=format&fit=crop&w=800&q=80",
    ratio: "16:9",
    title: "Vinh danh thành tích học sinh 12A1.1"
  },
  {
    id: "def_169_2",
    url: "https://images.unsplash.com/photo-1562774053-701939374585?auto=format&fit=crop&w=800&q=80",
    ratio: "16:9",
    title: "Toàn cảnh khuôn viên trường THPT"
  },
  {
    id: "def_169_3",
    url: "https://images.unsplash.com/photo-1541339907198-e08756dedf3f?auto=format&fit=crop&w=800&q=80",
    ratio: "16:9",
    title: "Lễ bế giảng & Chúc mừng thi tốt nghiệp"
  },
  {
    id: "def_169_4",
    url: "https://images.unsplash.com/photo-1577495508048-b635879837f1?auto=format&fit=crop&w=800&q=80",
    ratio: "16:9",
    title: "Quyết tâm chinh phục điểm 10 THPTQG"
  }
];

let cachedMarqueeImagesList = [];
let currentManagingMarqueeRatio = "4:3";

export function renderMarqueeSlidersToDOM(imagesList) {
  cachedMarqueeImagesList = imagesList || [];

  const track43 = document.getElementById("marqueeTrack43");
  const track169 = document.getElementById("marqueeTrack169");
  const count43El = document.getElementById("marqueeCount43");
  const count169El = document.getElementById("marqueeCount169");

  // Lọc theo từng tỷ lệ
  const list43 = cachedMarqueeImagesList.filter((item) => item.ratio === "4:3");
  const list169 = cachedMarqueeImagesList.filter((item) => item.ratio === "16:9");

  const displayList43 = list43.length > 0 ? list43 : DEFAULT_MARQUEE_IMAGES_43;
  const displayList169 = list169.length > 0 ? list169 : DEFAULT_MARQUEE_IMAGES_169;

  if (count43El) {
    count43El.textContent = `(${list43.length > 0 ? `${list43.length} ảnh realtime` : `${DEFAULT_MARQUEE_IMAGES_43.length} ảnh mẫu`})`;
  }
  if (count169El) {
    count169El.textContent = `(${list169.length > 0 ? `${list169.length} ảnh realtime` : `${DEFAULT_MARQUEE_IMAGES_169.length} ảnh mẫu`})`;
  }

  // Nhân đôi track để chạy vòng lặp vô tận trơn tru không gián đoạn
  const makeSeamlessLoop = (arr, minCount = 10) => {
    let result = [...arr];
    while (result.length < minCount) {
      result = result.concat(arr);
    }
    return result.concat(result); // nhân đôi danh sách cho transform -50%
  };

  if (track43) {
    const loopItems43 = makeSeamlessLoop(displayList43, 8);
    track43.innerHTML = loopItems43
      .map(
        (img, idx) => `
        <div class="marquee-item-wrapper" title="${escapeHtml(img.title || 'Khoảnh khắc 12A1.1')}">
          <img src="${img.url}" alt="${escapeHtml(img.title || '12A1.1')}" class="marquee-img-43" loading="lazy">
          <div class="marquee-item-caption">${escapeHtml(img.title || `Khoảnh khắc #${(idx % displayList43.length) + 1}`)}</div>
        </div>
      `
      )
      .join("");
  }

  if (track169) {
    const loopItems169 = makeSeamlessLoop(displayList169, 8);
    track169.innerHTML = loopItems169
      .map(
        (img, idx) => `
        <div class="marquee-item-wrapper" title="${escapeHtml(img.title || 'Kỷ niệm THPTQG')}">
          <img src="${img.url}" alt="${escapeHtml(img.title || 'Kỷ niệm THPTQG')}" class="marquee-img-169" loading="lazy">
          <div class="marquee-item-caption">${escapeHtml(img.title || `Góc kỷ niệm #${(idx % displayList169.length) + 1}`)}</div>
        </div>
      `
      )
      .join("");
  }
}

export function renderMarqueeAdminGridToDOM() {
  const grid = document.getElementById("marqueeAdminGrid");
  const countBadge = document.getElementById("marqueeCurrentCountBadge");
  const ratioLabel = document.getElementById("currentManagingRatioLabel");
  if (!grid) return;

  if (ratioLabel) ratioLabel.textContent = currentManagingMarqueeRatio;

  const filtered = cachedMarqueeImagesList.filter((item) => item.ratio === currentManagingMarqueeRatio);
  if (countBadge) countBadge.textContent = filtered.length;

  if (filtered.length === 0) {
    grid.innerHTML = `
      <div class="col-span-full py-8 text-center text-xs text-slate-400">
        <i class="fa-solid fa-cloud-arrow-up text-2xl mb-2 text-slate-300 block"></i>
        Chưa có ảnh nào được tải lên dải <b>${currentManagingMarqueeRatio}</b>.<br>
        Hãy chọn nhiều file từ máy hoặc dán link URL ở ô trên để thêm ảnh ngay!
      </div>
    `;
    return;
  }

  grid.innerHTML = filtered
    .map(
      (item) => `
      <div class="marquee-admin-card">
        <img src="${item.url}" alt="${escapeHtml(item.title || 'Ảnh')}" loading="lazy">
        <div class="marquee-admin-card-actions">
          <span class="text-[10.5px] font-bold text-slate-600 truncate max-w-[100px]" title="${escapeHtml(item.title || '')}">${escapeHtml(item.title || 'Ảnh chạy')}</span>
          <button type="button" class="btn-delete-marquee-img" data-id="${item.id}" title="Xóa ảnh khỏi Firestore">
            <i class="fa-solid fa-trash mr-1"></i> Xóa
          </button>
        </div>
      </div>
    `
    )
    .join("");

  grid.querySelectorAll(".btn-delete-marquee-img").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      const docId = e.currentTarget.dataset.id;
      if (!isSuperAdminUser(currentUser)) {
        alert("⛔ Chỉ tài khoản Admin tối cao (le733833@gmail.com) mới được phép xóa ảnh băng chuyền!");
        return;
      }
      if (confirm("Xác nhận xóa bức ảnh này khỏi dải băng chuyền thời gian thực?")) {
        try {
          await deleteDoc(doc(db, "marquee_images", docId));
        } catch (err) {
          alert("Lỗi khi xóa ảnh trên Cloud Firestore: " + err.message);
        }
      }
    });
  });
}

export function initMarqueeRealtimeSync() {
  if (typeof cleanupRegistry.unsubMarqueeImages === "function") {
    cleanupRegistry.unsubMarqueeImages();
  }

  const qMarquee = query(collection(db, "marquee_images"), orderBy("createdAt", "desc"));
  cleanupRegistry.unsubMarqueeImages = onSnapshot(
    qMarquee,
    (snapshot) => {
      const list = [];
      snapshot.forEach((docSnap) => {
        list.push({ id: docSnap.id, ...docSnap.data() });
      });
      renderMarqueeSlidersToDOM(list);
      renderMarqueeAdminGridToDOM();
    },
    (err) => {
      console.warn("Lắng nghe marquee_images Firestore (onSnapshot):", err.message);
      renderMarqueeSlidersToDOM([]);
    }
  );
}

// Khởi tạo Băng Chuyền Ảnh Chạy Liên Tục Real-Time
initMarqueeRealtimeSync();

// Khởi tạo Modal Quản Lý Băng Chuyền Ảnh (Admin le733833@gmail.com)
const marqueeManagerModal = document.getElementById("marqueeManagerModal");
const navMarqueeManagerBtn = document.getElementById("navMarqueeManagerBtn");
const btnMarqueeAdminInline = document.getElementById("btnMarqueeAdminInline");
const btnCloseMarqueeManager = document.getElementById("btnCloseMarqueeManager");
const btnCloseMarqueeManagerTop = document.getElementById("btnCloseMarqueeManagerTop");
const tabMarqueeRatio43 = document.getElementById("tabMarqueeRatio43");
const tabMarqueeRatio169 = document.getElementById("tabMarqueeRatio169");
const marqueeFileInput = document.getElementById("marqueeFileInput");
const marqueeUrlInput = document.getElementById("marqueeUrlInput");
const btnAddMarqueeUrlBtn = document.getElementById("btnAddMarqueeUrlBtn");

function openMarqueeManagerModal() {
  if (!isSuperAdminUser(currentUser)) {
    alert("⛔ Chỉ tài khoản Admin tối cao (le733833@gmail.com) mới có quyền quản lý băng chuyền ảnh!");
    return;
  }
  if (!marqueeManagerModal) return;
  currentManagingMarqueeRatio = "4:3";
  if (tabMarqueeRatio43 && tabMarqueeRatio169) {
    tabMarqueeRatio43.className = "px-4 py-1.5 text-xs font-bold bg-indigo-600 text-white";
    tabMarqueeRatio169.className = "px-4 py-1.5 text-xs font-bold bg-white text-slate-700 hover:bg-slate-100 border-l border-slate-300";
  }
  renderMarqueeAdminGridToDOM();
  marqueeManagerModal.classList.remove("hidden");
}
window.openMarqueeManagerModal = openMarqueeManagerModal;

if (navMarqueeManagerBtn) navMarqueeManagerBtn.addEventListener("click", openMarqueeManagerModal);
if (btnMarqueeAdminInline) btnMarqueeAdminInline.addEventListener("click", openMarqueeManagerModal);

const closeMarqueeManagerModal = () => marqueeManagerModal?.classList.add("hidden");
if (btnCloseMarqueeManager) btnCloseMarqueeManager.addEventListener("click", closeMarqueeManagerModal);
if (btnCloseMarqueeManagerTop) btnCloseMarqueeManagerTop.addEventListener("click", closeMarqueeManagerModal);

if (tabMarqueeRatio43) {
  tabMarqueeRatio43.addEventListener("click", () => {
    currentManagingMarqueeRatio = "4:3";
    tabMarqueeRatio43.className = "px-4 py-1.5 text-xs font-bold bg-indigo-600 text-white";
    if (tabMarqueeRatio169) {
      tabMarqueeRatio169.className = "px-4 py-1.5 text-xs font-bold bg-white text-slate-700 hover:bg-slate-100 border-l border-slate-300";
    }
    renderMarqueeAdminGridToDOM();
  });
}

if (tabMarqueeRatio169) {
  tabMarqueeRatio169.addEventListener("click", () => {
    currentManagingMarqueeRatio = "16:9";
    tabMarqueeRatio169.className = "px-4 py-1.5 text-xs font-bold bg-indigo-600 text-white";
    if (tabMarqueeRatio43) {
      tabMarqueeRatio43.className = "px-4 py-1.5 text-xs font-bold bg-white text-slate-700 hover:bg-slate-100";
    }
    renderMarqueeAdminGridToDOM();
  });
}

// Tải nhiều ảnh cùng lúc từ máy (Multiple Canvas Compression)
if (marqueeFileInput) {
  marqueeFileInput.addEventListener("change", async (e) => {
    if (!isSuperAdminUser(currentUser)) {
      e.target.value = "";
      alert("⛔ Chỉ tài khoản Admin tối cao (le733833@gmail.com) mới được phép tải ảnh băng chuyền!");
      return;
    }
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    let successCount = 0;
    for (const file of files) {
      try {
        // Nén Canvas về maxWidth 600px, chất lượng 0.7 cho ảnh dải chạy
        const compressedBase64 = await compressImageWithCanvas(file, 600, 0.7);
        await addDoc(collection(db, "marquee_images"), {
          url: compressedBase64,
          ratio: currentManagingMarqueeRatio,
          title: file.name.replace(/\.[^/.]+$/, ""),
          createdAt: serverTimestamp(),
          createdBy: currentUser?.email || SUPER_ADMIN_EMAIL
        });
        successCount++;
      } catch (err) {
        console.warn("Lỗi khi tải ảnh băng chuyền:", err.message);
      }
    }

    e.target.value = "";
    if (successCount > 0) {
      alert(`✅ Đã tải lên và đồng bộ thành công ${successCount} bức ảnh vào dải ${currentManagingMarqueeRatio}!`);
    }
  });
}

// Dán link URL ảnh trực tiếp
if (btnAddMarqueeUrlBtn && marqueeUrlInput) {
  btnAddMarqueeUrlBtn.addEventListener("click", async () => {
    if (!isSuperAdminUser(currentUser)) {
      alert("⛔ Chỉ tài khoản Admin tối cao (le733833@gmail.com) mới được phép thêm ảnh băng chuyền!");
      return;
    }
    const url = marqueeUrlInput.value.trim();
    if (!url) {
      alert("Vui lòng dán đường link URL hình ảnh!");
      return;
    }
    try {
      await addDoc(collection(db, "marquee_images"), {
        url,
        ratio: currentManagingMarqueeRatio,
        title: `Ảnh ${currentManagingMarqueeRatio} - ${new Date().toLocaleTimeString("vi-VN")}`,
        createdAt: serverTimestamp(),
        createdBy: currentUser?.email || SUPER_ADMIN_EMAIL
      });
      marqueeUrlInput.value = "";
      alert(`✅ Đã thêm ảnh thành công vào dải ${currentManagingMarqueeRatio}!`);
    } catch (err) {
      alert("Lỗi khi thêm link ảnh lên Firestore: " + err.message);
    }
  });
}

/* ==========================================================================
   9. MODULE 3: CHATBOT "ANH BA - CHỦ NHIỆM 12A1.1" (LOCAL KNOWLEDGE-BASE BOT)
   ========================================================================== */
let currentAnhBaAvatar = DEFAULT_ANHBA_AVATAR;

function applyAnhBaAvatar(avatarUrl) {
  const resolved = avatarUrl || localStorage.getItem("anhba_custom_avatar") || DEFAULT_ANHBA_AVATAR;
  currentAnhBaAvatar = resolved;
  if (avatarUrl) {
    try {
      localStorage.setItem("anhba_custom_avatar", avatarUrl);
    } catch (_) {}
  }
  document.querySelectorAll(".anhba-dynamic-avatar, #anhBaHeaderAvatar, #anhBaFloatingAvatar").forEach((img) => {
    img.src = resolved;
  });
}

// Lắng nghe thay đổi Avatar Thầy Anh Ba Real-time từ Cloud Firestore
function initAnhBaAvatarRealtimeSync() {
  try {
    const docRef = doc(db, "app_settings", "chatbot_anh_ba");
    onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const avatarUrl = (data?.avatarUrl || "").trim();
          if (avatarUrl) {
            applyAnhBaAvatar(avatarUrl);
          }
        }
      },
      (err) => {
        console.warn("Lắng nghe Avatar Anh Ba Firestore (onSnapshot):", err.message);
      }
    );
  } catch (err) {
    console.warn("initAnhBaAvatarRealtimeSync:", err);
  }
}

applyAnhBaAvatar();
initAnhBaAvatarRealtimeSync();

/**
 * Chuẩn hóa chuỗi tiếng Việt để so khớp chính xác bất kể hoa thường, dấu câu hay khoảng trắng
 */
function normalizeTextForMatch(str) {
  if (!str) return "";
  return str
    .toLowerCase()
    .replace(/^(câu|question|bài)\s*\d+\s*(\([a-z]+\))?\s*[:.)-]?\s*/i, "")
    .replace(/[^\p{L}\p{N}\s.,]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tính độ tương đồng Dice Coefficient (Bigram) kết hợp độ phủ từ khóa (Token Overlap)
 */
function computeStringSimilarity(queryStr, targetStr) {
  const s1 = normalizeTextForMatch(queryStr);
  const s2 = normalizeTextForMatch(targetStr);
  if (!s1 || !s2) return 0;
  if (s1 === s2) return 1.0;
  if (s1.includes(s2) || s2.includes(s1)) {
    const ratio = Math.min(s1.length, s2.length) / Math.max(s1.length, s2.length);
    return Math.max(0.82, ratio);
  }

  // Token overlap score
  const tokens1 = s1.split(" ").filter((w) => w.length > 1);
  const tokens2 = new Set(s2.split(" ").filter((w) => w.length > 1));
  let matchedTokens = 0;
  tokens1.forEach((t) => {
    if (tokens2.has(t)) matchedTokens++;
  });
  const tokenScore = tokens1.length > 0 ? matchedTokens / tokens1.length : 0;

  // Bigram Dice score
  const bigrams1 = new Map();
  for (let i = 0; i < s1.length - 1; i++) {
    const bg = s1.slice(i, i + 2);
    bigrams1.set(bg, (bigrams1.get(bg) || 0) + 1);
  }
  let intersection = 0;
  for (let i = 0; i < s2.length - 1; i++) {
    const bg = s2.slice(i, i + 2);
    const count = bigrams1.get(bg) || 0;
    if (count > 0) {
      bigrams1.set(bg, count - 1);
      intersection++;
    }
  }
  const diceScore = (2.0 * intersection) / (s1.length - 1 + (s2.length - 1) || 1);

  return Math.max(tokenScore * 0.65 + diceScore * 0.35, tokenScore);
}

/**
 * Tìm câu hỏi khớp nhất trong kho dữ liệu nội bộ (Local Smart Matcher)
 */
function findBestMatchingQuestionInKB(userInput) {
  const allQuestions = getAllQuestionsInKnowledgeBase();
  if (allQuestions.length === 0) return null;

  const cleanedInput = userInput
    .replace(/^(anh\s*ba\s*ơi|thầy\s*ơi|giải\s*thích\s*giúp\s*em|cho\s*em\s*hỏi)\s*/i, "")
    .trim();

  // Kiểm tra xem học sinh có hỏi đích danh số câu (ví dụ: "Câu 7") hay không
  const qNumMatch = cleanedInput.match(/(?:câu|bài|question)\s*(\d+)/i);
  const askedNumber = qNumMatch ? parseInt(qNumMatch[1], 10) : null;

  let bestItem = null;
  let bestScore = 0;

  allQuestions.forEach((q) => {
    const fullQuestionAndOpts = `${q.text} ${(q.options || []).join(" ")}`;
    let score = Math.max(
      computeStringSimilarity(cleanedInput, q.text),
      computeStringSimilarity(cleanedInput, fullQuestionAndOpts)
    );

    // Nếu người dùng chỉ hỏi ngắn gọn kiểu "giải thích câu 3" hoặc có số câu trùng khớp
    if (askedNumber !== null) {
      const qInternalNumMatch = (q.text || "").match(/(?:câu|bài)\s*(\d+)/i);
      const qNum = qInternalNumMatch ? parseInt(qInternalNumMatch[1], 10) : q.number;
      if (qNum === askedNumber) {
        if (cleanedInput.length < 25) {
          // Hỏi ngắn kiểu "câu 7" -> ưu tiên môn đang chọn
          score = q.subject === currentSelectedSubject ? 0.92 : 0.78;
        } else {
          score += 0.12;
        }
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestItem = q;
    }
  });

  if (bestScore >= 0.32 && bestItem) {
    return { question: bestItem, confidence: bestScore };
  }
  return null;
}

/**
 * Sinh câu trả lời chuẩn phong cách "Anh Ba - Chủ nhiệm 12A1.1" từ dữ liệu nội bộ
 */
function generateAnhBaLocalKnowledgeReply(userQuery) {
  const matchResult = findBestMatchingQuestionInKB(userQuery);

  if (matchResult && matchResult.question) {
    const q = matchResult.question;
    const answerDesc = describeCorrectAnswer(q);

    const explainText =
      q.explanation && q.explanation.trim() !== ""
        ? q.explanation.trim()
        : `Theo bảng đáp án chuẩn của **${q.sourceTitle || "Đề ôn tập"}** (Môn **${q.subject || currentSelectedSubject}**), đáp án **${answerDesc}** thỏa mãn đầy đủ dữ kiện của câu hỏi.`;

    const typeLabel =
      q.type === QUESTION_TYPES.TRUE_FALSE
        ? "Phần II (Trắc nghiệm Đúng / Sai)"
        : q.type === QUESTION_TYPES.SHORT_ANSWER
        ? "Phần III (Trắc nghiệm Trả lời ngắn / Điền số)"
        : "Phần I (Trắc nghiệm 4 lựa chọn)";

    return `🎯 **Đáp án chuẩn [${typeLabel}]:**\n👉 **${answerDesc}**\n\nĐể **Anh Ba - Chủ nhiệm 12A1.1** giải thích chi tiết câu này cho em nhé:\n📌 **Nội dung:** ${q.text}\n💡 **Giải thích chi tiết:** ${explainText}\n📚 **Nguồn trích xuất:** ${q.sourceTitle || "Kho Đề 12A1.1"} (Môn ${q.subject || currentSelectedSubject})`;
  }

  const totalCount = getAllQuestionsInKnowledgeBase().length;
  return `Chào em! **Anh Ba - Chủ nhiệm 12A1.1** đã dò tìm trong **${totalCount} câu hỏi** thuộc kho đề hiện có trên web nhưng chưa thấy câu nào khớp hoàn toàn với nội dung em vừa nhắn.\n\n💡 **Gợi ý từ Thầy Anh Ba:**\n1. Em hãy **copy nguyên văn câu hỏi** trong đề thi hoặc bấm nút **"Hỏi Anh Ba"** ngay cạnh câu hỏi trong phòng thi.\n2. Anh Ba hỗ trợ đầy đủ cả 3 phần thi theo chuẩn THPTQG 2025: Trắc nghiệm 4 phương án, Đúng/Sai 4 ý (a,b,c,d) và Trả lời ngắn / Điền số.\n3. Nếu đây là đề mới, em hãy tải đề và file đáp án lên ở mục **"Tạo / Nạp Đề Thi & Đáp Án"**, Anh Ba sẽ tự động nạp ngay lập tức để giải đáp cho cả lớp 12A1.1 nhé!`;
}

function formatBotHtml(rawText) {
  const escaped = rawText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escaped.replace(/\*\*(.*?)\*\*/g, "<b>$1</b>");
}

const chatbotWindow = document.getElementById("chatbotWindow");
const btnOpenChat = document.getElementById("btnOpenChat");
const btnCloseChat = document.getElementById("btnCloseChat");
const btnToggleChatSettings = document.getElementById("btnToggleChatSettings");
const btnAdminEditAnhBaAvatar = document.getElementById("btnAdminEditAnhBaAvatar");
const chatSettingsPanel = document.getElementById("chatSettingsPanel");
const anhBaAvatarUrlInput = document.getElementById("anhBaAvatarUrlInput");
const anhBaAvatarFileInput = document.getElementById("anhBaAvatarFileInput");
const btnSaveAnhBaSettings = document.getElementById("btnSaveAnhBaSettings");
const btnResetAnhBaDefaultAvatar = document.getElementById("btnResetAnhBaDefaultAvatar");
const btnCloseChatSettings = document.getElementById("btnCloseChatSettings");
const chatBody = document.getElementById("chatBody");
const chatInput = document.getElementById("chatInput");
const btnSendChat = document.getElementById("btnSendChat");

// Hàm thực thi cập nhật Avatar Anh Ba và lưu lên Cloud Firestore Real-time
async function saveAnhBaAvatarAction(avatarValue) {
  if (!isSuperAdminUser(currentUser)) {
    alert("⛔ Chỉ tài khoản Admin le733833@gmail.com mới có quyền đổi Avatar Thầy Anh Ba!");
    return;
  }
  const cleanAvatar = (avatarValue || "").trim();
  if (!cleanAvatar) {
    alert("⚠️ Vui lòng chọn file ảnh hoặc dán đường dẫn URL ảnh!");
    return;
  }

  try {
    // 1. Cập nhật ngay lập tức UI local
    applyAnhBaAvatar(cleanAvatar);

    // 2. Lưu trữ (Persist) lên Cloud Firestore để đồng bộ Real-time cho mọi học sinh
    await setDoc(
      doc(db, "app_settings", "chatbot_anh_ba"),
      {
        avatarUrl: cleanAvatar,
        updatedAt: serverTimestamp(),
        updatedBy: currentUser?.email || SUPER_ADMIN_EMAIL
      },
      { merge: true }
    );

    if (chatSettingsPanel) chatSettingsPanel.classList.add("hidden");
    appendAnhBaMessage("Thầy **Anh Ba - Chủ nhiệm 12A1.1** đã cập nhật ảnh đại diện mới rồi nha em!");
    alert("✅ Đã cập nhật và phát sóng Avatar Thầy Anh Ba tới toàn bộ lớp 12A1.1 thành công!");
  } catch (err) {
    console.error("Lỗi khi lưu Avatar Anh Ba:", err);
    applyAnhBaAvatar(cleanAvatar);
    alert("Đã lưu Avatar trên máy này (Lưu ý: " + err.message + ")");
  }
}

if (btnOpenChat && chatbotWindow) {
  btnOpenChat.addEventListener("click", () => {
    refreshKnowledgeBaseBadge();
    chatbotWindow.classList.toggle("hidden");
  });
  if (btnCloseChat) btnCloseChat.addEventListener("click", () => chatbotWindow.classList.add("hidden"));

  // Nút camera badge đè lên Avatar góc chat
  if (btnAdminEditAnhBaAvatar) {
    btnAdminEditAnhBaAvatar.addEventListener("click", (e) => {
      e.stopPropagation();
      if (!isSuperAdminUser(currentUser)) {
        alert("⛔ Chỉ tài khoản Admin le733833@gmail.com mới có quyền đổi Avatar Thầy Anh Ba!");
        return;
      }
      if (chatSettingsPanel) {
        chatSettingsPanel.classList.toggle("hidden");
        if (anhBaAvatarUrlInput) {
          anhBaAvatarUrlInput.value = localStorage.getItem("anhba_custom_avatar") || "";
          anhBaAvatarUrlInput.focus();
        }
      }
    });
  }

  if (btnToggleChatSettings && chatSettingsPanel) {
    btnToggleChatSettings.addEventListener("click", () => {
      if (!isSuperAdminUser(currentUser)) {
        alert("⛔ Chỉ tài khoản Admin le733833@gmail.com mới có quyền đổi Avatar Thầy Anh Ba!");
        return;
      }
      if (anhBaAvatarUrlInput) {
        anhBaAvatarUrlInput.value = localStorage.getItem("anhba_custom_avatar") || "";
      }
      chatSettingsPanel.classList.toggle("hidden");
    });
  }

  if (btnCloseChatSettings && chatSettingsPanel) {
    btnCloseChatSettings.addEventListener("click", () => {
      chatSettingsPanel.classList.add("hidden");
    });
  }

  // Tải file ảnh từ máy (image/*)
  if (anhBaAvatarFileInput) {
    anhBaAvatarFileInput.addEventListener("change", async (e) => {
      try {
        const file = e.target.files?.[0];
        if (!file) return;
        if (!file.type.startsWith("image/")) {
          alert("⚠️ Vui lòng chỉ chọn file hình ảnh (image/*)!");
          return;
        }
        const dataUrl = await readImageFileCompressed(file, 256, 0.85);
        if (anhBaAvatarUrlInput) anhBaAvatarUrlInput.value = dataUrl;
        await saveAnhBaAvatarAction(dataUrl);
      } catch (err) {
        alert("Lỗi tải ảnh Avatar cho Anh Ba: " + err.message);
      }
    });
  }

  // Lưu avatar từ nút bấm
  if (btnSaveAnhBaSettings) {
    btnSaveAnhBaSettings.addEventListener("click", async () => {
      const newAvatar = anhBaAvatarUrlInput?.value.trim() || "";
      await saveAnhBaAvatarAction(newAvatar);
    });
  }

  // Khôi phục avatar mặc định
  if (btnResetAnhBaDefaultAvatar) {
    btnResetAnhBaDefaultAvatar.addEventListener("click", async () => {
      if (!isSuperAdminUser(currentUser)) {
        alert("⛔ Chỉ tài khoản Admin mới có quyền khôi phục Avatar mặc định!");
        return;
      }
      if (!confirm("Bạn có chắc chắn muốn khôi phục về Avatar mặc định cho Thầy Anh Ba?")) return;
      await saveAnhBaAvatarAction(DEFAULT_ANHBA_AVATAR);
    });
  }

  if (btnSendChat) btnSendChat.addEventListener("click", () => sendChatMsg());
  if (chatInput) {
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendChatMsg();
    });
  }
}

function appendAnhBaMessage(text) {
  if (!chatBody) return;
  const avatarSrc = currentAnhBaAvatar || localStorage.getItem("anhba_custom_avatar") || DEFAULT_ANHBA_AVATAR;
  const row = document.createElement("div");
  row.className = "bot-msg-row";
  row.innerHTML = `
    <img class="anhba-avatar-sm anhba-dynamic-avatar" src="${avatarSrc}" alt="Anh Ba">
    <div class="bot-msg">${formatBotHtml(text)}</div>
  `;
  chatBody.appendChild(row);
  chatBody.scrollTop = chatBody.scrollHeight;
}

function sendChatMsg(customPromptText = null) {
  if (!chatBody) return;
  const text = customPromptText || (chatInput ? chatInput.value.trim() : "");
  if (!text) return;

  if (chatbotWindow) chatbotWindow.classList.remove("hidden");

  const userDiv = document.createElement("div");
  userDiv.className = "user-msg";
  userDiv.textContent = text;
  chatBody.appendChild(userDiv);
  if (!customPromptText && chatInput) chatInput.value = "";
  chatBody.scrollTop = chatBody.scrollHeight;

  const reply = generateAnhBaLocalKnowledgeReply(text);
  appendAnhBaMessage(reply);
}

window.askAnhBaQuestion = (questionText) => {
  sendChatMsg(questionText);
};

/* ==========================================================================
   10. QUẢN LÝ 9 MÔN THI & DANH SÁCH BÀI THI
   ========================================================================== */
const subjectButtons = document.querySelectorAll(".subject-card");
const currentSubjectTitle = document.getElementById("currentSubjectTitle");
const modalSubjectBadge = document.getElementById("modalSubjectBadge");
const examListContainer = document.getElementById("examList");
const defaultDurationInput = document.getElementById("defaultDurationInput");

if (subjectButtons.length > 0) {
  subjectButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      subjectButtons.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      currentSelectedSubject = btn.getAttribute("data-subject");
      if (currentSubjectTitle) currentSubjectTitle.textContent = currentSelectedSubject;
      if (modalSubjectBadge) modalSubjectBadge.textContent = currentSelectedSubject;
      loadExams(currentSelectedSubject);
    });
  });
}

async function loadExams(subject) {
  if (!examListContainer) return;
  examListContainer.innerHTML = `<p class="text-sm text-slate-500">Đang tải kho đề thi môn <b>${subject}</b>...</p>`;

  try {
    const exams = [];
    try {
      const qSnap = await getDocs(collection(db, `exams_${subject}`));
      qSnap.forEach((d) => {
        const data = { id: d.id, ...d.data() };
        exams.push(data);
        allLoadedExamsKnowledgeBase.push(data);
      });
    } catch (firestoreErr) {
      console.warn("Đọc đề từ bộ nhớ cục bộ:", firestoreErr.message);
    }

    // Gộp thêm các đề đã lưu ở LocalStorage của môn này
    try {
      const rawKb = localStorage.getItem("hoclieu12a1_local_exams_kb");
      if (rawKb) {
        const localExams = JSON.parse(rawKb).filter((e) => e.subject === subject);
        localExams.forEach((le) => {
          if (!exams.some((ex) => ex.title === le.title)) {
            exams.push(le);
          }
        });
      }
    } catch (_) {}

    if (exams.length === 0) {
      const bankQuestions = SUBJECT_QUESTION_BANK[subject] || SUBJECT_QUESTION_BANK["Toán"];
      exams.push({
        id: `builtin_${subject}`,
        isBuiltin: true,
        title: `Đề Ôn Tập Chuẩn Cấu Trúc THPTQG - Môn ${subject}`,
        duration: parseInt(defaultDurationInput?.value, 10) || 50,
        subject,
        questions: bankQuestions
      });
    }

    refreshKnowledgeBaseBadge();
    examListContainer.innerHTML = "";

    exams.forEach((exam) => {
      const card = document.createElement("div");
      card.className = "exam-card";
      const qCount = exam.questions?.length || 0;
      const initialDuration = exam.duration || parseInt(defaultDurationInput?.value, 10) || 50;

      card.innerHTML = `
        <div>
          <div class="flex items-start justify-between gap-2">
            <h4 class="font-extrabold text-slate-800 text-base">${exam.title}</h4>
            <span class="text-xs font-bold px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 whitespace-nowrap">${subject}</span>
          </div>
          <div class="exam-card-meta">
            <span class="meta-pill"><i class="fa-solid fa-list-ol mr-1 text-indigo-600"></i>${qCount} câu hỏi</span>
            <span class="meta-pill"><i class="fa-regular fa-clock mr-1 text-pink-600"></i>${initialDuration} phút</span>
          </div>
          <div class="exam-card-time-override">
            <i class="fa-solid fa-stopwatch text-indigo-600"></i>
            <span>Thời gian làm bài:</span>
            <input type="number" class="card-duration-input" min="1" max="300" value="${initialDuration}">
            <span>phút</span>
          </div>
        </div>
        <div class="exam-card-actions">
          <button class="btn-primary btn-start flex-1" type="button">
            <i class="fa-solid fa-play"></i> Vào Thi
          </button>
          <button class="btn-secondary btn-edit-unified" type="button" title="Chỉnh sửa đáp án & lời giải trong Trình tạo đề hợp nhất">
            <i class="fa-solid fa-sliders"></i> Đáp Án / Sửa
          </button>
          ${!exam.isBuiltin ? `<button class="btn-danger btn-del" type="button" title="Xóa đề thi"><i class="fa-solid fa-trash"></i></button>` : ""}
        </div>
      `;

      examListContainer.appendChild(card);

      const durationInp = card.querySelector(".card-duration-input");
      card.querySelector(".btn-start").addEventListener("click", () => {
        const chosenDuration = Math.max(1, parseInt(durationInp.value, 10) || initialDuration);
        const examToRun = { ...exam, duration: chosenDuration, subject };
        localStorage.setItem("activeExamData", JSON.stringify(examToRun));
        window.location.href = "exam-room.html";
      });

      card.querySelector(".btn-edit-unified").addEventListener("click", () => {
        openUnifiedExamCreatorModal();
        const titleEl = document.getElementById("newExamTitle");
        const durEl = document.getElementById("newExamDuration");
        if (titleEl) titleEl.value = exam.title;
        if (durEl) durEl.value = parseInt(durationInp.value, 10) || initialDuration;
        populateBuilderFormWithQuestions(exam.questions || []);
      });

      const delBtn = card.querySelector(".btn-del");
      if (delBtn) {
        delBtn.addEventListener("click", async () => {
          if (!confirm(`Xác nhận xóa đề "${exam.title}"?`)) return;
          try {
            if (exam.id && !String(exam.id).startsWith("local_")) {
              await deleteDoc(doc(db, `exams_${subject}`, exam.id));
            }
            const rawKb = localStorage.getItem("hoclieu12a1_local_exams_kb");
            if (rawKb) {
              const filtered = JSON.parse(rawKb).filter((e) => e.title !== exam.title);
              localStorage.setItem("hoclieu12a1_local_exams_kb", JSON.stringify(filtered));
            }
            loadExams(subject);
          } catch (err) {
            alert("Lỗi khi xóa đề: " + err.message);
          }
        });
      }
    });
  } catch (err) {
    examListContainer.innerHTML = `<p class="text-sm text-rose-600">Lỗi hiển thị danh sách đề thi: ${err.message}</p>`;
  }
}

/* ==========================================================================
   11. MODULE 1: HỢP NHẤT CHẾ ĐỘ TẠO BÀI THI (UNIFIED EXAM CREATOR)
   ========================================================================== */
const createExamModal = document.getElementById("createExamModal");
const btnOpenUnifiedCreator = document.getElementById("btnOpenUnifiedCreator");
const questionsBuilderList = document.getElementById("questionsBuilderList");
const builderQuestionCount = document.getElementById("builderQuestionCount");
const step1ParseStatus = document.getElementById("step1ParseStatus");
const step2AnswerStatus = document.getElementById("step2AnswerStatus");

function openUnifiedExamCreatorModal() {
  if (!createExamModal) return;
  if (modalSubjectBadge) modalSubjectBadge.textContent = currentSelectedSubject;
  const durInput = document.getElementById("newExamDuration");
  if (durInput && defaultDurationInput) {
    durInput.value = defaultDurationInput.value || 50;
  }
  const titleInput = document.getElementById("newExamTitle");
  if (titleInput && !titleInput.value.trim()) {
    titleInput.value = `Đề Ôn Luyện Môn ${currentSelectedSubject} - ${new Date().toLocaleDateString("vi-VN")}`;
  }

  createExamModal.classList.remove("hidden");

  if (builderQuestionsState.length === 0) {
    const defaultBank = SUBJECT_QUESTION_BANK[currentSelectedSubject] || SUBJECT_QUESTION_BANK["Toán"];
    populateBuilderFormWithQuestions(defaultBank);
  }
}
window.openUnifiedExamCreatorModal = openUnifiedExamCreatorModal;

if (btnOpenUnifiedCreator) {
  btnOpenUnifiedCreator.addEventListener("click", openUnifiedExamCreatorModal);
}

["btnCloseCreateExam", "btnCloseCreateExamTop"].forEach((id) => {
  const el = document.getElementById(id);
  if (el && createExamModal) {
    el.addEventListener("click", () => createExamModal.classList.add("hidden"));
  }
});

/**
 * Đưa danh sách câu hỏi vào giao diện xem trước của Trình tạo đề hợp nhất
 */
/**
 * Đưa danh sách câu hỏi vào giao diện xem trước của Trình tạo đề hợp nhất
 * Hỗ trợ chuẩn hóa cả 3 phần: Phần I (MCQ), Phần II (Đúng/Sai 4 ý a,b,c,d), Phần III (Trả lời ngắn/Số)
 */
function populateBuilderFormWithQuestions(questionsArray) {
  builderQuestionsState = (questionsArray || []).map((q, idx) => normalizeQuestionSchema(q, idx + 1));
  renderBuilderFormDOM();
}

/**
 * Render giao diện xem trước bài thi với đầy đủ hỗ trợ 3 phần theo chuẩn THPTQG 2025:
 * - Phần I (MCQ): Nút A, B, C, D để click chọn đáp án đúng + 4 ô nhập phương án
 * - Phần II (True/False): 4 mệnh đề a, b, c, d kèm nút gạt [Đúng] / [Sai] trực tiếp
 * - Phần III (Short Answer): Ô nhập đáp án số/chữ chuẩn (hỗ trợ cả dấu chấm và phẩy)
 * - Nút chuyển đổi loại câu hỏi (Type Switcher) trên từng câu
 */
function renderBuilderFormDOM() {
  if (!questionsBuilderList) return;
  questionsBuilderList.innerHTML = "";
  if (builderQuestionCount) builderQuestionCount.textContent = builderQuestionsState.length;

  builderQuestionsState.forEach((item, index) => {
    const div = document.createElement("div");
    div.className = "builder-q-item";

    const typeBadge =
      item.type === QUESTION_TYPES.TRUE_FALSE
        ? `<span class="part-tag-badge part-tag-2"><i class="fa-solid fa-scale-balanced mr-1"></i>Phần II: Đúng / Sai</span>`
        : item.type === QUESTION_TYPES.SHORT_ANSWER
        ? `<span class="part-tag-badge part-tag-3"><i class="fa-solid fa-calculator mr-1"></i>Phần III: Trả lời ngắn</span>`
        : `<span class="part-tag-badge part-tag-1"><i class="fa-solid fa-list-check mr-1"></i>Phần I: Trắc nghiệm</span>`;

    // Type Switcher buttons
    const typeSwitcherHtml = `
      <div class="inline-flex rounded-md shadow-sm border border-slate-200 overflow-hidden text-[11px]">
        <button type="button" class="px-2 py-0.5 font-bold ${item.type === QUESTION_TYPES.MCQ ? 'bg-indigo-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'} btn-switch-type" data-idx="${index}" data-type="${QUESTION_TYPES.MCQ}" title="Chuyển thành Trắc nghiệm 4 lựa chọn (Phần I)">MCQ</button>
        <button type="button" class="px-2 py-0.5 font-bold ${item.type === QUESTION_TYPES.TRUE_FALSE ? 'bg-emerald-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'} btn-switch-type border-l border-slate-200" data-idx="${index}" data-type="${QUESTION_TYPES.TRUE_FALSE}" title="Chuyển thành Đúng / Sai 4 ý a,b,c,d (Phần II)">Đ/S</button>
        <button type="button" class="px-2 py-0.5 font-bold ${item.type === QUESTION_TYPES.SHORT_ANSWER ? 'bg-amber-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-100'} btn-switch-type border-l border-slate-200" data-idx="${index}" data-type="${QUESTION_TYPES.SHORT_ANSWER}" title="Chuyển thành Trả lời ngắn / Điền số (Phần III)">Ngắn</button>
      </div>
    `;

    let bodyHtml = "";

    // Render theo từng loại câu hỏi
    if (item.type === QUESTION_TYPES.TRUE_FALSE) {
      const statements = Array.isArray(item.statements) && item.statements.length > 0
        ? item.statements
        : [
            { key: "a", text: "" },
            { key: "b", text: "" },
            { key: "c", text: "" },
            { key: "d", text: "" }
          ];

      const rowsHtml = statements
        .map((s) => {
          const isT = item.correct && item.correct[s.key] === true;
          const isF = item.correct && item.correct[s.key] === false;
          return `
            <div class="builder-tf-row">
              <span class="builder-tf-key">${s.key})</span>
              <input type="text" class="builder-tf-input q-tf-statement-input" data-idx="${index}" data-key="${s.key}" value="${escapeHtml(s.text)}" placeholder="Nội dung mệnh đề ${s.key}...">
              <div class="builder-tf-toggles">
                <button type="button" class="btn-tf-toggle ${isT ? 'active-true' : ''} btn-set-tf-val" data-idx="${index}" data-key="${s.key}" data-val="T">Đúng</button>
                <button type="button" class="btn-tf-toggle ${isF ? 'active-false' : ''} btn-set-tf-val" data-idx="${index}" data-key="${s.key}" data-val="F">Sai</button>
              </div>
            </div>
          `;
        })
        .join("");

      bodyHtml = `
        <div class="mt-2">
          <div class="text-[11.5px] font-bold text-slate-700 mb-1 flex items-center justify-between">
            <span><i class="fa-solid fa-list-ol mr-1 text-emerald-600"></i>4 Mệnh đề Đúng/Sai (Click nút Đúng/Sai bên phải từng ý để đặt đáp án gốc):</span>
            <span class="text-xs text-emerald-700">Điểm: 1 ý = 0.1đ | 2 ý = 0.25đ | 3 ý = 0.5đ | 4 ý = 1.0đ</span>
          </div>
          <div class="builder-tf-list">${rowsHtml}</div>
        </div>
      `;
    } else if (item.type === QUESTION_TYPES.SHORT_ANSWER) {
      bodyHtml = `
        <div class="builder-short-answer-box">
          <div class="flex items-center justify-between mb-1">
            <label class="text-xs font-bold text-amber-900"><i class="fa-solid fa-calculator mr-1"></i>Đáp án đúng (hệ thống tự động chuẩn hóa số thập phân, chấp nhận cả dấu phẩy 12,5 và 12.5):</label>
            <span class="text-[11px] font-semibold text-amber-700">Điểm mặc định: ${item.points || 0.5}đ</span>
          </div>
          <input type="text" class="builder-short-input q-short-correct-input" data-idx="${index}" value="${escapeHtml(String(item.correct ?? ''))}" placeholder="Nhập đáp số chuẩn (Ví dụ: 12.5 hoặc -3/4 hoặc từ khóa)...">
        </div>
      `;
    } else {
      // Mặc định: MCQ 4 lựa chọn
      const opts = Array.isArray(item.options) && item.options.length >= 4
        ? item.options
        : ["", "", "", ""];

      bodyHtml = `
        <div class="builder-options-grid">
          ${["A", "B", "C", "D"]
            .map((letter, optIdx) => `
              <div class="builder-opt-card ${item.correct === letter ? "is-correct-opt" : ""}">
                <span class="text-xs font-extrabold text-indigo-700">${letter}</span>
                <input type="text" class="q-opt-input flex-1 p-1 border border-slate-300 rounded text-xs bg-white" data-idx="${index}" data-opt-idx="${optIdx}" value="${escapeHtml(opts[optIdx] || "")}" placeholder="Phương án ${letter}...">
              </div>
            `)
            .join("")}
        </div>
      `;
    }

    div.innerHTML = `
      <div class="builder-q-header">
        <div class="flex items-center gap-2 flex-wrap">
          ${typeBadge}
          <span class="font-extrabold text-slate-800">Câu hỏi #${index + 1}</span>
          ${typeSwitcherHtml}
        </div>
        <div class="flex items-center gap-3 flex-wrap">
          ${
            item.type === QUESTION_TYPES.MCQ
              ? `
            <div class="manual-answer-pills">
              <span class="text-xs font-semibold text-slate-600 mr-1">Đáp án đúng:</span>
              ${["A", "B", "C", "D"]
                .map(
                  (letter) => `
                <button type="button" class="ans-pill-btn ${item.correct === letter ? "selected" : ""}" data-idx="${index}" data-letter="${letter}">
                  ${letter}
                </button>
              `
                )
                .join("")}
            </div>
            `
              : ""
          }
          <button type="button" class="text-rose-600 hover:text-rose-800 text-xs font-bold btn-remove-q" data-idx="${index}">
            <i class="fa-solid fa-trash"></i> Xóa
          </button>
        </div>
      </div>

      <textarea class="q-text-input w-full p-2 border border-slate-300 rounded-lg text-xs font-semibold bg-white" rows="2" data-idx="${index}" placeholder="Nội dung câu hỏi...">${escapeHtml(item.text || "")}</textarea>

      ${bodyHtml}

      <div class="mt-2 flex items-center gap-2">
        <span class="text-[11px] font-bold text-emerald-700 whitespace-nowrap"><i class="fa-solid fa-lightbulb mr-1"></i>Giải thích:</span>
        <input type="text" class="q-explain-input flex-1 p-1.5 border border-emerald-200 rounded-lg text-xs bg-emerald-50/40" data-idx="${index}" value="${escapeHtml(item.explanation || "")}" placeholder="Nhập lời giải chi tiết cho câu này (Chatbot Anh Ba sẽ dùng để giải thích cho học sinh)...">
      </div>
    `;

    questionsBuilderList.appendChild(div);
  });

  // Gán sự kiện cho các thành phần trong Builder Form
  // 1. Chuyển đổi loại câu hỏi
  questionsBuilderList.querySelectorAll(".btn-switch-type").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = Number(e.currentTarget.dataset.idx);
      const targetType = e.currentTarget.dataset.type;
      builderQuestionsState[idx] = convertQuestionType(builderQuestionsState[idx], targetType);
      renderBuilderFormDOM();
    });
  });

  // 2. Click chọn nhanh đáp án đúng A/B/C/D (Phần I)
  questionsBuilderList.querySelectorAll(".ans-pill-btn").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = Number(e.currentTarget.dataset.idx);
      const letter = e.currentTarget.dataset.letter;
      builderQuestionsState[idx].correct = letter;
      renderBuilderFormDOM();
      if (step2AnswerStatus) {
        step2AnswerStatus.textContent = `✅ Đã đặt đáp án Câu #${idx + 1} là ${letter}`;
      }
    });
  });

  // 3. Gạt Đúng / Sai cho từng mệnh đề (Phần II)
  questionsBuilderList.querySelectorAll(".btn-set-tf-val").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = Number(e.currentTarget.dataset.idx);
      const key = e.currentTarget.dataset.key;
      const val = e.currentTarget.dataset.val === "T";
      if (!builderQuestionsState[idx].correct || typeof builderQuestionsState[idx].correct !== "object") {
        builderQuestionsState[idx].correct = { a: true, b: false, c: true, d: false };
      }
      builderQuestionsState[idx].correct[key] = val;
      renderBuilderFormDOM();
      if (step2AnswerStatus) {
        step2AnswerStatus.textContent = `✅ Đã đặt mệnh đề ${key} của Câu #${idx + 1} là: ${val ? "Đúng" : "Sai"}`;
      }
    });
  });

  // 4. Nhập đáp án trả lời ngắn (Phần III)
  questionsBuilderList.querySelectorAll(".q-short-correct-input").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.idx);
      builderQuestionsState[idx].correct = e.target.value.trim();
    });
  });

  // 5. Cập nhật nội dung câu hỏi
  questionsBuilderList.querySelectorAll(".q-text-input").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      builderQuestionsState[Number(e.target.dataset.idx)].text = e.target.value;
    });
  });

  // 6. Cập nhật phương án trắc nghiệm (Phần I)
  questionsBuilderList.querySelectorAll(".q-opt-input").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.idx);
      const optIdx = Number(e.target.dataset.optIdx);
      if (!Array.isArray(builderQuestionsState[idx].options)) {
        builderQuestionsState[idx].options = ["", "", "", ""];
      }
      builderQuestionsState[idx].options[optIdx] = e.target.value;
    });
  });

  // 7. Cập nhật nội dung mệnh đề Đúng/Sai (Phần II)
  questionsBuilderList.querySelectorAll(".q-tf-statement-input").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      const idx = Number(e.target.dataset.idx);
      const key = e.target.dataset.key;
      const stmt = (builderQuestionsState[idx].statements || []).find((s) => s.key === key);
      if (stmt) {
        stmt.text = e.target.value;
      }
    });
  });

  // 8. Cập nhật lời giải chi tiết
  questionsBuilderList.querySelectorAll(".q-explain-input").forEach((inp) => {
    inp.addEventListener("input", (e) => {
      builderQuestionsState[Number(e.target.dataset.idx)].explanation = e.target.value;
    });
  });

  // 9. Nút xóa câu hỏi
  questionsBuilderList.querySelectorAll(".btn-remove-q").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const idx = Number(e.currentTarget.dataset.idx);
      builderQuestionsState.splice(idx, 1);
      renderBuilderFormDOM();
    });
  });
}

function collectFormattedQuestionsFromBuilder() {
  return builderQuestionsState.map((item, idx) => normalizeQuestionSchema(item, idx + 1));
}

/**
 * Đọc nội dung văn bản từ file (.docx, .doc, .pdf, .txt, .rtf) sử dụng exam-engine chuẩn hóa
 */
async function extractTextFromUploadedFile(file) {
  return await readExamFileAsText(file);
}

/**
 * Hàm bóc tách File Đề Ôn thành danh sách câu hỏi hỗ trợ đầy đủ 3 Phần:
 * - Phần I (Trắc nghiệm nhiều lựa chọn)
 * - Phần II (Trắc nghiệm Đúng/Sai 4 ý a,b,c,d)
 * - Phần III (Trắc nghiệm Trả lời ngắn / Điền số)
 */
function parseExamTextToQuestions(rawText) {
  const result = parseExamDocument(rawText);
  return result.questions;
}

/**
 * Tùy chọn 2: Hàm bóc tách File Đáp Án Đúng riêng biệt
 * Tự động mapping đáp án cho cả 3 phần:
 * - Phần I: "1.A 2.B 3.C" hoặc "Câu 1: A - Giải thích: ..."
 * - Phần II: "Câu 1: a-Đ, b-S, c-Đ, d-Đ" hoặc "Đ-S-Đ-Đ"
 * - Phần III: "Câu 1: 12,5" hoặc số thập phân/văn bản
 */
function parseAnswerKeyAndApplyToBuilder(rawAnswerText) {
  if (!rawAnswerText || !rawAnswerText.trim()) return 0;
  if (builderQuestionsState.length === 0) {
    alert("Vui lòng tải File Đề Ôn ở Bước 1 trước khi gán File Đáp Án!");
    return 0;
  }

  const keyDoc = parseAnswerKeyDocument(rawAnswerText);
  const result = applyAnswerKeyToQuestions(builderQuestionsState, keyDoc);
  renderBuilderFormDOM();
  return result.applied;
}

// Bước 1: Sự kiện tải lên File Đề Ôn (.docx, .doc, .pdf, .txt, .rtf)
const unifiedExamFileInput = document.getElementById("unifiedExamFileInput");
if (unifiedExamFileInput) {
  unifiedExamFileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (step1ParseStatus) {
      step1ParseStatus.textContent = `⏳ Đang đọc và bóc tách đề "${file.name}"...`;
    }

    try {
      const rawText = await extractTextFromUploadedFile(file);
      const parseResult = parseExamDocument(rawText);
      const parsed = parseResult.questions;

      if (!parsed || parsed.length === 0) {
        alert("Không tìm thấy câu hỏi đúng định dạng trong file vừa chọn!\nHệ thống hỗ trợ cả 3 phần: Phần I (Trắc nghiệm A,B,C,D), Phần II (Đúng/Sai a,b,c,d), Phần III (Trả lời ngắn/số).");
        if (step1ParseStatus) step1ParseStatus.textContent = "⚠️ Chưa nhận diện được câu hỏi";
        return;
      }

      // Tự động lấy tên file làm tiêu đề bài thi nếu chưa có
      const titleInput = document.getElementById("newExamTitle");
      if (titleInput && (!titleInput.value || titleInput.value.startsWith("Đề Ôn Luyện Môn"))) {
        titleInput.value = file.name.replace(/\.[^/.]+$/, "");
      }

      // Nếu trong file đề đã kèm sẵn phần đáp án ở cuối, tự động parse và áp dụng ngay
      if (parseResult.answerSectionText) {
        const autoKeyDoc = parseAnswerKeyDocument(parseResult.answerSectionText);
        applyAnswerKeyToQuestions(parsed, autoKeyDoc);
      }

      populateBuilderFormWithQuestions(parsed);

      const stats = parseResult.stats;
      if (step1ParseStatus) {
        step1ParseStatus.textContent = `✅ Đã bóc tách thành công ${parsed.length} câu (Phần I: ${stats.part1}, Phần II: ${stats.part2}, Phần III: ${stats.part3}) từ "${file.name}"!`;
      }
    } catch (err) {
      alert("Lỗi khi đọc File Đề Ôn: " + (err.message || err));
      if (step1ParseStatus) step1ParseStatus.textContent = "❌ Lỗi đọc file";
    }
  });
}

// Bước 2 (Tùy chọn 2): Sự kiện tải lên File Đáp Án Đúng riêng biệt (.docx, .doc, .pdf, .txt, .rtf)
const answerKeyFileInput = document.getElementById("answerKeyFileInput");
if (answerKeyFileInput) {
  answerKeyFileInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (step2AnswerStatus) {
      step2AnswerStatus.textContent = `⏳ Đang đọc File Đáp Án "${file.name}"...`;
    }

    try {
      const rawAnswerText = await extractTextFromUploadedFile(file);
      const count = parseAnswerKeyAndApplyToBuilder(rawAnswerText);
      if (count > 0) {
        if (step2AnswerStatus) {
          step2AnswerStatus.textContent = `✅ Đã khớp thành công đáp án cho ${count}/${builderQuestionsState.length} câu hỏi!`;
        }
      } else {
        alert("Không tìm thấy đáp án khớp với danh sách câu hỏi hiện tại!\nHỗ trợ các định dạng: 1.A, 2.B (Phần I), 1: a-Đ, b-S, c-Đ, d-Đ hoặc Đ-S-Đ-Đ (Phần II), và số/từ khóa (Phần III).");
        if (step2AnswerStatus) {
          step2AnswerStatus.textContent = "⚠️ Chưa khớp được đáp án";
        }
      }
    } catch (err) {
      alert("Lỗi khi đọc File Đáp Án: " + (err.message || err));
    }
  });
}

// Bước 2: Gán nhanh chuỗi đáp án (ví dụ: "1.A, 2.C, 3: Đ-S-Đ-Đ, 4: 12.5...")
const quickAnswerKeyStringInput = document.getElementById("quickAnswerKeyStringInput");
const btnApplyQuickAnswerString = document.getElementById("btnApplyQuickAnswerString");
if (btnApplyQuickAnswerString && quickAnswerKeyStringInput) {
  btnApplyQuickAnswerString.addEventListener("click", () => {
    const raw = quickAnswerKeyStringInput.value.trim();
    if (!raw) {
      alert("Vui lòng nhập chuỗi đáp án (Ví dụ: 1.A, 2.C, 3: Đ-S-Đ-Đ, 4: 12.5)!");
      return;
    }
    const count = parseAnswerKeyAndApplyToBuilder(raw);
    if (step2AnswerStatus) {
      step2AnswerStatus.textContent = `✅ Đã gán đáp án cho ${count}/${builderQuestionsState.length} câu hỏi!`;
    }
  });
}

// Nút nạp đề mẫu của môn học
const btnAutoFillFromBank = document.getElementById("btnAutoFillFromBank");
if (btnAutoFillFromBank) {
  btnAutoFillFromBank.addEventListener("click", () => {
    const bank = SUBJECT_QUESTION_BANK[currentSelectedSubject] || SUBJECT_QUESTION_BANK["Toán"];
    populateBuilderFormWithQuestions(bank);
    if (step1ParseStatus) {
      step1ParseStatus.textContent = `✅ Đã nạp ${bank.length} câu hỏi mẫu chuẩn 3 phần môn ${currentSelectedSubject}!`;
    }
  });
}

// Các nút thêm câu hỏi thủ công theo từng phần
const btnAddMcqQuestion = document.getElementById("btnAddMcqQuestion");
if (btnAddMcqQuestion) {
  btnAddMcqQuestion.addEventListener("click", () => {
    const nextNum = builderQuestionsState.length + 1;
    builderQuestionsState.push(createBlankQuestion(QUESTION_TYPES.MCQ, nextNum, 1));
    renderBuilderFormDOM();
  });
}

const btnAddTfQuestion = document.getElementById("btnAddTfQuestion");
if (btnAddTfQuestion) {
  btnAddTfQuestion.addEventListener("click", () => {
    const nextNum = builderQuestionsState.length + 1;
    builderQuestionsState.push(createBlankQuestion(QUESTION_TYPES.TRUE_FALSE, nextNum, 2));
    renderBuilderFormDOM();
  });
}

const btnAddShortQuestion = document.getElementById("btnAddShortQuestion");
if (btnAddShortQuestion) {
  btnAddShortQuestion.addEventListener("click", () => {
    const nextNum = builderQuestionsState.length + 1;
    builderQuestionsState.push(createBlankQuestion(QUESTION_TYPES.SHORT_ANSWER, nextNum, 3));
    renderBuilderFormDOM();
  });
}

const btnAddBlankQuestion = document.getElementById("btnAddBlankQuestion");
if (btnAddBlankQuestion) {
  btnAddBlankQuestion.addEventListener("click", () => {
    const nextNum = builderQuestionsState.length + 1;
    builderQuestionsState.push(createBlankQuestion(QUESTION_TYPES.MCQ, nextNum, 1));
    renderBuilderFormDOM();
  });
}

// Nút bóc tách từ ô dán văn bản
const btnParseRawToForm = document.getElementById("btnParseRawToForm");
const rawPasteExamText = document.getElementById("rawPasteExamText");
if (btnParseRawToForm && rawPasteExamText) {
  btnParseRawToForm.addEventListener("click", () => {
    const raw = rawPasteExamText.value.trim();
    if (!raw) {
      alert("Vui lòng dán nội dung đề thi vào ô văn bản!");
      return;
    }
    const parseResult = parseExamDocument(raw);
    const parsed = parseResult.questions;
    if (!parsed || parsed.length === 0) {
      alert("Chưa nhận diện được cấu trúc câu hỏi. Hệ thống hỗ trợ cả 3 phần: Phần I (Trắc nghiệm), Phần II (Đúng/Sai 4 ý a,b,c,d), Phần III (Trả lời ngắn).");
      return;
    }

    if (parseResult.answerSectionText) {
      const autoKeyDoc = parseAnswerKeyDocument(parseResult.answerSectionText);
      applyAnswerKeyToQuestions(parsed, autoKeyDoc);
    }

    populateBuilderFormWithQuestions(parsed);
    if (step1ParseStatus) {
      step1ParseStatus.textContent = `✅ Đã bóc tách ${parsed.length} câu hỏi từ văn bản dán!`;
    }
  });
}

// Nút tải File Đề Mẫu 3 Phần & File Đáp Án Mẫu (.txt)
const downloadTextFile = (content, filename) => {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
};

const btnDownloadSampleFiles = document.getElementById("btnDownloadSampleFiles");
if (btnDownloadSampleFiles) {
  btnDownloadSampleFiles.addEventListener("click", () => {
    downloadTextFile(buildSampleExamText(), "1_De_Thi_Mau_THPTQG_2025_3_Phan.txt");
  });
}

const btnDownloadSampleKey = document.getElementById("btnDownloadSampleKey");
if (btnDownloadSampleKey) {
  btnDownloadSampleKey.addEventListener("click", () => {
    downloadTextFile(buildSampleAnswerKeyText(), "2_Dap_An_Va_Loi_Giai_Mau_THPTQG_2025.txt");
  });
}

// Lưu đề vào kho và/hoặc vào thi ngay
async function saveUnifiedExamAndOptionallyStart(startImmediately = false) {
  const title = document.getElementById("newExamTitle")?.value.trim() || `Đề Ôn Tập Môn ${currentSelectedSubject}`;
  const duration = Math.max(1, parseInt(document.getElementById("newExamDuration")?.value, 10) || 50);
  const formattedQuestions = collectFormattedQuestionsFromBuilder();

  if (formattedQuestions.length === 0) {
    alert("Chưa có câu hỏi nào trong danh sách! Hãy tải File Đề Ôn lên trước.");
    return;
  }

  const examData = {
    id: `local_${Date.now()}`,
    title,
    duration,
    subject: currentSelectedSubject,
    questions: formattedQuestions,
    createdBy: currentUser?.email || "student",
    createdAt: new Date().toISOString()
  };

  // Lưu ngay vào kho tri thức nội bộ để Chatbot Anh Ba trả lời được ngay lập tức
  saveExamToLocalKnowledgeBase(examData);

  try {
    const docRef = await addDoc(collection(db, `exams_${currentSelectedSubject}`), examData);
    examData.id = docRef.id;
  } catch (err) {
    console.warn("Đã lưu đề vào bộ nhớ cục bộ (Firestore đang giới hạn quyền ghi):", err.message);
  }

  if (createExamModal) createExamModal.classList.add("hidden");
  await loadExams(currentSelectedSubject);

  if (startImmediately) {
    localStorage.setItem("activeExamData", JSON.stringify(examData));
    window.location.href = "exam-room.html";
  }
}

const btnSaveNewExam = document.getElementById("btnSaveNewExam");
const btnSaveAndStartExam = document.getElementById("btnSaveAndStartExam");
if (btnSaveNewExam) btnSaveNewExam.addEventListener("click", () => saveUnifiedExamAndOptionallyStart(false));
if (btnSaveAndStartExam) btnSaveAndStartExam.addEventListener("click", () => saveUnifiedExamAndOptionallyStart(true));

/* ==========================================================================
   12. PHÒNG THI TRỰC TUYẾN (CẤU TRÚC MỚI THPTQG 2025: PHẦN I, II, III & CHẤM ĐIỂM LŨY TIẾN)
   ========================================================================== */
function initExamRoom() {
  const raw = localStorage.getItem("activeExamData");
  if (!raw) {
    window.location.href = "dashboard.html";
    return;
  }
  const exam = JSON.parse(raw);
  currentSelectedSubject = exam.subject || "Toán";
  saveExamToLocalKnowledgeBase(exam);

  const roomExamName = document.getElementById("roomExamName");
  const roomExamSubjectBadge = document.getElementById("roomExamSubjectBadge");
  const questionsContainer = document.getElementById("questionsContainer");
  const paletteGrid = document.getElementById("paletteGrid");
  const timerDisplay = document.getElementById("timerDisplay");
  const cheatWarning = document.getElementById("cheatWarning");
  const answeredCountBadge = document.getElementById("answeredCountBadge");
  const roomAdjustDurationInput = document.getElementById("roomAdjustDurationInput");
  const btnApplyRoomDuration = document.getElementById("btnApplyRoomDuration");

  if (roomExamName) roomExamName.textContent = exam.title;
  if (roomExamSubjectBadge) roomExamSubjectBadge.textContent = `Môn: ${currentSelectedSubject}`;
  if (roomAdjustDurationInput) roomAdjustDurationInput.value = exam.duration || 50;

  // Chuẩn hóa toàn bộ schema câu hỏi trong bài thi
  const normalizedQuestions = (exam.questions || []).map((q, idx) => normalizeQuestionSchema(q, idx + 1));
  exam.questions = normalizedQuestions;

  let studentAnswers = {};
  let isExamSubmitted = false;
  const startTime = Date.now();
  const totalQuestions = exam.questions.length;

  const isQuestionAnswered = (qId, qType) => {
    const ans = studentAnswers[qId];
    if (ans === undefined || ans === null) return false;
    if (qType === QUESTION_TYPES.TRUE_FALSE) {
      if (typeof ans !== "object") return false;
      return Object.keys(ans).length > 0;
    }
    return String(ans).trim() !== "";
  };

  const updateAnsweredCounter = () => {
    let count = 0;
    exam.questions.forEach((q, idx) => {
      const qId = q.id || idx + 1;
      if (isQuestionAnswered(qId, q.type)) count++;
    });
    if (answeredCountBadge) answeredCountBadge.textContent = `${count}/${totalQuestions}`;
  };
  updateAnsweredCounter();

  if (questionsContainer && paletteGrid) {
    questionsContainer.innerHTML = "";
    paletteGrid.innerHTML = "";

    let currentRenderedPart = null;

    exam.questions.forEach((q, idx) => {
      const qId = q.id || idx + 1;

      // Palette button
      const pBtn = document.createElement("div");
      pBtn.className = "palette-btn";
      pBtn.id = `palette-${qId}`;
      pBtn.textContent = idx + 1;
      pBtn.addEventListener("click", () => {
        document.getElementById(`q-${qId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      paletteGrid.appendChild(pBtn);

      // Nếu chuyển sang phần mới (Phần I, Phần II, Phần III), chèn banner phân cách
      const qPart = q.part || (q.type === QUESTION_TYPES.TRUE_FALSE ? 2 : q.type === QUESTION_TYPES.SHORT_ANSWER ? 3 : 1);
      if (qPart !== currentRenderedPart) {
        currentRenderedPart = qPart;
        const partHeaderDiv = document.createElement("div");
        partHeaderDiv.className = `part-section-header part-${qPart}`;

        let partTitle = "";
        let partDesc = "";
        if (qPart === 1) {
          partTitle = "PHẦN I. CÂU TRẮC NGHIỆM NHIỀU PHƯƠNG ÁN LỰA CHỌN";
          partDesc = "Thí sinh trả lời từ câu hỏi này. Mỗi câu hỏi thí sinh chỉ chọn một phương án (A, B, C hoặc D).";
        } else if (qPart === 2) {
          partTitle = "PHẦN II. CÂU TRẮC NGHIỆM ĐÚNG SAI";
          partDesc = "Trong mỗi ý a), b), c), d) ở mỗi câu, thí sinh chọn Đúng hoặc Sai. Thang điểm lũy tiến Bộ GD&ĐT: 1 ý đúng = 0.1đ | 2 ý đúng = 0.25đ | 3 ý đúng = 0.5đ | 4 ý đúng = 1.0đ.";
        } else {
          partTitle = "PHẦN III. CÂU TRẮC NGHIỆM TRẢ LỜI NGẮN";
          partDesc = "Thí sinh điền kết quả / đáp số vào ô trống. Hệ thống tự động nhận diện tương đương số thập phân (chấp nhận cả 12.5 và 12,5).";
        }

        partHeaderDiv.innerHTML = `
          <div class="part-section-title">
            <span class="part-tag-badge part-tag-${qPart}">Phần ${qPart}</span>
            <span>${partTitle}</span>
          </div>
          <div class="part-section-desc">${partDesc}</div>
        `;
        questionsContainer.appendChild(partHeaderDiv);
      }

      // Khối hiển thị câu hỏi
      const qDiv = document.createElement("div");
      qDiv.className = "question-block";
      qDiv.id = `q-${qId}`;

      let optHtml = "";

      if (q.type === QUESTION_TYPES.TRUE_FALSE) {
        // Giao diện Đúng / Sai dạng bảng 4 mệnh đề
        const stmts = Array.isArray(q.statements) && q.statements.length > 0
          ? q.statements
          : [
              { key: "a", text: "Ý a" },
              { key: "b", text: "Ý b" },
              { key: "c", text: "Ý c" },
              { key: "d", text: "Ý d" }
            ];

        const rows = stmts
          .map((s) => `
            <tr>
              <td>
                <span class="font-bold text-slate-800 mr-1.5">${s.key})</span>
                <span class="text-slate-700">${escapeHtml(s.text)}</span>
              </td>
              <td class="tf-col-radio">
                <label class="tf-radio-label opt-true" data-qid="${qId}" data-key="${s.key}" data-val="T">
                  <input type="radio" name="q_${qId}_${s.key}" value="T">
                  <span>Đúng</span>
                </label>
              </td>
              <td class="tf-col-radio">
                <label class="tf-radio-label opt-false" data-qid="${qId}" data-key="${s.key}" data-val="F">
                  <input type="radio" name="q_${qId}_${s.key}" value="F">
                  <span>Sai</span>
                </label>
              </td>
            </tr>
          `)
          .join("");

        optHtml = `
          <table class="tf-exam-table">
            <thead>
              <tr>
                <th>Nội dung các mệnh đề</th>
                <th>Đúng</th>
                <th>Sai</th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        `;
      } else if (q.type === QUESTION_TYPES.SHORT_ANSWER) {
        // Giao diện Trả lời ngắn / Điền số
        optHtml = `
          <div class="mt-2">
            <label class="text-xs font-semibold text-slate-600 mb-1 block">
              <i class="fa-solid fa-pen mr-1 text-amber-600"></i>Nhập kết quả / đáp số (chấp nhận cả số thập phân dấu phẩy hoặc dấu chấm):
            </label>
            <input type="text" class="short-answer-input" placeholder="Ví dụ: 12.5 hoặc 12,5 hoặc 8..." data-qid="${qId}">
          </div>
        `;
      } else {
        // Giao diện Trắc nghiệm 4 lựa chọn (Phần I)
        optHtml = (q.options || [])
          .map((o, optIdx) => {
            const letter = MCQ_LETTERS[optIdx] || "A";
            return `
            <label class="option-item" data-letter="${letter}">
              <input type="radio" name="q_${qId}" value="${letter}">
              <span>${escapeHtml(formatOptionLabel(letter, o))}</span>
            </label>
          `;
          })
          .join("");
      }

      const safeText = (q.text || "").replace(/'/g, "\\'").replace(/"/g, "&quot;");

      qDiv.innerHTML = `
        <div class="flex items-start justify-between gap-3 mb-2">
          <div class="flex-1">
            <span class="text-xs font-extrabold text-indigo-600 mr-1.5">[Câu #${idx + 1}]</span>
            <span class="font-bold text-slate-800 text-sm leading-relaxed">${escapeHtml(q.text)}</span>
          </div>
          <button type="button" class="text-xs font-bold text-indigo-600 hover:text-pink-600 whitespace-nowrap px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-200" onclick="window.askAnhBaQuestion('${safeText}')">
            <i class="fa-solid fa-chalkboard-user mr-1"></i> Hỏi Anh Ba
          </button>
        </div>
        <div class="options-wrapper">${optHtml}</div>
        <div id="explain-${qId}" class="hidden mt-3 p-3.5 rounded-xl border text-xs"></div>
      `;

      questionsContainer.appendChild(qDiv);

      // Gán sự kiện lưu câu trả lời của học sinh
      if (q.type === QUESTION_TYPES.TRUE_FALSE) {
        qDiv.querySelectorAll(".tf-radio-label").forEach((label) => {
          label.addEventListener("click", (e) => {
            if (isExamSubmitted) return;
            const key = label.dataset.key;
            const val = label.dataset.val === "T";

            // Bỏ chọn nhãn cùng dòng và đánh dấu nhãn được chọn
            const row = label.closest("tr");
            row.querySelectorAll(".tf-radio-label").forEach((l) => l.classList.remove("selected"));
            label.classList.add("selected");
            const radio = label.querySelector("input[type='radio']");
            if (radio) radio.checked = true;

            if (!studentAnswers[qId] || typeof studentAnswers[qId] !== "object") {
              studentAnswers[qId] = {};
            }
            studentAnswers[qId][key] = val;

            pBtn.classList.add("answered");
            updateAnsweredCounter();
          });
        });
      } else if (q.type === QUESTION_TYPES.SHORT_ANSWER) {
        const inp = qDiv.querySelector(".short-answer-input");
        if (inp) {
          inp.addEventListener("input", (e) => {
            if (isExamSubmitted) return;
            const val = e.target.value.trim();
            studentAnswers[qId] = val;
            if (val) {
              pBtn.classList.add("answered");
            } else {
              pBtn.classList.remove("answered");
            }
            updateAnsweredCounter();
          });
        }
      } else {
        qDiv.querySelectorAll("input[type='radio']").forEach((inp) => {
          inp.addEventListener("change", (e) => {
            if (isExamSubmitted) return;
            studentAnswers[qId] = e.target.value.trim().toUpperCase();
            pBtn.classList.add("answered");
            updateAnsweredCounter();
          });
        });
      }
    });
  }

  const onBlurWarning = () => {
    if (!isExamSubmitted && cheatWarning) {
      cheatWarning.classList.remove("hidden");
    }
  };
  registerWindowListener("blur", onBlurWarning);

  let remSec = (parseInt(exam.duration, 10) || 50) * 60;

  const renderTimerText = () => {
    if (!timerDisplay) return;
    const m = Math.floor(remSec / 60);
    const s = remSec % 60;
    timerDisplay.textContent = `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    if (remSec <= 60) {
      timerDisplay.classList.add("urgent");
    } else {
      timerDisplay.classList.remove("urgent");
    }
  };
  renderTimerText();

  const startCountdown = () => {
    if (cleanupRegistry.examTimerInterval) clearInterval(cleanupRegistry.examTimerInterval);
    cleanupRegistry.examTimerInterval = setInterval(() => {
      if (isExamSubmitted) {
        clearInterval(cleanupRegistry.examTimerInterval);
        return;
      }
      remSec--;
      renderTimerText();
      if (remSec <= 0) {
        clearInterval(cleanupRegistry.examTimerInterval);
        submitExamAction(exam, studentAnswers, startTime, true);
      }
    }, 1000);
  };
  startCountdown();

  if (btnApplyRoomDuration && roomAdjustDurationInput) {
    btnApplyRoomDuration.addEventListener("click", () => {
      if (isExamSubmitted) return;
      const newMin = Math.max(1, parseInt(roomAdjustDurationInput.value, 10) || 50);
      remSec = newMin * 60;
      renderTimerText();
    });
  }

  const btnSubmitExam = document.getElementById("btnSubmitExam");
  if (btnSubmitExam) {
    btnSubmitExam.addEventListener("click", () => {
      if (isExamSubmitted) return;
      if (confirm("Xác nhận nộp bài và đối chiếu đáp án gốc ngay bây giờ?")) {
        clearInterval(cleanupRegistry.examTimerInterval);
        submitExamAction(exam, studentAnswers, startTime, false);
      }
    });
  }

  async function submitExamAction(examObj, answersMap, startedAt, isAutoTimeout) {
    if (isExamSubmitted) return;
    isExamSubmitted = true;

    // Chấm điểm toàn diện bài thi theo chuẩn THPTQG 2025 (kèm thang điểm lũy tiến Phần II và chuẩn hóa số thập phân Phần III)
    const grading = gradeExam(examObj.questions, answersMap);

    // Khóa toàn bộ input để chống sửa bài sau khi nộp
    if (questionsContainer) {
      questionsContainer.querySelectorAll("input, button.btn-set-tf-val").forEach((el) => {
        el.disabled = true;
      });
    }

    // Hiển thị phần đối chiếu chi tiết cho từng câu hỏi
    grading.perQuestion.forEach((res) => {
      const q = res.question;
      const qId = q.id;
      const explainBox = document.getElementById(`explain-${qId}`);
      if (!explainBox) return;

      explainBox.classList.remove("hidden");

      let reviewHtml = "";

      if (q.type === QUESTION_TYPES.TRUE_FALSE) {
        const sub = res.subDetails || {};
        const breakdown = sub.breakdown || {};
        const correctCount = sub.correctSubCount || 0;

        const stmtRows = (q.statements || [])
          .map((s) => {
            const item = breakdown[s.key] || {};
            const userPick = item.studentChoice === true ? "Đúng" : item.studentChoice === false ? "Sai" : "Chưa chọn";
            const correctPick = item.standardAnswer === true ? "Đúng" : "Sai";
            const isMatch = item.isCorrect;
            return `
              <div class="tf-review-row">
                <div>
                  <span class="font-bold">${s.key})</span> ${escapeHtml(s.text)}
                </div>
                <div class="flex items-center gap-2 whitespace-nowrap">
                  <span>Em chọn: <b>${userPick}</b></span>
                  <span>| Chuẩn: <b>${correctPick}</b></span>
                  <span>${isMatch ? "✅ Đúng" : "❌ Sai"}</span>
                </div>
              </div>
            `;
          })
          .join("");

        reviewHtml = `
          <div class="font-bold text-sm ${res.pointsAwarded > 0 ? 'text-emerald-700' : 'text-rose-600'} mb-1.5">
            ${res.isFullyCorrect ? "✅ Đúng trọn vẹn 4/4 ý!" : `🎯 Đúng ${correctCount}/4 ý`} — Đạt: <b>${res.pointsAwarded} / ${res.maxPoints} điểm</b> (Theo thang điểm lũy tiến Bộ GD&ĐT)
          </div>
          <div class="bg-white p-2.5 rounded-lg border border-slate-200 mt-1 mb-2">${stmtRows}</div>
        `;
      } else if (q.type === QUESTION_TYPES.SHORT_ANSWER) {
        const userStr = res.studentAnswer !== undefined && res.studentAnswer !== null && String(res.studentAnswer).trim() !== "" ? String(res.studentAnswer) : "Chưa làm";
        const correctStr = String(q.correct ?? "");

        reviewHtml = `
          <div class="font-bold text-sm ${res.isFullyCorrect ? 'text-emerald-700' : 'text-rose-600'}">
            ${res.isFullyCorrect ? "✅ Chính xác!" : "❌ Chưa đúng"} — Đạt: <b>${res.pointsAwarded} / ${res.maxPoints} điểm</b>
          </div>
          <div class="mt-1 text-slate-700">
            • Kết quả em điền: <b>${escapeHtml(userStr)}</b><br>
            • Đáp án chuẩn: <b>${escapeHtml(correctStr)}</b> (Chấp nhận cả dấu phẩy <code>,</code> và dấu chấm <code>.</code> thập phân)
          </div>
        `;
      } else {
        // MCQ 4 lựa chọn
        const userLetter = res.studentAnswer ? String(res.studentAnswer).toUpperCase() : "Chưa chọn";
        const correctLetter = String(q.correct || "A").toUpperCase();

        reviewHtml = `
          <div class="font-bold text-sm ${res.isFullyCorrect ? 'text-emerald-700' : 'text-rose-600'}">
            ${res.isFullyCorrect ? "✅ Chính xác!" : "❌ Chưa đúng"} — Đạt: <b>${res.pointsAwarded} / ${res.maxPoints} điểm</b>
          </div>
          <div class="mt-1 text-slate-700">
            • Phương án em chọn: <b>${userLetter}</b> | Đáp án chuẩn: <b>${correctLetter}</b>
          </div>
        `;
      }

      const explainText = q.explanation && q.explanation.trim() !== ""
        ? `<div class="mt-2 pt-2 border-t border-emerald-200 text-slate-700">💡 <b>Lời giải chi tiết từ Thầy Anh Ba:</b> ${escapeHtml(q.explanation)}</div>`
        : "";

      explainBox.className = `mt-3 p-3.5 rounded-xl border text-xs ${res.isFullyCorrect ? 'bg-emerald-50 border-emerald-300' : res.pointsAwarded > 0 ? 'bg-amber-50 border-amber-300' : 'bg-rose-50 border-rose-300'}`;
      explainBox.innerHTML = reviewHtml + explainText;
    });

    const timeTaken = Math.round((Date.now() - startedAt) / 1000);
    const timerStatusTag = document.getElementById("timerStatusTag");
    if (timerStatusTag) {
      timerStatusTag.textContent = isAutoTimeout ? "Hết giờ - Đã tự thu bài" : "Đã nộp bài";
    }

    const resultBanner = document.getElementById("examResultBanner");
    const resultTitle = document.getElementById("resultSummaryTitle");
    const resultSub = document.getElementById("resultSummarySub");
    if (resultBanner) resultBanner.classList.remove("hidden");
    if (resultTitle) {
      resultTitle.textContent = `${isAutoTimeout ? "⏰ Hết giờ! Hệ thống tự thu bài — " : ""}Điểm số: ${grading.scaledScore} / 10 điểm`;
    }
    if (resultSub) {
      const part1Info = grading.byPart[1].maxScore > 0 ? `Phần I: ${grading.byPart[1].rawScore}/${grading.byPart[1].maxScore}đ` : "";
      const part2Info = grading.byPart[2].maxScore > 0 ? `Phần II: ${grading.byPart[2].rawScore}/${grading.byPart[2].maxScore}đ` : "";
      const part3Info = grading.byPart[3].maxScore > 0 ? `Phần III: ${grading.byPart[3].rawScore}/${grading.byPart[3].maxScore}đ` : "";
      const partsDetail = [part1Info, part2Info, part3Info].filter(Boolean).join(" | ");

      resultSub.textContent = `Điểm thô: ${grading.rawScore}/${grading.maxScore}đ (${partsDetail}) | Số câu đúng trọn vẹn: ${grading.fullyCorrectCount}/${examObj.questions.length} câu | Thời gian: ${timeTaken}s | Môn: ${examObj.subject || currentSelectedSubject}`;
    }
    window.scrollTo({ top: 0, behavior: "smooth" });

    const resolvedUserName =
      auth.currentUser?.displayName ||
      (auth.currentUser?.email ? auth.currentUser.email.split("@")[0] : "Học sinh 12A1");

    try {
      await addDoc(collection(db, "leaderboard"), {
        uid: auth.currentUser?.uid || "anonymous",
        userName: resolvedUserName,
        subject: examObj.subject || currentSelectedSubject,
        examTitle: examObj.title,
        score: grading.scaledScore,
        rawScore: grading.rawScore,
        maxScore: grading.maxScore,
        correctCount: grading.fullyCorrectCount,
        totalQuestions: examObj.questions.length,
        timeTakenSeconds: timeTaken,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.warn("Lưu điểm BXH:", err.message);
    }
  }
}

/* ==========================================================================
   13. BẢNG XẾP HẠNG (BXH) REAL-TIME DẠNG MARQUEE CHẠY NGANG
   ========================================================================== */
function initRealtimeLeaderboardMarquee() {
  const track = document.getElementById("bxhMarqueeTrack");
  if (!track) return;

  if (typeof cleanupRegistry.unsubLeaderboard === "function") {
    cleanupRegistry.unsubLeaderboard();
  }

  const lbQuery = query(collection(db, "leaderboard"), orderBy("score", "desc"), limit(20));

  cleanupRegistry.unsubLeaderboard = onSnapshot(
    lbQuery,
    (snapshot) => {
      const items = [];
      snapshot.forEach((docSnap) => items.push(docSnap.data()));

      if (items.length === 0) {
        track.innerHTML = `
          <span class="bxh-ticker-item">
            <span class="bxh-rank-badge bxh-rank-1">🥇 Hạng 1</span>
            <span><b>Nguyễn Minh Quân</b> - Điểm cao nhất: <span class="bxh-score-highlight">9.8 điểm</span> - Cao điểm nhất ở: <span class="bxh-subject-highlight">Môn Toán (Đề Chuẩn THPTQG)</span></span>
          </span>
          <span class="bxh-ticker-item">
            <span class="bxh-rank-badge bxh-rank-2">🥈 Hạng 2</span>
            <span><b>Trần Thảo Vy</b> - Điểm cao nhất: <span class="bxh-score-highlight">9.5 điểm</span> - Cao điểm nhất ở: <span class="bxh-subject-highlight">Môn Địa Lí (Đề Luyện Tập)</span></span>
          </span>
        `;
        return;
      }

      const bestByUser = new Map();
      items.forEach((entry) => {
        const key = entry.userName || "Học sinh";
        if (!bestByUser.has(key) || Number(entry.score) > Number(bestByUser.get(key).score)) {
          bestByUser.set(key, entry);
        }
      });

      const rankedList = Array.from(bestByUser.values()).sort((a, b) => Number(b.score) - Number(a.score));

      track.innerHTML = rankedList
        .map((r, index) => {
          const rankNum = index + 1;
          const rankClass = rankNum <= 3 ? `bxh-rank-${rankNum}` : "";
          const medalIcon = rankNum === 1 ? "🥇" : rankNum === 2 ? "🥈" : rankNum === 3 ? "🥉" : "🏅";
          const subjectAndExam = r.subject
            ? `Môn ${r.subject} (${r.examTitle || "Bài thi THPTQG"})`
            : r.examTitle || "Đề THPTQG";

          return `
            <span class="bxh-ticker-item">
              <span class="bxh-rank-badge ${rankClass}">${medalIcon} Hạng ${rankNum}</span>
              <span>
                <b>${r.userName}</b> - Điểm cao nhất: <span class="bxh-score-highlight">${r.score} điểm</span> - Cao điểm nhất ở: <span class="bxh-subject-highlight">${subjectAndExam}</span>
              </span>
            </span>
          `;
        })
        .join("");
    },
    (err) => {
      console.warn("Lắng nghe BXH Real-time:", err.message);
    }
  );
}

async function loadLeaderboardTable() {
  const tbody = document.getElementById("leaderboardBody");
  if (!tbody) return;
  try {
    const qSnap = await getDocs(query(collection(db, "leaderboard"), orderBy("score", "desc"), limit(20)));
    tbody.innerHTML = "";
    let rank = 1;
    qSnap.forEach((d) => {
      const r = d.data();
      tbody.innerHTML += `
        <tr>
          <td><b>#${rank++}</b></td>
          <td>${r.userName || "Học sinh"}</td>
          <td>${r.subject ? `${r.subject} - ` : ""}${r.examTitle || ""}</td>
          <td>${r.correctCount || 0} câu</td>
          <td style="color:#10b981; font-weight:800;">${r.score} điểm</td>
          <td>${r.timeTakenSeconds || 0}s</td>
        </tr>
      `;
    });
  } catch (e) {
    tbody.innerHTML = `<tr><td colspan="6">Không thể tải bảng xếp hạng.</td></tr>`;
  }
}

/* ==========================================================================
   14. MODULE 5: CỘNG ĐỒNG BÁO LỖI & GÓP Ý TRỰC TUYẾN (FIRESTORE REAL-TIME + FALLBACK)
   ========================================================================== */
const FIRESTORE_SECURITY_RULES_TEMPLATE = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Hàm kiểm tra tài khoản Admin tối cao duy nhất: le733833@gmail.com
    function isSuperAdmin() {
      return request.auth != null && request.auth.token.email == "le733833@gmail.com";
    }

    function isSignedIn() {
      return request.auth != null;
    }

    // 1. Cộng đồng Báo lỗi & Góp ý Real-time
    match /bug_reports/{reportId} {
      allow read: if true;
      allow create: if true;
      allow update, delete: if isSuperAdmin();
    }
    match /feedbacks/{feedbackId} {
      allow read: if true;
      allow create: if true;
      allow update, delete: if isSuperAdmin();
    }

    // 2. Quản lý Tài khoản & Phân quyền RBAC
    match /users/{userId} {
      allow read: if true;
      allow create, update: if isSignedIn() && (
        isSuperAdmin() ||
        (request.auth.uid == userId &&
          (!("role" in request.resource.data) ||
           request.resource.data.role == "member" ||
           isSuperAdmin()))
      );
      allow delete: if isSuperAdmin();
    }

    // 3. Hình nền toàn cục Real-time & Cấu hình hệ thống
    match /system_settings/{settingId} {
      allow read: if true;
      allow write: if isSuperAdmin();
    }
    match /system_config/{configId} {
      allow read: if true;
      allow write: if isSuperAdmin();
    }

    // 4. Băng chuyền ảnh Real-time (marquee_images 4:3 & 16:9)
    match /marquee_images/{imageId} {
      allow read: if true;
      allow write: if isSuperAdmin();
    }

    // 5. Bảng xếp hạng Real-time
    match /leaderboard/{entryId} {
      allow read, create: if true;
      allow update, delete: if isSuperAdmin();
    }

    // 6. Kho đề thi các môn
    match /{examCollection}/{examId} {
      allow read: if true;
      allow write: if isSignedIn() || isSuperAdmin();
    }
  }
}`;

function formatCommentTimestamp(tsValue) {
  if (!tsValue) return "Vừa xong";
  try {
    // Hỗ trợ cả Firestore Timestamp object (.toDate()) và chuỗi ISO
    const date = typeof tsValue.toDate === "function" ? tsValue.toDate() : new Date(tsValue);
    if (isNaN(date.getTime())) return "Vừa xong";
    return date.toLocaleString("vi-VN", {
      hour: "2-digit",
      minute: "2-digit",
      day: "2-digit",
      month: "2-digit",
      year: "numeric"
    });
  } catch (_) {
    return "Vừa xong";
  }
}

function getLocalFallbackBugReports() {
  try {
    const raw = localStorage.getItem("hoclieu12a1_fallback_bug_reports");
    return raw ? JSON.parse(raw) : [];
  } catch (_) {
    return [];
  }
}

function saveLocalFallbackBugReport(entry) {
  try {
    const list = getLocalFallbackBugReports();
    list.unshift(entry);
    localStorage.setItem("hoclieu12a1_fallback_bug_reports", JSON.stringify(list.slice(0, 50)));
  } catch (_) {}
}

function renderBugReportsListToDOM(reportsArray) {
  const feedEl = document.getElementById("bugCommentsFeed");
  if (!feedEl) return;

  if (!reportsArray || reportsArray.length === 0) {
    feedEl.innerHTML = `
      <div class="text-center py-6 text-slate-400 text-sm">
        Chưa có bình luận báo lỗi nào. Hãy là người đầu tiên đóng góp ý kiến cho lớp 12A1.1 nhé!
      </div>
    `;
    return;
  }

  feedEl.innerHTML = "";
  reportsArray.forEach((item) => {
    const card = document.createElement("div");
    card.className = "comment-card";
    const avatar = item.avatarUrl || DEFAULT_USER_AVATAR;
    const author = item.user || "Học sinh 12A1.1";
    const emailStr = item.email ? ` (${item.email})` : "";
    const tag = item.category || "Góp ý hệ thống";
    const timeStr = formatCommentTimestamp(item.createdAt || item.timestamp);
    const isAdminComment = resolveUserRole(item.email) === "admin";

    card.innerHTML = `
      <img class="comment-avatar" src="${avatar}" alt="Avatar">
      <div class="comment-bubble">
        <div class="comment-header">
          <div class="flex items-center gap-2 flex-wrap">
            <span class="comment-author">${author}${emailStr}</span>
            ${isAdminComment ? `<span class="role-badge role-admin">ADMIN</span>` : ""}
            <span class="comment-tag">${tag}</span>
          </div>
          <span class="comment-time"><i class="fa-regular fa-clock mr-1"></i>${timeStr}</span>
        </div>
        <div class="comment-text"></div>
      </div>
    `;
    card.querySelector(".comment-text").textContent = item.content || "";
    feedEl.appendChild(card);
  });
}

function initRealtimeBugReports() {
  const feedEl = document.getElementById("bugCommentsFeed");
  if (!feedEl) return;

  if (typeof cleanupRegistry.unsubBugReports === "function") {
    cleanupRegistry.unsubBugReports();
  }

  const bugQuery = query(collection(db, "bug_reports"), orderBy("timestamp", "desc"), limit(40));

  cleanupRegistry.unsubBugReports = onSnapshot(
    bugQuery,
    (snapshot) => {
      const firestoreItems = [];
      snapshot.forEach((docSnap) => firestoreItems.push({ id: docSnap.id, ...docSnap.data() }));

      const localItems = getLocalFallbackBugReports();
      const combined = [...firestoreItems];
      localItems.forEach((loc) => {
        if (!combined.some((f) => f.content === loc.content && f.user === loc.user)) {
          combined.unshift(loc);
        }
      });

      renderBugReportsListToDOM(combined);
    },
    (err) => {
      console.warn("Firestore bug_reports đang cần mở Security Rules trên Console. Hiển thị dữ liệu Real-time nội bộ:", err.message);
      const warningBox = document.getElementById("firestoreRulesWarningBox");
      if (warningBox) warningBox.classList.remove("hidden");
      renderBugReportsListToDOM(getLocalFallbackBugReports());
    }
  );
}

const btnSubmitReportPage = document.getElementById("btnSubmitReportPage");
const reportContentInput = document.getElementById("reportContent");
const reportTagSelect = document.getElementById("reportTagSelect");
const bugReportUiMsg = document.getElementById("bugReportUiMsg");
const btnCopyFirestoreRules = document.getElementById("btnCopyFirestoreRules");

if (btnCopyFirestoreRules) {
  btnCopyFirestoreRules.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(FIRESTORE_SECURITY_RULES_TEMPLATE);
      btnCopyFirestoreRules.innerHTML = `<i class="fa-solid fa-check"></i> Đã Copy Rules!`;
      setTimeout(() => {
        btnCopyFirestoreRules.innerHTML = `<i class="fa-solid fa-copy"></i> Copy Firestore Rules`;
      }, 2500);
    } catch (_) {
      alert(FIRESTORE_SECURITY_RULES_TEMPLATE);
    }
  });
}

function showBugReportUiFeedback(message, isError = false) {
  if (!bugReportUiMsg) return;
  bugReportUiMsg.textContent = message;
  bugReportUiMsg.className = `text-xs font-semibold mt-1 ${isError ? "text-amber-700" : "text-emerald-600"}`;
  bugReportUiMsg.classList.remove("hidden");
  setTimeout(() => {
    bugReportUiMsg.classList.add("hidden");
  }, 5000);
}

async function submitRealtimeBugComment() {
  if (!reportContentInput) return;
  const content = reportContentInput.value.trim();
  if (!content) {
    showBugReportUiFeedback("⚠️ Vui lòng nhập nội dung báo lỗi hoặc góp ý trước khi gửi!", true);
    return;
  }

  const userName =
    auth.currentUser?.displayName ||
    document.getElementById("userGreetingName")?.textContent ||
    (auth.currentUser?.email ? auth.currentUser.email.split("@")[0] : "Học sinh 12A1.1");

  const userEmail = auth.currentUser?.email || "hocsinh@12a1.edu.vn";
  const avatarUrl = localStorage.getItem("hoclieu12a1_userAvatar") || DEFAULT_USER_AVATAR;
  const category = reportTagSelect ? reportTagSelect.value : "Lỗi đáp án / Đề thi";
  const isoNow = new Date().toISOString();

  const payload = {
    uid: auth.currentUser?.uid || "anonymous",
    user: userName,
    email: userEmail,
    role: resolveUserRole(userEmail),
    avatarUrl,
    category,
    content,
    timestamp: isoNow,
    createdAt: serverTimestamp()
  };

  if (btnSubmitReportPage) btnSubmitReportPage.disabled = true;

  try {
    await addDoc(collection(db, "bug_reports"), payload);
    reportContentInput.value = "";
    showBugReportUiFeedback("✅ Đã đăng báo lỗi & đồng bộ Real-time lên Cloud Firestore thành công!");
  } catch (err) {
    // Xử lý triệt để lỗi Missing or insufficient permissions:
    // Lưu ngay vào luồng Real-time Local, cập nhật giao diện tức thì và hiển thị hướng dẫn mở Firestore Security Rules
    const fallbackEntry = { ...payload, createdAt: isoNow };
    saveLocalFallbackBugReport(fallbackEntry);
    renderBugReportsListToDOM(getLocalFallbackBugReports());
    reportContentInput.value = "";

    const warningBox = document.getElementById("firestoreRulesWarningBox");
    if (warningBox) warningBox.classList.remove("hidden");
    showBugReportUiFeedback(
      "✅ Bình luận đã được hiển thị ngay lập tức! (Hãy dán Firestore Security Rules vào Firebase Console để mở quyền ghi Cloud).",
      false
    );
  } finally {
    if (btnSubmitReportPage) btnSubmitReportPage.disabled = false;
  }
}

if (btnSubmitReportPage) {
  btnSubmitReportPage.addEventListener("click", submitRealtimeBugComment);
}
if (reportContentInput) {
  reportContentInput.addEventListener("keydown", (e) => {
    if (e.ctrlKey && e.key === "Enter") submitRealtimeBugComment();
  });
}

/* ==========================================================================
   15. MODULE 2: TRÌNH PHÁT NHẠC MP3 TÙY CHỈNH (CUSTOM LOCAL AUDIO PLAYER)
   ========================================================================== */
function formatAudioSeconds(sec) {
  if (!isFinite(sec) || sec < 0) return "00:00";
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function initMiniMusicPlayer() {
  const drawer = document.getElementById("miniMusicDrawer");
  const toggleBtn = document.getElementById("btnToggleMusicDrawer");
  const arrowIcon = document.getElementById("musicDrawerArrow");
  const vinylDisc = document.getElementById("musicVinylDisc");
  const titleEl = document.getElementById("musicCurrentTitle");
  const artistEl = document.getElementById("musicCurrentArtist");
  const seekBar = document.getElementById("musicSeekBar");
  const curTimeText = document.getElementById("musicCurrentTimeText");
  const durTimeText = document.getElementById("musicDurationTimeText");
  const btnPrev = document.getElementById("btnMusicPrev");
  const btnPlayPause = document.getElementById("btnMusicPlayPause");
  const playIcon = document.getElementById("musicPlayIcon");
  const btnNext = document.getElementById("btnMusicNext");
  const volumeSlider = document.getElementById("musicVolumeSlider");
  const customFileInput = document.getElementById("customMusicFileInput");
  const playlistContainer = document.getElementById("musicDynamicPlaylist");
  const playlistCountEl = document.getElementById("musicPlaylistCount");
  const btnClearAllMusic = document.getElementById("btnClearAllMusic");
  const audioEl = document.getElementById("hiddenAudioElement");

  if (!drawer || !audioEl) return;

  // MODULE 2: Xóa hoàn toàn danh sách nhạc mặc định/hardcode — chỉ sử dụng các file người dùng tự thêm từ máy
  let localPlaylist = [];
  let currentTrackIndex = -1;
  let isPlaying = false;

  const updatePlaybackUI = (playingState) => {
    isPlaying = playingState;
    if (vinylDisc) vinylDisc.classList.toggle("playing", isPlaying);
    if (playIcon) playIcon.className = isPlaying ? "fa-solid fa-pause" : "fa-solid fa-play";
  };

  const renderDynamicPlaylist = () => {
    if (!playlistContainer) return;
    if (playlistCountEl) playlistCountEl.textContent = String(localPlaylist.length);

    if (localPlaylist.length === 0) {
      playlistContainer.innerHTML = `
        <div class="text-[11px] text-slate-400 text-center py-3">
          Danh sách trống. Hãy bấm nút trên để chọn file nhạc MP3 từ máy tính/điện thoại của bạn!
        </div>
      `;
      if (titleEl) titleEl.textContent = "Chưa có bài hát nào";
      if (artistEl) artistEl.textContent = "Hãy tải file MP3 từ máy lên";
      if (seekBar) seekBar.value = "0";
      if (curTimeText) curTimeText.textContent = "00:00";
      if (durTimeText) durTimeText.textContent = "00:00";
      updatePlaybackUI(false);
      return;
    }

    playlistContainer.innerHTML = "";
    localPlaylist.forEach((track, idx) => {
      const row = document.createElement("div");
      row.className = `playlist-track-row ${idx === currentTrackIndex ? "active" : ""}`;
      row.innerHTML = `
        <span class="playlist-track-name" title="${track.title}">
          <i class="fa-solid ${idx === currentTrackIndex && isPlaying ? "fa-volume-high text-pink-400" : "fa-music"} mr-1"></i>
          ${idx + 1}. ${track.title}
        </span>
        <button type="button" class="btn-del-track" data-idx="${idx}" title="Xóa bài này khỏi danh sách">
          <i class="fa-solid fa-trash-can"></i>
        </button>
      `;

      row.addEventListener("click", (e) => {
        if (e.target.closest(".btn-del-track")) return;
        loadAndPlayTrack(idx, true);
      });

      row.querySelector(".btn-del-track").addEventListener("click", (e) => {
        e.stopPropagation();
        removeTrackAtIndex(idx);
      });

      playlistContainer.appendChild(row);
    });
  };

  const loadAndPlayTrack = async (index, autoPlay = true) => {
    if (localPlaylist.length === 0) {
      currentTrackIndex = -1;
      renderDynamicPlaylist();
      return;
    }

    if (index < 0) index = localPlaylist.length - 1;
    if (index >= localPlaylist.length) index = 0;
    currentTrackIndex = index;

    const track = localPlaylist[currentTrackIndex];
    if (titleEl) titleEl.textContent = track.title;
    if (artistEl) artistEl.textContent = `${track.sizeMB} MB • Phát trực tiếp từ bộ nhớ máy`;

    audioEl.src = track.objectUrl;
    renderDynamicPlaylist();

    if (autoPlay) {
      try {
        await audioEl.play();
        updatePlaybackUI(true);
        renderDynamicPlaylist();
      } catch (err) {
        console.warn("Không thể tự động phát nhạc:", err.message);
        updatePlaybackUI(false);
      }
    } else {
      updatePlaybackUI(false);
    }
  };

  const removeTrackAtIndex = (idx) => {
    const removed = localPlaylist[idx];
    if (removed && removed.objectUrl) {
      try {
        URL.revokeObjectURL(removed.objectUrl);
      } catch (_) {}
    }
    localPlaylist.splice(idx, 1);

    if (localPlaylist.length === 0) {
      audioEl.pause();
      audioEl.removeAttribute("src");
      currentTrackIndex = -1;
      renderDynamicPlaylist();
      return;
    }

    if (idx === currentTrackIndex) {
      const nextIdx = idx >= localPlaylist.length ? 0 : idx;
      loadAndPlayTrack(nextIdx, isPlaying);
    } else if (idx < currentTrackIndex) {
      currentTrackIndex--;
      renderDynamicPlaylist();
    } else {
      renderDynamicPlaylist();
    }
  };

  // Xử lý người dùng chọn nhiều file nhạc từ thiết bị cá nhân
  if (customFileInput) {
    customFileInput.addEventListener("change", (e) => {
      try {
        const files = Array.from(e.target.files || []);
        if (files.length === 0) return;

        const wasEmpty = localPlaylist.length === 0;
        files.forEach((file) => {
          const objUrl = URL.createObjectURL(file);
          cleanupRegistry.audioObjectUrls.push(objUrl);
          const cleanName = file.name.replace(/\.[^/.]+$/, "");
          const sizeMB = (file.size / (1024 * 1024)).toFixed(1);
          localPlaylist.push({
            id: `track_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            title: cleanName,
            sizeMB,
            objectUrl: objUrl
          });
        });

        customFileInput.value = "";
        if (wasEmpty && localPlaylist.length > 0) {
          loadAndPlayTrack(0, true);
        } else {
          renderDynamicPlaylist();
        }
      } catch (err) {
        alert("Lỗi khi nạp file nhạc từ thiết bị: " + err.message);
      }
    });
  }

  // Xóa toàn bộ danh sách phát
  if (btnClearAllMusic) {
    btnClearAllMusic.addEventListener("click", () => {
      localPlaylist.forEach((t) => {
        try {
          URL.revokeObjectURL(t.objectUrl);
        } catch (_) {}
      });
      localPlaylist = [];
      audioEl.pause();
      audioEl.removeAttribute("src");
      currentTrackIndex = -1;
      renderDynamicPlaylist();
    });
  }

  // Đồng bộ thanh tua nhạc (Seekbar)
  audioEl.addEventListener("timeupdate", () => {
    if (!audioEl.duration || isNaN(audioEl.duration)) return;
    const pct = (audioEl.currentTime / audioEl.duration) * 100;
    if (seekBar) seekBar.value = String(pct);
    if (curTimeText) curTimeText.textContent = formatAudioSeconds(audioEl.currentTime);
    if (durTimeText) durTimeText.textContent = formatAudioSeconds(audioEl.duration);
  });

  audioEl.addEventListener("loadedmetadata", () => {
    if (durTimeText) durTimeText.textContent = formatAudioSeconds(audioEl.duration);
  });

  audioEl.addEventListener("ended", () => {
    if (localPlaylist.length > 0) {
      loadAndPlayTrack(currentTrackIndex + 1, true);
    }
  });

  if (seekBar) {
    seekBar.addEventListener("input", (e) => {
      if (!audioEl.duration || isNaN(audioEl.duration)) return;
      const pct = parseFloat(e.target.value) || 0;
      audioEl.currentTime = (pct / 100) * audioEl.duration;
    });
  }

  if (toggleBtn) {
    toggleBtn.addEventListener("click", () => {
      const collapsed = drawer.classList.toggle("collapsed");
      if (arrowIcon) {
        arrowIcon.className = collapsed ? "fa-solid fa-chevron-left" : "fa-solid fa-chevron-right";
      }
    });
  }

  if (btnPlayPause) {
    btnPlayPause.addEventListener("click", async () => {
      if (localPlaylist.length === 0) {
        customFileInput?.click();
        return;
      }
      if (currentTrackIndex === -1) {
        await loadAndPlayTrack(0, true);
        return;
      }
      if (audioEl.paused) {
        try {
          await audioEl.play();
          updatePlaybackUI(true);
          renderDynamicPlaylist();
        } catch (err) {
          console.warn("Lỗi phát nhạc:", err.message);
        }
      } else {
        audioEl.pause();
        updatePlaybackUI(false);
        renderDynamicPlaylist();
      }
    });
  }

  if (btnPrev) {
    btnPrev.addEventListener("click", () => {
      if (localPlaylist.length > 0) loadAndPlayTrack(currentTrackIndex - 1, true);
    });
  }
  if (btnNext) {
    btnNext.addEventListener("click", () => {
      if (localPlaylist.length > 0) loadAndPlayTrack(currentTrackIndex + 1, true);
    });
  }

  if (volumeSlider) {
    audioEl.volume = parseFloat(volumeSlider.value) || 0.8;
    volumeSlider.addEventListener("input", (e) => {
      audioEl.volume = parseFloat(e.target.value);
    });
  }

  renderDynamicPlaylist();
}

initMiniMusicPlayer();
