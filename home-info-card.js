// home-info-card
//
// The dashboard hero: date, time, an optional status line, current conditions
// and a multi-day forecast band — composed as one card so the typography and
// spacing can be ours rather than assembled from several cards fighting each
// other.
//
// Registered as a Lovelace resource (Settings -> Dashboards -> Resources), not
// via frontend.extra_module_url. extra_module_url modules load in parallel with
// the app, so a dashboard can finish building before the element registers and
// HA then shows a permanent "Configuration error". Lovelace awaits its
// resources before rendering, which is the only thing that makes a custom card
// reliable on a tablet that reloads unattended.
//
// Note on forecasts: Home Assistant removed `forecast` from weather entity
// attributes in 2024.4. The forecast now arrives over a websocket
// subscription, which is why this card manages a subscription lifecycle
// instead of just reading state.
//
// ---------------------------------------------------------------------------
// Motion budget
//
// This runs 24/7 on a wall tablet, so every animation here is transform- or
// opacity-only (GPU-composited, never triggering layout or paint), uses a
// handful of nodes rather than a particle system, and is fully suspended when
// the tab is hidden — a tablet with its screen off animates nothing. Motion is
// also disabled outright under prefers-reduced-motion, or via `animate: false`.
//
// Three condition-driven layers:
//   A  tint      the corner wash takes its hue from the condition and
//                cross-fades when the condition changes (idle otherwise)
//   B  icon      the current-condition glyph animates in place
//   C  backdrop  an oversized glyph drifting behind the clock at low opacity
// ---------------------------------------------------------------------------
//
// Config (full reference: home-info-card.md, beside this file):
//   type:          custom:home-info-card   (required)
//   entity:        weather.*               (required)
//   greeting_entity: sensor.*              (optional) takes over the greeting
//                  line when it has a state, for a sensor that has something
//                  more urgent to say than "Good evening". Hidden entirely when
//                  unset, which keeps the slot reserved without a placeholder.
//   greeting:      bool, default true — personal greeting on the status line
//   greeting_exclude: a name or a list of names, default none — matched
//                  case-insensitively as a substring; these logins get the
//                  greeting with no name
//   forecast_days: integer, default 3
//   animate:       bool, default true — false gives a completely static card
//   text:          the card's own words, for translating or rewording. Any
//                  subset; the rest keep their defaults.
//
//                      text:
//                        today:    Today       null -> the browser's word
//                        tomorrow: Tomorrow    null -> the browser's word
//                        degree:   °           the forecast band's short unit
//                        greeting:
//                          morning:   Good morning
//                          afternoon: Good afternoon
//                          evening:   Good evening
//                          night:     Good night
//                        conditions:           any of the 15 weather states
//                          pouring: Heavy rain
//                          snowy-rainy: Sleet
//
//                  Only the greeting and the degree sign have real defaults.
//                  today/tomorrow come from Intl, and every condition comes
//                  from Home Assistant's own weather translations, so the card
//                  speaks the viewer's language untouched. Set a condition here
//                  to override it - HA says "Snowy, rainy" where you may prefer
//                  "Sleet".
//
//                  Weekday names, the date and the headline temperature unit
//                  are not in here either, for the same reason.

// Glyphs are emitted as labelled <g> groups so CSS can animate the parts
// independently (rays spin, cloud drifts, drops fall) without re-rendering.
const GLYPHS = {
  "clear-night": '<g class="p-moon"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></g>',
  sunny:
    '<g class="p-rays"><path d="M12 2.5v2.2M12 19.3v2.2M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.9 19.1l1.6-1.6M17.5 6.5l1.6-1.6"/></g>' +
    '<g class="p-disc"><circle cx="12" cy="12" r="4.2"/></g>',
  partlycloudy:
    '<g class="p-rays sm"><path d="M9 2.8v1.6M4.4 4.4l1.1 1.1M2.8 9h1.6M4.4 13.6l1.1-1.1"/></g>' +
    '<g class="p-disc sm"><circle cx="9" cy="8.5" r="3.2"/></g>' +
    '<g class="p-cloud"><path d="M17.5 19.5H8.8a3.8 3.8 0 1 1 .9-7.5 5 5 0 0 1 9.4 1.6 3 3 0 0 1-1.6 5.9Z"/></g>',
  cloudy:
    '<g class="p-cloud"><path d="M17.5 18H8.8a3.8 3.8 0 1 1 .9-7.5 5 5 0 0 1 9.4 1.6 3 3 0 0 1-1.6 5.9Z"/></g>',
  rainy:
    '<g class="p-cloud"><path d="M17.5 15H8.8a3.8 3.8 0 1 1 .9-7.5 5 5 0 0 1 9.4 1.6 3 3 0 0 1-1.6 5.9Z"/></g>' +
    '<g class="p-drops"><path d="M9 18.5 8 21"/><path d="M13 18.5 12 21"/><path d="M17 18.5 16 21"/></g>',
  pouring:
    '<g class="p-cloud"><path d="M17.5 14H8.8a3.8 3.8 0 1 1 .9-7.5 5 5 0 0 1 9.4 1.6 3 3 0 0 1-1.6 5.9Z"/></g>' +
    '<g class="p-drops"><path d="M8 17v4"/><path d="M12 17v4"/><path d="M16 17v4"/></g>',
  snowy:
    '<g class="p-cloud"><path d="M17.5 14H8.8a3.8 3.8 0 1 1 .9-7.5 5 5 0 0 1 9.4 1.6 3 3 0 0 1-1.6 5.9Z"/></g>' +
    '<g class="p-flakes"><path d="M9 18h.01"/><path d="M13 18h.01"/><path d="M17 18h.01"/><path d="M11 21h.01"/><path d="M15 21h.01"/></g>',
  fog:
    '<g class="p-cloud"><path d="M17.5 12H8.8a3.8 3.8 0 1 1 .9-7.5 5 5 0 0 1 9.4 1.6 3 3 0 0 1-1.6 5.9Z"/></g>' +
    '<g class="p-fog"><path d="M4 16h16"/><path d="M6 20h12"/></g>',
  lightning:
    '<g class="p-cloud"><path d="M17.5 13H8.8a3.8 3.8 0 1 1 .9-7.5 5 5 0 0 1 9.4 1.6 3 3 0 0 1-1.6 5.9Z"/></g>' +
    '<g class="p-bolt"><path d="m13 15-3 4h4l-3 4"/></g>',
  windy: '<g class="p-wind"><path d="M3 9h11a3 3 0 1 0-3-3"/><path d="M3 14h15a3 3 0 1 1-3 3"/></g>',
  hail:
    '<g class="p-cloud"><path d="M17.5 14H8.8a3.8 3.8 0 1 1 .9-7.5 5 5 0 0 1 9.4 1.6 3 3 0 0 1-1.6 5.9Z"/></g>' +
    '<g class="p-flakes"><path d="M9 18h.01"/><path d="M13 18h.01"/><path d="M17 18h.01"/></g>',
  exceptional:
    '<g class="p-alert"><circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/></g>',
};

const ALIASES = {
  "snowy-rainy": "snowy",
  "lightning-rainy": "lightning",
  "windy-variant": "windy",
  "partlycloudy-night": "partlycloudy",
};

const DEFAULTS = {
  forecast_days: 3,
  animate: true,
  greeting: true,
  greeting_exclude: [],
  greeting_entity: null,
};

// Every string the card writes itself.
//
// `null` means "ask somebody who already knows", and most of this block is
// null: Home Assistant translates every weather condition, and the browser
// knows what today and tomorrow are called. Shipping an English word for
// either would make the card English-only for no gain.
//
// A value set here wins over both, which is the point of the keys still being
// listed: they are the vocabulary that can be overridden, and mergeText
// validates against them. Dropping them to an empty object would have rejected
// every override, which is the trap in this approach.
//
// Greetings have no null form. Home Assistant has no greeting vocabulary to
// ask - there is nothing behind these but the words themselves.
const DEFAULT_TEXT = {
  today: null, // Intl.RelativeTimeFormat, capitalised
  tomorrow: null,
  // The band is a compact row of five columns; the full unit from the weather
  // entity is used for the headline figure, but would not fit here.
  degree: "°",
  greeting: {
    morning: "Good morning",
    afternoon: "Good afternoon",
    evening: "Good evening",
    night: "Good night",
  },
  // component.weather.entity_component._.state.<condition>
  conditions: {
    "clear-night": null,
    sunny: null,
    partlycloudy: null,
    cloudy: null,
    rainy: null,
    pouring: null,
    snowy: null,
    "snowy-rainy": null,
    fog: null,
    lightning: null,
    "lightning-rainy": null,
    windy: null,
    "windy-variant": null,
    hail: null,
    exceptional: null,
  },
};

const WEATHER_STATE_KEY = "component.weather.entity_component._.state.";

/* An override, else Home Assistant's translation, else the raw value.
 *
 * hass.localize returns "" for a key it does not have rather than throwing, so
 * the truthiness check is the miss path, not an error path. */
function localized(hass, key, override, fallback) {
  if (override != null) return override;
  if (hass && typeof hass.localize === "function") {
    const s = hass.localize(key);
    if (s) return s;
  }
  return fallback;
}

/* "Today" / "Tomorrow" in the viewer's language, without shipping either.
 *
 * Intl gives them lowercase - "today", "vandaag" - because it is built for use
 * inside a sentence, and this is a column heading. Capitalising the first
 * character is right for the languages that capitalise at all and harmless for
 * the ones that do not, since they have no uppercase form to get wrong. */
/* The forecast is built as markup, and the condition names in it come from
 * translations, the card's text and the weather integration. */
function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])
  );
}

/* Formatters, built once and kept.
 *
 * Loading a locale's date data costs about a millisecond on a wall tablet's
 * CPU. The clock built two of them on every hass update - eleven times a
 * second in a house with a per-second electricity meter - and the forecast
 * built one per day drawn. Measured together on a wall tablet they
 * were 7% of the main thread, to render a clock that changes once a minute.
 *
 * A built formatter is immutable, so there is nothing here to invalidate. The
 * key carries whatever distinguishes one from another. */
const FORMATTERS = new Map();

function formatter(key, make) {
  let f = FORMATTERS.get(key);
  if (f === undefined) FORMATTERS.set(key, (f = make()));
  return f;
}

function dateFormat(key, locale, options) {
  return formatter(`${key}|${locale}`, () => new Intl.DateTimeFormat(locale, options));
}

function relativeDay(locale, offset, fallback) {
  try {
    /* null when this engine has no RelativeTimeFormat or will not take the
     * locale, cached as null so a failure is not retried on every frame. */
    const fmt = formatter(`rel|${locale}`, () => {
      try {
        return new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
      } catch (err) {
        return null;
      }
    });
    const s = fmt && fmt.format(offset, "day");
    if (s) return s.charAt(0).toUpperCase() + s.slice(1);
  } catch (err) {
    /* A locale it took but cannot format this offset in. */
  }
  return fallback;
}

/* One name is as likely as a list - `greeting_exclude: tablet` is how YAML
 * reads naturally - so both are taken. Kept lowercase for matching, and empty
 * names are dropped: every login contains "", so one would exclude everybody. */
function excludeList(given) {
  if (given == null) return [];
  const list = Array.isArray(given) ? given : [given];
  if (!list.every((n) => typeof n === "string" || typeof n === "number")) {
    throw new Error(
      "home-info-card: greeting_exclude is a name or a list of names, not " +
        `${JSON.stringify(given)}.`
    );
  }
  return list.map((n) => String(n).trim().toLowerCase()).filter(Boolean);
}

/* Merge the user's subset over the defaults, one level of nesting deep, and
 * reject anything that is not a real key - a typo that silently renders the
 * English default is worse than a card that says what is wrong. */
function mergeText(base, given, path) {
  const out = { ...base };
  for (const key of Object.keys(given || {})) {
    if (!(key in base)) {
      throw new Error(
        `home-info-card: unknown key "${key}" in ${path}. ` +
          `Valid keys: ${Object.keys(base).join(", ")}.`
      );
    }
    const b = base[key];
    const o = given[key];
    if (b && typeof b === "object" && !Array.isArray(b)) {
      /* `conditions:` with nothing under it is an emptied-out block, not a
       * request to erase every condition label. */
      if (o != null) out[key] = mergeText(b, o, `${path}.${key}`);
    } else {
      out[key] = o;
    }
  }
  return out;
}

const SUNNY_CONDITIONS = new Set(["sunny", "partlycloudy", "clear-night"]);

function normalise(condition) {
  const c = ALIASES[condition] || condition;
  return GLYPHS[c] ? c : "cloudy";
}

function icon(condition) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"
     >${GLYPHS[normalise(condition)]}</svg>`;
}

// ---------------------------------------------------------------------------
// Ambient background scenes
//
// One scene per condition, built from a handful of absolutely-positioned
// elements that only ever animate transform/opacity. Each drifting element
// sits in a full-width track, so translateX(-30% -> 130%) carries it right
// across the card regardless of how wide the column is.
//
// Element budget is deliberately small (3-9 nodes); this is ambience, not a
// particle system, and it runs on a wall tablet all day.
// ---------------------------------------------------------------------------
const CLOUD_SVG =
  '<svg viewBox="0 0 64 40" fill="currentColor" aria-hidden="true">' +
  '<path d="M50 38H16A12 12 0 0 1 14 14.2 17 17 0 0 1 46 8a10 10 0 0 1 4 30Z"/></svg>';

const SUN_SVG =
  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" ' +
  'stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.6"/>' +
  '<path d="M12 1.6v3M12 19.4v3M3.6 3.6l2.1 2.1M18.3 18.3l2.1 2.1M1.6 12h3M19.4 12h3' +
  'M3.6 20.4l2.1-2.1M18.3 5.7l2.1-2.1"/></svg>';

const MOON_SVG =
  '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
  '<path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z"/></svg>';

const cloud = (cls, top, size, dur, delay, op) =>
  `<span class="cl ${cls}" style="top:${top}%;--sz:${size}px;` +
  `animation-duration:${dur}s;animation-delay:-${delay}s;opacity:${op}">${CLOUD_SVG}</span>`;

const drop = (left, dur, delay) =>
  `<i class="rn" style="left:${left}%;animation-duration:${dur}s;animation-delay:-${delay}s"></i>`;

const flake = (left, dur, delay, size) =>
  `<i class="sf" style="left:${left}%;--sz:${size}px;` +
  `animation-duration:${dur}s;animation-delay:-${delay}s"></i>`;

function scene(condition) {
  switch (condition) {
    case "sunny":
      return `<span class="sun">${SUN_SVG}</span>` + cloud("s1", 62, 90, 190, 40, 0.35);

    case "clear-night":
      return `<span class="sun moon">${MOON_SVG}</span>` +
        '<i class="st" style="left:22%;top:26%;animation-delay:-1s"></i>' +
        '<i class="st" style="left:38%;top:14%;animation-delay:-3s"></i>' +
        '<i class="st" style="left:57%;top:32%;animation-delay:-5s"></i>';

    case "partlycloudy":
      return `<span class="sun">${SUN_SVG}</span>` +
        cloud("s1", 30, 108, 120, 0, 0.75) +
        cloud("s2", 58, 78, 165, 60, 0.5);

    case "cloudy":
      return cloud("s1", 16, 130, 150, 0, 0.9) +
        cloud("s2", 42, 96, 195, 70, 0.65) +
        cloud("s3", 66, 74, 240, 130, 0.45);

    case "fog":
      return '<i class="fg" style="top:34%;animation-duration:120s;animation-delay:0s"></i>' +
        '<i class="fg" style="top:52%;animation-duration:160s;animation-delay:-40s"></i>' +
        '<i class="fg" style="top:70%;animation-duration:200s;animation-delay:-90s"></i>';

    case "rainy":
    case "pouring": {
      const heavy = condition === "pouring";
      const n = heavy ? 9 : 6;
      let out = cloud("s1", 10, 120, 170, 0, 0.85) + cloud("s2", 34, 88, 220, 80, 0.55);
      for (let i = 0; i < n; i++) {
        out += drop(8 + i * (84 / n), heavy ? 0.9 : 1.5, i * 0.35);
      }
      return out;
    }

    case "snowy":
    case "hail": {
      let out = cloud("s1", 8, 118, 200, 0, 0.8);
      const sizes = [4, 3, 5, 3, 4, 3, 5, 4];
      for (let i = 0; i < sizes.length; i++) {
        out += flake(6 + i * 11.5, 9 + (i % 4) * 2.5, i * 1.7, sizes[i]);
      }
      return out;
    }

    case "lightning":
      return cloud("s1", 14, 126, 160, 0, 0.9) +
        cloud("s2", 40, 92, 210, 70, 0.6) +
        '<i class="fl"></i>';

    case "windy":
      return '<i class="wd" style="top:32%;width:46%;animation-duration:7s;animation-delay:0s"></i>' +
        '<i class="wd" style="top:50%;width:62%;animation-duration:9s;animation-delay:-2s"></i>' +
        '<i class="wd" style="top:68%;width:38%;animation-duration:6s;animation-delay:-4s"></i>';

    default:
      return cloud("s1", 22, 120, 180, 0, 0.8) + cloud("s2", 52, 88, 230, 90, 0.5);
  }
}

class HomeInfoCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._forecast = [];
    this._unsub = null;
    this._timer = null;
    this._built = false;
    this._condition = null;
    this._onVisibility = () => this._applyVisibility();
  }

  setConfig(config) {
    if (!config || !config.entity) {
      throw new Error("home-info-card: `entity` is required (a weather.* entity)");
    }
    if (!config.entity.startsWith("weather.")) {
      throw new Error(`home-info-card: \`entity\` must be a weather entity, got ${config.entity}`);
    }
    const previousEntity = this._config && this._config.entity;
    this._config = { ...DEFAULTS, ...config };
    this._config.text = mergeText(DEFAULT_TEXT, config.text, "text");
    this._config.greeting_exclude = excludeList(config.greeting_exclude);
    /* The forecast's signature describes what was drawn from the old config,
     * so it says nothing about this one. Dropped rather than extended: every
     * word on those three rows is configurable, and a signature listing all
     * of them would be one `text` key away from being wrong again. */
    this._fcSig = null;
    if (previousEntity && previousEntity !== this._config.entity) {
      this._resubscribe();
    }
  }

  set hass(hass) {
    const first = !this._hass;
    this._hass = hass;
    // hass can be assigned before setConfig on some code paths; rendering is
    // skipped until both are present rather than throwing.
    if (!this._config) return;
    if (!this._built) this._build();
    this._render();
    if (first) this._resubscribe();
  }

  getCardSize() {
    return 6;
  }

  getGridOptions() {
    return { columns: "full", rows: "auto", min_columns: 6 };
  }

  connectedCallback() {
    // The clock only needs to be correct to the minute; ticking every 15s
    // keeps it honest without re-rendering constantly.
    this._timer = window.setInterval(() => this._renderClock(), 15000);
    document.addEventListener("visibilitychange", this._onVisibility);
    this._applyVisibility();
    if (this._hass) this._resubscribe();
  }

  disconnectedCallback() {
    if (this._timer) window.clearInterval(this._timer);
    this._timer = null;
    document.removeEventListener("visibilitychange", this._onVisibility);
    this._unsubscribe();
  }

  // Suspends every animation while the tab/screen is not visible. This is the
  // part that actually protects a wall tablet's battery.
  _applyVisibility() {
    if (!this._els) return;
    this._els.card.classList.toggle("paused", document.hidden);
  }

  _unsubscribe() {
    /* Moving the generation on is what cancels a subscribe that has not come
     * back yet: there is no handle to call, so the resolution has to be told
     * it is no longer wanted. _resubscribe takes its own generation after
     * calling this, so it is unaffected. */
    this._subGen = (this._subGen || 0) + 1;
    if (this._unsub) {
      try { this._unsub(); } catch (e) { /* connection already gone */ }
      this._unsub = null;
    }
  }

  async _resubscribe() {
    this._unsubscribe();
    if (!this._hass || !this._config || !this.isConnected) return;
    /* The subscribe resolves a round trip later. Until it does, _unsub is
     * null and _unsubscribe has nothing to cancel - so a card destroyed
     * inside that window leaves a live subscription that nothing will ever
     * release, whose callback closes over `this` and therefore keeps the
     * detached card, its shadow DOM and its stylesheet alive for the life of
     * the page. It also goes on calling _renderForecast on DOM nobody can
     * see. The generation says whether the resolution still belongs to us. */
    const gen = (this._subGen = (this._subGen || 0) + 1);
    try {
      const off = await this._hass.connection.subscribeMessage(
        (msg) => {
          this._forecast = (msg && msg.forecast) || [];
          this._renderForecast();
        },
        {
          type: "weather/subscribe_forecast",
          entity_id: this._config.entity,
          forecast_type: "daily",
        }
      );
      if (gen !== this._subGen || !this.isConnected) {
        off();
        return;
      }
      this._unsub = off;
    } catch (err) {
      // Entity may not support daily forecasts; the band simply stays empty
      // rather than the whole card failing.
      this._forecast = [];
      this._renderForecast();
    }
  }

  _locale() {
    return (this._hass && this._hass.locale && this._hass.locale.language) || "en-GB";
  }

  _use24h() {
    const fmt = this._hass && this._hass.locale && this._hass.locale.time_format;
    if (fmt === "12") return false;
    if (fmt === "24") return true;
    return true;
  }

  _build() {
    this.shadowRoot.innerHTML = `
      <style>
        /* Stated rather than inherited: on a Lovelace view a card picks 1.6
           up from the page, and anywhere else it falls back to normal and
           the same card sets differently. */
        :host { display: block; line-height: var(--ha-line-height-normal, 1.6); }
        ha-card {
          padding: 18px 20px;
          display: flex;
          flex-direction: column;
          gap: 14px;
          height: 100%;
          box-sizing: border-box;
          position: relative;
          overflow: hidden;

          /* (A) condition tint — overridden per condition below */
          --tint: 216, 162, 78;
          --tint-alpha: 0.10;
        }

        /* ---------- (A) condition-driven wash ---------- */
        /* Animates only when the condition actually changes; idle otherwise. */
        ha-card::before {
          content: "";
          position: absolute;
          inset: 0 0 auto 0;
          height: 62%;
          background: radial-gradient(460px 240px at 88% -25%,
                      rgba(var(--tint), var(--tint-alpha)), transparent 70%);
          pointer-events: none;
          transition: background 900ms ease;
        }
        ha-card[data-cond="sunny"]        { --tint: 216, 162, 78;  --tint-alpha: .14; }
        ha-card[data-cond="partlycloudy"] { --tint: 216, 162, 78;  --tint-alpha: .10; }
        ha-card[data-cond="clear-night"]  { --tint: 122, 134, 204; --tint-alpha: .10; }
        ha-card[data-cond="cloudy"]       { --tint: 160, 160, 163; --tint-alpha: .09; }
        ha-card[data-cond="fog"]          { --tint: 160, 160, 163; --tint-alpha: .12; }
        ha-card[data-cond="rainy"]        { --tint: 95, 158, 222;  --tint-alpha: .12; }
        ha-card[data-cond="pouring"]      { --tint: 95, 158, 222;  --tint-alpha: .16; }
        ha-card[data-cond="snowy"]        { --tint: 190, 214, 236; --tint-alpha: .13; }
        ha-card[data-cond="hail"]         { --tint: 190, 214, 236; --tint-alpha: .13; }
        ha-card[data-cond="lightning"]    { --tint: 169, 143, 208; --tint-alpha: .15; }
        ha-card[data-cond="windy"]        { --tint: 79, 176, 163;  --tint-alpha: .10; }

        /* ---------- (C) ambient condition scene ---------- */
        /* Every element below animates transform or opacity only, so the
           whole layer stays on the compositor and never triggers layout. */
        /* Scoped to the clock + current-conditions block only: the forecast
           is a comparison table and weather drifting behind it competes with
           the rows. Bleeds out by the card padding so it still reaches the
           top and side edges. */
        .scene {
          position: absolute;
          top: -18px;
          left: -20px;
          right: -20px;
          bottom: 0;
          z-index: 0;
          overflow: hidden;
          pointer-events: none;
          color: rgb(var(--tint));
          opacity: .085;
          border-top-left-radius: inherit;
          border-top-right-radius: inherit;
        }

        /* Drifting clouds. Each sits in a full-width track, so translateX
           carries it across whatever width the column happens to be. */
        .scene .cl {
          position: absolute;
          left: 0;
          width: 100%;
          animation-name: cross;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
          will-change: transform;
        }
        .scene .cl svg { width: var(--sz, 100px); height: auto; display: block; }
        @keyframes cross {
          from { transform: translate3d(-32%, 0, 0); }
          to   { transform: translate3d(126%, 0, 0); }
        }

        /* Sun / moon pinned in the corner. */
        .scene .sun {
          position: absolute;
          top: -22px; right: -20px;
          width: 132px; height: 132px;
          animation: spin 150s linear infinite;
          transform-origin: 50% 50%;
        }
        .scene .sun svg { width: 100%; height: 100%; }
        .scene .sun.moon { animation: breathe 14s ease-in-out infinite; }

        /* Rain streaks. */
        .scene .rn {
          position: absolute;
          top: -12%;
          width: 1.6px; height: 16%;
          background: currentColor;
          border-radius: 2px;
          animation-name: rainfall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @keyframes rainfall {
          from { transform: translate3d(0, -20%, 0); opacity: 0; }
          15%  { opacity: 1; }
          85%  { opacity: 1; }
          to   { transform: translate3d(-8px, 620%, 0); opacity: 0; }
        }

        /* Snowflakes drifting top to bottom. */
        .scene .sf {
          position: absolute;
          top: -8%;
          width: var(--sz, 4px); height: var(--sz, 4px);
          background: currentColor;
          border-radius: 50%;
          animation-name: snowfall;
          animation-timing-function: linear;
          animation-iteration-count: infinite;
        }
        @keyframes snowfall {
          from { transform: translate3d(0, 0, 0); opacity: 0; }
          12%  { opacity: 1; }
          50%  { transform: translate3d(14px, 220%, 0); }
          88%  { opacity: 1; }
          to   { transform: translate3d(-6px, 460%, 0); opacity: 0; }
        }

        /* Fog bands. */
        .scene .fg {
          position: absolute;
          left: 0; width: 60%; height: 10px;
          background: linear-gradient(90deg, transparent, currentColor, transparent);
          border-radius: 6px;
          animation-name: cross;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }

        /* Wind streaks. */
        .scene .wd {
          position: absolute;
          left: 0; height: 2px;
          background: linear-gradient(90deg, transparent, currentColor);
          border-radius: 2px;
          animation-name: gustby;
          animation-timing-function: ease-in-out;
          animation-iteration-count: infinite;
        }
        @keyframes gustby {
          from { transform: translate3d(-60%, 0, 0); opacity: 0; }
          40%  { opacity: 1; }
          to   { transform: translate3d(150%, 0, 0); opacity: 0; }
        }

        /* Lightning flash across the whole scene. */
        .scene .fl {
          position: absolute;
          inset: 0;
          background: radial-gradient(120% 80% at 60% 0%, currentColor, transparent 60%);
          opacity: 0;
          animation: strike 9s steps(1, end) infinite;
        }
        @keyframes strike {
          0%, 82%  { opacity: 0; }
          83%      { opacity: .9; }
          85%      { opacity: 0; }
          87%      { opacity: .7; }
          89%, 100%{ opacity: 0; }
        }

        /* Night stars. */
        .scene .st {
          position: absolute;
          width: 3px; height: 3px;
          background: currentColor;
          border-radius: 50%;
          animation: twinkle 5s ease-in-out infinite;
        }
        @keyframes twinkle { 0%,100% { opacity: .25; } 50% { opacity: 1; } }
        @keyframes breathe { 0%,100% { transform: scale(1); } 50% { transform: scale(1.05); } }

        .now {
          position: relative;
          isolation: isolate;
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 28px;
          flex-wrap: wrap;
        }
        .left { position: relative; z-index: 1; }
        .date {
          font-size: var(--ha-font-size-s, 12px);
          letter-spacing: .04em;
          color: var(--secondary-text-color);
          margin-bottom: 2px;
        }
        .time {
          font-weight: 300;
          font-size: clamp(40px, 4.6vw, 62px);
          line-height: .96;
          color: var(--primary-text-color);
          font-variant-numeric: tabular-nums;
        }
        .status {
          font-weight: 500;
          font-size: var(--ha-font-size-2xl, 20px);
          color: var(--primary-color);
          margin-top: 10px;
        }
        .status[hidden] { display: none; }
        .current {
          text-align: right;
          display: flex;
          flex-direction: column;
          align-items: flex-end;
          gap: 6px;
          position: relative;
          z-index: 1;
        }
        .current .temp {
          font-weight: 300;
          font-size: var(--ha-font-size-3xl, 34px);
          line-height: 1;
          color: var(--primary-text-color);
          font-variant-numeric: tabular-nums;
        }
        .current .cond { color: var(--secondary-text-color); font-size: var(--ha-font-size-m, 13px); }
        .current .ic svg { width: 40px; height: 40px; color: var(--primary-color); }

        /* ---------- (B) animated condition glyph ---------- */
        .p-rays    { transform-origin: 12px 12px; animation: spin 60s linear infinite; }
        .p-rays.sm { transform-origin: 9px 8.5px; }
        .p-disc    { transform-origin: 12px 12px; animation: pulse 7s ease-in-out infinite; }
        .p-disc.sm { transform-origin: 9px 8.5px; }
        .p-cloud   { animation: nudge 9s ease-in-out infinite; }
        .p-drops   { animation: fall 1.5s linear infinite; }
        .p-flakes  { animation: flutter 3.4s ease-in-out infinite; }
        .p-fog     { animation: nudge 6s ease-in-out infinite; }
        .p-bolt    { animation: flash 6s steps(1, end) infinite; }
        .p-wind    { animation: gust 5s ease-in-out infinite; }
        .p-moon    { transform-origin: 12px 12px; animation: pulse 9s ease-in-out infinite; }

        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes pulse   { 0%,100% { transform: scale(1); } 50% { transform: scale(1.06); } }
        @keyframes nudge   { 0%,100% { transform: translateX(0); } 50% { transform: translateX(1.4px); } }
        @keyframes fall    { 0%   { transform: translateY(-2px); opacity: 0; }
                             30%  { opacity: 1; }
                             100% { transform: translateY(3px); opacity: 0; } }
        @keyframes flutter { 0%,100% { transform: translate(0,0); opacity: .55; }
                             50% { transform: translate(.8px, 1.5px); opacity: 1; } }
        @keyframes flash   { 0%, 88% { opacity: 1; } 90% { opacity: .25; } 92% { opacity: 1; }
                             94% { opacity: .3; } 96%, 100% { opacity: 1; } }
        @keyframes gust    { 0%,100% { transform: translateX(0); } 50% { transform: translateX(1.8px); } }

        /* Suspend everything when the screen/tab is not visible, and honour
           the OS reduced-motion preference. */
        ha-card.paused .scene *,
        ha-card.paused .current .ic g { animation-play-state: paused; }
        ha-card.static .scene *,
        ha-card.static .current .ic g { animation: none; }
        ha-card.static .scene { opacity: .05; }
        @media (prefers-reduced-motion: reduce) {
          .scene * , .current .ic g { animation: none !important; }
          ha-card::before { transition: none; }
        }

        .forecast {
          position: relative;
          display: flex;
          flex-direction: column;
          gap: 2px;
          padding-top: 12px;
          border-top: 1px solid var(--divider-color);
        }
        /* One row per day, all bars sharing a single scale, so the days are
           comparable at a glance: name | icon | low | range bar | high.
           Fixed name column: 'auto' let TOMORROW widen row 2 and knocked the
           icon, low and bar out of alignment with the other rows. */
        .day {
          display: grid;
          grid-template-columns: 88px 24px 34px 1fr 34px;
          align-items: center;
          gap: 10px;
          padding: 4px 0;
        }
        .day + .day { border-top: 1px solid var(--divider-color); }
        .day .name {
          font-size: var(--ha-font-size-xs, 11px);
          font-weight: 500;
          letter-spacing: .07em;
          text-transform: uppercase;
          color: var(--secondary-text-color);
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .day svg { width: 22px; height: 22px; color: var(--secondary-text-color); }
        .day.warm svg { color: var(--primary-color); }
        /* Forecast glyphs stay still — three animating icons in a row reads as
           noise, and that row is a comparison, not a live reading. */
        .day svg g { animation: none !important; }
        .lo, .hi {
          font-size: var(--ha-font-size-l, 16px);
          font-variant-numeric: tabular-nums;
          font-weight: 400;
        }
        /* Both temperatures share the same weight: they are two readings of
           equal standing, and dimming the low made it look like secondary
           information rather than half of a range. The day name stays grey as
           the label; the gradient bar carries the emphasis. */
        .lo, .hi { color: var(--primary-text-color); text-align: right; }
        .track {
          height: 4px;
          border-radius: 3px;
          background: var(--divider-color);
          position: relative;
          min-width: 40px;
        }
        .track i {
          position: absolute; height: 4px; border-radius: 3px;
          background: linear-gradient(90deg, #5f9ede, #d8a24e);
        }
        .empty { color: var(--secondary-text-color); font-size: var(--ha-font-size-m, 13px); padding-top: 4px; }

        /* Narrow: keep the day rows but drop the fixed name column so the
           range bar keeps usable width instead of overflowing. */
        @media (max-width: 560px) {
          /* Keep the clock and current conditions on one row. Stacking them
             was the old behaviour and it pushed the forecast far down the
             phone view; the two blocks fit side by side at 360px+ once the
             left block is allowed to shrink and wrap. */
          .now { gap: 12px; align-items: flex-start; flex-wrap: nowrap; }
          .left { min-width: 0; flex: 1 1 auto; }
          .current { flex: 0 0 auto; text-align: right; align-items: flex-end; }
          .status { font-size: var(--ha-font-size-l, 16px); margin-top: 6px; }
          .current .ic svg { width: 32px; height: 32px; }
          .day {
            grid-template-columns: 66px 20px 28px 1fr 28px;
            gap: 8px;
          }
          .day .name { letter-spacing: .04em; }
          .scene { opacity: .06; }
          .scene .sun { width: 96px; height: 96px; }
        }
      </style>
      <ha-card>
        <div class="now">
          <div class="scene" aria-hidden="true"></div>
          <div class="left">
            <div class="date"></div>
            <div class="time">--:--</div>
            <div class="status" hidden></div>
          </div>
          <div class="current">
            <div class="ic"></div>
            <div class="temp">--&deg;</div>
            <div class="cond"></div>
          </div>
        </div>
        <div class="forecast"></div>
      </ha-card>
    `;
    this._els = {
      card: this.shadowRoot.querySelector("ha-card"),
      scene: this.shadowRoot.querySelector(".scene"),
      date: this.shadowRoot.querySelector(".date"),
      time: this.shadowRoot.querySelector(".time"),
      status: this.shadowRoot.querySelector(".status"),
      ic: this.shadowRoot.querySelector(".ic"),
      temp: this.shadowRoot.querySelector(".temp"),
      cond: this.shadowRoot.querySelector(".cond"),
      forecast: this.shadowRoot.querySelector(".forecast"),
    };
    if (this._config && this._config.animate === false) {
      this._els.card.classList.add("static");
    }
    this._built = true;
    this._applyVisibility();
  }

  _renderClock() {
    if (!this._els || !this._hass) return;
    const now = new Date();
    const locale = this._locale();
    const h12 = !this._use24h();
    /* The face reads to the minute, and this is reached on every state change
     * in the house as well as from its own 15s timer. Assigning textContent
     * replaces the text node whether or not the string differs, which
     * invalidates the layout of a row whose clock is set in clamp(40px,
     * 4.6vw, 62px) - seventeen times a second, for a string that changes
     * sixty times an hour. */
    const face = `${Math.floor(now.getTime() / 60000)}|${locale}|${h12}`;
    if (face !== this._face) {
      this._face = face;
      this._els.time.textContent = dateFormat(`hm|${h12 ? 12 : 24}`, locale, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: h12,
      }).format(now);
      this._els.date.textContent = dateFormat("full", locale, {
        weekday: "long",
        day: "numeric",
        month: "long",
      }).format(now);
    }
    // Re-evaluated on each tick so the greeting changes at the time boundary
    // without waiting for an unrelated state update.
    this._renderStatus();
  }

  _render() {
    if (!this._hass || !this._els || !this._config) return;
    const cfg = this._config;

    this._renderClock();

    const stateObj = this._hass.states[cfg.entity];
    if (!stateObj) {
      this._els.temp.textContent = "—";
      this._els.cond.textContent = `${cfg.entity} unavailable`;
      this._els.ic.innerHTML = "";
    } else {
      const unit =
        (stateObj.attributes && stateObj.attributes.temperature_unit) ||
        cfg.text.degree;
      const temp = stateObj.attributes && stateObj.attributes.temperature;
      this._els.temp.textContent =
        temp === undefined || temp === null ? "—" : `${Math.round(temp)}${unit}`;
      this._els.cond.textContent =
        localized(
          this._hass,
          WEATHER_STATE_KEY + stateObj.state,
          cfg.text.conditions[stateObj.state],
          stateObj.state || ""
        );

      // Rebuild the glyphs only when the condition actually changes, so the
      // animations are not restarted on every unrelated state update.
      const cond = normalise(stateObj.state);
      if (cond !== this._condition) {
        this._condition = cond;
        this._els.ic.innerHTML = icon(stateObj.state);
        this._els.scene.innerHTML = scene(cond);
        this._els.card.setAttribute("data-cond", cond);
      }
    }

    /* _renderClock, just above, ends by calling _renderStatus - so this is
     * the second time the greeting is composed and written in one render. */
    this._renderForecast();
  }

  // The greeting is per-viewer: hass.user is whoever is logged in on THIS
  // browser, so the wall tablet and a phone see different lines from the same
  // dashboard config. Shared/kiosk logins are named in greeting_exclude and
  // get the greeting without a name, since "Good evening, Tablet" is worse
  // than no name at all.
  _greetingName() {
    const user = this._hass && this._hass.user;
    const name = user && user.name;
    if (!name) return null;
    const lower = name.toLowerCase();
    if (this._config.greeting_exclude.some((term) => lower.includes(term))) return null;
    // Display names are often a full name; the first word reads better.
    return name.trim().split(/\s+/)[0];
  }

  _greeting() {
    const g = this._config.text.greeting;
    const h = new Date().getHours();
    const part =
      h >= 5 && h < 12
        ? g.morning
        : h >= 12 && h < 18
        ? g.afternoon
        : h >= 18 && h < 23
        ? g.evening
        : g.night;
    const name = this._greetingName();
    return name ? `${part}, ${name}` : part;
  }

  // A configured greeting entity wins: when it has something to say, it is
  // saying something more urgent than a greeting.
  _renderStatus() {
    if (!this._els || !this._hass || !this._config) return;
    const cfg = this._config;
    const statusObj = cfg.greeting_entity && this._hass.states[cfg.greeting_entity];
    if (statusObj && statusObj.state && !["unknown", "unavailable"].includes(statusObj.state)) {
      this._els.status.textContent = statusObj.state;
      this._els.status.hidden = false;
      return;
    }
    if (cfg.greeting) {
      this._els.status.textContent = this._greeting();
      this._els.status.hidden = false;
      return;
    }
    this._els.status.hidden = true;
  }

  _renderForecast() {
    if (!this._els || !this._config) return;
    const days = (this._forecast || []).slice(0, this._config.forecast_days);
    const host = this._els.forecast;

    /* A forecast changes when the weather integration says so - every half
     * hour or so - and _render is called on every state change in the house.
     * Rebuilding three days of markup for every passing watt was 4% of a wall
     * tablet's main thread.
     *
     * The signature describes the output rather than the inputs, which is the
     * reason the condition titles are resolved into it: hass.localize arrives
     * after the first frames, and a signature taken from the raw conditions
     * would hold the English fallback for as long as the forecast did not
     * move. */
    const sig = JSON.stringify([
      this._config.forecast_days,
      this._locale(),
      days.map((d) => [
        d.datetime,
        d.temperature,
        d.templow,
        d.condition,
        localized(
          this._hass,
          WEATHER_STATE_KEY + d.condition,
          this._config.text.conditions[d.condition],
          d.condition || ""
        ),
      ]),
    ]);
    if (sig === this._fcSig) return;
    this._fcSig = sig;

    if (!days.length) {
      host.innerHTML = `<div class="empty">Forecast unavailable</div>`;
      return;
    }

    // One shared scale across every day, otherwise each bar would be full
    // width and the comparison would be meaningless.
    const all = days.flatMap((d) =>
      [d.templow, d.temperature].filter((v) => typeof v === "number")
    );
    const min = Math.min(...all);
    const max = Math.max(...all);
    const span = max - min || 1;

    const text = this._config.text;
    const hass = this._hass;
    const locale = this._locale();
    host.innerHTML = days
      .map((d, i) => {
        const date = new Date(d.datetime);
        const name =
          i === 0
            ? relativeDay(locale, 0, text.today || "Today")
            : i === 1
            ? relativeDay(locale, 1, text.tomorrow || "Tomorrow")
            : dateFormat("wd", locale, { weekday: "long" }).format(date);
        const hi = typeof d.temperature === "number" ? Math.round(d.temperature) : null;
        const lo = typeof d.templow === "number" ? Math.round(d.templow) : null;
        const left = lo === null ? 0 : ((lo - min) / span) * 100;
        const right = hi === null ? 0 : 100 - ((hi - min) / span) * 100;
        const warm = SUNNY_CONDITIONS.has(d.condition) ? " warm" : "";
        /* Forecast conditions are values inside a forecast object rather than
         * an entity state, so formatEntityState has nothing to take. The
         * translation key is the same one either way. */
        const title = localized(
          hass,
          WEATHER_STATE_KEY + d.condition,
          text.conditions[d.condition],
          d.condition || ""
        );
        return `
          <div class="day${warm}" title="${esc(title)}">
            <span class="name">${esc(name)}</span>
            ${icon(d.condition)}
            <span class="lo">${lo === null ? "" : lo + esc(text.degree)}</span>
            <span class="track"><i style="left:${left.toFixed(1)}%;right:${right.toFixed(1)}%"></i></span>
            <span class="hi">${hi === null ? "—" : hi + esc(text.degree)}</span>
          </div>`;
      })
      .join("");
  }

  static getStubConfig(hass) {
    const first = Object.keys((hass && hass.states) || {}).find((e) =>
      e.startsWith("weather.")
    );
    return {
      type: "custom:home-info-card",
      entity: first || "weather.home",
      forecast_days: DEFAULTS.forecast_days,
    };
  }
}

const CARD_BUILD = "2026-10-09a";

if (!customElements.get("home-info-card")) {
  customElements.define("home-info-card", HomeInfoCard);

  // Deliberate load marker. HA hides a "custom element doesn't exist" error
  // for 2s while waiting for registration, so a card that never registers
  // looks identical to one that failed at runtime. This makes the difference
  // checkable: no line here means the module never executed.
  console.info(`%c home-info-card %c loaded (build ${CARD_BUILD}) `,
    "background:#d8a24e;color:#0f0f10;font-weight:600",
    "background:#161618;color:#f0f0f1");
  window.__homeInfoCard = { build: CARD_BUILD, loadedAt: new Date().toISOString() };

  // Register in the card picker so the card is selectable from the UI editor.
  window.customCards = window.customCards || [];
  window.customCards.push({
    type: "home-info-card",
    name: "Home Info Card",
    description: "Date, time, status, current conditions and forecast band.",
    preview: false,
  });
}
