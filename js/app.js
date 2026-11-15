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
} from "./firebase-config.js";

import { parseVideoUrl, createTheaterEmbed } from "./videoParser.js";

// State
let allVideos = [];
let currentCategory = "All";
export let clientGroupsMap = {};
let currentModalGroup = null;
let currentModalIndex = 0;

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
// 1. DATA FETCHING (FIRESTORE OR SEED FALLBACK)
// ============================================================================
export async function loadVideos() {
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
      return allVideos;
    } catch (err) {
      console.warn("Firestore fetch notice:", err.message);
    }
  }

  // Fallback to default curated videos (empty array if none)
  allVideos = (DEFAULT_SAMPLE_VIDEOS || []).filter(v => v.isVisible !== false);
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
      }
      group.order = Math.min(group.order, Number(v.order) || 99);
    } else {
      standaloneItems.push({
        isGroup: false,
        ...v
      });
    }
  });

  // Sort videos within each group by clientOrder ascending
  const groupedItems = [];
  groupsByClient.forEach(group => {
    group.videos.sort((a, b) => (Number(a.clientOrder) || 1) - (Number(b.clientOrder) || 1));
    clientGroupsMap[group.groupId] = group;
    groupedItems.push(group);
  });

  // Combine and sort by order ascending
  const allItems = [...groupedItems, ...standaloneItems];
  allItems.sort((a, b) => (Number(a.order) || 99) - (Number(b.order) || 99));
  return allItems;
}

// ============================================================================
// 3. CARD BUILDERS (STANDALONE & CLIENT SERIES BENTO CARDS)
// ============================================================================

export function buildStandaloneVideoCard(video) {
  const parsed = parseVideoUrl(video.videoUrl, video.aspectRatio);
  const isVertical = (video.aspectRatio === "9:16" || parsed.aspectRatio === "9:16");
  const thumbUrl = video.thumbnailUrl || parsed.thumbnailUrl || parsed.fallbackThumb || "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=800&q=80";

  return `
    <div class="bento-card bento-card-hover p-4 sm:p-5 flex flex-col justify-between group cursor-pointer"
         data-video-id="${video.id}"
         onclick="window.appOpenTheater('${video.id}')">
      
      <!-- Card Header: Micro Pill & Aspect Indicator -->
      <div class="flex items-center justify-between mb-3.5">
        <span class="micro-pill">
          <span class="w-1.5 h-1.5 rounded-full ${isVertical ? 'bg-orange-500' : 'bg-neutral-400'}"></span>
          ${video.category || 'Production'}
        </span>
        <span class="text-[11px] font-medium text-neutral-400 tracking-wide">
          ${isVertical ? '9:16 Reel' : '16:9'}
        </span>
      </div>

      <!-- Video Media Box with Play Overlay -->
      <div class="relative w-full ${isVertical ? 'aspect-[9/16] max-h-[420px]' : 'aspect-16-9'} rounded-2xl overflow-hidden bg-neutral-900 mb-4 shadow-sm">
        <img 
          src="${thumbUrl}" 
          alt="${video.title}" 
          loading="lazy"
          onerror="this.src='https://images.unsplash.com/photo-1536240478700-b869070f9279?auto=format&fit=crop&w=800&q=80'"
          class="video-card-thumb w-full h-full object-cover opacity-90 group-hover:opacity-100" />
        
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

      <!-- Video Title & Details -->
      <div>
        <h3 class="text-base font-semibold text-neutral-900 group-hover:text-[#EB7A25] transition-colors line-clamp-1">
          ${video.title}
        </h3>
        <p class="text-xs text-neutral-500 mt-1 line-clamp-2 leading-relaxed">
          ${video.description || 'High-impact pacing, dynamic cuts, and cinematic sound design.'}
        </p>
      </div>

    </div>
  `;
}

export function buildClientSeriesCard(group) {
  const activeVideo = group.videos[0];
  const parsed = parseVideoUrl(activeVideo.videoUrl, activeVideo.aspectRatio);
  const isVertical = (activeVideo.aspectRatio === "9:16" || parsed.aspectRatio === "9:16");
  const thumbUrl = activeVideo.thumbnailUrl || parsed.thumbnailUrl || parsed.fallbackThumb || "https://images.unsplash.com/photo-1574717024653-61fd2cf4d44d?auto=format&fit=crop&w=800&q=80";

  return `
    <div class="bento-card bento-card-hover p-4 sm:p-5 flex flex-col justify-between group"
         id="client-card-${group.groupId}"
         data-group-id="${group.groupId}"
         data-active-index="0">
      
      <!-- Card Header: Micro Pill Client Brand + Video Count -->
      <div class="flex items-center justify-between mb-3.5">
        <span class="micro-pill">
          <span class="w-1.5 h-1.5 rounded-full bg-[#EB7A25]"></span>
          ${group.clientName}
        </span>
        <span class="text-[11px] font-medium text-neutral-400 tracking-wide">
          ${group.videos.length} Videos • ${group.category}
        </span>
      </div>

      <!-- Video Media Box with Play Overlay (Opens Theater Modal) -->
      <div class="relative w-full ${isVertical ? 'aspect-[9/16] max-h-[420px]' : 'aspect-16-9'} rounded-2xl overflow-hidden bg-neutral-900 mb-4 shadow-sm cursor-pointer"
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

      <!-- Video Title & Details -->
      <div class="space-y-3">
        <div>
          <h3 id="client-title-${group.groupId}" class="text-base font-semibold text-neutral-900 group-hover:text-[#EB7A25] transition-colors line-clamp-1">
            ${activeVideo.title}
          </h3>
          <p id="client-desc-${group.groupId}" class="text-xs text-neutral-500 mt-1 line-clamp-2 leading-relaxed">
            ${activeVideo.description || ('Campaign series for ' + group.clientName)}
          </p>
        </div>

        <!-- In-Card Sequence Switcher (Exact Step 01 Pill Style) -->
        ${group.videos.length > 1 ? `
          <div class="pt-3 border-t border-neutral-100 flex items-center justify-between gap-2">
            <span class="text-[10px] font-semibold text-neutral-400 uppercase tracking-wider">Series</span>
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
        ` : ''}
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
// 5. LANDING PAGE: TOP 3 FEATURED SHOWCASE
// ============================================================================
export function renderFeaturedVideos(videos) {
  if (!featuredContainer) return;

  if (!videos || videos.length === 0) {
    featuredContainer.innerHTML = `
      <div class="bento-card p-12 col-span-full text-center space-y-2">
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
  const featured = groupedItems.filter(item => item.isFeatured === true || item.isFeatured === "true");
  const displayList = featured.length > 0 ? featured.slice(0, 3) : groupedItems.slice(0, 3);

  if (displayList.length === 0) {
    featuredContainer.innerHTML = `
      <div class="bento-card p-12 col-span-full text-center space-y-2">
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

  featuredContainer.innerHTML = displayList.map(renderCard).join("");
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
}

// ============================================================================
// 7. THEATER MODAL (FULLSCREEN VIDEO VIEWER & CLIENT PLAYLIST)
// ============================================================================
export function openTheater(videoId) {
  const video = allVideos.find(v => v.id === videoId);
  if (!video || !theaterModal || !theaterContent) return;

  currentModalGroup = null;
  currentModalIndex = 0;

  if (modalTitle) modalTitle.textContent = video.title;
  if (modalCategory) modalCategory.textContent = video.category || 'Production';

  theaterContent.innerHTML = createTheaterEmbed(video);

  if (theaterPlaylistContainer) {
    theaterPlaylistContainer.innerHTML = "";
    theaterPlaylistContainer.classList.add("hidden");
  }

  theaterModal.classList.remove("hidden");
  theaterModal.classList.add("flex");
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

  // Sync background card if it exists
  if (card) {
    switchClientVideo(groupId, activeIdx);
  }

  if (modalTitle) modalTitle.textContent = `${group.clientName} — ${video.title}`;
  if (modalCategory) modalCategory.textContent = `${group.category} • Episode ${String(activeIdx + 1).padStart(2, '0')} of ${String(group.videos.length).padStart(2, '0')}`;

  theaterContent.innerHTML = createTheaterEmbed(video);

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
  document.body.style.overflow = "hidden";
}

export function stepModalClientVideo(direction) {
  if (!currentModalGroup) return;
  const group = clientGroupsMap[currentModalGroup];
  if (!group || !group.videos.length) return;

  const total = group.videos.length;
  let nextIdx = currentModalIndex + direction;
  if (nextIdx < 0) nextIdx = total - 1;
  else if (nextIdx >= total) nextIdx = 0;

  openClientTheater(currentModalGroup, nextIdx);
}

export function closeTheater() {
  if (!theaterModal || !theaterContent) return;
  currentModalGroup = null;
  currentModalIndex = 0;
  theaterContent.innerHTML = "";
  if (theaterPlaylistContainer) {
    theaterPlaylistContainer.innerHTML = "";
    theaterPlaylistContainer.classList.add("hidden");
  }
  theaterModal.classList.add("hidden");
  theaterModal.classList.remove("flex");
  document.body.style.overflow = "";
}

// Attach to window so inline onclick handlers in generated cards work
window.appOpenTheater = openTheater;
window.appOpenClientTheater = openClientTheater;
window.appStepModalClientVideo = stepModalClientVideo;
window.appSwitchClientVideo = switchClientVideo;
window.appCloseTheater = closeTheater;

// ============================================================================
// 8. "HOW I WORK" INTERACTIVE STEPPER (EXACT BENTO REPLICA)
// ============================================================================
const WORK_STEPS = {
  1: {
    title: "01 Discovery & Creative Brief",
    text: "In the first stage, we review your raw footage, target audience psychology, pacing benchmarks, and delivery platforms. This allows us to establish a crystal-clear creative direction and story structure before cutting."
  },
  2: {
    title: "02 Assembly & Story Structure",
    text: "We construct the narrative backbone: selecting prime takes, crafting the rough cut timeline, eliminating filler, and locking the emotional rhythm and pacing before adding motion or audio effects."
  },
  3: {
    title: "03 Dynamic Sound Design & Foley",
    text: "Video is 50% sound. We build high-impact audio layers featuring crisp dialogue leveling, bespoke sound effects (whooshes, risers, textures), and precision musical beat synchronization."
  },
  4: {
    title: "04 Color Grading & Motion Design",
    text: "Elevating visual production value: custom color grading, contrast balancing, animated kinetic typography, modern lower thirds, and seamless motion graphics inside After Effects."
  },
  5: {
    title: "05 Polish, Revisions & Multi-Format Delivery",
    text: "Frame-accurate revisions, client review cycles via Frame.io, and optimized exports for 16:9 YouTube 4K master files, 9:16 high-retention social reels, and full master project archives."
  }
};

export function initHowIWorkStepper() {
  const stepTabs = document.querySelectorAll(".step-tab");
  const stepTitle = document.getElementById("step-display-title");
  const stepText = document.getElementById("step-display-text");

  if (!stepTabs.length || !stepTitle || !stepText) return;

  stepTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      const stepNumber = tab.getAttribute("data-step");
      const stepData = WORK_STEPS[stepNumber];

      if (!stepData) return;

      stepTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");

      stepTitle.style.opacity = "0";
      stepText.style.opacity = "0";

      setTimeout(() => {
        stepTitle.textContent = stepData.title;
        stepText.textContent = stepData.text;
        stepTitle.style.opacity = "1";
        stepText.style.opacity = "1";
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
    if (!theaterModal || theaterModal.classList.contains("hidden")) return;

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
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", bootstrapApp);
} else {
  bootstrapApp();
}
