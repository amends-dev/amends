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
      via: { _tag: "Turn", turnId: "turn-1" },
      publishedAt: "2026-10-01T12:34:56.789Z",
      content: {
        _tag: "Text",
        text: "Hello 🌍\nsecond line",
        mentions: ["member-2"],
        revision: 2,
        editedAt: "2026-10-01T12:40:00.000Z",
      },
    },
    hex: "e6012080ae8dce1b096d6573736167652d31b0a5d7de27130a32e22752f09aaeb640086d656d6265722d31889ac2c8290767726f75702d31a0bc97812f18323032362d31302d30315431323a33343a35362e3738395ad8e2c9f7320b776f726b73706163652d3198c1c5c434110ab196dd7bb88debaa6a067475726e2d3190bcd8af48560a49316fb890f38fbd250a01086d656d6265722d32c1e1c1e55b04f0e3c9f95e1648656c6c6f20f09f8c8d0a7365636f6e64206c696e65e8eea892711905323032362d31302d30315431323a34303a30302e3030305aa0dada886c087468726561642d31",
  },
};
