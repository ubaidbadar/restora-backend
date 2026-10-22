/** A group of add-ons a dish can take, with how many the guest must and may pick. */
export default interface AddonGroup {
  _id: string;
  name: string;
  min: number;
  max: number;
  options: { _id: string; name: string; price: number }[];
}
