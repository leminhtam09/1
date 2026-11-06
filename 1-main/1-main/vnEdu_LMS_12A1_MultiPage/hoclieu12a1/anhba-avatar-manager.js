/**
 * ANH BA CHATBOT AVATAR MANAGER MODULE
 * Tích hợp Firebase an toàn theo kiến trúc Non-Destructive:
 * - Không gọi lại initializeApp (tái sử dụng instance qua getApp())
 * - Chỉ đọc trạng thái từ onAuthStateChanged để phân quyền Super Admin (le733833@gmail.com)
 * - Tách biệt hoàn toàn collection app_settings/chatbot_anh_ba (không can thiệp bảng users)
 * - Lắng nghe thay đổi bằng onSnapshot để đồng bộ avatar real-time tới mọi client
 */

import { getApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  onSnapshot,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Hằng số bảo vệ hệ thống
const SUPER_ADMIN_EMAIL = "le733833@gmail.com";
const DEFAULT_ANHBA_AVATAR = "https://api.dicebear.com/7.x/bottts/svg?seed=AnhBa12A1";
const SETTINGS_COLLECTION = "app_settings";
const SETTINGS_DOC_ID = "chatbot_anh_ba";
const MAX_FILE_SIZE = 2 * 1024 * 1024; // 2MB
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp", "image/jpg"];

class AnhBaAvatarManager {
  constructor() {
    this.app = null;
    this.auth = null;
    this.db = null;
    this.currentUser = null;
    this.currentAvatarUrl = DEFAULT_ANHBA_AVATAR;
    this.pendingBase64 = null;
    this.unsubSnapshot = null;
    this.unsubAuth = null;

    // Khởi tạo an toàn khi DOM sẵn sàng
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.init());
    } else {
      this.init();
    }
  }

  /**
   * Khởi tạo kết nối tới Firebase instance hiện có mà không phá vỡ Auth
   */
  init() {
    try {
      this.app = getApp();
      this.auth = getAuth(this.app);
      this.db = getFirestore(this.app);
    } catch (err) {
      console.warn("[AnhBaAvatarManager] Đang đợi Firebase Core khởi tạo...", err.message);
      // Thử lại sau 200ms nếu Firebase trong app.js đang nạp
      setTimeout(() => this.init(), 200);
      return;
    }

    this.bindDomElements();
    this.attachEventListeners();
    this.listenToAuthState();
    this.listenToAvatarChanges();
  }

  /**
   * Ánh xạ các phần tử DOM giao diện
   */
  bindDomElements() {
    this.panelContainer = document.getElementById("anhBaAvatarAdminPanel");
    this.dropzone = document.getElementById("anhBaDropzone");
    this.fileInput = document.getElementById("anhBaDropzoneFileInput");
    this.previewImg = document.getElementById("anhBaPreviewImg");
    this.currentImgDisplay = document.getElementById("anhBaCurrentDisplayImg");
    this.btnSave = document.getElementById("btnSaveAnhBaAvatar");
    this.btnCancel = document.getElementById("btnCancelAnhBaAvatar");
    this.btnResetDefault = document.getElementById("btnResetDefaultAnhBaAvatar");
    this.statusMsg = document.getElementById("anhBaAvatarStatusMsg");
  }

  /**
   * Đăng ký sự kiện tương tác
   */
  attachEventListeners() {
    if (this.dropzone && this.fileInput) {
      this.dropzone.addEventListener("click", () => this.fileInput.click());

      this.fileInput.addEventListener("change", (e) => {
        const file = e.target.files?.[0];
        if (file) this.processSelectedFile(file);
      });

      // Drag & Drop
      ["dragenter", "dragover"].forEach((eventName) => {
        this.dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.dropzone.classList.add("anhba-dropzone-dragover");
        });
      });

      ["dragleave", "drop"].forEach((eventName) => {
        this.dropzone.addEventListener(eventName, (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.dropzone.classList.remove("anhba-dropzone-dragover");
        });
      });

      this.dropzone.addEventListener("drop", (e) => {
        const files = e.dataTransfer?.files;
        if (files && files.length > 0) {
          this.processSelectedFile(files[0]);
        }
      });
    }

    if (this.btnSave) {
      this.btnSave.addEventListener("click", () => this.saveAvatarToFirestore());
    }

    if (this.btnCancel) {
      this.btnCancel.addEventListener("click", () => this.cancelPendingSelection());
    }

    if (this.btnResetDefault) {
      this.btnResetDefault.addEventListener("click", () => this.restoreDefaultAvatar());
    }
  }

  /**
   * Kiểm tra quyền Admin dựa trên Auth hiện tại (Không can thiệp luồng Login/Register)
   */
  listenToAuthState() {
    if (!this.auth) return;
    this.unsubAuth = onAuthStateChanged(this.auth, (user) => {
      this.currentUser = user;
      const isAdmin = user && user.email && user.email.toLowerCase() === SUPER_ADMIN_EMAIL.toLowerCase();

      if (this.panelContainer) {
        if (isAdmin) {
          this.panelContainer.style.display = "block";
          this.panelContainer.removeAttribute("hidden");
        } else {
          this.panelContainer.style.display = "none";
          this.panelContainer.setAttribute("hidden", "true");
        }
      }
    });
  }

  /**
   * Lắng nghe Real-time doc app_settings/chatbot_anh_ba qua onSnapshot
   */
  listenToAvatarChanges() {
    if (!this.db) return;
    const docRef = doc(this.db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);

    this.unsubSnapshot = onSnapshot(
      docRef,
      (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          const remoteAvatar = (data?.avatarUrl || "").trim();
          this.applyAvatarToAllElements(remoteAvatar || DEFAULT_ANHBA_AVATAR);
        } else {
          this.applyAvatarToAllElements(DEFAULT_ANHBA_AVATAR);
        }
      },
      (err) => {
        console.warn("[AnhBaAvatarManager] onSnapshot fallback to default:", err.message);
        this.applyAvatarToAllElements(DEFAULT_ANHBA_AVATAR);
      }
    );
  }

  /**
   * Cập nhật avatar trên toàn bộ các vị trí hiển thị của Anh Ba không cần reload
   */
  applyAvatarToAllElements(avatarUrl) {
    this.currentAvatarUrl = avatarUrl || DEFAULT_ANHBA_AVATAR;

    // Lưu vào LocalStorage làm fallback khi offline
    try {
      localStorage.setItem("anhba_synced_avatar", this.currentAvatarUrl);
    } catch (_) {}

    // Cập nhật tất cả thẻ img mang class và ID của Chatbot Anh Ba
    const targets = document.querySelectorAll(
      ".anhba-dynamic-avatar, #anhBaHeaderAvatar, #anhBaFloatingAvatar, .anhba-avatar-target"
    );
    targets.forEach((img) => {
      if (img && img.tagName === "IMG") {
        img.src = this.currentAvatarUrl;
      }
    });

    if (this.currentImgDisplay) {
      this.currentImgDisplay.src = this.currentAvatarUrl;
    }
    if (!this.pendingBase64 && this.previewImg) {
      this.previewImg.src = this.currentAvatarUrl;
    }
  }

  /**
   * Kiểm tra tính hợp lệ của file & nén chuẩn hóa 256x256 qua Canvas
   */
  async processSelectedFile(file) {
    this.showMessage("", "info");

    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      this.showMessage("⚠️ Định dạng không hợp lệ! Vui lòng chọn ảnh .jpg, .png hoặc .webp", "error");
      return;
    }

    if (file.size > MAX_FILE_SIZE) {
      this.showMessage("⚠️ Dung lượng ảnh vượt quá 2MB! Vui lòng chọn ảnh nhỏ hơn.", "error");
      return;
    }

    try {
      this.showMessage("⏳ Đang tối ưu hóa và xem trước ảnh...", "info");
      const compressedDataUrl = await this.compressImageSquareCenter(file, 256, 0.8);
      this.pendingBase64 = compressedDataUrl;

      if (this.previewImg) {
        this.previewImg.src = compressedDataUrl;
      }
      if (this.btnSave) {
        this.btnSave.disabled = false;
      }
      this.showMessage("✨ Đã sẵn sàng lưu thay đổi!", "success");
    } catch (err) {
      this.showMessage("❌ Không thể xử lý file ảnh: " + err.message, "error");
    }
  }

  /**
   * Cắt vuông tâm (Square Center Crop) và nén bằng HTML5 Canvas
   */
  compressImageSquareCenter(file, size = 256, quality = 0.8) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Lỗi khi đọc file ảnh."));
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = () => reject(new Error("Không thể render file ảnh."));
        img.onload = () => {
          try {
            const canvas = document.createElement("canvas");
            canvas.width = size;
            canvas.height = size;
            const ctx = canvas.getContext("2d");

            // Tính tọa độ cắt hình vuông tâm 1:1
            const minSide = Math.min(img.width, img.height);
            const startX = (img.width - minSide) / 2;
            const startY = (img.height - minSide) / 2;

            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = "high";
            ctx.drawImage(img, startX, startY, minSide, minSide, 0, 0, size, size);

            // Nén sang image/webp (fallback jpeg)
            let resultDataUrl = canvas.toDataURL("image/webp", quality);
            if (!resultDataUrl.startsWith("data:image/webp")) {
              resultDataUrl = canvas.toDataURL("image/jpeg", quality);
            }
            resolve(resultDataUrl);
          } catch (canvasErr) {
            reject(canvasErr);
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Lưu ảnh lên Firestore doc: app_settings/chatbot_anh_ba
   */
  async saveAvatarToFirestore() {
    if (!this.pendingBase64) {
      this.showMessage("⚠️ Vui lòng chọn ảnh trước khi lưu!", "error");
      return;
    }

    if (!this.currentUser || this.currentUser.email?.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
      this.showMessage("⛔ Chỉ Admin (le733833@gmail.com) mới có quyền lưu thay đổi!", "error");
      return;
    }

    if (this.btnSave) {
      this.btnSave.disabled = true;
    }
    this.showMessage("⏳ Đang đồng bộ avatar lên Cloud Firestore Real-time...", "info");

    try {
      const docRef = doc(this.db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
      await setDoc(
        docRef,
        {
          avatarUrl: this.pendingBase64,
          updatedAt: serverTimestamp(),
          updatedBy: this.currentUser.email
        },
        { merge: true }
      );

      this.pendingBase64 = null;
      this.showMessage("✅ Đã cập nhật & phát sóng Avatar Anh Ba tới toàn bộ người dùng!", "success");
    } catch (err) {
      console.error("[AnhBaAvatarManager] Lỗi lưu Firestore:", err);
      this.showMessage("❌ Lỗi đồng bộ: " + err.message, "error");
      if (this.btnSave) this.btnSave.disabled = false;
    }
  }

  /**
   * Khôi phục avatar về mặc định
   */
  async restoreDefaultAvatar() {
    if (!this.currentUser || this.currentUser.email?.toLowerCase() !== SUPER_ADMIN_EMAIL.toLowerCase()) {
      this.showMessage("⛔ Chỉ Admin mới có quyền khôi phục avatar mặc định!", "error");
      return;
    }

    if (!confirm("Bạn có chắc chắn muốn khôi phục avatar mặc định cho Thầy Anh Ba?")) return;

    this.showMessage("⏳ Đang khôi phục về avatar mặc định...", "info");
    try {
      const docRef = doc(this.db, SETTINGS_COLLECTION, SETTINGS_DOC_ID);
      await setDoc(
        docRef,
        {
          avatarUrl: DEFAULT_ANHBA_AVATAR,
          updatedAt: serverTimestamp(),
          updatedBy: this.currentUser.email
        },
        { merge: true }
      );

      this.pendingBase64 = null;
      if (this.previewImg) this.previewImg.src = DEFAULT_ANHBA_AVATAR;
      if (this.btnSave) this.btnSave.disabled = true;
      this.showMessage("✅ Đã khôi phục avatar mặc định thành công!", "success");
    } catch (err) {
      this.showMessage("❌ Lỗi: " + err.message, "error");
    }
  }

  cancelPendingSelection() {
    this.pendingBase64 = null;
    if (this.previewImg) this.previewImg.src = this.currentAvatarUrl;
    if (this.fileInput) this.fileInput.value = "";
    if (this.btnSave) this.btnSave.disabled = true;
    this.showMessage("Đã hủy bỏ lựa chọn ảnh.", "info");
  }

  showMessage(msg, type = "info") {
    if (!this.statusMsg) return;
    this.statusMsg.textContent = msg;
    if (type === "error") {
      this.statusMsg.style.color = "#ef4444";
    } else if (type === "success") {
      this.statusMsg.style.color = "#10b981";
    } else {
      this.statusMsg.style.color = "#64748b";
    }
  }
}

// Khởi tạo Singleton duy nhất
export const anhBaAvatarManager = new AnhBaAvatarManager();
