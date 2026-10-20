import Device from '../models/device';

/** Locks every POS terminal this member is unlocked on (after suspending, removing or clearing their PIN). */
export default async function signOffTerminals(membershipId: string) {
  await Device.updateMany({ 'actor.membershipId': membershipId }, { $set: { actor: null } });
}
