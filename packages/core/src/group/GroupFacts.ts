/**
 * The facts recorded about a group itself: its creation and its renames. Admissions and follows
 * have facts of their own, in `GroupMembershipFacts` and `GroupFollowFacts`. `GroupProjection`
 * keeps `GroupStore` from these.
 *
 * @since 0.1.0
 */
import * as Audience from "../journal/Audience.ts";
import * as Fact from "../journal/Fact.ts";
import * as Subject from "../journal/Subject.ts";
import * as Group from "./Group.ts";

/**
 * A group was created, as its record says. Its members may learn of it; a public one is news to
 * the whole workspace, since anyone there might join it.
 *
 * @category facts
 * @since 0.1.0
 */
export const Created = Fact.make("group.created", {
  audience: (payload) =>
    payload.kind === "Team" && payload.visibility === "Public"
      ? [Audience.workspace, Group.audienceOf(payload.id)]
      : [Group.audienceOf(payload.id)],
  version: 1,
  subject: (payload) => Subject.make("group", payload.id),
  occurrence: (payload) => [payload.id],
  payload: Group.Group,
});

/**
 * A team group's name changed; each rename is its own fact, which the group's members may learn
 * of.
 *
 * @category facts
 * @since 0.1.0
 */
export const Renamed = Fact.make("group.renamed", {
  audience: (payload) => [Group.audienceOf(payload.groupId)],
  version: 1,
  subject: (payload) => Subject.make("group", payload.groupId),
  payload: Group.Renamed,
});
