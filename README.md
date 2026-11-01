# Home Info Card

[![hacs](https://img.shields.io/badge/HACS-custom-orange.svg)](https://hacs.xyz/docs/faq/custom_repositories/)
[![license](https://img.shields.io/github/license/Sandolution/ha-info-card)](LICENSE)

The top of a dashboard: date, time, a greeting, the weather now and a few days
ahead, in one card.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/info-card-dark.png">
  <img alt="Home Info Card with clock, greeting and a four-day forecast" src="images/info-card-light.png">
</picture>

It is one card rather than a clock card, a weather card and a markdown card in a
stack, so the type and spacing belong to one design instead of three fighting
each other.

## Installation

### HACS

1. In HACS, open the menu (⋮) → **Custom repositories**.
2. Add `https://github.com/Sandolution/ha-info-card` with the type **Dashboard**.
3. Install **Home Info Card**. HACS adds the dashboard resource for you.
4. Reload the browser.

### Manual

1. Download `home-info-card.js` from this repository into `config/www/`.
2. Add it as a resource: **Settings → Dashboards → ⋮ → Resources**, URL
   `/local/home-info-card.js`, type **JavaScript module**.
3. Reload the browser.

## Configuration

```yaml
type: custom:home-info-card
entity: weather.home
```

| Option | Default | |
|---|---|---|
| `entity` | | **Required.** A `weather.*` entity with a daily forecast. |
| `forecast_days` | `3` | Days in the forecast, one row each. |
| `greeting` | `true` | "Good morning, Sam" under the clock, with the first name of whoever is logged in. |
| `greeting_entity` | | Any entity. While it has a state, that state replaces the greeting. Use it for something more pressing than "Good evening". |
| `greeting_exclude` | `["tablet"]` | Logins that get the greeting without a name, matched as part of the user name, case-insensitive. A wall tablet isn't a person to say good morning to. |
| `animate` | `true` | `false` makes the card completely still. |
| `text` | see below | The card's own words. |

The greeting says morning from 5:00, afternoon from 12:00, evening from 18:00
and night from 23:00.

### text

Any subset; the rest keep their defaults. An unknown key is an error rather
than being ignored.

```yaml
text:
  degree: °
  greeting:
    morning: Good morning
    afternoon: Good afternoon
    evening: Good evening
    night: Good night
  conditions:
    snowy-rainy: Sleet
```

Only the greeting and the degree sign have defaults of their own. Today and
tomorrow come from the browser (`Intl.RelativeTimeFormat`), and the weather
conditions come from Home Assistant's translations, so the card speaks your
language without configuration. Set a condition to use your own word instead,
for example "Sleet" where Home Assistant says "Snowy, rainy".

The condition keys are `clear-night`, `sunny`, `partlycloudy`, `cloudy`,
`rainy`, `pouring`, `snowy`, `snowy-rainy`, `fog`, `lightning`,
`lightning-rainy`, `windy`, `windy-variant`, `hail` and `exceptional`.

## Forecast

Home Assistant took `forecast` out of the weather entity's attributes in
2024.4, so the card subscribes to the daily forecast over the websocket, the
way the built-in weather card does. Nothing in the configuration depends on
that. A weather integration without a daily forecast gets an empty forecast,
not a broken card.

## Motion

The card was made for a wall tablet that is on all day, so the animation is
cheap: a tint behind the card that follows the weather, the weather icon moving
in place, and a large faint version of the weather drifting behind the clock.
Everything moves with transforms and opacity only, stops while the tab is
hidden, and is off with `prefers-reduced-motion` or `animate: false`.

With the default three days, in a narrower column:

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="images/info-card-narrow-dark.png">
  <img alt="Home Info Card in a narrow column" src="images/info-card-narrow-light.png" width="400">
</picture>

## Requirements

Home Assistant 2024.11 or newer.

## License

[MIT](LICENSE)
