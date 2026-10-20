const RESERVATION_STATUSES = ['pending', 'confirmed', 'seated', 'cancelled'] as const;

export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export default RESERVATION_STATUSES;
