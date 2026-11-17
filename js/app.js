/**
 * Main Frontend Application Controller for Landing Page & Video Gallery
 * Features Native Client Series Bento Card Grouping & Theater Modal Playlist
 */

import { 
  db, 
  collection, 
  getDocs, 
  query, 
  where, 
  orderBy, 
  isConfigured, 
  DEFAULT_SAMPLE_VIDEOS 
} from "./firebase-config.js?v=2.8.0";

import { parseVideoUrl, createTheaterEmbed } from "./videoParser.js?v=2.8.0";

// State
let allVideos = [];
let currentCategory = "All";
export let clientGroupsMap = {};
export let currentGroupedItems = [];
let currentModalGroup = null;
let currentModalIndex = 0;
let currentModalProjectIndex = 0;
let currentActiveVideoId = null;

// DOM Elements
const featuredContainer = document.getElementById("featured-videos-grid");
const galleryContainer = document.getElementById("gallery-videos-grid");
const theaterModal = document.getElementById("theater-modal");
const theaterContent = document.getElementById("theater-content");
const modalTitle = document.getElementById("modal-video-title");
const modalCategory = document.getElementById("modal-video-category");
const modalCloseBtn = document.getElementById("modal-close-btn");
const theaterPlaylistContainer = document.getElementById("theater-playlist-container");

// ============================================================================
// DYNAMIC VIDEO COUNTS SYNCHRONIZATION
// ============================================================================
export function updateDynamicCounts(totalVideos) {
  const count = typeof totalVideos === "number" && totalVideos > 0 ? totalVideos : 14;
  const cutsStr = `${count}+ Cuts`;
  const exploreStr = `Explore ${count}+ Cuts`;
  const videosStr = `• ${count} Videos`;

  document.querySelectorAll('[data-count-badge="cuts"]').forEach(el => {
    el.textContent = cutsStr;
  });
  document.querySelectorAll('[data-count-badge="cuts-explore"]').forEach(el => {
    el.textContent = exploreStr;
  });
  document.querySelectorAll('[data-count-badge="videos"]').forEach(el => {
    el.textContent = videosStr;
  });
}

// ============================================================================
// 1. DATA FETCHING (FIRESTORE, LOCAL CACHE, OR SEED FALLBACK)
// ============================================================================
export async function loadVideos() {
  const CACHE_KEY = "mina_portfolio_videos_cache";

  if (isConfigured && db) {
    try {
      const q = query(collection(db, "videos"));
      const snapshot = await getDocs(q);
      const docs = [];
      snapshot.forEach(docSnap => {
        docs.push({ id: docSnap.id, ...docSnap.data() });
      });

      // Exclude drafts / hidden videos from public portfolio
      const publicDocs = docs.filter(v => v.isVisible !== false);
      publicDocs.sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
      allVideos = publicDocs;

      // Update localStorage cache for instant offline / subsequent loads
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(publicDocs));
      } catch (e) {}

      updateDynamicCounts(allVideos.length);
      return allVideos;
    } catch (err) {
      console.warn("Firestore fetch notice, trying local cache:", err.message);
    }
  }

  // 1. Try local cache if Firestore was unreachable or not yet ready
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached) {
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed) && parsed.length > 0) {
        allVideos = parsed.filter(v => v.isVisible !== false);
        updateDynamicCounts(allVideos.length);
        return allVideos;
      }
    }
  } catch (e) {}

  // 2. Fallback to default curated videos
  allVideos = (DEFAULT_SAMPLE_VIDEOS || []).filter(v => v.isVisible !== false);
  updateDynamicCounts(allVideos.length);
  return allVideos;
}

// ============================================================================
// 2. CLIENT SERIES GROUPING ENGINE
// ============================================================================
export function groupVideos(videosList) {
  clientGroupsMap = {};
  const standaloneItems = [];
  const groupsByClient = new Map();

  videosList.forEach(v => {
    const rawClient = (v.clientName || v.client || "").trim();
    if (rawClient) {
      const key = rawClient.toLowerCase();
      if (!groupsByClient.has(key)) {
        const groupId = "cg-" + key.replace(/[^a-z0-9]/g, "-");
        groupsByClient.set(key, {
          isGroup: true,
          groupId: groupId,
          clientName: rawClient,
          category: v.category || "Commercials & Ads",
          aspectRatio: v.aspectRatio || "16:9",
          videos: [],
          isFeatured: false,
          order: Number(v.order) || 99
        });
      }
      const group = groupsByClient.get(key);
      group.videos.push(v);
      if (v.isFeatured === true || v.isFeatured === "true") {
        group.isFeatured = true;
        const fOrder = Number(v.featuredOrder);
        if (!isNaN(fOrder) && fOrder > 0) {
          group.featuredOrder = group.featuredOrder !== undefined ? Math.min(group.featuredOrder, fOrder) : fOrder;
        }
      }
      group.order = Math.min(group.order, Number(v.order) || 99);
    } else {
      const isFeatured = v.isFeatured === true || v.isFeatured === "true";
      const fOrder = Number(v.featuredOrder);
      standaloneItems.push({
        isGroup: false,
        ...v,
        isFeatured,
        featuredOrder: (isFeatured && !isNaN(fOrder) && fOrder > 0) ? fOrder : (isFeatured ? 99 : 999)
      });
    }
  });

  // Sort videos within each group by clientOrder ascending
  const groupedItems = [];
  groupsByClient.forEach(group => {
    if (group.isFeatured && group.featuredOrder === undefined) {
      group.featuredOrder = 99;
    }
    group.videos.sort((a, b) => (Number(a.clientOrder) || 1) - (Number(b.clientOrder) || 1));
    clientGroupsMap[group.groupId] = group;
    groupedItems.push(group);
  });

  // Combine and sort by order ascending
  const allItems = [...groupedItems, ...standaloneItems];
  allItems.sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
  currentGroupedItems = allItems;
  return allItems;
}

// ============================================================================
// 3. CARD BUILDERS (STANDALONE & CLIENT SERIES BENTO CARDS)
// ============================================================================

export function buildStandaloneVideoCard(video) {
  const parsed = parseVideoUrl(video.videoUrl, video.aspectRatio);
  const isVertical = (video.aspectRatio === "9:16" || parsed.aspectRatio === "9:16");
  const thumbUrl = video.thumbnailUrl || parsed.thumbnailUrl || parsed.fallbackThumb || "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=800&q=80";
  const categoryClean = (video.category || 'Production').replace(/\s*\([^)]*\)/g, '').trim();

  return `
    <div class="bento-card bento-card-hover p-4 sm:p-5 flex flex-col h-full group cursor-pointer"
         data-video-id="${video.id}"
         onclick="window.appOpenTheater('${video.id}')">
      
      <!-- Card Header: Micro Pill & Aspect Indicator -->
      <div class="h-7 flex items-center justify-between mb-3.5">
        <span class="micro-pill max-w-[155px] truncate">
          <span class="w-1.5 h-1.5 rounded-full ${isVertical ? 'bg-orange-500' : 'bg-neutral-400'} shrink-0"></span>
          <span class="truncate">${categoryClean}</span>
        </span>
        <span class="text-[11px] font-medium text-neutral-400 tracking-wide shrink-0">
          1 Video • ${isVertical ? '9:16 Reel' : '16:9'}
        </span>
      </div>

      <!-- Thumbnail Stage Wrapper: Vertically Centers 16:9 while 9:16 fills stage -->
      <div class="thumbnail-stage-wrapper flex-1 flex flex-col justify-center min-h-0 mb-3.5">
        <!-- Video Media Box with Play Overlay -->
        <div class="relative w-full ${isVertical ? 'aspect-[9/16] max-h-[420px]' : 'aspect-16-9'} rounded-2xl overflow-hidden bg-neutral-900 shadow-sm">
          <img 
            src="${thumbUrl}" 
            alt="${video.title}" 
            loading="lazy"
            onerror="this.src='https://images.unsplash.com/photo-1536240478700-b869070f9279?auto=format&fit=crop&w=800&q=80'"
            class="video-card-thumb w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-300" />
          
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10 pointer-events-none"></div>

          <div class="play-button-overlay absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/90 backdrop-blur-md text-neutral-900 flex items-center justify-center shadow-lg pointer-events-none">
            <svg class="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>

          ${video.duration ? `
            <div class="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-[11px] font-medium text-white tracking-wide">
              ${video.duration}
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Bottom Group: Title, Description & Bottom Footer Bar -->
      <div class="video-card-bottom-group mt-auto flex flex-col">
        <!-- Video Title & Details -->
        <div class="video-card-details">
          <h3 class="text-base font-semibold text-neutral-900 group-hover:text-[#EB7A25] transition-colors line-clamp-1">
            ${video.title}
          </h3>
          <p class="text-xs text-neutral-500 mt-1 line-clamp-2 leading-relaxed">
            ${video.description || 'High-impact pacing, dynamic cuts, and cinematic sound design.'}
          </p>
        </div>

        <!-- Consistent Bottom Footer Bar -->
        <div class="pt-3 mt-2 border-t border-neutral-100 flex items-center justify-between gap-2">
          <span class="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
            Single Cut
          </span>
          <div class="flex items-center gap-1.5 flex-wrap">
            <button 
              type="button" 
              class="step-tab active text-xs px-3 py-1.5 min-h-[36px] min-w-[36px] inline-flex items-center justify-center"
              title="${video.title}">
              01
            </button>
          </div>
        </div>
      </div>

    </div>
  `;
}

export function buildClientSeriesCard(group) {
  const activeVideo = group.videos[0];
  const parsed = parseVideoUrl(activeVideo.videoUrl, activeVideo.aspectRatio);
  const isVertical = (activeVideo.aspectRatio === "9:16" || parsed.aspectRatio === "9:16");
  const thumbUrl = activeVideo.thumbnailUrl || parsed.thumbnailUrl || parsed.fallbackThumb || "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=800&q=80";
  const videoCountText = group.videos.length === 1 ? '1 Video' : `${group.videos.length} Videos`;
  const categoryClean = (group.category || 'Production').replace(/\s*\([^)]*\)/g, '').trim();

  // Normalize client names (e.g. Wagdy's W1) for clean single-line header fit
  let clientDisplayName = group.clientName;
  if (/wagdy.*(?:wave\s*one|w1)/i.test(clientDisplayName)) {
    clientDisplayName = "Wagdy’s W1";
  } else if (/wagdy.*(?:wave\s*two|w2)/i.test(clientDisplayName)) {
    clientDisplayName = "Wagdy’s W2";
  }

  return `
    <div class="bento-card bento-card-hover p-4 sm:p-5 flex flex-col h-full group"
         id="client-card-${group.groupId}"
         data-group-id="${group.groupId}"
         data-active-index="0">
      
      <!-- Card Header: Micro Pill Client Brand + Video Count -->
      <div class="h-7 flex items-center justify-between mb-3.5">
        <span class="micro-pill max-w-[155px] truncate">
          <span class="w-1.5 h-1.5 rounded-full bg-[#EB7A25] shrink-0"></span>
          <span class="truncate">${clientDisplayName}</span>
        </span>
        <span class="text-[11px] font-medium text-neutral-400 tracking-wide shrink-0">
          ${videoCountText} • ${categoryClean}
        </span>
      </div>

      <!-- Thumbnail Stage Wrapper: Vertically Centers 16:9 while 9:16 fills stage -->
      <div class="thumbnail-stage-wrapper flex-1 flex flex-col justify-center min-h-0 mb-3.5">
        <!-- Video Media Box with Play Overlay (Opens Theater Modal) -->
        <div class="relative w-full ${isVertical ? 'aspect-[9/16] max-h-[420px]' : 'aspect-16-9'} rounded-2xl overflow-hidden bg-neutral-900 shadow-sm cursor-pointer"
             onclick="window.appOpenClientTheater('${group.groupId}')">
          <img 
            id="client-thumb-${group.groupId}"
            src="${thumbUrl}" 
            alt="${activeVideo.title}" 
            loading="lazy"
            onerror="this.src='https://images.unsplash.com/photo-1536240478700-b869070f9279?auto=format&fit=crop&w=800&q=80'"
            class="video-card-thumb w-full h-full object-cover opacity-90 group-hover:opacity-100 transition-opacity duration-300" />
          
          <div class="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-black/10 pointer-events-none"></div>

          <div class="play-button-overlay absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-12 h-12 rounded-full bg-white/90 backdrop-blur-md text-neutral-900 flex items-center justify-center shadow-lg pointer-events-none">
            <svg class="w-5 h-5 ml-0.5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>

          <div id="client-dur-${group.groupId}" class="absolute bottom-2.5 right-2.5 px-2 py-0.5 rounded-md bg-black/70 backdrop-blur-sm text-[11px] font-medium text-white tracking-wide ${activeVideo.duration ? '' : 'hidden'}">
            ${activeVideo.duration || ''}
          </div>
        </div>
      </div>

      <!-- Bottom Group: Title, Description & Bottom Footer Bar -->
      <div class="video-card-bottom-group mt-auto flex flex-col">
        <!-- Video Title & Details -->
        <div class="video-card-details cursor-pointer" onclick="window.appOpenClientTheater('${group.groupId}')">
          <h3 id="client-title-${group.groupId}" class="text-base font-semibold text-neutral-900 group-hover:text-[#EB7A25] transition-colors line-clamp-1">
            ${activeVideo.title}
          </h3>
          <p id="client-desc-${group.groupId}" class="text-xs text-neutral-500 mt-1 line-clamp-2 leading-relaxed">
            ${activeVideo.description || ('Campaign series for ' + group.clientName)}
          </p>
        </div>

        <!-- In-Card Sequence Switcher (Consistent across ALL cards) -->
        <div class="pt-3 mt-2 border-t border-neutral-100 flex items-center justify-between gap-2">
          <span class="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">
            ${group.videos.length > 1 ? 'Series' : 'Single Cut'}
          </span>
          <div class="flex items-center gap-1.5 flex-wrap">
            ${group.videos.map((v, idx) => `
              <button 
                type="button" 
                id="tab-${group.groupId}-${idx}"
                onclick="event.stopPropagation(); window.appSwitchClientVideo('${group.groupId}', ${idx});"
                class="step-tab text-xs px-3 py-1.5 min-h-[36px] min-w-[36px] inline-flex items-center justify-center ${idx === 0 ? 'active' : ''}"
                title="${v.title}">
                ${String(idx + 1).padStart(2, '0')}
              </button>
            `).join('')}
          </div>
        </div>
      </div>

    </div>
  `;
}

export function renderCard(item) {
  if (item.isGroup) {
    return buildClientSeriesCard(item);
  }
  return buildStandaloneVideoCard(item);
}

// ============================================================================
// 4. IN-CARD SWITCHING LOGIC (01, 02, 03... PILLS)
// ============================================================================
export function switchClientVideo(groupId, index) {
  const group = clientGroupsMap[groupId];
  if (!group || !group.videos[index]) return;

  const v = group.videos[index];
  const parsed = parseVideoUrl(v.videoUrl, v.aspectRatio);
  const thumbUrl = v.thumbnailUrl || parsed.thumbnailUrl || parsed.fallbackThumb || "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=800&q=80";

  const card = document.getElementById(`client-card-${groupId}`);
  if (card) {
    card.setAttribute("data-active-index", index);
  }

  const thumbEl = document.getElementById(`client-thumb-${groupId}`);
  if (thumbEl) {
    thumbEl.style.opacity = "0.5";
    setTimeout(() => {
      thumbEl.src = thumbUrl;
      thumbEl.style.opacity = "1";
    }, 120);
  }

  const titleEl = document.getElementById(`client-title-${groupId}`);
  if (titleEl) {
    titleEl.style.opacity = "0";
    setTimeout(() => {
      titleEl.textContent = v.title;
      titleEl.style.opacity = "1";
    }, 100);
  }

  const descEl = document.getElementById(`client-desc-${groupId}`);
  if (descEl) {
    descEl.textContent = v.description || ('Campaign series for ' + group.clientName);
  }

  const durEl = document.getElementById(`client-dur-${groupId}`);
  if (durEl) {
    if (v.duration) {
      durEl.textContent = v.duration;
      durEl.classList.remove("hidden");
    } else {
      durEl.classList.add("hidden");
    }
  }

  // Update tabs
  group.videos.forEach((_, i) => {
    const tab = document.getElementById(`tab-${groupId}-${i}`);
    if (tab) {
      if (i === index) {
        tab.classList.add("active");
      } else {
        tab.classList.remove("active");
      }
    }
  });
}

// ============================================================================
// 5. LANDING PAGE: TOP FEATURED CRISP GRID-ALIGNED CAROUSEL
// ============================================================================
let featuredCarouselIndex = 0;
let carouselEventListenersAttached = false;

export function renderFeaturedVideos(videos) {
  if (!featuredContainer) return;

  if (!videos || videos.length === 0) {
    featuredContainer.innerHTML = `
      <div class="bento-card p-12 w-full text-center space-y-2">
        <div class="w-10 h-10 rounded-2xl bg-neutral-100 border border-black/5 flex items-center justify-center mx-auto text-neutral-400 mb-3">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/>
          </svg>
        </div>
        <p class="text-sm font-semibold text-neutral-800">No Featured Videos Yet</p>
        <p class="text-xs text-neutral-400 max-w-sm mx-auto">Curated showcase videos will appear here once added in the Admin Dashboard.</p>
      </div>
    `;
    return;
  }

  const groupedItems = groupVideos(videos);

  // In index.html featured carousel, include only top 9:16 vertical projects:
  // Siran, Sclinic, Wagdy's W1, Huwa, Wagdy's W2, Jaz Store (keep 16:9 like Re-edited in videos.html)
  const verticalItems = groupedItems.filter(item => {
    if (item.isGroup && item.videos && item.videos.length > 0) {
      const v = item.videos[0];
      return v.aspectRatio === "9:16" || item.aspectRatio === "9:16";
    }
    return item.aspectRatio === "9:16";
  });

  const featured = verticalItems.filter(item => item.isFeatured === true || item.isFeatured === "true");
  const remaining = verticalItems.filter(item => !(item.isFeatured === true || item.isFeatured === "true"));
  
  // Sort pinned/featured productions by assigned carousel rank ascending (1, 2, 3...)
  featured.sort((a, b) => (Number(a.featuredOrder) || 99) - (Number(b.featuredOrder) || 99));

  // Sort remaining vertical productions by standard sort order ascending
  remaining.sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));

  // Showcase all featured 9:16 productions followed smoothly by remaining 9:16 cuts
  const displayList = [...featured, ...remaining];

  if (displayList.length === 0) {
    featuredContainer.innerHTML = `
      <div class="bento-card p-12 w-full text-center space-y-2">
        <p class="text-sm font-semibold text-neutral-800">No Featured Videos Yet</p>
      </div>
    `;
    return;
  }

  // Render each item wrapped in a carousel-slide container
  featuredContainer.innerHTML = displayList.map((item, idx) => `
    <div class="carousel-slide flex-shrink-0 flex flex-col" data-slide-index="${idx}">
      ${renderCard(item)}
    </div>
  `).join("");

  // Initialize crisp grid-aligned carousel
  initFeaturedCarousel(displayList.length);
}

export function initFeaturedCarousel(totalSlides) {
  if (!featuredContainer || totalSlides <= 0) return;

  const prevBtn = document.getElementById("featured-prev-btn");
  const nextBtn = document.getElementById("featured-next-btn");
  const dotsContainer = document.getElementById("featured-carousel-dots");
  const stage = document.querySelector(".carousel-stage");

  function getVisibleCount() {
    if (window.innerWidth > 1024) return 3;
    if (window.innerWidth > 768) return 2;
    return 1;
  }

  function getGap() {
    return window.innerWidth <= 768 ? 20 : 24;
  }

  function updateCarousel(animate = true) {
    const visibleCount = getVisibleCount();
    const maxIndex = Math.max(0, totalSlides - visibleCount);
    featuredCarouselIndex = Math.max(0, Math.min(featuredCarouselIndex, maxIndex));

    const slides = featuredContainer.querySelectorAll(".carousel-slide");
    if (!slides.length) return;

    const firstSlide = slides[0];
    const slideWidth = firstSlide.getBoundingClientRect().width;
    const gap = getGap();
    const offset = featuredCarouselIndex * (slideWidth + gap);

    featuredContainer.style.transition = animate ? "transform 450ms cubic-bezier(0.22, 1, 0.36, 1)" : "none";
    featuredContainer.style.transform = `translateX(-${offset}px)`;

    // Keep all visible cards 100% sharp, full-opacity, and unclipped (clean grid alignment)
    slides.forEach((slide) => {
      slide.style.transform = "none";
      slide.style.opacity = "1";
      slide.style.filter = "none";
    });

    // Update buttons state
    if (prevBtn) {
      prevBtn.disabled = featuredCarouselIndex === 0;
    }
    if (nextBtn) {
      nextBtn.disabled = featuredCarouselIndex >= maxIndex;
    }

    // Update pagination dots (1 dot per exact full-card snap state)
    if (dotsContainer) {
      const numDots = maxIndex + 1;
      dotsContainer.innerHTML = Array.from({ length: numDots }).map((_, i) => `
        <button type="button" 
          class="carousel-dot h-2 rounded-full transition-all duration-300 ${i === featuredCarouselIndex ? 'w-6 bg-[#EB7A25]' : 'w-2 bg-neutral-300 hover:bg-neutral-400'}" 
          data-index="${i}" 
          aria-label="Go to carousel slide ${i + 1}">
        </button>
      `).join("");

      dotsContainer.querySelectorAll(".carousel-dot").forEach(dot => {
        dot.onclick = () => {
          const idx = parseInt(dot.getAttribute("data-index"), 10);
          if (!isNaN(idx)) {
            featuredCarouselIndex = idx;
            updateCarousel(true);
          }
        };
      });
    }
  }

  // Button clicks
  if (prevBtn) {
    prevBtn.onclick = () => {
      if (featuredCarouselIndex > 0) {
        featuredCarouselIndex--;
        updateCarousel(true);
      }
    };
  }

  if (nextBtn) {
    nextBtn.onclick = () => {
      const visibleCount = getVisibleCount();
      const maxIndex = Math.max(0, totalSlides - visibleCount);
      if (featuredCarouselIndex < maxIndex) {
        featuredCarouselIndex++;
        updateCarousel(true);
      }
    };
  }

  // Touch Swipe & Mouse Drag Handling (attach only once)
  if (stage && !carouselEventListenersAttached) {
    carouselEventListenersAttached = true;
    let startX = 0;
    let diffX = 0;
    let isDragging = false;

    const onStart = (clientX) => {
      startX = clientX;
      diffX = 0;
      isDragging = true;
    };

    const onMove = (clientX) => {
      if (!isDragging) return;
      diffX = clientX - startX;
    };

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      const visibleCount = getVisibleCount();
      const maxIndex = Math.max(0, totalSlides - visibleCount);

      if (diffX < -40 && featuredCarouselIndex < maxIndex) {
        featuredCarouselIndex++;
      } else if (diffX > 40 && featuredCarouselIndex > 0) {
        featuredCarouselIndex--;
      }
      updateCarousel(true);
    };

    // Touch events for mobile swiping
    stage.addEventListener("touchstart", (e) => {
      if (e.touches && e.touches.length === 1) {
        onStart(e.touches[0].clientX);
      }
    }, { passive: true });

    stage.addEventListener("touchmove", (e) => {
      if (e.touches && e.touches.length === 1) {
        onMove(e.touches[0].clientX);
      }
    }, { passive: true });

    stage.addEventListener("touchend", onEnd, { passive: true });

    // Pointer events for mouse dragging
    stage.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button") || e.target.closest("a") || e.target.closest(".step-tab")) return;
      onStart(e.clientX);
    });

    stage.addEventListener("pointermove", (e) => {
      onMove(e.clientX);
    });

    stage.addEventListener("pointerup", onEnd);
    stage.addEventListener("pointercancel", onEnd);

    // Resize handling
    window.addEventListener("resize", () => {
      updateCarousel(false);
    });
  }

  // Initial render
  setTimeout(() => {
    updateCarousel(false);
  }, 50);
}

// ============================================================================
// 6. GALLERY PAGE: FULL GRID & CATEGORY FILTERING
// ============================================================================
export function renderGallery(videos, category = "All") {
  if (!galleryContainer) return;

  let activeVideos = videos || [];
  if (category !== "All") {
    activeVideos = activeVideos.filter(v => v.category === category);
  }

  const items = groupVideos(activeVideos);

  const counterEl = document.getElementById("gallery-count");
  if (counterEl) {
    const totalCount = activeVideos.length;
    counterEl.textContent = `Showing ${items.length} cards (${totalCount} videos) in ${category === 'All' ? 'all categories' : category}`;
  }

  if (items.length === 0) {
    galleryContainer.innerHTML = `
      <div class="bento-card p-14 col-span-full text-center space-y-2">
        <div class="w-10 h-10 rounded-2xl bg-neutral-100 border border-black/5 flex items-center justify-center mx-auto text-neutral-400 mb-3">
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.8" d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z"/>
          </svg>
        </div>
        <p class="text-sm font-semibold text-neutral-800">No Videos Found</p>
        <p class="text-xs text-neutral-400 max-w-sm mx-auto">
          ${category === 'All' ? 'Portfolio videos will appear here once published in the Admin Dashboard.' : `No videos published under "${category}" yet.`}
        </p>
      </div>
    `;
    return;
  }

  galleryContainer.innerHTML = items.map(renderCard).join("");
}

// Filter pills click handling
export function initGalleryFilters() {
  const filterPills = document.querySelectorAll(".filter-pill");
  if (!filterPills.length) return;

  filterPills.forEach(pill => {
    pill.addEventListener("click", () => {
      filterPills.forEach(p => {
        p.classList.remove("bg-[#111111]", "text-white");
        p.classList.add("bg-[#F4F4F6]", "text-[#71717A]");
      });
      pill.classList.remove("bg-[#F4F4F6]", "text-[#71717A]");
      pill.classList.add("bg-[#111111]", "text-white");

      currentCategory = pill.getAttribute("data-category");
      renderGallery(allVideos, currentCategory);
    });
  });

  // Search input support
  const searchInput = document.getElementById("gallery-search-input");
  if (searchInput) {
    searchInput.addEventListener("input", (e) => {
      const queryText = e.target.value.toLowerCase().trim();
      const filtered = allVideos.filter(v => 
        (currentCategory === "All" || v.category === currentCategory) &&
        (v.title.toLowerCase().includes(queryText) || 
         (v.description && v.description.toLowerCase().includes(queryText)) ||
         (v.clientName && v.clientName.toLowerCase().includes(queryText)) ||
         (v.client && v.client.toLowerCase().includes(queryText)))
      );
      renderGallery(filtered, currentCategory);
    });
  }

  // Mobile horizontal scroll hint mask handling
  const filtersContainer = document.getElementById("category-filters-container");
  if (filtersContainer) {
    const updateScrollMask = () => {
      const isAtEnd = (filtersContainer.scrollLeft + filtersContainer.clientWidth) >= (filtersContainer.scrollWidth - 8);
      if (isAtEnd) {
        filtersContainer.classList.add("scroll-mask-none");
        filtersContainer.classList.remove("scroll-mask-hint");
      } else {
        filtersContainer.classList.remove("scroll-mask-none");
        filtersContainer.classList.add("scroll-mask-hint");
      }
    };
    filtersContainer.addEventListener("scroll", updateScrollMask, { passive: true });
    updateScrollMask();
  }
}

// ============================================================================
// 7. THEATER MODAL (FULLSCREEN VIDEO VIEWER & CLIENT PLAYLIST)
// ============================================================================
export function openTheater(videoId) {
  const video = allVideos.find(v => v.id === videoId);
  if (!video || !theaterModal || !theaterContent) return;

  currentModalGroup = null;
  currentModalIndex = 0;
  currentActiveVideoId = video.id;

  if (currentGroupedItems && currentGroupedItems.length) {
    const idx = currentGroupedItems.findIndex(item => !item.isGroup && item.id === videoId);
    if (idx !== -1) currentModalProjectIndex = idx;
  }

  // Deep-link state update
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("v", video.id);
    window.history.replaceState(null, "", url.toString());
  } catch (e) {}

  if (modalTitle) modalTitle.textContent = video.title;
  if (modalCategory) modalCategory.textContent = video.category || 'Production';

  theaterContent.innerHTML = createTheaterEmbed(video);
  theaterModal.querySelectorAll(".play-button-overlay").forEach(el => el.remove());

  // Enforce Mobile Iframe Scaling Directly in DOM for Google Drive embeds
  const isMobile = window.innerWidth <= 768;
  const isGdrive = (video.videoUrl && String(video.videoUrl).includes("drive.google.com"));
  const iframe = theaterContent.querySelector("iframe");
  if (iframe) {
    if (isMobile && isGdrive) {
      iframe.style.cssText = "width: 250% !important; height: 250% !important; transform: scale(0.4) !important; transform-origin: top left !important; position: absolute !important; top: 0 !important; left: 0 !important; border: 0 !important;";
    } else {
      iframe.style.cssText = "width: 100%; height: 100%; border: 0;";
    }
  }

  if (theaterPlaylistContainer) {
    theaterPlaylistContainer.innerHTML = "";
    theaterPlaylistContainer.classList.add("hidden");
  }

  theaterModal.classList.remove("hidden");
  theaterModal.classList.add("flex");
  requestAnimationFrame(() => {
    theaterModal.classList.add("theater-modal-active");
  });
  document.body.style.overflow = "hidden";
}

export function openClientTheater(groupId, specificIndex = null) {
  const group = clientGroupsMap[groupId];
  if (!group || !theaterModal || !theaterContent) return;

  const card = document.getElementById(`client-card-${groupId}`);
  const activeIdx = specificIndex !== null ? specificIndex : (Number(card?.getAttribute("data-active-index")) || 0);
  const video = group.videos[activeIdx] || group.videos[0];

  currentModalGroup = groupId;
  currentModalIndex = activeIdx;
  currentActiveVideoId = video.id;

  if (currentGroupedItems && currentGroupedItems.length) {
    const idx = currentGroupedItems.findIndex(item => item.isGroup && item.groupId === groupId);
    if (idx !== -1) currentModalProjectIndex = idx;
  }

  // Deep-link state update
  try {
    const url = new URL(window.location.href);
    url.searchParams.set("v", video.id);
    window.history.replaceState(null, "", url.toString());
  } catch (e) {}

  // Sync background card if it exists
  if (card) {
    switchClientVideo(groupId, activeIdx);
  }

  if (modalTitle) modalTitle.textContent = `${group.clientName} — ${video.title}`;
  if (modalCategory) modalCategory.textContent = `${group.category} • Episode ${String(activeIdx + 1).padStart(2, '0')} of ${String(group.videos.length).padStart(2, '0')}`;

  theaterContent.innerHTML = createTheaterEmbed(video);
  theaterModal.querySelectorAll(".play-button-overlay").forEach(el => el.remove());

  // Enforce Mobile Iframe Scaling Directly in DOM for Google Drive embeds
  const isMobile = window.innerWidth <= 768;
  const isGdrive = (video.videoUrl && String(video.videoUrl).includes("drive.google.com"));
  const iframe = theaterContent.querySelector("iframe");
  if (iframe) {
    if (isMobile && isGdrive) {
      iframe.style.cssText = "width: 250% !important; height: 250% !important; transform: scale(0.4) !important; transform-origin: top left !important; position: absolute !important; top: 0 !important; left: 0 !important; border: 0 !important;";
    } else {
      iframe.style.cssText = "width: 100%; height: 100%; border: 0;";
    }
  }

  if (theaterPlaylistContainer) {
    if (group.videos.length > 1) {
      theaterPlaylistContainer.innerHTML = `
        <div class="pt-3 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <!-- Left: Client Series Info + Compact Numbered Pills -->
          <div class="flex items-center gap-3 flex-wrap">
            <span class="text-neutral-200 text-xs font-semibold flex items-center gap-1.5 whitespace-nowrap">
              <span class="w-2 h-2 rounded-full bg-[#EB7A25]"></span>
              ${group.clientName} Series (${group.videos.length})
            </span>

            <div class="flex items-center gap-1.5 flex-wrap">
              ${group.videos.map((vid, i) => `
                <button 
                  type="button" 
                  onclick="window.appOpenClientTheater('${groupId}', ${i})"
                  class="modal-playlist-pill ${i === activeIdx ? 'active' : ''}"
                  title="${vid.title} (${vid.duration || 'Video'})">
                  ${String(i + 1).padStart(2, '0')}
                </button>
              `).join('')}
            </div>
          </div>

          <!-- Right: Prev / Next Quick Switcher Buttons -->
          <div class="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
            <button 
              type="button" 
              onclick="window.appStepModalClientVideo(-1)"
              class="modal-nav-pill flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-all cursor-pointer"
              title="Previous Video (Left Arrow)">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M15 19l-7-7 7-7"/></svg>
              <span>Prev</span>
            </button>
            <button 
              type="button" 
              onclick="window.appStepModalClientVideo(1)"
              class="modal-nav-pill flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-all cursor-pointer"
              title="Next Video (Right Arrow)">
              <span>Next</span>
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M9 5l7 7-7 7"/></svg>
            </button>
          </div>
        </div>
      `;
      theaterPlaylistContainer.classList.remove("hidden");
    } else {
      theaterPlaylistContainer.innerHTML = "";
      theaterPlaylistContainer.classList.add("hidden");
    }
  }

  theaterModal.classList.remove("hidden");
  theaterModal.classList.add("flex");
  requestAnimationFrame(() => {
    theaterModal.classList.add("theater-modal-active");
  });
  document.body.style.overflow = "hidden";
}

export function stepModalProject(direction) {
  if (!currentGroupedItems || !currentGroupedItems.length) {
    if (allVideos.length) {
      currentGroupedItems = groupVideos(allVideos);
    }
  }
  if (!currentGroupedItems || !currentGroupedItems.length) return;

  let nextIdx = currentModalProjectIndex + direction;
  if (nextIdx < 0) nextIdx = currentGroupedItems.length - 1;
  else if (nextIdx >= currentGroupedItems.length) nextIdx = 0;

  currentModalProjectIndex = nextIdx;
  const target = currentGroupedItems[nextIdx];
  if (!target) return;

  if (target.isGroup) {
    const vidIdx = direction === -1 ? (target.videos.length - 1) : 0;
    openClientTheater(target.groupId, vidIdx);
  } else {
    openTheater(target.id);
  }
}

export function stepModalClientVideo(direction) {
  if (!currentModalGroup) {
    stepModalProject(direction);
    return;
  }
  const group = clientGroupsMap[currentModalGroup];
  if (!group || !group.videos.length) {
    stepModalProject(direction);
    return;
  }

  const total = group.videos.length;
  let nextIdx = currentModalIndex + direction;
  if (nextIdx < 0 || nextIdx >= total) {
    stepModalProject(direction);
    return;
  }

  openClientTheater(currentModalGroup, nextIdx);
}

export function closeTheater() {
  if (!theaterModal || !theaterContent) return;
  currentModalGroup = null;
  currentModalIndex = 0;
  currentActiveVideoId = null;

  try {
    const url = new URL(window.location.href);
    url.searchParams.delete("v");
    url.searchParams.delete("video");
    window.history.replaceState(null, "", url.pathname + (url.hash || ""));
  } catch (e) {}

  theaterModal.classList.remove("theater-modal-active");
  setTimeout(() => {
    if (!currentActiveVideoId) {
      theaterContent.innerHTML = "";
      if (theaterPlaylistContainer) {
        theaterPlaylistContainer.innerHTML = "";
        theaterPlaylistContainer.classList.add("hidden");
      }
      theaterModal.classList.add("hidden");
      theaterModal.classList.remove("flex");
      document.body.style.overflow = "";
    }
  }, 220);
}

// Modal Share Link Handling
export function initModalShare() {
  const shareBtn = document.getElementById("modal-share-btn");
  if (!shareBtn) return;

  shareBtn.addEventListener("click", async () => {
    if (!currentActiveVideoId) return;

    try {
      const shareUrl = new URL(window.location.href);
      shareUrl.searchParams.set("v", currentActiveVideoId);

      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(shareUrl.toString());
      } else {
        const input = document.createElement("input");
        input.value = shareUrl.toString();
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }

      const label = shareBtn.querySelector(".modal-share-label");
      const originalText = label ? label.textContent : "Copy Link";
      if (label) label.textContent = "Copied!";
      shareBtn.classList.add("bg-emerald-500/20", "text-emerald-300");

      setTimeout(() => {
        if (label) label.textContent = originalText;
        shareBtn.classList.remove("bg-emerald-500/20", "text-emerald-300");
      }, 2000);
    } catch (err) {
      console.warn("Share link copy notice:", err);
    }
  });
}

// Deep-linking (?v=slug-or-id) handling
export function handleDeepLinkParam() {
  const params = new URLSearchParams(window.location.search);
  const target = params.get("v") || params.get("video");
  if (!target) return;

  const targetLower = target.toLowerCase().trim();

  // 1. Try matching video by exact ID
  const directVid = allVideos.find(v => v.id && v.id.toLowerCase() === targetLower);
  if (directVid) {
    const clientName = (directVid.clientName || directVid.client || "").trim().toLowerCase();
    if (clientName) {
      const group = Object.values(clientGroupsMap).find(g => (g.clientName || "").toLowerCase() === clientName);
      if (group) {
        const idx = group.videos.findIndex(v => v.id === directVid.id);
        openClientTheater(group.groupId, idx >= 0 ? idx : 0);
        return;
      }
    }
    openTheater(directVid.id);
    return;
  }

  // 2. Try matching client group by name or groupId
  const matchedGroup = Object.values(clientGroupsMap).find(g => 
    g.groupId.toLowerCase() === targetLower ||
    (g.clientName || "").toLowerCase() === targetLower ||
    (g.clientName || "").toLowerCase().replace(/[^a-z0-9]/g, "-") === targetLower
  );
  if (matchedGroup) {
    openClientTheater(matchedGroup.groupId, 0);
    return;
  }

  // 3. Try matching by slug in title
  const titleMatched = allVideos.find(v => (v.title || "").toLowerCase().replace(/[^a-z0-9]/g, "-").includes(targetLower));
  if (titleMatched) {
    openTheater(titleMatched.id);
  }
}

// Scroll-driven Staggered Bento Reveal
export function initScrollReveal() {
  const revealElements = document.querySelectorAll(".bento-reveal");
  if (!revealElements.length) return;

  if (typeof IntersectionObserver === "undefined") {
    revealElements.forEach(el => el.classList.add("in-view"));
    return;
  }

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        obs.unobserve(entry.target);
      }
    });
  }, {
    rootMargin: "0px 0px -30px 0px",
    threshold: 0.05
  });

  revealElements.forEach((el, index) => {
    const delay = (index % 3) * 60;
    if (delay > 0) {
      el.style.transitionDelay = `${delay}ms`;
    }
    observer.observe(el);
  });
}

// Attach to window so inline onclick handlers in generated cards work
window.appOpenTheater = openTheater;
window.appOpenClientTheater = openClientTheater;
window.appStepModalClientVideo = stepModalClientVideo;
window.appStepModalProject = stepModalProject;
window.appSwitchClientVideo = switchClientVideo;
window.appCloseTheater = closeTheater;
window.closeModal = closeTheater;
window.closeTheater = closeTheater;

// ============================================================================
// 8. "HOW I WORK" INTERACTIVE STEPPER (EXACT BENTO REPLICA WITH PROGRESS TRACK)
// ============================================================================
const WORK_STEPS = {
  1: {
    title: "01 Discovery & Creative Brief",
    text: "In the first stage, we dive deep into your raw footage, target audience psychology, pacing benchmarks, and target platforms to build a bulletproof narrative structure.",
    progress: "20%",
    tags: ["Hook Strategy", "Audience Psychology", "Pacing Benchmarks"]
  },
  2: {
    title: "02 Assembly & Story Structure",
    text: "We construct the narrative backbone: selecting prime takes, crafting the rough cut timeline, eliminating filler, and locking the emotional rhythm and pacing before adding motion or audio effects.",
    progress: "40%",
    tags: ["A-Roll Selects", "Narrative Pacing", "Rough Cut Timeline"]
  },
  3: {
    title: "03 Dynamic Sound Design & Foley",
    text: "Video is 50% sound. We build high-impact audio layers featuring crisp dialogue leveling, bespoke sound effects (whooshes, risers, textures), and precision musical beat synchronization.",
    progress: "60%",
    tags: ["Dialogue Leveling", "Bespoke Foley & SFX", "Beat Synchronization"]
  },
  4: {
    title: "04 Color Grading & Motion Design",
    text: "Elevating visual production value: custom color grading, contrast balancing, animated kinetic typography, modern lower thirds, and seamless motion graphics inside After Effects.",
    progress: "80%",
    tags: ["Cinematic Color LUTs", "Kinetic Typography", "After Effects VFX"]
  },
  5: {
    title: "05 Polish, Revisions & Multi-Format Delivery",
    text: "Frame-accurate revisions, client review cycles via Frame.io, and optimized exports for 16:9 YouTube 4K master files, 9:16 high-retention social reels, and full master project archives.",
    progress: "100%",
    tags: ["Frame.io Review", "4K YouTube 16:9", "High-Retention 9:16"]
  }
};

export function initHowIWorkStepper() {
  const stepTabs = document.querySelectorAll("#how-i-work .step-tab");
  const stepTitle = document.getElementById("step-display-title");
  const stepText = document.getElementById("step-display-text");
  const progressBar = document.getElementById("step-progress-bar");
  const progressText = document.getElementById("step-progress-percentage");
  const tagsContainer = document.getElementById("step-deliverables-container");

  if (!stepTabs.length || !stepTitle || !stepText) return;

  stepTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const stepNumber = tab.getAttribute("data-step");
      const stepData = WORK_STEPS[stepNumber];

      if (!stepData) return;

      stepTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      // Smooth fade transition
      stepTitle.style.opacity = "0";
      stepText.style.opacity = "0";
      if (tagsContainer) tagsContainer.style.opacity = "0";

      if (progressBar) {
        progressBar.style.width = stepData.progress;
      }
      if (progressText) {
        progressText.textContent = `${stepData.progress} Completed`;
      }

      setTimeout(() => {
        stepTitle.textContent = stepData.title;
        stepText.textContent = stepData.text;

        if (tagsContainer && stepData.tags) {
          tagsContainer.innerHTML = stepData.tags.map(tag => `
            <span class="deliverable-tag px-2.5 py-1 rounded-lg bg-neutral-100 text-neutral-600 text-xs font-medium border border-neutral-200/60 inline-flex items-center gap-1.5 transition-all">
              <span class="w-1.5 h-1.5 rounded-full bg-[#EB7A25]"></span>
              ${tag}
            </span>
          `).join("");
        }

        stepTitle.style.opacity = "1";
        stepText.style.opacity = "1";
        if (tagsContainer) tagsContainer.style.opacity = "1";
      }, 150);
    });
  });
}

// ============================================================================
// 9. FLOATING BENTO MENU POPOVER & SHORTCUTS
// ============================================================================
export function initFloatingMenu() {
  const menuBtn = document.getElementById("mobile-menu-btn");
  const popover = document.getElementById("nav-floating-popover");
  const adminLink = document.getElementById("nav-admin-link");

  // Check if admin is signed in (discreetly unhide link only for site owner)
  if (adminLink && localStorage.getItem("admin_auth_active") === "1") {
    adminLink.classList.remove("hidden");
    adminLink.classList.add("flex");
  }

  // Keyboard shortcut Shift + Alt + A to access admin
  document.addEventListener("keydown", (e) => {
    if (e.shiftKey && e.altKey && (e.key === "A" || e.key === "a")) {
      window.location.href = "admin.html";
    }
  });

  if (!menuBtn || !popover) return;

  function toggleMenu(e) {
    if (e) e.stopPropagation();
    const isOpen = popover.classList.contains("popover-open");
    if (isOpen) {
      closeMenu();
    } else {
      openMenu();
    }
  }

  function openMenu() {
    popover.classList.add("popover-open");
    menuBtn.classList.add("is-active");
  }

  function closeMenu() {
    popover.classList.remove("popover-open");
    menuBtn.classList.remove("is-active");
  }

  menuBtn.addEventListener("click", toggleMenu);

  // Close on outside click
  document.addEventListener("click", (e) => {
    if (!popover.contains(e.target) && !menuBtn.contains(e.target)) {
      closeMenu();
    }
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeMenu();
    }
  });

  // Close menu and handle internal anchors inside popover
  popover.querySelectorAll("a").forEach(link => {
    link.addEventListener("click", (e) => {
      closeMenu();
      const href = link.getAttribute("href");
      if (href === "#contact") {
        e.preventDefault();
        scrollToContact(true);
      }
    });
  });
}

// ============================================================================
// 10. CONTACT BENTO PILLS (1-CLICK COPY & MAILTO) & SMOOTH SCROLLING
// ============================================================================
export function scrollToContact(triggerPulse = true) {
  const contactSection = document.getElementById("contact");
  if (!contactSection) return;

  contactSection.scrollIntoView({ behavior: "smooth", block: "start" });

  if (triggerPulse) {
    const bentoCard = contactSection.querySelector(".bento-card") || contactSection;
    bentoCard.classList.remove("contact-pulse-glow");
    void bentoCard.offsetWidth; // Force layout reflow
    bentoCard.classList.add("contact-pulse-glow");
    setTimeout(() => {
      bentoCard.classList.remove("contact-pulse-glow");
    }, 1200);
  }
}

window.scrollToContact = scrollToContact;

export function initContactPills() {
  const emailPill = document.getElementById("email-contact-pill");
  const copyBtn = document.getElementById("copy-email-action-btn");
  const copyLabel = document.getElementById("copy-email-label");

  if (!emailPill) return;

  emailPill.addEventListener("click", (e) => {
    e.preventDefault();
    const email = "uncommonmino@gmail.com";

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(email).then(() => {
        if (copyLabel) copyLabel.textContent = "Copied! ✓";
        if (copyBtn) {
          copyBtn.classList.add("bg-emerald-50", "text-emerald-700", "border-emerald-200");
        }
        setTimeout(() => {
          if (copyLabel) copyLabel.textContent = "Copy & Mail";
          if (copyBtn) {
            copyBtn.classList.remove("bg-emerald-50", "text-emerald-700", "border-emerald-200");
          }
        }, 2500);
      }).catch(() => {});
    }

    setTimeout(() => {
      window.location.href = `mailto:${email}?subject=Project%20Inquiry%20-%20Video%20Production`;
    }, 150);
  });
}

// ============================================================================
// 10B. HERO HEADLINE ROTATOR & AMBIENT ANIMATIONS
// ============================================================================
export function initHeroTitleRotator() {
  const rotatorContainer = document.getElementById("hero-title-rotator");
  if (!rotatorContainer) return;

  const items = Array.from(rotatorContainer.querySelectorAll(".hero-rotator-item"));
  if (items.length <= 1) return;

  const ampersand = document.querySelector(".hero-ampersand");
  let currentIndex = 0;
  let intervalId = null;
  const ROTATE_INTERVAL = 3000;

  function rotateTitle() {
    const outgoingItem = items[currentIndex];
    currentIndex = (currentIndex + 1) % items.length;
    const incomingItem = items[currentIndex];

    // Trigger synchronized micro-pulse on ampersand
    if (ampersand) {
      ampersand.classList.remove("pulse");
      void ampersand.offsetWidth; // Force CSS reflow
      ampersand.classList.add("pulse");
    }

    // Step 1: Outgoing item slides up with blur
    outgoingItem.classList.remove("active");
    outgoingItem.classList.add("exit-up");
    outgoingItem.setAttribute("aria-hidden", "true");

    // Step 2: Incoming item slides up from bottom
    incomingItem.classList.remove("exit-up");
    incomingItem.classList.add("active");
    incomingItem.setAttribute("aria-hidden", "false");

    // Step 3: Clean up outgoing item after transition
    setTimeout(() => {
      outgoingItem.style.transition = "none";
      outgoingItem.classList.remove("exit-up");
      void outgoingItem.offsetWidth;
      outgoingItem.style.transition = "";
    }, 550);
  }

  function startRotation() {
    if (intervalId) clearInterval(intervalId);
    intervalId = setInterval(rotateTitle, ROTATE_INTERVAL);
  }

  function stopRotation() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  // Start initial rotation cycle
  startRotation();

  // Pause when browser tab is inactive, resume when active
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopRotation();
    } else {
      startRotation();
    }
  });

  // Pause on hover over rotator
  rotatorContainer.addEventListener("mouseenter", stopRotation);
  rotatorContainer.addEventListener("mouseleave", startRotation);
}

// ============================================================================
// 10C. LIVE CAIRO TIME TICKER (GMT+2)
// ============================================================================
export function initCairoClock() {
  const timeEl = document.getElementById("cairo-live-time");
  if (!timeEl) return;

  function updateTime() {
    try {
      const formatter = new Intl.DateTimeFormat("en-US", {
        timeZone: "Africa/Cairo",
        hour: "2-digit",
        minute: "2-digit",
        hour12: true
      });
      const formatted = formatter.format(new Date());
      timeEl.textContent = `${formatted} (GMT+2)`;
    } catch (e) {
      timeEl.textContent = "GMT+2 Active";
    }
  }

  updateTime();
  setInterval(updateTime, 10000);
}

// ============================================================================
// 11. INITIALIZE PAGE
// ============================================================================
async function bootstrapApp() {
  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeTheater);
  if (theaterModal) {
    theaterModal.addEventListener("click", (e) => {
      if (e.target === theaterModal) closeTheater();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (!theaterModal || !theaterModal.classList.contains("theater-modal-active")) return;

    if (e.key === "Escape") {
      closeTheater();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      stepModalClientVideo(-1);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      stepModalClientVideo(1);
    }
  });

  initFloatingMenu();
  initHowIWorkStepper();
  initContactPills();
  initHeroTitleRotator();
  initCairoClock();
  initModalShare();
  initScrollReveal();

  // Modal "Inquire about a video project →" link: closes player & glides to contact
  const modalInquireLink = document.getElementById("modal-inquire-link");
  if (modalInquireLink) {
    modalInquireLink.addEventListener("click", (e) => {
      e.preventDefault();
      closeTheater();
      setTimeout(() => {
        scrollToContact(true);
      }, 50);
    });
  }

  // Hero "Book a call" CTA button
  const heroBookCallBtn = document.getElementById("hero-book-call-btn");
  if (heroBookCallBtn) {
    heroBookCallBtn.addEventListener("click", (e) => {
      e.preventDefault();
      scrollToContact(true);
    });
  }

  // Footer "Contact" links
  document.querySelectorAll('footer a[href="#contact"]').forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      scrollToContact(true);
    });
  });

  const videos = await loadVideos();

  if (featuredContainer) {
    renderFeaturedVideos(videos);
  }

  if (galleryContainer) {
    initGalleryFilters();
    renderGallery(videos, "All");
  }

  // Check for direct video deep-link (?v=...)
  handleDeepLinkParam();

  // Re-check scroll reveal elements after dynamic video cards render
  setTimeout(() => {
    initScrollReveal();
  }, 100);
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapApp);
} else {
  bootstrapApp();
}
