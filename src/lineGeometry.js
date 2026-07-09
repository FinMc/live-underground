import geometryByLine from "./line-geometry.json" with { type: "json" };

// This app's "lat/lng" values were never real GPS - they're whatever
// Leaflet computed for a click on the schematic map image stretched over
// the arbitrary bounds in UndergroundMap.jsx. haversineMetres() below
// applies the real-Earth-radius formula to those fake coordinates, which
// gives a number in a consistent but *inflated* unit (empirically ~2.5-3x
// real-world distances for this particular map/bounds) - fine for relative
// comparisons and thresholds tuned against this same space, meaningless as
// an actual metric distance. All thresholds in this file were picked by
// inspecting the extracted geometry's own gap distribution, not by
// assuming real-world scale.
const EARTH_RADIUS_METRES = 6371000;

// Endpoints of separate SVG subpaths that are visually touching (a corner,
// or - far more commonly - a station, since this map's artist breaks each
// line's path at every stop for the roundel to render on top) but not
// numerically identical get merged into one graph node if they're closer
// than this. Chosen from the extracted geometry's own nearest-endpoint-gap
// histogram: genuine corner/station breaks cluster under ~260, unrelated
// endpoints start around ~400+, so 300 sits cleanly in the gap between them.
const NODE_MERGE_METRES = 300;

// Threshold above which we don't trust a station's snapped position enough
// to route along it - the caller falls back to a straight line instead of
// letting an animation jump through a mis-clicked/mis-extracted point.
// Matches the scale of the extraction fit report (median ~63, 93% under
// 150) with headroom for imperfect-but-usable snaps.
export const MAX_PLAUSIBLE_SNAP_METRES = 400;

const toRad = (deg) => (deg * Math.PI) / 180;

const haversineMetres = ([lat1, lng1], [lat2, lng2]) => {
  const dPhi = toRad(lat2 - lat1);
  const dLambda = toRad(lng2 - lng1);
  const a =
    Math.sin(dPhi / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLambda / 2) ** 2;
  return 2 * EARTH_RADIUS_METRES * Math.asin(Math.sqrt(a));
};

// Closest point on segment [a,b] to p, treating lat/lng as locally planar -
// fine at the scale of a single tube-map segment (tens to low hundreds of
// metres), and only used to pick a point, not to report a distance.
const closestPointOnSegment = (p, a, b) => {
  const [px, py] = p;
  const [ax, ay] = a;
  const [bx, by] = b;
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return { point: a, t: 0 };
  let t = ((px - ax) * dx + (py - ay) * dy) / lengthSquared;
  t = Math.max(0, Math.min(1, t));
  return { point: [ax + t * dx, ay + t * dy], t };
};

// --- Per-line graph -----------------------------------------------------
// Each SVG subpath becomes one edge between two (merged) endpoint nodes.
// Edge geometry is kept as-is (with its internal points) so a route can
// re-use it directly rather than re-flattening.

const buildGraph = (polylines) => {
  // Cluster every edge endpoint into nodes via Union-Find rather than
  // greedily matching each new point against whichever existing cluster is
  // checked first: "within NODE_MERGE_METRES" isn't transitive (A can be
  // close to B and B close to C without A being close to C), so a handful
  // of endpoints that are all mutually near one real junction can end up
  // split across separate "first match wins" clusters depending on
  // processing order. Union-Find merges all of them together regardless of
  // order, which is what a junction actually is.
  const endpoints = [];
  polylines.forEach((points, edgeIndex) => {
    endpoints.push({ point: points[0], edgeIndex, end: "from" });
    endpoints.push({ point: points[points.length - 1], edgeIndex, end: "to" });
  });

  const parent = endpoints.map((_, i) => i);
  const find = (i) => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  const union = (i, j) => {
    const ri = find(i);
    const rj = find(j);
    if (ri !== rj) parent[ri] = rj;
  };

  for (let i = 0; i < endpoints.length; i++) {
    for (let j = i + 1; j < endpoints.length; j++) {
      if (haversineMetres(endpoints[i].point, endpoints[j].point) <= NODE_MERGE_METRES) {
        union(i, j);
      }
    }
  }

  const nodePoints = [];
  const rootToNodeId = new Map();
  endpoints.forEach((endpoint, i) => {
    const root = find(i);
    if (!rootToNodeId.has(root)) {
      rootToNodeId.set(root, nodePoints.length);
      nodePoints.push(endpoint.point);
    }
  });

  const edges = polylines.map((points, edgeIndex) => {
    const cumulative = [0];
    for (let i = 1; i < points.length; i++) {
      cumulative.push(cumulative[i - 1] + haversineMetres(points[i - 1], points[i]));
    }
    return {
      points,
      cumulative,
      length: cumulative[cumulative.length - 1],
      fromNode: rootToNodeId.get(find(edgeIndex * 2)),
      toNode: rootToNodeId.get(find(edgeIndex * 2 + 1)),
    };
  });

  const adjacency = nodePoints.map(() => []); // { edgeIndex, viaEnd: 'from'|'to' }
  edges.forEach((edge, edgeIndex) => {
    adjacency[edge.fromNode].push({ edgeIndex, viaEnd: "from" });
    adjacency[edge.toNode].push({ edgeIndex, viaEnd: "to" });
  });

  return { nodePoints, edges, adjacency };
};

const graphCache = new Map();
const getGraph = (lineId) => {
  if (!graphCache.has(lineId)) {
    graphCache.set(lineId, buildGraph(geometryByLine[lineId] || []));
  }
  return graphCache.get(lineId);
};

// --- Snapping -------------------------------------------------------------

const snapCache = new Map();

// Finds the closest point on lineId's drawn geometry to [lat,lng]. Result is
// memoised per (lineId, cacheKey) - callers pass a stable id (e.g. a
// station's naptanId) since the same station is looked up every tick.
export const snapToLine = (lineId, cacheKey, latlng) => {
  const key = `${lineId}:${cacheKey}`;
  if (snapCache.has(key)) return snapCache.get(key);

  const graph = getGraph(lineId);
  let best = null;

  graph.edges.forEach((edge, edgeIndex) => {
    for (let i = 1; i < edge.points.length; i++) {
      const { point, t } = closestPointOnSegment(latlng, edge.points[i - 1], edge.points[i]);
      const distanceMetres = haversineMetres(latlng, point);
      if (!best || distanceMetres < best.distanceMetres) {
        const arcLength = edge.cumulative[i - 1] + t * (edge.cumulative[i] - edge.cumulative[i - 1]);
        best = { lineId, edgeIndex, arcLength, point, distanceMetres };
      }
    }
  });

  snapCache.set(key, best);
  return best;
};

// --- Routing ----------------------------------------------------------

const sliceEdgeForward = (edge, fromArc, toArc) => {
  const points = [];
  const pushInterpolated = (arc) => {
    let i = 1;
    while (i < edge.cumulative.length - 1 && edge.cumulative[i] < arc) i++;
    const segStart = edge.cumulative[i - 1];
    const segEnd = edge.cumulative[i];
    const t = segEnd === segStart ? 0 : (arc - segStart) / (segEnd - segStart);
    const [ax, ay] = edge.points[i - 1];
    const [bx, by] = edge.points[i];
    points.push([ax + t * (bx - ax), ay + t * (by - ay)]);
  };

  pushInterpolated(fromArc);
  edge.points.forEach((p, i) => {
    if (edge.cumulative[i] > fromArc && edge.cumulative[i] < toArc) points.push(p);
  });
  pushInterpolated(toArc);
  return points;
};

const pointsToRoute = (points) => {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1] + haversineMetres(points[i - 1], points[i]));
  }
  return { points, cumulative, length: cumulative[cumulative.length - 1] };
};

// Shortest path (by arc length) between two node ids in a line's graph,
// returned as an ordered list of {edgeIndex, forward} hops. Dijkstra over a
// graph with a few dozen nodes per line - no need for anything fancier.
const shortestNodePath = (graph, startNode, endNode) => {
  if (startNode === endNode) return [];

  const dist = new Array(graph.nodePoints.length).fill(Infinity);
  const prevHop = new Array(graph.nodePoints.length).fill(null);
  dist[startNode] = 0;
  const visited = new Set();

  while (visited.size < graph.nodePoints.length) {
    let current = -1;
    let currentDist = Infinity;
    for (let i = 0; i < dist.length; i++) {
      if (!visited.has(i) && dist[i] < currentDist) {
        current = i;
        currentDist = dist[i];
      }
    }
    if (current === -1) break;
    visited.add(current);
    if (current === endNode) break;

    graph.adjacency[current].forEach(({ edgeIndex, viaEnd }) => {
      const edge = graph.edges[edgeIndex];
      const neighbour = viaEnd === "from" ? edge.toNode : edge.fromNode;
      const newDist = currentDist + edge.length;
      if (newDist < dist[neighbour]) {
        dist[neighbour] = newDist;
        prevHop[neighbour] = { node: current, edgeIndex, forward: viaEnd === "from" };
      }
    });
  }

  if (dist[endNode] === Infinity) return null;

  const hops = [];
  let node = endNode;
  while (node !== startNode) {
    const hop = prevHop[node];
    hops.unshift(hop);
    node = hop.node;
  }
  return hops;
};

const routeCache = new Map();

// Builds the polyline to walk between two snapped positions on the same
// line, following the drawn geometry (possibly via other subpaths/branches
// through the line's graph). Returns null if no path connects them - the
// caller should fall back to a straight-line interpolation.
export const routeBetween = (lineId, fromCacheKey, fromSnap, toCacheKey, toSnap) => {
  const key = `${lineId}:${fromCacheKey}:${toCacheKey}`;
  if (routeCache.has(key)) return routeCache.get(key);

  const result = computeRoute(lineId, fromSnap, toSnap);
  routeCache.set(key, result);
  return result;
};

const computeRoute = (lineId, fromSnap, toSnap) => {
  if (!fromSnap || !toSnap) return null;
  const graph = getGraph(lineId);

  if (fromSnap.edgeIndex === toSnap.edgeIndex) {
    const edge = graph.edges[fromSnap.edgeIndex];
    const points =
      fromSnap.arcLength <= toSnap.arcLength
        ? sliceEdgeForward(edge, fromSnap.arcLength, toSnap.arcLength)
        : sliceEdgeForward(edge, toSnap.arcLength, fromSnap.arcLength).reverse();
    return pointsToRoute(points);
  }

  const fromEdge = graph.edges[fromSnap.edgeIndex];
  const toEdge = graph.edges[toSnap.edgeIndex];

  // Try routing via each endpoint of the start/end edges, keep the shortest.
  let bestPoints = null;
  let bestLength = Infinity;

  [
    { node: fromEdge.fromNode, leadIn: sliceEdgeForward(fromEdge, 0, fromSnap.arcLength).reverse() },
    { node: fromEdge.toNode, leadIn: sliceEdgeForward(fromEdge, fromSnap.arcLength, fromEdge.length) },
  ].forEach(({ node: startNode, leadIn }) => {
    [
      { node: toEdge.fromNode, leadOut: sliceEdgeForward(toEdge, 0, toSnap.arcLength) },
      { node: toEdge.toNode, leadOut: sliceEdgeForward(toEdge, toSnap.arcLength, toEdge.length).reverse() },
    ].forEach(({ node: endNode, leadOut }) => {
      const hops = shortestNodePath(graph, startNode, endNode);
      if (hops === null) return;

      // Each hop's edge starts at the node the previous hop (or leadIn)
      // already ended at - drop that shared point so it isn't duplicated.
      const middle = [];
      hops.forEach((hop) => {
        const edge = graph.edges[hop.edgeIndex];
        const pts = hop.forward ? edge.points : [...edge.points].reverse();
        middle.push(...pts.slice(1));
      });

      const route = pointsToRoute([...leadIn, ...middle, ...leadOut.slice(1)]);

      if (route.length < bestLength) {
        bestLength = route.length;
        bestPoints = route;
      }
    });
  });

  // No distance-ratio sanity check here deliberately: this is a schematic
  // diagram, not a scaled map, and it stretches dense Zone 1 interchanges
  // apart for legibility (confirmed by visually inspecting the extracted
  // Circle line route between Liverpool Street and Aldgate, which looked
  // like an implausible detour by raw distance but traces the real line
  // exactly). Dijkstra's shortest path through the graph is the most
  // trustworthy answer available - if it exists at all, use it; a station's
  // snap quality (see MAX_PLAUSIBLE_SNAP_METRES) is a more reliable signal
  // of trouble than the resulting route's length.
  return bestPoints;
};

export const pointAtFraction = (route, fraction) => {
  if (!route || route.points.length === 0) return null;
  if (route.points.length === 1) return route.points[0];

  const targetDistance = Math.max(0, Math.min(1, fraction)) * route.length;
  let i = 1;
  while (i < route.cumulative.length - 1 && route.cumulative[i] < targetDistance) i++;

  const segStart = route.cumulative[i - 1];
  const segEnd = route.cumulative[i];
  const t = segEnd === segStart ? 0 : (targetDistance - segStart) / (segEnd - segStart);
  const [ax, ay] = route.points[i - 1];
  const [bx, by] = route.points[i];
  return [ax + t * (bx - ax), ay + t * (by - ay)];
};
