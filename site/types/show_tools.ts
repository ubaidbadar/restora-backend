export default interface ShowTools {
  state: 'active' | '';
  open: () => void;
  close: () => void;
}
