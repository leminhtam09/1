/**
 * LIGHTBOX ZOOM & ASPECT RATIO GALLERY MODULE
 * Độc lập, an toàn, không xung đột giao diện:
 * - Namespace: .lightbox-zoom-*, .anhba-ratio-*
 * - Tự động tạm dừng (pause) slider khi mở zoom, chạy tiếp (resume) khi đóng
 * - Phóng to / Thu nhỏ mượt mà bằng con lăn chuột (wheel) và chạm (pinch touch)
 * - Kéo rê ảnh (Pan/Drag) khi ở trạng thái zoom
 * - Đóng bằng phím ESC, nút X hoặc click vào vùng tối bên ngoài (Backdrop)
 */

class LightboxZoomManager {
  constructor() {
    this.overlay = null;
    this.imgElement = null;
    this.captionElement = null;
    this.scaleText = null;
    this.viewport = null;

    // Trạng thái biến đổi (Transform state)
    this.scale = 1;
    this.minScale = 1;
    this.maxScale = 4.5;
    this.translateX = 0;
    this.translateY = 0;
    this.isDragging = false;
    this.startX = 0;
    this.startY = 0;
    this.isOpen = false;
    this.initialPinchDistance = null;

    // Danh sách các slider đang bị tạm dừng
    this.pausedSliders = [];

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => this.init());
    } else {
      this.init();
    }
  }

  init() {
    this.createDomOverlay();
    this.bindGlobalEvents();
    this.scanAndAttachZoomableImages();

    // Tự động quét lại khi DOM thay đổi (ví dụ khi Firestore tải xong ảnh marquee)
    const observer = new MutationObserver(() => this.scanAndAttachZoomableImages());
    observer.observe(document.body, { childList: true, subtree: true });
  }

  /**
   * Tạo khung Modal Lightbox độc lập trong DOM nếu chưa có
   */
  createDomOverlay() {
    if (document.getElementById("lightboxZoomOverlay")) {
      this.overlay = document.getElementById("lightboxZoomOverlay");
    } else {
      const modalHtml = `
        <div id="lightboxZoomOverlay" class="lightbox-zoom-overlay" aria-hidden="true" role="dialog">
          <button type="button" class="lightbox-zoom-btn-close" id="lightboxZoomBtnClose" title="Đóng (ESC hoặc click ra ngoài)">
            <i class="fa-solid fa-xmark"></i>
          </button>

          <div class="lightbox-zoom-wrapper" id="lightboxZoomWrapper">
            <div class="lightbox-zoom-viewport" id="lightboxZoomViewport">
              <img id="lightboxZoomImg" class="lightbox-zoom-img" src="" alt="Zoomable Image" draggable="false">
            </div>
            <div class="lightbox-zoom-caption" id="lightboxZoomCaption">Khoảnh khắc 12A1</div>
          </div>

          <div class="lightbox-zoom-toolbar">
            <button type="button" class="lightbox-zoom-tool-btn" id="lightboxZoomBtnOut" title="Thu nhỏ (-)">
              <i class="fa-solid fa-magnifying-glass-minus"></i>
            </button>
            <span class="lightbox-zoom-scale-text" id="lightboxZoomScaleText">100%</span>
            <button type="button" class="lightbox-zoom-tool-btn" id="lightboxZoomBtnIn" title="Phóng to (+)">
              <i class="fa-solid fa-magnifying-glass-plus"></i>
            </button>
            <button type="button" class="lightbox-zoom-tool-btn" id="lightboxZoomBtnReset" title="Đặt lại kích thước ban đầu (1:1)">
              <i class="fa-solid fa-rotate-left"></i>
            </button>
          </div>
        </div>
      `;
      document.body.insertAdjacentHTML("beforeend", modalHtml);
      this.overlay = document.getElementById("lightboxZoomOverlay");
    }

    this.imgElement = document.getElementById("lightboxZoomImg");
    this.captionElement = document.getElementById("lightboxZoomCaption");
    this.scaleText = document.getElementById("lightboxZoomScaleText");
    this.viewport = document.getElementById("lightboxZoomViewport");
  }

  /**
   * Đăng ký sự kiện điều khiển Modal, con lăn chuột và phím ESC
   */
  bindGlobalEvents() {
    const btnClose = document.getElementById("lightboxZoomBtnClose");
    const btnIn = document.getElementById("lightboxZoomBtnIn");
    const btnOut = document.getElementById("lightboxZoomBtnOut");
    const btnReset = document.getElementById("lightboxZoomBtnReset");

    if (btnClose) btnClose.addEventListener("click", () => this.close());
    if (btnIn) btnIn.addEventListener("click", () => this.zoomStep(0.3));
    if (btnOut) btnOut.addEventListener("click", () => this.zoomStep(-0.3));
    if (btnReset) btnReset.addEventListener("click", () => this.resetTransform());

    // Click vào vùng tối backdrop để đóng
    if (this.overlay) {
      this.overlay.addEventListener("click", (e) => {
        if (
          e.target === this.overlay ||
          e.target.id === "lightboxZoomWrapper" ||
          e.target.id === "lightboxZoomViewport"
        ) {
          // Chỉ đóng nếu click vào nền và không đang kéo ảnh
          if (!this.isDragging) {
            this.close();
          }
        }
      });
    }

    // Nhấn phím ESC để đóng
    window.addEventListener("keydown", (e) => {
      if (this.isOpen && e.key === "Escape") {
        this.close();
      }
    });

    // Zoom bằng con lăn chuột (Mouse Wheel)
    if (this.viewport) {
      this.viewport.addEventListener(
        "wheel",
        (e) => {
          if (!this.isOpen) return;
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.2 : -0.2;
          this.zoomStep(delta);
        },
        { passive: false }
      );

      // Kéo rê ảnh (Pan/Drag) khi đang phóng to
      this.viewport.addEventListener("mousedown", (e) => {
        if (this.scale <= 1) return;
        this.isDragging = true;
        this.startX = e.clientX - this.translateX;
        this.startY = e.clientY - this.translateY;
      });

      window.addEventListener("mousemove", (e) => {
        if (!this.isDragging || !this.isOpen) return;
        this.translateX = e.clientX - this.startX;
        this.translateY = e.clientY - this.startY;
        this.applyTransform();
      });

      window.addEventListener("mouseup", () => {
        this.isDragging = false;
      });

      // Nhấp đúp chuột (Double click) để phóng to/thu nhỏ nhanh
      this.viewport.addEventListener("dblclick", () => {
        if (this.scale > 1) {
          this.resetTransform();
        } else {
          this.scale = 2.2;
          this.applyTransform();
        }
      });

      // Hỗ trợ cảm ứng trên thiết bị di động (Touch / Pinch)
      this.setupTouchGestures();
    }
  }

  /**
   * Xử lý Pinch-to-zoom trên màn hình cảm ứng
   */
  setupTouchGestures() {
    let initialDist = 0;
    this.viewport.addEventListener(
      "touchstart",
      (e) => {
        if (e.touches.length === 2) {
          initialDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
        } else if (e.touches.length === 1 && this.scale > 1) {
          this.isDragging = true;
          this.startX = e.touches[0].clientX - this.translateX;
          this.startY = e.touches[0].clientY - this.translateY;
        }
      },
      { passive: true }
    );

    this.viewport.addEventListener(
      "touchmove",
      (e) => {
        if (e.touches.length === 2 && initialDist > 0) {
          const currentDist = Math.hypot(
            e.touches[0].clientX - e.touches[1].clientX,
            e.touches[0].clientY - e.touches[1].clientY
          );
          const factor = currentDist / initialDist;
          this.scale = Math.min(Math.max(this.scale * (factor > 1 ? 1.04 : 0.96), this.minScale), this.maxScale);
          this.applyTransform();
        } else if (e.touches.length === 1 && this.isDragging) {
          this.translateX = e.touches[0].clientX - this.startX;
          this.translateY = e.touches[0].clientY - this.startY;
          this.applyTransform();
        }
      },
      { passive: true }
    );

    this.viewport.addEventListener("touchend", () => {
      this.isDragging = false;
      initialDist = 0;
    });
  }

  /**
   * Quét và gắn sự kiện click cho các ảnh tỷ lệ 4:3, 16:9 và ảnh slider
   */
  scanAndAttachZoomableImages() {
    const selector = `
      .anhba-media-img,
      .anhba-ratio-4-3 img,
      .anhba-ratio-16-9 img,
      .marquee-img-43,
      .marquee-img-169,
      .lightbox-zoomable,
      img[data-lightbox-zoom="true"]
    `;

    document.querySelectorAll(selector).forEach((img) => {
      if (img.dataset.lightboxAttached === "true") return;
      img.dataset.lightboxAttached = "true";
      img.style.cursor = "zoom-in";

      img.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const src = img.currentSrc || img.src;
        const caption =
          img.alt ||
          img.getAttribute("title") ||
          img.closest(".marquee-item-wrapper")?.querySelector(".marquee-item-caption")?.textContent ||
          "Hình ảnh tỷ lệ chuẩn";

        this.open(src, caption);
      });
    });
  }

  /**
   * Mở Lightbox Modal và tạm dừng (Pause) animation chạy ảnh
   */
  open(imgSrc, captionText = "") {
    if (!this.overlay || !this.imgElement) return;

    this.resetTransform();
    this.imgElement.src = imgSrc;
    if (this.captionElement) {
      this.captionElement.textContent = captionText;
      this.captionElement.style.display = captionText ? "block" : "none";
    }

    // Tạm dừng mọi animation slider trên trang
    this.pauseAllSliders();

    this.overlay.classList.add("lightbox-zoom-active");
    this.overlay.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden"; // Ngăn cuộn trang
    this.isOpen = true;
  }

  /**
   * Đóng Lightbox Modal và chạy tiếp (Resume) animation
   */
  close() {
    if (!this.overlay || !this.isOpen) return;

    this.overlay.classList.remove("lightbox-zoom-active");
    this.overlay.setAttribute("aria-hidden", "true");
    document.body.style.overflow = ""; // Khôi phục cuộn trang
    this.isOpen = false;

    // Tiếp tục chạy lại các slider
    this.resumeAllSliders();

    setTimeout(() => {
      if (this.imgElement) this.imgElement.src = "";
      this.resetTransform();
    }, 280);
  }

  zoomStep(delta) {
    this.scale = Math.min(Math.max(this.scale + delta, this.minScale), this.maxScale);
    if (this.scale <= 1) {
      this.translateX = 0;
      this.translateY = 0;
    }
    this.applyTransform();
  }

  resetTransform() {
    this.scale = 1;
    this.translateX = 0;
    this.translateY = 0;
    this.isDragging = false;
    this.applyTransform();
  }

  applyTransform() {
    if (this.imgElement) {
      this.imgElement.style.transform = `translate(${this.translateX}px, ${this.translateY}px) scale(${this.scale})`;
    }
    if (this.scaleText) {
      this.scaleText.textContent = `${Math.round(this.scale * 100)}%`;
    }
  }

  /**
   * Tạm dừng các dải băng chuyền marquee
   */
  pauseAllSliders() {
    this.pausedSliders = [];
    const tracks = document.querySelectorAll(
      ".marquee-track, #marqueeTrack43, #marqueeTrack169, .marquee-slider-container"
    );
    tracks.forEach((track) => {
      const currentPlayState = window.getComputedStyle(track).animationPlayState;
      if (currentPlayState !== "paused") {
        track.style.animationPlayState = "paused";
        this.pausedSliders.push(track);
      }
    });
  }

  /**
   * Tiếp tục chạy các dải băng chuyền marquee
   */
  resumeAllSliders() {
    this.pausedSliders.forEach((track) => {
      track.style.animationPlayState = "running";
    });
    this.pausedSliders = [];
  }
}

// Khởi tạo Singleton duy nhất
export const lightboxZoomManager = new LightboxZoomManager();
