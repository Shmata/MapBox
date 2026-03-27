// @ts-nocheck
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { BaseComponentContext } from "@microsoft/sp-component-base";

export interface YnseMapConfig {
  mapboxToken: string;
  mapData: any;
  municipalBoundaries: any;
  assetsBaseUrl?: string;
  mapContainer?: string | HTMLElement;
  context?: BaseComponentContext;
}

export function initYnseMap(config: YnseMapConfig): void {
  const {
    mapboxToken,
    mapData,
    municipalBoundaries,
    assetsBaseUrl = config.context ? config.context.pageContext.web.absoluteUrl : '/assets',
    mapContainer = 'map',
    context,
  } = config;

  if (!mapboxToken) {
    throw new Error('Mapbox token is required. Pass mapboxToken to initYnseMap().');
  }

  mapboxgl.accessToken = mapboxToken;

const MASTER_CONTRACT = 'SRS';
const DETAIL_ZOOM_THRESHOLD = 12.7;
const LINE_SPREAD_PX = 24;
const LOW_ZOOM_SPREAD_PX = 6;
const PIXEL_SPREAD = 22;
const CLUSTER_RADIUS = 24;
const STATION_EAST_PX = 14;
const STATION_WEST_PX = 14;

const LAYER_CONFIG = {
  eeb:             { color: '#ef4444', label: 'Emergency Exit Building' },
  headwalls:       { color: '#FF8674', label: 'EEB Headwall' },
  cross_passages:  { color: '#22c55e', label: 'Cross Passage' },
  tpss:            { color: '#a855f7', label: 'Transform Power Substation' },
  stations:        { color: '#FBDB65', label: 'Station' },
  facilities:      { color: '#ec4899', label: 'Support Facility' },
  civil_works:     { color: '#8FD6BD', label: 'Civil Works' },
};

const LINE_CONFIG = {
  SRS: { color: '#FBDB65', label: 'SRS Line', eastSlot: 0, parallelOffset: 0 },
  AT:  { color: '#FF8674', label: 'AT Line', eastSlot: 1, parallelOffset: 1 },
  FEW: { color: '#8FD6BD', label: 'FEW Line', eastSlot: 2, parallelOffset: 2 },
};

const SPREAD_DIRECTION = { SRS: -1, AT: 1, FEW: 1 };

const CONTRACT_ORDER = Object.keys(mapData.contracts).sort((a, b) => mapData.contracts[a].order - mapData.contracts[b].order);

const visibleContracts = new Set(Object.keys(LINE_CONFIG));
const visibleAssetTypes = new Set(Object.keys(LAYER_CONFIG));

const ASSET_ABBREV = {
  stations: 'S', eeb: 'E', headwalls: 'H',
  cross_passages: 'CP', tpss: 'TPSS',
  facilities: 'F', civil_works: 'CW',
};

// --- TIMELINE STATE ---
const TIMELINE_START = new Date('2024-01-01');
const TIMELINE_END = (() => {
  let max = 0;
  const types = ['eeb', 'cross_passages', 'tpss', 'stations', 'headwalls', 'facilities', 'civil_works', 'unmapped'];
  types.forEach((t) => {
    (mapData[t] || []).forEach((p) => {
      if (p.estimated_finished_date) {
        const d = new Date(p.estimated_finished_date).getTime();
        if (d > max) max = d;
      }
    });
  });
  return new Date(max);
})();
let currentTimelineDate = new Date(TIMELINE_END);

// --- MAP INIT ---
const map = new mapboxgl.Map({
  container: mapContainer,
  style: 'mapbox://styles/mapbox/light-v11',
  center: [-79.422, 43.81],
  zoom: 12.9,
  pitch: 0,
  antialias: true,
});

map.addControl(new mapboxgl.NavigationControl(), 'bottom-right');
map.addControl(new mapboxgl.ScaleControl({ unit: 'metric' }), 'bottom-left');

// --- ZOOM DISPLAY ---
const zoomEl = document.getElementById('zoom-level');

// --- GEOMETRY HELPERS ---
function smoothLine(points, iterations = 4) {
  if (points.length < 3) return points;
  let pts = points;
  for (let iter = 0; iter < iterations; iter++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i], b = pts[i + 1];
      next.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]]);
      next.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]);
    }
    next.push(pts[pts.length - 1]);
    pts = next;
  }
  return pts;
}

function closestPointOnPath(path, point) {
  let bestLng = path[0][0], bestLat = path[0][1], bestDist = Infinity;
  for (let i = 0; i < path.length - 1; i++) {
    const ax = path[i][0], ay = path[i][1];
    const bx = path[i + 1][0], by = path[i + 1][1];
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq === 0 ? 0 : ((point[0] - ax) * dx + (point[1] - ay) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + t * dx, cy = ay + t * dy;
    const dist = (cx - point[0]) ** 2 + (cy - point[1]) ** 2;
    if (dist < bestDist) { bestDist = dist; bestLng = cx; bestLat = cy; }
  }
  return [bestLng, bestLat];
}

function pixelsToLng(px, zoom, lat) {
  const metersPerPixel = (40075016.686 * Math.cos((lat * Math.PI) / 180)) / (512 * Math.pow(2, zoom));
  return (px * metersPerPixel) / (111320 * Math.cos((lat * Math.PI) / 180));
}

function pixelsToLat(px, zoom) {
  const metersPerPixel = 40075016.686 / (512 * Math.pow(2, zoom));
  return (px * metersPerPixel) / 111320;
}

function spreadPxForZoom(zoom) {
  return zoom < DETAIL_ZOOM_THRESHOLD ? LOW_ZOOM_SPREAD_PX : LINE_SPREAD_PX;
}

// --- ICON GENERATORS ---
function createAssetIcon(abbreviation, bgColor, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const center = size / 2;

  ctx.beginPath();
  ctx.arc(center, center, size / 2 - 2, 0, Math.PI * 2);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  const fontSize = abbreviation.length <= 2 ? size * 0.4 : size * 0.28;
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold ${fontSize}px "Avenir Next", Avenir, Inter, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(abbreviation, center, center + 1);

  return { width: size, height: size, data: ctx.getImageData(0, 0, size, size).data };
}

function createStationIcon(bgColor, size) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const center = size / 2;

  ctx.beginPath();
  ctx.arc(center, center, size / 2 - 2, 0, Math.PI * 2);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  // Outer white circle
  const outerR = size * 0.22;
  ctx.beginPath();
  ctx.arc(center, center, outerR, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // Inner colored circle
  const innerR = size * 0.1;
  ctx.beginPath();
  ctx.arc(center, center, innerR, 0, Math.PI * 2);
  ctx.fillStyle = bgColor;
  ctx.fill();

  return { width: size, height: size, data: ctx.getImageData(0, 0, size, size).data };
}

// --- PRE-COMPUTED STATIC DATA ---

// All non-station points (collected once, reused everywhere)
const allNonStationPoints = [];
Object.keys(LAYER_CONFIG).forEach((type) => {
  if (type === 'stations') return;
  const points = mapData[type];
  if (!points) return;
  points.forEach((p, i) => {
    allNonStationPoints.push({ type, index: i, contract: p.contract, lat: p.lat, lng: p.lng });
  });
});

// Pre-collect assets grouped by contract (static — avoids re-scanning on every zoom)
const contractAssetIndex = {};
Object.keys(LINE_CONFIG).forEach((contract) => {
  contractAssetIndex[contract] = [];
});
Object.keys(LAYER_CONFIG).forEach((type) => {
  const points = mapData[type];
  if (!points) return;
  points.forEach((p, i) => {
    if (LINE_CONFIG[p.contract]) {
      contractAssetIndex[p.contract].push({ type, index: i, p });
    }
  });
});
Object.values(contractAssetIndex).forEach((arr) => arr.sort((a, b) => a.p.lat - b.p.lat));

// Master path from SRS points (sorted south→north, deduplicated)
const masterAll = [];
Object.keys(LAYER_CONFIG).forEach((type) => {
  const points = mapData[type];
  if (!points) return;
  points.forEach((p) => {
    if (p.contract === MASTER_CONTRACT) masterAll.push([p.lng, p.lat]);
  });
});
const masterSeen = new Set();
const MIN_POINT_DIST = 0.001;
const masterPath = masterAll
  .filter((c) => {
    const key = `${c[0]},${c[1]}`;
    if (masterSeen.has(key)) return false;
    masterSeen.add(key);
    return true;
  })
  .sort((a, b) => a[1] - b[1])
  .filter((c, i, arr) => {
    if (i === 0) return true;
    const prev = arr[i - 1];
    return Math.sqrt((c[0] - prev[0]) ** 2 + (c[1] - prev[1]) ** 2) >= MIN_POINT_DIST;
  });

const masterSmooth = smoothLine(masterPath);

// Unique points per contract (for lat extent + single-point fallback)
const contractUniquePoints = {};
Object.entries(LINE_CONFIG).forEach(([contract]) => {
  const all = [];
  Object.keys(LAYER_CONFIG).forEach((type) => {
    const points = mapData[type];
    if (!points) return;
    points.forEach((p) => {
      if (p.contract === contract) all.push([p.lng, p.lat]);
    });
  });
  const seen = new Set();
  contractUniquePoints[contract] = all
    .filter((c) => {
      const key = `${c[0]},${c[1]}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a[1] - b[1]);
});

// --- SHARED CLUSTERING INFRASTRUCTURE ---
// Computed once per zoom tick, shared between spread-slot assignment and connector generation.

let currentClusterData = null; // { stationPixels, items, byContract, isNearStation }
let currentSpreadSlots = {};

function projectPointsForZoom(zoom) {
  const stationPixels = (mapData.stations || []).map((s) => {
    // Ghost stations pin at offset 0; visible stations use their contract's eastSlot
    const isGhost = !visibleContracts.has(s.contract);
    const stBasePx = isGhost ? 0 : (LINE_CONFIG[s.contract]?.eastSlot || 0) * LINE_SPREAD_PX;
    const lngOffset = pixelsToLng(stBasePx, zoom, s.lat);
    const projected = map.project([s.lng + lngOffset, s.lat]);
    return { px: projected.x, py: projected.y, lat: s.lat, lng: s.lng, contract: s.contract, isGhost };
  });

  const items = allNonStationPoints.map((p) => {
    const basePx = (LINE_CONFIG[p.contract]?.eastSlot || 0) * LINE_SPREAD_PX;
    const lngOffset = pixelsToLng(basePx, zoom, p.lat);
    const projected = map.project([p.lng + lngOffset, p.lat]);
    return { ...p, px: projected.x, py: projected.y };
  });

  function isNearStation(item) {
    for (const st of stationPixels) {
      const dx = item.px - st.px;
      const dy = item.py - st.py;
      if (Math.sqrt(dx * dx + dy * dy) <= CLUSTER_RADIUS) return true;
    }
    return false;
  }

  function isNearGhostStation(item) {
    for (const st of stationPixels) {
      if (!st.isGhost) continue;
      const dx = item.px - st.px;
      const dy = item.py - st.py;
      if (Math.sqrt(dx * dx + dy * dy) <= CLUSTER_RADIUS) return true;
    }
    return false;
  }

  const byContract = {};
  items.forEach((item) => {
    if (!byContract[item.contract]) byContract[item.contract] = [];
    byContract[item.contract].push(item);
  });

  return { stationPixels, items, byContract, isNearStation, isNearGhostStation };
}

function buildClusters(contractItems) {
  const clusters = [];
  const visited = new Set();
  for (let i = 0; i < contractItems.length; i++) {
    if (visited.has(i)) continue;
    const cluster = [contractItems[i]];
    visited.add(i);
    let added = true;
    while (added) {
      added = false;
      for (let j = 0; j < contractItems.length; j++) {
        if (visited.has(j)) continue;
        for (const member of cluster) {
          const dx = contractItems[j].px - member.px;
          const dy = contractItems[j].py - member.py;
          if (Math.sqrt(dx * dx + dy * dy) <= CLUSTER_RADIUS) {
            cluster.push(contractItems[j]);
            visited.add(j);
            added = true;
            break;
          }
        }
      }
    }
    clusters.push(cluster);
  }
  return clusters;
}

// --- SPREAD SLOT COMPUTATION ---

function computeSpreadSlots(data) {
  const slots = {};
  const { byContract, isNearStation } = data;

  Object.entries(byContract).forEach(([contract, contractItems]) => {
    const dir = SPREAD_DIRECTION[contract] || 1;
    const clusters = buildClusters(contractItems);

    clusters.forEach((cluster) => {
      const clusterNearStation = cluster.some(isNearStation);

      if (cluster.length < 2) {
        if (clusterNearStation && contract === MASTER_CONTRACT) {
          slots[`${cluster[0].type}-${cluster[0].index}`] = { slot: 1, direction: dir };
        }
        return;
      }

      if (clusterNearStation && contract === MASTER_CONTRACT) {
        cluster.forEach((item, idx) => {
          slots[`${item.type}-${item.index}`] = { slot: idx + 1, direction: dir };
        });
      } else {
        cluster.forEach((item, idx) => {
          if (idx > 0) {
            slots[`${item.type}-${item.index}`] = { slot: idx, direction: dir };
          }
        });
      }
    });
  });

  return slots;
}

// --- POINT COORDINATE COMPUTATION ---

function getCoords(type, index, p, zoom) {
  const contractConfig = LINE_CONFIG[p.contract];
  const basePx = contractConfig ? contractConfig.eastSlot * spreadPxForZoom(zoom) : 0;

  let baseLng = p.lng;
  let baseLat = p.lat;
  const atMasterPosition = contractConfig && contractConfig.parallelOffset === 0;
  const shouldSnap = p.contract === MASTER_CONTRACT || atMasterPosition || zoom < DETAIL_ZOOM_THRESHOLD;
  if (shouldSnap && masterSmooth.length >= 2) {
    const snapped = closestPointOnPath(masterSmooth, [p.lng, p.lat]);
    baseLng = snapped[0];
    baseLat = snapped[1];
  }

  if (type === 'stations') {
    // Ghost stations stay at their true location (offset 0), not the hidden-contract offset
    const stationPx = visibleContracts.has(p.contract) ? basePx : 0;
    return [baseLng + pixelsToLng(stationPx, zoom, baseLat), baseLat];
  }

  const spread = currentSpreadSlots[`${type}-${index}`];
  if (spread) {
    const nearStation = currentClusterData
      ? currentClusterData.isNearStation({ px: 0, py: 0, ...(() => {
          const bpx = (LINE_CONFIG[p.contract]?.eastSlot || 0) * LINE_SPREAD_PX;
          const lo = pixelsToLng(bpx, zoom, p.lat);
          const proj = map.project([p.lng + lo, p.lat]);
          return { px: proj.x, py: proj.y };
        })() })
      : false;
    const gapPx = nearStation ? (spread.direction < 0 ? STATION_WEST_PX : STATION_EAST_PX) : 0;
    const spreadPx = spread.direction * (gapPx + (spread.slot - 1) * PIXEL_SPREAD + PIXEL_SPREAD);
    const lngDelta = pixelsToLng(basePx + spreadPx, zoom, baseLat);

    if (p.contract !== MASTER_CONTRACT && spread.slot > 0) {
      const vertDir = spread.slot % 2 === 1 ? 1 : -1;
      const vertSlot = Math.ceil(spread.slot / 2);
      const latDelta = pixelsToLat(vertDir * vertSlot * PIXEL_SPREAD, zoom);
      return [baseLng + lngDelta, baseLat + latDelta];
    }

    return [baseLng + lngDelta, baseLat];
  }

  // Small east nudge if this point overlaps a ghost station
  let ghostNudgePx = 0;
  if (currentClusterData) {
    const bpx = (LINE_CONFIG[p.contract]?.eastSlot || 0) * LINE_SPREAD_PX;
    const lo = pixelsToLng(bpx, zoom, p.lat);
    const proj = map.project([p.lng + lo, p.lat]);
    if (currentClusterData.isNearGhostStation({ px: proj.x, py: proj.y })) {
      ghostNudgePx = STATION_EAST_PX + 8;
    }
  }
  return [baseLng + pixelsToLng(basePx + ghostNudgePx, zoom, baseLat), baseLat];
}

// --- CONNECTOR LINES ---

function buildConnectorGeoJSON(zoom) {
  const features = [];
  const { byContract, isNearStation, stationPixels } = currentClusterData;

  Object.entries(byContract).forEach(([contract, contractItems]) => {
    if (!visibleContracts.has(contract)) return;
    const unique = contractUniquePoints[contract];
    if (unique && unique.length < 2) return;

    const clusters = buildClusters(contractItems);

    clusters.forEach((cluster) => {
      const clusterNearStation = cluster.some(isNearStation);
      const includeStation = clusterNearStation && contract === MASTER_CONTRACT
        && visibleAssetTypes.has('stations');

      // Filter to only visible asset types and completed assets (per timeline)
      const timelineTs = currentTimelineDate.getTime();
      const visibleCluster = cluster.filter((item) => {
        if (!visibleAssetTypes.has(item.type)) return false;
        const p = mapData[item.type][item.index];
        if (p.estimated_finished_date && new Date(p.estimated_finished_date).getTime() > timelineTs) return false;
        return true;
      });

      // Check if the nearby station is also completed
      let stationCompleted = false;
      if (includeStation) {
        const nearestStation = (mapData.stations || []).find((s, si) => {
          const st = stationPixels[si];
          return cluster.some((item) => {
            const dx = item.px - st.px;
            const dy = item.py - st.py;
            return Math.sqrt(dx * dx + dy * dy) <= CLUSTER_RADIUS;
          });
        });
        if (nearestStation && (!nearestStation.estimated_finished_date ||
            new Date(nearestStation.estimated_finished_date).getTime() <= timelineTs)) {
          stationCompleted = true;
        }
      }

      const effectiveIncludeStation = includeStation && stationCompleted;
      if (visibleCluster.length < 2 && !effectiveIncludeStation) return;

      const renderedCoords = visibleCluster.map((item) =>
        getCoords(item.type, item.index, mapData[item.type][item.index], zoom)
      );

      if (effectiveIncludeStation) {
        const nearestStation = (mapData.stations || []).find((s, si) => {
          const st = stationPixels[si];
          return cluster.some((item) => {
            const dx = item.px - st.px;
            const dy = item.py - st.py;
            return Math.sqrt(dx * dx + dy * dy) <= CLUSTER_RADIUS;
          });
        });
        if (nearestStation) {
          renderedCoords.push(getCoords('stations', 0, nearestStation, zoom));
        }
      }

      if (renderedCoords.length < 2) return;

      renderedCoords.sort((a, b) => a[0] - b[0]);
      const first = renderedCoords[0];
      const last = renderedCoords[renderedCoords.length - 1];

      if (Math.abs(first[0] - last[0]) < 1e-9 && Math.abs(first[1] - last[1]) < 1e-9) return;

      features.push({
        type: 'Feature',
        properties: { contract },
        geometry: { type: 'LineString', coordinates: [first, last] },
      });
    });
  });

  return { type: 'FeatureCollection', features };
}

// --- CONTRACT LINE GEOMETRY ---

function getContractPath(contract) {
  const unique = contractUniquePoints[contract];
  if (!unique || unique.length === 0) return [];
  if (contract === MASTER_CONTRACT) return masterSmooth;

  const minLat = unique[0][1];
  const maxLat = unique[unique.length - 1][1];
  const clipped = masterSmooth.filter((c) => c[1] >= minLat && c[1] <= maxLat);

  if (clipped.length >= 2) {
    clipped[0] = closestPointOnPath(masterSmooth, unique[0]);
    clipped[clipped.length - 1] = closestPointOnPath(masterSmooth, unique[unique.length - 1]);
    return clipped;
  }
  if (unique.length >= 2) return smoothLine(unique);
  return unique;
}

function offsetPathPerpendicular(path, distPx) {
  if (distPx === 0) return path;

  let pixels = path.map((c, i) => ({ ...map.project(c), idx: i }));

  // Downsample to avoid tangent noise at low zoom
  const MIN_PX_DIST_SQ = 16; // 4px squared
  const filtered = [pixels[0]];
  for (let i = 1; i < pixels.length - 1; i++) {
    const prev = filtered[filtered.length - 1];
    const dx = pixels[i].x - prev.x;
    const dy = pixels[i].y - prev.y;
    if (dx * dx + dy * dy >= MIN_PX_DIST_SQ) {
      filtered.push(pixels[i]);
    }
  }
  filtered.push(pixels[pixels.length - 1]);

  const filteredPath = filtered.map((p) => path[p.idx]);
  pixels = filtered;

  const result = [];
  for (let i = 0; i < pixels.length; i++) {
    let tx, ty;
    if (i === 0) {
      tx = pixels[1].x - pixels[0].x;
      ty = pixels[1].y - pixels[0].y;
    } else if (i === pixels.length - 1) {
      tx = pixels[i].x - pixels[i - 1].x;
      ty = pixels[i].y - pixels[i - 1].y;
    } else {
      tx = pixels[i + 1].x - pixels[i - 1].x;
      ty = pixels[i + 1].y - pixels[i - 1].y;
    }

    const len = Math.sqrt(tx * tx + ty * ty);
    if (len === 0) { result.push(filteredPath[i]); continue; }
    tx /= len;
    ty /= len;

    const offsetPt = map.unproject([
      pixels[i].x + (-ty) * distPx,
      pixels[i].y + tx * distPx,
    ]);
    result.push([offsetPt.lng, offsetPt.lat]);
  }
  return result;
}

function buildLineGeoJSON(contract, zoom) {
  const config = LINE_CONFIG[contract];
  const unique = contractUniquePoints[contract];
  if (!unique || unique.length === 0) return null;

  const spPx = spreadPxForZoom(zoom);
  const eastPx = config.eastSlot * spPx;

  if (unique.length < 2) {
    let lng = unique[0][0], lat = unique[0][1];
    if (zoom < DETAIL_ZOOM_THRESHOLD && masterSmooth.length >= 2) {
      const snapped = closestPointOnPath(masterSmooth, [lng, lat]);
      lng = snapped[0];
      lat = snapped[1];
    }
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng + pixelsToLng(eastPx, zoom, lat), lat] },
    };
  }

  const path = getContractPath(contract);
  const distPx = config.parallelOffset * spPx;

  if (distPx === 0) {
    return { type: 'Feature', geometry: { type: 'LineString', coordinates: path } };
  }

  const rawOffset = offsetPathPerpendicular(path, distPx);
  const fullPath = smoothLine(rawOffset, 2);

  // Snap endpoints to asset positions on the offset line
  if (contract !== MASTER_CONTRACT) {
    const assets = contractAssetIndex[contract];
    if (assets.length >= 1) {
      fullPath[0] = closestPointOnPath(fullPath, [assets[0].p.lng, assets[0].p.lat]);
      fullPath[fullPath.length - 1] = closestPointOnPath(fullPath, [assets[assets.length - 1].p.lng, assets[assets.length - 1].p.lat]);
    }
  }

  return { type: 'Feature', geometry: { type: 'LineString', coordinates: fullPath } };
}

// --- CASCADING LINE OFFSETS ---

function recalcLineOffsets() {
  const active = CONTRACT_ORDER.filter((c) => visibleContracts.has(c));
  active.forEach((contract, idx) => {
    LINE_CONFIG[contract].parallelOffset = idx;
    LINE_CONFIG[contract].eastSlot = idx;
  });
  // Hidden contracts keep offset 0 (ghost stations pin there)
  const hidden = CONTRACT_ORDER.filter((c) => !visibleContracts.has(c));
  hidden.forEach((contract) => {
    LINE_CONFIG[contract].parallelOffset = 0;
    LINE_CONFIG[contract].eastSlot = 0;
  });
}

// --- UPDATE ON ZOOM ---

function updatePointSources(zoom) {
  currentClusterData = projectPointsForZoom(zoom);
  currentSpreadSlots = computeSpreadSlots(currentClusterData);

  Object.keys(LAYER_CONFIG).forEach((type) => {
    const points = mapData[type];
    if (!points || !points.length) return;
    const source = map.getSource(`points-${type}`);
    if (!source) return;
    source.setData({
      type: 'FeatureCollection',
      features: points.map((p, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: getCoords(type, i, p, zoom) },
        properties: {
          name: p.name, contract: p.contract, type,
          estimated_finished_ts: p.estimated_finished_date ? new Date(p.estimated_finished_date).getTime() : 0,
          estimated_finished_date: p.estimated_finished_date || '',
        },
      })),
    });
  });

  const connSource = map.getSource('connector-lines');
  if (connSource) connSource.setData(buildConnectorGeoJSON(zoom));

  Object.keys(LINE_CONFIG).forEach((contract) => {
    if (!visibleContracts.has(contract)) return;
    const source = map.getSource(`line-${contract}`);
    if (!source) return;
    const geojson = buildLineGeoJSON(contract, zoom);
    if (geojson) source.setData(geojson);

    const unique = contractUniquePoints[contract];
    if (unique && unique.length < 2) {
      const lineSource = map.getSource(`line-${contract}-line`);
      if (lineSource) {
        const detailed = zoom >= DETAIL_ZOOM_THRESHOLD;
        if (detailed) {
          const coords = contractAssetIndex[contract].map(({ type, index, p }) =>
            getCoords(type, index, p, zoom)
          );
          lineSource.setData(coords.length >= 2
            ? { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
            : { type: 'FeatureCollection', features: [] });
        } else {
          lineSource.setData({ type: 'FeatureCollection', features: [] });
        }
        const id = `line-${contract}`;
        setLayerVisibility(`${id}-glow`, detailed ? 'none' : 'visible');
        setLayerVisibility(`${id}-dot`, detailed ? 'none' : 'visible');
        setLayerVisibility(`${id}-line-glow`, detailed ? 'visible' : 'none');
        setLayerVisibility(id, detailed ? 'visible' : 'none');
      }
    }
  });
}

// --- LAYER VISIBILITY ---

function setLayerVisibility(layerId, visibility) {
  if (map.getLayer(layerId)) {
    map.setLayoutProperty(layerId, 'visibility', visibility);
  }
}

function buildStationIconExpr() {
  const cases = [];
  Object.keys(LINE_CONFIG).forEach((contract) => {
    if (!visibleContracts.has(contract)) {
      cases.push(['==', ['get', 'contract'], contract], 'icon-stations-ghost');
    }
  });
  if (cases.length === 0) {
    return ['concat', 'icon-stations-', ['get', 'contract']];
  }
  return ['case', ...cases, ['concat', 'icon-stations-', ['get', 'contract']]];
}

function buildStationOpacityExpr() {
  const cases = [];
  Object.keys(LINE_CONFIG).forEach((contract) => {
    if (!visibleContracts.has(contract)) {
      cases.push(['==', ['get', 'contract'], contract], 0.45);
    }
  });
  if (cases.length === 0) return 1;
  return ['case', ...cases, 1];
}

function applyPointFilters() {
  const zoom = map.getZoom();
  const detailed = zoom >= DETAIL_ZOOM_THRESHOLD;
  const contractArray = [...visibleContracts];
  const contractFilter = ['in', ['get', 'contract'], ['literal', contractArray]];

  Object.keys(LAYER_CONFIG).forEach((type) => {
    const typeVisible = visibleAssetTypes.has(type);
    const isStation = type === 'stations';
    const show = typeVisible && (isStation || detailed);

    setLayerVisibility(`points-${type}`, show ? 'visible' : 'none');
    if (!isStation) {
      setLayerVisibility(`points-glow-${type}`, show ? 'visible' : 'none');
    }

    if (show && isStation) {
      // Stations always visible — ghost icons for hidden contracts
      if (map.getLayer('points-stations')) {
        map.setFilter('points-stations', null);
        map.setLayoutProperty('points-stations', 'icon-image', buildStationIconExpr());
        map.setPaintProperty('points-stations', 'icon-opacity', buildStationOpacityExpr());
      }
    } else if (show) {
      if (map.getLayer(`points-${type}`)) {
        map.setFilter(`points-${type}`, contractFilter);
      }
      if (map.getLayer(`points-glow-${type}`)) {
        map.setFilter(`points-glow-${type}`, contractFilter);
      }
    }
  });

  setLayerVisibility('connector-lines', detailed ? 'visible' : 'none');
}

function updateZoomVisibility() {
  applyPointFilters();
}

// --- TIMELINE FILTERING ---

function applyTimelineFilter() {
  const ts = currentTimelineDate.getTime();

  Object.keys(LAYER_CONFIG).forEach((type) => {
    const isStation = type === 'stations';

    if (isStation) {
      if (!map.getLayer('points-stations')) return;
      // Compose ghost opacity with timeline dimming
      const ghostCases = [];
      Object.keys(LINE_CONFIG).forEach((contract) => {
        if (!visibleContracts.has(contract)) {
          ghostCases.push(['==', ['get', 'contract'], contract], 0.15);
        }
      });

      const timelineExpr = [
        'case',
        ['>', ['get', 'estimated_finished_ts'], ts], 0.15,
        ...(ghostCases.length ? ghostCases : []),
        1
      ];
      map.setPaintProperty('points-stations', 'icon-opacity', timelineExpr);
    } else {
      if (map.getLayer(`points-${type}`)) {
        map.setPaintProperty(`points-${type}`, 'icon-opacity', [
          'case',
          ['>', ['get', 'estimated_finished_ts'], ts], 0.15,
          1
        ]);
      }
      if (map.getLayer(`points-glow-${type}`)) {
        map.setPaintProperty(`points-glow-${type}`, 'circle-opacity', [
          'case',
          ['>', ['get', 'estimated_finished_ts'], ts], 0.03,
          0.15
        ]);
      }
    }
  });
}

function splitLineAtLat(path, splitLat) {
  if (!path || path.length < 2) return { before: path || [], after: [] };

  const before = [];
  const after = [];
  let splitDone = false;

  for (let i = 0; i < path.length; i++) {
    if (splitDone) {
      after.push(path[i]);
      continue;
    }

    before.push(path[i]);

    if (i < path.length - 1) {
      const curLat = path[i][1];
      const nextLat = path[i + 1][1];
      if (curLat <= splitLat && nextLat > splitLat) {
        const t = (splitLat - curLat) / (nextLat - curLat);
        const midLng = path[i][0] + t * (path[i + 1][0] - path[i][0]);
        const midPt = [midLng, splitLat];
        before.push(midPt);
        after.push(midPt);
        splitDone = true;
      }
    }
  }

  return { before, after };
}

function updateContractLineProgress(zoom) {
  const ts = currentTimelineDate.getTime();
  const isFullRange = currentTimelineDate >= TIMELINE_END;

  Object.entries(LINE_CONFIG).forEach(([contract, config]) => {
    if (!visibleContracts.has(contract)) return;
    const unique = contractUniquePoints[contract];

    // Single-point contracts (e.g. FEW) — dim/brighten dot layers
    if (!unique || unique.length < 2) {
      let hasAnyCompleted = false;
      Object.keys(LAYER_CONFIG).forEach((type) => {
        const points = mapData[type];
        if (!points) return;
        points.forEach((p) => {
          if (p.contract !== contract || !p.estimated_finished_date) return;
          if (new Date(p.estimated_finished_date).getTime() <= ts) hasAnyCompleted = true;
        });
      });
      const dimmed = !isFullRange && !hasAnyCompleted;
      const id = `line-${contract}`;
      // Low-zoom dot layers
      if (map.getLayer(`${id}-dot`)) {
        map.setPaintProperty(`${id}-dot`, 'circle-opacity', dimmed ? 0.15 : 0.85);
      }
      if (map.getLayer(`${id}-glow`)) {
        map.setPaintProperty(`${id}-glow`, 'circle-opacity', dimmed ? 0.03 : 0.15);
      }
      // High-zoom line layers (single-point contracts switch to lines at detail zoom)
      if (map.getLayer(id)) {
        map.setPaintProperty(id, 'line-opacity', dimmed ? 0.15 : 0.85);
      }
      if (map.getLayer(`${id}-line-glow`)) {
        map.setPaintProperty(`${id}-line-glow`, 'line-opacity', dimmed ? 0.03 : 0.15);
      }
      return;
    }

    const futureSource = map.getSource(`line-${contract}-future`);
    if (!futureSource) return;

    if (isFullRange) {
      // Show full line, hide future
      futureSource.setData({ type: 'FeatureCollection', features: [] });
      if (map.getLayer(`line-${contract}`)) {
        map.setPaintProperty(`line-${contract}`, 'line-opacity', 0.85);
      }
      if (map.getLayer(`line-${contract}-glow`)) {
        map.setPaintProperty(`line-${contract}-glow`, 'line-opacity', 0.15);
      }
      return;
    }

    // Find max completed latitude for this contract
    let maxCompletedLat = null;
    let hasAnyCompleted = false;
    Object.keys(LAYER_CONFIG).forEach((type) => {
      const points = mapData[type];
      if (!points) return;
      points.forEach((p) => {
        if (p.contract !== contract || !p.estimated_finished_date) return;
        const d = new Date(p.estimated_finished_date).getTime();
        if (d <= ts) {
          hasAnyCompleted = true;
          if (maxCompletedLat === null || p.lat > maxCompletedLat) {
            maxCompletedLat = p.lat;
          }
        }
      });
    });

    const lineGeoJSON = buildLineGeoJSON(contract, zoom);
    if (!lineGeoJSON || lineGeoJSON.geometry?.type !== 'LineString') return;
    const fullPath = lineGeoJSON.geometry.coordinates;

    if (!hasAnyCompleted) {
      // All future — dim entire line
      const mainSource = map.getSource(`line-${contract}`);
      if (mainSource) mainSource.setData({ type: 'FeatureCollection', features: [] });
      futureSource.setData({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: fullPath },
      });
      if (map.getLayer(`line-${contract}-glow`)) {
        map.setPaintProperty(`line-${contract}-glow`, 'line-opacity', 0.05);
      }
    } else {
      const { before, after } = splitLineAtLat(fullPath, maxCompletedLat);
      const mainSource = map.getSource(`line-${contract}`);

      if (before.length >= 2 && mainSource) {
        mainSource.setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: before },
        });
        if (map.getLayer(`line-${contract}`)) {
          map.setPaintProperty(`line-${contract}`, 'line-opacity', 0.85);
        }
        if (map.getLayer(`line-${contract}-glow`)) {
          map.setPaintProperty(`line-${contract}-glow`, 'line-opacity', 0.15);
        }
      }

      if (after.length >= 2) {
        futureSource.setData({
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: after },
        });
      } else {
        futureSource.setData({ type: 'FeatureCollection', features: [] });
      }
    }
  });
}

// --- LEGEND TOGGLE ---

document.querySelectorAll('.legend-item').forEach((item) => {
  const checkbox = item.querySelector('input[type="checkbox"]');
  const layerKey = item.dataset.layer;

  item.addEventListener('click', (e) => {
    e.preventDefault();
    checkbox.checked = !checkbox.checked;
    toggleLayer(layerKey, checkbox.checked);
  });
});

function toggleLayer(layerKey, visible) {
  if (LINE_CONFIG[layerKey]) {
    // Contract toggle
    if (visible) {
      visibleContracts.add(layerKey);
    } else {
      visibleContracts.delete(layerKey);
    }
    const visibility = visible ? 'visible' : 'none';
    setLayerVisibility(`line-${layerKey}`, visibility);
    setLayerVisibility(`line-${layerKey}-glow`, visibility);
    setLayerVisibility(`line-${layerKey}-future`, visibility);
    // Also handle single-point contract layers
    setLayerVisibility(`line-${layerKey}-dot`, visibility);
    setLayerVisibility(`line-${layerKey}-line-glow`, visibility);

    recalcLineOffsets();
    const zoom = map.getZoom();
    updatePointSources(zoom);
    applyPointFilters();
    applyTimelineFilter();
    updateContractLineProgress(zoom);
  } else {
    // Asset type toggle
    if (visible) {
      visibleAssetTypes.add(layerKey);
    } else {
      visibleAssetTypes.delete(layerKey);
    }
    applyPointFilters();
    const connSource = map.getSource('connector-lines');
    if (connSource) connSource.setData(buildConnectorGeoJSON(map.getZoom()));
  }
}

// --- LOAD LAYERS ---

let activePopup = null;

map.on('load', () => {
  // Highlight rail/transit lines on the base map with a green hue
  const railLayers = map.getStyle().layers.filter((l) =>
    /rail|transit/.test(l.id) && (l.type === 'line' || l.type === 'symbol')
  );
  railLayers.forEach((l) => {
    if (l.type === 'line') {
      map.setPaintProperty(l.id, 'line-color', '#B7DD79');
      map.setPaintProperty(l.id, 'line-opacity', 0.8);
      try { map.setPaintProperty(l.id, 'line-width', 3); } catch (_) {}
      try { map.setLayerZoomRange(l.id, 0, 24); } catch (_) {}
    }
  });

  // Tint water/rivers with subtle Metrolinx cyan
  map.getStyle().layers.forEach((l) => {
    if (/water/i.test(l.id) && l.type === 'fill') {
      map.setPaintProperty(l.id, 'fill-color', '#c2e8ec');
    } else if (/water/i.test(l.id) && l.type === 'line') {
      map.setPaintProperty(l.id, 'line-color', '#9ad5dc');
    }
  });

  // Hide place/settlement labels (we have our own municipality labels)
  // Keep road/street labels but fade them at low zoom so distant ones aren't distracting
  map.getStyle().layers.forEach((l) => {
    if (l.type !== 'symbol') return;
    if (/place.*label|settlement/i.test(l.id)) {
      map.setLayoutProperty(l.id, 'visibility', 'none');
    } else if (/poi|natural.*label|water.*label|transit.*label/i.test(l.id)) {
      map.setLayoutProperty(l.id, 'visibility', 'none');
    } else if (/road.*label|street.*label/i.test(l.id)) {
      map.setPaintProperty(l.id, 'text-opacity', [
        'interpolate', ['linear'], ['zoom'],
        11, 0,
        13, 0.5,
      ]);
    }
  });

  // Municipal boundary lines (from OpenStreetMap — Mapbox tiles lack municipal-level data)
  map.addSource('municipal-boundaries', { type: 'geojson', data: municipalBoundaries });
  map.addLayer({
    id: 'municipal-boundaries-line',
    type: 'line',
    source: 'municipal-boundaries',
    paint: {
      'line-color': '#191919',
      'line-width': 5,
      'line-opacity': 0.2,
    },
  });
  // Municipality name labels — positioned inside each territory
  const municipalLabels = {
    type: 'FeatureCollection',
    features: [
      { type: 'Feature', properties: { name: 'VAUGHAN' }, geometry: { type: 'Point', coordinates: [-79.45, 43.82] } },
      { type: 'Feature', properties: { name: 'RICHMOND\nHILL' }, geometry: { type: 'Point', coordinates: [-79.40, 43.845] } },
      { type: 'Feature', properties: { name: 'MARKHAM' }, geometry: { type: 'Point', coordinates: [-79.39, 43.82] } },
      { type: 'Feature', properties: { name: 'TORONTO' }, geometry: { type: 'Point', coordinates: [-79.42, 43.78] } },
    ],
  };
  map.addSource('municipal-labels', { type: 'geojson', data: municipalLabels });
  map.addLayer({
    id: 'municipal-boundaries-label',
    type: 'symbol',
    source: 'municipal-labels',
    layout: {
      'text-field': ['get', 'name'],
      'text-size': 30,
      'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
      'text-letter-spacing': 0.15,
      'text-transform': 'uppercase',
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: {
      'text-color': '#191919',
      'text-opacity': 0.3,
      'text-halo-color': '#ffffff',
      'text-halo-width': 2,
    },
  });

  // Register icons for all asset-type × contract combinations
  const iconSize = 36;
  Object.keys(LAYER_CONFIG).forEach((type) => {
    Object.entries(LINE_CONFIG).forEach(([contract, lineConf]) => {
      const iconId = `icon-${type}-${contract}`;
      if (type === 'stations') {
        map.addImage(iconId, createStationIcon(lineConf.color, iconSize));
      } else {
        map.addImage(iconId, createAssetIcon(ASSET_ABBREV[type], lineConf.color, iconSize));
      }
    });
  });
  map.addImage('icon-stations-ghost', createStationIcon('#9ca3af', iconSize));

  const initialZoom = map.getZoom();
  currentClusterData = projectPointsForZoom(initialZoom);
  currentSpreadSlots = computeSpreadSlots(currentClusterData);

  // Contract lines
  Object.entries(LINE_CONFIG).forEach(([contract, config]) => {
    const unique = contractUniquePoints[contract];
    if (!unique || unique.length === 0) return;

    const id = `line-${contract}`;
    const geojson = buildLineGeoJSON(contract, initialZoom);
    map.addSource(id, { type: 'geojson', data: geojson });

    const linePaint = {
      'line-color': config.color,
      'line-width': 3.5,
      'line-opacity': 0.85,
    };
    const glowPaint = {
      'line-color': config.color,
      'line-width': 10,
      'line-opacity': 0.15,
      'line-blur': 6,
    };
    const lineLayout = { 'line-cap': 'round', 'line-join': 'round' };

    if (unique.length < 2) {
      map.addSource(`${id}-line`, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

      map.addLayer({
        id: `${id}-glow`, type: 'circle', source: id,
        paint: { 'circle-radius': 16, 'circle-color': config.color, 'circle-opacity': 0.15, 'circle-blur': 1 },
      });
      map.addLayer({
        id: `${id}-dot`, type: 'circle', source: id,
        paint: { 'circle-radius': 9, 'circle-color': config.color, 'circle-opacity': 0.85, 'circle-stroke-width': 2, 'circle-stroke-color': '#ffffff' },
      });
      map.addLayer({ id: `${id}-line-glow`, type: 'line', source: `${id}-line`, paint: glowPaint });
      map.addLayer({ id, type: 'line', source: `${id}-line`, paint: linePaint, layout: lineLayout });
    } else {
      map.addLayer({ id: `${id}-glow`, type: 'line', source: id, paint: glowPaint });
      map.addLayer({ id, type: 'line', source: id, paint: linePaint, layout: lineLayout });
    }
  });

  // Future (dashed) contract lines for timeline
  Object.entries(LINE_CONFIG).forEach(([contract, config]) => {
    const unique = contractUniquePoints[contract];
    if (!unique || unique.length < 2) return;
    const futureId = `line-${contract}-future`;
    map.addSource(futureId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: futureId,
      type: 'line',
      source: futureId,
      paint: {
        'line-color': config.color,
        'line-width': 3.5,
        'line-opacity': 0.2,
        'line-dasharray': [2, 4],
      },
      layout: { 'line-cap': 'round', 'line-join': 'round' },
    });
  });

  // Connector lines
  map.addSource('connector-lines', {
    type: 'geojson',
    data: buildConnectorGeoJSON(initialZoom),
  });
  map.addLayer({
    id: 'connector-lines',
    type: 'line',
    source: 'connector-lines',
    paint: {
      'line-color': [
        'match', ['get', 'contract'],
        'SRS', '#FBDB65', 'AT', '#FF8674', 'FEW', '#8FD6BD',
        '#999999'
      ],
      'line-width': 14,
      'line-opacity': 0.6,
    },
    layout: { 'line-cap': 'round' },
  });

  // Contract color match expression for glow layers
  const contractColorMatch = [
    'match', ['get', 'contract'],
    ...Object.entries(LINE_CONFIG).flatMap(([c, conf]) => [c, conf.color]),
    '#999999'
  ];

  // Point layers
  Object.entries(LAYER_CONFIG).forEach(([type, config]) => {
    const points = mapData[type];
    if (!points || !points.length) return;

    const geojson = {
      type: 'FeatureCollection',
      features: points.map((p, i) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: getCoords(type, i, p, initialZoom) },
        properties: {
          name: p.name, contract: p.contract, type,
          estimated_finished_ts: p.estimated_finished_date ? new Date(p.estimated_finished_date).getTime() : 0,
          estimated_finished_date: p.estimated_finished_date || '',
        },
      })),
    };

    map.addSource(`points-${type}`, { type: 'geojson', data: geojson });

    if (type === 'stations') {
      map.addLayer({
        id: `points-${type}`, type: 'symbol', source: `points-${type}`,
        layout: {
          'icon-image': ['concat', `icon-${type}-`, ['get', 'contract']],
          'icon-size': 1,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
    } else {
      map.addLayer({
        id: `points-glow-${type}`, type: 'circle', source: `points-${type}`,
        paint: { 'circle-radius': 14, 'circle-color': contractColorMatch, 'circle-opacity': 0.15, 'circle-blur': 1 },
      });
      map.addLayer({
        id: `points-${type}`, type: 'symbol', source: `points-${type}`,
        layout: {
          'icon-image': ['concat', `icon-${type}-`, ['get', 'contract']],
          'icon-size': 0.75,
          'icon-allow-overlap': true,
          'icon-ignore-placement': true,
        },
      });
    }

    map.on('mouseenter', `points-${type}`, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', `points-${type}`, () => { map.getCanvas().style.cursor = ''; });
  });

  // Click handler
  const pointLayerIds = Object.keys(LAYER_CONFIG).map((t) => `points-${t}`);

  map.on('click', (e) => {
    const bbox = [[e.point.x - 12, e.point.y - 12], [e.point.x + 12, e.point.y + 12]];
    const features = map.queryRenderedFeatures(bbox, { layers: pointLayerIds });
    if (!features.length) return;

    let closest = features[0];
    let minDist = Infinity;
    features.forEach((f) => {
      const c = f.geometry.coordinates;
      const pt = map.project(c);
      const dx = pt.x - e.point.x;
      const dy = pt.y - e.point.y;
      const dist = dx * dx + dy * dy;
      if (dist < minDist) { minDist = dist; closest = f; }
    });

    const coords = closest.geometry.coordinates.slice();
    const p = closest.properties;
    const cfg = LAYER_CONFIG[p.type];
    const contractColor = LINE_CONFIG[p.contract]?.color || cfg.color;

    if (activePopup) activePopup.remove();

    const isStation = p.type === 'stations';
    const stationSlug = isStation
      ? p.name.replace(/\s+Station$/, '').toLowerCase().replace(/\s+/g, '-')
      : null;
    const renderImg = isStation
      ? `<img class="popup-station-render" src="${assetsBaseUrl}/stations/${stationSlug}.avif" alt="${p.name} render" onerror="this.style.display='none'" />`
      : '';

    const estDateStr = p.estimated_finished_date
      ? new Date(p.estimated_finished_date).toLocaleDateString('en-US', { year: 'numeric', month: 'long' })
      : '';
    const estDateHtml = estDateStr
      ? `<div class="popup-item-date" style="font-size:11px;opacity:0.5;margin-top:2px">Est. completion: ${estDateStr}</div>`
      : '';

    const stationInfo = isStation ? mapData.stations.find((s) => s.name === p.name) : null;
    const stationExtrasHtml = stationInfo ? `
        <div class="popup-station-desc">${stationInfo.description}</div>
        <div class="popup-station-stats">
          <div class="popup-stat"><span class="popup-stat-value">${stationInfo.catchment}</span><span class="popup-stat-label">Catchment</span></div>
          <div class="popup-stat"><span class="popup-stat-value">${stationInfo.jobs}</span><span class="popup-stat-label">Area Jobs</span></div>
          <div class="popup-stat"><span class="popup-stat-value">${stationInfo.peakHour}</span><span class="popup-stat-label">Peak Hour</span></div>
          <div class="popup-stat"><span class="popup-stat-value">${stationInfo.dailyBusTransfers}</span><span class="popup-stat-label">Daily Bus Transfers</span></div>
        </div>
        <div class="popup-station-connections">
          <div class="popup-connections-title">Connections</div>
          <div class="popup-connections-list">${stationInfo.connections.map((c) => `<span class="popup-connection-tag">${c}</span>`).join('')}</div>
        </div>` : '';

    activePopup = new mapboxgl.Popup({ offset: 14, maxWidth: isStation ? '320px' : '220px', anchor: coords[0] < map.getCenter().lng ? 'left' : 'right' })
      .setLngLat(coords)
      .setHTML(`<div class="popup-item${isStation ? ' popup-station' : ''}">
        ${renderImg}
        <div class="popup-item-row">
          <span class="popup-dot" style="background:${contractColor}"></span>
          <div>
            <div class="popup-item-type">${cfg.label}</div>
            <div class="popup-item-name">${p.name}</div>
            <div class="popup-item-contract">${p.contract}</div>
            ${estDateHtml}
          </div>
        </div>
        ${stationExtrasHtml}
      </div>`)
      .addTo(map);
  });

  // --- ACCORDION PANEL ---
  const accordionEl = document.getElementById('accordion');
  const accordionCards = {};

  function buildCardContent(contract) {
    const summary = mapData.contracts[contract];

    const assetCounts = {};
    let totalAssets = 0;
    Object.entries(LAYER_CONFIG).forEach(([type, layerConf]) => {
      const points = mapData[type];
      if (!points) return;
      const count = points.filter((p) => p.contract === contract).length;
      if (count > 0) {
        assetCounts[type] = { count, label: layerConf.label, color: layerConf.color };
        totalAssets += count;
      }
    });

    const frag = document.createDocumentFragment();

    // Overview
    const overviewSection = document.createElement('div');
    overviewSection.className = 'card-section';
    const overviewTitle = document.createElement('div');
    overviewTitle.className = 'card-section-title';
    overviewTitle.textContent = 'Overview';
    const overviewDesc = document.createElement('div');
    overviewDesc.className = 'card-description';
    overviewDesc.textContent = summary.description;
    overviewSection.append(overviewTitle, overviewDesc);
    frag.appendChild(overviewSection);

    // Key figures
    const statsSection = document.createElement('div');
    statsSection.className = 'card-section';
    const statsTitle = document.createElement('div');
    statsTitle.className = 'card-section-title';
    statsTitle.textContent = 'Key Figures';
    const statsGrid = document.createElement('div');
    statsGrid.className = 'card-stat-grid';
    [
      { value: totalAssets, label: 'Total Assets' },
      { value: Object.keys(assetCounts).length, label: 'Asset Types' },
      { value: assetCounts.stations?.count || 0, label: 'Stations' },
      { value: summary.municipalities.length, label: 'Municipalities' },
    ].forEach(({ value, label }) => {
      const stat = document.createElement('div');
      stat.className = 'card-stat';
      const val = document.createElement('div');
      val.className = 'card-stat-value';
      val.textContent = value;
      const lbl = document.createElement('div');
      lbl.className = 'card-stat-label';
      lbl.textContent = label;
      stat.append(val, lbl);
      statsGrid.appendChild(stat);
    });
    statsSection.append(statsTitle, statsGrid);
    frag.appendChild(statsSection);

    // Asset breakdown (collapsible, collapsed by default)
    const assetSection = document.createElement('div');
    assetSection.className = 'card-section card-collapsible';
    const assetSectionTitle = document.createElement('div');
    assetSectionTitle.className = 'card-section-title card-collapsible-trigger';
    assetSectionTitle.textContent = 'Asset Breakdown';
    const assetChevron = document.createElement('span');
    assetChevron.className = 'card-collapsible-chevron';
    assetChevron.textContent = '\u25BE';
    assetSectionTitle.appendChild(assetChevron);
    assetSectionTitle.addEventListener('click', () => {
      assetSection.classList.toggle('expanded');
    });
    const assetList = document.createElement('div');
    assetList.className = 'card-asset-list';
    Object.entries(assetCounts)
      .sort((a, b) => b[1].count - a[1].count)
      .forEach(([, { count, label, color }]) => {
        const pct = Math.round((count / totalAssets) * 100);
        const row = document.createElement('div');
        row.className = 'card-asset-row';
        const left = document.createElement('div');
        left.className = 'card-asset-row-left';
        const dot = document.createElement('span');
        dot.className = 'card-asset-dot';
        dot.style.background = color;
        const name = document.createElement('span');
        name.className = 'card-asset-name';
        name.textContent = label;
        left.append(dot, name);
        const countEl = document.createElement('span');
        countEl.className = 'card-asset-count';
        countEl.textContent = count;
        row.append(left, countEl);
        assetList.appendChild(row);

        const progressBar = document.createElement('div');
        progressBar.className = 'card-progress-bar';
        const fill = document.createElement('div');
        fill.className = 'card-progress-fill';
        fill.style.width = '0%';
        fill.style.background = color;
        fill.dataset.targetWidth = pct + '%';
        progressBar.appendChild(fill);
        assetList.appendChild(progressBar);
      });
    assetSection.append(assetSectionTitle, assetList);
    frag.appendChild(assetSection);

    // Scope & municipalities
    const scopeSection = document.createElement('div');
    scopeSection.className = 'card-section';
    const scopeTitle = document.createElement('div');
    scopeTitle.className = 'card-section-title';
    scopeTitle.textContent = 'Scope';
    const scopeDesc = document.createElement('div');
    scopeDesc.className = 'card-description';
    scopeDesc.textContent = summary.scope;
    scopeDesc.style.marginBottom = '8px';
    const muniTitle = document.createElement('div');
    muniTitle.className = 'card-section-title';
    muniTitle.textContent = 'Municipalities';
    const muniContainer = document.createElement('div');
    muniContainer.className = 'card-tags';
    summary.municipalities.forEach((m) => {
      const tag = document.createElement('span');
      tag.className = 'card-tag';
      const tagDot = document.createElement('span');
      tagDot.className = 'card-tag-dot';
      tagDot.style.background = '#191919';
      tag.appendChild(tagDot);
      tag.appendChild(document.createTextNode(m));
      muniContainer.appendChild(tag);
    });
    scopeSection.append(scopeTitle, scopeDesc, muniTitle, muniContainer);
    frag.appendChild(scopeSection);

    // Status
    const statusSection = document.createElement('div');
    statusSection.className = 'card-section';
    const statusSectionTitle = document.createElement('div');
    statusSectionTitle.className = 'card-section-title';
    statusSectionTitle.textContent = 'Status';
    const statusTags = document.createElement('div');
    statusTags.className = 'card-tags';
    const statusTag = document.createElement('span');
    statusTag.className = 'card-tag';
    const statusDot = document.createElement('span');
    statusDot.className = 'card-tag-dot';
    statusDot.style.background = '#22c55e';
    statusTag.appendChild(statusDot);
    statusTag.appendChild(document.createTextNode(summary.status));
    statusTags.appendChild(statusTag);
    statusSection.append(statusSectionTitle, statusTags);
    frag.appendChild(statusSection);

    // Dashboards
    const dashSection = document.createElement('div');
    dashSection.className = 'card-section card-dashboards';
    const dashTitle = document.createElement('div');
    dashTitle.className = 'card-section-title';
    dashTitle.textContent = 'Dashboards';
    const dashButtons = document.createElement('div');
    dashButtons.className = 'card-dashboard-buttons';
    ['Dashboard 1', 'Dashboard 2', 'Dashboard 3'].forEach((label) => {
      const btn = document.createElement('a');
      btn.className = 'card-dashboard-btn';
      btn.textContent = label;
      btn.href = '#';
      btn.target = '_blank';
      btn.rel = 'noopener noreferrer';
      dashButtons.appendChild(btn);
    });
    dashSection.append(dashTitle, dashButtons);
    frag.appendChild(dashSection);

    return frag;
  }

  // Build accordion cards
  CONTRACT_ORDER.forEach((contract) => {
    const config = LINE_CONFIG[contract];
    const summary = mapData.contracts[contract];

    const card = document.createElement('div');
    card.className = 'accordion-card';
    card.dataset.contract = contract;

    // Trigger button
    const trigger = document.createElement('button');
    trigger.className = 'accordion-trigger';

    const colorBar = document.createElement('div');
    colorBar.className = 'accordion-color-bar';
    colorBar.style.background = config.color;

    const textWrap = document.createElement('div');
    textWrap.className = 'accordion-trigger-text';
    const code = document.createElement('div');
    code.className = 'accordion-contract-code';
    code.textContent = contract;
    const name = document.createElement('div');
    name.className = 'accordion-contract-name';
    name.textContent = summary.fullName;
    textWrap.append(code, name);

    const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chevron.classList.add('accordion-chevron');
    chevron.setAttribute('viewBox', '0 0 24 24');
    chevron.setAttribute('fill', 'none');
    chevron.setAttribute('stroke', 'currentColor');
    chevron.setAttribute('stroke-width', '2');
    chevron.setAttribute('stroke-linecap', 'round');
    chevron.setAttribute('stroke-linejoin', 'round');
    const chevPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    chevPath.setAttribute('d', 'M6 9l6 6 6-6');
    chevron.appendChild(chevPath);

    trigger.append(colorBar, textWrap, chevron);

    // Body
    const body = document.createElement('div');
    body.className = 'accordion-body';
    const content = document.createElement('div');
    content.className = 'accordion-content';
    content.appendChild(buildCardContent(contract));
    body.appendChild(content);

    card.append(trigger, body);
    accordionEl.appendChild(card);
    accordionCards[contract] = card;

    // Toggle
    trigger.addEventListener('click', () => {
      const isActive = card.classList.contains('active');

      // Close all cards
      Object.values(accordionCards).forEach((c) => c.classList.remove('active'));

      if (!isActive) {
        card.classList.add('active');

        // Solo contract on map
        Object.keys(LINE_CONFIG).forEach((c) => {
          const shouldShow = c === contract;
          const isVisible = visibleContracts.has(c);
          if (shouldShow && !isVisible) {
            toggleLayer(c, true);
            const cb = document.querySelector(`.legend-item[data-layer="${c}"] input[type="checkbox"]`);
            if (cb) cb.checked = true;
          } else if (!shouldShow && isVisible) {
            toggleLayer(c, false);
            const cb = document.querySelector(`.legend-item[data-layer="${c}"] input[type="checkbox"]`);
            if (cb) cb.checked = false;
          }
        });

        // Animate progress bars
        setTimeout(() => {
          content.querySelectorAll('.card-progress-fill').forEach((bar) => {
            bar.style.width = bar.dataset.targetWidth;
          });
        }, 80);
      } else {
        // Reopen all contracts
        Object.keys(LINE_CONFIG).forEach((c) => {
          if (!visibleContracts.has(c)) {
            toggleLayer(c, true);
            const cb = document.querySelector(`.legend-item[data-layer="${c}"] input[type="checkbox"]`);
            if (cb) cb.checked = true;
          }
        });
      }
    });
  });

  // Open accordion when clicking contract lines on map
  Object.keys(LINE_CONFIG).forEach((contract) => {
    const lineId = `line-${contract}`;
    const glowId = `line-${contract}-glow`;

    [lineId, glowId].forEach((layerId) => {
      if (!map.getLayer(layerId)) return;

      map.on('click', layerId, (e) => {
        const bbox = [[e.point.x - 12, e.point.y - 12], [e.point.x + 12, e.point.y + 12]];
        const pointFeatures = map.queryRenderedFeatures(bbox, { layers: pointLayerIds });
        if (pointFeatures.length > 0) return;
        e.preventDefault();

        // Toggle accordion card
        const card = accordionCards[contract];
        if (card) card.querySelector('.accordion-trigger').click();
      });

      map.on('mouseenter', layerId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = '';
      });
    });
  });

  // --- TIMELINE SLIDER ---
  const timelineSlider = document.getElementById('timeline-slider');
  const timelineDateDisplay = document.getElementById('timeline-date-display');
  const timelineProgress = document.getElementById('timeline-progress');

  let timelineRAF = null;
  timelineSlider.addEventListener('input', (e) => {
    const t = parseFloat(e.target.value);
    const startMs = TIMELINE_START.getTime();
    const endMs = TIMELINE_END.getTime();
    const dateMs = startMs + t * (endMs - startMs);
    currentTimelineDate = new Date(dateMs);

    // Update display
    if (t >= 0.999) {
      timelineDateDisplay.textContent = 'All Completed';
    } else {
      timelineDateDisplay.textContent = currentTimelineDate.toLocaleDateString('en-US', {
        year: 'numeric', month: 'short',
      });
    }
    timelineProgress.style.width = (t * 100) + '%';

    // Apply point dimming immediately (cheap GPU operation)
    applyTimelineFilter();

    // Throttle line + connector geometry updates
    if (timelineRAF) cancelAnimationFrame(timelineRAF);
    timelineRAF = requestAnimationFrame(() => {
      const z = map.getZoom();
      updateContractLineProgress(z);
      const connSource = map.getSource('connector-lines');
      if (connSource) connSource.setData(buildConnectorGeoJSON(z));
      timelineRAF = null;
    });
  });

  // --- 3D BUILDINGS TOGGLE ---
  let is3D = false;
  const toggle3DBtn = document.getElementById('toggle-3d');

  toggle3DBtn.addEventListener('click', () => {
    is3D = !is3D;
    toggle3DBtn.classList.toggle('active', is3D);

    if (is3D) {
      map.easeTo({ pitch: 60, duration: 800 });
      map.setLight({ anchor: 'viewport', intensity: 0.15, color: '#ffffff' });
      if (!map.getLayer('3d-buildings')) {
        map.addLayer({
          id: '3d-buildings',
          source: 'composite',
          'source-layer': 'building',
          type: 'fill-extrusion',
          minzoom: 14,
          paint: {
            'fill-extrusion-color': '#f7f6f4',
            'fill-extrusion-height': ['get', 'height'],
            'fill-extrusion-base': ['get', 'min_height'],
            'fill-extrusion-opacity': 1,
          },
        });
      } else {
        map.setLayoutProperty('3d-buildings', 'visibility', 'visible');
      }
    } else {
      map.easeTo({ pitch: 0, duration: 800 });
      map.setLight({ anchor: 'viewport', intensity: 0.5 });
      if (map.getLayer('3d-buildings')) {
        map.setLayoutProperty('3d-buildings', 'visibility', 'none');
      }
    }
  });

  // Unified zoom handler
  map.on('zoom', () => {
    const zoom = map.getZoom();
    zoomEl.textContent = `Zoom: ${zoom.toFixed(1)}`;
    updatePointSources(zoom);
    applyPointFilters();
    applyTimelineFilter();
    updateContractLineProgress(zoom);
  });
  applyPointFilters();
  applyTimelineFilter();
});

}

