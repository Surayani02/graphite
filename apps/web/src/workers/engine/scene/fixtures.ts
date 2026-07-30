/**
 * Path fixture corpus (ADR-032 Decision 5) — dev-only.
 *
 * M1 renders paths the product cannot yet author: the path *document
 * model* is M2, so there is no `DocNode` kind, no op, and no tool that
 * makes one. The corpus is therefore built **below the document layer**,
 * straight onto the scene graph via `add_path`, and the worker enters
 * *fixture mode* so scene-mutating input cannot corrupt a scene the
 * document knows nothing about.
 *
 * The alternative — pulling the path DocNode kind forward — was rejected
 * in ADR-032: it drags the schema bump, `.graphite` v2 migration,
 * validation ceilings, and op semantics into a rendering milestone.
 *
 * Shapes mirror `graphite-geometry`'s Rust corpus so a visual golden and a
 * mesh snapshot describe the same geometry, with one addition that only
 * exists here: an SDF/path alternating strip, which is a *worker* concern
 * (it exercises `buildDrawPlan`'s worst case, not the tessellator).
 */
import { SceneGraph } from "@graphite/engine";
import { setSelection } from "../selection";
import { markSceneDirty, type EngineState } from "../state";

/** Fill rule codes, matching `add_path`'s flat encoding. */
const NONZERO = 0;
const EVENODD = 1;

/** Cap/join codes, matching `add_path`'s flat encoding. */
const CAP_ROUND = 1;
const JOIN_ROUND = 1;

/** Cubic-arc circle constant, 4/3·tan(π/8). */
const KAPPA = 0.5522848;

interface Pt {
  readonly x: number;
  readonly y: number;
  readonly hIn?: readonly [number, number];
  readonly hOut?: readonly [number, number];
}

/** Flattens contours into the (descriptors, points) pair `add_path` takes. */
function encode(contours: readonly { closed: boolean; points: readonly Pt[] }[]): {
  descs: Uint32Array;
  points: Float32Array;
} {
  const descs = new Uint32Array(contours.length * 2);
  const points: number[] = [];
  contours.forEach((contour, index) => {
    descs[index * 2] = contour.points.length;
    descs[index * 2 + 1] = contour.closed ? 1 : 0;
    for (const p of contour.points) {
      const hIn = p.hIn ?? [p.x, p.y];
      const hOut = p.hOut ?? [p.x, p.y];
      points.push(p.x, p.y, hIn[0], hIn[1], hOut[0], hOut[1]);
    }
  });
  return { descs, points: new Float32Array(points) };
}

/** Corner points from an (x, y) list. */
const corners = (pairs: readonly (readonly [number, number])[]): Pt[] =>
  pairs.map(([x, y]) => ({ x, y }));

/** Four-arc cubic circle; negative radius reverses the winding. */
function circle(cx: number, cy: number, radius: number): { closed: boolean; points: Pt[] } {
  const r = Math.abs(radius);
  const s = Math.sign(radius);
  const k = KAPPA * r;
  return {
    closed: true,
    points: [
      { x: cx + r, y: cy, hIn: [cx + r, cy - s * k], hOut: [cx + r, cy + s * k] },
      { x: cx, y: cy + s * r, hIn: [cx + k, cy + s * r], hOut: [cx - k, cy + s * r] },
      { x: cx - r, y: cy, hIn: [cx - r, cy + s * k], hOut: [cx - r, cy - s * k] },
      { x: cx, y: cy - s * r, hIn: [cx - k, cy - s * r], hOut: [cx + k, cy - s * r] },
    ],
  };
}

/** Five-pointed {5/2} star — the fill-rule truth-table subject. */
function star(cx: number, cy: number, r: number): { closed: boolean; points: Pt[] } {
  const points: Pt[] = [];
  for (let k = 0; k < 5; k += 1) {
    const vertex = (k * 2) % 5;
    const angle = (Math.PI * 2 * vertex) / 5 - Math.PI / 2;
    points.push({ x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) });
  }
  return { closed: true, points };
}

interface FixtureSpec {
  readonly name: string;
  readonly x: number;
  readonly y: number;
  readonly contours: readonly { closed: boolean; points: readonly Pt[] }[];
  readonly fillRule: number;
  readonly fill: readonly [number, number, number, number];
  readonly strokeWidth?: number;
}

/** Grid pitch, in world units. Wide enough that no fixture's stroke or
 *  miter spike reaches its neighbour — overlap would make a visual golden
 *  ambiguous about which shape regressed. */
const PITCH = 560;

/**
 * The corpus, built on call rather than at module scope.
 *
 * This is load-bearing for ADR-027's production-exclusion rule, not a
 * style choice: `star()` and `circle()` are function calls, and a module
 * that runs them at import time is not provably side-effect-free, so
 * rollup keeps the whole module even though every caller sits behind
 * `import.meta.env.DEV`. As a top-level `const` this shipped its geometry
 * into the production worker bundle — caught by grepping the built
 * artifact for fixture names. Inside a function, the module has no
 * top-level work and drops cleanly, which is why `stress.ts` never had
 * this problem.
 */
function specs(): readonly FixtureSpec[] {
  return [
    {
      name: "triangle",
      x: 0,
      y: 0,
      contours: [
        {
          closed: true,
          points: corners([
            [0, 0],
            [240, 0],
            [0, 180],
          ]),
        },
      ],
      fillRule: NONZERO,
      fill: [99, 179, 237, 255],
    },
    {
      name: "star_nonzero",
      x: PITCH,
      y: 0,
      contours: [star(200, 200, 200)],
      fillRule: NONZERO,
      fill: [246, 173, 85, 255],
    },
    {
      name: "star_evenodd",
      x: PITCH * 2,
      y: 0,
      contours: [star(200, 200, 200)],
      fillRule: EVENODD,
      fill: [246, 173, 85, 255],
    },
    {
      name: "figure_eight",
      x: 0,
      y: PITCH,
      contours: [
        {
          closed: true,
          points: [
            { x: 50, y: 200, hIn: [50, 360], hOut: [50, 40] },
            { x: 350, y: 200, hIn: [350, 360], hOut: [350, 40] },
          ],
        },
      ],
      fillRule: NONZERO,
      fill: [104, 211, 145, 255],
    },
    {
      name: "donut_nonzero",
      x: PITCH,
      y: PITCH,
      contours: [circle(200, 200, 200), circle(200, 200, -100)],
      fillRule: NONZERO,
      fill: [159, 122, 234, 255],
    },
    {
      name: "donut_evenodd",
      x: PITCH * 2,
      y: PITCH,
      contours: [circle(200, 200, 200), circle(200, 200, -100)],
      fillRule: EVENODD,
      fill: [159, 122, 234, 255],
    },
    {
      name: "polyline_open",
      x: 0,
      y: PITCH * 2,
      contours: [
        {
          closed: false,
          points: corners([
            [0, 0],
            [120, 220],
            [260, 20],
            [380, 200],
          ]),
        },
      ],
      fillRule: NONZERO,
      fill: [0, 0, 0, 0], // stroke-only: the cap and join subject
      strokeWidth: 24,
    },
    {
      name: "miter_spikes",
      x: PITCH,
      y: PITCH * 2,
      contours: [
        {
          closed: false,
          points: corners([
            [0, 0],
            [300, 20],
            [0, 40],
            [300, 60],
            [0, 80],
          ]),
        },
      ],
      fillRule: NONZERO,
      fill: [0, 0, 0, 0],
      strokeWidth: 10,
    },
    {
      name: "long_cubic",
      x: PITCH * 2,
      y: PITCH * 2,
      contours: [
        {
          closed: false,
          points: [
            { x: 0, y: 200, hOut: [140, -100] },
            { x: 400, y: 200, hIn: [260, 500] },
          ],
        },
      ],
      fillRule: NONZERO,
      fill: [0, 0, 0, 0],
      strokeWidth: 16,
    },
  ];
}

/**
 * Builds the corpus onto the scene graph and enters fixture mode.
 *
 * Every fixture is parented to one frame, so the existing cull and
 * paint-order machinery treats them exactly as it treats shapes — the
 * point is to exercise the real render path, not a bypass of it.
 *
 * The alternating strip is appended last: rects and paths interleaved
 * one-for-one, which is `buildDrawPlan`'s recorded worst case (one draw
 * per node) and the only fixture here that is about the worker rather
 * than the tessellator.
 */
export function buildPathFixtures(state: EngineState, zoom?: number): void {
  performance.mark("fixtures-start");
  // Fresh graph rather than a clear() the engine does not expose, and the
  // id maps and selection cleared alongside it — `rebuildSceneFromDocument`
  // verbatim, including its choice not to `free()` the old graph. Matching
  // it matters more than improving it here: if that is a leak it is one
  // everywhere, and it should be fixed uniformly rather than diverging in
  // a dev-only path.
  const graph = new SceneGraph();
  state.sceneGraph = graph;
  state.uuidToEngineId.clear();
  state.engineIdToUuid.clear();
  setSelection(state, null);
  const frame = graph.add_frame(-200, -200, PITCH * 3 + 400, PITCH * 3 + 400);

  for (const spec of specs()) {
    const { descs, points } = encode(spec.contours);
    const stroke = spec.strokeWidth ?? 0;
    graph.add_path(
      frame,
      spec.x,
      spec.y,
      descs,
      points,
      spec.fillRule,
      spec.fill[0],
      spec.fill[1],
      spec.fill[2],
      spec.fill[3],
      230,
      230,
      240,
      stroke > 0 ? 255 : 0,
      stroke,
      CAP_ROUND,
      JOIN_ROUND,
      4
    );
  }

  // Alternating SDF/path strip — buildDrawPlan's worst case.
  const stripY = PITCH * 3;
  for (let i = 0; i < STRIP_COUNT; i += 1) {
    const x = i * 120;
    graph.add_rect(frame, x, stripY, 80, 80, 99, 179, 237, 255);
    const { descs, points } = encode([
      {
        closed: true,
        points: corners([
          [0, 0],
          [80, 0],
          [40, 80],
        ]),
      },
    ]);
    graph.add_path(
      frame,
      x,
      stripY + 120,
      descs,
      points,
      NONZERO,
      246,
      173,
      85,
      255,
      0,
      0,
      0,
      0,
      0,
      CAP_ROUND,
      JOIN_ROUND,
      4
    );
  }

  // Deterministic framing. A pixel golden compares images, so the camera
  // must land in exactly the same place every run — an inherited camera
  // from whatever the user was doing would change every baseline. Centred
  // on the corpus at a zoom that fits it, which also puts the starting
  // tolerance bucket at −2, two boundaries below the zoom levels the
  // golden spec drives to.
  state.camX = CORPUS_WIDTH / 2;
  state.camY = CORPUS_HEIGHT / 2;
  state.zoom = zoom !== undefined && zoom > 0 ? zoom : FIXTURE_ZOOM;

  state.fixtureMode = true;
  markSceneDirty(state);
  performance.mark("fixtures-end");
  performance.measure("path-fixtures", "fixtures-start", "fixtures-end");
}

/** Number of path nodes the corpus creates — asserted by tests so a
 *  silently-rejected `add_path` (which returns `u32::MAX` rather than
 *  throwing) cannot pass as success. A function, not a const, for the
 *  same tree-shaking reason as `specs()`. */
export function fixturePathCount(): number {
  return specs().length + STRIP_COUNT;
}

/**
 * Total extent of the corpus in world units: a 3 × 3 grid of ≤400-unit
 * shapes at `PITCH` spacing, plus the alternating strip below it.
 *
 * These exist because the first golden capture framed on the *grid's*
 * centre and cut off both the triangle and — worse — the entire
 * alternating strip, which is the fixture that exercises the draw plan's
 * interleaving. A fixture outside the frame is a fixture that is not
 * being tested, and nothing in the suite would have said so.
 */
const CORPUS_WIDTH = PITCH * 2 + 400;
const CORPUS_HEIGHT = PITCH * 3 + 220;

/**
 * Framing zoom — fixed so visual goldens are stable, and low enough that
 * the whole corpus fits the canvas with margin at the 1280 × 720 viewport
 * the golden project uses. Deliberately generous: a panel-width change
 * that shrinks the canvas should crop nothing.
 */
export const FIXTURE_ZOOM = 0.3;

/** Alternating SDF/path strip length. */
const STRIP_COUNT = 8;
