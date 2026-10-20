// The weather: clear, rain, storm, snow or a snowstorm. One for the world (saved with it, and
// the host's in multiplayer). It eases in and out over several seconds, never jumping. `rain`
// is how hard it's raining (0..1), `storm` how stormy (0..1: stronger wind, darker sky,
// lightning) and `snow` how hard it's snowing (0..1). `snowCover` is how much snow lies on the ground (0..1):
// it builds up while it snows and melts away afterwards, faster in the rain.
// By default it changes on its own every so often; /weather sets it by hand (see `auto`).
// Drawn by renderer.js (drawWeather, drawSnowLayer); the wind reads `storm` (wind.js).

export const WEATHER_TYPES = {
  clear: { rain: 0, storm: 0, snow: 0 },
  rain: { rain: 0.6, storm: 0, snow: 0 },
  storm: { rain: 1, storm: 1, snow: 0 },
  snow: { rain: 0, storm: 0, snow: 0.8 },
  // Thick, wind-driven snow under a dark sky (stormy enough for the gale, not for lightning).
  snowstorm: { rain: 0, storm: 0.55, snow: 1 }
};

const EASE_SECONDS = 12; // how long a change takes to settle (about 63%)
const SNOW_BUILD_SECONDS = 150; // of steady snow for the ground to be fully covered
const SNOW_MELT_SECONDS = 240; // for a full covering to melt away when it's dry (rain melts it 4x faster)

// What the weather turns to when it changes on its own, with the chance of each: mostly fine
// spells with showers between, and now and then a storm or snow.
const NEXT_WEATHER = {
  clear: [
    ['rain', 0.6],
    ['storm', 0.2],
    ['snow', 0.2]
  ],
  rain: [
    ['clear', 0.6],
    ['storm', 0.4]
  ],
  storm: [
    ['rain', 0.7],
    ['clear', 0.3]
  ],
  snow: [
    ['clear', 0.65],
    ['snowstorm', 0.2],
    ['rain', 0.15]
  ],
  snowstorm: [
    ['snow', 0.7],
    ['clear', 0.3]
  ]
};
// How long each lasts (game seconds): at least the first, plus up to the second.
const SPELL_SECONDS = { clear: [300, 600], rain: [150, 300], storm: [80, 120], snow: [200, 300], snowstorm: [80, 120] };

export const weather = {
  type: 'clear', // what it is heading for
  rain: 0, // how it is right now
  storm: 0,
  snow: 0,
  snowCover: 0,
  auto: true, // changes on its own
  flash: 0, // lightning brightness (0..1), fading
  untilChange: 150, // game seconds until the next change (when auto)
  untilFlash: 10,

  // Heads for a type. `snap`: arrive at once (loading a world).
  set(type, snap = false) {
    if (!WEATHER_TYPES[type]) return false;
    this.type = type;
    if (snap) {
      this.rain = WEATHER_TYPES[type].rain;
      this.storm = WEATHER_TYPES[type].storm;
      this.snow = WEATHER_TYPES[type].snow;
    }
    return true;
  },

  reset() {
    this.set('clear', true);
    this.snowCover = 0;
    this.auto = true;
    this.flash = 0;
    this.untilChange = 120 + Math.random() * 300;
  },

  // Advance by dt game seconds; called every game tick.
  tick(dt) {
    const goal = WEATHER_TYPES[this.type];
    const k = 1 - Math.exp(-dt / EASE_SECONDS);
    this.rain += (goal.rain - this.rain) * k;
    this.storm += (goal.storm - this.storm) * k;
    this.snow += (goal.snow - this.snow) * k;
    if (Math.abs(goal.rain - this.rain) < 0.005) this.rain = goal.rain;
    if (Math.abs(goal.storm - this.storm) < 0.005) this.storm = goal.storm;
    if (Math.abs(goal.snow - this.snow) < 0.005) this.snow = goal.snow;

    if (this.snow > 0.05) this.snowCover = Math.min(1, this.snowCover + (dt * this.snow) / (WEATHER_TYPES.snow.snow * SNOW_BUILD_SECONDS));
    else this.snowCover = Math.max(0, this.snowCover - (dt * (1 + 3 * this.rain)) / SNOW_MELT_SECONDS);

    if (this.auto) {
      this.untilChange -= dt;
      if (this.untilChange <= 0) {
        let r = Math.random();
        const [next] = NEXT_WEATHER[this.type].find(([, chance]) => (r -= chance) < 0) || NEXT_WEATHER[this.type][0];
        const [least, more] = SPELL_SECONDS[next];
        this.type = next;
        this.untilChange = least + Math.random() * more;
      }
    }

    // Lightning in a proper storm: a flash, often followed by a weaker second one.
    this.flash = Math.max(0, this.flash - dt * 2.2);
    if (this.storm > 0.6) {
      this.untilFlash -= dt;
      if (this.untilFlash <= 0) {
        this.flash = 1;
        this.untilFlash = Math.random() < 0.4 ? 0.25 + Math.random() * 0.2 : 6 + Math.random() * 16;
      }
    }
  }
};
