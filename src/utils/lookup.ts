import type { Model, PipelineStage } from 'mongoose';

type LookupPipeline = Extract<PipelineStage, { $lookup: unknown }>['$lookup']['pipeline'];

interface LookupOptions {
  /** A model, or a collection name for collections without one (Better Auth's `user`). */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: Model<any> | string;
  /** The field here: one id or a list of ids. */
  localField: string;
  /** The field there; `_id` by default. */
  foreignField?: string;
  as: string;
  /** Narrows or shapes what is joined, e.g. `[{ $match: { status: 'active' } }, { $project: { name: 1 } }]`. */
  pipeline?: LookupPipeline;
  /** Values from this document for `pipeline`, e.g. `{ rid: '$restaurantId' }` then `$$rid`. */
  let?: Record<string, unknown>;
}

/** A string id (or null) as an ObjectId; anything that is not an id becomes null instead of failing the query. */
const objectId = (input: unknown) => ({ $convert: { input, to: 'objectId', onError: null, onNull: null } });

/**
 * A `$lookup` from a field holding ids as strings (`restaurantId`, `roleIds`, `branchIds`) to another collection's
 * `_id`, which is an ObjectId: the ids are converted first, so the join uses the `_id` index. A list of ids joins every
 * match, as `$lookup` does with arrays. With another `foreignField` the values are compared as they are.
 */
export default function lookup({ from, localField, foreignField = '_id', as, pipeline, let: vars }: LookupOptions): PipelineStage.FacetPipelineStage[] {
  const convert = foreignField === '_id';
  const key = convert ? `__${as}Key` : localField;
  const source = `$${localField}`;
  return [
    ...(convert
      ? [{ $addFields: { [key]: { $cond: [{ $isArray: source }, { $map: { input: source, in: objectId('$$this') } }, objectId(source)] } } }]
      : []),
    { $lookup: { from: typeof from === 'string' ? from : from.collection.collectionName, localField: key, foreignField, as, ...(vars && { let: vars }), ...(pipeline && { pipeline }) } },
    ...(convert ? [{ $unset: key }] : []),
  ] as PipelineStage.FacetPipelineStage[];
}
