import { Array, Option, Record } from 'effect'
import { Update } from 'foldkit'
import { Transition } from 'foldkit/route'
import { modifyFields } from 'foldkit/struct'
import { type Url } from 'foldkit/url'

import * as Command from '../command'
import {
  ApiReferenceBinding,
  ExampleDetailBinding,
  HomeBinding,
  MobileMenuDialogBinding,
  PlaygroundBinding,
  SearchBinding,
  ThemeMenuBinding,
} from '../composition'
import { ApplicationDefinition } from '../definition'
import { findActiveSectionKeyForRoute } from '../docsNav'
import { type Model } from '../model'
import { ApplicationRoute, urlToApplicationRoute } from '../route'

type ApplicationTransition = Transition.Transition<ApplicationRoute>

export const handleChangedUrl = ApplicationDefinition.step(
  (model, url: Url) => {
    const { route: previousRoute } = model
    const nextRoute = urlToApplicationRoute(url)
    const transition = Transition.make(previousRoute, nextRoute)
    const isDifferentPathname = model.url.pathname !== url.pathname

    return Update.combine([
      ApplicationDefinition.stepFields(model => ({
        route: () => nextRoute,
        url: () => url,
        sidebarGroups: () => nextSidebarGroups(model, nextRoute),
      })),
      stepHome(transition),
      stepPlayground(transition),
      MobileMenuDialogBinding.requestClose(),
      ThemeMenuBinding.requestClose(),
      SearchBinding.informRouteChanged(),
      loadRouteData(transition),
      scrollAfterUrlChange(url, isDifferentPathname),
    ])
  },
)

const nextSidebarGroups = (model: Model, nextRoute: ApplicationRoute) =>
  Option.match(findActiveSectionKeyForRoute(nextRoute), {
    onNone: () => model.sidebarGroups,
    onSome: activeSectionKey =>
      Option.contains(Record.get(model.sidebarGroups, activeSectionKey), true)
        ? model.sidebarGroups
        : Record.set(model.sidebarGroups, activeSectionKey, true),
  })

const stepHome = (transition: ApplicationTransition) =>
  ApplicationDefinition.step(model => {
    if (Transition.isEntering(transition, 'Home')) {
      return HomeBinding.init({
        args: [],
        toParentModel: home =>
          modifyFields(model, { maybeHome: () => Option.some(home) }),
      })
    }

    if (Option.isSome(Transition.exited(transition, 'Home'))) {
      return {
        model: modifyFields(model, { maybeHome: () => Option.none() }),
      }
    }

    return { model }
  })

const stepPlayground = (transition: ApplicationTransition) =>
  ApplicationDefinition.step(model => {
    const { nextRoute } = transition

    if (nextRoute._tag !== 'Playground') {
      return {
        model: modifyFields(model, { playground: () => Option.none() }),
      }
    }

    if (
      Option.exists(
        Transition.stayed(transition, 'Playground'),
        ({ previousRoute, nextRoute }) =>
          previousRoute.exampleSlug === nextRoute.exampleSlug,
      )
    ) {
      return { model }
    }

    return PlaygroundBinding.init({
      args: [nextRoute.exampleSlug, model.maybeIsPlaygroundSupported],
      toParentModel: playground =>
        modifyFields(model, { playground: () => Option.some(playground) }),
    })
  })

const loadRouteData = (transition: ApplicationTransition) =>
  ApplicationDefinition.step(model =>
    ApplicationRoute.matchOrElse(
      transition.nextRoute,
      {
        ApiModule: () => {
          if (
            Option.exists(
              Transition.stayed(transition, 'ApiModule'),
              ({ previousRoute, nextRoute }) =>
                previousRoute.moduleSlug === nextRoute.moduleSlug,
            )
          ) {
            return { model }
          }

          return ApiReferenceBinding.informRouteChanged()
        },
        ExampleDetail: ({ exampleSlug }) => {
          if (
            Option.exists(
              Transition.stayed(transition, 'ExampleDetail'),
              ({ previousRoute, nextRoute }) =>
                previousRoute.exampleSlug === nextRoute.exampleSlug,
            )
          ) {
            return { model }
          }

          return ExampleDetailBinding.informRouteChanged({ slug: exampleSlug })
        },
      },
      () => ({ model }),
    ),
  )

const scrollAfterUrlChange = (url: Url, isChangingPathname: boolean) =>
  ApplicationDefinition.step(model => {
    if (Option.isSome(url.hash)) {
      return {
        model,
        commands: [
          Command.ScrollToAnchor({ hash: url.hash.value }),
          ...Array.filter(
            [Command.ScrollSidebarActiveLinkIntoView()],
            () => isChangingPathname,
          ),
        ],
      }
    }

    return {
      model,
      commands: Array.filter(
        [Command.ScrollToTop(), Command.ScrollSidebarActiveLinkIntoView()],
        () => isChangingPathname,
      ),
    }
  })
