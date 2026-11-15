/**
 * Smart Video Link Parser for Bento Portfolio
 * Supports YouTube, YouTube Shorts, Vimeo, Google Drive, and Direct MP4/Cloudinary links.
 */

export function parseVideoUrl(url, explicitAspectRatio = null) {
  if (!url || typeof url !== 'string') {
    return {
      type: 'unknown',
      embedUrl: '',
      thumbnailUrl: '',
      aspectRatio: explicitAspectRatio || '16:9',
      isDirect: false,
    };
  }

  const cleanUrl = url.trim();

  // 1. YouTube Shorts (e.g., https://www.youtube.com/shorts/xxxx)
  const ytShortsMatch = cleanUrl.match(/(?:youtube\.com\/shorts\/)([\w-]{11})/i);
  if (ytShortsMatch) {
    const id = ytShortsMatch[1];
    return {
      type: 'youtube',
      id: id,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&modestbranding=1&rel=0&playsinline=1`,
      thumbnailUrl: `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
      fallbackThumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      aspectRatio: explicitAspectRatio || '9:16',
      isDirect: false,
    };
  }

  // 2. Standard YouTube (watch?v= or youtu.be/)
  const ytMatch = cleanUrl.match(/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([\w-]{11})/i);
  if (ytMatch) {
    const id = ytMatch[1];
    return {
      type: 'youtube',
      id: id,
      embedUrl: `https://www.youtube-nocookie.com/embed/${id}?autoplay=1&modestbranding=1&rel=0&playsinline=1`,
      thumbnailUrl: `https://img.youtube.com/vi/${id}/maxresdefault.jpg`,
      fallbackThumb: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
      aspectRatio: explicitAspectRatio || '16:9',
      isDirect: false,
    };
  }

  // 3. Vimeo (e.g., https://vimeo.com/12345678 or player.vimeo.com/video/12345678)
  const vimeoMatch = cleanUrl.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/i);
  if (vimeoMatch) {
    const id = vimeoMatch[1];
    return {
      type: 'vimeo',
      id: id,
      embedUrl: `https://player.vimeo.com/video/${id}?autoplay=1&title=0&byline=0&portrait=0`,
      thumbnailUrl: `https://vumbnail.com/${id}.jpg`, // public Vimeo thumb generator
      aspectRatio: explicitAspectRatio || '16:9',
      isDirect: false,
    };
  }

  // 4. Google Drive (e.g., https://drive.google.com/file/d/FILE_ID/view...)
  const gdriveMatch = cleanUrl.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/i);
  if (gdriveMatch) {
    const fileId = gdriveMatch[1];
    return {
      type: 'gdrive',
      id: fileId,
      embedUrl: `https://drive.google.com/file/d/${fileId}/preview`,
      thumbnailUrl: '',
      aspectRatio: explicitAspectRatio || '16:9',
      isDirect: false,
    };
  }

  // 5. Direct Video Files (.mp4, .webm, .mov, Cloudinary video links)
  const isDirect = /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(cleanUrl) || cleanUrl.includes('cloudinary.com') && cleanUrl.includes('/video/');
  if (isDirect) {
    return {
      type: 'direct',
      id: cleanUrl,
      embedUrl: cleanUrl,
      thumbnailUrl: '',
      aspectRatio: explicitAspectRatio || '16:9',
      isDirect: true,
    };
  }

  // Default Fallback
  return {
    type: 'generic',
    id: cleanUrl,
    embedUrl: cleanUrl,
    thumbnailUrl: '',
    aspectRatio: explicitAspectRatio || '16:9',
    isDirect: false,
  };
}

/**
 * Generates the responsive HTML embed string for Theater Modal
 */
export function createTheaterEmbed(videoData) {
  const parsed = parseVideoUrl(videoData.videoUrl, videoData.aspectRatio);
  const isVertical = (videoData.aspectRatio === '9:16' || parsed.aspectRatio === '9:16');
  const containerAspect = isVertical 
    ? 'max-w-[320px] max-h-[52dvh] sm:max-h-[62vh] aspect-[9/16]' 
    : 'max-w-4xl aspect-[16/9]';

  if (parsed.isDirect) {
    return `
      <div class="relative w-full ${containerAspect} mx-auto bg-black rounded-2xl overflow-hidden shadow-2xl">
        <video 
          src="${parsed.embedUrl}" 
          class="w-full h-full object-contain" 
          controls 
          autoplay 
          playsinline>
          Your browser does not support HTML5 video.
        </video>
      </div>
    `;
  }

  return `
    <div class="relative w-full ${containerAspect} mx-auto bg-black rounded-2xl overflow-hidden shadow-2xl">
      <iframe 
        src="${parsed.embedUrl}" 
        class="absolute inset-0 w-full h-full border-0" 
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" 
        allowfullscreen>
      </iframe>
    </div>
  `;
}

