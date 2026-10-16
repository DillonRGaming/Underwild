// The Android app can't update itself silently. On start it checks the latest GitHub
// Release; if that's newer it shows a bar with an Update button, which downloads the new
// APK so Android can install it over this one (worlds are kept).

const LATEST_RELEASE = 'https://api.github.com/repos/DillonRGaming/Underwild/releases/latest';

function newer(a, b) {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) > (pb[i] || 0);
  return false;
}

export async function checkForAppUpdate(currentVersion) {
  if (!window.Capacitor?.isNativePlatform?.()) return;
  let release;
  try {
    const res = await fetch(LATEST_RELEASE, { headers: { Accept: 'application/vnd.github+json' } });
    if (!res.ok) return;
    release = await res.json();
  } catch (e) {
    return;
  }
  const latest = String(release.tag_name || '').replace(/^v/, '');
  const apk = (release.assets || []).find(a => a.name.endsWith('.apk'));
  if (!apk || !newer(latest, currentVersion)) return;

  const bar = document.createElement('div');
  bar.className = 'app-update-bar';
  bar.innerHTML = `<span>Underwild ${latest} is out.</span>
    <button class="minecraft-button small" data-update="go">Update</button>
    <button class="minecraft-button small" data-update="later">Later</button>`;
  bar.querySelector('[data-update="go"]').addEventListener('click', () => {
    // Opens in the phone's browser, which downloads it; tap the download to install.
    window.location.href = apk.browser_download_url;
    bar.remove();
  });
  bar.querySelector('[data-update="later"]').addEventListener('click', () => bar.remove());
  document.body.appendChild(bar);
}
