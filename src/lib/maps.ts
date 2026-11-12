/**
 * FOMO Store — Unified Map & Navigation Provider
 *
 * Implements OpenStreetMap (OSM) as the zero-cost default open share map API,
 * with an architectural bridge to switch to Google Maps API via VITE_MAP_PROVIDER.
 */

export type MapProvider = 'osm' | 'google';

export interface LocationCoordinates {
  lat: number;
  lng: number;
}

// Default base coordinates for Rajauli Store (Main Market, Rajauli, Nawada, Bihar)
export const DEFAULT_STORE_COORDS: LocationCoordinates = {
  lat: 24.6543,
  lng: 85.4962,
};

export const ACTIVE_MAP_PROVIDER: MapProvider =
  ((typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_MAP_PROVIDER) as MapProvider) || 'osm';

export interface NavigationLinks {
  provider: MapProvider;
  embedUrl: string;
  osmDirectionsUrl: string;
  osmSearchUrl: string;
  googleMapsDirectionsUrl: string;
  googleMapsSearchUrl: string;
  primaryNavUrl: string;
  displayText: string;
}

/**
 * Builds navigation and interactive map URLs for delivery addresses.
 * Uses OpenStreetMap by default without requiring an API key or credit card.
 */
export function buildNavigationUrls(
  addressLine?: string | null,
  landmark?: string | null,
  pincode?: string | null,
  city = 'Rajauli',
  coords?: LocationCoordinates | null
): NavigationLinks {
  const parts = [addressLine, landmark, pincode, city, 'Nawada', 'Bihar', 'India'].filter(Boolean);
  const fullAddressQuery = parts.join(', ');
  const encodedQuery = encodeURIComponent(fullAddressQuery);

  const destinationLat = coords?.lat ?? DEFAULT_STORE_COORDS.lat;
  const destinationLng = coords?.lng ?? DEFAULT_STORE_COORDS.lng;

  // 1. OpenStreetMap (OSM) Interactive Embed URL (Tile-based, no API key required)
  // Bounding box: [minLng, minLat, maxLng, maxLat]
  const delta = 0.008;
  const minLng = (destinationLng - delta).toFixed(4);
  const minLat = (destinationLat - delta).toFixed(4);
  const maxLng = (destinationLng + delta).toFixed(4);
  const maxLat = (destinationLat + delta).toFixed(4);

  const osmEmbedUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${minLng}%2C${minLat}%2C${maxLng}%2C${maxLat}&layer=mapnik&marker=${destinationLat}%2C${destinationLng}`;

  // 2. OpenStreetMap Search & OSRM Bike/Car Directions
  const osmSearchUrl = `https://www.openstreetmap.org/search?query=${encodedQuery}`;
  const osmDirectionsUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${DEFAULT_STORE_COORDS.lat}%2C${DEFAULT_STORE_COORDS.lng}%3B${destinationLat}%2C${destinationLng}`;

  // 3. Google Maps Fallback / Future Upgrade URLs
  const googleMapsSearchUrl = `https://www.google.com/maps/search/?api=1&query=${encodedQuery}`;
  const googleMapsDirectionsUrl = `https://www.google.com/maps/dir/?api=1&origin=${DEFAULT_STORE_COORDS.lat},${DEFAULT_STORE_COORDS.lng}&destination=${encodedQuery}&travelmode=two_wheeler`;

  const primaryNavUrl = ACTIVE_MAP_PROVIDER === 'google' ? googleMapsDirectionsUrl : osmDirectionsUrl;

  return {
    provider: ACTIVE_MAP_PROVIDER,
    embedUrl: osmEmbedUrl,
    osmDirectionsUrl,
    osmSearchUrl,
    googleMapsDirectionsUrl,
    googleMapsSearchUrl,
    primaryNavUrl,
    displayText: fullAddressQuery,
  };
}
