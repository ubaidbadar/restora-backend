const SEGMENTS = ['inactive', 'vip', 'khata'] as const;

export type Segment = (typeof SEGMENTS)[number];

export default SEGMENTS;
