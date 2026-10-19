import type { Update } from 'foldkit'

const foldLoginOutMessage = (
  outMessage: typeof Login.LoginBlock.OutMessage.Type,
  {
    liftCommand,
  }: Update.FoldContext<typeof Login.LoginBlock.Message.Type, Message>,
) =>
  Login.LoginBlock.OutMessage.match(outMessage, {
    RequestedMagicLink: ({ email }) =>
      Application.step(model => ({
        model,
        commands: [
          liftCommand(
            Login.SendMagicLink({ email, redirectRoute: model.route }),
          ),
        ],
      })),
  })
