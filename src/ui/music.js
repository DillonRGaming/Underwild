// Background music: one track at a time, faded in and looped with a pause between plays.
import { game, prefs } from '../game/state.js';

const MUSIC_SWITCH_FADE_MS = 1500;

export const musicTracks = {
  'underwild-mystic': { id: 'underwild-mystic', name: 'Underwild - Mystic', file: 'ui/underwild-mystic.mp3' },
  'underwild-skynight': { id: 'underwild-skynight', name: 'Underwild - Sky and Night', file: 'ui/underwild-skynight.mp3' },
  'underwild-sodium': { id: 'underwild-sodium', name: 'Underwild - Sodium', file: 'ui/underwild-sodium.mp3' },
  'underwild-thoughts': { id: 'underwild-thoughts', name: 'Underwild - Thoughts', file: 'ui/underwild-thoughts.mp3' },
  'underwild-fairy': { id: 'underwild-fairy', name: 'Underwild - Fairy', file: 'ui/underwild-fairy.mp3' },
  'underwild-adventure': { id: 'underwild-adventure', name: 'Underwild - Adventure', file: 'ui/underwild-adventure.mp3' }
};

function setupBackgroundMusic() {
  if (!game.backgroundMusic) {
    const track = musicTracks[game.currentTrackId];
    game.backgroundMusic = new Audio(track.file);
    game.backgroundMusic.loop = false;
    game.backgroundMusic.volume = 0;

    game.backgroundMusic.addEventListener('ended', handleMusicEnd);
  }
}

function stopMusicFade() {
  if (game.musicFadeFrame) cancelAnimationFrame(game.musicFadeFrame);
  game.musicFadeFrame = null;
}

export function updateMusicVolume() {
  stopMusicFade();
  if (game.backgroundMusic) {
    const actualVolume = (game.masterVolume / 100) * (game.musicVolume / 100);
    game.backgroundMusic.volume = actualVolume;
  }
}

// Eases the music to `toVolume` over `duration` ms, a step every frame.
function fadeMusic(toVolume, duration = 10000) {
  return new Promise((resolve) => {
    stopMusicFade();
    if (!game.backgroundMusic || Math.abs(game.backgroundMusic.volume - toVolume) < 0.01) {
      resolve();
      return;
    }
    const track = game.backgroundMusic;
    const startVolume = track.volume;
    const startTime = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - startTime) / duration);
      track.volume = Math.max(0, Math.min(1, startVolume + (toVolume - startVolume) * t));
      if (t >= 1 || track !== game.backgroundMusic) {
        game.musicFadeFrame = null;
        resolve();
        return;
      }
      game.musicFadeFrame = requestAnimationFrame(step);
    };
    game.musicFadeFrame = requestAnimationFrame(step);
  });
}

export function switchMusicTrack(trackId) {
  if (!musicTracks[trackId]) return;

  stopMusicFade();
  if (game.musicLoopTimeout) {
    clearTimeout(game.musicLoopTimeout);
    game.musicLoopTimeout = null;
  }
  if (game.backgroundMusic) {
    game.backgroundMusic.removeEventListener('ended', handleMusicEnd);
    game.backgroundMusic.pause();
    game.backgroundMusic = null;
  }
  game.isMusicPlaying = false;
  game.currentTrackId = trackId;
  prefs.set('underwild_musicTrack', trackId);
  setupBackgroundMusic();
  if (musicAllowed()) startBackgroundMusic(MUSIC_SWITCH_FADE_MS);
}

export function updateMusicTrackSelection() {
  const allTrackItems = document.querySelectorAll('.music-track-item');
  allTrackItems.forEach((item) => {
    item.classList.remove('selected');
  });

  const currentTrackItem = document.querySelector(`.music-track-item[data-track="${game.currentTrackId}"]`);
  if (currentTrackItem) {
    currentTrackItem.classList.add('selected');
  }
}

function handleMusicEnd() {
  if (!game.backgroundMusic) return;
  if (game.musicLoopTimeout) clearTimeout(game.musicLoopTimeout);
  game.backgroundMusic.volume = 0;
  game.musicLoopTimeout = setTimeout(() => {
    game.musicLoopTimeout = null;
    if (!game.isMusicPlaying || !game.backgroundMusic) return;
    game.backgroundMusic.currentTime = 0;
    game.backgroundMusic
      .play()
      .then(() => fadeMusic((game.masterVolume / 100) * (game.musicVolume / 100), 10000))
      .catch(() => {});
  }, 2000);
}

// Music plays while you're playing a world, and in menus (the title screen, the pause menu)
// only when "Music in Menus" is on.
function musicAllowed() {
  return (game.inWorld && !game.gamePaused) || game.menuMusic;
}

export function stopBackgroundMusic(fadeMs = 1000) {
  if (game.musicLoopTimeout) {
    clearTimeout(game.musicLoopTimeout);
    game.musicLoopTimeout = null;
  }
  if (!game.isMusicPlaying || !game.backgroundMusic) return;
  game.isMusicPlaying = false;
  const track = game.backgroundMusic;
  const pause = () => {
    if (!game.isMusicPlaying && game.backgroundMusic === track) track.pause();
  };
  fadeMusic(0, fadeMs).then(pause);
  // The fade runs on animation frames, which stop while the window is hidden: this makes
  // sure it still goes quiet.
  setTimeout(pause, fadeMs + 200);
}

// Call when entering or leaving a world (or pausing: see syncMusic); starts or stops the
// music to match. `fadeMs`: how long it takes to fade in.
export function setMusicContext(inWorld, fadeMs = inWorld ? 10000 : 3000) {
  game.inWorld = inWorld;
  if (musicAllowed()) startBackgroundMusic(fadeMs);
  else stopBackgroundMusic();
}

// After pausing or resuming: the pause menu counts as a menu.
export function syncMusic() {
  setMusicContext(game.inWorld, 1500);
}

export function setMenuMusic(on) {
  game.menuMusic = !!on;
  prefs.set('underwild_menuMusic', game.menuMusic);
  setMusicContext(game.inWorld);
}

export function startBackgroundMusic(fadeMs = 10000) {
  if (!musicAllowed()) return;
  if (!game.backgroundMusic) setupBackgroundMusic();
  if (game.isMusicPlaying) return;
  const track = game.backgroundMusic;
  game.isMusicPlaying = true;
  track.volume = 0;
  track
    .play()
    .then(() => {
      if (track !== game.backgroundMusic) return;
      fadeMusic((game.masterVolume / 100) * (game.musicVolume / 100), fadeMs);
    })
    .catch(() => {
      if (track === game.backgroundMusic) game.isMusicPlaying = false;
    });
}

export function loadAudioSettings() {
  const savedMasterVolume = prefs.get('underwild_masterVolume');
  const savedMusicVolume = prefs.get('underwild_musicVolume');
  const savedMusicTrack = prefs.get('underwild_musicTrack');
  const savedMenuMusic = prefs.get('underwild_menuMusic');

  if (savedMenuMusic !== null) game.menuMusic = savedMenuMusic === true || savedMenuMusic === 'true';
  document.querySelectorAll('[data-action^="menu-music-"]').forEach((b) => {
    if (b.dataset.action === (game.menuMusic ? 'menu-music-on' : 'menu-music-off')) b.dataset.selected = 'true';
    else b.removeAttribute('data-selected');
  });

  if (savedMasterVolume !== null) {
    game.masterVolume = parseInt(savedMasterVolume, 10);
    const masterSlider = document.getElementById('masterVolume');
    const masterValue = document.getElementById('masterVolumeValue');
    if (masterSlider) masterSlider.value = game.masterVolume;
    if (masterValue) masterValue.textContent = game.masterVolume;
  }

  if (savedMusicVolume !== null) {
    game.musicVolume = parseInt(savedMusicVolume, 10);
    const musicSlider = document.getElementById('musicVolume');
    const musicValue = document.getElementById('musicVolumeValue');
    if (musicSlider) musicSlider.value = game.musicVolume;
    if (musicValue) musicValue.textContent = game.musicVolume;
  }

  if (savedMusicTrack !== null && musicTracks[savedMusicTrack]) {
    game.currentTrackId = savedMusicTrack;
  } else if (!musicTracks[game.currentTrackId]) {
    const firstTrackId = Object.keys(musicTracks)[0];
    if (firstTrackId) {
      game.currentTrackId = firstTrackId;
    }
  }

  if (game.backgroundMusic) {
    updateMusicVolume();
  }
}
