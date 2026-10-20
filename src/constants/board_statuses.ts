const BOARD_STATUSES = ['new', 'preparing', 'ready', 'out_for_delivery', 'completed'] as const;

export type BoardStatus = (typeof BOARD_STATUSES)[number];

export default BOARD_STATUSES;
