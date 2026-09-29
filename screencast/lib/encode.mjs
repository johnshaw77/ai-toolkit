import { execFileSync } from 'node:child_process';

/**
 * 把 Playwright 錄出來的 .webm 轉成 H.264 + AAC 的 .mp4。
 *
 * .webm（VP8）在 PowerPoint、LINE、Teams、公司的 Windows 電腦上常常播不了，
 * 影片要交給非技術同事，mp4 才是「點了就能看」的格式。
 *
 * - yuv420p：不少播放器（尤其 QuickTime、Windows 內建）只吃這個像素格式
 * - 長寬取偶數：yuv420p 要求長寬都是偶數，viewport 設成奇數會直接編碼失敗
 * - +faststart：把索引搬到檔頭，放到網頁上可以邊下載邊播
 *
 * 來源沒有音軌時 ffmpeg 自己就不會輸出音軌，不用分兩種情況處理。
 */
export function encodeMp4(inputPath, outPath, size) {
  // 高解析度錄影（2 倍像素）時縮回 viewport 大小：檔案小、各處都播得動，
  // 縮小時的反鋸齒也讓字比 1 倍錄的更乾淨。
  const scale = size ? `scale=${size.width}:${size.height}:flags=lanczos` : 'scale=trunc(iw/2)*2:trunc(ih/2)*2';
  execFileSync('ffmpeg', [
    '-y',
    '-i', inputPath,
    '-vf', scale,
    '-c:v', 'libx264',
    '-preset', 'veryfast',
    '-crf', '20',
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac',
    '-b:a', '128k',
    '-movflags', '+faststart',
    outPath,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
  return outPath;
}
