/**
 * Unified instanced shape shader (Phase 3/4).
 *
 * Binding 0 — Camera uniform (32 bytes):
 *   scale.xy  =  (2·zoom/vpW,  −2·zoom/vpH)   world → NDC scale (Y-flip)
 *   offset.xy =  (−camX·sx,   −camY·sy)       world → NDC offset
 *   params.x  =  1/zoom                        world units per screen pixel (AA width)
 *
 * Binding 1 — Shape storage buffer (64 bytes / instance):
 *   pos           vec2   world top-left
 *   size          vec2   world width, height
 *   fill          vec4   RGBA [0,1]
 *   stroke        vec4   RGBA [0,1]
 *   stroke_width  f32    world units
 *   corner_radius f32    world units  (rects only; 0 = sharp)
 *   shape_type    f32    0 = rect,  1 = ellipse
 *   _pad          f32
 *
 * Fragment stage evaluates an SDF, applies smoothstep antialiasing, then
 * composites stroke over fill using Porter-Duff src-over.
 */
export const SHADER_WGSL = /* wgsl */ `
struct Camera {
  scale  : vec2<f32>,
  offset : vec2<f32>,
  params : vec4<f32>,
}
struct ShapeData {
  pos          : vec2<f32>,
  size         : vec2<f32>,
  fill         : vec4<f32>,
  stroke       : vec4<f32>,
  stroke_width : f32,
  corner_radius: f32,
  shape_type   : f32,
  _pad         : f32,
}
@group(0) @binding(0) var<uniform>       camera : Camera;
@group(0) @binding(1) var<storage, read> shapes : array<ShapeData>;
struct VSOut {
  @builtin(position) clip_pos  : vec4<f32>,
  @location(0)       uv        : vec2<f32>,
  @location(1)       half_size : vec2<f32>,
  @location(2)       fill      : vec4<f32>,
  @location(3)       stroke    : vec4<f32>,
  @location(4)       params    : vec4<f32>,
}
@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VSOut {
  var corners = array<vec2<f32>, 6>(
    vec2(-0.5,-0.5),vec2(0.5,-0.5),vec2(-0.5,0.5),
    vec2(-0.5,0.5),vec2(0.5,-0.5),vec2(0.5,0.5),
  );
  let s=shapes[ii]; let uv=corners[vi];
  let world=s.pos+(uv+vec2(0.5))*s.size;
  let ndc=world*camera.scale+camera.offset;
  var out:VSOut;
  out.clip_pos=vec4(ndc,0.0,1.0); out.uv=uv;
  out.half_size=s.size*0.5; out.fill=s.fill; out.stroke=s.stroke;
  out.params=vec4(s.stroke_width,s.corner_radius,s.shape_type,camera.params.x);
  return out;
}
fn sdf_round_rect(p:vec2<f32>,half_size:vec2<f32>,r:f32)->f32{
  let q=abs(p)-half_size+vec2(r);
  return length(max(q,vec2(0.0)))+min(max(q.x,q.y),0.0)-r;
}
fn sdf_ellipse(p:vec2<f32>,ab:vec2<f32>)->f32{
  let k1=length(p/ab); return(k1-1.0)*min(ab.x,ab.y);
}
@fragment
fn fs(in:VSOut)->@location(0) vec4<f32>{
  let sw=in.params.x; let cr=in.params.y;
  let st=in.params.z; let ps=in.params.w;
  let local=in.uv*2.0*in.half_size;
  let sdf=select(sdf_round_rect(local,in.half_size,cr),sdf_ellipse(local,in.half_size),st>0.5);
  let aa=ps;
  let fa=smoothstep(aa,-aa,sdf)*in.fill.a;
  let hsw=sw*0.5;
  let sa=select(0.0,smoothstep(aa,-aa,abs(sdf)-hsw)*in.stroke.a,sw>0.0&&in.stroke.a>0.0);
  let oa=sa+fa*(1.0-sa);
  if(oa<0.0001){discard;}
  let orgb=(in.stroke.rgb*sa+in.fill.rgb*fa*(1.0-sa))/oa;
  return vec4(orgb,oa);
}
`;
