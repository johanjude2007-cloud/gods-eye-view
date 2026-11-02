import * as Cesium from 'cesium';
import {
  createWorldEventsLayer,
  WORLD_EVENT_COLORS,
} from '../../layers/worldEvents/index.js';
import { createInternetOutagesLayer } from '../../layers/internetOutages/index.js';
import { createNaturalEventsLayer } from '../../layers/naturalEvents/index.js';
import * as picking from '../../data/pickRegistry.js';
import * as overlays from '../../overlays/worldOverlay.js';
import { isPointerFree } from '../../data/inputOwnership.js';
import { formatNumber, msg, t, tn } from '../../i18n/index.js';

const CARD_HOST_OPTIONS = Object.freeze({
  cohortLimit: 1,
  collisionCapacity: 1,
  moving: false,
});

/** English CAMEO root labels, marked for translation when a card renders them. */
const EVENT_LABELS = Object.freeze({
  '01': msg('Public statement'),
  '02': msg('Appeal'),
  '03': msg('Intent to cooperate'),
  '04': msg('Consultation'),
  '05': msg('Diplomatic cooperation'),
  '06': msg('Material cooperation'),
  '07': msg('Aid'),
  '08': msg('Concession'),
  '09': msg('Investigation'),
  10: msg('Demand'),
  11: msg('Disapproval'),
  12: msg('Rejection'),
  13: msg('Threat'),
  14: msg('Protest'),
  15: msg('Show of force'),
  16: msg('Reduced relations'),
  17: msg('Coercion'),
  18: msg('Assault'),
  19: msg('Armed fighting'),
  20: msg('Mass violence'),
});

/** Compact age in the UI language, sharing the fire-perimeter card wording. */
function formatAge(deltaMs) {
  if (!Number.isFinite(deltaMs) || deltaMs < 0) return null;
  const hours = Math.floor(deltaMs / 3600000);
  if (hours < 1)
    return t('{count}m', {
      context: 'age',
      count: Math.max(1, Math.floor(deltaMs / 60000)),
    });
  if (hours < 24) return t('{count}h', { context: 'age', count: hours });
  return t('{count}d', { context: 'age', count: Math.floor(hours / 24) });
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return null;
  }
}

/** Overlay card for one GDELT event. Exported for tests. */
export function buildWorldEventCard(row, nowMs) {
  const label = EVENT_LABELS[row.root] ? t(EVENT_LABELS[row.root]) : row.label;
  const details = [];
  if (row.place) details.push(row.place);
  if (row.actors) details.push(row.actors);
  const facts = [
    tn(row.mentions, '{count} mention', '{count} mentions', {
      count: formatNumber(row.mentions),
    }),
  ];
  const age = formatAge(nowMs - row.timeMs);
  if (row.timeMs != null && age) facts.push(t('updated {age} ago', { age }));
  details.push(facts.join(' · '));
  details.push(t('Machine-coded from news reports; may be wrong'));
  const host = row.url ? hostOf(row.url) : null;
  if (host)
    details.push(t('{source} ↗ · click card to open', { source: host }));
  return {
    title: t('NEWS · {label}', { label }),
    details,
    accent: WORLD_EVENT_COLORS[row.kind],
    link: host ? row.url : null,
  };
}

/** Overlay card for one IODA country outage. Exported for tests. */
export function buildOutageCard(row) {
  return {
    title: t('INTERNET · {country}', { country: row.name }),
    details: [
      t('Outage score {score} over 24 h', { score: formatNumber(row.score) }),
      t('{source} ↗ · click card to open', { source: 'IODA' }),
    ],
    accent: '#9d4edd',
    link: row.url,
  };
}

/** Overlay card for one EONET natural event. Exported for tests. */
export function buildNaturalEventCard(row, nowMs) {
  const details = [row.categoryTitle];
  const age = formatAge(nowMs - row.timeMs);
  if (row.timeMs != null && age) details.push(t('updated {age} ago', { age }));
  const host = row.url ? hostOf(row.url) : null;
  if (host)
    details.push(t('{source} ↗ · click card to open', { source: host }));
  return {
    title: row.title,
    details,
    accent: '#90e0ef',
    link: host ? row.url : null,
  };
}

/**
 * Give a layer click-to-card selection: a click on one of its picks shows a
 * card above the item; clicking the card opens the source page; clicking
 * empty globe clears it. The layer supplies `getRecord(pickId)`.
 */
function withPickCards(layer, { prefix, buildCard }) {
  const sourceId = layer.id;
  let viewer = null;
  let handler = null;
  let selected = null; // { pickId, cardId, link }

  const owns = (pickId) =>
    typeof pickId === 'string' && pickId.startsWith(prefix);

  function clearCard() {
    selected = null;
    overlays.clearOverlaySource(sourceId);
  }

  function showCard(pickId) {
    const row = layer.getRecord(pickId);
    if (!row) return clearCard();
    const card = buildCard(row, Date.now());
    const cardId = `${sourceId}-card:${pickId}`;
    selected = { pickId, cardId, link: card.link };
    const openLink = card.link
      ? () => {
          window.open(card.link, '_blank', 'noopener,noreferrer');
          return true;
        }
      : null;
    overlays.setOverlayEntries(
      sourceId,
      [
        {
          id: cardId,
          selected: true,
          interactive: Boolean(openLink),
          ...(openLink
            ? {
                activate: openLink,
                accessibilityLabel: t('Open source for {title}', {
                  title: card.title,
                }),
              }
            : undefined),
          title: card.title,
          details: card.details,
          accent: card.accent,
          priority: Number.MAX_SAFE_INTEGER,
          gapPx: 15,
          verticalOnly: true,
          placement: 'above',
          position: Cesium.Cartesian3.fromDegrees(row.lon, row.lat),
        },
      ],
      CARD_HOST_OPTIONS,
    );
  }

  function onClick(click) {
    if (!isPointerFree()) return;
    const cardHit = overlays.hitTestWorldOverlay(
      click.position?.x,
      click.position?.y,
      {
        sourceId,
      },
    );
    if (cardHit && selected && cardHit.entryId === selected.cardId) {
      if (selected.link)
        window.open(selected.link, '_blank', 'noopener,noreferrer');
      return;
    }
    const picked = viewer.scene.pick(click.position);
    const pickId = picked ? picking.resolvePickId(picked) : null;
    if (owns(pickId)) return showCard(pickId);
    // Another layer's pick is not empty space: leave the selection alone.
    if (pickId && picking.isOwnedByOtherLayer(layer.id, pickId)) return;
    if (selected) clearCard();
  }

  const { init, enable, disable, destroy, update } = layer;
  return Object.assign(layer, {
    init(v, ...rest) {
      viewer = v;
      return init.call(layer, v, ...rest);
    },
    enable(...args) {
      const result = enable.apply(layer, args);
      overlays.setOverlaySourceVisible(sourceId, true);
      picking.registerPickOwner(layer.id, owns);
      if (viewer && !handler) {
        handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        handler.setInputAction(onClick, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      }
      return result;
    },
    disable(...args) {
      handler?.destroy();
      handler = null;
      picking.unregisterPickOwner(layer.id);
      clearCard();
      overlays.setOverlaySourceVisible(sourceId, false);
      return disable.apply(layer, args);
    },
    async update(...args) {
      const changed = await update.apply(layer, args);
      // Keep an open card in step with refreshed data, or drop it.
      if (changed && selected) showCard(selected.pickId);
      return changed;
    },
    destroy(...args) {
      handler?.destroy();
      handler = null;
      picking.unregisterPickOwner(layer.id);
      clearCard();
      viewer = null;
      return destroy.apply(layer, args);
    },
  });
}

/** GDELT news events with click cards. */
export function createApplicationWorldEvents(options) {
  return withPickCards(createWorldEventsLayer(options), {
    prefix: 'world-event:',
    buildCard: buildWorldEventCard,
  });
}

/** IODA internet outages with click cards. */
export function createApplicationInternetOutages(options) {
  return withPickCards(createInternetOutagesLayer(options), {
    prefix: 'internet-outage:',
    buildCard: buildOutageCard,
  });
}

/** NASA EONET natural events with click cards. */
export function createApplicationNaturalEvents(options) {
  return withPickCards(createNaturalEventsLayer(options), {
    prefix: 'natural-event:',
    buildCard: buildNaturalEventCard,
  });
}
