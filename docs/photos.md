# Photos

Every dish photo is saved in three sizes when it is uploaded (`src/services/photo_variants.ts`), all WebP:

| Size | Width | About | Used by |
|---|---|---|---|
| `photoSizes.sm` | 160px | 5–15 KB | list rows and thumbnails |
| `photoSizes.md` | 480px | 20–50 KB | the guest menu, cards |
| `photo` | 1200px | 60–150 KB | a photo opened large (older apps read only this) |

`photoSizes` also has the photo's `width` and `height` (pages keep its space before it loads) and `blur`, a tiny
blurred preview as a data URL of a few hundred bytes. Pages pick the size with `srcset` (`site/components/photo.tsx`,
the web app's `components/photo.tsx`). Every new photo gets a new file name, so a cached photo is never stale.

Photos saved before sizes existed get them when the server starts (`src/workers/photo_sizes.ts`); their old file is
kept.

## Serve photos from your own domain (do this once)

The bucket's `r2.dev` address is meant for testing: Cloudflare limits how fast it serves and does not cache it near
guests. Serve the bucket from a subdomain instead:

1. Cloudflare dashboard → **R2** → your bucket → **Settings** → **Custom Domains** → **Connect Domain** →
   `img.restora.live` → **Connect**. (restora.live must be on Cloudflare. If its DNS is still at Hostinger, add the
   site to Cloudflare first and change the nameservers at Hostinger.)
2. Cloudflare dashboard → restora.live → **Caching** → **Cache Rules** → **Create rule**: name it "Photos", when
   *Hostname equals* `img.restora.live`, then **Eligible for cache**, **Edge TTL**: ignore cache-control header,
   1 year; **Browser TTL**: override, 1 year. Deploy.
3. On the server, set `R2_PUBLIC_URL=https://img.restora.live` in the API's `.env` and restart it.
4. Optional: in the bucket's settings, turn off **Public Development URL** (r2.dev) once photos load from the new domain.

Photos saved earlier keep their `r2.dev` address in the database. To move them too, run once on the server:

```sh
OLD=https://pub-XXXX.r2.dev NEW=https://img.restora.live
mongosh "$MONGODB_URI" --eval "
  const swap = (field) => ({ \$replaceOne: { input: '\$' + field, find: '$OLD', replacement: '$NEW' } });
  db.menuitems.updateMany({ photo: /r2\.dev/ }, [{ \$set: { photo: swap('photo') } }]);
  db.menuitems.updateMany({ 'photoSizes.sm': /r2\.dev/ }, [{ \$set: { 'photoSizes.sm': swap('photoSizes.sm'), 'photoSizes.md': swap('photoSizes.md') } }]);
"
```

(replace `pub-XXXX.r2.dev` with your bucket's address from `R2_PUBLIC_URL`).
