import { getAssetFromKV } from '@cloudflare/kv-asset-handler';

export default {
  async fetch(request, env, ctx) {
    try {
      return await getAssetFromKV(request, {
        ASSET_NAMESPACE: env.__STATIC_CONTENT,
        ASSET_MANIFEST: __ASSET_MANIFEST,
      });
    } catch (e) {
      // If the path doesn't match an asset, try to serve index.html (useful for SPAs)
      try {
        let notFoundResponse = await getAssetFromKV(request, {
          mapRequestToAsset: (req) => new Request(`${new URL(req.url).origin}/index.html`, req),
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
          ASSET_MANIFEST: __ASSET_MANIFEST,
        });

        return new Response(notFoundResponse.body, notFoundResponse);

      } catch (e) {
        return new Response('File not found', { status: 404 });
      }
    }
  },
};
