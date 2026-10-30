/** Boundary: work-account and action HTTP registration belongs solely to this platform. */
export function registerWorkspaceRoutes(router, workspace) {
  router.get('/workspace', () => workspace.getState());
  router.post('/workspace/select', async ({ readJson }) => workspace.select(await readJson()));
  router.post('/workspace/contacts', () => workspace.readContacts());
  router.post('/workspace/target', async ({ readJson }) => workspace.bindTarget(await readJson()));
  router.post('/send/text', async ({ readJson }) => workspace.sendText(await readJson()));
  router.post('/send/image', async ({ readJson }) => workspace.sendImage(await readJson({ maxBytes: 18 * 1024 * 1024 })));
  router.get('/emoticons', ({ url }) => workspace.listEmoticons(url.searchParams.get('query') || ''));
  router.post('/send/emoticon', async ({ readJson }) => workspace.sendEmoticon(await readJson()));
}
