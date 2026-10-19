import { Context, Effect, Layer, Option, Schema } from 'effect'
import { makeApplicationDefinition } from 'foldkit'
import type { Element as ElementProgram } from 'foldkit/application'
import * as Block from 'foldkit/block'
import { defineMessageUnion } from 'foldkit/message'
import type * as Update from 'foldkit/update'

const WarmupModel = Schema.Struct({ value: Schema.Number })
const WarmupMessage = defineMessageUnion({ CompletedWarmup: {} })

// oxlint-disable-next-line effecttsgo/floating-effect
Effect.void
Layer.empty
Option.none()
makeApplicationDefinition({ Model: WarmupModel, Message: WarmupMessage })
Context.Service
Block.makeDefinition('TypePerformanceWarmup', {
  Model: WarmupModel,
  Message: WarmupMessage,
})

export type WarmupStep = Update.Step<
  typeof WarmupModel.Type,
  typeof WarmupMessage.Type
>
export type WarmupElement = ElementProgram

const WorkerModel = Schema.Struct({ value: Schema.Number })
type WorkerModel = typeof WorkerModel.Type

const WorkerMessage = defineMessageUnion({ RequestedRun: {}, CompletedRun: {} })
type WorkerMessage = typeof WorkerMessage.Type

class Clock extends Context.Service<
  Clock,
  Readonly<{ run: Effect.Effect<void> }>
>()('TypePerformanceWorkerClock') {}
const ClockLayer = Layer.succeed(Clock, { run: Effect.void })

const TypePerformanceWorkerDefinition = Block.makeDefinition(
  'TypePerformanceWorker',
  {
    Model: WorkerModel,
    Message: WorkerMessage,
  },
)

const Run001 = TypePerformanceWorkerDefinition.command('Run001', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run002 = TypePerformanceWorkerDefinition.command('Run002', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run003 = TypePerformanceWorkerDefinition.command('Run003', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run004 = TypePerformanceWorkerDefinition.command('Run004', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run005 = TypePerformanceWorkerDefinition.command('Run005', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run006 = TypePerformanceWorkerDefinition.command('Run006', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run007 = TypePerformanceWorkerDefinition.command('Run007', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run008 = TypePerformanceWorkerDefinition.command('Run008', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run009 = TypePerformanceWorkerDefinition.command('Run009', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run010 = TypePerformanceWorkerDefinition.command('Run010', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run011 = TypePerformanceWorkerDefinition.command('Run011', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run012 = TypePerformanceWorkerDefinition.command('Run012', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run013 = TypePerformanceWorkerDefinition.command('Run013', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run014 = TypePerformanceWorkerDefinition.command('Run014', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run015 = TypePerformanceWorkerDefinition.command('Run015', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run016 = TypePerformanceWorkerDefinition.command('Run016', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run017 = TypePerformanceWorkerDefinition.command('Run017', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run018 = TypePerformanceWorkerDefinition.command('Run018', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run019 = TypePerformanceWorkerDefinition.command('Run019', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run020 = TypePerformanceWorkerDefinition.command('Run020', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run021 = TypePerformanceWorkerDefinition.command('Run021', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run022 = TypePerformanceWorkerDefinition.command('Run022', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run023 = TypePerformanceWorkerDefinition.command('Run023', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run024 = TypePerformanceWorkerDefinition.command('Run024', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run025 = TypePerformanceWorkerDefinition.command('Run025', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run026 = TypePerformanceWorkerDefinition.command('Run026', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run027 = TypePerformanceWorkerDefinition.command('Run027', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run028 = TypePerformanceWorkerDefinition.command('Run028', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run029 = TypePerformanceWorkerDefinition.command('Run029', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run030 = TypePerformanceWorkerDefinition.command('Run030', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run031 = TypePerformanceWorkerDefinition.command('Run031', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run032 = TypePerformanceWorkerDefinition.command('Run032', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run033 = TypePerformanceWorkerDefinition.command('Run033', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run034 = TypePerformanceWorkerDefinition.command('Run034', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run035 = TypePerformanceWorkerDefinition.command('Run035', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run036 = TypePerformanceWorkerDefinition.command('Run036', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run037 = TypePerformanceWorkerDefinition.command('Run037', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run038 = TypePerformanceWorkerDefinition.command('Run038', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run039 = TypePerformanceWorkerDefinition.command('Run039', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run040 = TypePerformanceWorkerDefinition.command('Run040', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run041 = TypePerformanceWorkerDefinition.command('Run041', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run042 = TypePerformanceWorkerDefinition.command('Run042', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run043 = TypePerformanceWorkerDefinition.command('Run043', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run044 = TypePerformanceWorkerDefinition.command('Run044', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run045 = TypePerformanceWorkerDefinition.command('Run045', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run046 = TypePerformanceWorkerDefinition.command('Run046', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run047 = TypePerformanceWorkerDefinition.command('Run047', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run048 = TypePerformanceWorkerDefinition.command('Run048', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run049 = TypePerformanceWorkerDefinition.command('Run049', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run050 = TypePerformanceWorkerDefinition.command('Run050', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run051 = TypePerformanceWorkerDefinition.command('Run051', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run052 = TypePerformanceWorkerDefinition.command('Run052', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run053 = TypePerformanceWorkerDefinition.command('Run053', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run054 = TypePerformanceWorkerDefinition.command('Run054', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run055 = TypePerformanceWorkerDefinition.command('Run055', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run056 = TypePerformanceWorkerDefinition.command('Run056', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run057 = TypePerformanceWorkerDefinition.command('Run057', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run058 = TypePerformanceWorkerDefinition.command('Run058', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run059 = TypePerformanceWorkerDefinition.command('Run059', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run060 = TypePerformanceWorkerDefinition.command('Run060', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run061 = TypePerformanceWorkerDefinition.command('Run061', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run062 = TypePerformanceWorkerDefinition.command('Run062', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run063 = TypePerformanceWorkerDefinition.command('Run063', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run064 = TypePerformanceWorkerDefinition.command('Run064', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run065 = TypePerformanceWorkerDefinition.command('Run065', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run066 = TypePerformanceWorkerDefinition.command('Run066', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run067 = TypePerformanceWorkerDefinition.command('Run067', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run068 = TypePerformanceWorkerDefinition.command('Run068', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run069 = TypePerformanceWorkerDefinition.command('Run069', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run070 = TypePerformanceWorkerDefinition.command('Run070', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run071 = TypePerformanceWorkerDefinition.command('Run071', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run072 = TypePerformanceWorkerDefinition.command('Run072', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run073 = TypePerformanceWorkerDefinition.command('Run073', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run074 = TypePerformanceWorkerDefinition.command('Run074', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run075 = TypePerformanceWorkerDefinition.command('Run075', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run076 = TypePerformanceWorkerDefinition.command('Run076', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run077 = TypePerformanceWorkerDefinition.command('Run077', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run078 = TypePerformanceWorkerDefinition.command('Run078', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run079 = TypePerformanceWorkerDefinition.command('Run079', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run080 = TypePerformanceWorkerDefinition.command('Run080', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run081 = TypePerformanceWorkerDefinition.command('Run081', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run082 = TypePerformanceWorkerDefinition.command('Run082', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run083 = TypePerformanceWorkerDefinition.command('Run083', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run084 = TypePerformanceWorkerDefinition.command('Run084', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run085 = TypePerformanceWorkerDefinition.command('Run085', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run086 = TypePerformanceWorkerDefinition.command('Run086', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run087 = TypePerformanceWorkerDefinition.command('Run087', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run088 = TypePerformanceWorkerDefinition.command('Run088', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run089 = TypePerformanceWorkerDefinition.command('Run089', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run090 = TypePerformanceWorkerDefinition.command('Run090', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run091 = TypePerformanceWorkerDefinition.command('Run091', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run092 = TypePerformanceWorkerDefinition.command('Run092', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run093 = TypePerformanceWorkerDefinition.command('Run093', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run094 = TypePerformanceWorkerDefinition.command('Run094', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run095 = TypePerformanceWorkerDefinition.command('Run095', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run096 = TypePerformanceWorkerDefinition.command('Run096', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run097 = TypePerformanceWorkerDefinition.command('Run097', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run098 = TypePerformanceWorkerDefinition.command('Run098', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run099 = TypePerformanceWorkerDefinition.command('Run099', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run100 = TypePerformanceWorkerDefinition.command('Run100', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run101 = TypePerformanceWorkerDefinition.command('Run101', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run102 = TypePerformanceWorkerDefinition.command('Run102', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run103 = TypePerformanceWorkerDefinition.command('Run103', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run104 = TypePerformanceWorkerDefinition.command('Run104', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run105 = TypePerformanceWorkerDefinition.command('Run105', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run106 = TypePerformanceWorkerDefinition.command('Run106', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run107 = TypePerformanceWorkerDefinition.command('Run107', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run108 = TypePerformanceWorkerDefinition.command('Run108', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run109 = TypePerformanceWorkerDefinition.command('Run109', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run110 = TypePerformanceWorkerDefinition.command('Run110', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run111 = TypePerformanceWorkerDefinition.command('Run111', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run112 = TypePerformanceWorkerDefinition.command('Run112', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run113 = TypePerformanceWorkerDefinition.command('Run113', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run114 = TypePerformanceWorkerDefinition.command('Run114', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run115 = TypePerformanceWorkerDefinition.command('Run115', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run116 = TypePerformanceWorkerDefinition.command('Run116', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run117 = TypePerformanceWorkerDefinition.command('Run117', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run118 = TypePerformanceWorkerDefinition.command('Run118', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run119 = TypePerformanceWorkerDefinition.command('Run119', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run120 = TypePerformanceWorkerDefinition.command('Run120', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run121 = TypePerformanceWorkerDefinition.command('Run121', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run122 = TypePerformanceWorkerDefinition.command('Run122', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run123 = TypePerformanceWorkerDefinition.command('Run123', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run124 = TypePerformanceWorkerDefinition.command('Run124', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run125 = TypePerformanceWorkerDefinition.command('Run125', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run126 = TypePerformanceWorkerDefinition.command('Run126', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run127 = TypePerformanceWorkerDefinition.command('Run127', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run128 = TypePerformanceWorkerDefinition.command('Run128', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run129 = TypePerformanceWorkerDefinition.command('Run129', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run130 = TypePerformanceWorkerDefinition.command('Run130', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run131 = TypePerformanceWorkerDefinition.command('Run131', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run132 = TypePerformanceWorkerDefinition.command('Run132', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run133 = TypePerformanceWorkerDefinition.command('Run133', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run134 = TypePerformanceWorkerDefinition.command('Run134', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run135 = TypePerformanceWorkerDefinition.command('Run135', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run136 = TypePerformanceWorkerDefinition.command('Run136', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run137 = TypePerformanceWorkerDefinition.command('Run137', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run138 = TypePerformanceWorkerDefinition.command('Run138', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run139 = TypePerformanceWorkerDefinition.command('Run139', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run140 = TypePerformanceWorkerDefinition.command('Run140', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run141 = TypePerformanceWorkerDefinition.command('Run141', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run142 = TypePerformanceWorkerDefinition.command('Run142', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run143 = TypePerformanceWorkerDefinition.command('Run143', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run144 = TypePerformanceWorkerDefinition.command('Run144', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run145 = TypePerformanceWorkerDefinition.command('Run145', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run146 = TypePerformanceWorkerDefinition.command('Run146', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run147 = TypePerformanceWorkerDefinition.command('Run147', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run148 = TypePerformanceWorkerDefinition.command('Run148', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run149 = TypePerformanceWorkerDefinition.command('Run149', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run150 = TypePerformanceWorkerDefinition.command('Run150', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run151 = TypePerformanceWorkerDefinition.command('Run151', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run152 = TypePerformanceWorkerDefinition.command('Run152', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run153 = TypePerformanceWorkerDefinition.command('Run153', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run154 = TypePerformanceWorkerDefinition.command('Run154', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run155 = TypePerformanceWorkerDefinition.command('Run155', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run156 = TypePerformanceWorkerDefinition.command('Run156', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run157 = TypePerformanceWorkerDefinition.command('Run157', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run158 = TypePerformanceWorkerDefinition.command('Run158', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run159 = TypePerformanceWorkerDefinition.command('Run159', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run160 = TypePerformanceWorkerDefinition.command('Run160', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run161 = TypePerformanceWorkerDefinition.command('Run161', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run162 = TypePerformanceWorkerDefinition.command('Run162', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run163 = TypePerformanceWorkerDefinition.command('Run163', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run164 = TypePerformanceWorkerDefinition.command('Run164', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run165 = TypePerformanceWorkerDefinition.command('Run165', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run166 = TypePerformanceWorkerDefinition.command('Run166', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run167 = TypePerformanceWorkerDefinition.command('Run167', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run168 = TypePerformanceWorkerDefinition.command('Run168', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run169 = TypePerformanceWorkerDefinition.command('Run169', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run170 = TypePerformanceWorkerDefinition.command('Run170', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run171 = TypePerformanceWorkerDefinition.command('Run171', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run172 = TypePerformanceWorkerDefinition.command('Run172', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run173 = TypePerformanceWorkerDefinition.command('Run173', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run174 = TypePerformanceWorkerDefinition.command('Run174', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run175 = TypePerformanceWorkerDefinition.command('Run175', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run176 = TypePerformanceWorkerDefinition.command('Run176', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run177 = TypePerformanceWorkerDefinition.command('Run177', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run178 = TypePerformanceWorkerDefinition.command('Run178', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run179 = TypePerformanceWorkerDefinition.command('Run179', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run180 = TypePerformanceWorkerDefinition.command('Run180', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run181 = TypePerformanceWorkerDefinition.command('Run181', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run182 = TypePerformanceWorkerDefinition.command('Run182', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run183 = TypePerformanceWorkerDefinition.command('Run183', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run184 = TypePerformanceWorkerDefinition.command('Run184', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run185 = TypePerformanceWorkerDefinition.command('Run185', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run186 = TypePerformanceWorkerDefinition.command('Run186', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run187 = TypePerformanceWorkerDefinition.command('Run187', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run188 = TypePerformanceWorkerDefinition.command('Run188', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run189 = TypePerformanceWorkerDefinition.command('Run189', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run190 = TypePerformanceWorkerDefinition.command('Run190', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run191 = TypePerformanceWorkerDefinition.command('Run191', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run192 = TypePerformanceWorkerDefinition.command('Run192', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run193 = TypePerformanceWorkerDefinition.command('Run193', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run194 = TypePerformanceWorkerDefinition.command('Run194', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run195 = TypePerformanceWorkerDefinition.command('Run195', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run196 = TypePerformanceWorkerDefinition.command('Run196', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run197 = TypePerformanceWorkerDefinition.command('Run197', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run198 = TypePerformanceWorkerDefinition.command('Run198', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run199 = TypePerformanceWorkerDefinition.command('Run199', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const Run200 = TypePerformanceWorkerDefinition.command('Run200', {
  messages: [WorkerMessage.CompletedRun],
  handler: function* () {
    const clock = yield* Clock

    return () => clock.run.pipe(Effect.as(WorkerMessage.CompletedRun()))
  },
})

const runAll = TypePerformanceWorkerDefinition.step(model => ({
  model,
  commands: [
    Run001(),
    Run002(),
    Run003(),
    Run004(),
    Run005(),
    Run006(),
    Run007(),
    Run008(),
    Run009(),
    Run010(),
    Run011(),
    Run012(),
    Run013(),
    Run014(),
    Run015(),
    Run016(),
    Run017(),
    Run018(),
    Run019(),
    Run020(),
    Run021(),
    Run022(),
    Run023(),
    Run024(),
    Run025(),
    Run026(),
    Run027(),
    Run028(),
    Run029(),
    Run030(),
    Run031(),
    Run032(),
    Run033(),
    Run034(),
    Run035(),
    Run036(),
    Run037(),
    Run038(),
    Run039(),
    Run040(),
    Run041(),
    Run042(),
    Run043(),
    Run044(),
    Run045(),
    Run046(),
    Run047(),
    Run048(),
    Run049(),
    Run050(),
    Run051(),
    Run052(),
    Run053(),
    Run054(),
    Run055(),
    Run056(),
    Run057(),
    Run058(),
    Run059(),
    Run060(),
    Run061(),
    Run062(),
    Run063(),
    Run064(),
    Run065(),
    Run066(),
    Run067(),
    Run068(),
    Run069(),
    Run070(),
    Run071(),
    Run072(),
    Run073(),
    Run074(),
    Run075(),
    Run076(),
    Run077(),
    Run078(),
    Run079(),
    Run080(),
    Run081(),
    Run082(),
    Run083(),
    Run084(),
    Run085(),
    Run086(),
    Run087(),
    Run088(),
    Run089(),
    Run090(),
    Run091(),
    Run092(),
    Run093(),
    Run094(),
    Run095(),
    Run096(),
    Run097(),
    Run098(),
    Run099(),
    Run100(),
    Run101(),
    Run102(),
    Run103(),
    Run104(),
    Run105(),
    Run106(),
    Run107(),
    Run108(),
    Run109(),
    Run110(),
    Run111(),
    Run112(),
    Run113(),
    Run114(),
    Run115(),
    Run116(),
    Run117(),
    Run118(),
    Run119(),
    Run120(),
    Run121(),
    Run122(),
    Run123(),
    Run124(),
    Run125(),
    Run126(),
    Run127(),
    Run128(),
    Run129(),
    Run130(),
    Run131(),
    Run132(),
    Run133(),
    Run134(),
    Run135(),
    Run136(),
    Run137(),
    Run138(),
    Run139(),
    Run140(),
    Run141(),
    Run142(),
    Run143(),
    Run144(),
    Run145(),
    Run146(),
    Run147(),
    Run148(),
    Run149(),
    Run150(),
    Run151(),
    Run152(),
    Run153(),
    Run154(),
    Run155(),
    Run156(),
    Run157(),
    Run158(),
    Run159(),
    Run160(),
    Run161(),
    Run162(),
    Run163(),
    Run164(),
    Run165(),
    Run166(),
    Run167(),
    Run168(),
    Run169(),
    Run170(),
    Run171(),
    Run172(),
    Run173(),
    Run174(),
    Run175(),
    Run176(),
    Run177(),
    Run178(),
    Run179(),
    Run180(),
    Run181(),
    Run182(),
    Run183(),
    Run184(),
    Run185(),
    Run186(),
    Run187(),
    Run188(),
    Run189(),
    Run190(),
    Run191(),
    Run192(),
    Run193(),
    Run194(),
    Run195(),
    Run196(),
    Run197(),
    Run198(),
    Run199(),
    Run200(),
  ],
}))
const TypePerformanceWorkerComposition =
  TypePerformanceWorkerDefinition.makeComposition()
const Worker = TypePerformanceWorkerComposition.assembleBlock({
  init: TypePerformanceWorkerComposition.makeInit(() => ({
    model: WorkerModel.make({ value: 0 }),
  })),
  update: TypePerformanceWorkerComposition.makeUpdate((model, message) =>
    WorkerMessage.match(message, {
      RequestedRun: () => runAll(model),
      CompletedRun: () => ({ model }),
    }),
  ),
  operations: {
    runAll: WorkerMessage.RequestedRun,
  },
  EffectsLayer: Layer.mergeAll(
    Run001.layer,
    Run002.layer,
    Run003.layer,
    Run004.layer,
    Run005.layer,
    Run006.layer,
    Run007.layer,
    Run008.layer,
    Run009.layer,
    Run010.layer,
    Run011.layer,
    Run012.layer,
    Run013.layer,
    Run014.layer,
    Run015.layer,
    Run016.layer,
    Run017.layer,
    Run018.layer,
    Run019.layer,
    Run020.layer,
    Run021.layer,
    Run022.layer,
    Run023.layer,
    Run024.layer,
    Run025.layer,
    Run026.layer,
    Run027.layer,
    Run028.layer,
    Run029.layer,
    Run030.layer,
    Run031.layer,
    Run032.layer,
    Run033.layer,
    Run034.layer,
    Run035.layer,
    Run036.layer,
    Run037.layer,
    Run038.layer,
    Run039.layer,
    Run040.layer,
    Run041.layer,
    Run042.layer,
    Run043.layer,
    Run044.layer,
    Run045.layer,
    Run046.layer,
    Run047.layer,
    Run048.layer,
    Run049.layer,
    Run050.layer,
    Run051.layer,
    Run052.layer,
    Run053.layer,
    Run054.layer,
    Run055.layer,
    Run056.layer,
    Run057.layer,
    Run058.layer,
    Run059.layer,
    Run060.layer,
    Run061.layer,
    Run062.layer,
    Run063.layer,
    Run064.layer,
    Run065.layer,
    Run066.layer,
    Run067.layer,
    Run068.layer,
    Run069.layer,
    Run070.layer,
    Run071.layer,
    Run072.layer,
    Run073.layer,
    Run074.layer,
    Run075.layer,
    Run076.layer,
    Run077.layer,
    Run078.layer,
    Run079.layer,
    Run080.layer,
    Run081.layer,
    Run082.layer,
    Run083.layer,
    Run084.layer,
    Run085.layer,
    Run086.layer,
    Run087.layer,
    Run088.layer,
    Run089.layer,
    Run090.layer,
    Run091.layer,
    Run092.layer,
    Run093.layer,
    Run094.layer,
    Run095.layer,
    Run096.layer,
    Run097.layer,
    Run098.layer,
    Run099.layer,
    Run100.layer,
    Run101.layer,
    Run102.layer,
    Run103.layer,
    Run104.layer,
    Run105.layer,
    Run106.layer,
    Run107.layer,
    Run108.layer,
    Run109.layer,
    Run110.layer,
    Run111.layer,
    Run112.layer,
    Run113.layer,
    Run114.layer,
    Run115.layer,
    Run116.layer,
    Run117.layer,
    Run118.layer,
    Run119.layer,
    Run120.layer,
    Run121.layer,
    Run122.layer,
    Run123.layer,
    Run124.layer,
    Run125.layer,
    Run126.layer,
    Run127.layer,
    Run128.layer,
    Run129.layer,
    Run130.layer,
    Run131.layer,
    Run132.layer,
    Run133.layer,
    Run134.layer,
    Run135.layer,
    Run136.layer,
    Run137.layer,
    Run138.layer,
    Run139.layer,
    Run140.layer,
    Run141.layer,
    Run142.layer,
    Run143.layer,
    Run144.layer,
    Run145.layer,
    Run146.layer,
    Run147.layer,
    Run148.layer,
    Run149.layer,
    Run150.layer,
    Run151.layer,
    Run152.layer,
    Run153.layer,
    Run154.layer,
    Run155.layer,
    Run156.layer,
    Run157.layer,
    Run158.layer,
    Run159.layer,
    Run160.layer,
    Run161.layer,
    Run162.layer,
    Run163.layer,
    Run164.layer,
    Run165.layer,
    Run166.layer,
    Run167.layer,
    Run168.layer,
    Run169.layer,
    Run170.layer,
    Run171.layer,
    Run172.layer,
    Run173.layer,
    Run174.layer,
    Run175.layer,
    Run176.layer,
    Run177.layer,
    Run178.layer,
    Run179.layer,
    Run180.layer,
    Run181.layer,
    Run182.layer,
    Run183.layer,
    Run184.layer,
    Run185.layer,
    Run186.layer,
    Run187.layer,
    Run188.layer,
    Run189.layer,
    Run190.layer,
    Run191.layer,
    Run192.layer,
    Run193.layer,
    Run194.layer,
    Run195.layer,
    Run196.layer,
    Run197.layer,
    Run198.layer,
    Run199.layer,
    Run200.layer,
  ),
})
const ApplicationMessage = Schema.Never
const ApplicationDefinition = makeApplicationDefinition({
  Model: WorkerModel,
  Message: ApplicationMessage,
})
const WorkerBinding = ApplicationDefinition.bindChild(Worker, {
  placement: 'worker',
  read: model => Option.some(model),
  write: (_model, nextWorker) => nextWorker,
})
const ApplicationComposition = ApplicationDefinition.makeComposition({
  bindings: [WorkerBinding],
})
const update = ApplicationComposition.makeUpdate()
const view = ApplicationComposition.makeView((_model, h) => h.main([]))

export const program = ApplicationComposition.assembleElement({
  container: null,
  init: ApplicationComposition.makeInit(() =>
    WorkerBinding.init({ args: [], toParentModel: model => model }),
  ),
  update,
  view,
  EffectsLayer: Layer.empty,
})
export const providedProgram = program.provide(ClockLayer)

export type WorkerRequirements = Update.RequirementsOf<typeof runAll>
export type ApplicationRequirements = Update.RequirementsOf<typeof update>
export type Program = typeof program
type RequirementsOf<Value> =
  Value extends ElementProgram<
    undefined,
    infer Requirements,
    never,
    infer _ProvidedServices
  >
    ? Requirements
    : never
type Equal<Left, Right> =
  (<Value>() => Value extends Left ? 1 : 2) extends <
    Value,
  >() => Value extends Right ? 1 : 2
    ? true
    : false
type Expect<Value extends true> = Value
type ProgramRequirementsAreClock = Expect<
  Equal<RequirementsOf<typeof program>, Clock>
>
type ProvidedRequirementsAreComplete = Expect<
  Equal<RequirementsOf<typeof providedProgram>, never>
>
export type Assertions = [
  ProgramRequirementsAreClock,
  ProvidedRequirementsAreComplete,
]
