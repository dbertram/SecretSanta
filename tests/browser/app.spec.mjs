import { test, expect } from "@playwright/test";

const storageKey = "secret-santa.v1";
function fixture() {
  return {
    version: 1,
    activeId: "family-a",
    clientId: "123456-test.apps.googleusercontent.com",
    families: [
      {
        id: "family-a",
        name: "Winter family",
        people: Array.from({ length: 4 }, (_, i) => ({
          id: `p${i}`,
          name: `Person ${i}`,
          email: `p${i}@example.com`,
        })),
        blocks: [],
        organizerId: "p0",
        senderName: "Santa 🎄",
        subject: "A gift for {family}",
        body: "Hello {giver},\nYou buy for {recipient}.\nLove, Santa",
      },
    ],
  };
}
const fakeGoogle = `window.google={accounts:{oauth2:{initTokenClient(config){return {requestAccessToken(){setTimeout(()=>config.callback({access_token:'test-token',expires_in:3600}),0)}}},hasGrantedAllScopes(){return true},revoke(token,callback){callback()}}}};`;
async function setup(
  page,
  {
    seed = fixture(),
    send = (route) => route.fulfill({ json: { id: "fake-message-id" } }),
    storageUnavailable = false,
  } = {},
) {
  await page.addInitScript(
    ({ seed, storageKey, storageUnavailable }) => {
      if (!localStorage.getItem(storageKey))
        localStorage.setItem(storageKey, JSON.stringify(seed));
      if (storageUnavailable)
        Storage.prototype.setItem = function () {
          throw new DOMException("Not available", "QuotaExceededError");
        };
    },
    { seed, storageKey, storageUnavailable },
  );
  await page.route("https://accounts.google.com/gsi/client", (route) =>
    route.fulfill({ contentType: "application/javascript", body: fakeGoogle }),
  );
  await page.route("https://www.googleapis.com/oauth2/v3/userinfo", (route) =>
    route.fulfill({
      json: { email: "santa@example.com", email_verified: true },
    }),
  );
  await page.route(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    send,
  );
  await page.goto("/");
}
async function connect(page) {
  await page
    .getByRole("button", { name: "Connect with Google", exact: true })
    .click();
  await expect(page.locator("#google-status")).toContainText(
    "Connected as santa@example.com",
  );
}
async function beginSend(page) {
  await page.getByRole("button", { name: "Draw & send emails" }).click();
  await page
    .getByRole("button", { name: "Send assignments", exact: true })
    .click();
}
function decodedRequest(request) {
  return Buffer.from(request.postDataJSON().raw, "base64url").toString("utf8");
}
function bodyOf(mime) {
  return Buffer.from(
    mime.split("\r\n\r\n")[1].replace(/\s/g, ""),
    "base64",
  ).toString("utf8");
}
async function saved(page) {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)),
    storageKey,
  );
}

test("manages people, mutual and directional restrictions, templates and multiple persisted families", async ({
  page,
}) => {
  await setup(page);
  await page.locator("#block-from").selectOption("p0");
  await page.locator("#block-to").selectOption("p1");
  await page.getByRole("button", { name: "+ Add restriction" }).click();
  expect((await saved(page)).families[0].blocks).toEqual([
    ["p0", "p1"],
    ["p1", "p0"],
  ]);
  await page.locator("#block-from").selectOption("p2");
  await page.locator("#block-to").selectOption("p3");
  await page.getByLabel("Block both directions").uncheck();
  await page.getByRole("button", { name: "+ Add restriction" }).click();
  expect((await saved(page)).families[0].blocks).toHaveLength(3);
  await page.getByLabel("Subject", { exact: true }).fill("Ho ho ho, {giver}");
  await expect(page.locator("#preview-subject")).toHaveText("Ho ho ho, Alex");
  await page.getByRole("button", { name: "+ New family" }).click();
  await page.getByLabel("Family name", { exact: true }).fill("Other family");
  await page.getByRole("button", { name: "Save family" }).click();
  await page.getByRole("button", { name: "+ Add person" }).click();
  await page.getByLabel("Participant name").fill("Robin");
  await page.getByLabel("Email for Robin").fill("robin@example.com");
  await page.reload();
  await expect(page.locator("#family-select")).toHaveValue(
    (await saved(page)).activeId,
  );
  await expect(page.getByLabel("Participant name")).toHaveValue("Robin");
  await page.locator("#family-select").selectOption("family-a");
  await expect(page.getByLabel("Subject", { exact: true })).toHaveValue(
    "Ho ho ho, {giver}",
  );
  await expect(page.locator("#rules li")).toHaveCount(2);
  await page
    .getByRole("button", { name: "Remove Person 1", exact: true })
    .click();
  expect((await saved(page)).families[0].blocks).toEqual([["p2", "p3"]]);
  await page.getByRole("button", { name: "Rename", exact: true }).click();
  await page.getByLabel("Family name", { exact: true }).fill("Renamed family");
  await page.getByRole("button", { name: "Save family" }).click();
  expect((await saved(page)).families[0].name).toBe("Renamed family");
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  expect((await saved(page)).families.map((f) => f.name)).toEqual([
    "Other family",
  ]);
});

test("preview stays fictional through authorization and dry-runs while reflecting template edits", async ({
  page,
}) => {
  let sends = 0;
  await setup(page, {
    send: (route) => {
      sends++;
      return route.fulfill({ json: { id: "none" } });
    },
  });
  await expect(page.locator("#preview-body")).toContainText("Hello Alex");
  await page.getByRole("button", { name: "Try a dry-run" }).click();
  await expect(page.locator("#dry-results tbody tr")).toHaveCount(4);
  await expect(page.locator("#preview-body")).toHaveText(
    "Hello Alex,\nYou buy for Jamie.\nLove, Santa",
  );
  await expect(page.locator("#preview-to")).toHaveText(
    "Alex <alex@example.com>",
  );
  await expect(page.locator("#preview-tag")).toHaveText("Fictional example");
  await connect(page);
  await expect(page.locator("#preview-from")).toHaveText(
    "Santa 🎄 <you@example.com>",
  );
  await expect(page.locator("#preview-body")).toHaveText(
    "Hello Alex,\nYou buy for Jamie.\nLove, Santa",
  );
  expect(sends).toBe(0);
  expect(JSON.stringify(await saved(page))).not.toContain("recipientId");
  await page.getByLabel("Subject", { exact: true }).fill("Updated {family}");
  await expect(page.locator("#dry-panel")).toBeHidden();
  await expect(page.locator("#dry-results")).toBeEmpty();
  await expect(page.locator("#preview-body")).toContainText("Hello Alex");
  await expect(page.locator("#preview-subject")).toHaveText(
    "Updated Winter family",
  );
  await page
    .getByLabel("Sender display name", { exact: true })
    .fill("Christmas helper");
  await expect(page.locator("#preview-from")).toHaveText(
    "Christmas helper <you@example.com>",
  );
  await page
    .getByLabel("Message", { exact: true })
    .fill("Dear {giver}, your gift goes to {recipient}.");
  await expect(page.locator("#preview-body")).toHaveText(
    "Dear Alex, your gift goes to Jamie.",
  );
});

test("live send clears dry-run, sends valid personalized MIME, reveals only organizer recipient, and stores no draw or token", async ({
  page,
}) => {
  const sends = [];
  await setup(page, {
    send: async (route) => {
      sends.push(decodedRequest(route.request()));
      await route.fulfill({ json: { id: `mock-${sends.length}` } });
    },
  });
  await page.getByRole("button", { name: "Try a dry-run" }).click();
  await expect(page.locator("#dry-panel")).toBeVisible();
  await connect(page);
  await beginSend(page);
  await expect(page.locator("#live-heading")).toHaveText(
    "The secrets are on their way.",
  );
  expect(sends).toHaveLength(4);
  await expect(page.locator("#dry-results")).toBeEmpty();
  await expect(page.locator("#dry-panel")).toBeHidden();
  await expect(page.locator("#preview-body")).toContainText("Hello Alex");
  const organizerMail = sends.find((mime) => mime.includes("<p0@example.com>"));
  const recipient = bodyOf(organizerMail).match(/You buy for (.+)\./)[1];
  await expect(page.locator("#own-match")).toHaveText(
    `You’re buying a gift for ${recipient}.`,
  );
  for (const mime of sends) {
    expect(mime).toContain("<santa@example.com>");
    const text = bodyOf(mime);
    expect(text).toMatch(/Hello Person \d,\r\nYou buy for Person \d\./);
    expect(text.match(/Hello Person (\d)/)[1]).not.toBe(
      text.match(/for Person (\d)/)[1],
    );
  }
  expect(JSON.stringify(await saved(page))).not.toMatch(
    /recipientId|giverId|test-token|access_token/,
  );
  await page
    .getByRole("button", { name: "Close mailing", exact: true })
    .click();
  await expect(page.locator("#own-match")).toBeEmpty();
  await expect(page.locator("#family-select")).toBeEnabled();
  await page.reload();
  await expect(page.locator("#google-status")).toContainText("Not connected");
  await expect(page.locator("#live-panel")).toBeHidden();
});

test("401 pauses a draw, reconnects, and retries identical assignments while skipping accepted messages", async ({
  page,
}) => {
  const sends = [];
  await setup(page, {
    send: (route) => {
      sends.push(decodedRequest(route.request()));
      return route.fulfill({
        status: sends.length === 2 ? 401 : 200,
        json: { id: "mock" },
      });
    },
  });
  await connect(page);
  await beginSend(page);
  await expect(page.locator("#notice")).toContainText("authorization expired");
  await expect(page.locator("#family-select")).toBeDisabled();
  await expect(page.locator("#own-match")).toBeHidden();
  await connect(page);
  await page.getByRole("button", { name: "Retry remaining emails" }).click();
  await expect(page.locator("#live-heading")).toHaveText(
    "The secrets are on their way.",
  );
  expect(sends).toHaveLength(5);
  expect(sends[2]).toBe(sends[1]);
  expect(sends.slice(1)).not.toContain(sends[0]);
});

test("uncertain delivery requires acknowledgement and retries the same message", async ({
  page,
}) => {
  const sends = [];
  await setup(page, {
    send: (route) => {
      sends.push(decodedRequest(route.request()));
      if (sends.length === 1) return route.abort("failed");
      return route.fulfill({ json: { id: "mock" } });
    },
  });
  await connect(page);
  await beginSend(page);
  await expect(page.locator("#deliveries")).toContainText("Delivery uncertain");
  let dialogMessage = "";
  page.once("dialog", async (dialog) => {
    dialogMessage = dialog.message();
    await dialog.accept();
  });
  await page.getByRole("button", { name: "Retry remaining emails" }).click();
  await expect(page.locator("#live-heading")).toHaveText(
    "The secrets are on their way.",
  );
  expect(dialogMessage).toContain("duplicate");
  expect(sends).toHaveLength(5);
  expect(sends[1]).toBe(sends[0]);
});

test("storage failure is explicit, preserves existing saved data, and still permits session edits", async ({
  page,
}) => {
  await setup(page, { storageUnavailable: true });
  await expect(page.locator("#notice")).toContainText("could not save");
  await page.getByLabel("Subject", { exact: true }).fill("Session edit");
  await expect(page.locator("#preview-subject")).toHaveText("Session edit");
  expect((await saved(page)).families[0].subject).toBe("A gift for {family}");
  await expect(page.locator("#save-state")).toContainText("Session only");
});

test("impossible restrictions report a useful error and do not send emails", async ({
  page,
}) => {
  const seed = fixture();
  seed.families[0].blocks = [
    ["p0", "p1"],
    ["p0", "p2"],
    ["p0", "p3"],
  ];
  let sends = 0;
  await setup(page, {
    seed,
    send: (route) => {
      sends++;
      return route.fulfill({ json: {} });
    },
  });
  await page.getByRole("button", { name: "Try a dry-run" }).click();
  await expect(page.locator("#notice")).toContainText("No valid circle");
  expect(sends).toBe(0);
  await expect(
    page.getByRole("button", { name: "Try a dry-run" }),
  ).toBeEnabled();
});

test("mobile and desktop layouts fit without horizontal overflow", async ({
  page,
}) => {
  await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator("h1")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/secret-santa-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1080 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/secret-santa-desktop.png",
    fullPage: true,
  });
});
