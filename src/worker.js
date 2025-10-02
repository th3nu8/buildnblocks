// src/worker.js
import { getAssetFromKV } from '@cloudflare/kv-asset-handler';

export default {
  async fetch(request, env, ctx) {
    try {
      // 1. Try to serve the exact file requested (e.g., /style.css)
      return await getAssetFromKV(request, {
        ASSET_NAMESPACE: env.__STATIC_CONTENT,
        ASSET_MANIFEST: __ASSET_MANIFEST,
      });
    } catch (e) {
      // 2. If the file is not found (404), serve index.html as a fallback
      try {
        const url = new URL(request.url);
        // Map the request back to index.html within the public bucket
        let assetRequest = new Request(url.origin + '/index.html', {
          headers: request.headers,
        });

        // Fetch index.html and return it
        let response = await getAssetFromKV(assetRequest, {
          ASSET_NAMESPACE: env.__STATIC_CONTENT,
          ASSET_MANIFEST: __ASSET_MANIFEST,
        });

        // Set the status to 200 (OK) but keep the original content
        return new Response(response.body, {
          ...response,
          status: 200,
        });

      } catch (e) {
        // If index.html itself can't be found, return a generic 404
        return new Response('File not found', { status: 404 });
      }
    }
  },
};
