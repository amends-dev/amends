# Cluster

`@amends/cluster` runs **jobs**: work outside any request that a commit asks for and Effect Cluster
delivers, runs, and retries ([core's jobs](../core/README.md#jobs)). Its kind of job is the
**turn job**, one for each agent in each thread, which runs the agent's
[turns](../core/README.md#turns) there; it is being rebuilt on harness-v2 and is not here yet, so
hosts run none and turns wait queued. What every job shares is here:

| Module            | What it holds                                                         |
| ----------------- | --------------------------------------------------------------------- |
| `jobs/retry.ts`   | `JobRetry.delay`, the delay before a job's failed request runs again. |
| `jobs/pruning.ts` | `JobPruning`, the hourly job that removes handled requests.           |

The package depends on Effect alone.

## Jobs

Each kind of job is a Cluster entity, and each job one entity instance, whose persisted
**requests** say what to do and when. A commit stores a request with itself, and the runner that
owns the entity handles it when it arrives. Cluster keeps an entity on one runner at a time, and
redelivers a request whose handling was cut short, so work resumes after a restart.

A failed request asks for another after `JobRetry.delay`, which doubles from two seconds up to five
minutes.

### Pruning

`JobPruning.layer({ prune, entityTypes, keep? })` removes the handled requests of the entity types
it is given with the pruning job's own past runs, once they are older than `keep` (seven days by
default), every hour on one runner, through `ClusterCron`. Cluster removes neither, and only the
host's storage knows how, so the host supplies `prune`. By then a request's key no longer needs to
stop a repeat, since nothing asks again days later, and requests not yet handled are kept however
old.

## Verify

```bash
bun run check
bun run test
```

`test/jobs/pruning.test.ts` checks that pruning runs every hour for the entity types it is given
and its own runs.
