import type { PipelineStage } from 'mongoose';
import lookup from './lookup';

/**
 * Joins a membership's Better Auth account (collection `user`) as `user`: its name, email and photo, or null when the
 * account is gone. For lists of staff, so names come in the same query.
 */
export default function lookupUser(localField = 'userId'): PipelineStage.FacetPipelineStage[] {
  return [
    ...lookup({ from: 'user', localField, as: 'user', pipeline: [{ $project: { _id: 0, id: { $toString: '$_id' }, name: 1, email: 1, image: { $ifNull: ['$image', null] } } }] }),
    { $set: { user: { $ifNull: [{ $first: '$user' }, null] } } },
  ];
}
