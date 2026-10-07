// Captured with Effect 4.0.0-rc.115 before the stable upgrade. Keep these bytes fixed.
export const fixtures = {
  workspace: {
    value: {
      id: "workspace-1",
      name: "Studio",
      createdBy: "alice",
      ownerMemberId: "member-1",
    },
    hex: "3720b0da9cc50505616c69636580ae8dce1b0b776f726b73706163652d31b0deb7ce460653747564696fd8dbd5e976086d656d6265722d31",
  },
  message: {
    value: {
      id: "message-1",
      workspaceId: "workspace-1",
      threadId: "thread-1",
      groupId: "group-1",
      author: {
        _tag: "Member",
        memberId: "member-1",
      },
      text: "Hello 🌍\nsecond line",
      mentions: ["member-2"],
      publishedAt: "2026-10-01T12:34:56.789Z",
      turnId: null,
    },
    hex: "a6012080ae8dce1b096d6573736167652d3190f38fbd250a01086d656d6265722d32b0a5d7de27130a32e22752f09aaeb640086d656d6265722d31889ac2c8290767726f75702d31a0bc97812f18323032362d31302d30315431323a33343a35362e3738395ad8e2c9f7320b776f726b73706163652d31f0e3c9f95e1648656c6c6f20f09f8c8d0a7365636f6e64206c696e65b88debaa6a0102a0dada886c087468726561642d31",
  },
  // Captured with Effect 4.0.0, when turn logs began holding steps. Keep these bytes fixed.
  step: {
    value: {
      _tag: "Step",
      id: "step-1",
      step: {
        parts: [
          {
            type: "reasoning",
            text: "The notes have it.",
            metadata: { anthropic: { signature: "sig" } },
          },
          { type: "text", text: "Reading 📄 the notes." },
          {
            type: "tool-call",
            id: "call-read",
            name: "read",
            params: { path: "notes.md", lines: [1, 2] },
            providerExecuted: true,
          },
          {
            type: "tool-result",
            id: "call-read",
            name: "read",
            result: "2 and 3",
            isFailure: false,
            providerExecuted: true,
          },
          { type: "file-change", event: "modify", path: "notes.md" },
        ],
        finish: {
          type: "finish-step",
          reason: "tool-calls",
          usage: { inputTokens: { total: 10 }, outputTokens: { total: 5 } },
        },
      },
    },
    hex: "f002200aa07a981880ae8dce1b06737465702d31f8a083d163d702a8c2b48f2c930205450aa21461e780b4ca88332209001f48616e7468726f70696314117b227369676e6174757265223a22736967227df0e3c9f95e12546865206e6f74657320686176652069742e220a60d3b81ff0e3c9f95e1752656164696e6720f09f938420746865206e6f7465732e4d0a4be7000d9885edd710217b2270617468223a226e6f7465732e6d64222c226c696e6573223a5b312c325d7d80ae8dce1b0963616c6c2d72656164b0deb7ce460472656164e8ae86b6680201013a0a2cdc03dca0e2ee8d0509223220616e6420332280ae8dce1b0963616c6c2d72656164b0deb7ce4604726561648bfcb78e66e8ae86b6680201011f0a79463727b0d3e9a142086e6f7465732e6d64f8899a8c7f066d6f6469667990c9cec52c370acc7e8d9dc0eaf594671c88e5e1f71108e8af92b402020414b0e9a5b07408e8af92b40202040ac8e1eba87c0a746f6f6c2d63616c6c73",
  },
};
