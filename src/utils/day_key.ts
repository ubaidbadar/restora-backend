import PKT from '../constants/pkt';

const keyFormat = new Intl.DateTimeFormat('en-CA', { timeZone: PKT, year: 'numeric', month: '2-digit', day: '2-digit' });

/** The PKT calendar day as YYYY-MM-DD. */
const dayKey = (value: string | number | Date = Date.now()) => keyFormat.format(new Date(value));

export default dayKey;
