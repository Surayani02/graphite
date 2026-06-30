import type { Color } from "@graphite/protocol";
import { DocumentModel } from "../../../document/model";
import type { EngineState } from "../state";

interface RowSpec {
  readonly color: Color;
  readonly y: number;
  readonly cornerRadius: number;
}

/**
 * One entry per grid row. Iterated with `forEach` rather than indexed into
 * by a loop counter — `for...of`/`forEach` give directly-typed elements
 * (`RowSpec`, never `RowSpec | undefined`) under `noUncheckedIndexedAccess`,
 * so the row data never needs a non-null assertion to use.
 */
const ROWS: readonly RowSpec[] = [
  { color: { r: 99, g: 179, b: 237, a: 255 }, y: 40, cornerRadius: 12 }, // sky blue
  { color: { r: 246, g: 173, b: 85, a: 255 }, y: 190, cornerRadius: 25 }, // amber
  { color: { r: 104, g: 211, b: 145, a: 255 }, y: 340, cornerRadius: 38 }, // mint
  { color: { r: 159, g: 122, b: 234, a: 255 }, y: 490, cornerRadius: 50 }, // lavender
];

/** Named column positions instead of a tuple array — a property lookup
 * (`COL_X.plain`) is never `| undefined` under `noUncheckedIndexedAccess`
 * the way `colX[0]` would be, since it isn't an indexed access at all. */
const COL_X = { plain: 40, rounded: 220, ellipse: 400, stroked: 580 } as const;

/**
 * Builds the default 4 × 4 demo scene into a new DocumentModel and stores
 * it on `state.docModel`. Called on `document:new` (no saved document was
 * found in localStorage).
 *
 * Layout:
 *   Col 0  Plain filled rect
 *   Col 1  Rounded rect (corner radius increases by row)
 *   Col 2  Ellipse (row 1 = perfect circle, others = horizontal ellipse)
 *   Col 3  Semi-transparent fill + full-opacity stroke
 *          (ellipse on even rows, rounded rect on odd rows)
 */
export function buildDemoScene(state: EngineState): void {
  state.docModel = new DocumentModel("Demo Scene");
  const doc = state.docModel;

  const frameId = crypto.randomUUID();
  doc.addFrame(frameId, 0, 0, 800, 700, "Page 1");

  ROWS.forEach(({ color: fill, y, cornerRadius }, index) => {
    const isCircle = index === 1;
    const isEven = index % 2 === 0;

    // Col 0: plain rect
    doc.addRect(crypto.randomUUID(), frameId, COL_X.plain, y, 130, 100, fill);

    // Col 1: rounded rect
    const rrId = crypto.randomUUID();
    doc.addRect(rrId, frameId, COL_X.rounded, y, 130, 100, fill, "Rounded Rect");
    doc.setCornerRadius(rrId, cornerRadius);

    // Col 2: ellipse (row 1 = perfect circle)
    doc.addEllipse(
      crypto.randomUUID(),
      frameId,
      isCircle ? COL_X.ellipse + 15 : COL_X.ellipse,
      y,
      isCircle ? 100 : 130,
      100,
      fill
    );

    // Col 3: semi-transparent fill + opaque stroke
    const halfFill: Color = { ...fill, a: Math.round(fill.a * 0.28) };
    const sid = crypto.randomUUID();
    if (isEven) {
      doc.addEllipse(sid, frameId, COL_X.stroked, y, 130, 100, halfFill, "Stroked Ellipse");
    } else {
      doc.addRect(sid, frameId, COL_X.stroked, y, 130, 100, halfFill, "Stroked Rect");
      doc.setCornerRadius(sid, cornerRadius);
    }
    doc.setStroke(sid, { ...fill, a: 255 }, 5);
  });
}
