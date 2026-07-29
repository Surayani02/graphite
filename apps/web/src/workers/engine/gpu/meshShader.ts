/**
 * Mesh shader — tessellated path geometry (Phase 8 M1, ADR-032 §7).
 *
 * Deliberately minimal beside the SDF shader: the geometry work already
 * happened in `graphite-geometry`, so this transforms vertices and emits a
 * flat colour. Edge anti-aliasing comes from the shared 4× MSAA target
 * (ADR-032 §2) — a tessellated triangle boundary has no analytic coverage
 * to compute the way an SDF does.
 *
 * Binding 0 — Camera uniform (32 bytes). Byte-identical to the SDF
 * shader's, and fed from the same buffer: one camera, one upload, no way
 * for the two pipelines to disagree about where the viewport is.
 *
 * Binding 1 — Per-draw uniform (48 bytes, 256-aligned dynamic offset):
 *   transform  vec4  (a, b, c, d) of the 2×2 linear part, column-major
 *   translate  vec2  world-space origin of the path's local frame
 *   _pad       vec2
 *   color      vec4  RGBA [0,1]
 *
 * The 2×2 is identity for every M1 draw — paths are placed by translation
 * alone. It exists now because M2's resize semantics scale path geometry,
 * and reserving the slots means that lands as a struct field change rather
 * than a pipeline and layout change (ADR-032 §7 reserved the room; this is
 * the shape it takes).
 */
export const MESH_SHADER_WGSL = /* wgsl */ `
struct Camera {
  scale  : vec2<f32>,
  offset : vec2<f32>,
  params : vec4<f32>,
}
struct DrawData {
  transform : vec4<f32>,
  translate : vec2<f32>,
  _pad      : vec2<f32>,
  color     : vec4<f32>,
}
@group(0) @binding(0) var<uniform> camera : Camera;
@group(0) @binding(1) var<uniform> draw   : DrawData;

struct VSOut {
  @builtin(position) clip : vec4<f32>,
}

@vertex
fn vs(@location(0) local : vec2<f32>) -> VSOut {
  // Local → world: 2×2 linear part then translation.
  let world = vec2<f32>(
    draw.transform.x * local.x + draw.transform.z * local.y,
    draw.transform.y * local.x + draw.transform.w * local.y
  ) + draw.translate;

  var out : VSOut;
  out.clip = vec4<f32>(world * camera.scale + camera.offset, 0.0, 1.0);
  return out;
}

@fragment
fn fs() -> @location(0) vec4<f32> {
  // Straight alpha out, matching the SDF shader. Premultiplying here and
  // switching the blend's source factor to one would composite identically,
  // but then the two pipelines would reach the same result by different
  // conventions — and the next person to touch either would have to
  // notice that to keep them in step. One convention, both pipelines.
  return draw.color;
}
`;
