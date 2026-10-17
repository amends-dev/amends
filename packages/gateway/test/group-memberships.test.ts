import { Assignment, AssignmentFacts, BuiltinRoles, Grant, Role, RoleFacts } from "@amends-dev/core/authorization"
import { CoreError } from "@amends-dev/core/error"
import {
  Group,
  GroupService,
  GroupMembership,
  GroupMembershipService,
  GroupMembershipFacts,
  GroupMembershipPermissions,
  GroupMembershipStore,
  GroupPermissions,
  GroupId
} from "@amends-dev/core/group"
import { Actor, Identity } from "@amends-dev/core/identity"
import { Event, Journal, Publication } from "@amends-dev/core/journal"
import {
  Invitation,
  InvitationFacts,
  Member,
  MemberService,
  MemberFacts,
  MemberPermissions,
  MemberId
} from "@amends-dev/core/workspace"
import { Gateway } from "@amends-dev/gateway"
import { Entry, StoreError } from "@amends-dev/log"
import { describe, expect, it } from "@effect/vitest"
import { Cause, Context, DateTime, Deferred, Effect, Exit, Fiber, Option } from "effect"
import { TestClock } from "effect/testing"
import { withStorage } from "./fixture.ts"
import * as Support from "./support.ts"
import {
  type Bound,
  boundTo,
  failingLate,
  journalLog,
  otherWorkspaceId,
  runHost,
  testProvenance,
  workspaceId
} from "./support.ts"

/** Group admission and departure: authority, workspace removal, concurrency, and replay. */

const { core, initialized, runGateway } = Support
describe("group memberships", () => {
  const journalId = Entry.LogId.make("journal")
  const managerId = MemberId.MemberId.make("manager")
  const humanId = MemberId.MemberId.make("new-human")
  const agentId = MemberId.MemberId.make("new-agent")
  const managerIdentity = Identity.MemberReference.cases.Human.make({
    id: Identity.HumanId.make("manager")
  })
  const add = (groupId: GroupId.GroupId, memberId: MemberId.MemberId) =>
    Effect.flatMap(GroupMembershipService.GroupMembershipService, (groupMembershipService) =>
      groupMembershipService.add({ groupId, memberId })
    )
  const create = (name: string, memberIds: ReadonlyArray<MemberId.MemberId> = []) =>
    Effect.flatMap(GroupService.GroupService, (groupService) => groupService.createTeam({ name, memberIds }))
  const run = <A, E, R>(bound: Bound, actor: Actor.Actor["Service"], effect: Effect.Effect<A, E, R>) =>
    effect.pipe(Effect.provideService(Actor.Actor, actor), Effect.provide(core(bound)))
  const publish = <A, E, R>(bound: Bound, effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provideService(Publication.Publication, testProvenance(bound.workspaceId)),
      Effect.provide(core(bound))
    )
  const history = (bound: Bound) => bound.store.read(journalId, { limit: 100 })
  /**
   * The admissions of the human and the agent the tests admit, leaving out the owner and the
   * manager, who belong to every prepared group because only its members manage a group.
   */
  const admitted = (records: ReadonlyArray<GroupMembership.GroupMembership>) =>
    records.filter((record) => record.memberId === humanId || record.memberId === agentId)
  const seedMembers = (bound: Bound) =>
    publish(
      bound,
      Effect.flatMap(Journal.Journal, (journal) =>
        journal.commit(
          Effect.gen(function* () {
            for (const [memberId, identity] of [
              [managerId, managerIdentity],
              [humanId, { _tag: "Human", id: Identity.HumanId.make("new-human") }],
              [agentId, { _tag: "Agent", id: Identity.AgentId.make("new-agent") }]
            ] as const)
              yield* journal.publish(MemberFacts.Added, {
                workspaceId: bound.workspaceId,
                memberId,
                identity,
                name: Member.Name.make(identity.id)
              })
          })
        )
      )
    )
  const prepare = Effect.fnUntraced(function* () {
    const bound = yield* boundTo(workspaceId)
    const workspace = yield* initialized(bound)
    const owner = Actor.Actor.of({
      workspaceId,
      memberId: workspace.ownerMemberId,
      identity: { _tag: "Human", id: workspace.createdBy }
    })
    yield* seedMembers(bound)
    // Only a group's members manage it, so the owner and the manager belong to both groups.
    const managers = [workspace.ownerMemberId, managerId]
    const group = yield* run(bound, owner, create("Engineering", managers))
    const otherGroup = yield* run(bound, owner, create("Design", managers))
    return {
      bound,
      owner,
      group,
      otherGroup,
      manager: Actor.Actor.of({ workspaceId, memberId: managerId, identity: managerIdentity })
    }
  })
  const grant = (bound: Bound, groupId: GroupId.GroupId) =>
    publish(
      bound,
      Effect.flatMap(Journal.Journal, (journal) =>
        journal.publish(AssignmentFacts.Created, {
          workspaceId: bound.workspaceId,
          assignmentId: Assignment.AssignmentId.make("group-management"),
          memberId: managerId,
          source: {
            _tag: "Direct",
            grant: Grant.make(GroupMembershipPermissions.Manage, {
              _tag: "Target",
              target: { _tag: "Group", workspaceId: bound.workspaceId, groupId }
            })
          }
        })
      )
    )

  const remove = (membership: GroupMembership.GroupMembership) =>
    Effect.flatMap(GroupMembershipService.GroupMembershipService, (groupMembershipService) =>
      groupMembershipService.remove({
        groupId: membership.groupId,
        membershipId: membership.id
      })
    )
  const leave = (membership: GroupMembership.GroupMembership) =>
    Effect.flatMap(GroupMembershipService.GroupMembershipService, (groupMembershipService) =>
      groupMembershipService.leave({
        groupId: membership.groupId,
        membershipId: membership.id
      })
    )
  const removeWorkspaceMember = (id: MemberId.MemberId) =>
    Effect.flatMap(MemberService.MemberService, (memberService) => memberService.remove(id))
  const memberActor = (memberId: MemberId.MemberId) =>
    Actor.Actor.of({
      workspaceId,
      memberId,
      identity:
        memberId === agentId
          ? { _tag: "Agent", id: Identity.AgentId.make("new-agent") }
          : { _tag: "Human", id: Identity.HumanId.make("new-human") }
    })

  it.effect("starts each workspace with a general group that nobody leaves until they leave the workspace", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner } = yield* prepare()
          expect(yield* bound.groups.get(Group.GeneralId)).toEqual(
            Option.some({
              id: Group.GeneralId,
              workspaceId,
              kind: "Team",
              visibility: "Public",
              name: "general",
              createdBy: owner.memberId,
              createdAt: expect.anything()
            })
          )
          const own = Option.getOrThrow(yield* bound.groupMemberships.findActive(Group.GeneralId, owner.memberId))
          const refused = new CoreError.Invalid({
            reason: new CoreError.GeneralMembership({
              groupId: Group.GeneralId
            })
          })
          // Nobody, person or agent, leaves it or is removed, however broad the authority.
          expect(yield* Effect.flip(run(bound, owner, leave(own)))).toEqual(refused)
          for (const memberId of [humanId, agentId]) {
            const admission = yield* run(bound, owner, add(Group.GeneralId, memberId))
            expect(yield* Effect.flip(run(bound, owner, remove(admission)))).toEqual(refused)
            expect(yield* Effect.flip(run(bound, memberActor(memberId), leave(admission)))).toEqual(refused)
          }
          // Leaving the workspace ends the admission.
          yield* run(bound, owner, removeWorkspaceMember(agentId))
          expect(
            (yield* bound.groupMemberships.listByGroup(Group.GeneralId))
              .filter((record) => record.status === "active")
              .map((record) => record.memberId)
              .sort()
          ).toEqual([humanId, owner.memberId].sort())
        })
      )
    )
  )

  it.effect(
    "adds human and agent members with group-scoped authority and records the actual actor and admission time",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, group, otherGroup, manager } = yield* prepare()
            yield* grant(bound, group.id)
            yield* TestClock.adjust("5 seconds")
            const before = yield* history(bound)
            const membership = yield* run(bound, manager, add(group.id, humanId))
            expect(membership).toMatchObject({
              workspaceId,
              groupId: group.id,
              memberId: humanId,
              status: "active"
            })
            expect(DateTime.isGreaterThan(membership.admittedAt, group.createdAt)).toBe(true)
            expect(yield* bound.groupMemberships.get(membership.id)).toEqual(Option.some(membership))
            expect(yield* bound.groups.get(group.id)).toEqual(Option.some(group))
            const events = yield* publish(
              bound,
              Effect.flatMap(Journal.Journal, (journal) => journal.log.read({ limit: 100 }))
            )
            expect(events).toHaveLength(before.length + 1)
            const batch = events.at(-1)
            expect(batch?.entries).toHaveLength(1)
            expect(batch?.entries[0]?.payload.name).toBe(GroupMembershipFacts.Added.name)
            expect(batch?.entries[0]?.payload.provenance).toMatchObject({
              performedBy: { _tag: "Member", memberId: managerId, identity: managerIdentity },
              causedBy: null,
              occurredAt: membership.admittedAt
            })
            const agent = yield* run(bound, manager, add(group.id, agentId))
            expect(agent.id).not.toBe(membership.id)
            const after = yield* history(bound)
            expect(yield* Effect.flip(run(bound, manager, add(otherGroup.id, humanId)))).toMatchObject({
              _tag: "CoreError.Denied",
              reason: {
                _tag: "NotGranted",
                requirement: { target: { _tag: "Group", groupId: otherGroup.id } }
              }
            })
            expect(yield* history(bound)).toEqual(after)
            expect(
              (yield* bound.groupMemberships.listByGroup(otherGroup.id)).map((admission) => admission.memberId)
            ).not.toContain(humanId)
          })
        )
      )
  )

  it.effect(
    "group creation and audience membership confer no management authority; custom roles and revocation do",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, group, owner, manager } = yield* prepare()
            yield* publish(
              bound,
              Effect.flatMap(Journal.Journal, (journal) =>
                journal.publish(AssignmentFacts.Created, {
                  workspaceId,
                  assignmentId: Assignment.AssignmentId.make("creation-only"),
                  memberId: managerId,
                  source: {
                    _tag: "Direct",
                    grant: Grant.make(GroupPermissions.Create, {
                      _tag: "Workspace",
                      workspaceId
                    })
                  }
                })
              )
            )
            const created = yield* run(bound, manager, create("Created by manager", [managerId]))
            const before = yield* history(bound)
            expect(yield* Effect.flip(run(bound, manager, add(created.id, humanId)))).toMatchObject({
              _tag: "CoreError.Denied",
              reason: { _tag: "NotGranted" }
            })
            expect(yield* history(bound)).toEqual(before)
            const roleId = Role.RoleId.make("group-coordinator")
            yield* publish(
              bound,
              Effect.flatMap(Journal.Journal, (journal) =>
                journal.commit(
                  Effect.gen(function* () {
                    yield* journal.publish(RoleFacts.Created, {
                      workspaceId,
                      roleId,
                      name: "Coordinator",
                      permissions: [GroupMembershipPermissions.Manage.name]
                    })
                    yield* journal.publish(AssignmentFacts.Created, {
                      workspaceId,
                      assignmentId: Assignment.AssignmentId.make("coordinator"),
                      memberId: managerId,
                      source: {
                        _tag: "Role",
                        roleId,
                        scope: {
                          _tag: "Target",
                          target: { _tag: "Group", workspaceId, groupId: group.id }
                        }
                      }
                    })
                  })
                )
              )
            )
            yield* run(bound, manager, add(group.id, humanId))
            yield* publish(
              bound,
              Effect.flatMap(Journal.Journal, (journal) =>
                journal.publish(RoleFacts.PermissionsChanged, {
                  workspaceId,
                  roleId,
                  permissions: []
                })
              )
            )
            expect(yield* Effect.flip(run(bound, manager, add(group.id, agentId)))).toMatchObject({
              _tag: "CoreError.Denied",
              reason: { _tag: "NotGranted" }
            })
            yield* publish(
              bound,
              Effect.flatMap(Journal.Journal, (journal) =>
                journal.publish(RoleFacts.PermissionsChanged, {
                  workspaceId,
                  roleId: BuiltinRoles.OwnerId,
                  permissions: [GroupPermissions.Create.name]
                })
              )
            )
            expect(yield* Effect.flip(run(bound, owner, add(group.id, agentId)))).toMatchObject({
              _tag: "CoreError.Denied",
              reason: { _tag: "NotGranted" }
            })
          })
        )
      )
  )

  it.effect(
    "rejects missing or foreign groups, missing or inactive members, and duplicate admissions without writes",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, group, owner } = yield* prepare()
            const foreign = yield* boundTo(otherWorkspaceId)
            const otherWorkspace = yield* initialized(foreign)
            const foreignOwner = Actor.Actor.of({
              workspaceId: otherWorkspaceId,
              memberId: otherWorkspace.ownerMemberId,
              identity: { _tag: "Human", id: otherWorkspace.createdBy }
            })
            const foreignGroup = yield* run(foreign, foreignOwner, create("Elsewhere"))
            yield* publish(
              bound,
              Effect.flatMap(Journal.Journal, (journal) =>
                journal.publish(MemberFacts.Removed, { workspaceId, memberId: agentId })
              )
            )
            const membership = yield* run(bound, owner, add(group.id, humanId))
            const before = yield* history(bound)
            for (const [groupId, memberId, tag] of [
              [GroupId.GroupId.make("missing"), humanId, "CoreError.NotFound"],
              [foreignGroup.id, humanId, "CoreError.NotFound"],
              [group.id, MemberId.MemberId.make("missing"), "CoreError.NotFound"],
              [group.id, otherWorkspace.ownerMemberId, "CoreError.NotFound"],
              [group.id, agentId, "CoreError.Conflict"],
              [group.id, humanId, "CoreError.Conflict"]
            ] as const)
              expect(yield* Effect.flip(run(bound, owner, add(groupId, memberId)))).toMatchObject({
                _tag: tag
              })
            expect(yield* history(bound)).toEqual(before)
            expect(admitted(yield* bound.groupMemberships.listByGroup(group.id))).toEqual([membership])
          })
        )
      )
  )

  it.effect("any member tidies a private group; removing people from a public one takes a moderator in it", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner } = yield* prepare()
          // The human holds the built-in Member role; the owner holds Owner.
          yield* publish(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.publish(AssignmentFacts.Created, {
                workspaceId,
                assignmentId: Assignment.AssignmentId.make("member-new-human"),
                memberId: humanId,
                source: {
                  _tag: "Role",
                  roleId: BuiltinRoles.MemberId,
                  scope: { _tag: "Workspace", workspaceId }
                }
              })
            )
          )
          const human = memberActor(humanId)
          const createTeam = (name: string, visibility: Group.Visibility) =>
            Effect.flatMap(GroupService.GroupService, (groupService) =>
              groupService.createTeam({ name, memberIds: [humanId], visibility })
            )
          const flags = (actor: Actor.Actor["Service"], groupId: GroupId.GroupId) =>
            run(
              bound,
              actor,
              Effect.map(
                Effect.flatMap(GroupService.GroupService, (groupService) => groupService.listMine({ limit: 100 })),
                (items) => {
                  const item = items.find((listed) => listed.group.id === groupId)
                  return item && [item.manageable, item.membersRemovable, item.renamable]
                }
              )
            )
          // A member creates a private group and tidies it alone: adding and removing.
          const huddle = yield* run(bound, human, createTeam("Huddle", "Private"))
          expect(yield* flags(human, huddle.id)).toEqual([true, true, true])
          const agentIn = yield* run(bound, human, add(huddle.id, agentId))
          expect(yield* run(bound, human, remove(agentIn))).toMatchObject({
            status: "removed"
          })
          // In a public group, members add people but only moderators remove them.
          const lobby = yield* run(bound, human, createTeam("Lobby", "Public"))
          expect(yield* flags(human, lobby.id)).toEqual([true, false, true])
          const agentThere = yield* run(bound, human, add(lobby.id, agentId))
          expect(yield* Effect.flip(run(bound, human, remove(agentThere)))).toMatchObject({
            _tag: "CoreError.Denied",
            reason: {
              _tag: "NotGranted",
              requirement: { permission: { name: "group.moderate" } }
            }
          })
          // The owner moderates, but only from inside the group, which they join first.
          expect(yield* Effect.flip(run(bound, owner, remove(agentThere)))).toMatchObject({
            _tag: "CoreError.NotFound"
          })
          yield* run(
            bound,
            owner,
            Effect.flatMap(GroupMembershipService.GroupMembershipService, (groupMembershipService) =>
              groupMembershipService.join(lobby.id)
            )
          )
          expect(yield* flags(owner, lobby.id)).toEqual([true, true, true])
          expect(yield* run(bound, owner, remove(agentThere))).toMatchObject({
            status: "removed"
          })
          // Removing oneself is always leaving, public or not.
          const own = Option.getOrThrow(yield* bound.groupMemberships.findActive(lobby.id, humanId))
          expect(yield* run(bound, human, remove(own))).toMatchObject({ status: "removed" })
        })
      )
    )
  )

  it.effect("anyone who may join finds the public groups with their sizes and joins them as themselves", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, owner, group } = yield* prepare()
          // The human is a member, so they may join; the agent holds no role and may not.
          yield* publish(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.publish(AssignmentFacts.Created, {
                workspaceId,
                assignmentId: Assignment.AssignmentId.make("viewer-new-human"),
                memberId: humanId,
                source: {
                  _tag: "Role",
                  roleId: BuiltinRoles.MemberId,
                  scope: { _tag: "Workspace", workspaceId }
                }
              })
            )
          )
          const createPublic = (name: string, memberIds: ReadonlyArray<MemberId.MemberId>) =>
            Effect.flatMap(GroupService.GroupService, (groupService) =>
              groupService.createTeam({ name, memberIds, visibility: "Public" })
            )
          const listPublic = (options: Group.ListOptions) =>
            Effect.flatMap(GroupService.GroupService, (groupService) => groupService.listPublic(options))
          const join = (groupId: GroupId.GroupId) =>
            Effect.flatMap(GroupMembershipService.GroupMembershipService, (groupMembershipService) =>
              groupMembershipService.join(groupId)
            )
          const lobby = yield* run(bound, owner, createPublic("Lobby", [managerId]))
          const quiet = yield* run(bound, owner, createPublic("Quiet", []))
          expect(lobby).toMatchObject({ kind: "Team", visibility: "Public" })
          expect(group).toMatchObject({ kind: "Team", visibility: "Private" })
          const human = memberActor(humanId)
          const [first, second] = [lobby, quiet].toSorted((left, right) => (left.id < right.id ? -1 : 1))
          // Only public groups are listed, in group-ID order, with how many belong to each. The
          // workspace's general group holds its owner; its ID sorts after generated ones.
          const general = Option.getOrThrow(yield* bound.groups.get(Group.GeneralId))
          expect(yield* run(bound, human, listPublic({ limit: 10 }))).toEqual([
            ...[first!, second!].map((listed) => ({
              group: listed,
              members: listed.id === lobby.id ? 1 : 0,
              joined: false
            })),
            { group: general, members: 1, joined: false }
          ])
          expect(yield* run(bound, human, listPublic({ limit: 1 }))).toMatchObject([{ group: { id: first!.id } }])
          expect(yield* run(bound, human, listPublic({ limit: 1, after: first!.id }))).toMatchObject([
            { group: { id: second!.id } }
          ])
          // Joining admits the reader alone, attributed to them; again, it records nothing.
          const before = yield* history(bound)
          const joined = yield* run(bound, human, join(lobby.id))
          expect(joined).toMatchObject({
            workspaceId,
            groupId: lobby.id,
            memberId: humanId,
            status: "active"
          })
          expect(yield* bound.groupMemberships.findActive(lobby.id, humanId)).toEqual(Option.some(joined))
          const recorded = yield* publish(
            bound,
            Effect.flatMap(Journal.Journal, (journal) => journal.log.read({ limit: 100 }))
          )
          expect(recorded).toHaveLength(before.length + 1)
          const entry = recorded.at(-1)?.entries[0]
          expect(entry?.payload.name).toBe(GroupMembershipFacts.Added.name)
          expect(entry?.payload.provenance.performedBy).toMatchObject({
            _tag: "Member",
            memberId: humanId
          })
          expect(yield* run(bound, human, join(lobby.id))).toEqual(joined)
          expect(yield* history(bound)).toHaveLength(before.length + 1)
          expect(yield* run(bound, human, listPublic({ limit: 10 }))).toContainEqual({
            group: lobby,
            members: 2,
            joined: true
          })
          // Private, direct, and missing groups cannot be joined and say nothing of themselves.
          const direct = {
            id: GroupId.GroupId.make("direct-pair"),
            workspaceId,
            kind: "Direct",
            memberIds: Group.directMembers([managerId, owner.memberId]),
            createdBy: owner.memberId,
            createdAt: group.createdAt
          } satisfies Group.Group
          yield* bound.store.transaction(bound.groups.insert(direct))
          for (const id of [group.id, direct.id, GroupId.GroupId.make("missing")])
            expect(yield* Effect.flip(run(bound, human, join(id)))).toMatchObject({
              _tag: "CoreError.NotFound",
              resource: "Group",
              id: id
            })
          // Someone without group.join neither finds public groups nor joins one.
          const agent = memberActor(agentId)
          expect(yield* run(bound, agent, listPublic({ limit: 10 }))).toEqual([])
          expect(yield* Effect.flip(run(bound, agent, join(lobby.id)))).toMatchObject({
            _tag: "CoreError.Denied",
            reason: { _tag: "NotGranted" }
          })
          // Leaving works as for any team group, and the listing follows.
          yield* run(bound, human, leave(joined))
          const listed = yield* run(bound, human, listPublic({ limit: 10 }))
          expect(listed).toContainEqual({ group: lobby, members: 1, joined: false })
          // Rebuilding from the journal keeps each group's visibility and its admissions.
          yield* storage.discardProjections
          yield* Effect.flatMap(Journal.Journal, (journal) => journal.replay).pipe(Effect.provide(core(bound)))
          expect(yield* bound.groups.get(lobby.id)).toEqual(Option.some(lobby))
          expect(yield* run(bound, human, listPublic({ limit: 10 }))).toEqual(listed)
        })
      )
    )
  )
  it.effect("a failure after the admission projection rolls back its row and fact", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, group, owner } = yield* prepare()
          const before = yield* history(bound)
          const live = yield* bound.checkpoints.listLive(journalLog)
          const failure = StoreError.failed("Store", "commit")("injected late failure")
          const broken = failingLate(bound, failure)
          expect(yield* Effect.catchDefect(run(broken, owner, add(group.id, humanId)), Effect.succeed)).toEqual(failure)
          expect(admitted(yield* bound.groupMemberships.listByGroup(group.id))).toEqual([])
          expect(yield* bound.groups.get(group.id)).toEqual(Option.some(group))
          expect(yield* history(bound)).toEqual(before)
          expect(yield* bound.checkpoints.listLive(journalLog)).toEqual(live)
        })
      )
    )
  )

  it.effect("outer rollback and staged permission or member removal remain authoritative", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, group, owner, manager } = yield* prepare()
          yield* grant(bound, group.id)
          const before = yield* history(bound)
          expect(
            yield* Effect.flip(
              run(
                bound,
                manager,
                Effect.flatMap(Journal.Journal, (journal) =>
                  journal.commit(add(group.id, humanId).pipe(Effect.andThen(Effect.fail("cancel caller transaction"))))
                )
              )
            )
          ).toBe("cancel caller transaction")
          const afterRevoke = run(
            bound,
            manager,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.commit(
                Effect.gen(function* () {
                  yield* journal.publish(AssignmentFacts.Revoked, {
                    workspaceId,
                    assignmentId: Assignment.AssignmentId.make("group-management"),
                    memberId: managerId
                  })
                  return yield* add(group.id, humanId)
                }).pipe(Publication.withActor)
              )
            )
          )
          expect(yield* Effect.flip(afterRevoke)).toMatchObject({
            _tag: "CoreError.Denied",
            reason: { _tag: "NotGranted" }
          })
          const afterRemoval = run(
            bound,
            owner,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.commit(
                Effect.gen(function* () {
                  yield* journal.publish(MemberFacts.Removed, { workspaceId, memberId: humanId })
                  return yield* add(group.id, humanId)
                }).pipe(Publication.withActor)
              )
            )
          )
          expect(yield* Effect.flip(afterRemoval)).toMatchObject({
            _tag: "CoreError.Conflict",
            reason: { _tag: "InactiveMember" }
          })
          expect(yield* history(bound)).toEqual(before)
          expect(admitted(yield* bound.groupMemberships.listByGroup(group.id))).toEqual([])
          yield* run(bound, manager, add(group.id, humanId))
        })
      )
    )
  )

  it.effect("reopening and replay preserve a later admission after its actor and recipient lose workspace access", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const saved = yield* Effect.scoped(
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, group, manager } = yield* prepare()
              yield* grant(bound, group.id)
              yield* TestClock.adjust("5 seconds")
              const membership = yield* run(bound, manager, add(group.id, humanId))
              yield* publish(
                bound,
                Effect.flatMap(Journal.Journal, (journal) =>
                  journal.commit(
                    Effect.gen(function* () {
                      yield* journal.publish(MemberFacts.Removed, {
                        workspaceId,
                        memberId: humanId
                      })
                      yield* journal.publish(MemberFacts.Removed, {
                        workspaceId,
                        memberId: managerId
                      })
                    })
                  )
                )
              )
              expect(yield* Effect.flip(run(bound, manager, add(group.id, agentId)))).toMatchObject({
                _tag: "CoreError.Denied",
                reason: { _tag: "InvalidActor" }
              })
              return { group, membership, history: yield* history(bound) }
            })
          )
        )
        yield* Effect.scoped(
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId)
              expect(yield* bound.groupMemberships.get(saved.membership.id)).toEqual(Option.some(saved.membership))
              yield* storage.discardProjections
              yield* publish(
                bound,
                Effect.flatMap(Journal.Journal, (journal) => journal.replay)
              )
              expect(admitted(yield* bound.groupMemberships.listByGroup(saved.group.id))).toEqual([saved.membership])
              expect(yield* history(bound)).toEqual(saved.history)
            })
          )
        )
      })
    )
  )

  it.effect("independent connections cannot concurrently admit the same member twice", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const saved = yield* Effect.scoped(runHost(storage, prepare()))
        const start = yield* Deferred.make<void>()
        const readyOne = yield* Deferred.make<void>()
        const readyTwo = yield* Deferred.make<void>()
        const attempt = (ready: Deferred.Deferred<void>) =>
          Effect.scoped(
            runHost(
              storage,
              Effect.gen(function* () {
                const bound = yield* boundTo(workspaceId)
                return yield* run(
                  bound,
                  saved.owner,
                  Effect.gen(function* () {
                    const groupMembershipService = yield* GroupMembershipService.GroupMembershipService
                    yield* Deferred.succeed(ready, undefined)
                    yield* Deferred.await(start)
                    return yield* groupMembershipService.add({
                      groupId: saved.group.id,
                      memberId: humanId
                    })
                  })
                )
              })
            )
          ).pipe(Effect.exit)
        const one = yield* attempt(readyOne).pipe(Effect.forkChild)
        const two = yield* attempt(readyTwo).pipe(Effect.forkChild)
        yield* Deferred.await(readyOne)
        yield* Deferred.await(readyTwo)
        yield* Deferred.succeed(start, undefined)
        const outcomes = yield* Effect.all([Fiber.join(one), Fiber.join(two)])
        expect(outcomes.filter(Exit.isSuccess)).toHaveLength(1)
        for (const outcome of outcomes) {
          if (Exit.isFailure(outcome))
            expect(Cause.findErrorOption(outcome.cause)).toMatchObject({
              _tag: "Some",
              value: {
                _tag: expect.stringMatching(/^(CoreError.Conflict|CoreError.Unavailable)$/)
              }
            })
        }
        yield* Effect.scoped(
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId)
              expect(admitted(yield* bound.groupMemberships.listByGroup(saved.group.id))).toHaveLength(1)
              const events = yield* publish(
                bound,
                Effect.flatMap(Journal.Journal, (journal) =>
                  journal.log.readEntries({ name: GroupMembershipFacts.Added.name, limit: 100 })
                )
              )
              // One fact per admission, including the prepared groups' own and the owner's in the
              // general group: none twice.
              const admissions = [
                ...(yield* bound.groupMemberships.listByGroup(saved.group.id)),
                ...(yield* bound.groupMemberships.listByGroup(saved.otherGroup.id)),
                ...(yield* bound.groupMemberships.listByGroup(Group.GeneralId))
              ]
              expect(events).toHaveLength(admissions.length)
            })
          )
        )
      })
    )
  )

  it.effect("gateway exposes membership outcomes and observes permission changes through its cached runtime", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const gateway = yield* Gateway.Gateway
          const workspace = yield* gateway.createWorkspace(Identity.HumanId.make("gateway-owner"), {
            name: "Workspace",
            memberName: "gateway-owner"
          })
          const bound = yield* boundTo(workspace.id)
          yield* seedMembers(bound)
          const ownerIdentity = Identity.MemberReference.cases.Human.make({
            id: workspace.createdBy
          })
          const group = yield* gateway.asMember(workspace.id, ownerIdentity, create("Managed", [managerId]))
          const call = (memberId: MemberId.MemberId) =>
            gateway.asMember(workspace.id, managerIdentity, add(group.id, memberId))
          expect(yield* Effect.flip(call(humanId))).toMatchObject({
            _tag: "CoreError.Denied",
            reason: { _tag: "NotGranted" }
          })
          yield* grant(bound, group.id)
          yield* call(humanId)
          expect(yield* Effect.flip(call(humanId))).toEqual(
            new CoreError.Conflict({
              reason: new CoreError.AlreadyMember({
                groupId: group.id,
                memberId: humanId
              })
            })
          )
          expect(yield* Effect.flip(call(MemberId.MemberId.make("missing")))).toEqual(
            new CoreError.NotFound({ resource: "Member", id: MemberId.MemberId.make("missing") })
          )
          yield* publish(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.publish(MemberFacts.Removed, {
                workspaceId: workspace.id,
                memberId: agentId
              })
            )
          )
          expect(yield* Effect.flip(call(agentId))).toEqual(
            new CoreError.Conflict({
              reason: new CoreError.InactiveMember({ memberId: agentId })
            })
          )
          const missing = GroupId.GroupId.make("missing")
          expect(yield* Effect.flip(gateway.asMember(workspace.id, ownerIdentity, add(missing, humanId)))).toEqual(
            new CoreError.NotFound({ resource: "Group", id: missing })
          )
          yield* publish(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.publish(AssignmentFacts.Revoked, {
                workspaceId: workspace.id,
                assignmentId: Assignment.AssignmentId.make("group-management"),
                memberId: managerId
              })
            )
          )
          expect(yield* Effect.flip(call(agentId))).toMatchObject({
            _tag: "CoreError.Denied",
            reason: { _tag: "NotGranted" }
          })
        })
      )
    )
  )

  it.effect("managed departure uses group-scoped permission, preserves history, and records actor and time", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, group, otherGroup, owner, manager } = yield* prepare()
          yield* grant(bound, group.id)
          const human = yield* run(bound, owner, add(group.id, humanId))
          const agent = yield* run(bound, owner, add(group.id, agentId))
          const elsewhere = yield* run(bound, owner, add(otherGroup.id, humanId))
          const before = yield* history(bound)
          expect(yield* Effect.flip(run(bound, manager, remove(elsewhere)))).toMatchObject({
            _tag: "CoreError.Denied",
            reason: { _tag: "NotGranted" }
          })
          expect(yield* history(bound)).toEqual(before)
          yield* TestClock.adjust("5 seconds")
          const now = yield* DateTime.now
          for (const admission of [human, agent]) {
            const removed = yield* run(bound, manager, remove(admission))
            expect(removed).toEqual(Object.assign({}, admission, { status: "removed" }))
            expect(yield* bound.groupMemberships.get(admission.id)).toEqual(Option.some(removed))
            expect(yield* bound.groupMemberships.findActive(group.id, admission.memberId)).toEqual(Option.none())
          }
          expect(yield* bound.groupMemberships.get(elsewhere.id)).toEqual(Option.some(elsewhere))
          expect(yield* bound.groups.get(group.id)).toEqual(Option.some(group))
          const events = yield* publish(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.log
                .readEntries({ name: GroupMembershipFacts.Removed.name, limit: 100 })
                .pipe(
                  Effect.flatMap((entries) =>
                    Effect.forEach(entries, (entry) => Event.decode(GroupMembershipFacts.Removed, entry))
                  )
                )
            )
          )
          expect(events).toHaveLength(2)
          expect(events.map(({ payload }) => payload)).toEqual(
            [human, agent].map((admission) => ({
              workspaceId,
              groupId: group.id,
              membershipId: admission.id,
              memberId: admission.memberId,
              reason: "removed"
            }))
          )
          for (const event of events)
            expect(event.provenance).toMatchObject({
              performedBy: { _tag: "Member", memberId: managerId, identity: managerIdentity },
              causedBy: null,
              occurredAt: now
            })
        })
      )
    )
  )

  it.effect("human, agent, and owner can leave themselves without any grants; others' admissions stay private", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, group, owner } = yield* prepare()
          const admissions = []
          for (const actor of [memberActor(humanId), memberActor(agentId)]) {
            admissions.push({
              actor,
              admission: yield* run(bound, owner, add(group.id, actor.memberId))
            })
          }
          // The owner already belongs to the prepared group.
          const own = yield* bound.groupMemberships.findActive(group.id, owner.memberId)
          admissions.push({ actor: owner, admission: Option.getOrThrow(own) })
          yield* publish(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.publish(RoleFacts.PermissionsChanged, {
                workspaceId,
                roleId: BuiltinRoles.OwnerId,
                permissions: []
              })
            )
          )
          for (const { actor, admission } of admissions) {
            for (const other of admissions.filter(({ actor: candidate }) => candidate.memberId !== actor.memberId)) {
              expect(yield* Effect.flip(run(bound, actor, leave(other.admission)))).toMatchObject({
                _tag: "CoreError.NotFound"
              })
            }
            expect(yield* run(bound, actor, leave(admission))).toEqual(
              Object.assign({}, admission, { status: "removed" })
            )
            expect(yield* Effect.flip(run(bound, actor, leave(admission)))).toMatchObject({
              _tag: "CoreError.Conflict",
              reason: { _tag: "AlreadyEnded", resource: "GroupMembership" }
            })
            expect(yield* Effect.flip(run(bound, actor, add(group.id, actor.memberId)))).toMatchObject({
              _tag: "CoreError.Denied",
              reason: { _tag: "NotGranted" }
            })
            expect(yield* bound.members.get(actor.memberId)).toMatchObject({
              value: { status: "active" }
            })
          }
          expect(yield* bound.workspace.get).toMatchObject({
            value: { ownerMemberId: owner.memberId }
          })
          const events = yield* publish(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.log
                .readEntries({ name: GroupMembershipFacts.Removed.name, limit: 100 })
                .pipe(
                  Effect.flatMap((entries) =>
                    Effect.forEach(entries, (entry) => Event.decode(GroupMembershipFacts.Removed, entry))
                  )
                )
            )
          )
          expect(events).toHaveLength(3)
          for (const [index, event] of events.entries()) {
            expect(event.payload).toMatchObject({ reason: "left" })
            expect(event.provenance.performedBy).toMatchObject({
              memberId: admissions[index]?.actor.memberId
            })
          }
        })
      )
    )
  )

  it.effect("creation permission cannot remove members; custom management roles and live revocation apply", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, group, owner, manager } = yield* prepare()
          const membership = yield* run(bound, owner, add(group.id, humanId))
          const roleId = Role.RoleId.make("coordinator")
          yield* publish(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.commit(
                Effect.gen(function* () {
                  yield* journal.publish(RoleFacts.Created, {
                    workspaceId,
                    roleId,
                    name: "Coordinator",
                    permissions: [GroupPermissions.Create.name]
                  })
                  yield* journal.publish(AssignmentFacts.Created, {
                    workspaceId,
                    assignmentId: Assignment.AssignmentId.make("coordinator"),
                    memberId: managerId,
                    source: { _tag: "Role", roleId, scope: { _tag: "Workspace", workspaceId } }
                  })
                })
              )
            )
          )
          expect(yield* Effect.flip(run(bound, manager, remove(membership)))).toMatchObject({
            _tag: "CoreError.Denied",
            reason: { _tag: "NotGranted" }
          })
          yield* publish(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.publish(RoleFacts.PermissionsChanged, {
                workspaceId,
                roleId,
                permissions: [GroupMembershipPermissions.Manage.name]
              })
            )
          )
          yield* run(bound, manager, remove(membership))
          const next = yield* run(bound, owner, add(group.id, humanId))
          yield* publish(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.publish(RoleFacts.PermissionsChanged, {
                workspaceId,
                roleId,
                permissions: []
              })
            )
          )
          expect(yield* Effect.flip(run(bound, manager, remove(next)))).toMatchObject({
            _tag: "CoreError.Denied",
            reason: { _tag: "NotGranted" }
          })
          yield* publish(
            bound,
            Effect.flatMap(Journal.Journal, (journal) =>
              journal.publish(RoleFacts.PermissionsChanged, {
                workspaceId,
                roleId: BuiltinRoles.OwnerId,
                permissions: []
              })
            )
          )
          expect(yield* Effect.flip(run(bound, owner, remove(next)))).toMatchObject({
            _tag: "CoreError.Denied",
            reason: { _tag: "NotGranted" }
          })
        })
      )
    )
  )

  it.effect(
    "stale removal and leave never end a fresh readmission; wrong-group and foreign IDs reveal no admission",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, group, otherGroup, owner } = yield* prepare()
            const actor = memberActor(humanId)
            const old = yield* run(bound, owner, add(group.id, humanId))
            yield* run(bound, actor, leave(old))
            const fresh = yield* run(bound, owner, add(group.id, humanId))
            expect(fresh.id).not.toBe(old.id)
            const foreign = yield* boundTo(otherWorkspaceId)
            const foreignWorkspace = yield* initialized(foreign)
            const foreignActor = Actor.Actor.of({
              workspaceId: otherWorkspaceId,
              memberId: foreignWorkspace.ownerMemberId,
              identity: { _tag: "Human", id: foreignWorkspace.createdBy }
            })
            const foreignGroup = yield* run(foreign, foreignActor, create("Foreign", [foreignActor.memberId]))
            const foreignAdmission = Option.getOrThrow(
              yield* foreign.groupMemberships.findActive(foreignGroup.id, foreignActor.memberId)
            )
            const before = yield* history(bound)
            expect(yield* Effect.flip(run(bound, owner, remove(old)))).toMatchObject({
              _tag: "CoreError.Conflict",
              reason: { _tag: "AlreadyEnded", resource: "GroupMembership" }
            })
            expect(yield* Effect.flip(run(bound, actor, leave(old)))).toMatchObject({
              _tag: "CoreError.Conflict",
              reason: { _tag: "AlreadyEnded", resource: "GroupMembership" }
            })
            for (const input of [
              { groupId: group.id, membershipId: GroupMembership.GroupMembershipId.make("missing") },
              { groupId: otherGroup.id, membershipId: fresh.id },
              { groupId: group.id, membershipId: foreignAdmission.id }
            ]) {
              for (const operation of ["remove", "leave"] as const) {
                expect(
                  yield* Effect.flip(
                    run(
                      bound,
                      operation === "remove" ? owner : actor,
                      Effect.flatMap(GroupMembershipService.GroupMembershipService, (groupMembershipService) =>
                        groupMembershipService[operation](input)
                      )
                    )
                  )
                ).toMatchObject({ _tag: "CoreError.NotFound" })
              }
            }
            expect(yield* history(bound)).toEqual(before)
            expect(yield* bound.groupMemberships.findActive(group.id, humanId)).toEqual(Option.some(fresh))
            expect(yield* bound.groupMemberships.get(old.id)).toEqual(
              Option.some(Object.assign({}, old, { status: "removed" }))
            )
          })
        )
      )
  )

  it.effect(
    "workspace removal settles human and agent admissions and invitations without group-management grants",
    () =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, group, otherGroup, owner } = yield* prepare()
            const old = yield* run(bound, owner, add(group.id, humanId))
            yield* run(bound, memberActor(humanId), leave(old))
            const active = []
            for (const memberId of [humanId, agentId])
              for (const groupId of [group.id, otherGroup.id])
                active.push(yield* run(bound, owner, add(groupId, memberId)))
            // The manager already belongs to the prepared group, and stays in it.
            const untouched = Option.getOrThrow(yield* bound.groupMemberships.findActive(group.id, managerId))
            const issuedAt = yield* DateTime.now
            const invitation = {
              id: Invitation.InvitationId.make("pending-before-membership"),
              workspaceId,
              inviterMemberId: owner.memberId,
              recipientId: Identity.HumanId.make("new-human"),
              roleId: BuiltinRoles.MemberId,
              issuedAt,
              expiresAt: DateTime.add(issuedAt, { hours: 1 })
            }
            yield* publish(
              bound,
              Effect.flatMap(Journal.Journal, (journal) => journal.publish(InvitationFacts.Issued, invitation))
            )
            yield* publish(
              bound,
              Effect.flatMap(Journal.Journal, (journal) =>
                journal.publish(RoleFacts.PermissionsChanged, {
                  workspaceId,
                  roleId: BuiltinRoles.OwnerId,
                  permissions: [MemberPermissions.Remove.name]
                })
              )
            )
            yield* TestClock.adjust("5 seconds")
            for (const memberId of [humanId, agentId]) {
              yield* run(bound, owner, removeWorkspaceMember(memberId))
              expect(yield* bound.groupMemberships.listActiveByMember(memberId)).toEqual([])
              expect(yield* bound.members.get(memberId)).toMatchObject({
                value: { status: "removed" }
              })
              expect(
                yield* Effect.flip(
                  run(bound, memberActor(memberId), leave(active.find((value) => value.memberId === memberId) ?? old))
                )
              ).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "InvalidActor" } })
            }
            for (const membership of [old, ...active])
              expect(yield* bound.groupMemberships.get(membership.id)).toEqual(
                Option.some(Object.assign({}, membership, { status: "removed" }))
              )
            expect(yield* bound.groupMemberships.get(untouched.id)).toEqual(Option.some(untouched))
            expect(yield* bound.invitations.get(invitation.id)).toMatchObject({
              value: { state: { _tag: "Revoked" } }
            })
            const removals = yield* publish(
              bound,
              Effect.flatMap(Journal.Journal, (journal) =>
                journal.log
                  .readEntries({ name: MemberFacts.Removed.name, limit: 100 })
                  .pipe(
                    Effect.flatMap((entries) =>
                      Effect.forEach(entries, (entry) => Event.decode(MemberFacts.Removed, entry))
                    )
                  )
              )
            )
            const departures = yield* publish(
              bound,
              Effect.flatMap(Journal.Journal, (journal) =>
                journal.log
                  .readEntries({ name: GroupMembershipFacts.Removed.name, limit: 100 })
                  .pipe(
                    Effect.flatMap((entries) =>
                      Effect.forEach(entries, (entry) => Event.decode(GroupMembershipFacts.Removed, entry))
                    )
                  )
              )
            )
            expect(departures).toHaveLength(5)
            for (const event of departures.slice(1)) {
              const cause = removals.find((candidate) => candidate.id === event.provenance.causedBy?.id)
              expect(cause).toBeDefined()
              expect(event.commitId).toBe(cause?.commitId)
              expect(event.provenance).toMatchObject({
                performedBy: { memberId: owner.memberId },
                occurredAt: cause?.provenance.occurredAt,
                correlationId: cause?.provenance.correlationId
              })
              expect(event.payload).toMatchObject({ reason: "workspace-removed" })
            }
            const before = yield* history(bound)
            expect(yield* Effect.flip(run(bound, owner, removeWorkspaceMember(humanId)))).toMatchObject({
              _tag: "CoreError.Conflict",
              reason: { _tag: "AlreadyEnded", resource: "Member" }
            })
            expect(yield* history(bound)).toEqual(before)
          })
        )
      )
  )

  it.effect("departure projection failure and outer rollback restore the admission and journal", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, group, owner } = yield* prepare()
          const membership = yield* run(bound, owner, add(group.id, humanId))
          const before = yield* history(bound)
          const live = yield* bound.checkpoints.listLive(journalLog)
          const failure = StoreError.failed("Store", "commit")("injected late failure")
          const broken = failingLate(bound, failure)
          for (const operation of [remove, leave]) {
            const actor = operation === remove ? owner : memberActor(humanId)
            expect(yield* Effect.catchDefect(run(broken, actor, operation(membership)), Effect.succeed)).toEqual(
              failure
            )
            expect(
              yield* Effect.flip(
                run(
                  bound,
                  actor,
                  Effect.flatMap(Journal.Journal, (journal) =>
                    journal.commit(operation(membership).pipe(Effect.andThen(Effect.fail("rollback"))))
                  )
                )
              )
            ).toBe("rollback")
          }
          expect(yield* bound.groupMemberships.get(membership.id)).toEqual(Option.some(membership))
          expect(yield* history(bound)).toEqual(before)
          expect(yield* bound.checkpoints.listLive(journalLog)).toEqual(live)
        })
      )
    )
  )

  it.effect("failure after one group departure rolls back the entire workspace removal", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, group, otherGroup, owner } = yield* prepare()
          yield* run(bound, owner, add(group.id, humanId))
          yield* run(bound, owner, add(otherGroup.id, humanId))
          const admissions = yield* bound.groupMemberships.listActiveByMember(humanId)
          const before = yield* history(bound)
          const live = yield* bound.checkpoints.listLive(journalLog)
          const failure = StoreError.failed("GroupMembershipStore", "markRemoved")("second departure")
          const broken = {
            ...bound,
            context: Context.add(bound.context, GroupMembershipStore.GroupMembershipStore, {
              ...bound.groupMemberships,
              markRemoved: (input) =>
                input.membershipId === admissions[1]?.id
                  ? Effect.fail(failure)
                  : bound.groupMemberships.markRemoved(input)
            })
          }
          expect(
            yield* Effect.catchDefect(run(broken, owner, removeWorkspaceMember(humanId)), Effect.succeed)
          ).toMatchObject({ _tag: "Projection.Failure" })
          expect(yield* bound.members.get(humanId)).toMatchObject({
            value: { status: "active" }
          })
          expect(yield* bound.groupMemberships.listActiveByMember(humanId)).toEqual(admissions)
          expect(yield* history(bound)).toEqual(before)
          expect(yield* bound.checkpoints.listLive(journalLog)).toEqual(live)
        })
      )
    )
  )

  it.effect("departure observes staged management revocation and workspace removal", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, group, owner, manager } = yield* prepare()
          yield* grant(bound, group.id)
          const admission = yield* run(bound, owner, add(group.id, humanId))
          const before = yield* history(bound)
          expect(
            yield* Effect.flip(
              run(
                bound,
                manager,
                Effect.flatMap(Journal.Journal, (journal) =>
                  journal.commit(
                    Effect.gen(function* () {
                      yield* journal.publish(AssignmentFacts.Revoked, {
                        workspaceId,
                        assignmentId: Assignment.AssignmentId.make("group-management"),
                        memberId: managerId
                      })
                      return yield* remove(admission)
                    }).pipe(Publication.withActor)
                  )
                )
              )
            )
          ).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "NotGranted" } })
          expect(
            yield* Effect.flip(
              run(
                bound,
                owner,
                Effect.flatMap(Journal.Journal, (journal) =>
                  journal.commit(
                    Effect.gen(function* () {
                      yield* removeWorkspaceMember(humanId)
                      return yield* leave(admission).pipe(Effect.provideService(Actor.Actor, memberActor(humanId)))
                    })
                  )
                )
              )
            )
          ).toMatchObject({ _tag: "CoreError.Denied", reason: { _tag: "InvalidActor" } })
          expect(yield* history(bound)).toEqual(before)
          expect(yield* bound.groupMemberships.get(admission.id)).toEqual(Option.some(admission))
        })
      )
    )
  )

  it.effect("reopening and replay preserve departures and fresh admissions after authority changes", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const saved = yield* Effect.scoped(
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, group, owner, manager } = yield* prepare()
              yield* grant(bound, group.id)
              const human = yield* run(bound, owner, add(group.id, humanId))
              const agent = yield* run(bound, owner, add(group.id, agentId))
              yield* run(bound, manager, remove(human))
              yield* run(bound, memberActor(agentId), leave(agent))
              const fresh = yield* run(bound, owner, add(group.id, humanId))
              yield* run(bound, owner, removeWorkspaceMember(humanId))
              yield* run(bound, owner, removeWorkspaceMember(managerId))
              yield* publish(
                bound,
                Effect.flatMap(Journal.Journal, (journal) =>
                  journal.publish(RoleFacts.PermissionsChanged, {
                    workspaceId,
                    roleId: BuiltinRoles.OwnerId,
                    permissions: []
                  })
                )
              )
              return {
                group,
                admissions: [human, agent, fresh].map((value) => Object.assign({}, value, { status: "removed" })),
                history: yield* history(bound)
              }
            })
          )
        )
        yield* Effect.scoped(
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId)
              const expected = saved.admissions.toSorted((a, b) => (a.id < b.id ? -1 : 1))
              expect(admitted(yield* bound.groupMemberships.listByGroup(saved.group.id))).toEqual(expected)
              yield* storage.discardProjections
              yield* publish(
                bound,
                Effect.flatMap(Journal.Journal, (journal) => journal.replay)
              )
              expect(admitted(yield* bound.groupMemberships.listByGroup(saved.group.id))).toEqual(expected)
              expect(yield* bound.groupMemberships.listActiveByMember(humanId)).toEqual([])
              expect(yield* history(bound)).toEqual(saved.history)
            })
          )
        )
      })
    )
  )

  it.effect("concurrent removal and self-leave end the admission exactly once", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const saved = yield* Effect.scoped(
          runHost(
            storage,
            Effect.gen(function* () {
              const { bound, group, owner } = yield* prepare()
              return { owner, admission: yield* run(bound, owner, add(group.id, humanId)) }
            })
          )
        )
        const start = yield* Deferred.make<void>()
        const readyOne = yield* Deferred.make<void>()
        const readyTwo = yield* Deferred.make<void>()
        const attempt = (operation: typeof remove, actor: Actor.Actor["Service"], ready: Deferred.Deferred<void>) =>
          Effect.scoped(
            runHost(
              storage,
              Effect.gen(function* () {
                const bound = yield* boundTo(workspaceId)
                return yield* run(
                  bound,
                  actor,
                  Effect.gen(function* () {
                    yield* Deferred.succeed(ready, undefined)
                    yield* Deferred.await(start)
                    return yield* operation(saved.admission)
                  })
                )
              })
            )
          ).pipe(Effect.exit)
        const one = yield* attempt(remove, saved.owner, readyOne).pipe(Effect.forkChild)
        const two = yield* attempt(leave, memberActor(humanId), readyTwo).pipe(Effect.forkChild)
        yield* Deferred.await(readyOne)
        yield* Deferred.await(readyTwo)
        yield* Deferred.succeed(start, undefined)
        const outcomes = yield* Effect.all([Fiber.join(one), Fiber.join(two)])
        expect(outcomes.filter(Exit.isSuccess)).toHaveLength(1)
        for (const outcome of outcomes)
          if (Exit.isFailure(outcome))
            expect(Cause.findErrorOption(outcome.cause)).toMatchObject({
              value: {
                _tag: expect.stringMatching(/^(CoreError.Conflict|CoreError.Unavailable)$/)
              }
            })
        yield* Effect.scoped(
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId)
              expect(yield* bound.groupMemberships.get(saved.admission.id)).toEqual(
                Option.some(Object.assign({}, saved.admission, { status: "removed" }))
              )
              const events = yield* publish(
                bound,
                Effect.flatMap(Journal.Journal, (journal) =>
                  journal.log
                    .readEntries({ name: GroupMembershipFacts.Removed.name, limit: 100 })
                    .pipe(
                      Effect.flatMap((entries) =>
                        Effect.forEach(entries, (entry) => Event.decode(GroupMembershipFacts.Removed, entry))
                      )
                    )
                )
              )
              expect(events).toHaveLength(1)
            })
          )
        )
      })
    )
  )

  it.effect("concurrent addition and workspace removal cannot leave an active admission for a removed member", () =>
    withStorage((storage) =>
      Effect.gen(function* () {
        const saved = yield* Effect.scoped(runHost(storage, prepare()))
        const start = yield* Deferred.make<void>()
        const readyOne = yield* Deferred.make<void>()
        const readyTwo = yield* Deferred.make<void>()
        const attempt = (depart: boolean, ready: Deferred.Deferred<void>) =>
          Effect.scoped(
            runHost(
              storage,
              Effect.gen(function* () {
                const bound = yield* boundTo(workspaceId)
                return yield* run(
                  bound,
                  saved.owner,
                  Effect.gen(function* () {
                    yield* Deferred.succeed(ready, undefined)
                    yield* Deferred.await(start)
                    if (depart) {
                      yield* removeWorkspaceMember(humanId)
                    } else {
                      yield* add(saved.group.id, humanId)
                    }
                  })
                )
              })
            )
          ).pipe(Effect.exit)
        const one = yield* attempt(false, readyOne).pipe(Effect.forkChild)
        const two = yield* attempt(true, readyTwo).pipe(Effect.forkChild)
        yield* Deferred.await(readyOne)
        yield* Deferred.await(readyTwo)
        yield* Deferred.succeed(start, undefined)
        const outcomes = yield* Effect.all([Fiber.join(one), Fiber.join(two)])
        expect(outcomes.some(Exit.isSuccess)).toBe(true)
        for (const outcome of outcomes)
          if (Exit.isFailure(outcome))
            expect(Cause.findErrorOption(outcome.cause)).toMatchObject({
              value: {
                _tag: expect.stringMatching(/^(CoreError.Conflict|CoreError.Unavailable)$/)
              }
            })
        yield* Effect.scoped(
          runHost(
            storage,
            Effect.gen(function* () {
              const bound = yield* boundTo(workspaceId)
              const member = yield* bound.members.get(humanId)
              if (Option.isNone(member)) return yield* Effect.die("Missing member")
              if (member.value.status === "removed") {
                expect(yield* bound.groupMemberships.listActiveByMember(humanId)).toEqual([])
              } else {
                // A transaction conflict applies no change; a subsequent authorized attempt settles it.
                yield* run(bound, saved.owner, removeWorkspaceMember(humanId))
              }
              expect(yield* bound.groupMemberships.listActiveByMember(humanId)).toEqual([])
            })
          )
        )
      })
    )
  )

  it.effect("store departures validate references, reject repeated transitions, and preserve historical fields", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, group, otherGroup, owner } = yield* prepare()
          const first = yield* run(bound, owner, add(group.id, humanId))
          const second = yield* run(bound, owner, add(otherGroup.id, humanId))
          const foreign = yield* boundTo(otherWorkspaceId)
          const removal = {
            workspaceId,
            groupId: group.id,
            membershipId: first.id,
            memberId: humanId,
            reason: "removed"
          } satisfies GroupMembership.Removal
          const expected = [first, second].toSorted((a, b) => (a.id < b.id ? -1 : 1))
          expect(yield* bound.groupMemberships.listActiveByMember(humanId)).toEqual(expected)
          expect(yield* foreign.groupMemberships.listActiveByMember(humanId)).toEqual([])
          for (const invalid of [
            { ...removal, workspaceId: otherWorkspaceId },
            { ...removal, groupId: otherGroup.id },
            { ...removal, memberId: agentId },
            { ...removal, membershipId: GroupMembership.GroupMembershipId.make("missing") }
          ]) {
            expect(
              yield* Effect.flip(bound.store.transaction(bound.groupMemberships.markRemoved(invalid)))
            ).toMatchObject({
              _tag: "StoreError",
              store: "GroupMembershipStore",
              reason: { _tag: "Rejected" }
            })
            expect(yield* bound.groupMemberships.listActiveByMember(humanId)).toEqual(expected)
          }
          expect(
            yield* Effect.flip(
              bound.store.transaction(
                // @ts-expect-error Deliberately bypass static typing to verify the storage boundary.
                bound.groupMemberships.markRemoved({ ...removal, reason: "unknown" })
              )
            )
          ).toMatchObject({
            _tag: "StoreError",
            store: "GroupMembershipStore",
            reason: { _tag: "Rejected" }
          })
          expect(
            yield* Effect.flip(foreign.store.transaction(foreign.groupMemberships.markRemoved(removal)))
          ).toMatchObject({
            _tag: "StoreError",
            store: "GroupMembershipStore",
            reason: { _tag: "Rejected" }
          })
          yield* bound.store.transaction(bound.groupMemberships.markRemoved(removal))
          expect(yield* bound.groupMemberships.get(first.id)).toEqual(
            Option.some(Object.assign({}, first, { status: "removed" }))
          )
          expect(yield* bound.groupMemberships.listActiveByMember(humanId)).toEqual([second])
          expect(
            yield* Effect.flip(bound.store.transaction(bound.groupMemberships.markRemoved(removal)))
          ).toMatchObject({
            _tag: "StoreError",
            store: "GroupMembershipStore",
            reason: { _tag: "Rejected" }
          })
          const fresh = yield* run(bound, owner, add(group.id, humanId))
          expect(
            yield* Effect.flip(bound.store.transaction(bound.groupMemberships.markRemoved(removal)))
          ).toMatchObject({
            _tag: "StoreError",
            store: "GroupMembershipStore",
            reason: { _tag: "Rejected" }
          })
          expect(yield* bound.groupMemberships.findActive(group.id, humanId)).toEqual(Option.some(fresh))
        })
      )
    )
  )

  it.effect("gateway exposes departure outcomes and accepts self-leave with no management grant", () =>
    withStorage((storage) =>
      runGateway(
        storage,
        Effect.gen(function* () {
          const gateway = yield* Gateway.Gateway
          const workspace = yield* gateway.createWorkspace(Identity.HumanId.make("gateway-owner"), {
            name: "Workspace",
            memberName: "gateway-owner"
          })
          const bound = yield* boundTo(workspace.id)
          yield* seedMembers(bound)
          const ownerIdentity = Identity.MemberReference.cases.Human.make({
            id: workspace.createdBy
          })
          const group = yield* gateway.asMember(
            workspace.id,
            ownerIdentity,
            create("Managed", [workspace.ownerMemberId])
          )
          const admission = yield* gateway.asMember(workspace.id, ownerIdentity, add(group.id, managerId))
          expect(yield* Effect.flip(gateway.asMember(workspace.id, managerIdentity, remove(admission)))).toMatchObject({
            _tag: "CoreError.Denied",
            reason: { _tag: "NotGranted" }
          })
          yield* gateway.asMember(workspace.id, managerIdentity, leave(admission))
          expect(yield* Effect.flip(gateway.asMember(workspace.id, managerIdentity, leave(admission)))).toEqual(
            new CoreError.Conflict({
              reason: new CoreError.AlreadyEnded({
                resource: "GroupMembership",
                id: admission.id
              })
            })
          )
          expect(
            yield* Effect.flip(
              gateway.asMember(
                workspace.id,
                ownerIdentity,
                remove(Object.assign({}, admission, { id: GroupMembership.GroupMembershipId.make("missing") }))
              )
            )
          ).toEqual(
            new CoreError.NotFound({
              resource: "GroupMembership",
              id: GroupMembership.GroupMembershipId.make("missing")
            })
          )
          expect(yield* Effect.flip(gateway.asMember(workspace.id, ownerIdentity, remove(admission)))).toMatchObject({
            _tag: "CoreError.Conflict",
            reason: { _tag: "AlreadyEnded", resource: "GroupMembership" }
          })
        })
      )
    )
  )

  it.effect.each([humanId, agentId])(
    "workspace self-removal settles admissions without reauthorizing the departed actor: %s",
    (memberId) =>
      withStorage((storage) =>
        runHost(
          storage,
          Effect.gen(function* () {
            const { bound, group, owner } = yield* prepare()
            const admission = yield* run(bound, owner, add(group.id, memberId))
            yield* publish(
              bound,
              Effect.flatMap(Journal.Journal, (journal) =>
                journal.publish(AssignmentFacts.Created, {
                  workspaceId,
                  assignmentId: Assignment.AssignmentId.make("self-remove"),
                  memberId,
                  source: {
                    _tag: "Direct",
                    grant: Grant.make(MemberPermissions.Remove, {
                      _tag: "Target",
                      target: { _tag: "Member", workspaceId, memberId }
                    })
                  }
                })
              )
            )
            const actor = memberActor(memberId)
            yield* run(bound, actor, removeWorkspaceMember(memberId))
            expect(yield* bound.groupMemberships.get(admission.id)).toEqual(
              Option.some(Object.assign({}, admission, { status: "removed" }))
            )
            expect(yield* bound.groupMemberships.listActiveByMember(memberId)).toEqual([])
            const newMemberId = MemberId.MemberId.make(`${memberId}-readmitted`)
            yield* publish(
              bound,
              Effect.flatMap(Journal.Journal, (journal) =>
                journal.publish(MemberFacts.Added, {
                  workspaceId,
                  memberId: newMemberId,
                  identity: actor.identity,
                  name: Member.Name.make(actor.identity.id)
                })
              )
            )
            expect(yield* bound.groupMemberships.listActiveByMember(newMemberId)).toEqual([])
            const fresh = yield* run(bound, owner, add(group.id, newMemberId))
            expect(fresh.id).not.toBe(admission.id)
            expect(yield* Effect.flip(run(bound, { ...actor, memberId: newMemberId }, leave(admission)))).toMatchObject(
              { _tag: "CoreError.NotFound" }
            )
            expect(yield* bound.groupMemberships.findActive(group.id, newMemberId)).toEqual(Option.some(fresh))
          })
        )
      )
  )

  it.effect("repeating a recorded departure reuses its event and cannot change its reason or a fresh admission", () =>
    withStorage((storage) =>
      runHost(
        storage,
        Effect.gen(function* () {
          const { bound, group, owner } = yield* prepare()
          const admission = yield* run(bound, owner, add(group.id, humanId))
          yield* run(bound, owner, remove(admission))
          const fresh = yield* run(bound, owner, add(group.id, humanId))
          const before = yield* history(bound)
          yield* publish(
            bound,
            Effect.gen(function* () {
              const journal = yield* Journal.Journal
              const entries = yield* journal.log.readEntries({
                name: GroupMembershipFacts.Removed.name,
                limit: 100
              })
              const entry = entries[0]
              if (entry === undefined) return yield* Effect.die("Missing departure event")
              const event = yield* Event.decode(GroupMembershipFacts.Removed, entry)
              const repeated = yield* journal
                .publish(GroupMembershipFacts.Removed, event.payload)
                .pipe(Effect.provideService(Publication.Publication, event.provenance))
              expect(repeated).toEqual(event)
              expect(
                yield* Effect.flip(
                  journal
                    .publish(GroupMembershipFacts.Removed, { ...event.payload, reason: "left" })
                    .pipe(Effect.provideService(Publication.Publication, event.provenance))
                )
              ).toMatchObject({
                _tag: "StoreError",
                store: "Store",
                reason: { _tag: "Rejected" }
              })
            })
          )
          expect(yield* history(bound)).toEqual(before)
          expect(yield* bound.groupMemberships.findActive(group.id, humanId)).toEqual(Option.some(fresh))
        })
      )
    )
  )
})
