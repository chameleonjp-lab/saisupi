// Install before navigation/fixtures. Only this test's local origin may hit the network.
export async function isolateBrowserNetwork(context, origin) {
  await context.routeWebSocket('**/*', socket => socket.close());
  await context.route('**/*', async route => {
    if (new URL(route.request().url()).origin !== origin || !['GET','HEAD'].includes(route.request().method())) {
      await route.abort();
      return;
    }
    const response = await route.fetch({maxRedirects:0});
    if (response.status() >= 300 && response.status() < 400) {
      await route.abort();
      throw new Error('Unexpected local redirect blocked');
    }
    await route.fulfill({response});
  });
}
