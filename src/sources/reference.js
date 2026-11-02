import { createUsgsEarthquakeSource } from '../layers/earthquakes/source.js';
import { createEcccAirQualitySource } from '../layers/airQuality/source.js';
import { createWfigsPerimeterSource } from '../layers/perimeters/source.js';
import { createBundledCableSource } from '../layers/submarineCables/bundledSource.js';
import { createAdsbGnssSource } from '../layers/gnss/source.js';
import { createGdeltWorldEventsSource } from '../layers/worldEvents/source.js';
import { createIodaInternetOutagesSource } from '../layers/internetOutages/source.js';
import { createEonetNaturalEventsSource } from '../layers/naturalEvents/source.js';

/** Construct the existing reference feeds independently of application setup. */
export function createReferenceSources() {
  return {
    earthquakes: createUsgsEarthquakeSource(),
    'air-quality': createEcccAirQualitySource(),
    'fire-perimeters': createWfigsPerimeterSource(),
    cables: createBundledCableSource(),
    'gnss-integrity': createAdsbGnssSource(),
    'world-events': createGdeltWorldEventsSource(),
    'internet-outages': createIodaInternetOutagesSource(),
    'natural-events': createEonetNaturalEventsSource(),
  };
}
