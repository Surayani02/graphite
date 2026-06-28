/// sRGB colour with pre-multiplied alpha stored as `u8` components.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Color {
    pub r: u8,
    pub g: u8,
    pub b: u8,
    pub a: u8,
}

impl Color {
    /// Returns the colour as normalised `[0.0, 1.0]` floats `[r, g, b, a]`.
    pub fn to_f32_array(self) -> [f32; 4] {
        [
            self.r as f32 / 255.0,
            self.g as f32 / 255.0,
            self.b as f32 / 255.0,
            self.a as f32 / 255.0,
        ]
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn white_normalises_to_ones() {
        let c = Color {
            r: 255,
            g: 255,
            b: 255,
            a: 255,
        };
        let f = c.to_f32_array();
        assert!((f[0] - 1.0).abs() < f32::EPSILON);
        assert!((f[3] - 1.0).abs() < f32::EPSILON);
    }

    #[test]
    fn black_normalises_to_zeros_rgb() {
        let c = Color {
            r: 0,
            g: 0,
            b: 0,
            a: 255,
        };
        let f = c.to_f32_array();
        assert_eq!(f[0], 0.0);
        assert_eq!(f[1], 0.0);
        assert_eq!(f[2], 0.0);
    }
}
