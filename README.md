# Mina Magdy — Video Editor & Content Producer Portfolio

A minimalist, Apple-inspired **Bento Grid** portfolio built for **GitHub Pages (Static Hosting)** with a private Owner Dashboard powered by **Firebase (Spark Free Plan — Authentication & Cloud Firestore)**.

---

## 🎨 Visual Direction & Design System
- **Layout Geometry:** Apple-style Bento Grid with `26px` rounded corners, ultra-soft diffused shadows (`0 8px 30px rgba(0,0,0,0.035)`), and clean 1px hairline borders (`rgba(0,0,0,0.05)`).
- **Color Palette:**
  - Background Canvas: Warm soft off-white (`#F7F7F5`)
  - Bento Surface: Pure white (`#FFFFFF`)
  - Typography: Primary charcoal (`#111111`), secondary muted gray (`#8E8E93`), and signature warm orange accent (`#EB7A25`).
- **Interactive Stepper:** Dynamic "How I Work" card featuring interactive step pills (`Step 01` to `Step 05`) that swap descriptions in real time.
- **Client Campaign Series Cards:** Automatically groups videos sharing the same client name (e.g. `Wagdys's`, `Siran`, `Sclinic`, `Jazz Store`, `Huwa`) into a single Bento card with `01`, `02`, `03` episode pill switchers and a built-in Theater Modal playlist strip.
- **Aspect Ratio Versatility:** Seamlessly handles standard `16:9` landscape (commercials, podcasts) and `9:16` vertical reels (TikTok, YouTube Shorts).

---

## 📁 Project Structure

```
Portfolio/
├── index.html              # Landing Page: Hero Bento + Top 3 Featured Videos + Stepper
├── videos.html             # Video Gallery: Full filterable portfolio with Theater Modal
├── admin.html              # Private Owner Dashboard: Firebase Auth login & video manager
├── firestore.rules         # Server-side Firestore Security Rules with schema validation
├── README.md               # Complete setup, security & deployment guide
├── css/
│   └── style.css           # Bento design system, typography, micro-animations
├── js/
│   ├── firebase-config.js  # Firebase v10+ modular initialization & fallback sample data
│   ├── videoParser.js      # Smart link parser (YouTube, Shorts, Vimeo, Drive, MP4)
│   ├── app.js              # Frontend controller (rendering, filter pills, stepper, modal)
│   └── admin.js            # Admin controller (auth observer, Firestore CRUD, Top 3 manager)
└── assets/
    ├── avatar.svg          # Stylized avatar (replaceable with your photo)
    └── favicon.svg         # Minimalist studio icon
```

---

## 🚀 Quick Setup Guide (Firebase Spark Free Plan)

### Step 1: Create a Firebase Project
1. Go to the [Firebase Console](https://console.firebase.google.com/) and click **"Add project"**.
2. Give your project a name (e.g. `mina-magdy-portfolio`) and disable Google Analytics (optional).
3. Under **Project Settings** > **General** > **Your apps**, click the **Web (</>)** icon.
4. Register the app (e.g., `portfolio-web`) and copy the `firebaseConfig` object.

### Step 2: Configure Authentication (Owner-Only)
1. In the Firebase Console sidebar, navigate to **Build** > **Authentication**.
2. Click **Get Started** and enable **Email/Password** under Sign-in providers.
3. Switch to the **Users** tab and click **"Add user"**.
4. Enter your admin login email and a strong master password.
5. Once created, copy the generated **User UID** string from the table column.
   *(Public registration is completely disabled in the code; only users manually created here can log in).*

### Step 3: Configure Cloud Firestore
1. Navigate to **Build** > **Firestore Database** and click **Create database**.
2. Select your closest location (e.g., `us-central` or `eur3`) and choose **Production mode**.
3. Go to the **Rules** tab, paste the complete contents of `firestore.rules`, replace `"YOUR_FIREBASE_ADMIN_UID"` with your copied UID, and click **Publish**.

### Step 4: Hook Up Credentials in Code
Open `js/firebase-config.js` and paste your credentials and User UID:
```javascript
export const ADMIN_UID = "paste_your_copied_firebase_user_uid_here";

export const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "your-portfolio.firebaseapp.com",
  projectId: "your-portfolio",
  storageBucket: "your-portfolio.appspot.com",
  messagingSenderId: "123456789012",
  appId: "1:123456789012:web:abcdef1234567890"
};
```

---

## 🔒 Security Architecture & Public Repo Protection

Because GitHub Pages hosts static client-side files, your `firebase-config.js` is publicly accessible. The application is secured at three distinct architectural levels:

### 1. Server-Side Firestore Security Rules (`firestore.rules`)
- **Public Read Access:** Visitors can browse and stream your videos (`allow read: if true;`).
- **Strict Admin UID Locking:** Zero personal email exposure in the public repo. Write, update, and delete calls are rejected at the Google server level unless the token matches your specific Firebase User UID (`request.auth.uid == "YOUR_FIREBASE_ADMIN_UID"`).
- **Data Validation Guard:** Injected or malformed documents are rejected if required fields (`title`, `videoUrl`, `category`, `aspectRatio`, `isFeatured`) do not match strict types and size boundaries.

### 2. Frontend Auth Hardening
- No registration form exists.
- The Admin Dashboard UI and Firestore write triggers are unmounted until `onAuthStateChanged` successfully authenticates the owner.
- Unauthorized users are logged out immediately.

### 3. Google Cloud API Key Domain Restriction (3-Step Checklist)
Lock your Firebase `apiKey` so it cannot be abused from other websites:
1. Open [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials).
2. Select your Firebase project from the top dropdown, find your **Browser Key** (or the key used by Firebase), and click **Edit**.
3. Under **Application restrictions**, choose **Websites / HTTP referrers** and add:
   - `https://<your-github-username>.github.io/*`
   - `http://localhost:*` (for local development)
4. Click **Save**.

---

## 🎬 Smart Video Link Parser (`videoParser.js`)

You do not host raw heavy video files on GitHub Pages. Simply paste links in `admin.html`:
- **YouTube Shorts:** `https://www.youtube.com/shorts/VIDEO_ID` (auto-detected as `9:16` vertical).
- **YouTube Videos:** `https://www.youtube.com/watch?v=VIDEO_ID` or `https://youtu.be/VIDEO_ID` (embeds via `youtube-nocookie.com` with zero branding/ads).
- **Vimeo:** `https://vimeo.com/VIDEO_ID` (embeds cleanly via `player.vimeo.com`).
- **Google Drive:** `https://drive.google.com/file/d/FILE_ID/view` (auto-converts to clean `/preview` player).
- **Direct MP4 / Cloudinary:** `https://.../video.mp4` (renders borderless HTML5 `<video>` tag with smooth controls).

---

## ⚡ Admin Dashboard Workflow Features (`admin.html`)

The Owner Dashboard is packed with features to make managing, ordering, and bulk-adding video campaigns effortless:
1. **Dynamic Client Picker Pills:** 1-click pills for each client brand extracted from Firestore. Clicking a pill automatically sets the sequence number (`existingCount + 1`).
2. **"+ New Client" & "✏️ Rename Series":** Easily add brands or rename an entire client series across all episodes in Firestore with a single click.
3. **Direct PC Thumbnail Upload (WebP Canvas Compression):** Upload custom thumbnails directly from your PC; compressed to 1280px WebP Data URLs on the client side (~40–120KB) with zero Firebase Storage setup needed.
4. **Live Bento Form Preview Card:** Real-time visual feedback showing what the video card will look like (thumbnail, platform badge, aspect ratio box, client pill, title, description).
5. **⚡ Fast Batch Mode:** Keep the selected Client Name, Category, and Aspect Ratio while auto-incrementing the episode number and sort order for quick consecutive uploads.
6. **Quick Table Reordering (`↑` / `↓`):** Swap the display order of any video with one click.
7. **Visibility Toggle (`👁️ Published` vs `🚫 Hidden`):** Keep drafts hidden from public pages without deleting records.
8. **Bento Table Search & Client Filters:** Instant client-side filtering by search term or client series.
9. **One-Click Backup & Database Wipe:** Export full database backups as timestamped `.json`, import backups, or wipe all test records with the "Clear All Videos" confirmation utility to start completely clean.

---

## 🚢 Deploying to GitHub Pages

1. Push this repository to GitHub:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Video Editor Bento Portfolio"
   git branch -M main
   git remote add origin https://github.com/<your-username>/<your-repo-name>.git
   git push -u origin main
   ```
2. On GitHub, navigate to **Settings** > **Pages**.
3. Under **Build and deployment** > **Source**, choose **Deploy from a branch**.
4. Select `main` branch and `/ (root)` directory, then click **Save**.
5. Your portfolio will be live at `https://<your-username>.github.io/<your-repo-name>/`!

"# uncommonmino.github.io" 
"# uncommonmino.github.io" 
