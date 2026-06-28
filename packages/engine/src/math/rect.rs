/// Axis-aligned bounding rectangle in world space.
///
/// The coordinate system follows standard screen conventions:
/// `x` increases rightward, `y` increases downward.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

impl Rect {
    /// Returns `true` if `self` and `other` share any interior area.
    /// Rects that only touch at an edge are NOT considered to intersect.
    #[inline]
    pub fn intersects(&self, other: &Rect) -> bool {
        self.x < other.x + other.w
            && self.x + self.w > other.x
            && self.y < other.y + other.h
            && self.y + self.h > other.y
    }

    /// Returns `true` if the point `(px, py)` is strictly inside this rect.
    #[inline]
    pub fn contains_point(&self, px: f32, py: f32) -> bool {
        px >= self.x && px < self.x + self.w && py >= self.y && py < self.y + self.h
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn overlapping_rects_intersect() {
        let a = Rect {
            x: 0.0,
            y: 0.0,
            w: 100.0,
            h: 100.0,
        };
        let b = Rect {
            x: 50.0,
            y: 50.0,
            w: 100.0,
            h: 100.0,
        };
        assert!(a.intersects(&b));
        assert!(b.intersects(&a));
    }

    #[test]
    fn separate_rects_do_not_intersect() {
        let a = Rect {
            x: 0.0,
            y: 0.0,
            w: 100.0,
            h: 100.0,
        };
        let b = Rect {
            x: 200.0,
            y: 0.0,
            w: 100.0,
            h: 100.0,
        };
        assert!(!a.intersects(&b));
        assert!(!b.intersects(&a));
    }

    #[test]
    fn edge_touching_rects_do_not_intersect() {
        let a = Rect {
            x: 0.0,
            y: 0.0,
            w: 100.0,
            h: 100.0,
        };
        let b = Rect {
            x: 100.0,
            y: 0.0,
            w: 100.0,
            h: 100.0,
        };
        assert!(!a.intersects(&b));
    }

    #[test]
    fn point_inside_rect() {
        let r = Rect {
            x: 10.0,
            y: 10.0,
            w: 100.0,
            h: 100.0,
        };
        assert!(r.contains_point(50.0, 50.0));
        assert!(r.contains_point(10.0, 10.0)); // top-left corner is inside
    }

    #[test]
    fn point_outside_rect() {
        let r = Rect {
            x: 10.0,
            y: 10.0,
            w: 100.0,
            h: 100.0,
        };
        assert!(!r.contains_point(110.0, 110.0)); // bottom-right is outside
        assert!(!r.contains_point(0.0, 0.0));
    }
}
