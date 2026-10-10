/**
 * Sandboxes on Daytona for the `@amends-dev/sandbox` contract: each sandbox is a Linux machine of
 * its own in Daytona's cloud, made from a snapshot of its template's version once Daytona has one.
 *
 * @since 0.1.0
 */

/**
 * The provider that creates each sandbox in Daytona's cloud and resumes it by its id, with the
 * options it takes for every sandbox and for one.
 *
 * @since 0.1.0
 */
export * as DaytonaSandboxProvider from "./DaytonaSandboxProvider.ts";
