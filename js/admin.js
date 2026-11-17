/**
 * Admin Dashboard Controller
 * Handles Firebase Auth (Strict Admin UID lock), Firestore CRUD,
 * Dynamic Client Pickers, WebP PC Uploads, Batch Mode, Reordering,
 * Visibility, Search/Filtering, and Backup Import/Export.
 */

import { 
  auth, 
  db, 
  ADMIN_UID, 
  initError,
  signInWithEmailAndPassword, 
  signOut, 
  onAuthStateChanged, 
  collection, 
  doc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  serverTimestamp,
  isConfigured
} from "./firebase-config.js?v=2.8.0";

import { parseVideoUrl } from "./videoParser.js?v=2.8.0";

// ============================================================================
// STATE
// ============================================================================
let currentUser = null;
let videosList = [];
let editingVideoId = null;
const sessionClients = new Set();
let currentTableFilter = "ALL";
let currentSearchQuery = "";

// ============================================================================
// DOM SELECTORS
// ============================================================================
// Auth & Views
const loginView = document.getElementById("admin-login-view");
const dashboardView = document.getElementById("admin-dashboard-view");
const loginForm = document.getElementById("admin-login-form");
const loginSubmitBtn = document.getElementById("admin-login-submit-btn");
const loginEmailInput = document.getElementById("login-email");
const loginPasswordInput = document.getElementById("login-password");
const loginErrorMsg = document.getElementById("login-error-msg");
const logoutBtn = document.getElementById("admin-logout-btn");
const adminUserEmailDisplay = document.getElementById("admin-user-email");

// Video Form Elements
const videoForm = document.getElementById("video-crud-form");
const formHeading = document.getElementById("form-heading");
const formSubmitBtn = document.getElementById("form-submit-btn");
const formCancelBtn = document.getElementById("form-cancel-btn");
const formCancelHeaderBtn = document.getElementById("form-cancel-header-btn");
const inputVideoId = document.getElementById("video-id");
const inputTitle = document.getElementById("video-title");
const inputUrl = document.getElementById("video-url");
const inputThumb = document.getElementById("video-thumb");
const inputCategory = document.getElementById("video-category");
const inputAspect = document.getElementById("video-aspect");
const inputDuration = document.getElementById("video-duration");
const inputOrder = document.getElementById("video-order");
const inputClientName = document.getElementById("video-client-name");
const inputClientOrder = document.getElementById("video-client-order");
const inputFeatured = document.getElementById("video-featured");
const inputFeaturedOrder = document.getElementById("video-featured-order");
const inputDesc = document.getElementById("video-desc");
const formNotice = document.getElementById("form-notice");
const batchModeToggle = document.getElementById("batch-mode-toggle");

// Client Picker & Series Actions
const clientPickerPills = document.getElementById("client-picker-pills");
const clientPickerCount = document.getElementById("client-picker-count");
const btnNewClient = document.getElementById("btn-new-client");
const btnRenameSeries = document.getElementById("btn-rename-series");

// Thumbnail PC Upload
const btnUploadThumbnail = document.getElementById("btn-upload-thumbnail");
const thumbnailFileInput = document.getElementById("thumbnail-file-input");
const thumbUploadStatus = document.getElementById("thumb-upload-status");

// Live Bento Preview Elements
const previewThumbContainer = document.getElementById("preview-thumb-container");
const previewThumbImg = document.getElementById("preview-thumb-img");
const previewPlatformBadge = document.getElementById("preview-platform-badge");
const previewAspectTag = document.getElementById("preview-aspect-tag");
const previewClientBadge = document.getElementById("preview-client-badge");
const previewCategoryBadge = document.getElementById("preview-category-badge");
const previewTitle = document.getElementById("preview-title");
const previewDesc = document.getElementById("preview-desc");

// List & Stats Elements
const videosTableBody = document.getElementById("admin-videos-table-body");
const totalVideosCountEl = document.getElementById("stat-total-videos");
const featuredVideosCountEl = document.getElementById("stat-featured-videos");
const statFeaturedSub = document.getElementById("stat-featured-sub");
const featuredWarningBadge = document.getElementById("stat-featured-warning");
const carouselPinnedStrip = document.getElementById("carousel-pinned-strip");

// Table Search, Dynamic Filters & Backup
const adminTableSearch = document.getElementById("admin-table-search");
const adminTableClientFilters = document.getElementById("admin-table-client-filters");
const btnExportBackup = document.getElementById("btn-export-backup");
const btnImportBackup = document.getElementById("btn-import-backup");
const backupFileInput = document.getElementById("backup-file-input");
const btnClearVideos = document.getElementById("btn-clear-videos");

// ============================================================================
// 1. AUTHENTICATION & ACCESS CONTROL
// ============================================================================
export function initAuth() {
  if (loginSubmitBtn) {
    loginSubmitBtn.addEventListener("click", handleLoginSubmit);
  }
  if (loginForm) {
    loginForm.addEventListener("submit", handleLoginSubmit);
  }
  if (loginPasswordInput) {
    loginPasswordInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleLoginSubmit(e);
      }
    });
  }
  if (loginEmailInput) {
    loginEmailInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleLoginSubmit(e);
      }
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", async () => {
      localStorage.removeItem("admin_auth_active");
      if (auth) {
        await signOut(auth);
      }
      showLogin();
    });
  }

  if (!isConfigured || !auth) {
    showLogin();
    const errorText = initError 
      ? `Firebase initialization failed: ${initError}`
      : "Firebase credentials in js/firebase-config.js are incomplete or invalid.";
    showLoginError(errorText);
    return;
  }

  try {
    onAuthStateChanged(auth, (user) => {
      if (user) {
        // STRICT ADMIN UID VERIFICATION (ZERO EMAIL EXPOSURE)
        if (user.uid === ADMIN_UID) {
          currentUser = user;
          localStorage.setItem("admin_auth_active", "1");
          if (adminUserEmailDisplay) {
            adminUserEmailDisplay.textContent = "Verified Studio Owner";
          }
          showDashboard();
          fetchAdminVideos();
        } else {
          localStorage.removeItem("admin_auth_active");
          signOut(auth);
          showLoginError(`Access denied: User UID does not match the configured ADMIN_UID.`);
        }
      } else {
        currentUser = null;
        localStorage.removeItem("admin_auth_active");
        showLogin();
      }
    });
  } catch (err) {
    console.error("Auth state observer error:", err);
    showLoginError("Auth observer error: " + err.message);
  }
}

export async function handleLoginSubmit(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }

  if (loginErrorMsg) {
    loginErrorMsg.classList.add("hidden");
    loginErrorMsg.textContent = "";
  }

  if (!isConfigured || !auth) {
    showLoginError(
      initError 
        ? `Firebase error: ${initError}`
        : "Firebase is not configured. Please check your credentials in js/firebase-config.js."
    );
    return false;
  }

  const email = loginEmailInput ? loginEmailInput.value.trim() : "";
  const password = loginPasswordInput ? loginPasswordInput.value : "";

  if (!email || !password) {
    showLoginError("Please enter both your admin email and password.");
    return false;
  }

  const submitBtn = loginSubmitBtn || (loginForm ? loginForm.querySelector("button[type='submit']") : null);

  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Verifying...";
    }

    await signInWithEmailAndPassword(auth, email, password);
  } catch (err) {
    console.error("Firebase Login Error:", err);
    showLoginError(getAuthErrorMessage(err.code, err.message));
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = "Sign In to Dashboard";
    }
  }

  return false;
}

function showLogin() {
  if (loginView) loginView.classList.remove("hidden");
  if (dashboardView) dashboardView.classList.add("hidden");
}

function showDashboard() {
  if (loginView) loginView.classList.add("hidden");
  if (dashboardView) dashboardView.classList.remove("hidden");
}

function showLoginError(msg) {
  if (loginErrorMsg) {
    loginErrorMsg.textContent = msg;
    loginErrorMsg.classList.remove("hidden");
  }
}

function getAuthErrorMessage(code, defaultMsg) {
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Invalid email or password. Please verify your credentials.";
    case "auth/invalid-email":
      return "Invalid email format. Please check the email address.";
    case "auth/user-disabled":
      return "This user account has been disabled in the Firebase Console.";
    case "auth/too-many-requests":
      return "Access temporarily blocked due to multiple failed login attempts. Try again later or reset password.";
    case "auth/unauthorized-domain":
      return "Unauthorized domain! Go to Firebase Console -> Authentication -> Settings -> Authorized domains, and add your local host (e.g., localhost, 127.0.0.1, or your port).";
    case "auth/network-request-failed":
      return "Network error. Please check your internet connection.";
    default:
      return defaultMsg || `Authentication error: ${code}`;
  }
}

// ============================================================================
// 2. FIRESTORE CRUD OPERATIONS
// ============================================================================
export async function fetchAdminVideos() {
  if (!db) return;

  try {
    const q = query(collection(db, "videos"));
    const snapshot = await getDocs(q);
    const list = [];
    snapshot.forEach(docSnap => {
      list.push({ id: docSnap.id, ...docSnap.data() });
    });

    list.sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
    videosList = list;

    // Refresh UI components
    renderClientPickerPills();
    renderAdminTableClientFilters();
    renderFilteredVideos();
    updateStats(videosList);
    updateLiveFormPreview();
  } catch (err) {
    console.error("Error fetching videos:", err);
    showNotice("Failed to load videos from Firestore: " + err.message, "error");
  }
}

function updateStats(videos) {
  const total = videos.length;
  const featured = videos.filter(v => v.isFeatured === true || v.isFeatured === "true").length;

  if (totalVideosCountEl) totalVideosCountEl.textContent = total;
  if (featuredVideosCountEl) featuredVideosCountEl.textContent = `${featured} Pinned`;

  if (statFeaturedSub) {
    statFeaturedSub.textContent = `${featured} Pinned First • ${total} Total Videos`;
  }

  if (featuredWarningBadge) {
    featuredWarningBadge.classList.add("hidden");
  }

  renderCarouselPinnedStrip(videos);
}

function renderCarouselPinnedStrip(videos) {
  if (!carouselPinnedStrip) return;

  const pinned = videos
    .filter(v => v.isFeatured === true || v.isFeatured === "true")
    .sort((a, b) => (Number(a.featuredOrder) || 99) - (Number(b.featuredOrder) || 99));

  if (pinned.length === 0) {
    carouselPinnedStrip.innerHTML = `
      <div class="text-[11px] text-neutral-400 italic py-1 flex items-center gap-1.5">
        <span class="w-1.5 h-1.5 rounded-full bg-neutral-300"></span>
        No cards pinned to front of carousel yet. Click "+ Pin" on any video below to set its carousel priority sequence.
      </div>
    `;
    return;
  }

  carouselPinnedStrip.innerHTML = `
    <div class="flex items-center gap-2 flex-wrap w-full py-1">
      <span class="text-[11px] font-bold text-neutral-700 flex items-center gap-1.5 mr-1">
        <span class="w-2 h-2 rounded-full bg-[#EB7A25]"></span>
        Carousel Front Queue (${pinned.length}):
      </span>
      ${pinned.map((v, i) => `
        <span class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 border border-amber-200/80 text-[11px] text-neutral-800 font-medium shadow-2xs">
          <span class="font-bold text-[#EB7A25] font-mono">#${v.featuredOrder || (i + 1)}</span>
          <span class="truncate max-w-[130px] font-semibold">${v.clientName || v.title}</span>
          <button type="button" onclick="window.adminToggleFeatured('${v.id}', false)" title="Unpin from carousel front" class="text-neutral-400 hover:text-rose-600 cursor-pointer ml-0.5 text-xs font-bold leading-none">×</button>
        </span>
      `).join("")}
    </div>
  `;
}

// ============================================================================
// 3. DYNAMIC CLIENT PICKER & RENAME SERIES
// ============================================================================
function getUniqueClients() {
  const set = new Set(sessionClients);
  videosList.forEach(v => {
    if (v.clientName && typeof v.clientName === "string" && v.clientName.trim()) {
      set.add(v.clientName.trim());
    }
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function renderClientPickerPills() {
  if (!clientPickerPills) return;

  const clients = getUniqueClients();
  const currentVal = inputClientName ? inputClientName.value.trim() : "";

  if (clientPickerCount) {
    clientPickerCount.textContent = `${clients.length} Brand${clients.length === 1 ? '' : 's'}`;
  }

  // Standalone Pill
  const isStandalone = !currentVal;
  let pillsHtml = `
    <button 
      type="button" 
      data-client="" 
      class="client-pill-btn text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all cursor-pointer ${
        isStandalone 
          ? 'bg-[#111111] text-white border-black shadow-xs' 
          : 'bg-[#F4F4F6] text-neutral-600 border-black/5 hover:bg-[#EAEAEA]'
      }">
      Standalone (No Client)
    </button>
  `;

  // Dynamic Client Pills
  clients.forEach(client => {
    const isSelected = currentVal.toLowerCase() === client.toLowerCase();
    const count = videosList.filter(v => v.clientName && v.clientName.toLowerCase() === client.toLowerCase()).length;
    pillsHtml += `
      <button 
        type="button" 
        data-client="${client}" 
        class="client-pill-btn text-[11px] font-medium px-2.5 py-1 rounded-full border transition-all cursor-pointer flex items-center gap-1.5 ${
          isSelected 
            ? 'bg-[#111111] text-white border-black shadow-xs' 
            : 'bg-[#F4F4F6] text-neutral-700 border-black/5 hover:bg-[#EAEAEA]'
        }">
        <span class="w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-[#EB7A25]' : 'bg-[#EB7A25]/70'}"></span>
        <span>${client}</span>
        <span class="text-[10px] ${isSelected ? 'text-white/70' : 'text-neutral-400'} font-mono">(${count})</span>
      </button>
    `;
  });

  clientPickerPills.innerHTML = pillsHtml;

  // Attach click events
  clientPickerPills.querySelectorAll(".client-pill-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const client = btn.getAttribute("data-client") || "";
      selectClientPill(client);
    });
  });
}

function selectClientPill(clientName) {
  if (inputClientName) {
    inputClientName.value = clientName;
  }

  if (inputClientOrder) {
    if (clientName) {
      const count = videosList.filter(v => v.clientName && v.clientName.toLowerCase() === clientName.toLowerCase()).length;
      inputClientOrder.value = count + 1;
    } else {
      inputClientOrder.value = 1;
    }
  }

  renderClientPickerPills();
  updateLiveFormPreview();
}

function initClientPickerActions() {
  // + New Client Pill Action
  if (btnNewClient) {
    btnNewClient.addEventListener("click", () => {
      const name = prompt("Enter new Client / Brand Series name (e.g., Wagdys's, Siran, Sclinic, Jazz Store, Huwa):");
      if (name && name.trim()) {
        const cleanName = name.trim();
        sessionClients.add(cleanName);
        selectClientPill(cleanName);
        showNotice(`Client "${cleanName}" added to picker!`, "success");
      }
    });
  }

  // ✏️ Rename Client Series Batch Action
  if (btnRenameSeries) {
    btnRenameSeries.addEventListener("click", async () => {
      let targetClient = inputClientName ? inputClientName.value.trim() : "";
      if (!targetClient) {
        targetClient = prompt("Enter the existing Client / Brand Series name you want to rename across all videos:");
      }

      if (!targetClient || !targetClient.trim()) return;
      targetClient = targetClient.trim();

      const matching = videosList.filter(v => v.clientName && v.clientName.toLowerCase() === targetClient.toLowerCase());
      if (matching.length === 0) {
        alert(`No videos currently belong to client "${targetClient}".`);
        return;
      }

      const newName = prompt(`Rename all ${matching.length} videos from series "${targetClient}" to:`, targetClient);
      if (!newName || !newName.trim() || newName.trim() === targetClient) return;

      const cleanNewName = newName.trim();
      const proceed = confirm(`Are you sure you want to rename series "${targetClient}" to "${cleanNewName}" across all ${matching.length} videos in Firestore?`);
      if (!proceed || !db) return;

      try {
        btnRenameSeries.disabled = true;
        btnRenameSeries.textContent = "Renaming...";

        const updatePromises = matching.map(v => 
          updateDoc(doc(db, "videos", v.id), {
            clientName: cleanNewName,
            updatedAt: serverTimestamp()
          })
        );
        await Promise.all(updatePromises);

        sessionClients.delete(targetClient);
        sessionClients.add(cleanNewName);
        if (inputClientName) inputClientName.value = cleanNewName;

        showNotice(`Renamed ${matching.length} videos from "${targetClient}" to "${cleanNewName}"!`, "success");
        await fetchAdminVideos();
      } catch (err) {
        console.error("Batch rename error:", err);
        showNotice("Failed to rename series: " + err.message, "error");
      } finally {
        btnRenameSeries.disabled = false;
        btnRenameSeries.textContent = "✏️ Rename Series";
      }
    });
  }

  // Sync pill selection if user types directly in the text input
  if (inputClientName) {
    inputClientName.addEventListener("input", () => {
      renderClientPickerPills();
      updateLiveFormPreview();
    });
  }
}

// ============================================================================
// 4. PC THUMBNAIL UPLOAD WITH WEBP CANVAS COMPRESSION
// ============================================================================
function initThumbnailUpload() {
  if (btnUploadThumbnail && thumbnailFileInput) {
    btnUploadThumbnail.addEventListener("click", () => {
      thumbnailFileInput.click();
    });

    thumbnailFileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        showNotice("Please select a valid image file (PNG, JPG, WebP).", "error");
        return;
      }

      const reader = new FileReader();
      reader.onload = (event) => {
        const img = new Image();
        img.onload = () => {
          // Client-side canvas compression to WebP (max width 1280px)
          const maxWidth = 1280;
          let width = img.width;
          let height = img.height;

          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }

          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, 0, 0, width, height);

          let webpDataUrl = canvas.toDataURL("image/webp", 0.80);
          if (!webpDataUrl.startsWith("data:image/webp")) {
            webpDataUrl = canvas.toDataURL("image/jpeg", 0.80);
          }

          if (inputThumb) {
            inputThumb.value = webpDataUrl;
          }

          const sizeKb = Math.round(webpDataUrl.length * 0.75 / 1024);
          if (thumbUploadStatus) {
            thumbUploadStatus.textContent = `✓ Compressed to WebP (${width}×${height}, ~${sizeKb} KB) ready to save!`;
            thumbUploadStatus.classList.remove("hidden");
          }

          updateLiveFormPreview();
          showNotice(`Thumbnail processed successfully (${sizeKb} KB WebP).`, "success");
        };
        img.onerror = () => {
          showNotice("Failed to parse image from file.", "error");
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }
}

// ============================================================================
// 5. LIVE BENTO FORM PREVIEW
// ============================================================================
export function updateLiveFormPreview() {
  if (!previewThumbImg) return;

  const title = inputTitle ? inputTitle.value.trim() : "";
  const url = inputUrl ? inputUrl.value.trim() : "";
  const thumb = inputThumb ? inputThumb.value.trim() : "";
  const category = inputCategory ? inputCategory.value : "Commercials & Ads";
  const aspect = inputAspect ? inputAspect.value : "9:16";
  const clientName = inputClientName ? inputClientName.value.trim() : "";
  const desc = inputDesc ? inputDesc.value.trim() : "";

  const parsed = parseVideoUrl(url, aspect);
  const fallbackDefault = "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=600&q=80";
  const resolvedThumb = thumb || parsed.thumbnailUrl || parsed.fallbackThumb || fallbackDefault;

  // Thumbnail image
  previewThumbImg.src = resolvedThumb;
  previewThumbImg.onerror = () => {
    previewThumbImg.src = fallbackDefault;
  };

  // Platform badge
  if (previewPlatformBadge) {
    const platform = parsed.platform ? parsed.platform.toUpperCase() : "VIDEO";
    previewPlatformBadge.textContent = platform === "UNKNOWN" ? "EMBED" : platform;
  }

  // Aspect ratio tag & preview box geometry
  if (previewAspectTag) {
    previewAspectTag.textContent = aspect;
  }
  if (previewThumbContainer) {
    if (aspect === "9:16") {
      previewThumbContainer.className = "relative w-28 sm:w-32 aspect-[9/16] rounded-xl overflow-hidden bg-neutral-900 border border-black/5 flex-shrink-0 transition-all";
    } else {
      previewThumbContainer.className = "relative w-full sm:w-48 aspect-video rounded-xl overflow-hidden bg-neutral-900 border border-black/5 flex-shrink-0 transition-all";
    }
  }

  // Category badge
  if (previewCategoryBadge) {
    previewCategoryBadge.textContent = category;
  }

  // Client badge
  if (previewClientBadge) {
    if (clientName) {
      previewClientBadge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-[#EB7A25] inline-block mr-1"></span>${clientName}`;
      previewClientBadge.classList.remove("hidden");
    } else {
      previewClientBadge.classList.add("hidden");
    }
  }

  // Title and Description
  if (previewTitle) {
    previewTitle.textContent = title || "Video Title Preview";
  }
  if (previewDesc) {
    previewDesc.textContent = desc || "Brief video description will appear here...";
  }
}

// ============================================================================
// 6. FORM LOGIC & BATCH MODE
// ============================================================================
export function initVideoForm() {
  if (!videoForm) return;

  // Auto-detect Aspect Ratio when pasting URL
  if (inputUrl) {
    inputUrl.addEventListener("input", (e) => {
      const url = e.target.value.toLowerCase();
      if (url.includes("/shorts/") || url.includes("tiktok.com") || url.includes("instagram.com/reel/")) {
        if (inputAspect) inputAspect.value = "9:16";
        if (inputCategory) inputCategory.value = "Reels & Shorts (9:16)";
      }
      updateLiveFormPreview();
    });
  }

  // Sync category change to 9:16
  if (inputCategory) {
    inputCategory.addEventListener("change", (e) => {
      if (e.target.value === "Reels & Shorts (9:16)" && inputAspect) {
        inputAspect.value = "9:16";
      }
      updateLiveFormPreview();
    });
  }

  // Wire input listeners for Live Preview
  [inputTitle, inputThumb, inputAspect, inputDesc, inputDuration].forEach(el => {
    if (el) {
      el.addEventListener("input", updateLiveFormPreview);
      el.addEventListener("change", updateLiveFormPreview);
    }
  });

  // Submit Handler
  videoForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!db) {
      showNotice("Firestore is not connected.", "error");
      return;
    }

    const title = inputTitle.value.trim();
    const videoUrl = inputUrl.value.trim();
    const thumbnailUrl = inputThumb.value.trim();
    const clientName = inputClientName ? inputClientName.value.trim() : "";
    const clientOrder = inputClientOrder ? (Number(inputClientOrder.value) || 1) : 1;
    const category = inputCategory.value;
    const aspectRatio = inputAspect.value;
    const duration = inputDuration.value.trim();
    const order = Number(inputOrder.value) || 1;
    const isFeatured = inputFeatured.checked;
    let featuredOrder = null;
    if (isFeatured) {
      if (inputFeaturedOrder && inputFeaturedOrder.value) {
        featuredOrder = Number(inputFeaturedOrder.value) || 1;
      } else {
        const currentFeatured = videosList.filter(v => (v.isFeatured === true || v.isFeatured === "true") && v.id !== editingVideoId);
        let maxRank = 0;
        currentFeatured.forEach(v => {
          const r = Number(v.featuredOrder);
          if (!isNaN(r) && r > maxRank) maxRank = r;
        });
        featuredOrder = maxRank + 1;
      }
    }
    const description = inputDesc.value.trim();

    if (!title || !videoUrl) {
      showNotice("Please fill in both Video Title and Video URL.", "error");
      return;
    }

    // Auto-extract thumbnail if left empty
    let finalThumb = thumbnailUrl;
    if (!finalThumb) {
      const parsed = parseVideoUrl(videoUrl, aspectRatio);
      if (parsed.thumbnailUrl) {
        finalThumb = parsed.thumbnailUrl;
      }
    }

    const payload = {
      title,
      videoUrl,
      thumbnailUrl: finalThumb,
      clientName,
      clientOrder,
      category,
      aspectRatio,
      duration,
      order,
      isFeatured,
      featuredOrder,
      description,
      isVisible: true,
      updatedAt: serverTimestamp()
    };

    try {
      formSubmitBtn.disabled = true;
      formSubmitBtn.textContent = "Saving to Firestore...";

      if (editingVideoId) {
        // Keep existing isVisible flag if editing
        const existingDoc = videosList.find(v => v.id === editingVideoId);
        if (existingDoc && existingDoc.isVisible !== undefined) {
          payload.isVisible = existingDoc.isVisible;
        }
        await updateDoc(doc(db, "videos", editingVideoId), payload);
        showNotice(`Video "${title}" updated successfully!`, "success");
      } else {
        payload.createdAt = serverTimestamp();
        await addDoc(collection(db, "videos"), payload);
        showNotice(`New video "${title}" added to portfolio!`, "success");
      }

      // Check Fast Batch Mode
      const isBatch = batchModeToggle && batchModeToggle.checked;
      if (isBatch && !editingVideoId) {
        // Batch Mode: Keep client, category, aspect ratio. Clear title, URL, custom thumb, desc.
        inputTitle.value = "";
        inputUrl.value = "";
        inputThumb.value = "";
        inputDesc.value = "";
        if (thumbUploadStatus) thumbUploadStatus.classList.add("hidden");
        if (thumbnailFileInput) thumbnailFileInput.value = "";

        // Auto increment clientOrder and sort order
        if (inputClientOrder) {
          inputClientOrder.value = clientOrder + 1;
        }
        if (inputOrder) {
          inputOrder.value = order + 1;
        }

        updateLiveFormPreview();
        if (inputUrl) inputUrl.focus();
      } else {
        resetVideoForm();
      }

      await fetchAdminVideos();
    } catch (err) {
      console.error("Save error:", err);
      showNotice("Firestore Error: " + err.message, "error");
    } finally {
      formSubmitBtn.disabled = false;
      formSubmitBtn.textContent = editingVideoId ? "Update Video" : "Add Video to Portfolio";
    }
  });

  if (formCancelBtn) {
    formCancelBtn.addEventListener("click", resetVideoForm);
  }
  if (formCancelHeaderBtn) {
    formCancelHeaderBtn.addEventListener("click", resetVideoForm);
  }
}

export function resetVideoForm() {
  editingVideoId = null;
  videoForm.reset();
  formHeading.textContent = "Add New Video Link";
  formSubmitBtn.textContent = "Add Video to Portfolio";
  if (formCancelBtn) formCancelBtn.classList.add("hidden");
  if (formCancelHeaderBtn) formCancelHeaderBtn.classList.add("hidden");
  if (thumbUploadStatus) thumbUploadStatus.classList.add("hidden");
  if (thumbnailFileInput) thumbnailFileInput.value = "";

  if (inputClientName) inputClientName.value = "";
  if (inputClientOrder) inputClientOrder.value = "1";
  if (inputAspect) inputAspect.value = "9:16";
  if (inputOrder) inputOrder.value = (videosList.length + 1).toString();
  if (inputFeaturedOrder) inputFeaturedOrder.value = "";

  renderClientPickerPills();
  updateLiveFormPreview();
}

// ============================================================================
// 7. TABLE SEARCH, CLIENT FILTER PILLS & RENDERING
// ============================================================================
function renderAdminTableClientFilters() {
  if (!adminTableClientFilters) return;

  const clients = getUniqueClients();
  const total = videosList.length;
  const standaloneCount = videosList.filter(v => !v.clientName || !v.clientName.trim()).length;

  let filtersHtml = `
    <button 
      type="button" 
      data-filter="ALL" 
      class="table-filter-btn text-[11px] font-medium px-3 py-1 rounded-full border transition-all cursor-pointer ${
        currentTableFilter === "ALL" 
          ? 'bg-[#111111] text-white border-black shadow-xs' 
          : 'bg-[#F4F4F6] text-neutral-600 border-black/5 hover:bg-[#EAEAEA]'
      }">
      All (${total})
    </button>
    <button 
      type="button" 
      data-filter="STANDALONE" 
      class="table-filter-btn text-[11px] font-medium px-3 py-1 rounded-full border transition-all cursor-pointer ${
        currentTableFilter === "STANDALONE" 
          ? 'bg-[#111111] text-white border-black shadow-xs' 
          : 'bg-[#F4F4F6] text-neutral-600 border-black/5 hover:bg-[#EAEAEA]'
      }">
      Standalone (${standaloneCount})
    </button>
  `;

  clients.forEach(client => {
    const isSelected = currentTableFilter.toLowerCase() === client.toLowerCase();
    const count = videosList.filter(v => v.clientName && v.clientName.toLowerCase() === client.toLowerCase()).length;
    filtersHtml += `
      <button 
        type="button" 
        data-filter="${client}" 
        class="table-filter-btn text-[11px] font-medium px-3 py-1 rounded-full border transition-all cursor-pointer flex items-center gap-1.5 ${
          isSelected 
            ? 'bg-[#111111] text-white border-black shadow-xs' 
            : 'bg-[#F4F4F6] text-neutral-700 border-black/5 hover:bg-[#EAEAEA]'
        }">
        <span class="w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-[#EB7A25]' : 'bg-[#EB7A25]/70'}"></span>
        <span>${client}</span>
        <span class="text-[10px] ${isSelected ? 'text-white/70' : 'text-neutral-400'} font-mono">(${count})</span>
      </button>
    `;
  });

  adminTableClientFilters.innerHTML = filtersHtml;

  adminTableClientFilters.querySelectorAll(".table-filter-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      currentTableFilter = btn.getAttribute("data-filter") || "ALL";
      renderAdminTableClientFilters();
      renderFilteredVideos();
    });
  });
}

function initTableSearch() {
  if (adminTableSearch) {
    adminTableSearch.addEventListener("input", (e) => {
      currentSearchQuery = e.target.value.trim().toLowerCase();
      renderFilteredVideos();
    });
  }
}

function getFilteredVideos() {
  return videosList.filter(v => {
    // Client Series filter
    if (currentTableFilter === "STANDALONE") {
      if (v.clientName && v.clientName.trim()) return false;
    } else if (currentTableFilter !== "ALL") {
      if (!v.clientName || v.clientName.toLowerCase() !== currentTableFilter.toLowerCase()) return false;
    }

    // Search query filter
    if (currentSearchQuery) {
      const titleMatch = v.title && v.title.toLowerCase().includes(currentSearchQuery);
      const urlMatch = v.videoUrl && v.videoUrl.toLowerCase().includes(currentSearchQuery);
      const clientMatch = v.clientName && v.clientName.toLowerCase().includes(currentSearchQuery);
      const categoryMatch = v.category && v.category.toLowerCase().includes(currentSearchQuery);
      const descMatch = v.description && v.description.toLowerCase().includes(currentSearchQuery);
      if (!titleMatch && !urlMatch && !clientMatch && !categoryMatch && !descMatch) {
        return false;
      }
    }

    return true;
  });
}

function renderFilteredVideos() {
  if (!videosTableBody) return;

  const filtered = getFilteredVideos();

  if (filtered.length === 0) {
    const isFiltered = currentSearchQuery || currentTableFilter !== "ALL";
    videosTableBody.innerHTML = `
      <tr>
        <td colspan="8" class="px-6 py-12 text-center text-sm text-neutral-400">
          ${isFiltered 
            ? 'No videos match your active filter or search query. Click "All" above to reset filters.' 
            : 'No videos found in your database yet. Use the form above to add your first video!'}
        </td>
      </tr>
    `;
    return;
  }

  videosTableBody.innerHTML = filtered.map((v, idx) => {
    const isFeatured = v.isFeatured === true || v.isFeatured === "true";
    const isVisible = v.isVisible !== false; // default true
    const parsed = parseVideoUrl(v.videoUrl, v.aspectRatio);
    const thumb = v.thumbnailUrl || parsed.thumbnailUrl || parsed.fallbackThumb || "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=400&q=80";

    return `
      <tr class="border-b border-neutral-100 hover:bg-neutral-50/70 transition-colors ${!isVisible ? 'opacity-60 bg-neutral-50/40' : ''}">
        <!-- Thumbnail & Title -->
        <td class="px-4 py-3">
          <div class="flex items-center gap-2.5 max-w-[260px]">
            <img src="${thumb}" alt="" class="w-12 h-8 object-cover rounded-md shadow-xs bg-neutral-900 flex-shrink-0" onerror="this.src='https://images.unsplash.com/photo-1536240478700-b869070f9279?auto=format&fit=crop&w=400&q=80'">
            <div class="min-w-0 flex-1">
              <p class="text-xs font-semibold text-neutral-900 truncate" title="${v.title}">${v.title}</p>
              <a href="${v.videoUrl}" target="_blank" rel="noopener noreferrer" class="text-[11px] text-neutral-400 hover:text-[#EB7A25] truncate block max-w-[190px] transition-colors" title="${v.videoUrl}">${v.videoUrl}</a>
            </div>
          </div>
        </td>

        <!-- Client Series -->
        <td class="px-3 py-3 text-xs whitespace-nowrap">
          ${v.clientName ? `
            <span class="micro-pill font-medium max-w-[140px] truncate inline-flex items-center gap-1">
              <span class="w-1.5 h-1.5 rounded-full bg-[#EB7A25] shrink-0"></span>
              <span class="truncate">${v.clientName}</span>
              <span class="text-neutral-400 font-mono text-[10px] shrink-0">#${String(v.clientOrder || 1).padStart(2, '0')}</span>
            </span>
          ` : `
            <span class="text-neutral-400 text-xs italic">Standalone</span>
          `}
        </td>

        <!-- Category -->
        <td class="px-3 py-3 text-xs font-medium text-neutral-600 whitespace-nowrap">
          <span class="micro-pill max-w-[130px] truncate inline-block">${(v.category || 'Production').replace(/\s*\([^)]*\)/g, '').trim()}</span>
        </td>

        <!-- Aspect -->
        <td class="px-2 py-3 text-xs text-neutral-500 font-mono text-center whitespace-nowrap">
          <span class="px-1.5 py-0.5 rounded bg-neutral-100 text-[10px] font-semibold">${v.aspectRatio || '9:16'}</span>
        </td>

        <!-- Order with Quick Swap Buttons -->
        <td class="px-3 py-3 text-xs font-semibold text-neutral-700 whitespace-nowrap text-center">
          <div class="inline-flex items-center justify-center gap-1">
            <span class="font-mono text-xs w-5 text-center">${v.order || (idx + 1)}</span>
            <div class="inline-flex flex-col gap-0.5">
              <button 
                type="button" 
                onclick="window.adminSwapOrder('${v.id}', -1)" 
                title="Move Up" 
                class="p-0.5 rounded hover:bg-neutral-200 text-neutral-500 hover:text-black transition-colors cursor-pointer">
                <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"/></svg>
              </button>
              <button 
                type="button" 
                onclick="window.adminSwapOrder('${v.id}', 1)" 
                title="Move Down" 
                class="p-0.5 rounded hover:bg-neutral-200 text-neutral-500 hover:text-black transition-colors cursor-pointer">
                <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
              </button>
            </div>
          </div>
        </td>

        <!-- Visibility Toggle -->
        <td class="px-3 py-3 text-center whitespace-nowrap">
          <button 
            type="button" 
            onclick="window.adminToggleVisibility('${v.id}', ${!isVisible})"
            class="px-2.5 py-1 rounded-full text-[11px] font-medium transition-all cursor-pointer ${
              isVisible 
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100' 
                : 'bg-neutral-100 text-neutral-400 hover:bg-neutral-200'
            }">
            ${isVisible ? '👁️ Published' : '🚫 Hidden'}
          </button>
        </td>

        <!-- Carousel Rank / Priority Toggle & Order -->
        <td class="px-3 py-3 text-center whitespace-nowrap">
          ${isFeatured ? `
            <div class="inline-flex items-center gap-1">
              <button 
                type="button" 
                onclick="window.adminToggleFeatured('${v.id}', false)"
                title="Click to unpin from carousel front"
                class="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-900 border border-amber-300 hover:bg-amber-200 transition-all cursor-pointer">
                ★ #${v.featuredOrder || (idx + 1)}
              </button>
              <div class="inline-flex flex-col gap-0.5">
                <button 
                  type="button" 
                  onclick="window.adminAdjustFeaturedRank('${v.id}', -1)" 
                  title="Higher Priority (Rank Up)" 
                  class="p-0.5 rounded hover:bg-neutral-200 text-neutral-500 hover:text-black transition-colors cursor-pointer">
                  <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 15l7-7 7 7"/></svg>
                </button>
                <button 
                  type="button" 
                  onclick="window.adminAdjustFeaturedRank('${v.id}', 1)" 
                  title="Lower Priority (Rank Down)" 
                  class="p-0.5 rounded hover:bg-neutral-200 text-neutral-500 hover:text-black transition-colors cursor-pointer">
                  <svg class="w-2.5 h-2.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M19 9l-7 7-7-7"/></svg>
                </button>
              </div>
            </div>
          ` : `
            <button 
              type="button" 
              onclick="window.adminToggleFeatured('${v.id}', true)"
              title="Pin to front of landing page carousel"
              class="px-2.5 py-1 rounded-full text-[11px] font-medium bg-[#F4F4F6] text-neutral-600 border border-black/5 hover:bg-neutral-200 hover:text-black transition-all cursor-pointer">
              + Pin
            </button>
          `}
        </td>

        <!-- Actions -->
        <td class="px-4 py-3 text-right whitespace-nowrap space-x-1">
          <button 
            type="button" 
            onclick="window.adminEditVideo('${v.id}')"
            class="px-2 py-1 text-xs font-semibold text-neutral-700 hover:text-black hover:bg-neutral-100 rounded-md transition-colors cursor-pointer">
            Edit
          </button>
          <button 
            type="button" 
            onclick="window.adminDeleteVideo('${v.id}')"
            class="px-2 py-1 text-xs font-semibold text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-md transition-colors cursor-pointer">
            Delete
          </button>
        </td>
      </tr>
    `;
  }).join("");
}

// ============================================================================
// 8. TABLE ACTIONS (EDIT, VISIBILITY, FEATURED, SWAP ORDER, DELETE)
// ============================================================================
export function editVideo(id) {
  const v = videosList.find(item => item.id === id);
  if (!v) return;

  editingVideoId = id;
  formHeading.textContent = `Edit Video: ${v.title}`;
  formSubmitBtn.textContent = "Update Video";
  if (formCancelBtn) formCancelBtn.classList.remove("hidden");
  if (formCancelHeaderBtn) formCancelHeaderBtn.classList.remove("hidden");

  inputTitle.value = v.title || "";
  inputUrl.value = v.videoUrl || "";
  inputThumb.value = v.thumbnailUrl || "";
  if (inputClientName) inputClientName.value = v.clientName || "";
  if (inputClientOrder) inputClientOrder.value = v.clientOrder || 1;
  inputCategory.value = v.category || "Commercials & Ads";
  inputAspect.value = v.aspectRatio || "9:16";
  inputDuration.value = v.duration || "";
  inputOrder.value = v.order || 1;
  inputFeatured.checked = (v.isFeatured === true || v.isFeatured === "true");
  if (inputFeaturedOrder) {
    inputFeaturedOrder.value = (v.featuredOrder !== undefined && v.featuredOrder !== null) ? v.featuredOrder : "";
  }
  inputDesc.value = v.description || "";

  renderClientPickerPills();
  updateLiveFormPreview();

  videoForm.scrollIntoView({ behavior: "smooth" });
}

export async function toggleVisibility(id, newStatus) {
  if (!db) return;
  try {
    await updateDoc(doc(db, "videos", id), {
      isVisible: newStatus,
      updatedAt: serverTimestamp()
    });
    const video = videosList.find(v => v.id === id);
    const title = video ? video.title : "Video";
    showNotice(`"${title}" is now ${newStatus ? 'Published' : 'Hidden from public site'}.`, "success");
    await fetchAdminVideos();
  } catch (err) {
    console.error("Toggle visibility error:", err);
    showNotice("Failed to update visibility: " + err.message, "error");
  }
}

export async function toggleFeatured(id, newStatus) {
  if (!db) return;

  const v = videosList.find(item => item.id === id);
  const title = v ? v.title : "Video";

  try {
    const payload = {
      isFeatured: newStatus,
      updatedAt: serverTimestamp()
    };

    if (newStatus) {
      const currentFeatured = videosList.filter(item => (item.isFeatured === true || item.isFeatured === "true"));
      let maxRank = 0;
      currentFeatured.forEach(item => {
        const r = Number(item.featuredOrder);
        if (!isNaN(r) && r > maxRank) maxRank = r;
      });
      payload.featuredOrder = maxRank + 1;
    } else {
      payload.featuredOrder = null;
    }

    await updateDoc(doc(db, "videos", id), payload);
    showNotice(`"${title}" is now ${newStatus ? 'Pinned to front of Landing Page Carousel' : 'Unpinned from front'}.`, "success");
    await fetchAdminVideos();
  } catch (err) {
    console.error("Toggle featured error:", err);
    showNotice("Failed to update featured status: " + err.message, "error");
  }
}

export async function adjustFeaturedRank(id, delta) {
  if (!db) return;
  const currentVid = videosList.find(v => v.id === id);
  if (!currentVid) return;

  const featuredVids = videosList
    .filter(v => (v.isFeatured === true || v.isFeatured === "true"))
    .sort((a, b) => (Number(a.featuredOrder) || 99) - (Number(b.featuredOrder) || 99));

  const currentIdx = featuredVids.findIndex(v => v.id === id);
  if (currentIdx === -1) return;

  const targetIdx = currentIdx + delta;
  if (targetIdx < 0 || targetIdx >= featuredVids.length) return;

  const targetVid = featuredVids[targetIdx];

  let currentRank = Number(currentVid.featuredOrder) || (currentIdx + 1);
  let targetRank = Number(targetVid.featuredOrder) || (targetIdx + 1);

  if (currentRank === targetRank) {
    targetRank = currentRank + delta;
  }

  try {
    await Promise.all([
      updateDoc(doc(db, "videos", currentVid.id), { featuredOrder: targetRank, updatedAt: serverTimestamp() }),
      updateDoc(doc(db, "videos", targetVid.id), { featuredOrder: currentRank, updatedAt: serverTimestamp() })
    ]);
    await fetchAdminVideos();
  } catch (err) {
    console.error("Adjust featured rank error:", err);
    showNotice("Failed to adjust rank: " + err.message, "error");
  }
}

export async function swapOrder(id, direction) {
  if (!db) return;

  const currentIndex = videosList.findIndex(v => v.id === id);
  if (currentIndex === -1) return;

  const targetIndex = currentIndex + direction;
  if (targetIndex < 0 || targetIndex >= videosList.length) return;

  const currentVid = videosList[currentIndex];
  const targetVid = videosList[targetIndex];

  let currentOrder = Number(currentVid.order) || (currentIndex + 1);
  let targetOrder = Number(targetVid.order) || (targetIndex + 1);

  if (currentOrder === targetOrder) {
    targetOrder = currentOrder + direction;
  }

  try {
    await Promise.all([
      updateDoc(doc(db, "videos", currentVid.id), { order: targetOrder, updatedAt: serverTimestamp() }),
      updateDoc(doc(db, "videos", targetVid.id), { order: currentOrder, updatedAt: serverTimestamp() })
    ]);
    await fetchAdminVideos();
  } catch (err) {
    console.error("Swap order error:", err);
    showNotice("Failed to swap order: " + err.message, "error");
  }
}

export async function deleteVideo(id) {
  const v = videosList.find(item => item.id === id);
  const title = v ? v.title : "this video";

  const confirmDelete = confirm(`Are you sure you want to permanently delete "${title}"?`);
  if (!confirmDelete || !db) return;

  try {
    await deleteDoc(doc(db, "videos", id));
    showNotice(`Deleted "${title}".`, "success");
    await fetchAdminVideos();
  } catch (err) {
    console.error("Delete error:", err);
    showNotice("Failed to delete video: " + err.message, "error");
  }
}

// ============================================================================
// 9. ONE-CLICK BACKUP EXPORT / IMPORT & SAMPLE SEEDING
// ============================================================================
function initBackupAndSeed() {
  // Export JSON Backup
  if (btnExportBackup) {
    btnExportBackup.addEventListener("click", () => {
      if (videosList.length === 0) {
        alert("No videos available to export.");
        return;
      }

      const cleanList = videosList.map(v => {
        const copy = { ...v };
        delete copy.createdAt;
        delete copy.updatedAt;
        return copy;
      });

      const dateStr = new Date().toISOString().split("T")[0];
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(cleanList, null, 2));
      const downloadAnchor = document.createElement("a");
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `mina-magdy-portfolio-backup-${dateStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      showNotice(`Exported ${cleanList.length} videos to JSON backup file!`, "success");
    });
  }

  // Import JSON Backup
  if (btnImportBackup && backupFileInput) {
    btnImportBackup.addEventListener("click", () => {
      backupFileInput.click();
    });

    backupFileInput.addEventListener("change", (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (event) => {
        try {
          const imported = JSON.parse(event.target.result);
          if (!Array.isArray(imported)) {
            throw new Error("Invalid backup format. Expected an array of video objects.");
          }

          const validVideos = imported.filter(item => item && item.title && item.videoUrl);
          if (validVideos.length === 0) {
            throw new Error("No valid video entries found in the file.");
          }

          const proceed = confirm(`Found ${validVideos.length} valid videos in the backup file. Would you like to import them into Firestore?`);
          if (!proceed || !db) return;

          btnImportBackup.disabled = true;
          btnImportBackup.textContent = "Importing...";

          let added = 0;
          for (const item of validVideos) {
            const payload = {
              title: item.title,
              videoUrl: item.videoUrl,
              thumbnailUrl: item.thumbnailUrl || "",
              clientName: item.clientName || "",
              clientOrder: Number(item.clientOrder) || 1,
              category: item.category || "Commercials & Ads",
              aspectRatio: item.aspectRatio || "16:9",
              duration: item.duration || "",
              order: Number(item.order) || (videosList.length + added + 1),
              isFeatured: Boolean(item.isFeatured),
              description: item.description || "",
              isVisible: item.isVisible !== false,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp()
            };
            await addDoc(collection(db, "videos"), payload);
            added++;
          }

          showNotice(`Successfully imported ${added} videos from backup!`, "success");
          await fetchAdminVideos();
        } catch (err) {
          console.error("Backup import failed:", err);
          showNotice("Backup import error: " + err.message, "error");
        } finally {
          btnImportBackup.disabled = false;
          btnImportBackup.textContent = "Import JSON";
          backupFileInput.value = "";
        }
      };
      reader.readAsText(file);
    });
  }

  // Clear All Videos (Strict Confirmation Prompt)
  if (btnClearVideos) {
    btnClearVideos.addEventListener("click", async () => {
      if (videosList.length === 0) {
        alert("Your portfolio database is already empty.");
        return;
      }

      const confirmation = prompt("Type DELETE to wipe all videos from Firestore:");

      if (confirmation !== "DELETE") {
        showNotice("Clear operation cancelled. Database untouched.", "info");
        return;
      }

      if (!db) return;

      try {
        btnClearVideos.disabled = true;
        btnClearVideos.textContent = "Clearing...";

        // Batch delete all video documents
        const deletePromises = videosList.map(v => deleteDoc(doc(db, "videos", v.id)));
        await Promise.all(deletePromises);

        showNotice(`Successfully deleted all ${deletePromises.length} videos. Portfolio is now clean!`, "success");
        await fetchAdminVideos();
      } catch (err) {
        console.error("Clear all videos error:", err);
        showNotice("Failed to clear videos: " + err.message, "error");
      } finally {
        btnClearVideos.disabled = false;
        btnClearVideos.innerHTML = `
          <svg class="w-3.5 h-3.5 text-rose-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
          Clear All Videos
        `;
      }
    });
  }
}

// ============================================================================
// HELPER NOTICE BAR
// ============================================================================
function showNotice(text, type = "info") {
  if (!formNotice) return;
  formNotice.textContent = text;
  formNotice.classList.remove("hidden", "bg-emerald-50", "text-emerald-800", "bg-rose-50", "text-rose-800", "bg-amber-50", "text-amber-800");

  if (type === "success") {
    formNotice.classList.add("bg-emerald-50", "text-emerald-800", "border", "border-emerald-200");
  } else if (type === "error") {
    formNotice.classList.add("bg-rose-50", "text-rose-800", "border", "border-rose-200");
  } else {
    formNotice.classList.add("bg-amber-50", "text-amber-800", "border", "border-amber-200");
  }

  setTimeout(() => {
    formNotice.classList.add("hidden");
  }, 5000);
}

// ============================================================================
// WINDOW EXPORTS FOR INLINE HANDLERS
// ============================================================================
window.handleAdminLogin = handleLoginSubmit;
window.adminEditVideo = editVideo;
window.adminToggleFeatured = toggleFeatured;
window.adminAdjustFeaturedRank = adjustFeaturedRank;
window.adminToggleVisibility = toggleVisibility;
window.adminSwapOrder = swapOrder;
window.adminDeleteVideo = deleteVideo;

// ============================================================================
// BOOTSTRAP
// ============================================================================
function bootstrapAdmin() {
  initAuth();
  initClientPickerActions();
  initThumbnailUpload();
  initVideoForm();
  initTableSearch();
  initBackupAndSeed();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapAdmin);
} else {
  bootstrapAdmin();
}
